"""Bulk operations over ScheduledPost — the manual bottleneck this closes is
that routers/scheduled_posts.py's create/approve/reject endpoints only ever
act on one post at a time, so scheduling or reviewing a whole batch/campaign
took as many clicks as it had images. Everything here is a bulk wrapper
around the exact same status machine already enforced there (see
ScheduledPost's docstring in db_models.py) — no new states, no new
publishing path.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.db_models import BatchJob, Campaign, GeneratedImage, ScheduledPost, SocialAccount

TERMINAL_STATUSES = ("rejected", "failed")  # a post in one of these no longer occupies its image(s)


def images_in_use(db: Session, user_id: str) -> tuple[set[str], set[str]]:
    """Every image_id/edit_id already claimed by one of this user's
    non-terminal ScheduledPosts — across both the legacy singular column and
    the image_ids/edit_ids JSON lists. Single source of truth for "never
    reuse a live image", shared by the single-post create endpoint and
    bulk_schedule below."""
    rows = (
        db.query(ScheduledPost.image_id, ScheduledPost.image_ids, ScheduledPost.edit_id, ScheduledPost.edit_ids)
        .filter(ScheduledPost.user_id == user_id, ScheduledPost.status.notin_(TERMINAL_STATUSES))
        .all()
    )
    used_images: set[str] = set()
    used_edits: set[str] = set()
    for image_id, image_ids, edit_id, edit_ids in rows:
        if image_id:
            used_images.add(image_id)
        used_images.update(image_ids or [])
        if edit_id:
            used_edits.add(edit_id)
        used_edits.update(edit_ids or [])
    return used_images, used_edits


def bulk_schedule(
    db: Session,
    user_id: str,
    batch_job_id: str | None,
    campaign_id: str | None,
    social_account_id: str,
    platform: str,
    start_date: datetime,
    interval_hours: float,
    images_per_post: int = 1,
) -> dict:
    if bool(batch_job_id) == bool(campaign_id):
        raise HTTPException(status_code=422, detail="Provide exactly one of batch_job_id or campaign_id")
    if not 1 <= images_per_post <= 10:
        raise HTTPException(status_code=422, detail="images_per_post must be between 1 and 10")

    account = db.get(SocialAccount, social_account_id)
    if account is None or account.user_id != user_id or account.status != "active":
        raise HTTPException(status_code=422, detail="Social account is not connected or is inactive")

    if batch_job_id:
        job = db.get(BatchJob, batch_job_id)
        if job is None or job.user_id != user_id:
            raise HTTPException(status_code=404, detail="Batch job not found")
        job_ids = [job.id]
        resolved_campaign_id = job.campaign_id
    else:
        campaign = db.get(Campaign, campaign_id)
        if campaign is None or campaign.user_id != user_id:
            raise HTTPException(status_code=404, detail="Campaign not found")
        job_ids = [j.id for j in db.query(BatchJob).filter(BatchJob.campaign_id == campaign.id).all()]
        resolved_campaign_id = campaign.id

    candidate_images = (
        db.query(GeneratedImage)
        .filter(GeneratedImage.batch_job_id.in_(job_ids))
        .order_by(GeneratedImage.created_at.asc())
        .all()
        if job_ids
        else []
    )

    used_images, _ = images_in_use(db, user_id)

    ready_images: list[GeneratedImage] = []
    skipped_already_scheduled = 0
    skipped_not_ready = 0

    for image in candidate_images:
        if image.id in used_images:
            skipped_already_scheduled += 1
            continue
        if image.status != "passed" or not image.generated_path:
            skipped_not_ready += 1
            continue
        ready_images.append(image)

    created: list[ScheduledPost] = []
    slot = start_date

    for i in range(0, len(ready_images), images_per_post):
        chunk = ready_images[i : i + images_per_post]
        post = ScheduledPost(
            user_id=user_id,
            batch_job_id=chunk[0].batch_job_id,
            image_ids=[img.id for img in chunk],
            social_account_id=social_account_id,
            platform=platform,
            suggested_date=slot,
            status="pending_content",
            campaign_id=resolved_campaign_id,
        )
        db.add(post)
        created.append(post)
        slot = slot + timedelta(hours=interval_hours)

    db.commit()
    for post in created:
        db.refresh(post)

    return {
        "created": created,
        "skipped_already_scheduled": skipped_already_scheduled,
        "skipped_not_ready": skipped_not_ready,
    }


_BULK_ACTION_ALLOWED_FROM = {
    "approve": {"pending_review"},
    "reject": {"pending_content", "pending_review", "approved"},
}
_BULK_ACTION_TO_STATUS = {"approve": "approved", "reject": "rejected"}


def bulk_transition(
    db: Session,
    user_id: str,
    action: str,
    post_ids: list[str],
    campaign_id: str | None,
) -> dict:
    if bool(post_ids) == bool(campaign_id):
        raise HTTPException(status_code=422, detail="Provide exactly one of post_ids or campaign_id")

    if campaign_id:
        campaign = db.get(Campaign, campaign_id)
        if campaign is None or campaign.user_id != user_id:
            raise HTTPException(status_code=404, detail="Campaign not found")
        posts = db.query(ScheduledPost).filter(ScheduledPost.campaign_id == campaign_id, ScheduledPost.user_id == user_id).all()
    else:
        posts = db.query(ScheduledPost).filter(ScheduledPost.id.in_(post_ids), ScheduledPost.user_id == user_id).all()

    allowed_from = _BULK_ACTION_ALLOWED_FROM[action]
    to_status = _BULK_ACTION_TO_STATUS[action]

    updated: list[ScheduledPost] = []
    skipped = 0
    now = datetime.now(timezone.utc)

    for post in posts:
        if post.status not in allowed_from:
            skipped += 1
            continue
        post.status = to_status
        post.reviewed_at = now
        updated.append(post)

    db.commit()
    for post in updated:
        db.refresh(post)

    return {"updated": updated, "skipped": skipped}
