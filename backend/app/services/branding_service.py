"""Salon logo/watermark — a lightweight, single-deployment brand asset (not
the full "advanced brand kit" from CLAUDE.md #2/#8, just a stored logo that
media_utils.apply_watermark can stamp onto generated/edited images).
"""

from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.db_models import SalonBranding
from app.services.storage_service import StorageService


def _get_branding(db: Session, user_id: str) -> SalonBranding | None:
    return db.query(SalonBranding).filter(SalonBranding.user_id == user_id).first()


def get_logo_path(db: Session, user_id: str) -> Path | None:
    branding = _get_branding(db, user_id)
    if branding is None or not branding.logo_path:
        return None
    path = Path(branding.logo_path)
    StorageService(get_settings()).ensure_local(path)
    return path if path.exists() else None


def set_logo(db: Session, user_id: str, storage: StorageService, upload_file: UploadFile) -> Path:
    logo_path = storage.save_logo(user_id, upload_file)
    branding = _get_branding(db, user_id)
    if branding is None:
        branding = SalonBranding(user_id=user_id, logo_path=str(logo_path))
        db.add(branding)
    else:
        branding.logo_path = str(logo_path)
    db.commit()
    return logo_path
