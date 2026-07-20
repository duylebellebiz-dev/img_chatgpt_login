import pytest

from app.config import Settings
from app.services.insights_service import InsightsService
from app.services.meta_service import MetaAPIError


@pytest.fixture
def db_session():
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import BatchJob, GeneratedImage, PostMetrics, ScheduledPost, SocialAccount

    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        session.query(PostMetrics).delete()
        session.query(ScheduledPost).delete()
        session.query(SocialAccount).delete()
        session.query(GeneratedImage).delete()
        session.query(BatchJob).delete()
        session.commit()
        yield session
    finally:
        session.close()


def _seeded_posted_post(session, platform="facebook_page", platform_post_id="post-123"):
    from app.models.db_models import BatchJob, ScheduledPost, SocialAccount

    job = BatchJob(pairing_mode="one_to_one", num_images=1, status="completed")
    session.add(job)
    session.flush()

    account = SocialAccount(
        platform=platform, account_id="acct-1", name="Acct", access_token_encrypted="mock:token"
    )
    session.add(account)
    session.flush()

    post = ScheduledPost(
        batch_job_id=job.id,
        social_account_id=account.id,
        platform=platform,
        status="posted",
        platform_post_id=platform_post_id,
    )
    session.add(post)
    session.commit()
    session.refresh(post)
    return post


class _FakeMetaServiceSuccess:
    is_mock = True

    def get_facebook_post_insights(self, post_id, access_token):
        return {"impressions": 100, "reach": 80, "likes": 10, "comments": 2, "shares": 1}

    def get_instagram_media_insights(self, media_id, access_token):
        return {"impressions": 200, "reach": 150, "likes": 20, "comments": 4, "shares": 2}


class _FakeMetaServiceDenied:
    is_mock = True

    def get_facebook_post_insights(self, post_id, access_token):
        raise MetaAPIError("Meta Graph API error (400): Invalid Scopes")

    def get_instagram_media_insights(self, media_id, access_token):
        raise MetaAPIError("Meta Graph API error (400): Invalid Scopes")


def test_sync_metrics_for_post_writes_metrics_on_success(db_session):
    post = _seeded_posted_post(db_session)
    service = InsightsService(settings=Settings(), meta_service=_FakeMetaServiceSuccess())

    metrics = service.sync_metrics_for_post(db_session, post)

    assert metrics.unavailable_reason is None
    assert metrics.reach == 80
    assert metrics.likes == 10


def test_sync_metrics_for_post_marks_unavailable_instead_of_raising_on_meta_permission_error(db_session):
    """The most important behavior: this is the exact path that will be live
    in production for weeks while the Meta App Review is pending."""
    post = _seeded_posted_post(db_session)
    service = InsightsService(settings=Settings(), meta_service=_FakeMetaServiceDenied())

    metrics = service.sync_metrics_for_post(db_session, post)  # must not raise

    assert metrics.unavailable_reason is not None
    assert "App Review" in metrics.unavailable_reason
    assert metrics.reach is None


def test_sync_all_posted_metrics_only_processes_posted_posts_with_a_platform_post_id(db_session):
    from app.models.db_models import ScheduledPost

    posted = _seeded_posted_post(db_session)
    not_posted = _seeded_posted_post(db_session, platform_post_id=None)
    not_posted.status = "pending_review"
    db_session.commit()

    service = InsightsService(settings=Settings(), meta_service=_FakeMetaServiceSuccess())
    results = service.sync_all_posted_metrics(db_session)

    assert len(results) == 1
    assert results[0].scheduled_post_id == posted.id
