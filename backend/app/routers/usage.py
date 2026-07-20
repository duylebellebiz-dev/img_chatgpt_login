from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.db_models import ApiUsageRecord
from app.models.schemas import ApiUsageRecordOut, UsageSummaryOut
from app.services import usage_service
from app.services.auth_service import get_current_user_id

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("/summary", response_model=UsageSummaryOut)
def get_usage_summary(
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    _user_id: str = Depends(get_current_user_id),
) -> UsageSummaryOut:
    # NOTE: deployment-wide, not scoped per tenant yet — see usage_service.py.
    now = datetime.now(timezone.utc)
    summary = usage_service.get_monthly_summary(db, year or now.year, month or now.month)
    return UsageSummaryOut(**summary)


@router.get("/records", response_model=list[ApiUsageRecordOut])
def list_usage_records(
    provider: str | None = None,
    operation: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _user_id: str = Depends(get_current_user_id),
) -> list[ApiUsageRecord]:
    query = db.query(ApiUsageRecord)
    if provider:
        query = query.filter(ApiUsageRecord.provider == provider)
    if operation:
        query = query.filter(ApiUsageRecord.operation == operation)
    return query.order_by(ApiUsageRecord.created_at.desc()).limit(limit).all()
