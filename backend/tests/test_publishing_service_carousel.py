import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import main as main_module
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import BatchJob, GeneratedImage, ScheduledPost, SocialAccount

    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        session.query(ScheduledPost).delete()
        session.query(SocialAccount).delete()
        session.query(GeneratedImage).delete()
        session.query(BatchJob).delete()
        session.commit()
    finally:
        session.close()

    with TestClient(main_module.app) as test_client:
        yield test_client


def _seed_post(user_id: str, num_images: int):
    from app.database import SessionLocal
    from app.models.db_models import BatchJob, GeneratedImage, ScheduledPost, SocialAccount

    session = SessionLocal()
    try:
        job = BatchJob(user_id=user_id, pairing_mode="one_to_one", num_images=num_images, status="completed")
        session.add(job)
        session.flush()

        image_ids = []
        for i in range(num_images):
            image = GeneratedImage(
                batch_job_id=job.id,
                design_filename=f"design{i}.png",
                pose_filename=f"pose{i}.png",
                original_design_path="x",
                original_pose_path="x",
                generated_path=f"generated{i}.png",
                status="passed",
                passed=True,
            )
            session.add(image)
            session.flush()
            image_ids.append(image.id)

        account = SocialAccount(
            user_id=user_id, platform="facebook_page", account_id="acct-1", name="Acct", access_token_encrypted="mock:token"
        )
        session.add(account)
        session.flush()

        post = ScheduledPost(
            user_id=user_id,
            batch_job_id=job.id,
            image_ids=image_ids,
            social_account_id=account.id,
            platform="facebook_page",
            status="approved",
            caption="a caption",
        )
        session.add(post)
        session.commit()
        session.refresh(post)
        return post.id
    finally:
        session.close()


def test_image_urls_returns_one_mock_url_per_image(client, test_user):
    from app.database import SessionLocal
    from app.models.db_models import ScheduledPost
    from app.services.publishing_service import PublishingService

    post_id = _seed_post(test_user.id, num_images=3)
    db = SessionLocal()
    try:
        post = db.get(ScheduledPost, post_id)
        service = PublishingService()
        urls = service._image_urls(db, post)
        assert len(urls) == 3
        assert all(url.startswith("mock://media/") for url in urls)
    finally:
        db.close()


def test_publish_dispatches_to_carousel_method_when_multiple_images(client, test_user):
    from app.database import SessionLocal
    from app.models.db_models import ScheduledPost
    from app.services.publishing_service import PublishingService

    post_id = _seed_post(test_user.id, num_images=3)
    db = SessionLocal()
    try:
        post = db.get(ScheduledPost, post_id)
        service = PublishingService()
        service.publish(db, post)
        db.refresh(post)
        assert post.status == "posted"
        assert post.platform_post_id.startswith("mock-fb-carousel-")
    finally:
        db.close()


def test_publish_uses_single_image_method_when_exactly_one_image(client, test_user):
    from app.database import SessionLocal
    from app.models.db_models import ScheduledPost
    from app.services.publishing_service import PublishingService

    post_id = _seed_post(test_user.id, num_images=1)
    db = SessionLocal()
    try:
        post = db.get(ScheduledPost, post_id)
        service = PublishingService()
        service.publish(db, post)
        db.refresh(post)
        assert post.status == "posted"
        assert post.platform_post_id.startswith("mock-fb-post-")
        assert "carousel" not in post.platform_post_id
    finally:
        db.close()
