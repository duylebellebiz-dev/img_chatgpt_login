from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import main as main_module
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import BatchJob, Campaign, GeneratedImage, Notification, ScheduledPost, SocialAccount

    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        session.query(Notification).delete()
        session.query(ScheduledPost).delete()
        session.query(GeneratedImage).delete()
        session.query(BatchJob).delete()
        session.query(Campaign).delete()
        session.query(SocialAccount).delete()
        session.commit()
    finally:
        session.close()

    with TestClient(main_module.app) as test_client:
        yield test_client


def _seed_social_account(user_id: str) -> str:
    from app.database import SessionLocal
    from app.models.db_models import SocialAccount

    session = SessionLocal()
    try:
        account = SocialAccount(
            user_id=user_id,
            platform="facebook_page",
            account_id="mock-page-1",
            name="Mock Page",
            access_token_encrypted="mock:token",
        )
        session.add(account)
        session.commit()
        session.refresh(account)
        return account.id
    finally:
        session.close()


def _seed_campaign(user_id: str, *, auto_refill_enabled: bool, social_account_id: str | None = None, platform: str | None = None) -> str:
    from app.database import SessionLocal
    from app.models.db_models import Campaign

    session = SessionLocal()
    try:
        campaign = Campaign(
            user_id=user_id,
            name="Auto-refill campaign",
            auto_refill_enabled=auto_refill_enabled,
            auto_refill_social_account_id=social_account_id,
            auto_refill_platform=platform,
            auto_refill_interval_hours=12.0,
        )
        session.add(campaign)
        session.commit()
        session.refresh(campaign)
        return campaign.id
    finally:
        session.close()


def _seed_completed_source_job(user_id: str, campaign_id: str, tiny_png_bytes: bytes) -> tuple[str, str]:
    from app.config import get_settings
    from app.database import SessionLocal
    from app.models.db_models import BatchJob
    from app.services.storage_service import StorageService

    storage = StorageService(get_settings())

    session = SessionLocal()
    try:
        job = BatchJob(user_id=user_id, pairing_mode="one_to_one", num_images=1, status="completed", campaign_id=campaign_id)
        session.add(job)
        session.flush()

        design_path = storage.original_dir(job.id, "designs") / "d0.png"
        design_path.write_bytes(tiny_png_bytes)
        pose_path = storage.original_dir(job.id, "poses") / "p0.png"
        pose_path.write_bytes(tiny_png_bytes)

        job.design_paths = [str(design_path)]
        job.pose_paths = [str(pose_path)]
        session.commit()
        return job.id, str(design_path)
    finally:
        session.close()


def _fake_process_batch_job(job_id: str) -> None:
    """Stands in for the real mock batch pipeline: auto-refill runs
    it synchronously and inline, so a real run here would depend on
    quality_service's hash-derived mock score randomly passing/failing —
    same reason test_batch_api.py stubs this function out too."""
    from app.database import SessionLocal
    from app.models.db_models import BatchJob, GeneratedImage

    session = SessionLocal()
    try:
        job = session.get(BatchJob, job_id)
        job.status = "completed"
        job.progress_completed = job.num_images
        session.add(
            GeneratedImage(
                batch_job_id=job.id,
                design_filename="d0.png",
                pose_filename="p0.png",
                original_design_path=job.design_paths[0],
                original_pose_path=job.pose_paths[0],
                generated_path="fake-generated.png",
                status="passed",
                passed=True,
            )
        )
        session.commit()
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _stub_process_batch_job(monkeypatch):
    import app.services.auto_refill_service as auto_refill_module

    monkeypatch.setattr(auto_refill_module, "process_batch_job", _fake_process_batch_job)


def test_auto_refill_skips_campaigns_not_opted_in(test_user):
    from app.database import SessionLocal
    from app.services.auto_refill_service import run_auto_refill

    _seed_campaign(test_user.id, auto_refill_enabled=False)

    db = SessionLocal()
    try:
        triggered = run_auto_refill(db)
    finally:
        db.close()

    assert triggered == []


def test_auto_refill_skips_when_buffer_is_already_full(test_user):
    from app.database import SessionLocal
    from app.models.db_models import ScheduledPost
    from app.services.auto_refill_service import run_auto_refill

    account_id = _seed_social_account(test_user.id)
    campaign_id = _seed_campaign(
        test_user.id, auto_refill_enabled=True, social_account_id=account_id, platform="facebook_page"
    )

    db = SessionLocal()
    try:
        for _ in range(3):
            db.add(
                ScheduledPost(
                    user_id=test_user.id,
                    social_account_id=account_id,
                    platform="facebook_page",
                    status="pending_content",
                    suggested_date=datetime.now(timezone.utc) + timedelta(days=1),
                    campaign_id=campaign_id,
                )
            )
        db.commit()

        triggered = run_auto_refill(db)
    finally:
        db.close()

    assert triggered == []


def test_auto_refill_skips_without_a_completed_source_batch_job(test_user):
    from app.database import SessionLocal
    from app.services.auto_refill_service import run_auto_refill

    account_id = _seed_social_account(test_user.id)
    _seed_campaign(test_user.id, auto_refill_enabled=True, social_account_id=account_id, platform="facebook_page")

    db = SessionLocal()
    try:
        triggered = run_auto_refill(db)
    finally:
        db.close()

    assert triggered == []


def test_auto_refill_requires_both_social_account_and_platform(test_user, tiny_png_bytes):
    from app.database import SessionLocal
    from app.services.auto_refill_service import run_auto_refill

    account_id = _seed_social_account(test_user.id)
    campaign_id = _seed_campaign(test_user.id, auto_refill_enabled=True, social_account_id=account_id, platform=None)
    _seed_completed_source_job(test_user.id, campaign_id, tiny_png_bytes)[0]

    db = SessionLocal()
    try:
        triggered = run_auto_refill(db)
    finally:
        db.close()

    assert triggered == []


def test_auto_refill_clones_and_schedules_when_buffer_is_low(test_user, tiny_png_bytes):
    from app.database import SessionLocal
    from app.models.db_models import BatchJob, Notification, ScheduledPost
    from app.services.auto_refill_service import run_auto_refill

    account_id = _seed_social_account(test_user.id)
    campaign_id = _seed_campaign(
        test_user.id, auto_refill_enabled=True, social_account_id=account_id, platform="facebook_page"
    )
    source_job_id, source_design_path = _seed_completed_source_job(test_user.id, campaign_id, tiny_png_bytes)

    db = SessionLocal()
    try:
        triggered = run_auto_refill(db)
        assert len(triggered) == 1
        new_job = triggered[0]
        assert new_job.id != source_job_id
        assert new_job.description.startswith("Auto-refill")
        assert new_job.campaign_id == campaign_id

        refreshed = db.get(BatchJob, new_job.id)
        assert refreshed.status == "completed"
        # The clone owns its own copy of the design file rather than
        # depending on the source job's file still existing.
        assert refreshed.design_paths[0] != source_design_path

        scheduled = db.query(ScheduledPost).filter(ScheduledPost.batch_job_id == new_job.id).all()
        assert len(scheduled) == 1
        assert scheduled[0].social_account_id == account_id
        assert scheduled[0].platform == "facebook_page"

        notifications = db.query(Notification).filter(Notification.user_id == test_user.id).all()
        assert any(n.type == "auto_refill_triggered" for n in notifications)
    finally:
        db.close()


def test_auto_refill_respects_cooldown_between_runs(test_user, tiny_png_bytes):
    from app.database import SessionLocal
    from app.services.auto_refill_service import run_auto_refill

    account_id = _seed_social_account(test_user.id)
    campaign_id = _seed_campaign(
        test_user.id, auto_refill_enabled=True, social_account_id=account_id, platform="facebook_page"
    )
    _seed_completed_source_job(test_user.id, campaign_id, tiny_png_bytes)[0]

    db = SessionLocal()
    try:
        first = run_auto_refill(db)
        assert len(first) == 1

        second = run_auto_refill(db)
        assert second == []
    finally:
        db.close()
