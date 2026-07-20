import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import main as main_module
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import Notification

    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        session.query(Notification).delete()
        session.commit()
    finally:
        session.close()

    with TestClient(main_module.app) as test_client:
        yield test_client


@pytest.fixture
def seeded_notification(authed_client, test_user):
    from app.database import SessionLocal
    from app.models.db_models import Notification

    session = SessionLocal()
    try:
        notification = Notification(user_id=test_user.id, type="content_ready_for_review", message="Test notification")
        session.add(notification)
        session.commit()
        session.refresh(notification)
        return notification.id
    finally:
        session.close()


def test_delete_notification_removes_it(authed_client, seeded_notification):
    resp = authed_client.delete(f"/api/notifications/{seeded_notification}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    assert authed_client.get("/api/notifications").json() == []


def test_delete_missing_notification_is_404(authed_client):
    resp = authed_client.delete("/api/notifications/does-not-exist")
    assert resp.status_code == 404


def test_unauthenticated_request_is_rejected(client):
    resp = client.get("/api/notifications")
    assert resp.status_code == 401


def test_cannot_delete_another_tenants_notification(authed_client, other_authed_client, seeded_notification):
    resp = other_authed_client.delete(f"/api/notifications/{seeded_notification}")
    assert resp.status_code == 404
