import base64

from app.config import Settings
from app.services import gemini_api_service


def _settings(**overrides) -> Settings:
    return Settings(gemini_api_key="test-key", gemini_api_model="nano-banana-2", **overrides)


def test_generate_via_gemini_api_requires_key():
    try:
        gemini_api_service.generate_via_gemini_api("prompt", [], Settings(gemini_api_key=""))
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "GEMINI_API_KEY" in str(exc)


def test_generate_via_gemini_api_resolves_model_alias_and_sends_key(monkeypatch, tiny_png_bytes):
    captured = {}
    encoded = base64.b64encode(tiny_png_bytes).decode("ascii")

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "candidates": [
                    {"content": {"parts": [{"inlineData": {"mimeType": "image/png", "data": encoded}}]}}
                ]
            }

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return FakeResponse()

    monkeypatch.setattr(gemini_api_service.httpx, "post", fake_post)

    result = gemini_api_service.generate_via_gemini_api("draw a cat", [], _settings())

    assert result == tiny_png_bytes
    assert captured["url"].endswith("/gemini-3.1-flash-image:generateContent")
    assert captured["headers"]["x-goog-api-key"] == "test-key"
    assert captured["json"]["contents"][0]["parts"][-1] == {"text": "draw a cat"}


def test_generate_via_gemini_api_raises_on_safety_block(monkeypatch):
    class FakeResponse:
        status_code = 200

        def json(self):
            return {"candidates": [{"finishReason": "SAFETY", "content": {"parts": []}}]}

    monkeypatch.setattr(gemini_api_service.httpx, "post", lambda *a, **kw: FakeResponse())

    try:
        gemini_api_service.generate_via_gemini_api("prompt", [], _settings())
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "safety filter" in str(exc)


def test_generate_via_gemini_api_raises_on_http_error(monkeypatch):
    class FakeResponse:
        status_code = 403
        text = "forbidden"

    monkeypatch.setattr(gemini_api_service.httpx, "post", lambda *a, **kw: FakeResponse())

    try:
        gemini_api_service.generate_via_gemini_api("prompt", [], _settings())
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "403" in str(exc)
