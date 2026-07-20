"""Auto-refill content pipeline (opt-in per Campaign — see
Campaign.auto_refill_enabled in db_models.py).

Runs on a scheduler sweep (see scheduler_service.py). For every eligible
campaign — auto_refill_enabled, an active social account, and a platform
configured — counts how many non-terminal ScheduledPosts land within the
next AUTO_REFILL_BUFFER_DAYS. If that's below AUTO_REFILL_MIN_BUFFER_POSTS
and no refill batch was started for this campaign within the last
AUTO_REFILL_COOLDOWN_HOURS (the cost guard - without it a slow-to-review
queue could trigger unbounded image generation), it clones the
campaign's most recent *completed* batch job's design/pose images into a new
BatchJob, runs it synchronously (matching the rest of scheduler_service's
sweeps, which all do their real work inline rather than via BackgroundTasks),
and auto-schedules whatever passes quality using the campaign's own
defaults. A Notification is always raised so the salon owner sees what
happened even though nothing needed manual approval to *generate*
(publishing still always requires an explicit approve — see
publishing_service.py).
"""

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models.db_models import BatchJob, Campaign, Notification, ScheduledPost, SocialAccount
from app.services import scheduling_service
from app.services.notification_service import notify_external
from app.services.storage_service import StorageService
from app.tasks.batch_tasks import process_batch_job

logger = logging.getLogger(__name__)

_REFILL_DESCRIPTION_PREFIX = "Auto-refill"


def run_auto_refill(db: Session, settings: Settings | None = None) -> list[BatchJob]:
    settings = settings or get_settings()
    now = datetime.now(timezone.utc)
    lookahead = now + timedelta(days=settings.auto_refill_buffer_days)
    cooldown_cutoff = now - timedelta(hours=settings.auto_refill_cooldown_hours)

    campaigns = (
        db.query(Campaign)
        .filter(Campaign.auto_refill_enabled.is_(True))
        .filter(Campaign.status == "active")
        .all()
    )

    triggered: list[BatchJob] = []
    for campaign in campaigns:
        if not campaign.auto_refill_social_account_id or not campaign.auto_refill_platform:
            continue

        account = db.get(SocialAccount, campaign.auto_refill_social_account_id)
        if account is None or account.user_id != campaign.user_id or account.status != "active":
            continue

        upcoming = (
            db.query(ScheduledPost)
            .filter(ScheduledPost.campaign_id == campaign.id)
            .filter(ScheduledPost.status.notin_(scheduling_service.TERMINAL_STATUSES))
            .filter(ScheduledPost.suggested_date.isnot(None))
            .filter(ScheduledPost.suggested_date >= now)
            .filter(ScheduledPost.suggested_date <= lookahead)
            .count()
        )
        if upcoming >= settings.auto_refill_min_buffer_posts:
            continue

        recent_refill = (
            db.query(BatchJob)
            .filter(BatchJob.campaign_id == campaign.id)
            .filter(BatchJob.description.like(f"{_REFILL_DESCRIPTION_PREFIX}%"))
            .filter(BatchJob.created_at >= cooldown_cutoff)
            .first()
        )
        if recent_refill is not None:
            continue

        source_job = (
            db.query(BatchJob)
            .filter(BatchJob.campaign_id == campaign.id)
            .filter(BatchJob.status == "completed")
            .order_by(BatchJob.created_at.desc())
            .first()
        )
        if source_job is None or not source_job.design_paths or not source_job.pose_paths:
            continue

        new_job = _clone_batch_job(settings, db, campaign, source_job)
        triggered.append(new_job)

        try:
            process_batch_job(new_job.id)
        except Exception:  # noqa: BLE001 - a sweep must never crash the loop; the job row already carries the failure
            logger.exception("auto-refill batch generation failed for campaign=%s job=%s", campaign.id, new_job.id)

        db.expire_all()
        new_job = db.get(BatchJob, new_job.id)

        if new_job is not None and new_job.status == "completed":
            scheduling_service.bulk_schedule(
                db,
                campaign.user_id,
                batch_job_id=new_job.id,
                campaign_id=None,
                social_account_id=campaign.auto_refill_social_account_id,
                platform=campaign.auto_refill_platform,
                start_date=_next_start_date(db, campaign, now),
                interval_hours=campaign.auto_refill_interval_hours,
            )

        message = (
            f"Auto-refill: generated {new_job.num_images if new_job else source_job.num_images} new image(s) "
            f"for campaign '{campaign.name}' because the content buffer was low."
        )
        db.add(Notification(user_id=campaign.user_id, type="auto_refill_triggered", message=message))
        db.commit()
        notify_external("auto_refill_triggered", message)

    return triggered


def _next_start_date(db: Session, campaign: Campaign, now: datetime) -> datetime:
    latest = (
        db.query(func.max(ScheduledPost.suggested_date))
        .filter(ScheduledPost.campaign_id == campaign.id)
        .filter(ScheduledPost.status.notin_(scheduling_service.TERMINAL_STATUSES))
        .scalar()
    )
    if latest is not None and latest > now:
        return latest + timedelta(hours=campaign.auto_refill_interval_hours)
    return now


def _clone_batch_job(settings: Settings, db: Session, campaign: Campaign, source_job: BatchJob) -> BatchJob:
    storage = StorageService(settings)

    job = BatchJob(
        user_id=source_job.user_id,
        pairing_mode=source_job.pairing_mode,
        num_images=source_job.num_images,
        description=f"{_REFILL_DESCRIPTION_PREFIX} for campaign '{campaign.name}' (cloned from batch {source_job.id})",
        image_width=source_job.image_width,
        image_height=source_job.image_height,
        status="pending",
        progress_total=source_job.num_images,
        campaign_id=campaign.id,
    )
    db.add(job)
    db.flush()

    job.design_paths = [str(storage.clone_original(job.id, "designs", Path(p))) for p in source_job.design_paths]
    job.pose_paths = [str(storage.clone_original(job.id, "poses", Path(p))) for p in source_job.pose_paths]
    db.commit()
    db.refresh(job)
    return job
