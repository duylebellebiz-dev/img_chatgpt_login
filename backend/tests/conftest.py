import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

# Point at a throwaway SQLite DB and mock-mode API keys before any app module
# is imported, so tests never touch the real Postgres instance or make real
# Claude/Gemini calls.
os.environ["DATABASE_URL"] = f"sqlite:///{BACKEND_ROOT / 'test_nailsocial.db'}"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["IMAGE_PROVIDER"] = "mock"
os.environ["STORAGE_ROOT"] = str(BACKEND_ROOT / "test_storage")
# Otherwise every `client` fixture across the suite (each one spins up the
# app via TestClient, triggering lifespan startup) would spawn background
# recovery threads for any BatchJob a previous, unrelated test left at
# status="processing" in the shared test_nailsocial.db — mutating that row
# from a thread outside the current test's control. See
# batch_tasks.resume_orphaned_batch_jobs / config.py.
os.environ["RESUME_ORPHANED_BATCH_JOBS_ON_STARTUP"] = "false"
# A developer's local .env may have real Facebook/Cloudinary credentials
# configured (see backend/.env.example) — blank them here so the test suite
# always runs against the same mock/unconfigured (local-disk-only) defaults
# regardless of what the developer running it has set up locally.
os.environ["FACEBOOK_APP_ID"] = ""
os.environ["FACEBOOK_APP_SECRET"] = ""
os.environ["FACEBOOK_REDIRECT_URI"] = "http://localhost:8000/api/social/connect/facebook/callback"
os.environ["CLOUDINARY_CLOUD_NAME"] = ""
os.environ["CLOUDINARY_API_KEY"] = ""
os.environ["CLOUDINARY_API_SECRET"] = ""
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

import pytest  # noqa: E402


@pytest.fixture
def tiny_png_bytes() -> bytes:
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (4, 4), color=(255, 0, 0)).save(buf, format="PNG")
    return buf.getvalue()


def _make_user(label: str, salon_name: str):
    """Inserts a User row directly (no HTTP round trip). The DB isn't reset
    between test functions in the same module (see e.g. test_campaigns_api.py
    clearing its own tables per-test), so email is suffixed with a fresh
    uuid every call to avoid colliding with a same-named user from an
    earlier test in the same module."""
    import uuid

    from app.database import SessionLocal
    from app.models.db_models import User
    from app.services import auth_service

    email = f"{label}-{uuid.uuid4().hex[:8]}@test.com"
    session = SessionLocal()
    try:
        user = User(email=email, password_hash=auth_service.hash_password("test-password"), salon_name=salon_name)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    finally:
        session.close()


@pytest.fixture
def test_user(client):
    """A registered tenant, inserted directly via the DB (no HTTP round
    trip) — depends on `client` only so table creation has already run."""
    return _make_user("salon", "Test Salon")


@pytest.fixture
def other_user(client):
    """A second, distinct tenant for cross-tenant isolation tests."""
    return _make_user("other-salon", "Other Salon")


@pytest.fixture
def authed_client(client, test_user):
    from app.services.auth_service import SESSION_COOKIE_NAME, create_session_token

    client.cookies.set(SESSION_COOKIE_NAME, create_session_token(test_user.id))
    return client


@pytest.fixture
def other_authed_client(client, other_user):
    """A second, independent TestClient (own cookie jar) logged in as
    other_user, so a test can hold both identities at once without one
    client's session cookie clobbering the other's."""
    from fastapi.testclient import TestClient

    from app import main as main_module
    from app.services.auth_service import SESSION_COOKIE_NAME, create_session_token

    other_client = TestClient(main_module.app)
    other_client.cookies.set(SESSION_COOKIE_NAME, create_session_token(other_user.id))
    return other_client
