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

    settings_override(quality_pass_threshold=0, quality_max_retries=3)  # always passes on attempt 1
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
