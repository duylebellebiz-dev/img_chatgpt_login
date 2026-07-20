import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import main as main_module
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import BatchJob, Campaign, GeneratedImage, PostMetrics, ScheduledPost, SocialAccount

    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        session.query(PostMetrics).delete()
        session.query(ScheduledPost).delete()
        session.query(SocialAccount).delete()
        session.query(GeneratedImage).delete()
        session.query(BatchJob).delete()
        session.query(Campaign).delete()
        session.commit()
    finally:
        session.close()

    with TestClient(main_module.app) as test_client:
        yield test_client


def test_empty_state_returns_zeroed_summary(authed_client):
    resp = authed_client.get("/api/performance/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_posts_tracked"] == 0
    assert body["total_reach"] == 0
    assert body["top_designs"] == []


def _seed_posted_post_with_metrics(user_id, campaign_id=None, reach=100, likes=10, comments=2, shares=1):
    from app.database import SessionLocal
    from app.models.db_models import BatchJob, GeneratedImage, PostMetrics, ScheduledPost, SocialAccount

    session = SessionLocal()
    try:
        job = BatchJob(user_id=user_id, pairing_mode="one_to_one", num_images=1, status="completed", campaign_id=campaign_id)
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
            user_id=user_id, platform="facebook_page", account_id="acct-1", name="Acct", access_token_encrypted="mock:token"
        )
        session.add(account)
        session.flush()

        post = ScheduledPost(
            user_id=user_id,
            batch_job_id=job.id,
            image_id=image.id,
            social_account_id=account.id,
            platform="facebook_page",
            status="posted",
            platform_post_id="post-1",
            campaign_id=campaign_id,
        )
        session.add(post)
        session.flush()

        metrics = PostMetrics(
            scheduled_post_id=post.id, platform="facebook_page", reach=reach, likes=likes, comments=comments, shares=shares
        )
        session.add(metrics)
        session.commit()
        return post.id
    finally:
        session.close()


def test_seeded_state_ranks_top_designs_and_sums_totals(authed_client, test_user):
    _seed_posted_post_with_metrics(test_user.id, reach=100, likes=10, comments=2, shares=1)
    _seed_posted_post_with_metrics(test_user.id, reach=50, likes=1, comments=0, shares=0)

    resp = authed_client.get("/api/performance/summary")
    body = resp.json()
    assert body["total_posts_tracked"] == 2
    assert body["total_reach"] == 150
    assert len(body["top_designs"]) == 2
    assert body["top_designs"][0]["engagement"] >= body["top_designs"][1]["engagement"]


def test_summary_respects_campaign_id_filter(authed_client, test_user):
    from app.database import SessionLocal
    from app.models.db_models import Campaign

    session = SessionLocal()
    try:
        campaign = Campaign(user_id=test_user.id, name="Filtered campaign")
        session.add(campaign)
        session.commit()
        session.refresh(campaign)
        campaign_id = campaign.id
    finally:
        session.close()

    _seed_posted_post_with_metrics(test_user.id, campaign_id=campaign_id, reach=100)
    _seed_posted_post_with_metrics(test_user.id, campaign_id=None, reach=999)

    resp = authed_client.get("/api/performance/summary", params={"campaign_id": campaign_id})
    body = resp.json()
    assert body["total_reach"] == 100


def test_summary_excludes_another_tenants_posts(authed_client, other_authed_client, test_user):
    _seed_posted_post_with_metrics(test_user.id, reach=100)

    body = other_authed_client.get("/api/performance/summary").json()
    assert body["total_posts_tracked"] == 0
    assert body["total_reach"] == 0


def _seed_posted_carousel_post_with_metrics(user_id, num_images=3, reach=100, likes=10, comments=2, shares=1):
    from app.database import SessionLocal
    from app.models.db_models import BatchJob, GeneratedImage, PostMetrics, ScheduledPost, SocialAccount

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
            status="posted",
            platform_post_id="post-carousel-1",
        )
        session.add(post)
        session.flush()

        metrics = PostMetrics(
            scheduled_post_id=post.id, platform="facebook_page", reach=reach, likes=likes, comments=comments, shares=shares
        )
        session.add(metrics)
        session.commit()
        return post.id, image_ids
    finally:
        session.close()


def test_carousel_post_attributes_metrics_to_every_one_of_its_images(authed_client, test_user):
    _, image_ids = _seed_posted_carousel_post_with_metrics(test_user.id, num_images=3, reach=100, likes=10)

    resp = authed_client.get("/api/performance/summary")
    body = resp.json()
    top_design_ids = {d["image_id"] for d in body["top_designs"]}
    assert top_design_ids == set(image_ids)
    assert all(d["reach"] == 100 for d in body["top_designs"])
