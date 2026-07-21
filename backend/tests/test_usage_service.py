from types import SimpleNamespace

import pytest

from app.config import Settings
from app.services import usage_service


@pytest.fixture
def db_session():
    from app.database import Base, SessionLocal, engine
    from app.models.db_models import ApiUsageRecord

    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        session.query(ApiUsageRecord).delete()
        session.commit()
        yield session
    finally:
        session.close()


def _settings(**overrides) -> Settings:
    defaults = {
        "anthropic_input_price_per_million_usd": 3.0,
        "anthropic_output_price_per_million_usd": 15.0,
    }
    defaults.update(overrides)
    return Settings(**defaults)


def test_record_anthropic_usage_computes_cost_from_configured_pricing(db_session):
    response = SimpleNamespace(usage=SimpleNamespace(input_tokens=1_000_000, output_tokens=1_000_000))
    usage_service.record_anthropic_usage("build_prompt", "claude-sonnet-5", response, _settings())

    from app.models.db_models import ApiUsageRecord

    record = db_session.query(ApiUsageRecord).one()
    assert record.provider == "anthropic"
    assert record.estimated_cost_usd == pytest.approx(18.0)


def test_record_gemini_oauth_usage_tracks_images_without_api_cost(db_session):
    usage_service.record_gemini_oauth_usage("generate_image", "nano-banana-2", 1)

    from app.models.db_models import ApiUsageRecord

    record = db_session.query(ApiUsageRecord).one()
    assert record.provider == "gemini_oauth"
    assert record.input_tokens is None
    assert record.output_tokens is None
    assert record.image_count == 1
    assert record.estimated_cost_usd == 0.0


def test_record_usage_never_raises_even_when_reading_usage_fields_fails(db_session):
    class _BrokenUsage:
        @property
        def input_tokens(self):
            raise RuntimeError("boom")

    usage_service.record_anthropic_usage(
        "build_prompt", "claude-sonnet-5", SimpleNamespace(usage=_BrokenUsage()), _settings()
    )

    from app.models.db_models import ApiUsageRecord

    assert db_session.query(ApiUsageRecord).count() == 0


def test_get_monthly_summary_aggregates_across_providers(db_session):
    usage_service.record_anthropic_usage(
        "build_prompt",
        "claude-sonnet-5",
        SimpleNamespace(usage=SimpleNamespace(input_tokens=1_000_000, output_tokens=0)),
        _settings(),
    )
    usage_service.record_gemini_oauth_usage("generate_image", "nano-banana-2", 2)

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    summary = usage_service.get_monthly_summary(db_session, now.year, now.month, _settings())

    assert summary["total_requests"] == 2
    assert summary["anthropic_cost_usd"] == pytest.approx(3.0)
    assert summary["gemini_oauth_requests"] == 2
    assert summary["total_cost_usd"] == pytest.approx(3.0)
