import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import main as main_module
    from app.database import Base, engine
    from app.services.auth_service import SESSION_COOKIE_NAME, create_session_token
    from conftest import _make_user

    Base.metadata.create_all(bind=engine)

    user = _make_user("salon", "Test Salon")
    with TestClient(main_module.app) as test_client:
        test_client.cookies.set(SESSION_COOKIE_NAME, create_session_token(user.id))
        yield test_client


def test_create_image_edit_returns_completed_result(client, tiny_png_bytes):
    resp = client.post(
        "/api/edit",
        data={"prompt": "make the nail polish glossy red"},
        files={"image": ("photo.png", tiny_png_bytes, "image/png")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "completed"
    assert body["prompt"] == "make the nail polish glossy red"
    assert body["prompt_used"]
    assert body["original_image_url"]
    assert body["image_url"]


def test_create_image_edit_rejects_blank_prompt(client, tiny_png_bytes):
    resp = client.post(
        "/api/edit",
        data={"prompt": "   "},
        files={"image": ("photo.png", tiny_png_bytes, "image/png")},
    )
    assert resp.status_code == 422


def test_create_image_edit_requires_image_file(client):
    resp = client.post("/api/edit", data={"prompt": "brighten the photo"})
    assert resp.status_code == 422


def test_get_image_edit_returns_created_edit(client, tiny_png_bytes):
    create_resp = client.post(
        "/api/edit",
        data={"prompt": "add a soft studio background"},
        files={"image": ("photo.png", tiny_png_bytes, "image/png")},
    )
    edit_id = create_resp.json()["id"]

    get_resp = client.get(f"/api/edit/{edit_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == edit_id


def test_get_unknown_image_edit_returns_404(client):
    resp = client.get("/api/edit/does-not-exist")
    assert resp.status_code == 404


def test_create_image_edit_with_size_returns_exact_dimensions(client, tiny_png_bytes):
    resp = client.post(
        "/api/edit",
        data={"prompt": "brighten the photo", "image_width": "1080", "image_height": "1350"},
        files={"image": ("photo.png", tiny_png_bytes, "image/png")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["image_width"] == 1080
    assert body["image_height"] == 1350


def test_create_image_edit_rejects_width_without_height(client, tiny_png_bytes):
    resp = client.post(
        "/api/edit",
        data={"prompt": "brighten the photo", "image_width": "1080"},
        files={"image": ("photo.png", tiny_png_bytes, "image/png")},
    )
    assert resp.status_code == 422
