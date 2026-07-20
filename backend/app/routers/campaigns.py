from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.schemas import CampaignCreate, CampaignOut, CampaignSummaryOut, CampaignUpdate
from app.routers.batch import _to_status_out
from app.routers.scheduled_posts import _to_out
from app.services import campaign_service
from app.services.auth_service import get_current_user_id

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@router.post("", response_model=CampaignOut, status_code=201)
def create_campaign(
    payload: CampaignCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> CampaignOut:
    return campaign_service.create_campaign(db, user_id, payload)


@router.get("", response_model=list[CampaignOut])
def list_campaigns(
    status: str | None = None, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> list[CampaignOut]:
    return campaign_service.list_campaigns(db, user_id, status)


@router.get("/{campaign_id}", response_model=CampaignSummaryOut)
def get_campaign(
    campaign_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> CampaignSummaryOut:
    campaign = campaign_service.get_campaign_or_404(db, user_id, campaign_id)
    summary = campaign_service.build_summary(db, campaign)
    return CampaignSummaryOut(
        **CampaignOut.model_validate(campaign).model_dump(),
        batch_job_count=summary["batch_job_count"],
        scheduled_post_count=summary["scheduled_post_count"],
        image_count=summary["image_count"],
        posted_count=summary["posted_count"],
        total_reach=summary["total_reach"],
        total_engagement=summary["total_engagement"],
        batch_jobs=[_to_status_out(job) for job in summary["batch_jobs"]],
        scheduled_posts=[_to_out(post, db) for post in summary["scheduled_posts"]],
    )


@router.patch("/{campaign_id}", response_model=CampaignOut)
def update_campaign(
    campaign_id: str,
    payload: CampaignUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> CampaignOut:
    campaign = campaign_service.get_campaign_or_404(db, user_id, campaign_id)
    return campaign_service.update_campaign(db, campaign, payload)


@router.delete("/{campaign_id}")
def delete_campaign(
    campaign_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> dict:
    campaign = campaign_service.get_campaign_or_404(db, user_id, campaign_id)
    campaign_service.delete_campaign(db, campaign)
    return {"ok": True}
