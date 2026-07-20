import base64
from io import BytesIO

import pytest
from PIL import Image

from app.services.image_service import _save_base64_image


def _image_b64(fmt: str) -> str:
    buffer = BytesIO()
    Image.new("RGB", (8, 8), color=(10, 20, 30)).save(buffer, format=fmt)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def test_detects_real_image_mime_and_corrects_extension(tmp_path):
    out_path = tmp_path / "some-id.png"
    final_path, mime_type = _save_base64_image(_image_b64("JPEG"), out_path)

    assert mime_type == "image/jpeg"
    assert final_path.suffix == ".jpg"
    assert final_path.exists()
    assert not out_path.exists()
    assert Image.open(final_path).format == "JPEG"


def test_keeps_extension_when_image_bytes_match(tmp_path):
    out_path = tmp_path / "some-id.png"
    final_path, mime_type = _save_base64_image(_image_b64("PNG"), out_path)

    assert mime_type == "image/png"
    assert final_path == out_path


def test_resizes_oauth_image_to_requested_dimensions(tmp_path):
    out_path = tmp_path / "some-id.png"
    final_path, _ = _save_base64_image(_image_b64("PNG"), out_path, 1080, 1350)

    with Image.open(final_path) as image:
        assert image.size == (1080, 1350)


def test_rejects_invalid_base64(tmp_path):
    with pytest.raises(RuntimeError, match="invalid image data"):
        _save_base64_image("not-base64", tmp_path / "out.png")
