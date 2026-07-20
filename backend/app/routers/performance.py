from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.db_models import GeneratedImage, PostMetrics, ScheduledPost
from app.models.schemas import DesignPerformanceOut, PerformanceSummaryOut, PostMetricsOut
from app.services.auth_service import get_current_user_id
from app.services.insights_service import InsightsService

router = APIRouter(prefix="/api/performance", tags=["performance"])


@router.get("/summary", response_model=PerformanceSummaryOut)
def get_performance_summary(
    campaign_id: str | None = None,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> PerformanceSummaryOut:
    query = (
        db.query(PostMetrics)
        .join(ScheduledPost, PostMetrics.scheduled_post_id == ScheduledPost.id)
        .filter(ScheduledPost.user_id == user_id)
    )
    if campaign_id:
        query = query.filter(ScheduledPost.campaign_id == campaign_id)
    metrics = query.all()

    tracked = [m for m in metrics if m.unavailable_reason is None]
    pending = [m for m in metrics if m.unavailable_reason is not None]

    design_totals: dict[str, dict] = {}
    for m in tracked:
        post = db.get(ScheduledPost, m.scheduled_post_id)
        if post is None:
            continue
        # A carousel post's reach/engagement is reported by Meta at the post
        # level, not per constituent image — every image in the post is
        # credited with the full total (no way to split it further).
        for image_id in post.resolved_image_ids():
            image = db.get(GeneratedImage, image_id)
            if image is None:
                continue
            entry = design_totals.setdefault(
                image.id,
                {
                    "image_id": image.id,
                    "design_filename": image.design_filename,
                    "image_url": f"/media/generated/{image.batch_job_id}/{Path(image.generated_path).name}"
                    if image.generated_path
                    else None,
                    "reach": 0,
                    "engagement": 0,
                },
            )
            entry["reach"] += m.reach or 0
            entry["engagement"] += (m.likes or 0) + (m.comments or 0) + (m.shares or 0)

    top_designs = sorted(design_totals.values(), key=lambda d: d["engagement"], reverse=True)[:10]

    return PerformanceSummaryOut(
        total_posts_tracked=len(tracked),
        total_posts_pending_metrics=len(pending),
        total_impressions=sum(m.impressions or 0 for m in tracked),
        total_reach=sum(m.reach or 0 for m in tracked),
        total_engagement=sum((m.likes or 0) + (m.comments or 0) + (m.shares or 0) for m in tracked),
        top_designs=[DesignPerformanceOut(**d) for d in top_designs],
    )


@router.get("/posts", response_model=list[PostMetricsOut])
def list_post_metrics(
    db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> list[PostMetrics]:
    return (
        db.query(PostMetrics)
        .join(ScheduledPost, PostMetrics.scheduled_post_id == ScheduledPost.id)
        .filter(ScheduledPost.user_id == user_id)
        .order_by(PostMetrics.fetched_at.desc())
        .all()
    )


@router.post("/sync", response_model=list[PostMetricsOut])
def trigger_sync(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)) -> list[PostMetrics]:
    return InsightsService().sync_all_posted_metrics(db, user_id=user_id)
