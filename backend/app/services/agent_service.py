"""Module 2 — Prompt Intelligence.

Turns the user's short raw description into a detailed, optimized prompt for
the ChatGPT image generator: composition, lighting, background, commercial nail
photography style. Claude never generates images itself (see CLAUDE.md #3).
"""

import json
from math import gcd

from app.config import Settings, get_settings
from app.services import usage_service
from app.services.anthropic_utils import extract_text

_NAMED_ASPECT_RATIOS = {
    "1:1": "square feed post",
    "4:5": "portrait, ideal for an Instagram/Facebook feed post",
    "9:16": "vertical, ideal for Instagram/Facebook Stories and Reels",
    "16:9": "landscape/widescreen",
}


def _size_hint(width: int | None, height: int | None) -> str:
    """Describes the target output size/aspect ratio for the prompt, so ChatGPT
    frames the shot to match rather than leaving it to a later center-crop."""
    if not width or not height:
        return ""

    divisor = gcd(width, height)
    ratio = f"{width // divisor}:{height // divisor}"
    descriptor = _NAMED_ASPECT_RATIOS.get(ratio)
    ratio_text = f"{ratio} aspect ratio{', ' + descriptor if descriptor else ''}"
    return f" Compose and frame the shot for a {width}x{height}px output ({ratio_text})."


_SYSTEM_PROMPT = (
    "You are a commercial nail-photography prompt engineer for a nail salon "
    "marketing platform. Given a short campaign description, a hand pose "
    "reference image, and a nail design reference image, write ONE detailed "
    "image generation prompt for an AI image editor that will receive both "
    "reference images as Image 1 (hand pose) and Image 2 (nail design). "
    "The prompt must be specific and unambiguous, not a vague 'combine these "
    "images' instruction. It must explicitly state, in these terms: preserve "
    "the exact hand/finger anatomy, finger positions, camera angle, skin "
    "tone, lighting, and background from Image 1 unchanged; take ONLY the "
    "nail polish color/pattern/finish from Image 2 and apply it to the nails "
    "on the hand from Image 1, without copying Image 2's background, hand, "
    "or composition; the result must be a new merged photo, never an "
    "unedited copy of either reference image. It must also specify natural/"
    "soft studio lighting, a minimalist commercial background, and high-end "
    "advertising photography style, and explicitly instruct that the image "
    "contain NO text, letters, numbers, captions, watermarks, or logos "
    "anywhere in the frame. Output ONLY the prompt text, no preamble."
)


def _mock_prompt(
    description: str,
    design_filename: str,
    pose_filename: str,
    variation: int,
    width: int | None = None,
    height: int | None = None,
) -> str:
    base = description.strip() or "elegant nail design"
    return (
        f"Commercial nail photography of '{base}', apply the nail design from "
        f"{design_filename} onto the hand in {pose_filename} while preserving exact "
        f"finger anatomy and pose. Soft natural studio lighting, minimalist neutral "
        f"background, shallow depth of field, high-end advertising style, ultra "
        f"realistic, 4k product photography. (variation {variation})"
        f"{_size_hint(width, height)}"
    )


_EDIT_SYSTEM_PROMPT = (
    "You are a photo-editing prompt engineer for a nail salon marketing platform. "
    "Given a user's short edit instruction and the filename of a reference photo, "
    "rewrite it into ONE detailed instruction for an AI image editor. Preserve "
    "everything in the original photo not mentioned by the user (subject, pose, "
    "background, framing) and apply only the requested change, in clear, "
    "unambiguous, specific language suitable for a commercial photo-editing model. "
    "Unless the user's instruction is specifically about adding text, the rewritten "
    "instruction must explicitly forbid adding any text, captions, watermarks, or "
    "logos to the image. Output ONLY the instruction text, no preamble."
)


def _mock_edit_prompt(user_prompt: str, filename: str, width: int | None = None, height: int | None = None) -> str:
    base = user_prompt.strip() or "improve overall photo quality"
    return (
        f"Edit the photo '{filename}': {base}. Preserve all other details of the "
        f"original image exactly (subject, pose, background, framing) unless stated "
        f"otherwise. Keep the result photorealistic and consistent with commercial "
        f"nail-salon marketing photography.{_size_hint(width, height)}"
    )


_POST_CONTENT_SYSTEM_PROMPT = (
    "You are a social media copywriter for a nail salon marketing platform. "
    "Given a short description of a generated nail photo and the target "
    "platform, write one engaging caption (2-4 sentences, warm and inviting, "
    "no emojis spam, a light call to action) and a list of 8-15 relevant "
    "hashtags (mix of broad and niche, no spaces, no duplicate #). If a list "
    "of recently-used captions for this same campaign is provided, write "
    "something clearly different in wording and structure from every one of "
    "them — never reuse a previous caption verbatim. Respond "
    "with ONLY a JSON object of the form "
    '{"caption": "...", "hashtags": ["#tag1", "#tag2"]}, no preamble, no markdown fences.'
)

_MOCK_CAPTION_TEMPLATES = [
    "Fresh from the salon chair: {base}. Book your next appointment and let us bring this look to your nails too!",
    "New in the chair today: {base}. Slide into our booking link if you want this look next!",
    "Spotlight on {base} — straight from our salon to your feed. Ready to book yours?",
    "Today's inspiration: {base}. Come see us and make it your own signature look!",
]


def _mock_post_content(image_context: str, platform: str, recent_captions: list[str] | None = None) -> dict:
    base = image_context.strip() or "a fresh nail design"
    template = _MOCK_CAPTION_TEMPLATES[len(recent_captions or []) % len(_MOCK_CAPTION_TEMPLATES)]
    return {
        "caption": template.format(base=base),
        "hashtags": [
            "#nailsalon",
            "#nailart",
            "#naildesign",
            "#manicure",
            "#nailsofinstagram",
            "#nailinspo",
            "#glamnails",
            f"#{platform.lower()}nails" if platform else "#nails",
        ],
    }


def _is_duplicate_caption(caption: str, recent_captions: list[str]) -> bool:
    normalized = " ".join(caption.split()).strip().lower()
    return any(normalized == " ".join(c.split()).strip().lower() for c in recent_captions)


class AgentService:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self._client = None
        if self.settings.has_anthropic_key:
            import anthropic

            self._client = anthropic.Anthropic(api_key=self.settings.anthropic_api_key)

    @property
    def is_mock(self) -> bool:
        return self._client is None

    def build_prompt(
        self,
        description: str,
        design_filename: str,
        pose_filename: str,
        variation: int = 1,
        width: int | None = None,
        height: int | None = None,
    ) -> str:
        if self.is_mock:
            return _mock_prompt(description, design_filename, pose_filename, variation, width, height)

        user_message = (
            f"Campaign description: {description}\n"
            f"Design reference file: {design_filename}\n"
            f"Pose reference file: {pose_filename}\n"
            f"Variation number: {variation} (make this variation distinct in framing "
            f"or lighting mood from other variations of the same pair)"
            f"{_size_hint(width, height)}"
        )
        response = self._client.messages.create(
            model=self.settings.anthropic_model,
            # _SYSTEM_PROMPT now spells out the full Image-1/Image-2 preserve
            # vs. replace contract explicitly, which is a longer ask than the
            # old version — bumped from 400 to leave headroom so this doesn't
            # hit the same stop_reason=max_tokens truncation seen on
            # score_image after its rubric grew similarly.
            max_tokens=700,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        usage_service.record_anthropic_usage("build_prompt", self.settings.anthropic_model, response, self.settings)
        return extract_text(response)

    def refine_edit_prompt(
        self, user_prompt: str, filename: str, width: int | None = None, height: int | None = None
    ) -> str:
        if self.is_mock:
            return _mock_edit_prompt(user_prompt, filename, width, height)

        user_message = (
            f"Reference photo filename: {filename}\n"
            f"User's edit instruction: {user_prompt}"
            f"{_size_hint(width, height)}"
        )
        response = self._client.messages.create(
            model=self.settings.anthropic_model,
            max_tokens=300,
            system=_EDIT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        usage_service.record_anthropic_usage(
            "refine_edit_prompt", self.settings.anthropic_model, response, self.settings
        )
        return extract_text(response)

    def generate_post_content(
        self,
        image_context: str,
        salon_context: str,
        platform: str,
        recent_captions: list[str] | None = None,
    ) -> dict:
        """Generates a caption + hashtag list for an auto-scheduled social
        post. Returns {"caption": str, "hashtags": list[str]}. Called by
        scheduler_service ahead of a ScheduledPost's suggested_date; the
        result always goes to pending_review, never posted directly.

        recent_captions (other posts in the same campaign) are passed to
        Claude as "avoid repeating this" context. If the result is still an
        exact duplicate of one of them, regenerate once with a stronger
        instruction — no further retries, to avoid any risk of a loop."""
        if self.is_mock:
            return _mock_post_content(image_context, platform, recent_captions)

        content = self._generate_post_content_once(image_context, salon_context, platform, recent_captions)
        if recent_captions and _is_duplicate_caption(content["caption"], recent_captions):
            content = self._generate_post_content_once(
                image_context, salon_context, platform, recent_captions, retry=True
            )
        return content

    def _generate_post_content_once(
        self,
        image_context: str,
        salon_context: str,
        platform: str,
        recent_captions: list[str] | None,
        retry: bool = False,
    ) -> dict:
        user_message = (
            f"Photo description: {image_context}\n"
            f"Salon context: {salon_context or 'a nail salon'}\n"
            f"Target platform: {platform}"
        )
        if recent_captions:
            joined = "\n".join(f"- {c}" for c in recent_captions)
            user_message += f"\n\nRecently used captions for this campaign (do not repeat):\n{joined}"
        if retry:
            user_message += "\n\nYour previous attempt exactly duplicated a recent caption. Rewrite it completely differently."

        response = self._client.messages.create(
            model=self.settings.anthropic_model,
            max_tokens=400,
            system=_POST_CONTENT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        usage_service.record_anthropic_usage(
            "generate_post_content", self.settings.anthropic_model, response, self.settings
        )
        text = extract_text(response)
        try:
            data = json.loads(text)
            return {"caption": data["caption"], "hashtags": list(data["hashtags"])}
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            raise RuntimeError(f"Claude did not return valid post-content JSON: {text!r}") from exc
