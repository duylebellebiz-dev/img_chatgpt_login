from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models.db_models import BatchJob, Campaign, ScheduledPost
from app.models.schemas import (
    BatchJobCancelResponse,
    BatchJobCreateResponse,
    BatchJobStatusOut,
    BatchJobSummaryOut,
    GeneratedImageOut,
    PairingMode,
)
from app.services.auth_service import get_current_user_id
from app.services.media_utils import validate_size
from app.services.pairing_service import PairingValidationError, plan_output_count
from app.services.storage_service import StorageService
from app.tasks.batch_tasks import process_batch_job

router = APIRouter(prefix="/api/batch", tags=["batch"])


def _get_owned_batch_job(db: Session, job_id: str, user_id: str) -> BatchJob:
    job = db.get(BatchJob, job_id)
    if job is None or job.user_id != user_id:
        raise HTTPException(status_code=404, detail="Batch job not found")
    return job


@router.post("", response_model=BatchJobCreateResponse, status_code=201)
def create_batch_job(
    background_tasks: BackgroundTasks,
    pairing_mode: PairingMode = Form(...),
    num_images: int = Form(...),
    description: str = Form(""),
    image_width: int | None = Form(None),
    image_height: int | None = Form(None),
    campaign_id: str | None = Form(None),
    design_images: list[UploadFile] = File(...),
    pose_images: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user_id: str = Depends(get_current_user_id),
) -> BatchJobCreateResponse:
    if not design_images:
        raise HTTPException(status_code=422, detail="At least one design image is required")
    if not pose_images:
        raise HTTPException(status_code=422, detail="At least one hand pose image is required")
    if campaign_id:
        campaign = db.get(Campaign, campaign_id)
        if campaign is None or campaign.user_id != user_id:
            raise HTTPException(status_code=404, detail="Campaign not found")

    try:
        validate_size(image_width, image_height)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        output_plan = plan_output_count(
            design_count=len(design_images),
            pose_count=len(pose_images),
            mode=pairing_mode,
            requested_count=num_images,
            min_count=settings.batch_min_images,
            max_count=settings.batch_max_images,
        )
    except PairingValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    storage = StorageService(settings)
    job = BatchJob(
        user_id=user_id,
        pairing_mode=pairing_mode.value,
        num_images=output_plan.approved_count,
        description=description,
        image_width=image_width,
        image_height=image_height,
        status="pending",
        progress_total=output_plan.approved_count,
        campaign_id=campaign_id,
    )

    try:
        db.add(job)
        db.flush()

        design_paths = [str(storage.save_upload(job.id, "designs", f)) for f in design_images]
        pose_paths = [str(storage.save_upload(job.id, "poses", f)) for f in pose_images]

        job.design_paths = design_paths
        job.pose_paths = pose_paths
        db.commit()
        db.refresh(job)
    except Exception:
        db.rollback()
        if job.id:
            storage.cleanup_job(job.id)
        raise

    background_tasks.add_task(process_batch_job, job.id)

    cap_message = None
    if output_plan.was_capped:
        cap_message = (
            f"Requested {output_plan.requested_count} images, capped to "
            f"{output_plan.approved_count} for {len(design_images)} design(s), "
            f"{len(pose_images)} pose(s), and {pairing_mode.value} mode."
        )

    return BatchJobCreateResponse(
        job_id=job.id,
        status=job.status,
        requested_num_images=output_plan.requested_count,
        approved_num_images=output_plan.approved_count,
        progress_total=output_plan.approved_count,
        was_capped=output_plan.was_capped,
        cap_message=cap_message,
    )


@router.get("", response_model=list[BatchJobSummaryOut])
def list_batch_jobs(
    campaign_id: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> list[BatchJobSummaryOut]:
    """Lets the UI recover a job_id after a page reload wipes the in-memory
    job state that createBatchJob's polling loop was holding — there was
    previously no way to look this up again."""
    query = db.query(BatchJob).filter(BatchJob.user_id == user_id)
    if campaign_id:
        query = query.filter(BatchJob.campaign_id == campaign_id)
    jobs = query.order_by(BatchJob.created_at.desc()).limit(limit).all()
    return [
        BatchJobSummaryOut(
            job_id=job.id,
            status=job.status,
            pairing_mode=job.pairing_mode,
            num_images=job.num_images,
            description=job.description,
            progress_completed=job.progress_completed,
            progress_total=job.progress_total,
            zip_ready=bool(job.zip_path),
            campaign_id=job.campaign_id,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )
        for job in jobs
    ]


def _to_status_out(job: BatchJob) -> BatchJobStatusOut:
    # Only images that cleared quality_pass_threshold are handed to the user
    # — a failing image's row still exists (see batch_tasks.py) for
    # cost/debugging history, but is never surfaced here or in the ZIP, so
    # the delivered set may be smaller than num_images when some fail.
    images = [
        GeneratedImageOut(
            id=img.id,
            design_filename=img.design_filename,
            pose_filename=img.pose_filename,
            variation=img.variation,
            prompt_used=img.prompt_used,
            score=img.score,
            score_breakdown=img.score_breakdown,
            passed=img.passed,
            attempts=img.attempts,
            status=img.status,
            image_url=f"/media/generated/{job.id}/{Path(img.generated_path).name}" if img.generated_path else None,
        )
        for img in job.images
        if img.passed
    ]
    return BatchJobStatusOut(
        job_id=job.id,
        status=job.status,
        pairing_mode=job.pairing_mode,
        num_images=job.num_images,
        description=job.description,
        image_width=job.image_width,
        image_height=job.image_height,
        progress_completed=job.progress_completed,
        progress_total=job.progress_total,
        zip_ready=bool(job.zip_path),
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at,
        campaign_id=job.campaign_id,
        images=images,
    )


@router.get("/{job_id}", response_model=BatchJobStatusOut)
def get_batch_job(
    job_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> BatchJobStatusOut:
    job = _get_owned_batch_job(db, job_id, user_id)
    return _to_status_out(job)


@router.post("/{job_id}/cancel", response_model=BatchJobCancelResponse)
def cancel_batch_job(
    job_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> BatchJobCancelResponse:
    job = _get_owned_batch_job(db, job_id, user_id)
    if job.status in {"completed", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail=f"Batch job is already {job.status}")

    job.status = "cancelled"
    if not job.error_message:
        job.error_message = "Image generation was cancelled by the user."

    for image in job.images:
        if image.status in {"pending", "generating"}:
            image.status = "cancelled"

    db.commit()
    return BatchJobCancelResponse(
        job_id=job.id,
        status=job.status,
        message="Batch image generation cancelled.",
    )


@router.get("/{job_id}/download")
def download_batch_job(
    job_id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user_id: str = Depends(get_current_user_id),
) -> FileResponse:
    job = _get_owned_batch_job(db, job_id, user_id)
    if not job.zip_path:
        raise HTTPException(status_code=409, detail="Export is not ready yet")
    zip_path = StorageService(settings).ensure_local(Path(job.zip_path))
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Export file is missing")
    return FileResponse(zip_path, media_type="application/zip", filename=f"{job_id}.zip")


def _is_referenced_by_scheduled_posts(db: Session, job: BatchJob) -> bool:
    image_ids = {img.id for img in job.images}
    posts = db.query(ScheduledPost).filter(ScheduledPost.user_id == job.user_id).all()
    return any(post.batch_job_id == job.id or image_ids & set(post.resolved_image_ids()) for post in posts)


@router.delete("/{job_id}")
def delete_batch_job(
    job_id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    job = _get_owned_batch_job(db, job_id, user_id)
    if job.status in {"pending", "processing"}:
        raise HTTPException(status_code=409, detail="Cancel this job before deleting it")
    if _is_referenced_by_scheduled_posts(db, job):
        raise HTTPException(
            status_code=409,
            detail="This job has scheduled posts using its images — delete those posts first",
        )

    # Purges the local files and their Cloudinary copies (uploads, generated
    # images, ZIP export) before dropping the row — see storage_service.py's
    # cleanup_job. GeneratedImage rows cascade-delete via the ORM relationship.
    StorageService(settings).cleanup_job(job.id)
    db.delete(job)
    db.commit()
    return {"ok": True}
