"""In-process scheduler for the two auto-posting sweeps. No Celery/Redis is
wired into this codebase (see CLAUDE.md #8 — don't change the stack without
asking); APScheduler running inside the FastAPI process is the smallest
addition that gets real automation without introducing a broker/worker.

Job A (content generation): finds posts still pending_content whose
suggested_date is within CONTENT_LEAD_TIME_HOURS, generates caption/hashtags
via AgentService, flips them to pending_review, and raises a Notification.

Job B (publish): finds posts that are approved AND whose suggested_date has
arrived, and publishes them. This is the ONLY place besides direct manual
approval-then-publish that calls PublishingService — approval is checked
here explicitly, so a post can never be published without it (see the
user's explicit requirement: approval is mandatory, never auto-skipped).

Job C (metrics sync): pulls Meta engagement insights for already-posted
posts every few hours (insights don't update in real time, so more frequent
polling wouldn't show anything new) — see insights_service.py. Every run is
expected to report "unavailable" for every post until the
read_insights/instagram_manage_insights Meta App Review is approved; that's
the intended degraded state, not a bug.

Job D (auto-refill): tops up campaigns opted into Campaign.auto_refill_enabled
whose upcoming scheduled-post buffer has run low, by cloning and re-running
their last completed batch job — see auto_refill_service.py for the cost
guards (cooldown, requires a prior completed batch to clone).
"""

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import SessionLocal
from app.models.db_models import GeneratedImage, ImageEdit, Notification, ScheduledPost
from app.services.agent_service import AgentService
from app.services.auto_refill_service import run_auto_refill
from app.services.insights_service import InsightsService
from app.services.notification_service import notify_external
from app.services.publishing_service import PublishingService

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def start_scheduler(settings: Settings | None = None) -> BackgroundScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    settings = settings or get_settings()
    scheduler = BackgroundScheduler()
    scheduler.add_job(_run_content_generation_sweep, "interval", minutes=15, id="content_generation_sweep")
    scheduler.add_job(_run_publish_sweep, "interval", minutes=5, id="publish_sweep")
    scheduler.add_job(_run_metrics_sync_sweep, "interval", hours=6, id="metrics_sync_sweep")
    scheduler.add_job(_run_auto_refill_sweep, "interval", hours=6, id="auto_refill_sweep")
    scheduler.start()
    _scheduler = scheduler
    return scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def _run_content_generation_sweep() -> None:
    db = SessionLocal()
    try:
        generate_content_for_due_posts(db)
    except Exception:  # noqa: BLE001 - a scheduler job must never crash the loop
        logger.exception("content_generation_sweep failed")
    finally:
        db.close()


def _run_publish_sweep() -> None:
    db = SessionLocal()
    try:
        publish_due_posts(db)
    except Exception:  # noqa: BLE001 - a scheduler job must never crash the loop
        logger.exception("publish_sweep failed")
    finally:
        db.close()


def _run_metrics_sync_sweep() -> None:
    db = SessionLocal()
    try:
        InsightsService().sync_all_posted_metrics(db)
    except Exception:  # noqa: BLE001 - a scheduler job must never crash the loop
        logger.exception("metrics_sync_sweep failed")
    finally:
        db.close()


def _run_auto_refill_sweep() -> None:
    db = SessionLocal()
    try:
        run_auto_refill(db)
    except Exception:  # noqa: BLE001 - a scheduler job must never crash the loop
        logger.exception("auto_refill_sweep failed")
    finally:
        db.close()


def _build_image_context(db: Session, post: ScheduledPost) -> str:
    edit_ids = post.resolved_edit_ids()
    if edit_ids:
        parts = []
        for edit_id in edit_ids:
            edit = db.get(ImageEdit, edit_id)
            if edit:
                parts.append(edit.prompt_used or edit.prompt)
        if len(parts) > 1:
            return f"a carousel of {len(parts)} nail design photos: " + "; ".join(parts)
        return parts[0] if parts else "a nail design photo"

    image_ids = post.resolved_image_ids()
    if image_ids:
        parts = []
        for image_id in image_ids:
            image = db.get(GeneratedImage, image_id)
            if image:
                parts.append(image.prompt_used or image.design_filename)
        if len(parts) > 1:
            return f"a carousel of {len(parts)} nail design photos: " + "; ".join(parts)
        return parts[0] if parts else "a nail design photo"

    return "a nail design photo"


def _recent_sibling_captions(db: Session, post: ScheduledPost, limit: int = 5) -> list[str]:
    if not post.campaign_id:
        return []
    rows = (
        db.query(ScheduledPost.caption)
        .filter(ScheduledPost.campaign_id == post.campaign_id)
        .filter(ScheduledPost.id != post.id)
        .filter(ScheduledPost.caption.isnot(None))
        .order_by(ScheduledPost.created_at.desc())
        .limit(limit)
        .all()
    )
    return [row[0] for row in rows if row[0]]


def generate_content_for_due_posts(db: Session, settings: Settings | None = None) -> list[ScheduledPost]:
    settings = settings or get_settings()
    cutoff = datetime.now(timezone.utc) + timedelta(hours=settings.content_lead_time_hours)

    due_posts = (
        db.query(ScheduledPost)
        .filter(ScheduledPost.status == "pending_content")
        .filter(ScheduledPost.suggested_date.isnot(None))
        .filter(ScheduledPost.suggested_date <= cutoff)
        .all()
    )

    agent = AgentService(settings)
    updated = []
    for post in due_posts:
        image_context = _build_image_context(db, post)
        recent_captions = _recent_sibling_captions(db, post)

        content = agent.generate_post_content(
            image_context, salon_context="", platform=post.platform or "", recent_captions=recent_captions
        )
        post.caption = content["caption"]
        post.hashtags = " ".join(content["hashtags"])
        post.status = "pending_review"
        post.generated_at = datetime.now(timezone.utc)
        db.add(post)
        message = f"AI content is ready to review for a {post.platform or 'social'} post."
        db.add(
            Notification(
                user_id=post.user_id,
                type="content_ready_for_review",
                message=message,
                scheduled_post_id=post.id,
            )
        )
        notify_external("content_ready_for_review", message)
        updated.append(post)

    db.commit()
    return updated


def publish_due_posts(db: Session, settings: Settings | None = None) -> list[ScheduledPost]:
    settings = settings or get_settings()
    now = datetime.now(timezone.utc)

    due_posts = (
        db.query(ScheduledPost)
        .filter(ScheduledPost.status == "approved")
        .filter(ScheduledPost.suggested_date.isnot(None))
        .filter(ScheduledPost.suggested_date <= now)
        .all()
    )

    publishing_service = PublishingService(settings)
    updated = []
    for post in due_posts:
        publishing_service.publish(db, post)
        if post.status == "failed":
            message = f"Failed to publish a {post.platform or 'social'} post: {post.error_message}"
            db.add(
                Notification(
                    user_id=post.user_id,
                    type="post_failed",
                    message=message,
                    scheduled_post_id=post.id,
                )
            )
            db.commit()
            notify_external("post_failed", message)
        updated.append(post)

    return updated
