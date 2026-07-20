from PIL import Image

from app.config import Settings
from app.services.image_service import ImageService


def _settings(**overrides) -> Settings:
    return Settings(anthropic_api_key="", image_provider="mock", **overrides)


def test_generate_image_mock_output_matches_requested_size(tmp_path, tiny_png_bytes):
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    image_service = ImageService(_settings())
    result_path, _ = image_service.generate_image(design, pose, "prompt", variation=1, out_path=out, width=1080, height=1920)

    with Image.open(result_path) as img:
        assert img.size == (1080, 1920)


def test_generate_image_mock_output_uses_natural_size_when_unset(tmp_path, tiny_png_bytes):
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    image_service = ImageService(_settings())
    result_path, _ = image_service.generate_image(design, pose, "prompt", variation=1, out_path=out)

    with Image.open(result_path) as img:
        assert img.size == (800, 500)  # the mock canvas's natural size


def test_edit_image_mock_output_matches_requested_size(tmp_path, tiny_png_bytes):
    photo = tmp_path / "photo.png"
    photo.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    image_service = ImageService(_settings())
    result_path, _ = image_service.edit_image(photo, "make it brighter", out_path=out, width=1080, height=1350)

    with Image.open(result_path) as img:
        assert img.size == (1080, 1350)
