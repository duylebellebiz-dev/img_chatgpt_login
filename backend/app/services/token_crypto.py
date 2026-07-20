"""Encrypts SocialAccount access tokens at rest with Fernet (symmetric,
authenticated encryption) using TOKEN_ENCRYPTION_KEY. Mock mode (no key
configured) stores tokens as a plainly-tagged mock value instead of
encrypting, matching the mock conventions in agent_service/image_service.
"""

from cryptography.fernet import Fernet, InvalidToken

from app.config import Settings, get_settings

_MOCK_PREFIX = "mock:"


def _fernet(settings: Settings) -> Fernet | None:
    if not settings.token_encryption_key:
        return None
    return Fernet(settings.token_encryption_key.encode("utf-8"))


def encrypt_token(token: str, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    fernet = _fernet(settings)
    if fernet is None:
        return f"{_MOCK_PREFIX}{token}"
    return fernet.encrypt(token.encode("utf-8")).decode("utf-8")


def decrypt_token(encrypted: str, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    if encrypted.startswith(_MOCK_PREFIX):
        return encrypted[len(_MOCK_PREFIX) :]
    fernet = _fernet(settings)
    if fernet is None:
        raise ValueError("TOKEN_ENCRYPTION_KEY is not configured; cannot decrypt a real token")
    try:
        return fernet.decrypt(encrypted.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Stored access token could not be decrypted") from exc
