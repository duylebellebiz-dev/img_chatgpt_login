"""Records usage for real Claude and Gemini OAuth calls, for a
monthly cost dashboard. Deliberately best-effort: a failure here must never
break the actual generation pipeline, and callers may run inside a
ThreadPoolExecutor worker thread (see batch_tasks.py), so each record_*
function opens and closes its own DB session rather than sharing one across
threads (same reasoning as batch_tasks._job_allows_processing_isolated).
"""

import calendar
import logging
from datetime import datetime, timezone

from app.config import Settings, get_settings
from app.database import SessionLocal
from app.models.db_models import ApiUsageRecord

logger = logging.getLogger(__name__)


def _anthropic_cost(input_tokens: int, output_tokens: int, settings: Settings) -> float:
    return (
        input_tokens / 1_000_000 * settings.anthropic_input_price_per_million_usd
        + output_tokens / 1_000_000 * settings.anthropic_output_price_per_million_usd
    )


def record_anthropic_usage(operation: str, model: str, response, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    db = SessionLocal()
    try:
        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "input_tokens", None) if usage else None
        output_tokens = getattr(usage, "output_tokens", None) if usage else None
        db.add(
            ApiUsageRecord(
                provider="anthropic",
                operation=operation,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                estimated_cost_usd=_anthropic_cost(input_tokens or 0, output_tokens or 0, settings),
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001 - usage recording must never break the generation pipeline
        logger.exception("Failed to record Anthropic usage for operation=%s", operation)
    finally:
        db.close()


def record_gemini_oauth_usage(operation: str, model: str, image_count: int = 1) -> None:
    db = SessionLocal()
    try:
        db.add(
            ApiUsageRecord(
                provider="gemini_oauth",
                operation=operation,
                model=model,
                input_tokens=None,
                output_tokens=None,
                image_count=image_count,
                # OAuth quota/subscription usage is not an API-key charge.
                estimated_cost_usd=0.0,
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001 - usage recording must never break the generation pipeline
        logger.exception("Failed to record Gemini OAuth usage for operation=%s", operation)
    finally:
        db.close()


def get_monthly_summary(db, year: int, month: int, settings: Settings | None = None) -> dict:
    """Deployment-wide across every tenant, not scoped per user — record_*
    is called deep inside the generation pipeline (including ThreadPoolExecutor
    workers in batch_tasks.py) with no request/user context available.
    Known gap: threading a user_id through there is deferred, since cost
    rows carry no salon-identifying content, this is a reporting-accuracy
    gap rather than a data-isolation leak."""
    settings = settings or get_settings()
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    last_day = calendar.monthrange(year, month)[1]
    end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)

    records = (
        db.query(ApiUsageRecord)
        .filter(ApiUsageRecord.created_at >= start, ApiUsageRecord.created_at <= end)
        .all()
    )

    total_cost = sum(r.estimated_cost_usd for r in records)
    anthropic_cost = sum(r.estimated_cost_usd for r in records if r.provider == "anthropic")
    gemini_oauth_requests = sum(r.image_count for r in records if r.provider == "gemini_oauth")

    return {
        "year": year,
        "month": month,
        "total_requests": len(records),
        "total_cost_usd": round(total_cost, 4),
        "anthropic_cost_usd": round(anthropic_cost, 4),
        "gemini_oauth_requests": gemini_oauth_requests,
        "budget_usd": settings.monthly_budget_usd,
    }
