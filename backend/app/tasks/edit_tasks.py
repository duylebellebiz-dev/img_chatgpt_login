"""Batch photo edit — applies the same edit instruction to every uploaded
photo in an EditJob. Mirrors batch_tasks.py's bounded-concurrency pattern
(image edits are the same I/O-bound Claude+ChatGPT round trips), but has no
Quality Agent retry loop: edits are one-shot, matching the existing single-
photo edit endpoint's behavior.
"""

from concurrent.futures import CancelledError, Future, ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.database import SessionLocal
from app.models.db_models import EditJob, ImageEdit
from app.services import branding_service
from app.services.agent_service import AgentService
from app.services.image_service import ImageService
from app.services.media_utils import apply_watermark
from app.services.storage_service import StorageService


def _refresh_job(db, job_id: str) -> EditJob | None:
    db.expire_all()
    return db.get(EditJob, job_id)


def _job_allows_processing_isolated(job_id: str) -> bool:
    """Safe to call from a worker thread: opens/closes its own session rather
    than touching the main thread's `db` (see batch_tasks.py for the same
    pattern and why — SQLAlchemy Sessions aren't thread-safe)."""
    session = SessionLocal()
    try:
        job = session.get(EditJob, job_id)
        return bool(job is not None and job.status != "cancelled")
    finally:
        session.close()


@dataclass
class _EditOutcome:
    edit_id: str
    prompt_used: str | None
    generated_path: Path | None
    cancelled: bool
    error: str | None


def _edit_one(
    job_id: str,
    prompt: str,
    image_width: int | None,
    image_height: int | None,
    provider: str | None,
    edit_id: str,
    original_path: Path,
    out_path: Path,
    agent: AgentService,
    image_service: ImageService,
    logo_path: Path | None,
) -> _EditOutcome:
    if not _job_allows_processing_isolated(job_id):
        return _EditOutcome(edit_id, prompt_used=None, generated_path=None, cancelled=True, error=None)

    try:
        prompt_used = agent.refine_edit_prompt(prompt, original_path.name, width=image_width, height=image_height)
        if not _job_allows_processing_isolated(job_id):
            return _EditOutcome(edit_id, prompt_used=prompt_used, generated_path=None, cancelled=True, error=None)

        generated_path, _ = image_service.edit_image(
            original_path, prompt_used, out_path, width=image_width, height=image_height, provider=provider
        )
        if logo_path is not None:
            apply_watermark(generated_path, logo_path)
        return _EditOutcome(edit_id, prompt_used=prompt_used, generated_path=generated_path, cancelled=False, error=None)
    except Exception as exc:  # noqa: BLE001 - one bad image shouldn't sink the whole batch
        return _EditOutcome(edit_id, prompt_used=None, generated_path=None, cancelled=False, error=str(exc))


def process_edit_job(job_id: str) -> None:
    settings = get_settings()
    db = SessionLocal()
    storage = StorageService(settings)
    agent = AgentService(settings)
    image_service = ImageService(settings)

    try:
        job = db.get(EditJob, job_id)
        if job is None:
            return
        if job.status == "cancelled":
            return

        job.status = "processing"
        job.error_message = None
        db.commit()

        # Rows are created by the router at upload time (one per uploaded photo).
        pending: list[tuple[str, Path]] = [(e.id, Path(e.original_path)) for e in job.edits]

        prompt = job.prompt
        image_width = job.image_width
        image_height = job.image_height
        # None falls through to ImageService's own settings.image_provider
        # default (see resolve_provider) — don't hardcode "agy" here, or a
        # test/deployment default of "mock" would get silently overridden.
        provider = job.provider
        logo_path = branding_service.get_logo_path(db, job.user_id) if job.apply_logo else None

        generated_paths: list[Path] = []
        job_cancelled = False

        max_workers = max(1, min(settings.batch_concurrency, len(pending) or 1))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures: dict[Future, str] = {}
            for edit_id, original_path in pending:
                out_path = storage.generated_image_path(job.id, edit_id)
                future = executor.submit(
                    _edit_one,
                    job_id,
                    prompt,
                    image_width,
                    image_height,
                    provider,
                    edit_id,
                    original_path,
                    out_path,
                    agent,
                    image_service,
                    logo_path,
                )
                futures[future] = edit_id

            for future in as_completed(futures):
                edit_id = futures[future]
                try:
                    outcome = future.result()
                except CancelledError:
                    image = db.get(ImageEdit, edit_id)
                    image.status = "cancelled"
                    job_cancelled = True
                    db.commit()
                    continue

                image = db.get(ImageEdit, outcome.edit_id)
                if outcome.prompt_used is not None:
                    image.prompt_used = outcome.prompt_used

                if outcome.cancelled:
                    image.status = "cancelled"
                    job_cancelled = True
                    for other_future in futures:
                        other_future.cancel()
                elif outcome.error is not None:
                    image.status = "failed"
                    image.error_message = outcome.error
                    job.progress_completed += 1
                else:
                    image.generated_path = str(outcome.generated_path)
                    image.status = "completed"
                    storage.upload(outcome.generated_path)
                    generated_paths.append(outcome.generated_path)
                    job.progress_completed += 1
                db.commit()

        if job_cancelled:
            job = _refresh_job(db, job_id)
            if job is not None:
                job.status = "cancelled"
                job.error_message = "Image editing was cancelled by the user."
                db.commit()
            return

        job = _refresh_job(db, job_id)
        if job is None or job.status == "cancelled":
            if job is not None:
                job.error_message = "Image editing was cancelled by the user."
                db.commit()
            return

        if generated_paths:
            zip_path = storage.build_zip(job.id, generated_paths)
            job.zip_path = str(zip_path)
        job.status = "completed"
        job.error_message = None
        db.commit()

    except Exception as exc:  # noqa: BLE001 - surface any failure onto the job row
        job = db.get(EditJob, job_id)
        if job is not None:
            job.status = "failed"
            job.error_message = str(exc)
            db.commit()
        raise
    finally:
        db.close()
