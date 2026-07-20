"""Best-effort external delivery for in-app Notifications (see db_models.py's
Notification) — a generic JSON-POST webhook (Slack/Discord incoming webhook,
Zapier/Make catch hook, or any custom endpoint) so a salon owner doesn't have
to keep the app open to catch a 'content ready to review' or 'post failed'
alert. A no-op when NOTIFICATION_WEBHOOK_URL isn't set, matching the same
degrade-to-local pattern as cloudinary_client.py and meta_service.py.
"""

import logging

import httpx

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


def notify_external(notification_type: str, message: str, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    if not settings.notification_webhook_url:
        return
    try:
        httpx.post(
            settings.notification_webhook_url,
            # "text" is what Slack/Discord incoming webhooks render; the rest
            # are extra fields a generic catch hook (Zapier/Make/n8n) can key
            # off of.
            json={"text": message, "type": notification_type, "message": message},
            timeout=5.0,
        )
    except Exception:  # noqa: BLE001 - best-effort; the in-app Notification row still exists
        logger.exception("Failed to deliver external notification (type=%s)", notification_type)
