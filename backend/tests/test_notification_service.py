from app.config import Settings
from app.services import notification_service


def _settings(**overrides) -> Settings:
    return Settings(**overrides)


def test_notify_external_is_a_no_op_without_a_webhook_url(monkeypatch):
    calls = []
    monkeypatch.setattr(notification_service.httpx, "post", lambda *a, **kw: calls.append((a, kw)))

    notification_service.notify_external("post_failed", "boom", _settings(notification_webhook_url=""))

    assert calls == []


def test_notify_external_posts_json_to_the_configured_webhook(monkeypatch):
    calls = []
    monkeypatch.setattr(notification_service.httpx, "post", lambda *a, **kw: calls.append((a, kw)))

    notification_service.notify_external(
        "content_ready_for_review", "AI content is ready", _settings(notification_webhook_url="https://hooks.example.test/x")
    )

    assert len(calls) == 1
    args, kwargs = calls[0]
    assert args[0] == "https://hooks.example.test/x"
    assert kwargs["json"]["text"] == "AI content is ready"
    assert kwargs["json"]["type"] == "content_ready_for_review"


def test_notify_external_swallows_delivery_errors(monkeypatch):
    def _raise(*a, **kw):
        raise RuntimeError("network is down")

    monkeypatch.setattr(notification_service.httpx, "post", _raise)

    # Must not raise — a webhook outage should never take down the caller
    # (a scheduler sweep, or a request handler).
    notification_service.notify_external("post_failed", "boom", _settings(notification_webhook_url="https://hooks.example.test/x"))
