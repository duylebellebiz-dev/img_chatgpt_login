from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import main as main_module
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import BatchJob, Campaign, GeneratedImage, ScheduledPost, SocialAccount

    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
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


def _seed_batch_job_with_images(
    user_id: str, campaign_id: str | None, num_images: int = 3, all_passed: bool = True
) -> tuple[str, list[str]]:
    from app.database import SessionLocal
    from app.models.db_models import BatchJob, GeneratedImage

    session = SessionLocal()
    try:
        job = BatchJob(
            user_id=user_id, pairing_mode="one_to_one", num_images=num_images, status="completed", campaign_id=campaign_id
        )
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
                generated_path=f"generated{i}.png" if all_passed else None,
                status="passed" if all_passed else "needs_review",
                passed=all_passed,
            )
            session.add(image)
            session.flush()
            image_ids.append(image.id)

        session.commit()
        return job.id, image_ids
    finally:
        session.close()


def test_bulk_schedule_creates_one_post_per_passed_image_spaced_by_interval(authed_client, test_user):
    account_id = _seed_social_account(test_user.id)
    job_id, image_ids = _seed_batch_job_with_images(test_user.id, campaign_id=None, num_images=3)

    start = datetime.now(timezone.utc) + timedelta(hours=1)
    resp = authed_client.post(
        "/api/scheduled-posts/bulk",
        json={
            "batch_job_id": job_id,
            "social_account_id": account_id,
            "platform": "facebook_page",
            "start_date": start.isoformat(),
            "interval_hours": 12,
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert len(body["created"]) == 3
    assert body["skipped_already_scheduled"] == 0
    assert body["skipped_not_ready"] == 0
    assert {p["image_id"] for p in body["created"]} == set(image_ids)

    dates = [datetime.fromisoformat(p["suggested_date"]) for p in body["created"]]
    assert dates == sorted(dates)
    assert (dates[1] - dates[0]) == timedelta(hours=12)


def test_bulk_schedule_skips_images_that_already_have_an_active_post(authed_client, test_user):
    account_id = _seed_social_account(test_user.id)
    job_id, image_ids = _seed_batch_job_with_images(test_user.id, campaign_id=None, num_images=2)

    start = datetime.now(timezone.utc) + timedelta(hours=1)
    first = authed_client.post(
        "/api/scheduled-posts/bulk",
        json={
            "batch_job_id": job_id,
            "social_account_id": account_id,
            "platform": "facebook_page",
            "start_date": start.isoformat(),
        },
    )
    assert len(first.json()["created"]) == 2

    second = authed_client.post(
        "/api/scheduled-posts/bulk",
        json={
            "batch_job_id": job_id,
            "social_account_id": account_id,
            "platform": "facebook_page",
            "start_date": start.isoformat(),
        },
    )
    body = second.json()
    assert body["created"] == []
    assert body["skipped_already_scheduled"] == 2


def test_bulk_schedule_skips_images_not_yet_passed(authed_client, test_user):
    account_id = _seed_social_account(test_user.id)
    job_id, _ = _seed_batch_job_with_images(test_user.id, campaign_id=None, num_images=2, all_passed=False)

    resp = authed_client.post(
        "/api/scheduled-posts/bulk",
        json={
            "batch_job_id": job_id,
            "social_account_id": account_id,
            "platform": "facebook_page",
            "start_date": datetime.now(timezone.utc).isoformat(),
        },
    )
    body = resp.json()
    assert body["created"] == []
    assert body["skipped_not_ready"] == 2


def test_bulk_schedule_by_campaign_spans_every_batch_job_in_it(authed_client, test_user):
    campaign = authed_client.post("/api/campaigns", json={"name": "Multi-batch campaign"}).json()
    account_id = _seed_social_account(test_user.id)
    _seed_batch_job_with_images(test_user.id, campaign_id=campaign["id"], num_images=2)
    _seed_batch_job_with_images(test_user.id, campaign_id=campaign["id"], num_images=1)

    resp = authed_client.post(
        "/api/scheduled-posts/bulk",
        json={
            "campaign_id": campaign["id"],
            "social_account_id": account_id,
            "platform": "facebook_page",
            "start_date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text
    assert len(resp.json()["created"]) == 3


def test_bulk_schedule_requires_exactly_one_of_batch_job_or_campaign(authed_client, test_user):
    account_id = _seed_social_account(test_user.id)
    resp = authed_client.post(
        "/api/scheduled-posts/bulk",
        json={
            "social_account_id": account_id,
            "platform": "facebook_page",
            "start_date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert resp.status_code == 422


def test_cannot_bulk_schedule_another_tenants_batch_job(other_authed_client, other_user, test_user):
    other_account_id = _seed_social_account(other_user.id)
    job_id, _ = _seed_batch_job_with_images(test_user.id, campaign_id=None, num_images=1)

    resp = other_authed_client.post(
        "/api/scheduled-posts/bulk",
        json={
            "batch_job_id": job_id,
            "social_account_id": other_account_id,
            "platform": "facebook_page",
            "start_date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert resp.status_code == 404


def test_bulk_approve_by_post_ids(authed_client, test_user):
    account_id = _seed_social_account(test_user.id)
    job_id, image_ids = _seed_batch_job_with_images(test_user.id, campaign_id=None, num_images=2)
    created = authed_client.post(
        "/api/scheduled-posts/bulk",
        json={
            "batch_job_id": job_id,
            "social_account_id": account_id,
            "platform": "facebook_page",
            "start_date": datetime.now(timezone.utc).isoformat(),
        },
    ).json()["created"]

    from app.database import SessionLocal
    from app.services import scheduler_service

    db = SessionLocal()
    try:
        scheduler_service.generate_content_for_due_posts(db)
    finally:
        db.close()

    post_ids = [p["id"] for p in created]
    resp = authed_client.post("/api/scheduled-posts/bulk-approve", json={"post_ids": post_ids})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["updated"]) == 2
    assert all(p["status"] == "approved" for p in body["updated"])
    assert body["skipped"] == 0


def test_bulk_reject_by_campaign_id_skips_already_terminal_posts(authed_client, test_user):
    campaign = authed_client.post("/api/campaigns", json={"name": "Reject-me campaign"}).json()
    account_id = _seed_social_account(test_user.id)
    job_id, _ = _seed_batch_job_with_images(test_user.id, campaign_id=campaign["id"], num_images=2)
    authed_client.post(
        "/api/scheduled-posts/bulk",
        json={
            "campaign_id": campaign["id"],
            "social_account_id": account_id,
            "platform": "facebook_page",
            "start_date": datetime.now(timezone.utc).isoformat(),
        },
    )

    resp = authed_client.post("/api/scheduled-posts/bulk-reject", json={"campaign_id": campaign["id"]})
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["updated"]) == 2
    assert all(p["status"] == "rejected" for p in resp.json()["updated"])

    # Running it again should now skip both — they're already terminal.
    resp2 = authed_client.post("/api/scheduled-posts/bulk-reject", json={"campaign_id": campaign["id"]})
    assert resp2.json()["updated"] == []
    assert resp2.json()["skipped"] == 2


def test_bulk_action_requires_exactly_one_of_post_ids_or_campaign_id(authed_client):
    resp = authed_client.post("/api/scheduled-posts/bulk-approve", json={})
    assert resp.status_code == 422


def test_bulk_schedule_groups_images_into_carousel_posts_with_trailing_partial_chunk(authed_client, test_user):
    account_id = _seed_social_account(test_user.id)
    job_id, image_ids = _seed_batch_job_with_images(test_user.id, campaign_id=None, num_images=7)

    resp = authed_client.post(
        "/api/scheduled-posts/bulk",
        json={
            "batch_job_id": job_id,
            "social_account_id": account_id,
            "platform": "facebook_page",
            "start_date": datetime.now(timezone.utc).isoformat(),
            "images_per_post": 3,
        },
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()["created"]
    assert len(created) == 3
    sizes = sorted(len(p["image_ids"]) for p in created)
    assert sizes == [1, 3, 3]

    all_scheduled_ids = [i for p in created for i in p["image_ids"]]
    assert sorted(all_scheduled_ids) == sorted(image_ids)


def test_bulk_schedule_dedup_respects_a_manually_created_multi_image_post(authed_client, test_user):
    account_id = _seed_social_account(test_user.id)
    job_id, image_ids = _seed_batch_job_with_images(test_user.id, campaign_id=None, num_images=4)

    manual = authed_client.post(
        "/api/scheduled-posts",
        json={
            "batch_job_id": job_id,
            "image_ids": image_ids[:2],
            "social_account_id": account_id,
            "platform": "facebook_page",
            "suggested_date": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
    )
    assert manual.status_code == 201, manual.text

    resp = authed_client.post(
        "/api/scheduled-posts/bulk",
        json={
            "batch_job_id": job_id,
            "social_account_id": account_id,
            "platform": "facebook_page",
            "start_date": datetime.now(timezone.utc).isoformat(),
        },
    )
    body = resp.json()
    assert body["skipped_already_scheduled"] == 2
    assert {p["image_id"] for p in body["created"]} == set(image_ids[2:])
