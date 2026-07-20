import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import main as main_module
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import SocialAccount
    from app.services.auth_service import SESSION_COOKIE_NAME, create_session_token
    from conftest import _make_user

    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        session.query(SocialAccount).delete()
        session.commit()
    finally:
        session.close()

    user = _make_user("salon", "Test Salon")
    with TestClient(main_module.app) as test_client:
        test_client.cookies.set(SESSION_COOKIE_NAME, create_session_token(user.id))
        yield test_client


def test_connect_facebook_redirects_to_a_navigable_mock_url(client):
    """Regression guard: an earlier version redirected to "mock://..." which
    a real browser can't load, leaving "Connect Facebook" a dead click."""
    resp = client.get("/api/social/connect/facebook", follow_redirects=False)
    assert resp.status_code == 307
    location = resp.headers["location"]
    assert location.startswith("http://")
    assert "code=" in location and "state=" in location


def _run_connect_flow(client):
    connect_resp = client.get("/api/social/connect/facebook", follow_redirects=False)
    callback_url = connect_resp.headers["location"]
    callback_path = callback_url.split("http://localhost:8000", 1)[-1]
    return client.get(callback_path, follow_redirects=False)


def test_connect_flow_lands_pages_in_pending_selection_not_active(client):
    """A Facebook login can manage many Pages — connecting must not
    auto-activate all of them, the admin has to pick one (see
    test_selecting_a_page_activates_it)."""
    callback_resp = _run_connect_flow(client)
    assert callback_resp.status_code == 307
    assert "tab=social" in callback_resp.headers["location"]

    active_resp = client.get("/api/social/accounts")
    assert active_resp.json() == []

    pending_resp = client.get("/api/social/accounts", params={"status": "pending_selection"})
    pending = pending_resp.json()
    # Instagram account resolution is enabled (read_insights/
    # instagram_manage_insights are now requested — see meta_service.py
    # module docstring), so the Page's linked Instagram account shows up
    # alongside it, both still pending selection.
    assert len(pending) == 2
    assert {a["platform"] for a in pending} == {"facebook_page", "instagram_business"}


def test_selecting_a_page_activates_it_and_its_linked_instagram_account(client):
    _run_connect_flow(client)
    pending = client.get("/api/social/accounts", params={"status": "pending_selection"}).json()
    page = next(a for a in pending if a["platform"] == "facebook_page")

    select_resp = client.post(f"/api/social/accounts/{page['id']}/select")
    assert select_resp.status_code == 200
    activated = select_resp.json()
    assert {a["platform"] for a in activated} == {"facebook_page", "instagram_business"}
    assert all(a["status"] == "active" for a in activated)

    active = client.get("/api/social/accounts").json()
    assert len(active) == 2

    remaining_pending = client.get("/api/social/accounts", params={"status": "pending_selection"}).json()
    assert remaining_pending == []


def test_callback_rejects_mismatched_state(client):
    client.get("/api/social/connect/facebook", follow_redirects=False)
    resp = client.get(
        "/api/social/connect/facebook/callback",
        params={"code": "mock-auth-code", "state": "not-the-real-state"},
    )
    assert resp.status_code == 400
