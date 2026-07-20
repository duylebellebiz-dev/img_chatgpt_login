import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import main as main_module
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import BatchJob, Campaign, GeneratedImage, ScheduledPost

    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        session.query(ScheduledPost).delete()
        session.query(GeneratedImage).delete()
        session.query(BatchJob).delete()
        session.query(Campaign).delete()
        session.commit()
    finally:
        session.close()

    with TestClient(main_module.app) as test_client:
        yield test_client


def _seed_batch_job(campaign_id: str | None = None) -> str:
    from app.database import SessionLocal
    from app.models.db_models import BatchJob

    session = SessionLocal()
    try:
        job = BatchJob(pairing_mode="one_to_one", num_images=1, status="completed", campaign_id=campaign_id)
        session.add(job)
        session.commit()
        session.refresh(job)
        return job.id
    finally:
        session.close()


def test_create_and_get_campaign_summary_counts(authed_client):
    resp = authed_client.post("/api/campaigns", json={"name": "He 2026 - luxury nail", "description": "summer push"})
    assert resp.status_code == 201, resp.text
    campaign = resp.json()

    _seed_batch_job(campaign_id=campaign["id"])
    _seed_batch_job(campaign_id=campaign["id"])

    detail = authed_client.get(f"/api/campaigns/{campaign['id']}").json()
    assert detail["batch_job_count"] == 2
    assert len(detail["batch_jobs"]) == 2


def test_batch_job_created_without_campaign_still_works(authed_client):
    job_id = _seed_batch_job(campaign_id=None)
    from app.database import SessionLocal
    from app.models.db_models import BatchJob

    session = SessionLocal()
    try:
        job = session.get(BatchJob, job_id)
        assert job.campaign_id is None
    finally:
        session.close()


def test_deleting_a_campaign_nulls_out_batch_job_campaign_id_instead_of_erroring(authed_client):
    campaign = authed_client.post("/api/campaigns", json={"name": "Temp campaign"}).json()
    job_id = _seed_batch_job(campaign_id=campaign["id"])

    resp = authed_client.delete(f"/api/campaigns/{campaign['id']}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    from app.database import SessionLocal
    from app.models.db_models import BatchJob

    session = SessionLocal()
    try:
        job = session.get(BatchJob, job_id)
        assert job is not None
        assert job.campaign_id is None
    finally:
        session.close()


def test_unauthenticated_request_is_rejected(client):
    resp = client.get("/api/campaigns")
    assert resp.status_code == 401


def test_cannot_see_another_tenants_campaign(authed_client, other_authed_client):
    campaign = authed_client.post("/api/campaigns", json={"name": "Private campaign"}).json()

    assert other_authed_client.get(f"/api/campaigns/{campaign['id']}").status_code == 404
    assert campaign["id"] not in [c["id"] for c in other_authed_client.get("/api/campaigns").json()]
