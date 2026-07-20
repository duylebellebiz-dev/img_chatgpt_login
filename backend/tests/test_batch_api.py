import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    from app import main as main_module
    from app.database import Base, engine
    from app.routers import batch as batch_router
    from app.services.auth_service import SESSION_COOKIE_NAME, create_session_token
    from conftest import _make_user

    Base.metadata.create_all(bind=engine)

    # Batch creation must not run the real generation pipeline in these
    # API-level tests; the worker pipeline is covered by test_batch_tasks.py.
    monkeypatch.setattr(batch_router, "process_batch_job", lambda job_id: None)

    user = _make_user("salon", "Test Salon")
    with TestClient(main_module.app) as test_client:
        test_client.cookies.set(SESSION_COOKIE_NAME, create_session_token(user.id))
        yield test_client


def _upload_files(tiny_png_bytes, n_designs=3, n_poses=2):
    design_files = [("design_images", (f"d{i}.png", tiny_png_bytes, "image/png")) for i in range(n_designs)]
    pose_files = [("pose_images", (f"p{i}.png", tiny_png_bytes, "image/png")) for i in range(n_poses)]
    return design_files + pose_files


def test_create_batch_job_keeps_requested_count_when_within_mode_limit(client, tiny_png_bytes):
    files = _upload_files(tiny_png_bytes, n_designs=3, n_poses=2)
    resp = client.post(
        "/api/batch",
        data={"pairing_mode": "cross", "num_images": "6", "description": "summer luxury"},
        files=files,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["requested_num_images"] == 6
    assert body["approved_num_images"] == 6
    assert body["progress_total"] == 6
    assert body["status"] == "pending"
    assert body["was_capped"] is False


@pytest.mark.parametrize("count", [0, -5, 101, 500])
def test_create_batch_job_rejects_invalid_count(client, tiny_png_bytes, count):
    files = _upload_files(tiny_png_bytes)
    resp = client.post(
        "/api/batch",
        data={"pairing_mode": "cross", "num_images": str(count), "description": "x"},
        files=files,
    )
    assert resp.status_code == 422


def test_create_batch_job_caps_one_to_one_count_from_input_volume(client, tiny_png_bytes):
    files = _upload_files(tiny_png_bytes, n_designs=4, n_poses=4)
    resp = client.post(
        "/api/batch",
        data={"pairing_mode": "one_to_one", "num_images": "20", "description": "x"},
        files=files,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["requested_num_images"] == 20
    assert body["approved_num_images"] == 8
    assert body["progress_total"] == 8
    assert body["was_capped"] is True
    assert "capped to 8" in body["cap_message"]


def test_create_batch_job_caps_random_count_from_input_volume(client, tiny_png_bytes):
    files = _upload_files(tiny_png_bytes, n_designs=4, n_poses=4)
    resp = client.post(
        "/api/batch",
        data={"pairing_mode": "random", "num_images": "20", "description": "x"},
        files=files,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["approved_num_images"] == 12
    assert body["progress_total"] == 12
    assert body["was_capped"] is True


def test_create_batch_job_caps_cross_count_to_total_unique_pairs(client, tiny_png_bytes):
    files = _upload_files(tiny_png_bytes, n_designs=4, n_poses=4)
    resp = client.post(
        "/api/batch",
        data={"pairing_mode": "cross", "num_images": "20", "description": "x"},
        files=files,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["approved_num_images"] == 16
    assert body["progress_total"] == 16
    assert body["was_capped"] is True


def test_create_batch_job_requires_at_least_one_design_and_pose(client, tiny_png_bytes):
    pose_only = [("pose_images", ("p0.png", tiny_png_bytes, "image/png"))]
    resp = client.post(
        "/api/batch",
        data={"pairing_mode": "cross", "num_images": "5"},
        files=pose_only,
    )
    assert resp.status_code == 422


def test_get_unknown_job_returns_404(client):
    resp = client.get("/api/batch/does-not-exist")
    assert resp.status_code == 404


def test_cancel_batch_job_marks_pending_job_as_cancelled(client, tiny_png_bytes):
    files = _upload_files(tiny_png_bytes, n_designs=1, n_poses=1)
    create_resp = client.post(
        "/api/batch",
        data={"pairing_mode": "one_to_one", "num_images": "2", "description": "cancel me"},
        files=files,
    )
    assert create_resp.status_code == 201, create_resp.text
    job_id = create_resp.json()["job_id"]

    cancel_resp = client.post(f"/api/batch/{job_id}/cancel")
    assert cancel_resp.status_code == 200, cancel_resp.text
    cancel_body = cancel_resp.json()
    assert cancel_body["job_id"] == job_id
    assert cancel_body["status"] == "cancelled"

    status_resp = client.get(f"/api/batch/{job_id}")
    assert status_resp.status_code == 200
    status_body = status_resp.json()
    assert status_body["status"] == "cancelled"
    assert status_body["progress_total"] == 2


def test_create_batch_job_stores_and_returns_requested_size(client, tiny_png_bytes):
    files = _upload_files(tiny_png_bytes, n_designs=1, n_poses=1)
    create_resp = client.post(
        "/api/batch",
        data={
            "pairing_mode": "one_to_one",
            "num_images": "1",
            "description": "story format",
            "image_width": "1080",
            "image_height": "1920",
        },
        files=files,
    )
    assert create_resp.status_code == 201, create_resp.text
    job_id = create_resp.json()["job_id"]

    status_resp = client.get(f"/api/batch/{job_id}")
    body = status_resp.json()
    assert body["image_width"] == 1080
    assert body["image_height"] == 1920


def test_create_batch_job_allows_omitting_size(client, tiny_png_bytes):
    files = _upload_files(tiny_png_bytes, n_designs=1, n_poses=1)
    resp = client.post(
        "/api/batch",
        data={"pairing_mode": "one_to_one", "num_images": "1", "description": "x"},
        files=files,
    )
    assert resp.status_code == 201, resp.text
    job_id = resp.json()["job_id"]
    body = client.get(f"/api/batch/{job_id}").json()
    assert body["image_width"] is None
    assert body["image_height"] is None


def test_create_batch_job_rejects_width_without_height(client, tiny_png_bytes):
    files = _upload_files(tiny_png_bytes, n_designs=1, n_poses=1)
    resp = client.post(
        "/api/batch",
        data={"pairing_mode": "one_to_one", "num_images": "1", "description": "x", "image_width": "1080"},
        files=files,
    )
    assert resp.status_code == 422


def test_create_batch_job_rejects_out_of_range_size(client, tiny_png_bytes):
    files = _upload_files(tiny_png_bytes, n_designs=1, n_poses=1)
    resp = client.post(
        "/api/batch",
        data={
            "pairing_mode": "one_to_one",
            "num_images": "1",
            "description": "x",
            "image_width": "50",
            "image_height": "50",
        },
        files=files,
    )
    assert resp.status_code == 422


def test_health_endpoint_reports_mock_mode(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["mock_claude"] is True
    assert body["image_provider"] == "mock"
    assert body["mock_images"] is True


def test_list_batch_jobs_returns_own_jobs_newest_first(client, tiny_png_bytes):
    files = _upload_files(tiny_png_bytes)
    first = client.post("/api/batch", data={"pairing_mode": "one_to_one", "num_images": "1"}, files=files).json()
    second = client.post("/api/batch", data={"pairing_mode": "one_to_one", "num_images": "1"}, files=files).json()

    resp = client.get("/api/batch")
    assert resp.status_code == 200, resp.text
    job_ids = [j["job_id"] for j in resp.json()]
    assert job_ids[:2] == [second["job_id"], first["job_id"]]


def test_list_batch_jobs_does_not_include_generated_images(client, tiny_png_bytes):
    files = _upload_files(tiny_png_bytes)
    client.post("/api/batch", data={"pairing_mode": "one_to_one", "num_images": "1"}, files=files)

    resp = client.get("/api/batch")
    assert "images" not in resp.json()[0]


def test_list_batch_jobs_is_scoped_to_the_current_tenant(client, tiny_png_bytes):
    from app import main as main_module
    from app.services.auth_service import SESSION_COOKIE_NAME, create_session_token
    from conftest import _make_user

    files = _upload_files(tiny_png_bytes)
    client.post("/api/batch", data={"pairing_mode": "one_to_one", "num_images": "1"}, files=files)

    other_user = _make_user("other-salon", "Other Salon")
    other_client = TestClient(main_module.app)
    other_client.cookies.set(SESSION_COOKIE_NAME, create_session_token(other_user.id))

    assert other_client.get("/api/batch").json() == []
