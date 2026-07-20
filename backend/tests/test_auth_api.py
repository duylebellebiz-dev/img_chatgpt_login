import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import main as main_module
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import User

    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        session.query(User).delete()
        session.commit()
    finally:
        session.close()

    with TestClient(main_module.app) as test_client:
        yield test_client


def test_register_then_me_returns_the_new_account(client):
    resp = client.post(
        "/api/auth/register",
        json={"email": "owner@salon.com", "password": "hunter2", "salon_name": "Glow Nails"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "owner@salon.com"
    assert body["salon_name"] == "Glow Nails"

    me_resp = client.get("/api/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "owner@salon.com"


def test_register_rejects_duplicate_email(client):
    client.post("/api/auth/register", json={"email": "owner@salon.com", "password": "hunter2", "salon_name": "Glow Nails"})
    resp = client.post("/api/auth/register", json={"email": "owner@salon.com", "password": "different", "salon_name": "Other"})
    assert resp.status_code == 409


def test_login_with_correct_credentials_succeeds(client):
    client.post("/api/auth/register", json={"email": "owner@salon.com", "password": "hunter2", "salon_name": "Glow Nails"})
    client.post("/api/auth/logout")

    resp = client.post("/api/auth/login", json={"email": "owner@salon.com", "password": "hunter2"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "owner@salon.com"


def test_login_with_wrong_password_is_rejected(client):
    client.post("/api/auth/register", json={"email": "owner@salon.com", "password": "hunter2", "salon_name": "Glow Nails"})
    resp = client.post("/api/auth/login", json={"email": "owner@salon.com", "password": "wrong"})
    assert resp.status_code == 401


def test_login_with_unknown_email_is_rejected(client):
    resp = client.post("/api/auth/login", json={"email": "nobody@salon.com", "password": "whatever"})
    assert resp.status_code == 401


def test_logout_clears_the_session(client):
    client.post("/api/auth/register", json={"email": "owner@salon.com", "password": "hunter2", "salon_name": "Glow Nails"})
    client.post("/api/auth/logout")
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_requires_authentication(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401
