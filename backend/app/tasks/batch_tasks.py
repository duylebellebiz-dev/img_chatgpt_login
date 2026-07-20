from concurrent.futures import CancelledError, Future, ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.database import SessionLocal
from app.models.db_models import BatchJob, GeneratedImage
from app.models.schemas import PairingMode
from app.services.agent_service import AgentService
from app.services.image_service import ImageService
from app.services.pairing_service import PairAssignment, build_pairs
from app.services.quality_service import QualityGateCancelled, QualityResult, QualityService
from app.services.storage_service import StorageService


def _refresh_job(db, job_id: str) -> BatchJob | None:
    db.expire_all()
    return db.get(BatchJob, job_id)


def _job_allows_processing_isolated(job_id: str) -> bool:
    """Cancellation check safe to call from a worker thread: opens and closes
    its own session rather than touching the main thread's `db`, since a
    SQLAlchemy Session is not safe to share across threads."""
    session = SessionLocal()
    try:
        job = session.get(BatchJob, job_id)
        return bool(job is not None and job.status != "cancelled")
    finally:
        session.close()


@dataclass
class _ImageOutcome:
    image_id: str
    prompt: str
    result: QualityResult | None
    cancelled: bool


def _generate_one(
    job_id: str,
    description: str,
    image_width: int | None,
    image_height: int | None,
    image_id: str,
    assignment: PairAssignment,
    design_path: Path,
    pose_path: Path,
    out_path: Path,
    agent: AgentService,
    image_service: ImageService,
    quality: QualityService,
) -> _ImageOutcome:
    """Runs entirely off the main thread's DB session: builds the prompt, then
    generates+scores (with retries) via the quality gate. No database access
    happens here except the isolated cancellation check inside the gate."""
    prompt = agent.build_prompt(
        description,
        assignment.design,
        assignment.pose,
        assignment.variation,
        width=image_width,
        height=image_height,
    )
    try:
        result = quality.generate_with_quality_gate(
            image_service=image_service,
            design_path=design_path,
            pose_path=pose_path,
            prompt=prompt,
            out_path=out_path,
            variation=assignment.variation,
            should_continue=lambda: _job_allows_processing_isolated(job_id),
            width=image_width,
            height=image_height,
        )
        return _ImageOutcome(image_id=image_id, prompt=prompt, result=result, cancelled=False)
    except QualityGateCancelled as exc:
        return _ImageOutcome(image_id=image_id, prompt=prompt, result=exc.result, cancelled=True)


def process_batch_job(job_id: str) -> None:
    settings = get_settings()
    db = SessionLocal()
    storage = StorageService(settings)
    agent = AgentService(settings)
    image_service = ImageService(settings)
    quality = QualityService(settings)

    try:
        job = db.get(BatchJob, job_id)
        if job is None:
            return
        if job.status == "cancelled":
            return

        job.status = "processing"
        job.error_message = None
        db.commit()

        design_names = [Path(p).name for p in job.design_paths]
        pose_names = [Path(p).name for p in job.pose_paths]
        design_by_name = {Path(p).name: Path(p) for p in job.design_paths}
        pose_by_name = {Path(p).name: Path(p) for p in job.pose_paths}

        assignments = build_pairs(
            designs=design_names,
            poses=pose_names,
            mode=PairingMode(job.pairing_mode),
            count=job.num_images,
            min_count=settings.batch_min_images,
            max_count=settings.batch_max_images,
        )

        job.progress_total = len(assignments)
        job.progress_completed = 0
        db.commit()

        # Snapshot the plain values each worker needs up front — ORM objects
        # bound to `db` must never be touched from another thread.
        description = job.description
        image_width = job.image_width
        image_height = job.image_height

        pending: list[tuple[str, PairAssignment]] = []
        for assignment in assignments:
            image = GeneratedImage(
                batch_job_id=job.id,
                design_filename=assignment.design,
                pose_filename=assignment.pose,
                original_design_path=str(design_by_name[assignment.design]),
                original_pose_path=str(pose_by_name[assignment.pose]),
                variation=assignment.variation,
                status="generating",
            )
            db.add(image)
            db.commit()
            db.refresh(image)
            pending.append((image.id, assignment))

        generated_paths: list[Path] = []
        job_cancelled = False

        max_workers = max(1, min(settings.batch_concurrency, len(pending) or 1))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures: dict[Future, str] = {}
            for image_id, assignment in pending:
                out_path = storage.generated_image_path(job.id, image_id)
                future = executor.submit(
                    _generate_one,
                    job_id,
                    description,
                    image_width,
                    image_height,
                    image_id,
                    assignment,
                    design_by_name[assignment.design],
                    pose_by_name[assignment.pose],
                    out_path,
                    agent,
                    image_service,
                    quality,
                )
                futures[future] = image_id

            for future in as_completed(futures):
                image_id = futures[future]
                try:
                    outcome = future.result()
                except CancelledError:
                    # Never started because we cancelled it after an earlier
                    # image detected cancellation — its row is still "generating".
                    image = db.get(GeneratedImage, image_id)
                    image.passed = False
                    image.status = "cancelled"
                    job_cancelled = True
                    db.commit()
                    continue
                image = db.get(GeneratedImage, outcome.image_id)
                image.prompt_used = outcome.prompt
                if outcome.result is not None:
                    image.generated_path = str(outcome.result.image_path)
                    image.score = outcome.result.overall
                    image.score_breakdown = outcome.result.breakdown
                    image.passed = outcome.result.passed
                    image.attempts = outcome.result.attempt

                if outcome.cancelled:
                    image.passed = False
                    image.status = "cancelled"
                    job_cancelled = True
                    for other_future in futures:
                        other_future.cancel()
                else:
                    # The DB row (and its last-attempt file on disk) is kept even
                    # for a failing image, for cost/debugging history — but a
                    # failing image is never uploaded or handed to the user: only
                    # images that clear quality_pass_threshold are surfaced via
                    # the API or included in the ZIP export. See
                    # _to_status_out in routers/batch.py for the matching filter.
                    # progress_completed still counts every attempted image
                    # (pass or fail) so the progress bar reaches num_images.
                    image.status = "passed" if outcome.result.passed else "needs_review"
                    if outcome.result.passed:
                        storage.upload(outcome.result.image_path)
                        generated_paths.append(outcome.result.image_path)
                    job.progress_completed += 1
                db.commit()

        if job_cancelled:
            job = _refresh_job(db, job_id)
            if job is not None:
                job.status = "cancelled"
                job.error_message = "Image generation was cancelled by the user."
                db.commit()
            return

        job = _refresh_job(db, job_id)
        if job is None or job.status == "cancelled":
            if job is not None:
                job.error_message = "Image generation was cancelled by the user."
                db.commit()
            return

        zip_path = storage.build_zip(job.id, generated_paths)
        job.zip_path = str(zip_path)
        job.status = "completed"
        job.error_message = None
        db.commit()

    except Exception as exc:  # noqa: BLE001 - surface any failure onto the job row
        job = db.get(BatchJob, job_id)
        if job is not None:
            job.status = "failed"
            job.error_message = str(exc)
            db.commit()
        raise
    finally:
        db.close()
