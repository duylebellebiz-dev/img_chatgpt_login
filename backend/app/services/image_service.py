"""Generate and edit images through Gemini OAuth using Antigravity CLI."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.config import Settings, get_settings
from app.services import usage_service
from app.services.agy_service import generate_via_agy
from app.services.media_utils import detect_image_mime_type, extension_for_mime_type, fit_to_size

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
        provider = self.settings.image_provider.strip().lower()
        if provider not in {"agy", "mock"}:
            raise ValueError("IMAGE_PROVIDER must be 'agy' or 'mock'")

    @property
    def is_mock(self) -> bool:
        return self.settings.uses_mock_images

    def _request_image(self, prompt: str, references: list[Path], operation: str) -> bytes:
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
    ) -> tuple[Path, str]:
        if self.is_mock:
            return _mock_generate(design_path, pose_path, prompt, variation, attempt, out_path, width, height)
        full_prompt = prompt + _COMPOSITING_CONTRACT + _QUALITY_SUFFIX + _NO_TEXT_SUFFIX
        image_bytes = self._request_image(full_prompt, [pose_path, design_path], "generate_image")
        return _save_image_bytes(image_bytes, out_path, width, height)

    def edit_image(
        self,
        image_path: Path,
        prompt: str,
        out_path: Path,
        attempt: int = 1,
        width: int | None = None,
        height: int | None = None,
    ) -> tuple[Path, str]:
        if self.is_mock:
            return _mock_edit(image_path, prompt, attempt, out_path, width, height)
        full_prompt = prompt + _QUALITY_SUFFIX + _NO_TEXT_SUFFIX
        image_bytes = self._request_image(full_prompt, [image_path], "edit_image")
        return _save_image_bytes(image_bytes, out_path, width, height)
