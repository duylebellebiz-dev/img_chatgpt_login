"""Covers process_edit_job's worker pipeline directly (called synchronously,
no broker needed), mirroring test_batch_tasks.py: the highest-risk part is
getting stuck rows (never reaching a terminal status) or a job that never
reaches a terminal status when run under the ThreadPoolExecutor.
"""

import zipfile

import pytest
from PIL import Image


@pytest.fixture
def db_session():
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import SalonBranding

    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    # SalonBranding rows use a fixed "test-user" id across runs (see
    # test_batch_edit_applies_watermark_when_requested below) and this file's
    # sqlite DB persists across test runs — without clearing it first, an
    # older run's row (pointing at a since-deleted pytest tmp_path logo file)
    # can be the one a plain `.first()` lookup returns.
    session.query(SalonBranding).delete()
    session.commit()
    yield session
    session.close()


def _make_job(db_session, tiny_png_bytes, tmp_path, n_images=3, apply_logo=False, user_id="test-user"):
    from app.models.db_models import EditJob, ImageEdit

    job = EditJob(
        user_id=user_id,
        prompt="brighten the photo",
        status="pending",
        progress_total=n_images,
        apply_logo=apply_logo,
    )
    db_session.add(job)
    db_session.flush()

    for i in range(n_images):
        path = tmp_path / f"photo{i}.png"
        path.write_bytes(tiny_png_bytes)
        db_session.add(
            ImageEdit(
                edit_job_id=job.id,
                prompt=job.prompt,
                original_filename=path.name,
                original_path=str(path),
                status="generating",
            )
        )
    db_session.commit()
    db_session.refresh(job)
    return job


def test_batch_edit_completes_all_images_and_builds_zip(db_session, tiny_png_bytes, tmp_path):
    from app.models.db_models import EditJob, ImageEdit
    from app.tasks.edit_tasks import process_edit_job

    job = _make_job(db_session, tiny_png_bytes, tmp_path, n_images=3)

    process_edit_job(job.id)

    db_session.refresh(job)
    edits = db_session.query(ImageEdit).filter_by(edit_job_id=job.id).all()

    assert job.status == "completed"
    assert job.progress_completed == 3
    assert len(edits) == 3
    for e in edits:
        assert e.status == "completed"
        assert e.generated_path is not None
        assert e.prompt_used is not None

    with zipfile.ZipFile(job.zip_path) as zf:
        assert len(zf.namelist()) == 3


def test_batch_edit_cancelled_before_start_is_not_processed(db_session, tiny_png_bytes, tmp_path):
    from app.models.db_models import EditJob, ImageEdit
    from app.tasks.edit_tasks import process_edit_job

    job = _make_job(db_session, tiny_png_bytes, tmp_path, n_images=2)
    job.status = "cancelled"
    db_session.commit()

    process_edit_job(job.id)

    db_session.refresh(job)
    edits = db_session.query(ImageEdit).filter_by(edit_job_id=job.id).all()

    assert job.status == "cancelled"
    assert job.progress_completed == 0
    assert all(e.status == "generating" for e in edits)  # rows untouched, task bailed immediately


def test_batch_edit_cancelled_mid_run_marks_every_row_terminal(db_session, tiny_png_bytes, tmp_path, monkeypatch):
    """Regression guard for the concurrent-cancellation path: every row must
    end up in a terminal status (none stuck at 'generating'), whether it was
    already running, queued-but-not-started, or never picked up."""
    from app.config import get_settings
    from app.database import SessionLocal
    from app.models.db_models import EditJob, ImageEdit
    from app.services.agent_service import AgentService
    from app.tasks.edit_tasks import process_edit_job

    get_settings.cache_clear()
    monkeypatch.setenv("BATCH_CONCURRENCY", "2")
    get_settings.cache_clear()

    job = _make_job(db_session, tiny_png_bytes, tmp_path, n_images=4)

    original_build = AgentService.refine_edit_prompt

    def cancelling_refine(self, *args, **kwargs):
        session = SessionLocal()
        try:
            job_row = session.get(EditJob, job.id)
            job_row.status = "cancelled"
            session.commit()
        finally:
            session.close()
        return original_build(self, *args, **kwargs)

    monkeypatch.setattr(AgentService, "refine_edit_prompt", cancelling_refine)

    process_edit_job(job.id)
    get_settings.cache_clear()

    db_session.refresh(job)
    edits = db_session.query(ImageEdit).filter_by(edit_job_id=job.id).all()

    assert job.status == "cancelled"
    assert len(edits) == 4
    for e in edits:
        assert e.status in {"cancelled", "completed"}  # terminal either way, never stuck "generating"


def test_batch_edit_applies_watermark_when_requested(db_session, tiny_png_bytes, tmp_path, monkeypatch):
    from app.config import get_settings
    from app.models.db_models import EditJob, ImageEdit, SalonBranding
    from app.tasks.edit_tasks import process_edit_job

    logo_path = tmp_path / "logo.png"
    Image.new("RGBA", (200, 80), color=(255, 0, 0, 255)).save(logo_path)
    db_session.add(SalonBranding(user_id="test-user", logo_path=str(logo_path)))
    db_session.commit()

    job = _make_job(db_session, tiny_png_bytes, tmp_path, n_images=1, apply_logo=True)

    process_edit_job(job.id)

    db_session.refresh(job)
    edit = db_session.query(ImageEdit).filter_by(edit_job_id=job.id).first()
    assert job.status == "completed"

    with Image.open(edit.generated_path) as img:
        img = img.convert("RGB")
        w, h = img.size
        # Same geometry apply_watermark computes internally (defaults:
        # margin_ratio=0.03, logo_width_ratio=0.16) — sample the logo's center.
        target_width = round(w * 0.16)
        target_height = round(80 * (target_width / 200))
        margin = round(w * 0.03)
        logo_x = w - target_width - margin
        logo_y = h - target_height - margin
        watermark_pixel = img.getpixel((logo_x + target_width // 2, logo_y + target_height // 2))
        background_pixel = img.getpixel((5, 5))

    assert watermark_pixel != background_pixel
