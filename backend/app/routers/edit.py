from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models.db_models import EditJob, ImageEdit
from app.models.schemas import (
    EditJobCancelResponse,
    EditJobCreateResponse,
    EditJobStatusOut,
    ImageEditResponse,
)
from app.services import branding_service
from app.services.agent_service import AgentService
from app.services.auth_service import get_current_user_id
from app.services.image_service import ImageService
from app.services.media_utils import apply_watermark, validate_size
from app.services.storage_service import StorageService
from app.tasks.edit_tasks import process_edit_job

router = APIRouter(prefix="/api/edit", tags=["edit"])


def _get_owned_edit_job(db: Session, job_id: str, user_id: str) -> EditJob:
    job = db.get(EditJob, job_id)
    if job is None or job.user_id != user_id:
        raise HTTPException(status_code=404, detail="Edit job not found")
    return job


def _owning_job_path_prefix(edit: ImageEdit) -> str:
    """Storage folder key: the standalone single-edit flow uses edit.id as
    its own storage key, while batch EditJob rows share one folder per job
    (edit_job_id) — see save_upload/generated_image_path call sites."""
    return edit.edit_job_id or edit.id


def _to_out(edit: ImageEdit) -> ImageEditResponse:
    return ImageEditResponse(
        id=edit.id,
        status=edit.status,
        prompt=edit.prompt,
        prompt_used=edit.prompt_used,
        image_width=edit.image_width,
        image_height=edit.image_height,
        original_image_url=(
            f"/media/original/{_owning_job_path_prefix(edit)}/upload/{Path(edit.original_path).name}"
            if edit.original_path
            else None
        ),
        image_url=(
            f"/media/generated/{edit.edit_job_id or edit.id}/{Path(edit.generated_path).name}"
            if edit.generated_path
            else None
        ),
        error_message=edit.error_message,
        created_at=edit.created_at,
        updated_at=edit.updated_at,
    )


def _to_job_out(job: EditJob) -> EditJobStatusOut:
    return EditJobStatusOut(
        job_id=job.id,
        status=job.status,
        prompt=job.prompt,
        image_width=job.image_width,
        image_height=job.image_height,
        apply_logo=job.apply_logo,
        progress_completed=job.progress_completed,
        progress_total=job.progress_total,
        zip_ready=bool(job.zip_path),
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at,
        edits=[_to_out(e) for e in job.edits],
    )


@router.post("", response_model=ImageEditResponse, status_code=201)
def create_image_edit(
    prompt: str = Form(...),
    image: UploadFile = File(...),
    image_width: int | None = Form(None),
    image_height: int | None = Form(None),
    apply_logo: bool = Form(False),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user_id: str = Depends(get_current_user_id),
) -> ImageEditResponse:
    prompt = prompt.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="Edit instruction (prompt) is required")

    try:
        validate_size(image_width, image_height)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if apply_logo and branding_service.get_logo_path(db, user_id) is None:
        raise HTTPException(status_code=422, detail="No salon logo has been uploaded yet")

    storage = StorageService(settings)
    agent = AgentService(settings)
    image_service = ImageService(settings)

    edit = ImageEdit(
        user_id=user_id,
        prompt=prompt,
        original_filename=image.filename or "upload",
        image_width=image_width,
        image_height=image_height,
    )
    db.add(edit)
    db.flush()

    try:
        original_path = storage.save_upload(edit.id, "upload", image)
        edit.original_path = str(original_path)

        prompt_used = agent.refine_edit_prompt(prompt, original_path.name, width=image_width, height=image_height)
        edit.prompt_used = prompt_used

        out_path = storage.generated_image_path(edit.id, edit.id)
        generated_path, _ = image_service.edit_image(
            original_path, prompt_used, out_path, width=image_width, height=image_height
        )

        if apply_logo:
            logo_path = branding_service.get_logo_path(db, user_id)
            if logo_path is not None:
                apply_watermark(generated_path, logo_path)

        storage.upload(generated_path)
        edit.generated_path = str(generated_path)
        edit.status = "completed"
        db.commit()
        db.refresh(edit)
    except Exception as exc:
        db.rollback()
        storage.cleanup_job(edit.id)
        raise HTTPException(status_code=502, detail=f"Failed to edit image: {exc}") from exc

    return _to_out(edit)


@router.post("/batch", response_model=EditJobCreateResponse, status_code=201)
def create_edit_batch_job(
    background_tasks: BackgroundTasks,
    prompt: str = Form(...),
    images: list[UploadFile] = File(...),
    image_width: int | None = Form(None),
    image_height: int | None = Form(None),
    apply_logo: bool = Form(False),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user_id: str = Depends(get_current_user_id),
) -> EditJobCreateResponse:
    prompt = prompt.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="Edit instruction (prompt) is required")
    if not images:
        raise HTTPException(status_code=422, detail="At least one photo is required")
    if not (settings.batch_min_images <= len(images) <= settings.batch_max_images):
        raise HTTPException(
            status_code=422,
            detail=f"Number of photos must be between {settings.batch_min_images} and {settings.batch_max_images}",
        )

    try:
        validate_size(image_width, image_height)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if apply_logo and branding_service.get_logo_path(db, user_id) is None:
        raise HTTPException(status_code=422, detail="No salon logo has been uploaded yet")

    storage = StorageService(settings)
    job = EditJob(
        user_id=user_id,
        prompt=prompt,
        image_width=image_width,
        image_height=image_height,
        apply_logo=apply_logo,
        status="pending",
        progress_total=len(images),
    )

    try:
        db.add(job)
        db.flush()

        for image in images:
            original_path = storage.save_upload(job.id, "upload", image)
            db.add(
                ImageEdit(
                    user_id=user_id,
                    edit_job_id=job.id,
                    prompt=prompt,
                    original_filename=image.filename or "upload",
                    original_path=str(original_path),
                    image_width=image_width,
                    image_height=image_height,
                    status="generating",
                )
            )

        db.commit()
        db.refresh(job)
    except Exception:
        db.rollback()
        if job.id:
            storage.cleanup_job(job.id)
        raise

    background_tasks.add_task(process_edit_job, job.id)

    return EditJobCreateResponse(job_id=job.id, status=job.status, progress_total=job.progress_total)


@router.get("/batch/{job_id}", response_model=EditJobStatusOut)
def get_edit_batch_job(
    job_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> EditJobStatusOut:
    job = _get_owned_edit_job(db, job_id, user_id)
    return _to_job_out(job)


@router.post("/batch/{job_id}/cancel", response_model=EditJobCancelResponse)
def cancel_edit_batch_job(
    job_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> EditJobCancelResponse:
    job = _get_owned_edit_job(db, job_id, user_id)
    if job.status in {"completed", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail=f"Edit job is already {job.status}")

    job.status = "cancelled"
    if not job.error_message:
        job.error_message = "Image editing was cancelled by the user."

    for edit in job.edits:
        if edit.status in {"pending", "generating"}:
            edit.status = "cancelled"

    db.commit()
    return EditJobCancelResponse(job_id=job.id, status=job.status, message="Batch photo editing cancelled.")


@router.get("/batch/{job_id}/download")
def download_edit_batch_job(
    job_id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user_id: str = Depends(get_current_user_id),
) -> FileResponse:
    job = _get_owned_edit_job(db, job_id, user_id)
    if not job.zip_path:
        raise HTTPException(status_code=409, detail="Export is not ready yet")
    zip_path = StorageService(settings).ensure_local(Path(job.zip_path))
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Export file is missing")
    return FileResponse(zip_path, media_type="application/zip", filename=f"{job_id}.zip")


@router.get("/{edit_id}", response_model=ImageEditResponse)
def get_image_edit(
    edit_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> ImageEditResponse:
    edit = db.get(ImageEdit, edit_id)
    if edit is None or edit.user_id != user_id:
        raise HTTPException(status_code=404, detail="Image edit not found")
    return _to_out(edit)
