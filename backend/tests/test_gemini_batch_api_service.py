import base64

from app.config import Settings
from app.services import gemini_batch_api_service


def _settings(**overrides) -> Settings:
    defaults = dict(
        gemini_api_key="test-key",
        # A different alias than gemini_api_model's own default, so a test
        # asserting on the resolved model in the submitted request is
        # actually exercising gemini_batch_api_model — not silently passing
        # because it happens to match gemini_api_model's default too.
        gemini_api_model="nano-banana-pro",
        gemini_batch_api_model="nano-banana-2",
        gemini_batch_api_poll_interval_seconds=0,
        gemini_batch_api_timeout_seconds=5,
    )
    defaults.update(overrides)
    return Settings(**defaults)


def test_gemini_batch_api_model_defaults_to_gemini_api_models_default_but_is_independently_overridable():
    """gemini_batch_api_model is its own setting rather than reusing
    gemini_api_model — currently defaults to the same model (see config.py's
    comment: side-by-side testing found gemini-2.5-flash-image's batch
    compositing quality noticeably worse than 3.1's), but must stay
    independently overridable in case Batch Mode reliability against 3.1
    becomes a real problem later without wanting to change the sync
    provider's model too."""
    default_settings = Settings(gemini_api_key="test-key")
    assert default_settings.gemini_batch_api_model == default_settings.gemini_api_model

    overridden = Settings(
        gemini_api_key="test-key", gemini_batch_api_model="gemini-2.5-flash-image"
    )
    assert overridden.gemini_batch_api_model == "gemini-2.5-flash-image"
    assert overridden.gemini_api_model == default_settings.gemini_api_model  # unaffected by the override above


def test_generate_via_gemini_batch_api_requires_key():
    try:
        gemini_batch_api_service.generate_via_gemini_batch_api("prompt", [], Settings(gemini_api_key=""))
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "GEMINI_API_KEY" in str(exc)


def test_generate_via_gemini_batch_api_submits_polls_and_extracts_image(monkeypatch, tiny_png_bytes):
    """Response shapes below are copied verbatim from a real submitted job
    (see the payload the real API returned for `batches/…`), not guessed
    from docs — the Operation envelope (name/metadata/done/response) is
    easy to get wrong since the REST reference only documents the
    GenerateContentBatch resource nested under `metadata`, not this
    wrapper."""
    encoded = base64.b64encode(tiny_png_bytes).decode("ascii")
    calls = {"get": 0}

    class FakeSubmitResponse:
        status_code = 200

        def json(self):
            return {"name": "batches/abc123", "metadata": {"state": "BATCH_STATE_PENDING"}}

    class FakeRunningResponse:
        status_code = 200

        def json(self):
            return {"name": "batches/abc123", "done": False, "metadata": {"state": "BATCH_STATE_RUNNING"}}

    class FakeSucceededResponse:
        status_code = 200

        def json(self):
            return {
                "name": "batches/abc123",
                "done": True,
                "metadata": {"state": "BATCH_STATE_SUCCEEDED"},
                "response": {
                    "@type": "type.googleapis.com/google.ai.generativelanguage.v1main.GenerateContentBatchOutput",
                    "inlinedResponses": {
                        "inlinedResponses": [
                            {
                                "response": {
                                    "candidates": [
                                        {
                                            "content": {
                                                "parts": [
                                                    {"inlineData": {"mimeType": "image/png", "data": encoded}}
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                },
            }

    def fake_post(url, json=None, headers=None, timeout=None):
        assert url.endswith("/models/gemini-3.1-flash-image:batchGenerateContent")
        assert headers["x-goog-api-key"] == "test-key"
        batch = json["batch"]
        assert batch["display_name"]
        requests = batch["input_config"]["requests"]["requests"]
        assert requests[0]["request"]["contents"][0]["parts"][-1] == {"text": "draw a cat"}
        return FakeSubmitResponse()

    def fake_get(url, headers=None, timeout=None):
        assert url.endswith("/batches/abc123")
        calls["get"] += 1
        return FakeRunningResponse() if calls["get"] == 1 else FakeSucceededResponse()

    monkeypatch.setattr(gemini_batch_api_service.httpx, "post", fake_post)
    monkeypatch.setattr(gemini_batch_api_service.httpx, "get", fake_get)

    result = gemini_batch_api_service.generate_via_gemini_batch_api("draw a cat", [], _settings())

    assert result == tiny_png_bytes
    assert calls["get"] == 2


def test_generate_via_gemini_batch_api_raises_on_failed_job(monkeypatch):
    class FakeSubmitResponse:
        status_code = 200

        def json(self):
            return {"name": "batches/abc123"}

    class FakeFailedResponse:
        status_code = 200

        def json(self):
            return {
                "name": "batches/abc123",
                "done": True,
                "metadata": {"state": "BATCH_STATE_FAILED"},
                "error": {"code": 13, "message": "internal error"},
            }

    monkeypatch.setattr(gemini_batch_api_service.httpx, "post", lambda *a, **kw: FakeSubmitResponse())
    monkeypatch.setattr(gemini_batch_api_service.httpx, "get", lambda *a, **kw: FakeFailedResponse())

    try:
        gemini_batch_api_service.generate_via_gemini_batch_api("prompt", [], _settings())
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "internal error" in str(exc)


def test_generate_via_gemini_batch_api_times_out(monkeypatch):
    class FakeSubmitResponse:
        status_code = 200

        def json(self):
            return {"name": "batches/abc123"}

    class FakePendingResponse:
        status_code = 200

        def json(self):
            return {"name": "batches/abc123", "done": False, "metadata": {"state": "BATCH_STATE_PENDING"}}

    monkeypatch.setattr(gemini_batch_api_service.httpx, "post", lambda *a, **kw: FakeSubmitResponse())
    monkeypatch.setattr(gemini_batch_api_service.httpx, "get", lambda *a, **kw: FakePendingResponse())

    try:
        gemini_batch_api_service.generate_via_gemini_batch_api(
            "prompt", [], _settings(gemini_batch_api_timeout_seconds=0)
        )
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "did not finish" in str(exc)


def test_generate_via_gemini_batch_api_calls_on_job_submitted_before_polling(monkeypatch, tiny_png_bytes):
    """The resume feature depends on this firing right after submission
    succeeds — before the poll loop — so the job name is persisted even if
    the process dies mid-poll."""
    encoded = base64.b64encode(tiny_png_bytes).decode("ascii")
    captured = {}

    class FakeSubmitResponse:
        status_code = 200

        def json(self):
            return {"name": "batches/xyz789"}

    class FakeSucceededResponse:
        status_code = 200

        def json(self):
            return {
                "done": True,
                "response": {
                    "inlinedResponses": {
                        "inlinedResponses": [
                            {
                                "response": {
                                    "candidates": [
                                        {
                                            "content": {
                                                "parts": [
                                                    {"inlineData": {"mimeType": "image/png", "data": encoded}}
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                },
            }

    monkeypatch.setattr(gemini_batch_api_service.httpx, "post", lambda *a, **kw: FakeSubmitResponse())
    monkeypatch.setattr(gemini_batch_api_service.httpx, "get", lambda *a, **kw: FakeSucceededResponse())

    def on_job_submitted(job_ref):
        captured["job_ref"] = job_ref

    result = gemini_batch_api_service.generate_via_gemini_batch_api(
        "prompt", [], _settings(), on_job_submitted=on_job_submitted
    )

    assert captured["job_ref"] == "batches/xyz789"
    assert result == tiny_png_bytes


def test_recover_via_gemini_batch_api_never_submits_a_new_job(monkeypatch, tiny_png_bytes):
    """Recovery must only poll+extract an already-submitted job — never call
    _submit_batch, or an interrupted job would get resubmitted (and
    re-billed) every time the backend restarts before it finishes."""
    encoded = base64.b64encode(tiny_png_bytes).decode("ascii")

    class FakeSucceededResponse:
        status_code = 200

        def json(self):
            return {
                "done": True,
                "response": {
                    "inlinedResponses": {
                        "inlinedResponses": [
                            {
                                "response": {
                                    "candidates": [
                                        {
                                            "content": {
                                                "parts": [
                                                    {"inlineData": {"mimeType": "image/png", "data": encoded}}
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                },
            }

    def fail_if_called(*a, **kw):
        raise AssertionError("recover_via_gemini_batch_api must never POST (submit) a new job")

    monkeypatch.setattr(gemini_batch_api_service.httpx, "post", fail_if_called)
    monkeypatch.setattr(gemini_batch_api_service.httpx, "get", lambda *a, **kw: FakeSucceededResponse())

    result = gemini_batch_api_service.recover_via_gemini_batch_api("batches/already-submitted", _settings())

    assert result == tiny_png_bytes


def test_recover_via_gemini_batch_api_requires_key():
    try:
        gemini_batch_api_service.recover_via_gemini_batch_api("batches/x", Settings(gemini_api_key=""))
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "GEMINI_API_KEY" in str(exc)
