from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.db_models import BatchJob, GeneratedImage, ImageEdit, Notification, ScheduledPost, SocialAccount
from app.models.schemas import (
    ScheduledPostBulkAction,
    ScheduledPostBulkActionResponse,
    ScheduledPostBulkCreate,
    ScheduledPostBulkCreateResponse,
    ScheduledPostCreate,
    ScheduledPostOut,
    ScheduledPostUpdate,
)
from app.services import scheduling_service
from app.services.auth_service import get_current_user_id

router = APIRouter(prefix="/api/scheduled-posts", tags=["scheduled-posts"])


def _to_out(post: ScheduledPost, db: Session) -> ScheduledPostOut:
    image_ids = post.resolved_image_ids()
    edit_ids = post.resolved_edit_ids()
    image_urls: list[str] = []
    for image_id in image_ids:
        image = db.get(GeneratedImage, image_id)
        if image and image.generated_path:
            image_urls.append(f"/media/generated/{image.batch_job_id}/{Path(image.generated_path).name}")
    for edit_id in edit_ids:
        edit = db.get(ImageEdit, edit_id)
        if edit and edit.generated_path:
            image_urls.append(f"/media/generated/{edit.edit_job_id or edit.id}/{Path(edit.generated_path).name}")
    return ScheduledPostOut(
        id=post.id,
        batch_job_id=post.batch_job_id,
        image_ids=image_ids,
        edit_ids=edit_ids,
        image_id=image_ids[0] if image_ids else None,
        edit_id=edit_ids[0] if edit_ids else None,
        social_account_id=post.social_account_id,
        caption=post.caption,
        hashtags=post.hashtags,
        platform=post.platform,
        status=post.status,
        suggested_date=post.suggested_date,
        platform_post_id=post.platform_post_id,
        error_message=post.error_message,
        image_urls=image_urls,
        image_url=image_urls[0] if image_urls else None,
        created_at=post.created_at,
        campaign_id=post.campaign_id,
    )


@router.post("", response_model=ScheduledPostOut, status_code=201)
def create_scheduled_post(
    payload: ScheduledPostCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> ScheduledPostOut:
    campaign_id = payload.campaign_id
    image_ids = payload.image_ids
    edit_ids = payload.edit_ids

    if bool(image_ids) == bool(edit_ids):
        raise HTTPException(status_code=422, detail="Provide either Batch Generator images or Photo Editor results, not both")
    ids = image_ids or edit_ids
    if not 1 <= len(ids) <= 10:
        raise HTTPException(status_code=422, detail="A post must have between 1 and 10 images")

    if edit_ids:
        if payload.batch_job_id:
            raise HTTPException(status_code=422, detail="Provide either a Batch Generator image or a Photo Editor result, not both")
        for edit_id in edit_ids:
            edit = db.get(ImageEdit, edit_id)
            if edit is None or edit.user_id != user_id or not edit.generated_path:
                raise HTTPException(status_code=404, detail=f"Photo Editor result {edit_id} not found or not ready yet")
    else:
        if not payload.batch_job_id:
            raise HTTPException(status_code=422, detail="batch_job_id is required when scheduling Batch Generator images")
        batch_job = db.get(BatchJob, payload.batch_job_id)
        if batch_job is None or batch_job.user_id != user_id:
            raise HTTPException(status_code=404, detail="Batch job not found")
        for image_id in image_ids:
            image = db.get(GeneratedImage, image_id)
            if image is None or image.batch_job_id != batch_job.id:
                raise HTTPException(status_code=404, detail=f"Generated image {image_id} not found")
        if campaign_id is None:
            campaign_id = batch_job.campaign_id

    used_images, used_edits = scheduling_service.images_in_use(db, user_id)
    already_claimed = (set(image_ids) & used_images) | (set(edit_ids) & used_edits)
    if already_claimed:
        raise HTTPException(
            status_code=409,
            detail=f"Already scheduled on another active post: {', '.join(sorted(already_claimed))}",
        )

    account = db.get(SocialAccount, payload.social_account_id)
    if account is None or account.user_id != user_id or account.status != "active":
        raise HTTPException(status_code=422, detail="Social account is not connected or is inactive")

    post = ScheduledPost(
        user_id=user_id,
        batch_job_id=payload.batch_job_id if image_ids else None,
        image_ids=image_ids,
        edit_ids=edit_ids,
        social_account_id=payload.social_account_id,
        platform=payload.platform,
        suggested_date=payload.suggested_date,
        status="pending_content",
        campaign_id=campaign_id,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return _to_out(post, db)


@router.get("", response_model=list[ScheduledPostOut])
def list_scheduled_posts(
    status: str | None = None, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> list[ScheduledPostOut]:
    query = db.query(ScheduledPost).filter(ScheduledPost.user_id == user_id)
    if status:
        query = query.filter(ScheduledPost.status == status)
    posts = query.order_by(ScheduledPost.suggested_date.asc()).all()
    return [_to_out(p, db) for p in posts]


@router.post("/bulk", response_model=ScheduledPostBulkCreateResponse, status_code=201)
def bulk_create_scheduled_posts(
    payload: ScheduledPostBulkCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> ScheduledPostBulkCreateResponse:
    result = scheduling_service.bulk_schedule(
        db,
        user_id,
        batch_job_id=payload.batch_job_id,
        campaign_id=payload.campaign_id,
        social_account_id=payload.social_account_id,
        platform=payload.platform,
        start_date=payload.start_date,
        interval_hours=payload.interval_hours,
        images_per_post=payload.images_per_post,
    )
    return ScheduledPostBulkCreateResponse(
        created=[_to_out(p, db) for p in result["created"]],
        skipped_already_scheduled=result["skipped_already_scheduled"],
        skipped_not_ready=result["skipped_not_ready"],
    )


@router.post("/bulk-approve", response_model=ScheduledPostBulkActionResponse)
def bulk_approve_scheduled_posts(
    payload: ScheduledPostBulkAction, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> ScheduledPostBulkActionResponse:
    result = scheduling_service.bulk_transition(db, user_id, "approve", payload.post_ids, payload.campaign_id)
    return ScheduledPostBulkActionResponse(updated=[_to_out(p, db) for p in result["updated"]], skipped=result["skipped"])


@router.post("/bulk-reject", response_model=ScheduledPostBulkActionResponse)
def bulk_reject_scheduled_posts(
    payload: ScheduledPostBulkAction, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> ScheduledPostBulkActionResponse:
    result = scheduling_service.bulk_transition(db, user_id, "reject", payload.post_ids, payload.campaign_id)
    return ScheduledPostBulkActionResponse(updated=[_to_out(p, db) for p in result["updated"]], skipped=result["skipped"])


def _get_post_or_404(db: Session, post_id: str, user_id: str) -> ScheduledPost:
    post = db.get(ScheduledPost, post_id)
    if post is None or post.user_id != user_id:
        raise HTTPException(status_code=404, detail="Scheduled post not found")
    return post


@router.patch("/{post_id}", response_model=ScheduledPostOut)
def update_scheduled_post(
    post_id: str,
    payload: ScheduledPostUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ScheduledPostOut:
    post = _get_post_or_404(db, post_id, user_id)
    if post.status not in {"pending_review", "pending_content"}:
        raise HTTPException(status_code=409, detail=f"Cannot edit a post that is already {post.status}")

    if payload.caption is not None:
        post.caption = payload.caption
    if payload.hashtags is not None:
        post.hashtags = payload.hashtags
    if payload.suggested_date is not None:
        post.suggested_date = payload.suggested_date

    db.commit()
    db.refresh(post)
    return _to_out(post, db)


@router.post("/{post_id}/approve", response_model=ScheduledPostOut)
def approve_scheduled_post(
    post_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> ScheduledPostOut:
    post = _get_post_or_404(db, post_id, user_id)
    if post.status != "pending_review":
        raise HTTPException(status_code=409, detail=f"Cannot approve a post in status {post.status}")

    post.status = "approved"
    post.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(post)
    return _to_out(post, db)


@router.post("/{post_id}/reject", response_model=ScheduledPostOut)
def reject_scheduled_post(
    post_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> ScheduledPostOut:
    post = _get_post_or_404(db, post_id, user_id)
    if post.status not in {"pending_review", "pending_content", "approved"}:
        raise HTTPException(status_code=409, detail=f"Cannot reject a post in status {post.status}")

    post.status = "rejected"
    post.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(post)
    return _to_out(post, db)


@router.delete("/{post_id}")
def delete_scheduled_post(
    post_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> dict:
    post = _get_post_or_404(db, post_id, user_id)
    if post.status != "failed":
        raise HTTPException(status_code=409, detail=f"Cannot delete a post in status {post.status}, only failed posts")

    # A failed post always has a "post_failed" Notification pointing at it
    # (see scheduler_service.py) — clear those first so the FK doesn't block
    # the delete.
    db.query(Notification).filter(Notification.scheduled_post_id == post_id).delete()
    db.delete(post)
    db.commit()
    return {"ok": True}
