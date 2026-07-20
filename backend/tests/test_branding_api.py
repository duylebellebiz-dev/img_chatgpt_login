import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import main as main_module
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import SalonBranding
    from app.services.auth_service import SESSION_COOKIE_NAME, create_session_token
    from conftest import _make_user

    Base.metadata.create_all(bind=engine)

    user = _make_user("salon", "Test Salon")

    # SalonBranding is per-tenant, but this on-disk SQLite DB is shared
    # across test files run in the same session — clear any leftover row
    # for this fresh user_id regardless of run order (there shouldn't be
    # one, since user_id is brand new, but keeps the fixture idempotent).
    session = SessionLocal()
    try:
        session.query(SalonBranding).filter(SalonBranding.user_id == user.id).delete()
        session.commit()
    finally:
        session.close()

    with TestClient(main_module.app) as test_client:
        test_client.cookies.set(SESSION_COOKIE_NAME, create_session_token(user.id))
        yield test_client


def test_get_logo_is_null_before_any_upload(client):
    resp = client.get("/api/branding/logo")
    assert resp.status_code == 200
    assert resp.json()["logo_url"] is None


def test_upload_logo_returns_logo_url(client, tiny_png_bytes):
    resp = client.post("/api/branding/logo", files={"logo": ("logo.png", tiny_png_bytes, "image/png")})
    assert resp.status_code == 201, resp.text
    logo_url = resp.json()["logo_url"]
    assert logo_url
    assert logo_url.startswith("/media/branding/")

    get_resp = client.get("/api/branding/logo")
    assert get_resp.json()["logo_url"] == logo_url


def test_uploading_a_new_logo_replaces_the_old_one(client, tiny_png_bytes):
    first = client.post("/api/branding/logo", files={"logo": ("first.png", tiny_png_bytes, "image/png")})
    second = client.post("/api/branding/logo", files={"logo": ("second.png", tiny_png_bytes, "image/png")})
    assert second.status_code == 201

    get_resp = client.get("/api/branding/logo")
    assert get_resp.json()["logo_url"] == second.json()["logo_url"]

    from app.config import get_settings
    from pathlib import Path

    branding_dir = Path(get_settings().storage_path) / "branding"
    assert len(list(branding_dir.glob("logo.*"))) == 1  # old file was replaced, not left behind


def test_delete_logo_clears_it(client, tiny_png_bytes):
    client.post("/api/branding/logo", files={"logo": ("logo.png", tiny_png_bytes, "image/png")})
    resp = client.delete("/api/branding/logo")
    assert resp.status_code == 200
    assert resp.json()["logo_url"] is None

    get_resp = client.get("/api/branding/logo")
    assert get_resp.json()["logo_url"] is None
