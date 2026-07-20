import bcrypt

from app.config import Settings
from app.services import auth_service


def _settings(**overrides) -> Settings:
    defaults = {"session_secret_key": "test-secret"}
    defaults.update(overrides)
    return Settings(**defaults)


def test_verify_password_accepts_correct_password():
    password_hash = bcrypt.hashpw(b"correct-horse", bcrypt.gensalt()).decode()
    assert auth_service.verify_password("correct-horse", password_hash) is True


def test_verify_password_rejects_wrong_password():
    password_hash = bcrypt.hashpw(b"correct-horse", bcrypt.gensalt()).decode()
    assert auth_service.verify_password("wrong-password", password_hash) is False


def test_verify_password_rejects_empty_hash():
    assert auth_service.verify_password("anything", "") is False


def test_hash_password_round_trips_with_verify_password():
    password_hash = auth_service.hash_password("correct-horse")
    assert auth_service.verify_password("correct-horse", password_hash) is True
    assert auth_service.verify_password("wrong-password", password_hash) is False


def test_session_token_round_trips_user_id():
    settings = _settings()
    token = auth_service.create_session_token("user-123", settings)
    assert auth_service.verify_session_token(token, settings) == "user-123"


def test_session_token_rejects_tampered_token():
    settings = _settings()
    token = auth_service.create_session_token("user-123", settings)
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")
    assert auth_service.verify_session_token(tampered, settings) is None


def test_session_token_rejects_token_signed_with_different_secret():
    token = auth_service.create_session_token("user-123", _settings(session_secret_key="secret-a"))
    assert auth_service.verify_session_token(token, _settings(session_secret_key="secret-b")) is None


def test_get_current_user_id_requires_a_session_cookie():
    from fastapi import HTTPException

    settings = _settings()
    try:
        auth_service.get_current_user_id(session=None, settings=settings)
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 401


def test_get_current_user_id_rejects_invalid_token():
    from fastapi import HTTPException

    settings = _settings()
    try:
        auth_service.get_current_user_id(session="not-a-real-token", settings=settings)
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 401


def test_get_current_user_id_accepts_a_valid_token():
    settings = _settings()
    token = auth_service.create_session_token("user-123", settings)
    assert auth_service.get_current_user_id(session=token, settings=settings) == "user-123"
