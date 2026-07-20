from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models.schemas import BrandingOut
from app.services import branding_service
from app.services.auth_service import get_current_user_id
from app.services.storage_service import StorageService

router = APIRouter(prefix="/api/branding", tags=["branding"])


def _to_out(user_id: str, logo_path: Path | None) -> BrandingOut:
    return BrandingOut(logo_url=f"/media/branding/{user_id}/{logo_path.name}" if logo_path else None)


@router.get("/logo", response_model=BrandingOut)
def get_logo(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)) -> BrandingOut:
    return _to_out(user_id, branding_service.get_logo_path(db, user_id))


@router.post("/logo", response_model=BrandingOut, status_code=201)
def upload_logo(
    logo: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user_id: str = Depends(get_current_user_id),
) -> BrandingOut:
    storage = StorageService(settings)
    logo_path = branding_service.set_logo(db, user_id, storage, logo)
    return _to_out(user_id, logo_path)


@router.delete("/logo", response_model=BrandingOut)
def delete_logo(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user_id: str = Depends(get_current_user_id),
) -> BrandingOut:
    storage = StorageService(settings)
    for existing in storage.branding_dir(user_id).glob("logo.*"):
        storage.cloudinary.delete_file(storage._key_for(existing))
        existing.unlink(missing_ok=True)
    branding = branding_service._get_branding(db, user_id)
    if branding is not None:
        branding.logo_path = None
        db.commit()
    return _to_out(user_id, None)
