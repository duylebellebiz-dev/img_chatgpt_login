"""Covers the Image Quality Agent's retry/threshold behavior end to end
through the actual process_batch_job function body (called directly, no
background task runner needed) since that's the highest-risk part of the
pipeline: a bug here either loops forever burning API cost, or silently
drops images so the delivered count no longer matches what the user asked
for.
"""

import zipfile

import pytest


@pytest.fixture
def db_session():
    from app.database import Base, SessionLocal, engine

    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def settings_override(monkeypatch):
    """Clears the lru_cache'd Settings before and after each test so threshold
    overrides here can't leak into other tests that call get_settings()."""
    from app.config import get_settings

    def _apply(**env):
        for key, value in env.items():
            monkeypatch.setenv(key.upper(), str(value))
        get_settings.cache_clear()
        return get_settings()

    yield _apply
    get_settings.cache_clear()


def _make_job(db_session, tiny_png_bytes, tmp_path, num_images=3):
    from app.models.db_models import BatchJob

    design = tmp_path / "design.png"
    pose = tmp_path / "pose.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)

    job = BatchJob(
        pairing_mode="cross",
        num_images=num_images,
        description="luxury summer nail",
        status="pending",
        design_paths=[str(design)],
        pose_paths=[str(pose)],
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return job


def test_unreachable_threshold_discards_failing_images_from_zip_but_keeps_db_row(
    db_session, tiny_png_bytes, tmp_path, settings_override
):
    """A failing image is never handed to the user (not in the ZIP), but its
    row is kept for cost/debugging history — see batch_tasks.py."""
    from app.models.db_models import BatchJob, GeneratedImage
    from app.tasks.batch_tasks import process_batch_job

    settings_override(quality_pass_threshold=101, quality_max_retries=1)  # never passes
    job = _make_job(db_session, tiny_png_bytes, tmp_path, num_images=3)

    process_batch_job(job.id)  # calling the task directly runs it in-process

    db_session.refresh(job)
    images = db_session.query(GeneratedImage).filter_by(batch_job_id=job.id).all()

    assert job.status == "completed"
    assert job.progress_completed == job.num_images == 3
    assert len(images) == 3  # DB rows kept for audit even though nothing passed
    for img in images:
        assert img.status == "needs_review"
        assert img.passed is False
        assert img.attempts == 1 + 1  # 1 initial + quality_max_retries(1)
        assert img.generated_path is not None  # last attempt's file is kept on disk

    with zipfile.ZipFile(job.zip_path) as zf:
        assert len(zf.namelist()) == 0  # nothing passed -> nothing delivered


def test_reachable_threshold_marks_passed(db_session, tiny_png_bytes, tmp_path, settings_override):
    from app.models.db_models import GeneratedImage
    from app.tasks.batch_tasks import process_batch_job

    settings_override(
        quality_pass_threshold=0, quality_max_retries=3, quality_fidelity_floor=0
    )  # always passes on attempt 1
    job = _make_job(db_session, tiny_png_bytes, tmp_path, num_images=2)

    process_batch_job(job.id)

    db_session.refresh(job)
    images = db_session.query(GeneratedImage).filter_by(batch_job_id=job.id).all()

    assert job.status == "completed"
    assert len(images) == 2
    for img in images:
        assert img.status == "passed"
        assert img.passed is True
        assert img.attempts == 1


def test_gemini_batch_api_still_exports_a_failing_image_above_hard_failure_threshold(
    db_session, tiny_png_bytes, tmp_path, settings_override, monkeypatch
):
    """gemini_batch_api runs with 0 auto-retries, so a failing image is a
    dead end — unlike other providers (see
    test_unreachable_threshold_discards_failing_images_from_zip_but_keeps_db_row),
    it still gets exported to the ZIP as long as its score clears
    quality_hard_failure_threshold, so a human can review/pick from it
    instead of every miss being silently discarded."""
    from app.models.db_models import GeneratedImage
    from app.services.image_service import ImageService
    from app.tasks.batch_tasks import process_batch_job

    settings_override(
        quality_pass_threshold=101,  # never passes
        quality_max_retries=0,
        quality_hard_failure_threshold=30,  # mock scores are always 65-100 (see _mock_score), well above this
    )
    job = _make_job(db_session, tiny_png_bytes, tmp_path, num_images=2)
    job.provider = "gemini_batch_api"
    db_session.commit()

    # Different from design.png/pose.png's bytes (both write tiny_png_bytes,
    # see _make_job) so is_near_duplicate_image doesn't flag this as an
    # unedited copy of a reference and fail it before scoring — same
    # technique as test_resume_recovers_gemini_batch_api_job_instead_of_resubmitting.
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (4, 4), color=(0, 255, 0)).save(buf, format="PNG")
    generated_bytes = buf.getvalue()

    def fake_generate(self, design_path, pose_path, prompt, variation, out_path, **kwargs):
        out_path.write_bytes(generated_bytes)
        return out_path, "image/png"

    monkeypatch.setattr(ImageService, "generate_image", fake_generate)

    process_batch_job(job.id)

    db_session.refresh(job)
    images = db_session.query(GeneratedImage).filter_by(batch_job_id=job.id).all()

    assert job.status == "completed"
    assert len(images) == 2
    for img in images:
        assert img.status == "needs_review"
        assert img.passed is False
        assert img.score > 30

    with zipfile.ZipFile(job.zip_path) as zf:
        assert len(zf.namelist()) == 2  # exported despite failing, unlike other providers


def test_agy_still_exports_a_failing_image_above_hard_failure_threshold(
    db_session, tiny_png_bytes, tmp_path, settings_override, monkeypatch
):
    """Same fix as gemini_batch_api above (see
    test_gemini_batch_api_still_exports_a_failing_image_above_hard_failure_threshold),
    extended to "agy" (the free Antigravity CLI OAuth provider) and
    "gemini_api" — both routinely ran with 0-2 auto-retries against a strict
    quality_pass_threshold, so nearly every failing image used to be
    silently discarded from both the ZIP and the images list, leaving users
    with an empty export despite a "completed" job."""
    from app.models.db_models import GeneratedImage
    from app.services.image_service import ImageService
    from app.tasks.batch_tasks import process_batch_job

    settings_override(
        quality_pass_threshold=101,  # never passes
        quality_max_retries=0,
        quality_hard_failure_threshold=30,  # mock scores are always 65-100 (see _mock_score), well above this
    )
    job = _make_job(db_session, tiny_png_bytes, tmp_path, num_images=2)
    job.provider = "agy"
    db_session.commit()

    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (4, 4), color=(0, 255, 0)).save(buf, format="PNG")
    generated_bytes = buf.getvalue()

    def fake_generate(self, design_path, pose_path, prompt, variation, out_path, **kwargs):
        out_path.write_bytes(generated_bytes)
        return out_path, "image/png"

    monkeypatch.setattr(ImageService, "generate_image", fake_generate)

    process_batch_job(job.id)

    db_session.refresh(job)
    images = db_session.query(GeneratedImage).filter_by(batch_job_id=job.id).all()

    assert job.status == "completed"
    assert len(images) == 2
    for img in images:
        assert img.status == "needs_review"
        assert img.passed is False
        assert img.score > 30

    with zipfile.ZipFile(job.zip_path) as zf:
        assert len(zf.namelist()) == 2  # exported despite failing, same as gemini_batch_api


def test_cancelled_job_is_not_processed(db_session, tiny_png_bytes, tmp_path, settings_override):
    from app.models.db_models import GeneratedImage
    from app.tasks.batch_tasks import process_batch_job

    settings_override(quality_pass_threshold=0, quality_max_retries=1)
    job = _make_job(db_session, tiny_png_bytes, tmp_path, num_images=2)
    job.status = "cancelled"
    db_session.commit()

    process_batch_job(job.id)

    db_session.refresh(job)
    images = db_session.query(GeneratedImage).filter_by(batch_job_id=job.id).all()

    assert job.status == "cancelled"
    assert job.progress_completed == 0
    assert images == []


def test_cancel_during_quality_retry_stops_before_next_attempt(
    db_session, tiny_png_bytes, tmp_path, settings_override, monkeypatch
):
    from app.database import SessionLocal
    from app.models.db_models import GeneratedImage
    from app.services.quality_service import QualityService
    from app.tasks.batch_tasks import process_batch_job

    settings_override(quality_pass_threshold=101, quality_max_retries=3)
    job = _make_job(db_session, tiny_png_bytes, tmp_path, num_images=1)

    original_score_image = QualityService.score_image

    def cancelling_score(self, image_path, design_path=None, pose_path=None):
        overall, breakdown = original_score_image(self, image_path, design_path, pose_path)
        session = SessionLocal()
        try:
            job_row = session.get(type(job), job.id)
            job_row.status = "cancelled"
            session.commit()
        finally:
            session.close()
        return overall, breakdown

    monkeypatch.setattr(QualityService, "score_image", cancelling_score)

    process_batch_job(job.id)

    db_session.refresh(job)
    images = db_session.query(GeneratedImage).filter_by(batch_job_id=job.id).all()

    assert job.status == "cancelled"
    assert job.progress_completed == 0
    assert len(images) == 1
    assert images[0].status == "cancelled"
    assert images[0].attempts == 1
    assert images[0].generated_path is not None


def test_resume_reuses_existing_generated_image_rows_instead_of_recreating(
    db_session, tiny_png_bytes, tmp_path, settings_override
):
    """Simulates a job interrupted mid-run (backend process died) by
    pre-seeding the exact DB state a partial run would leave: one image
    already "passed", two still "generating". Resuming (calling
    process_batch_job again) must reuse those rows — not build_pairs a
    fresh set — or a "random" pairing job would silently reshuffle and
    desync from images already on disk."""
    from app.models.db_models import BatchJob, GeneratedImage
    from app.tasks.batch_tasks import process_batch_job

    settings_override(quality_pass_threshold=0, quality_max_retries=0, quality_fidelity_floor=0)
    job = _make_job(db_session, tiny_png_bytes, tmp_path, num_images=3)

    already_done_path = tmp_path / "already_done.png"
    already_done_path.write_bytes(tiny_png_bytes)
    finished = GeneratedImage(
        batch_job_id=job.id,
        design_filename="design.png",
        pose_filename="pose.png",
        original_design_path=job.design_paths[0],
        original_pose_path=job.pose_paths[0],
        variation=1,
        status="passed",
        passed=True,
        generated_path=str(already_done_path),
    )
    unfinished_1 = GeneratedImage(
        batch_job_id=job.id,
        design_filename="design.png",
        pose_filename="pose.png",
        original_design_path=job.design_paths[0],
        original_pose_path=job.pose_paths[0],
        variation=2,
        status="generating",
    )
    unfinished_2 = GeneratedImage(
        batch_job_id=job.id,
        design_filename="design.png",
        pose_filename="pose.png",
        original_design_path=job.design_paths[0],
        original_pose_path=job.pose_paths[0],
        variation=3,
        status="generating",
    )
    db_session.add_all([finished, unfinished_1, unfinished_2])
    job.status = "processing"  # as it would be left by a killed process
    db_session.commit()
    finished_id = finished.id

    process_batch_job(job.id)  # resume, not a fresh run

    db_session.refresh(job)
    images = db_session.query(GeneratedImage).filter_by(batch_job_id=job.id).all()

    assert job.status == "completed"
    assert len(images) == 3  # no duplicate rows created for the resumed job
    assert all(img.status == "passed" for img in images)
    # The already-finished row is untouched, not regenerated.
    still_finished = next(img for img in images if img.id == finished_id)
    assert still_finished.generated_path == str(already_done_path)
    assert still_finished.attempts == 0  # never went through _generate_one

    with zipfile.ZipFile(job.zip_path) as zf:
        assert len(zf.namelist()) == 3


def test_resume_recovers_gemini_batch_api_job_instead_of_resubmitting(
    db_session, tiny_png_bytes, tmp_path, settings_override, monkeypatch
):
    """The actual point of persisting provider_job_ref: a resumed image that
    was mid-poll on a Gemini Batch API job reconnects to it instead of
    paying to submit a brand new one."""
    from app.models.db_models import BatchJob, GeneratedImage
    from app.services.image_service import ImageService
    from app.tasks.batch_tasks import process_batch_job

    settings_override(quality_pass_threshold=0, quality_max_retries=0, quality_fidelity_floor=0)
    job = _make_job(db_session, tiny_png_bytes, tmp_path, num_images=1)
    job.provider = "gemini_batch_api"
    unfinished = GeneratedImage(
        batch_job_id=job.id,
        design_filename="design.png",
        pose_filename="pose.png",
        original_design_path=job.design_paths[0],
        original_pose_path=job.pose_paths[0],
        variation=1,
        status="generating",
        provider_job_ref="batches/already-submitted",
    )
    db_session.add(unfinished)
    job.status = "processing"
    db_session.commit()

    recover_calls = []
    # Different from design.png/pose.png's bytes (both write tiny_png_bytes,
    # see _make_job) so is_near_duplicate_image doesn't flag this as an
    # unedited copy of a reference and fail it before scoring.
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (4, 4), color=(0, 255, 0)).save(buf, format="PNG")
    recovered_bytes = buf.getvalue()

    def fake_recover(self, job_ref, out_path, width=None, height=None):
        recover_calls.append(job_ref)
        out_path.write_bytes(recovered_bytes)
        return out_path, "image/png"

    def fail_if_called(self, *a, **kw):
        raise AssertionError("generate_image must not be called — that would be a duplicate submission")

    monkeypatch.setattr(ImageService, "recover_gemini_batch_image", fake_recover)
    monkeypatch.setattr(ImageService, "generate_image", fail_if_called)

    process_batch_job(job.id)  # resume

    db_session.refresh(job)
    images = db_session.query(GeneratedImage).filter_by(batch_job_id=job.id).all()

    assert recover_calls == ["batches/already-submitted"]
    assert job.status == "completed"
    assert images[0].status == "passed"


def test_resume_orphaned_batch_jobs_reprocesses_processing_jobs(db_session, monkeypatch):
    from app.models.db_models import BatchJob
    from app.tasks import batch_tasks

    job = BatchJob(pairing_mode="cross", num_images=1, status="processing", design_paths=[], pose_paths=[])
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    class SyncThread:
        """Runs the target synchronously instead of spawning a real OS
        thread, so the assertion below doesn't race a background thread."""

        def __init__(self, target, args, daemon=None):
            self.target = target
            self.args = args

        def start(self):
            self.target(*self.args)

    calls = []
    # The stub below never actually flips job.status, so restore it after
    # asserting — otherwise this row stays "processing" forever and a later
    # test's global `.filter(status == "processing")` query in this same
    # (persistent, shared across tests) sqlite file would pick it up too.
    monkeypatch.setattr(batch_tasks, "process_batch_job", lambda job_id: calls.append(job_id))
    monkeypatch.setattr(batch_tasks.threading, "Thread", SyncThread)

    try:
        batch_tasks.resume_orphaned_batch_jobs()
        # `in`, not `==`, in case an earlier test's stuck "processing" row
        # is still sitting in this shared sqlite file too.
        assert job.id in calls
    finally:
        job.status = "completed"
        db_session.commit()


def test_resume_orphaned_batch_jobs_ignores_jobs_not_stuck_processing(db_session, monkeypatch):
    from app.models.db_models import BatchJob
    from app.tasks import batch_tasks

    job_ids = []
    for status in ("pending", "completed", "failed", "cancelled"):
        job = BatchJob(pairing_mode="cross", num_images=1, status=status, design_paths=[], pose_paths=[])
        db_session.add(job)
        db_session.commit()
        db_session.refresh(job)
        job_ids.append(job.id)

    calls = []
    monkeypatch.setattr(batch_tasks, "process_batch_job", lambda job_id: calls.append(job_id))

    batch_tasks.resume_orphaned_batch_jobs()

    # Scoped to this test's own jobs rather than asserting calls == [] —
    # a leftover "processing" row from an unrelated test earlier in this
    # module (same shared sqlite file across the whole test session) must
    # not make this test flaky.
    assert not (set(job_ids) & set(calls))
