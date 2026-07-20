import io
import shutil

import pytest
from PIL import Image

from app.services.media_utils import (
    apply_watermark,
    fit_to_size,
    is_near_duplicate_image,
    prepare_image_for_api,
    validate_size,
)


def test_validate_size_allows_both_none():
    validate_size(None, None)  # should not raise


def test_validate_size_allows_valid_pair():
    validate_size(1080, 1350)  # should not raise


@pytest.mark.parametrize("width,height", [(1080, None), (None, 1350)])
def test_validate_size_rejects_one_without_the_other(width, height):
    with pytest.raises(ValueError, match="together"):
        validate_size(width, height)


@pytest.mark.parametrize("width,height", [(100, 1350), (1080, 100), (5000, 1350), (1080, 5000)])
def test_validate_size_rejects_out_of_range_dimensions(width, height):
    with pytest.raises(ValueError, match="between"):
        validate_size(width, height)


def test_fit_to_size_produces_exact_dimensions_for_wide_source(tmp_path):
    path = tmp_path / "wide.png"
    Image.new("RGB", (2000, 1000), color=(255, 0, 0)).save(path)

    fit_to_size(path, 1080, 1350)

    with Image.open(path) as img:
        assert img.size == (1080, 1350)


def test_fit_to_size_produces_exact_dimensions_for_tall_source(tmp_path):
    path = tmp_path / "tall.png"
    Image.new("RGB", (500, 2000), color=(0, 255, 0)).save(path)

    fit_to_size(path, 1080, 1920)

    with Image.open(path) as img:
        assert img.size == (1080, 1920)


def test_apply_watermark_keeps_original_image_dimensions(tmp_path):
    image_path = tmp_path / "photo.png"
    Image.new("RGB", (800, 500), color=(240, 240, 240)).save(image_path)
    logo_path = tmp_path / "logo.png"
    Image.new("RGBA", (300, 100), color=(10, 20, 30, 255)).save(logo_path)

    apply_watermark(image_path, logo_path)

    with Image.open(image_path) as img:
        assert img.size == (800, 500)


def test_apply_watermark_draws_logo_pixels_in_bottom_right_corner(tmp_path):
    image_path = tmp_path / "photo.png"
    Image.new("RGB", (800, 500), color=(255, 255, 255)).save(image_path)
    logo_path = tmp_path / "logo.png"
    Image.new("RGBA", (300, 100), color=(255, 0, 0, 255)).save(logo_path)

    apply_watermark(image_path, logo_path)

    # Same geometry apply_watermark computes internally (defaults: margin_ratio=0.03,
    # logo_width_ratio=0.16), sampled at the center of the pasted logo rect.
    target_width = round(800 * 0.16)
    target_height = round(100 * (target_width / 300))
    margin = round(800 * 0.03)
    logo_x = 800 - target_width - margin
    logo_y = 500 - target_height - margin

    with Image.open(image_path) as img:
        img = img.convert("RGB")
        inside_logo_pixel = img.getpixel((logo_x + target_width // 2, logo_y + target_height // 2))
        opposite_corner_pixel = img.getpixel((5, 5))

    assert inside_logo_pixel != (255, 255, 255)  # logo was drawn
    assert opposite_corner_pixel == (255, 255, 255)  # top-left untouched


def test_apply_watermark_respects_transparent_logo_background(tmp_path):
    """A logo with a fully transparent background shouldn't paint a solid
    rectangle over the photo — only the logo's opaque pixels should show."""
    image_path = tmp_path / "photo.png"
    Image.new("RGB", (800, 500), color=(255, 255, 255)).save(image_path)
    logo_path = tmp_path / "logo.png"
    logo = Image.new("RGBA", (300, 100), color=(0, 0, 0, 0))  # fully transparent
    logo.save(logo_path)

    apply_watermark(image_path, logo_path)

    with Image.open(image_path) as img:
        img = img.convert("RGB")
        corner_pixel = img.getpixel((img.width - 5, img.height - 5))

    assert corner_pixel == (255, 255, 255)  # transparent logo left the photo untouched


def test_fit_to_size_crops_center_without_distorting_aspect(tmp_path):
    """A 2:1 source cropped to a 1:1 target should keep the full height and
    trim equally from both sides, not squash the image."""
    path = tmp_path / "banner.png"
    canvas = Image.new("RGB", (200, 100), color=(0, 0, 0))
    for x in range(200):
        for y in range(100):
            canvas.putpixel((x, y), (x % 256, 0, 0))
    canvas.save(path)

    fit_to_size(path, 100, 100)

    with Image.open(path) as img:
        assert img.size == (100, 100)


def test_is_near_duplicate_image_detects_a_resaved_resized_copy(tmp_path):
    original = tmp_path / "original.png"
    Image.new("RGB", (4, 4), color=(255, 0, 0)).save(original)

    copy = tmp_path / "copy.jpg"
    with Image.open(original) as img:
        img.convert("RGB").resize((400, 400)).save(copy, format="JPEG", quality=90)

    assert is_near_duplicate_image(original, copy) is True


def test_is_near_duplicate_image_detects_identical_bytes(tmp_path):
    original = tmp_path / "a.png"
    Image.new("RGB", (10, 10), color=(10, 200, 30)).save(original)
    duplicate = tmp_path / "b.png"
    shutil.copyfile(original, duplicate)

    assert is_near_duplicate_image(original, duplicate) is True


def test_prepare_image_for_api_leaves_small_images_untouched(tmp_path):
    path = tmp_path / "small.png"
    Image.new("RGB", (800, 500), color=(10, 20, 30)).save(path)

    data, mime_type = prepare_image_for_api(path)

    assert data == path.read_bytes()
    assert mime_type == "image/png"


def test_prepare_image_for_api_downscales_oversized_images(tmp_path):
    # A noisy/textured source, not a flat color — a solid-color PNG already
    # compresses losslessly to a few bytes, which would make the "smaller
    # than the original" assertion below meaningless (real uploaded photos
    # always have this kind of texture).
    path = tmp_path / "huge.png"
    size = (4000, 3000)
    canvas = Image.merge(
        "RGB", [Image.effect_noise(size, 50) for _ in range(3)]
    )
    canvas.save(path)

    data, mime_type = prepare_image_for_api(path)

    assert mime_type == "image/jpeg"
    with Image.open(io.BytesIO(data)) as resized:
        assert resized.size == (1568, 1176)
    assert len(data) < len(path.read_bytes())


def test_prepare_image_for_api_preserves_aspect_ratio_for_tall_source(tmp_path):
    path = tmp_path / "tall.png"
    Image.new("RGB", (2000, 6000), color=(10, 20, 30)).save(path)

    _, mime_type = prepare_image_for_api(path)

    data, _ = prepare_image_for_api(path)
    with Image.open(io.BytesIO(data)) as resized:
        assert resized.size == (523, 1568)
    assert mime_type == "image/jpeg"


def test_is_near_duplicate_image_does_not_flag_images_that_merely_share_a_plain_background(tmp_path):
    """Regression guard: a global-average-hash approach was tried first and
    normalized each image against its own mean brightness, so two visually
    distinct photos that both use a plain/uniform commercial background
    (exactly the style this app's prompts request) collapsed to the same
    hash and were wrongly flagged as duplicates. A composited image with a
    large plain background plus a small distinct foreground region must not
    be flagged as a near-duplicate of an unrelated solid-color swatch."""
    plain_background_with_subject = tmp_path / "composite.png"
    canvas = Image.new("RGB", (800, 500), color=(245, 240, 235))
    canvas.paste(Image.new("RGB", (60, 60), color=(255, 0, 0)), (20, 20))
    canvas.save(plain_background_with_subject)

    solid_swatch = tmp_path / "swatch.png"
    Image.new("RGB", (4, 4), color=(255, 0, 0)).save(solid_swatch)

    assert is_near_duplicate_image(plain_background_with_subject, solid_swatch) is False
