import logging
import threading
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

logger = logging.getLogger(__name__)


def _refresh_job(db, job_id: str) -> BatchJob | None:
    db.expire_all()
    return db.get(BatchJob, job_id)


def _job_allows_processing_isolated(job_id: str) -> bool:
    """Cancellation/pause check safe to call from a worker thread: opens and
    closes its own session rather than touching the main thread's `db`,
    since a SQLAlchemy Session is not safe to share across threads. "paused"
    stops generation the same cooperative way "cancelled" does — the
    difference is handled by the caller (process_batch_job), which leaves a
    paused image's row as "generating" instead of marking it "cancelled" so
    /resume can pick it back up."""
    session = SessionLocal()
    try:
        job = session.get(BatchJob, job_id)
        return bool(job is not None and job.status not in ("cancelled", "paused"))
    finally:
        session.close()


def _job_status_isolated(job_id: str) -> str | None:
    """One-off status read from a worker/main-thread-adjacent context — see
    _job_allows_processing_isolated for why this opens its own session."""
    session = SessionLocal()
    try:
        job = session.get(BatchJob, job_id)
        return job.status if job is not None else None
    finally:
        session.close()


def _record_provider_job_ref(image_id: str, job_ref: str) -> None:
    """Persists a "gemini_batch_api" job's Google-side name onto its
    GeneratedImage row the moment submission succeeds — before the
    (potentially long) poll starts — so a restart mid-poll can reconnect to
    it instead of losing it. Own isolated session: called from a worker
    thread, same reasoning as _job_allows_processing_isolated."""
    session = SessionLocal()
    try:
        image = session.get(GeneratedImage, image_id)
        if image is not None:
            image.provider_job_ref = job_ref
            session.commit()
    except Exception:  # noqa: BLE001 - best-effort; losing this must not fail generation
        logger.exception("Failed to record provider_job_ref for image=%s", image_id)
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
    provider: str | None,
    image_id: str,
    assignment: PairAssignment,
    design_path: Path,
    pose_path: Path,
    out_path: Path,
    agent: AgentService,
    image_service: ImageService,
    quality: QualityService,
    resume_job_ref: str | None = None,
) -> _ImageOutcome:
    """Runs entirely off the main thread's DB session: builds the prompt, then
    generates+scores (with retries) via the quality gate. No database access
    happens here except the isolated cancellation check inside the gate and
    the on_job_submitted callback below (both open their own session).
    resume_job_ref, when set, is a previously-submitted Gemini Batch API job
    to reconnect to — see process_batch_job's resume path."""
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
            provider=provider,
            resume_job_ref=resume_job_ref,
            on_job_submitted=lambda job_ref: _record_provider_job_ref(image_id, job_ref),
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

        design_by_name = {Path(p).name: Path(p) for p in job.design_paths}
        pose_by_name = {Path(p).name: Path(p) for p in job.pose_paths}

        # A GeneratedImage row already existing for this job means we're
        # resuming one interrupted by an earlier process dying mid-run (see
        # main.py's startup recovery) rather than starting fresh. Reuse
        # those rows' assignments as-is instead of re-running build_pairs —
        # "random" pairing mode has no fixed seed, so calling it again here
        # would reshuffle the assignments and desync them from the rows
        # already created (and, for already-finished rows, from the images
        # already generated on disk).
        existing_images = db.query(GeneratedImage).filter(GeneratedImage.batch_job_id == job.id).all()

        pending: list[tuple[str, PairAssignment, str | None]] = []
        generated_paths: list[Path] = []
        if existing_images:
            for image in existing_images:
                if image.status == "generating":
                    assignment = PairAssignment(
                        design=image.design_filename, pose=image.pose_filename, variation=image.variation
                    )
                    pending.append((image.id, assignment, image.provider_job_ref))
                elif image.status == "passed" and image.generated_path:
                    generated_paths.append(Path(image.generated_path))
            job.progress_total = len(existing_images)
            job.progress_completed = len(existing_images) - len(pending)
        else:
            design_names = [Path(p).name for p in job.design_paths]
            pose_names = [Path(p).name for p in job.pose_paths]
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
                pending.append((image.id, assignment, None))
        db.commit()

        # Snapshot the plain values each worker needs up front — ORM objects
        # bound to `db` must never be touched from another thread.
        description = job.description
        image_width = job.image_width
        image_height = job.image_height
        # None falls through to ImageService's own settings.image_provider
        # default (see resolve_provider) — don't hardcode "agy" here, or a
        # test/deployment default of "mock" would get silently overridden.
        provider = job.provider

        job_cancelled = False
        job_paused = False

        max_workers = max(1, min(settings.batch_concurrency, len(pending) or 1))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures: dict[Future, str] = {}
            for image_id, assignment, resume_job_ref in pending:
                try:
                    design_path = design_by_name[assignment.design]
                    pose_path = pose_by_name[assignment.pose]
                except KeyError as exc:
                    # A single unresolvable reference used to abort this whole
                    # loop, discarding every future already submitted (their
                    # generations kept running in the background — the
                    # ThreadPoolExecutor `with` block waits for them on exit
                    # — but this loop never reached the result-processing
                    # loop below, so none of that work ever got saved: those
                    # rows stayed "generating" forever and the job died for
                    # every other image too). Skip just this one instead.
                    logger.error(
                        "Batch job %s: could not resolve reference image %s for "
                        "image=%s — marking this image failed instead of "
                        "aborting the whole job.",
                        job_id,
                        exc,
                        image_id,
                        exc_info=True,
                    )
                    image = db.get(GeneratedImage, image_id)
                    if image is not None:
                        image.status = "needs_review"
                        image.passed = False
                        image.prompt_used = f"Skipped: reference image not found ({exc})"
                        job.progress_completed += 1
                        db.commit()
                    continue
                out_path = storage.generated_image_path(job.id, image_id)
                future = executor.submit(
                    _generate_one,
                    job_id,
                    description,
                    image_width,
                    image_height,
                    provider,
                    image_id,
                    assignment,
                    design_path,
                    pose_path,
                    out_path,
                    agent,
                    image_service,
                    quality,
                    resume_job_ref,
                )
                futures[future] = image_id

            for future in as_completed(futures):
                image_id = futures[future]
                try:
                    outcome = future.result()
                except CancelledError:
                    # Never started because we cancelled it after an earlier
                    # image detected cancellation/pause — its row is still
                    # "generating". On pause, leave it that way (see below);
                    # on cancel, mark it "cancelled" as before.
                    if _job_status_isolated(job_id) == "paused":
                        job_paused = True
                    else:
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
                    if _job_status_isolated(job_id) == "paused":
                        # Leave this row's status as "generating" (its
                        # default, untouched here) instead of "cancelled" —
                        # /resume re-queues anything still "generating", the
                        # same recovery path used for a job orphaned by a
                        # backend restart (see process_batch_job's docstring
                        # comment above the `existing_images` query).
                        job_paused = True
                    else:
                        image.passed = False
                        image.status = "cancelled"
                        job_cancelled = True
                    for other_future in futures:
                        other_future.cancel()
                else:
                    # The DB row (and its last-attempt file on disk) is kept even
                    # for a failing image, for cost/debugging history. For
                    # gemini_batch_api specifically (0 auto-retries, see
                    # QualityService._resolve_retry_budgets), a failing image
                    # is exported anyway as long as its score clears
                    # quality_hard_failure_threshold — that setting already
                    # marks the line between "clearly broken" (compositing
                    # copy / watermark / extra hand, capped low by
                    # _VISION_RUBRIC's hard-defect rule) and "just didn't
                    # clear the bar but is a real, usable photo" — so a human
                    # can review and pick from what's in the ZIP instead of
                    # every miss being silently discarded. Every other
                    # provider still only exports on a full pass — it gets an
                    # automatic retry first, so a miss there is a genuine
                    # failure, not a "human should judge it" case. See
                    # _to_status_out in routers/batch.py for the matching
                    # images-list filter. progress_completed still counts
                    # every attempted image (pass or fail) so the progress
                    # bar reaches num_images.
                    image.status = "passed" if outcome.result.passed else "needs_review"
                    should_export = outcome.result.passed or (
                        provider == "gemini_batch_api"
                        and outcome.result.overall > settings.quality_hard_failure_threshold
                    )
                    if should_export:
                        storage.upload(outcome.result.image_path)
                        generated_paths.append(outcome.result.image_path)
                    job.progress_completed += 1
                db.commit()

        if job_paused:
            # job.status is already "paused" (set by the /pause endpoint) —
            # leave it as-is rather than overwriting it to "cancelled" or
            # "completed". Whatever's left in "generating" gets picked up
            # again the next time /resume calls this function.
            return

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


def resume_orphaned_batch_jobs() -> None:
    """Called once at app startup (see main.py's lifespan, gated behind
    settings.resume_orphaned_batch_jobs_on_startup). A BatchJob still marked
    "processing" at this point was being run by a now-dead process — the
    process that would ever move it out of "processing" no longer exists,
    so it's orphaned, not actually in progress. Reprocessing it is safe:
    process_batch_job resumes from the GeneratedImage rows already
    persisted (and recovers any in-flight Gemini Batch API job) instead of
    starting the whole job over."""
    db = SessionLocal()
    try:
        orphaned_ids = [job.id for job in db.query(BatchJob).filter(BatchJob.status == "processing").all()]
    finally:
        db.close()

    for job_id in orphaned_ids:
        logger.info("Resuming orphaned batch job %s after restart", job_id)
        threading.Thread(target=process_batch_job, args=(job_id,), daemon=True).start()
