"""Multi-tenant auth: every salon registers its own account (see
app/routers/auth.py) and every other table's rows are scoped to that
account's user_id. Session is a signed, timestamped httpOnly cookie
(itsdangerous carrying the user_id), not a JWT/full session store —
deliberately the smallest thing that keeps a stolen cookie from being
reusable forever while avoiding a server-side session store.
"""

import bcrypt
from fastapi import Cookie, Depends, HTTPException, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models.db_models import User

SESSION_COOKIE_NAME = "nailsocial_session"
SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60  # 7 days


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret_key, salt="nailsocial-session")


def create_session_token(user_id: str, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    return _serializer(settings).dumps({"user_id": user_id})


def verify_session_token(token: str, settings: Settings | None = None) -> str | None:
    settings = settings or get_settings()
    try:
        data = _serializer(settings).loads(token, max_age=SESSION_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    return data.get("user_id")


def get_current_user_id(
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    settings: Settings = Depends(get_settings),
) -> str:
    """FastAPI dependency protecting tenant-owned routes. Raises 401 if the
    session cookie is missing, invalid, or expired. Cheap — decodes the
    signed cookie only, no DB hit, so every router can depend on this for
    owner-scoping without an extra query per request."""
    user_id = verify_session_token(session, settings) if session else None
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user_id


def get_current_user(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> User:
    """Loads the full User row — only needed where profile data (email/
    salon_name) must be returned, e.g. GET /api/auth/me."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user
