"""Generate and edit images through Gemini OAuth using Antigravity CLI."""

from collections.abc import Callable
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.config import Settings, get_settings
from app.services import usage_service
from app.services.agy_service import generate_via_agy
from app.services.gemini_api_service import generate_via_gemini_api
from app.services.gemini_batch_api_service import generate_via_gemini_batch_api, recover_via_gemini_batch_api
from app.services.gpt_service import generate_via_gpt_oauth
from app.services.media_utils import detect_image_mime_type, extension_for_mime_type, fit_to_size

_VALID_PROVIDERS = {"agy", "gpt", "gemini_api", "gemini_batch_api", "mock"}


def resolve_provider(provider: str | None, settings: Settings) -> str:
    """Picks the effective provider for one generate/edit call: an explicit
    per-request `provider` wins, otherwise falls back to the deployment's
    `image_provider` default. Raises on an unknown value, so a bad choice
    fails at the API boundary (router) rather than deep inside a background
    job."""
    value = (provider or settings.image_provider).strip().lower()
    if value not in _VALID_PROVIDERS:
        raise ValueError(f"Unsupported image provider: {value}")
    return value

_NO_TEXT_SUFFIX = (
    " Do not render any text, letters, numbers, words, captions, watermarks, "
    "logos, or writing of any kind anywhere in the image."
)

_QUALITY_SUFFIX = (
    " Render at the highest possible sharpness with crisp fine detail, "
    "professional macro-photography clarity, and no blur or compression artifacts."
)

_COMPOSITING_CONTRACT = (
    " You are given exactly two reference images in this order: "
    "Image 1 = HAND POSE reference; Image 2 = NAIL DESIGN reference. "
    "Create one new image that preserves the exact hand anatomy, pose, camera angle, "
    "skin tone, lighting, framing, and background from Image 1. Apply the exact nail "
    "design from Image 2 to every visible nail, including colors, gradients, patterns, "
    "embellishments, placement, and finish. Do not copy Image 2's hand or background. "
    "The output must visibly combine both references and must not echo either input unchanged."
)

def _mock_generate(
    design_path: Path,
    pose_path: Path,
    prompt: str,
    variation: int,
    attempt: int,
    out_path: Path,
    width: int | None = None,
    height: int | None = None,
) -> tuple[Path, str]:
    canvas = Image.new("RGB", (800, 500), color=(245, 240, 235))
    thumb_size = (360, 360)
    for src_path, x in ((design_path, 20), (pose_path, 420)):
        try:
            with Image.open(src_path) as img:
                img = img.convert("RGB")
                img.thumbnail(thumb_size)
                canvas.paste(img, (x, 20))
        except Exception:
            canvas.paste(Image.new("RGB", thumb_size, color=(200, 200, 200)), (x, 20))
    _draw_mock_label(canvas, f"[MOCK GEMINI OUTPUT] variation {variation} attempt {attempt}\n{prompt[:180]}")
    return _save_mock(canvas, out_path, width, height)


def _mock_edit(
    image_path: Path,
    prompt: str,
    attempt: int,
    out_path: Path,
    width: int | None = None,
    height: int | None = None,
) -> tuple[Path, str]:
    canvas = Image.new("RGB", (800, 500), color=(245, 240, 235))
    try:
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            img.thumbnail((760, 370))
            canvas.paste(img, (20, 15))
    except Exception:
        canvas.paste(Image.new("RGB", (760, 370), color=(200, 200, 200)), (20, 15))
    _draw_mock_label(canvas, f"[MOCK GEMINI EDIT] attempt {attempt}\n{prompt[:180]}")
    return _save_mock(canvas, out_path, width, height)


def _draw_mock_label(canvas: Image.Image, label: str) -> None:
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    draw.multiline_text((20, 400), label, fill=(30, 30, 30), font=font)


def _save_mock(canvas: Image.Image, out_path: Path, width: int | None, height: int | None) -> tuple[Path, str]:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, format="PNG")
    if width and height:
        fit_to_size(out_path, width, height)
    return out_path, "image/png"


def _save_image_bytes(
    image_bytes: bytes,
    out_path: Path,
    width: int | None = None,
    height: int | None = None,
) -> tuple[Path, str]:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(image_bytes)
    try:
        mime_type = detect_image_mime_type(out_path)
    except Exception as exc:
        out_path.unlink(missing_ok=True)
        raise RuntimeError("Gemini OAuth response contained invalid image data") from exc
    final_path = out_path.with_suffix(extension_for_mime_type(mime_type))
    if final_path != out_path:
        out_path.replace(final_path)
    if width and height:
        fit_to_size(final_path, width, height)
    return final_path, mime_type


class ImageService:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        # Validates the deployment default only; a per-call `provider`
        # argument (see resolve_provider) can still pick a different one.
        resolve_provider(None, self.settings)

    def _request_image(
        self,
        prompt: str,
        references: list[Path],
        operation: str,
        provider: str,
        on_job_submitted: Callable[[str], None] | None = None,
    ) -> bytes:
        if provider == "gpt":
            image_bytes = generate_via_gpt_oauth(prompt, references, self.settings)
            usage_service.record_gpt_oauth_usage(operation, self.settings.gpt_oauth_model, image_count=1)
        elif provider == "gemini_api":
            image_bytes = generate_via_gemini_api(prompt, references, self.settings)
            usage_service.record_gemini_api_usage(
                operation, self.settings.gemini_api_model, self.settings, image_count=1
            )
        elif provider == "gemini_batch_api":
            image_bytes = generate_via_gemini_batch_api(
                prompt, references, self.settings, on_job_submitted=on_job_submitted
            )
            usage_service.record_gemini_batch_api_usage(
                operation, self.settings.gemini_api_model, self.settings, image_count=1
            )
        else:
            image_bytes = generate_via_agy(prompt, references, self.settings)
            usage_service.record_gemini_oauth_usage(operation, self.settings.agy_image_model, image_count=1)
        return image_bytes

    def generate_image(
        self,
        design_path: Path,
        pose_path: Path,
        prompt: str,
        variation: int,
        out_path: Path,
        attempt: int = 1,
        width: int | None = None,
        height: int | None = None,
        provider: str | None = None,
        on_job_submitted: Callable[[str], None] | None = None,
    ) -> tuple[Path, str]:
        effective_provider = resolve_provider(provider, self.settings)
        if effective_provider == "mock":
            return _mock_generate(design_path, pose_path, prompt, variation, attempt, out_path, width, height)
        full_prompt = prompt + _COMPOSITING_CONTRACT + _QUALITY_SUFFIX + _NO_TEXT_SUFFIX
        image_bytes = self._request_image(
            full_prompt, [pose_path, design_path], "generate_image", effective_provider, on_job_submitted=on_job_submitted
        )
        return _save_image_bytes(image_bytes, out_path, width, height)

    def recover_gemini_batch_image(
        self,
        job_ref: str,
        out_path: Path,
        width: int | None = None,
        height: int | None = None,
    ) -> tuple[Path, str]:
        """Reconnects to a "gemini_batch_api" job submitted by an earlier,
        now-dead process (see the on_job_submitted callback in generate_image
        above) instead of starting a fresh, separately-billed generation.
        No usage record here — the original submission already recorded the
        billed image_count; this call doesn't create a new charge."""
        image_bytes = recover_via_gemini_batch_api(job_ref, self.settings)
        return _save_image_bytes(image_bytes, out_path, width, height)

    def edit_image(
        self,
        image_path: Path,
        prompt: str,
        out_path: Path,
        attempt: int = 1,
        width: int | None = None,
        height: int | None = None,
        provider: str | None = None,
    ) -> tuple[Path, str]:
        effective_provider = resolve_provider(provider, self.settings)
        if effective_provider == "mock":
            return _mock_edit(image_path, prompt, attempt, out_path, width, height)
        full_prompt = prompt + _QUALITY_SUFFIX + _NO_TEXT_SUFFIX
        image_bytes = self._request_image(full_prompt, [image_path], "edit_image", effective_provider)
        return _save_image_bytes(image_bytes, out_path, width, height)
