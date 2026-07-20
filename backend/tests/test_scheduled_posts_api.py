import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import main as main_module
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import BatchJob, GeneratedImage, Notification, ScheduledPost, SocialAccount

    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        session.query(ScheduledPost).delete()
        session.query(Notification).delete()
        session.query(SocialAccount).delete()
        session.query(GeneratedImage).delete()
        session.query(BatchJob).delete()
        session.commit()
    finally:
        session.close()

    with TestClient(main_module.app) as test_client:
        yield test_client


@pytest.fixture
def seeded_post(authed_client, test_user):
    """Creates a BatchJob + GeneratedImage + SocialAccount + ScheduledPost
    directly via the DB session (no batch pipeline needed for these tests),
    all owned by test_user."""
    from datetime import datetime, timedelta, timezone

    from app.database import SessionLocal
    from app.models.db_models import BatchJob, GeneratedImage, ScheduledPost, SocialAccount

    session = SessionLocal()
    try:
        job = BatchJob(user_id=test_user.id, pairing_mode="one_to_one", num_images=1, status="completed")
        session.add(job)
        session.flush()

        image = GeneratedImage(
            batch_job_id=job.id,
            design_filename="design.png",
            pose_filename="pose.png",
            original_design_path="x",
            original_pose_path="x",
            generated_path="generated.png",
            status="passed",
            passed=True,
        )
        session.add(image)

        account = SocialAccount(
            user_id=test_user.id,
            platform="facebook_page",
            account_id="mock-page-1",
            name="Mock Page",
            access_token_encrypted="mock:token",
        )
        session.add(account)
        session.flush()

        post = ScheduledPost(
            user_id=test_user.id,
            batch_job_id=job.id,
            image_id=image.id,
            social_account_id=account.id,
            platform="facebook_page",
            status="pending_content",
            suggested_date=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        session.add(post)
        session.commit()
        session.refresh(post)
        return post.id
    finally:
        session.close()


def test_unauthenticated_request_is_rejected(client):
    resp = client.get("/api/scheduled-posts")
    assert resp.status_code == 401


def test_login_with_wrong_password_is_rejected(client, test_user):
    resp = client.post("/api/auth/login", json={"email": test_user.email, "password": "wrong"})
    assert resp.status_code == 401


def test_cannot_approve_a_post_still_pending_content(authed_client, seeded_post):
    resp = authed_client.post(f"/api/scheduled-posts/{seeded_post}/approve")
    assert resp.status_code == 409


def test_full_approval_gate_flow(authed_client, seeded_post):
    from app.database import SessionLocal
    from app.services import scheduler_service

    db = SessionLocal()
    try:
        generated = scheduler_service.generate_content_for_due_posts(db)
        assert len(generated) == 1
        assert generated[0].status == "pending_review"
    finally:
        db.close()

    list_resp = authed_client.get("/api/scheduled-posts", params={"status": "pending_review"})
    assert list_resp.status_code == 200
    posts = list_resp.json()
    assert len(posts) == 1
    assert posts[0]["caption"]

    notifications = authed_client.get("/api/notifications").json()
    assert any(n["scheduled_post_id"] == seeded_post for n in notifications)

    approve_resp = authed_client.post(f"/api/scheduled-posts/{seeded_post}/approve")
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "approved"


def test_publish_sweep_never_publishes_a_post_that_was_not_approved(authed_client, seeded_post):
    """The core safety guarantee: even if a post is 'due' (suggested_date in
    the past) and has content, it must never auto-publish without an
    explicit admin Approve — see scheduler_service.publish_due_posts, which
    only ever selects status == 'approved'."""
    from datetime import datetime, timedelta, timezone

    from app.database import SessionLocal
    from app.models.db_models import ScheduledPost
    from app.services import scheduler_service

    db = SessionLocal()
    try:
        post = db.get(ScheduledPost, seeded_post)
        post.status = "pending_review"
        post.caption = "unapproved caption"
        post.suggested_date = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()

        published = scheduler_service.publish_due_posts(db)
        db.refresh(post)
    finally:
        db.close()

    assert published == []
    assert post.status == "pending_review"
    assert post.platform_post_id is None


def test_cannot_delete_a_post_that_is_not_failed(authed_client, seeded_post):
    resp = authed_client.delete(f"/api/scheduled-posts/{seeded_post}")
    assert resp.status_code == 409


def test_delete_a_failed_post_removes_it_and_its_notification(authed_client, seeded_post, test_user):
    from app.database import SessionLocal
    from app.models.db_models import Notification, ScheduledPost

    db = SessionLocal()
    try:
        post = db.get(ScheduledPost, seeded_post)
        post.status = "failed"
        post.error_message = "boom"
        db.add(Notification(user_id=test_user.id, type="post_failed", message="Failed to publish", scheduled_post_id=post.id))
        db.commit()
    finally:
        db.close()

    resp = authed_client.delete(f"/api/scheduled-posts/{seeded_post}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    assert authed_client.get("/api/scheduled-posts").json() == []
    assert authed_client.get("/api/notifications").json() == []


def test_publish_sweep_publishes_an_approved_due_post(authed_client, seeded_post):
    from datetime import datetime, timedelta, timezone

    from app.database import SessionLocal
    from app.models.db_models import ScheduledPost
    from app.services import scheduler_service

    db = SessionLocal()
    try:
        post = db.get(ScheduledPost, seeded_post)
        post.status = "approved"
        post.caption = "approved caption"
        post.suggested_date = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()

        scheduler_service.publish_due_posts(db)
        db.refresh(post)
    finally:
        db.close()

    assert post.status == "posted"
    assert post.platform_post_id is not None


def test_cannot_see_or_act_on_another_tenants_scheduled_post(other_authed_client, seeded_post):
    assert other_authed_client.get("/api/scheduled-posts").json() == []
    resp = other_authed_client.post(f"/api/scheduled-posts/{seeded_post}/approve")
    assert resp.status_code == 404


def _seed_batch_job_with_images(user_id: str, num_images: int) -> tuple[str, list[str]]:
    from app.database import SessionLocal
    from app.models.db_models import BatchJob, GeneratedImage

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

        session.commit()
        return job.id, image_ids
    finally:
        session.close()


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


def test_create_scheduled_post_with_multiple_images_makes_a_carousel(authed_client, test_user):
    from datetime import datetime, timedelta, timezone

    account_id = _seed_social_account(test_user.id)
    job_id, image_ids = _seed_batch_job_with_images(test_user.id, num_images=3)

    resp = authed_client.post(
        "/api/scheduled-posts",
        json={
            "batch_job_id": job_id,
            "image_ids": image_ids,
            "social_account_id": account_id,
            "platform": "facebook_page",
            "suggested_date": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["image_ids"] == image_ids
    assert len(body["image_urls"]) == 3
    assert body["image_id"] == image_ids[0]


def test_create_scheduled_post_rejects_zero_images(authed_client, test_user):
    from datetime import datetime, timedelta, timezone

    account_id = _seed_social_account(test_user.id)
    job_id, _ = _seed_batch_job_with_images(test_user.id, num_images=1)

    resp = authed_client.post(
        "/api/scheduled-posts",
        json={
            "batch_job_id": job_id,
            "image_ids": [],
            "social_account_id": account_id,
            "platform": "facebook_page",
            "suggested_date": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
    )
    assert resp.status_code == 422


def test_create_scheduled_post_rejects_more_than_ten_images(authed_client, test_user):
    from datetime import datetime, timedelta, timezone

    account_id = _seed_social_account(test_user.id)
    job_id, image_ids = _seed_batch_job_with_images(test_user.id, num_images=11)

    resp = authed_client.post(
        "/api/scheduled-posts",
        json={
            "batch_job_id": job_id,
            "image_ids": image_ids,
            "social_account_id": account_id,
            "platform": "facebook_page",
            "suggested_date": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
    )
    assert resp.status_code == 422


def test_create_scheduled_post_rejects_mixing_images_and_edits(authed_client, test_user):
    from datetime import datetime, timedelta, timezone

    account_id = _seed_social_account(test_user.id)
    job_id, image_ids = _seed_batch_job_with_images(test_user.id, num_images=1)

    resp = authed_client.post(
        "/api/scheduled-posts",
        json={
            "batch_job_id": job_id,
            "image_ids": image_ids,
            "edit_ids": ["some-edit-id"],
            "social_account_id": account_id,
            "platform": "facebook_page",
            "suggested_date": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
    )
    assert resp.status_code == 422


def test_create_scheduled_post_rejects_an_image_already_claimed_via_legacy_column(authed_client, seeded_post, test_user):
    from datetime import datetime, timedelta, timezone

    from app.database import SessionLocal
    from app.models.db_models import ScheduledPost

    db = SessionLocal()
    try:
        legacy_post = db.get(ScheduledPost, seeded_post)
        claimed_image_id = legacy_post.image_id
        job_id = legacy_post.batch_job_id
        account_id = legacy_post.social_account_id
    finally:
        db.close()

    resp = authed_client.post(
        "/api/scheduled-posts",
        json={
            "batch_job_id": job_id,
            "image_ids": [claimed_image_id],
            "social_account_id": account_id,
            "platform": "facebook_page",
            "suggested_date": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
    )
    assert resp.status_code == 409


def test_create_scheduled_post_rejects_an_image_already_claimed_via_another_posts_array(authed_client, test_user):
    from datetime import datetime, timedelta, timezone

    account_id = _seed_social_account(test_user.id)
    job_id, image_ids = _seed_batch_job_with_images(test_user.id, num_images=3)

    first = authed_client.post(
        "/api/scheduled-posts",
        json={
            "batch_job_id": job_id,
            "image_ids": image_ids[:2],
            "social_account_id": account_id,
            "platform": "facebook_page",
            "suggested_date": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
    )
    assert first.status_code == 201, first.text

    second = authed_client.post(
        "/api/scheduled-posts",
        json={
            "batch_job_id": job_id,
            "image_ids": [image_ids[1], image_ids[2]],
            "social_account_id": account_id,
            "platform": "facebook_page",
            "suggested_date": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
    )
    assert second.status_code == 409


def test_image_urls_use_each_images_own_batch_job_when_a_post_spans_two_jobs(authed_client, test_user):
    """Regression test: _to_out used to build every image's URL from
    post.batch_job_id instead of that image's own batch_job_id — harmless
    while a post only ever had one image from one job, but wrong once a
    manually-built post can reference images from different jobs."""
    from datetime import datetime, timedelta, timezone

    from app.database import SessionLocal
    from app.models.db_models import ScheduledPost

    account_id = _seed_social_account(test_user.id)
    job_a, images_a = _seed_batch_job_with_images(test_user.id, num_images=1)
    job_b, images_b = _seed_batch_job_with_images(test_user.id, num_images=1)

    db = SessionLocal()
    try:
        post = ScheduledPost(
            user_id=test_user.id,
            image_ids=[images_a[0], images_b[0]],
            social_account_id=account_id,
            platform="facebook_page",
            status="pending_content",
            suggested_date=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        db.add(post)
        db.commit()
        post_id = post.id
    finally:
        db.close()

    resp = authed_client.get("/api/scheduled-posts")
    post_out = next(p for p in resp.json() if p["id"] == post_id)
    assert f"/media/generated/{job_a}/" in post_out["image_urls"][0]
    assert f"/media/generated/{job_b}/" in post_out["image_urls"][1]


def test_publish_sweep_publishes_a_carousel_post_end_to_end(authed_client, test_user):
    from datetime import datetime, timedelta, timezone

    from app.database import SessionLocal
    from app.models.db_models import ScheduledPost
    from app.services import scheduler_service

    account_id = _seed_social_account(test_user.id)
    _, image_ids = _seed_batch_job_with_images(test_user.id, num_images=3)

    db = SessionLocal()
    try:
        post = ScheduledPost(
            user_id=test_user.id,
            image_ids=image_ids,
            social_account_id=account_id,
            platform="facebook_page",
            status="pending_content",
            suggested_date=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        db.add(post)
        db.commit()
        post_id = post.id

        scheduler_service.generate_content_for_due_posts(db)
        post = db.get(ScheduledPost, post_id)
        post.status = "approved"
        db.commit()

        scheduler_service.publish_due_posts(db)
        db.refresh(post)
    finally:
        db.close()

    assert post.status == "posted"
    assert post.platform_post_id.startswith("mock-fb-carousel-")
