"""Module 3 — Image Quality Agent.

Scores a freshly generated image against commercial-quality criteria and,
on failure, drives the image provider to regenerate it. Two independent, separately
capped retry budgets (to avoid infinite loops / runaway API cost):
`quality_max_retries` for an ordinary low score, and the smaller
`near_duplicate_max_retries` for the specific provider compositing-failure
mode caught by is_near_duplicate_image (see generate_with_quality_gate) —
the latter retries even when quality_max_retries is 0, since it's a known,
usually-correctable bug rather than a "just needs a human to look at it"
low score. Both budgets can be overridden per provider (see
_resolve_retry_budgets and the gpt_*/gemini_api_* settings in config.py).
This service owns the generate->score->retry loop; it never generates
images itself (that's ImageService's job).
"""

import hashlib
import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from app.config import Settings, get_settings
from app.services import usage_service
from app.services.anthropic_utils import extract_text
from app.services.image_service import ImageService, resolve_provider
from app.services.media_utils import is_near_duplicate_image, prepare_image_for_api

logger = logging.getLogger(__name__)

_CRITERIA = ["anatomy", "pose_fidelity", "nail_accuracy", "lighting", "background", "realism", "marketing_quality"]

# The two criteria that measure reference fidelity specifically (as opposed
# to general photo quality) — see quality_fidelity_floor in config.py for why
# these need their own floor independent of the overall average.
_FIDELITY_CRITERIA = ["pose_fidelity", "nail_accuracy"]

# Sent alongside the two reference images (see score_image). Explicitly asks
# the judge to compare the candidate against both references, rather than
# scoring it in isolation — a single-image judge has no ground truth to
# notice that the candidate is actually an unedited copy of one of the
# inputs (e.g. a design reference that already shows a manicured hand can
# score well on every criterion on its own merits, even though it's the
# wrong hand/pose entirely). This was the actual bug behind a compositing
# failure slipping through with a normal-looking score and no review flag.
_VISION_RUBRIC = (
    "You are a strict quality-control judge for commercial nail-salon marketing "
    "photos. You are given THREE images: the CANDIDATE (the freshly generated "
    "photo to score), REFERENCE 1 (the hand pose the candidate was supposed to "
    "preserve), and REFERENCE 2 (the nail design the candidate was supposed to "
    "apply). Score the CANDIDATE from 0-100 on each of: "
    "anatomy (hand/finger correctness — no distorted, missing, or extra fingers); "
    "pose_fidelity (the CANDIDATE's hand identity, finger positions, camera "
    "angle, and framing must match REFERENCE 1 — not merely look like some "
    "plausible hand); "
    "nail_accuracy (the CANDIDATE's nail polish color/pattern/finish must match "
    "REFERENCE 2, applied onto the hand from REFERENCE 1 — not merely look like "
    "a good manicure on its own); lighting; background; realism; "
    "marketing_quality (looks like paid advertising photography). "
    "CRITICAL COMPOSITING CHECK: if the CANDIDATE is essentially an unedited "
    "copy of REFERENCE 1 (nail design not actually changed to match REFERENCE 2) "
    "or of REFERENCE 2 (wrong hand/pose — not the one from REFERENCE 1), that is "
    "a hard compositing failure: score anatomy, pose_fidelity, AND nail_accuracy "
    "no higher than 10, regardless of how good the photo looks on its own. THIS "
    "STILL APPLIES if only the background, lighting, or framing was redone while "
    "the hand, fingers, pose, and nail design themselves were left essentially "
    "unchanged from REFERENCE 1 or REFERENCE 2 — a new background alone is not a "
    "real edit and must not be scored as one. "
    "If the image contains ANY visible text, letters, numbers, captions, "
    "watermarks, or logos anywhere in the frame, that is also a hard defect: "
    "score both realism and marketing_quality no higher than 20, regardless of "
    "how good the rest of the image looks. "
    "Respond with ONLY a JSON object like "
    '{"anatomy": 90, "pose_fidelity": 88, "nail_accuracy": 85, "lighting": 88, '
    '"background": 80, "realism": 92, "marketing_quality": 87}, no other text.'
)

_CRITERION_FEEDBACK = {
    "anatomy": "the hand and finger anatomy must be accurate — no distorted, missing, or extra fingers",
    "pose_fidelity": "the output must keep the exact hand identity, finger positions, camera angle, and framing "
    "from the hand pose reference image — it must not drift toward a different hand or pose",
    "nail_accuracy": "the nail design must match the reference design image precisely in color, pattern, and shape, "
    "applied onto the hand from the pose reference — not a copy of the design reference's own hand/background",
    "lighting": "use brighter, more even, soft studio lighting with minimal harsh shadows",
    "background": "use a cleaner, more minimal, uncluttered commercial background",
    "realism": "increase photorealism — avoid artificial, plastic-looking skin or nail textures, and remove any "
    "text, captions, or watermarks from the image",
    "marketing_quality": "elevate the composition and styling to match premium advertising photography, with no "
    "text, captions, watermarks, or logos anywhere in the frame",
}


def _build_near_duplicate_feedback(which: str) -> str:
    """which is "pose" or "design" — whichever reference the output was
    almost identical to."""
    return (
        f" CRITICAL: your previous attempt returned the {which} reference "
        "image almost unchanged instead of merging both references — you "
        "must keep the exact hand/pose/background from Image 1 (hand pose "
        "reference) and apply the nail design/color/pattern from Image 2 "
        "(nail design reference) onto those nails. The output must differ "
        "visibly from both input reference photos."
    )


def _build_retry_feedback(breakdown: dict, threshold: float) -> str:
    """Turns the previous attempt's weak criteria into concrete regeneration
    guidance, so a retry fixes what actually failed instead of re-rolling the
    same prompt and hoping the provider's stochasticity does better (each retry is
    a full generation, so wasted retries are the single biggest
    cost driver in this pipeline).
    """
    weak = [c for c in _CRITERIA if breakdown.get(c, 100) < threshold]
    if not weak:
        return ""
    notes = "; ".join(_CRITERION_FEEDBACK[c] for c in weak)
    return f" The previous attempt fell short — on this attempt, specifically fix: {notes}."


@dataclass
class QualityResult:
    attempt: int
    passed: bool
    overall: float
    image_path: Path
    breakdown: dict = field(default_factory=dict)
    prompt_used: str = ""


class QualityGateCancelled(RuntimeError):
    def __init__(self, result: QualityResult | None = None):
        super().__init__("Image generation was cancelled by the user.")
        self.result = result


def _mock_score(image_path: Path) -> tuple[float, dict]:
    digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
    breakdown = {}
    for i, name in enumerate(_CRITERIA):
        chunk = digest[i * 4 : i * 4 + 4]
        breakdown[name] = int(chunk, 16) % 36 + 65  # deterministic 65-100
    overall = round(sum(breakdown.values()) / len(breakdown), 1)
    return overall, breakdown


class QualityService:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self._client = None
        if self.settings.has_anthropic_key:
            import anthropic

            self._client = anthropic.Anthropic(api_key=self.settings.anthropic_api_key)

    @property
    def is_mock(self) -> bool:
        return self._client is None

    def _resolve_retry_budgets(self, provider: str | None) -> tuple[int, int]:
        """Per-provider override for (quality_max_retries,
        near_duplicate_max_retries) — see the gpt_*/gemini_api_* settings in
        config.py. Falls back to the generic pair for every other provider
        (agy, gemini_batch_api, mock)."""
        effective_provider = resolve_provider(provider, self.settings)
        if effective_provider == "gpt":
            return self.settings.gpt_quality_max_retries, self.settings.gpt_near_duplicate_max_retries
        if effective_provider == "gemini_api":
            return self.settings.gemini_api_quality_max_retries, self.settings.gemini_api_near_duplicate_max_retries
        return self.settings.quality_max_retries, self.settings.near_duplicate_max_retries

    def score_image(
        self, image_path: Path, design_path: Path | None = None, pose_path: Path | None = None
    ) -> tuple[float, dict]:
        """Scores image_path (the freshly generated candidate). When
        design_path/pose_path are given, they're sent alongside as REFERENCE
        1 (pose) and REFERENCE 2 (design) so the judge can compare the
        candidate against actual ground truth instead of scoring it in a
        vacuum — see _VISION_RUBRIC for why that comparison matters."""
        if self.is_mock:
            return _mock_score(image_path)

        import base64

        def _image_block(path: Path) -> dict:
            raw_bytes, mime_type = prepare_image_for_api(path)
            data = base64.standard_b64encode(raw_bytes).decode()
            return {
                "type": "image",
                "source": {"type": "base64", "media_type": mime_type, "data": data},
            }

        content = [{"type": "text", "text": "CANDIDATE (score this one):"}, _image_block(image_path)]
        if pose_path is not None:
            content += [{"type": "text", "text": "REFERENCE 1 (hand pose to preserve):"}, _image_block(pose_path)]
        if design_path is not None:
            content += [{"type": "text", "text": "REFERENCE 2 (nail design to apply):"}, _image_block(design_path)]
        content.append({"type": "text", "text": _VISION_RUBRIC})

        response = self._client.messages.create(
            model=self.settings.anthropic_model,
            # 3 images + the compositing-comparison rubric give the judge a
            # meaningfully harder reasoning task than the old single-image,
            # 6-key version — 300 was already tight for that and started
            # truncating responses entirely (stop_reason=max_tokens with no
            # text block at all) once the rubric grew. The actual JSON output
            # is small either way; this is headroom, not expected spend.
            max_tokens=1024,
            messages=[{"role": "user", "content": content}],
        )
        usage_service.record_anthropic_usage("score_image", self.settings.anthropic_model, response, self.settings)
        text = extract_text(response)
        match = re.search(r"\{.*\}", text, re.DOTALL)
        breakdown = json.loads(match.group(0)) if match else {}
        breakdown = {k: float(breakdown.get(k, 0)) for k in _CRITERIA}
        overall = round(sum(breakdown.values()) / len(breakdown), 1) if breakdown else 0.0
        return overall, breakdown

    def generate_with_quality_gate(
        self,
        image_service: ImageService,
        design_path: Path,
        pose_path: Path,
        prompt: str,
        out_path: Path,
        variation: int = 1,
        should_continue: Callable[[], bool] | None = None,
        width: int | None = None,
        height: int | None = None,
        provider: str | None = None,
        resume_job_ref: str | None = None,
        on_job_submitted: Callable[[str], None] | None = None,
    ) -> QualityResult:
        """resume_job_ref, if given, is a previously-submitted "gemini_batch_api"
        job to reconnect to on the very first attempt (see
        ImageService.recover_gemini_batch_image) instead of starting a fresh,
        separately-billed generation — used when resuming a batch job that
        was interrupted mid-poll by a backend restart (see
        batch_tasks.process_batch_job). If recovery fails (job expired,
        Google-side failure, etc.) this falls back to a normal fresh
        generation for that attempt rather than failing the whole image.
        on_job_submitted is forwarded to every fresh generate_image call so
        a *new* submission's job ref also gets persisted, in case this
        process dies before this poll finishes too."""
        result: QualityResult | None = None
        keep_running = should_continue or (lambda: True)
        current_prompt = prompt
        quality_retries_left, near_duplicate_retries_left = self._resolve_retry_budgets(provider)

        attempt = 0
        while True:
            attempt += 1
            if not keep_running():
                raise QualityGateCancelled(result)

            if attempt == 1 and resume_job_ref:
                try:
                    generated_path, _ = image_service.recover_gemini_batch_image(
                        resume_job_ref, out_path, width=width, height=height
                    )
                except Exception:
                    logger.warning(
                        "Could not recover in-flight Gemini Batch API job %s for variation %d — "
                        "submitting a fresh generation instead.",
                        resume_job_ref,
                        variation,
                        exc_info=True,
                    )
                    generated_path, _ = image_service.generate_image(
                        design_path,
                        pose_path,
                        current_prompt,
                        variation,
                        out_path,
                        attempt=attempt,
                        width=width,
                        height=height,
                        provider=provider,
                        on_job_submitted=on_job_submitted,
                    )
            else:
                generated_path, _ = image_service.generate_image(
                    design_path,
                    pose_path,
                    current_prompt,
                    variation,
                    out_path,
                    attempt=attempt,
                    width=width,
                    height=height,
                    provider=provider,
                    on_job_submitted=on_job_submitted,
                )
            if not keep_running():
                result = QualityResult(
                    attempt=attempt,
                    passed=False,
                    overall=0.0,
                    image_path=generated_path,
                    breakdown={},
                    prompt_used=current_prompt,
                )
                raise QualityGateCancelled(result)

            # Catches an image-provider compositing failure mode the vision judge below
            # can miss entirely: the model returns one of the two reference
            # photos back almost unchanged instead of merging them (an
            # unedited pose photo can still score well on anatomy/lighting/
            # realism; an unedited design photo can still score well on
            # nail_accuracy, since the judge never compares against the
            # actual inputs). Treat it as an automatic fail and steer the
            # retry instead of spending a judge call scoring a bad image.
            near_duplicate_of = None
            if is_near_duplicate_image(generated_path, pose_path):
                near_duplicate_of = "pose"
            elif is_near_duplicate_image(generated_path, design_path):
                near_duplicate_of = "design"

            if near_duplicate_of is not None:
                result = QualityResult(
                    attempt=attempt,
                    passed=False,
                    overall=0.0,
                    image_path=generated_path,
                    breakdown={},
                    prompt_used=current_prompt,
                )
                if not keep_running():
                    raise QualityGateCancelled(result)
                if near_duplicate_retries_left <= 0:
                    logger.warning(
                        "generate_image attempt %d for variation %d returned an image "
                        "near-identical to the %s reference (design=%s, pose=%s) — "
                        "near_duplicate_max_retries exhausted, keeping this attempt.",
                        attempt,
                        variation,
                        near_duplicate_of,
                        design_path,
                        pose_path,
                    )
                    break
                logger.warning(
                    "generate_image attempt %d for variation %d returned an image "
                    "near-identical to the %s reference (design=%s, pose=%s) — "
                    "treating as a failed attempt and retrying with corrective feedback.",
                    attempt,
                    variation,
                    near_duplicate_of,
                    design_path,
                    pose_path,
                )
                near_duplicate_retries_left -= 1
                current_prompt = prompt + _build_near_duplicate_feedback(near_duplicate_of)
                continue

            overall, breakdown = self.score_image(generated_path, design_path, pose_path)
            failed_fidelity = [
                c for c in _FIDELITY_CRITERIA if breakdown.get(c, 0) < self.settings.quality_fidelity_floor
            ]
            if failed_fidelity:
                logger.warning(
                    "generate_image attempt %d for variation %d scored %s below "
                    "quality_fidelity_floor (%d) despite an overall score of %.1f — "
                    "failing this attempt so a design/pose mismatch can't be diluted "
                    "by high scores on unrelated criteria.",
                    attempt,
                    variation,
                    {c: breakdown.get(c) for c in failed_fidelity},
                    self.settings.quality_fidelity_floor,
                    overall,
                )
            passed = overall >= self.settings.quality_pass_threshold and not failed_fidelity
            result = QualityResult(
                attempt=attempt,
                passed=passed,
                overall=overall,
                image_path=generated_path,
                breakdown=breakdown,
                prompt_used=current_prompt,
            )
            if not keep_running():
                raise QualityGateCancelled(result)
            if passed:
                break

            # A catastrophically low score is the same known compositing-
            # failure bug as near-duplicate, just one the pixel-diff check
            # above didn't catch (see quality_hard_failure_threshold) — draw
            # from the same retry budget rather than the ordinary one, so it
            # still gets a corrective retry even when quality_max_retries=0.
            is_hard_failure = overall < self.settings.quality_hard_failure_threshold
            if is_hard_failure and near_duplicate_retries_left > 0:
                logger.warning(
                    "score_image attempt %d for variation %d scored %.1f — below "
                    "quality_hard_failure_threshold (%d), treating as a compositing "
                    "failure and retrying with corrective feedback.",
                    attempt,
                    variation,
                    overall,
                    self.settings.quality_hard_failure_threshold,
                )
                near_duplicate_retries_left -= 1
                current_prompt = prompt + _build_retry_feedback(breakdown, self.settings.quality_pass_threshold)
                continue

            if quality_retries_left <= 0:
                break
            quality_retries_left -= 1
            current_prompt = prompt + _build_retry_feedback(breakdown, self.settings.quality_pass_threshold)

        assert result is not None
        return result
