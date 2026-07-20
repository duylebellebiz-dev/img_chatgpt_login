"""Groups BatchJob(s) + ScheduledPost(s) under a named Campaign and rolls up
simple counts for the campaign detail view. Purely organizational — nothing
here affects the generation or publishing pipelines, which work the same
whether or not a job/post has a campaign_id set.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.db_models import BatchJob, Campaign, GeneratedImage, PostMetrics, ScheduledPost
from app.models.schemas import CampaignCreate, CampaignUpdate


def create_campaign(db: Session, user_id: str, payload: CampaignCreate) -> Campaign:
    campaign = Campaign(
        user_id=user_id,
        name=payload.name,
        description=payload.description,
        start_date=payload.start_date,
        end_date=payload.end_date,
        auto_refill_enabled=payload.auto_refill_enabled,
        auto_refill_social_account_id=payload.auto_refill_social_account_id,
        auto_refill_platform=payload.auto_refill_platform,
        auto_refill_interval_hours=payload.auto_refill_interval_hours,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


def list_campaigns(db: Session, user_id: str, status: str | None = None) -> list[Campaign]:
    query = db.query(Campaign).filter(Campaign.user_id == user_id)
    if status:
        query = query.filter(Campaign.status == status)
    return query.order_by(Campaign.created_at.desc()).all()


def get_campaign_or_404(db: Session, user_id: str, campaign_id: str) -> Campaign:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None or campaign.user_id != user_id:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


def update_campaign(db: Session, campaign: Campaign, payload: CampaignUpdate) -> Campaign:
    if payload.name is not None:
        campaign.name = payload.name
    if payload.description is not None:
        campaign.description = payload.description
    if payload.status is not None:
        campaign.status = payload.status.value
    if payload.start_date is not None:
        campaign.start_date = payload.start_date
    if payload.end_date is not None:
        campaign.end_date = payload.end_date
    if payload.auto_refill_enabled is not None:
        campaign.auto_refill_enabled = payload.auto_refill_enabled
    if payload.auto_refill_social_account_id is not None:
        campaign.auto_refill_social_account_id = payload.auto_refill_social_account_id
    if payload.auto_refill_platform is not None:
        campaign.auto_refill_platform = payload.auto_refill_platform
    if payload.auto_refill_interval_hours is not None:
        campaign.auto_refill_interval_hours = payload.auto_refill_interval_hours

    db.commit()
    db.refresh(campaign)
    return campaign


def delete_campaign(db: Session, campaign: Campaign) -> None:
    """Detaches (rather than cascades to) every BatchJob/ScheduledPost that
    pointed at this campaign, then deletes it — campaign grouping is
    optional, so removing a campaign should never take its jobs/posts down
    with it. Done in application code rather than a DB-level ON DELETE
    SET NULL constraint, since the campaign_id column on an upgraded
    (pre-existing) database was added via a plain ALTER TABLE without a
    dialect-specific FK clause (see db_schema_sync.py)."""
    db.query(BatchJob).filter(BatchJob.campaign_id == campaign.id).update({"campaign_id": None})
    db.query(ScheduledPost).filter(ScheduledPost.campaign_id == campaign.id).update({"campaign_id": None})
    db.delete(campaign)
    db.commit()


def build_summary(db: Session, campaign: Campaign) -> dict:
    """No extra user_id filter needed here — campaign was already
    ownership-checked by get_campaign_or_404, and every row queried below is
    scoped to that already-owned campaign_id."""
    batch_jobs = db.query(BatchJob).filter(BatchJob.campaign_id == campaign.id).order_by(BatchJob.created_at.desc()).all()
    scheduled_posts = (
        db.query(ScheduledPost)
        .filter(ScheduledPost.campaign_id == campaign.id)
        .order_by(ScheduledPost.suggested_date.asc())
        .all()
    )

    batch_job_ids = [job.id for job in batch_jobs]
    image_count = (
        db.query(GeneratedImage).filter(GeneratedImage.batch_job_id.in_(batch_job_ids)).count() if batch_job_ids else 0
    )
    posted_count = sum(1 for post in scheduled_posts if post.status == "posted")

    post_ids = [post.id for post in scheduled_posts]
    metrics = db.query(PostMetrics).filter(PostMetrics.scheduled_post_id.in_(post_ids)).all() if post_ids else []
    tracked_metrics = [m for m in metrics if m.unavailable_reason is None]
    total_reach = sum(m.reach or 0 for m in tracked_metrics) if tracked_metrics else None
    total_engagement = (
        sum((m.likes or 0) + (m.comments or 0) + (m.shares or 0) for m in tracked_metrics) if tracked_metrics else None
    )

    return {
        "batch_job_count": len(batch_jobs),
        "scheduled_post_count": len(scheduled_posts),
        "image_count": image_count,
        "posted_count": posted_count,
        "total_reach": total_reach,
        "total_engagement": total_engagement,
        "batch_jobs": batch_jobs,
        "scheduled_posts": scheduled_posts,
    }
