import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    from app import main as main_module
    from app.database import Base, engine
    from app.routers import edit as edit_router
    from app.services.auth_service import SESSION_COOKIE_NAME, create_session_token
    from conftest import _make_user

    Base.metadata.create_all(bind=engine)

    # API-level tests must not run the real generation pipeline; the worker
    # pipeline itself is covered directly in test_edit_batch_tasks.py.
    monkeypatch.setattr(edit_router, "process_edit_job", lambda job_id: None)

    user = _make_user("salon", "Test Salon")
    with TestClient(main_module.app) as test_client:
        test_client.cookies.set(SESSION_COOKIE_NAME, create_session_token(user.id))
        yield test_client


def _images(tiny_png_bytes, n=3):
    return [("images", (f"p{i}.png", tiny_png_bytes, "image/png")) for i in range(n)]


def test_create_edit_batch_job_returns_pending_with_progress_total(client, tiny_png_bytes):
    resp = client.post(
        "/api/edit/batch",
        data={"prompt": "brighten the photo"},
        files=_images(tiny_png_bytes, n=4),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "pending"
    assert body["progress_total"] == 4


def test_create_edit_batch_job_rejects_blank_prompt(client, tiny_png_bytes):
    resp = client.post("/api/edit/batch", data={"prompt": "  "}, files=_images(tiny_png_bytes))
    assert resp.status_code == 422


def test_create_edit_batch_job_requires_at_least_one_image(client):
    resp = client.post("/api/edit/batch", data={"prompt": "brighten"}, files=[])
    assert resp.status_code == 422


def test_create_edit_batch_job_rejects_apply_logo_without_uploaded_logo(client, tiny_png_bytes):
    resp = client.post(
        "/api/edit/batch",
        data={"prompt": "brighten the photo", "apply_logo": "true"},
        files=_images(tiny_png_bytes),
    )
    assert resp.status_code == 422


def test_create_edit_batch_job_allows_apply_logo_once_uploaded(client, tiny_png_bytes):
    client.post("/api/branding/logo", files={"logo": ("logo.png", tiny_png_bytes, "image/png")})
    resp = client.post(
        "/api/edit/batch",
        data={"prompt": "brighten the photo", "apply_logo": "true"},
        files=_images(tiny_png_bytes),
    )
    assert resp.status_code == 201, resp.text


def test_get_edit_batch_job_returns_edits_list(client, tiny_png_bytes):
    create_resp = client.post(
        "/api/edit/batch",
        data={"prompt": "brighten the photo"},
        files=_images(tiny_png_bytes, n=2),
    )
    job_id = create_resp.json()["job_id"]

    get_resp = client.get(f"/api/edit/batch/{job_id}")
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert len(body["edits"]) == 2
    assert all(e["status"] == "generating" for e in body["edits"])


def test_get_unknown_edit_batch_job_returns_404(client):
    resp = client.get("/api/edit/batch/does-not-exist")
    assert resp.status_code == 404


def test_cancel_edit_batch_job_marks_pending_job_as_cancelled(client, tiny_png_bytes):
    create_resp = client.post(
        "/api/edit/batch",
        data={"prompt": "brighten the photo"},
        files=_images(tiny_png_bytes, n=2),
    )
    job_id = create_resp.json()["job_id"]

    cancel_resp = client.post(f"/api/edit/batch/{job_id}/cancel")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    status_resp = client.get(f"/api/edit/batch/{job_id}")
    body = status_resp.json()
    assert body["status"] == "cancelled"
    assert all(e["status"] == "cancelled" for e in body["edits"])


def test_download_edit_batch_job_before_ready_returns_409(client, tiny_png_bytes):
    create_resp = client.post(
        "/api/edit/batch",
        data={"prompt": "brighten the photo"},
        files=_images(tiny_png_bytes, n=1),
    )
    job_id = create_resp.json()["job_id"]

    resp = client.get(f"/api/edit/batch/{job_id}/download")
    assert resp.status_code == 409


def test_single_edit_endpoint_still_works_unchanged(client, tiny_png_bytes):
    """Regression guard: the original single-photo edit endpoint must keep
    working exactly as before after adding the batch edit flow."""
    resp = client.post(
        "/api/edit",
        data={"prompt": "make the nail polish glossy red"},
        files={"image": ("photo.png", tiny_png_bytes, "image/png")},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "completed"
