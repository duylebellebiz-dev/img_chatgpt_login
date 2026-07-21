import io
from pathlib import Path

from PIL import Image

# Pillow's JPEG default (quality=75, 2x2 chroma subsampling) is too lossy for
# commercial nail photography — it visibly softens skin texture and gem/rhinestone
# detail. Applied to every in-place re-save below; harmless no-ops for PNG output.
_JPEG_SAVE_KWARGS = {"quality": 95, "subsampling": 0}

# Long-edge cap applied only to images we upload to Gemini/Claude (never to
# files served to users). Matches Anthropic's documented internal resize
# threshold — Claude downscales anything larger than this before it ever
# reasons about the image, so sending more than this buys nothing but extra
# tokens/latency. It's also far more detail than either model needs to read a
# nail polish color/pattern or a hand pose from a reference photo, and
# bills input images by resolution tile, so this is a real cost cut, not just
# a Claude no-op.
_API_UPLOAD_MAX_DIMENSION = 1568


def detect_image_mime_type(path: Path) -> str:
    with Image.open(path) as img:
        fmt = (img.format or "").upper()

    format_to_mime = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
        "GIF": "image/gif",
        "BMP": "image/bmp",
    }

    return format_to_mime.get(fmt, "application/octet-stream")


def extension_for_mime_type(mime_type: str) -> str:
    mime_to_extension = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/bmp": ".bmp",
    }
    return mime_to_extension.get(mime_type, ".bin")


def validate_size(width: int | None, height: int | None, min_dim: int = 256, max_dim: int = 4096) -> None:
    """Raises ValueError if width/height are missing a partner or out of range.
    Both None (no size constraint) is valid; both set is valid; one-without-
    the-other is not."""
    if (width is None) != (height is None):
        raise ValueError("image_width and image_height must be provided together")
    if width is None or height is None:
        return
    if not (min_dim <= width <= max_dim) or not (min_dim <= height <= max_dim):
        raise ValueError(f"image_width and image_height must each be between {min_dim} and {max_dim}px")


def apply_watermark(image_path: Path, logo_path: Path, margin_ratio: float = 0.03, logo_width_ratio: float = 0.16) -> None:
    """Composites the salon logo onto the bottom-right corner of image_path,
    in place. Pure image compositing (no AI call) so it's free to apply to
    every generated/edited image. Preserves the logo's alpha channel if it
    has one (typical for a transparent-background PNG logo).
    """
    with Image.open(image_path) as base:
        base = base.convert("RGBA")

        with Image.open(logo_path) as logo:
            logo = logo.convert("RGBA")
            target_width = max(1, round(base.width * logo_width_ratio))
            target_height = max(1, round(logo.height * (target_width / logo.width)))
            logo = logo.resize((target_width, target_height), Image.LANCZOS)

            margin = round(base.width * margin_ratio)
            position = (base.width - target_width - margin, base.height - target_height - margin)
            base.alpha_composite(logo, position)

        base.convert("RGB").save(image_path, **_JPEG_SAVE_KWARGS)


def _mean_abs_pixel_diff(image_path: Path, other_path: Path, size: int = 64) -> float:
    """Mean absolute per-channel pixel difference (0-255) between two images,
    downsampled to a fixed size x size RGB grid so resolution/aspect-ratio
    differences don't block the comparison.

    Deliberately NOT a global perceptual hash (e.g. average-hash): that
    approach normalizes each image against its own mean brightness, so two
    completely different photos that both have a plain/uniform commercial
    background (exactly the style this app's prompts ask for) collapse to
    the same hash and register as "duplicates" — verified empirically to
    produce false positives here. Raw pixel difference has no such
    normalization step, so two distinct photos that merely share a similar
    background style still show a large diff wherever the actual subject
    (the hand/nails) differs.
    """
    from PIL import ImageChops

    with Image.open(image_path) as a, Image.open(other_path) as b:
        a = a.convert("RGB").resize((size, size), Image.LANCZOS)
        b = b.convert("RGB").resize((size, size), Image.LANCZOS)
    diff = ImageChops.difference(a, b)
    total = sum(sum(pixel) for pixel in diff.getdata())
    return total / (size * size * 3)


def is_near_duplicate_image(image_path: Path, other_path: Path, max_mean_diff: float = 8.0) -> bool:
    """True if image_path is essentially an unedited copy of other_path
    (allowing for lossy re-encoding/resizing noise). Used to catch an image-provider
    compositing failure mode where the model returns one of the two
    reference images back almost unchanged instead of merging them — a
    defect the vision quality judge can miss entirely (an unedited pose
    photo can still score well on anatomy/lighting/realism; an unedited
    design photo can still score well on nail_accuracy) since it never
    compares the output back against the actual inputs. max_mean_diff=8.0
    (out of 255 per channel) is deliberately strict: a real successful edit
    changes a visible portion of the frame (the nails), which moves the mean
    diff well above this even when the rest of the photo is preserved
    exactly, so this should only fire on genuine near-copies.
    """
    return _mean_abs_pixel_diff(image_path, other_path) <= max_mean_diff


def prepare_image_for_api(path: Path) -> tuple[bytes, str]:
    """Returns (bytes, mime_type) to upload to Gemini/Claude for a reference or
    candidate image. Images already at or under _API_UPLOAD_MAX_DIMENSION are
    returned untouched (no re-encoding cost or generational quality loss);
    larger ones are downscaled to fit on the long edge and re-encoded as a
    high-quality JPEG. Called on every reference/candidate image for both
    image generation and quality scoring — see _API_UPLOAD_MAX_DIMENSION.
    """
    with Image.open(path) as img:
        width, height = img.size
        if max(width, height) <= _API_UPLOAD_MAX_DIMENSION:
            return path.read_bytes(), detect_image_mime_type(path)

        scale = _API_UPLOAD_MAX_DIMENSION / max(width, height)
        new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
        resized = img.convert("RGB").resize(new_size, Image.LANCZOS)

    buffer = io.BytesIO()
    resized.save(buffer, format="JPEG", **_JPEG_SAVE_KWARGS)
    return buffer.getvalue(), "image/jpeg"


def fit_to_size(image_path: Path, width: int, height: int) -> None:
    """Resizes + center-crops the image in place to exactly width x height
    (cover fit — fills the frame with no distortion, cropping any overflow),
    so campaign images match the social-media template the user picked
    regardless of what aspect ratio the model actually returned.
    """
    with Image.open(image_path) as img:
        img = img.convert("RGB")
        src_ratio = img.width / img.height
        target_ratio = width / height

        if src_ratio > target_ratio:
            scaled_height = height
            scaled_width = round(img.width * (height / img.height))
        else:
            scaled_width = width
            scaled_height = round(img.height * (width / img.width))

        img = img.resize((scaled_width, scaled_height), Image.LANCZOS)

        left = (scaled_width - width) // 2
        top = (scaled_height - height) // 2
        img = img.crop((left, top, left + width, top + height))
        img.save(image_path, **_JPEG_SAVE_KWARGS)
