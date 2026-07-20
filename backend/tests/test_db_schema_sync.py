from sqlalchemy import create_engine, inspect, text

from app.db_schema_sync import sync_schema


def _engine_with_pre_migration_tables():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE batch_jobs (id VARCHAR(36) PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE scheduled_posts (id VARCHAR(36) PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE campaigns (id VARCHAR(36) PRIMARY KEY)"))
    return engine


def test_sync_schema_adds_missing_campaign_id_columns():
    engine = _engine_with_pre_migration_tables()

    sync_schema(engine)

    inspector = inspect(engine)
    batch_job_columns = {c["name"] for c in inspector.get_columns("batch_jobs")}
    scheduled_post_columns = {c["name"] for c in inspector.get_columns("scheduled_posts")}
    assert "campaign_id" in batch_job_columns
    assert "campaign_id" in scheduled_post_columns


def test_sync_schema_adds_missing_user_id_columns():
    engine = _engine_with_pre_migration_tables()

    sync_schema(engine)

    inspector = inspect(engine)
    batch_job_columns = {c["name"] for c in inspector.get_columns("batch_jobs")}
    scheduled_post_columns = {c["name"] for c in inspector.get_columns("scheduled_posts")}
    assert "user_id" in batch_job_columns
    assert "user_id" in scheduled_post_columns


def test_sync_schema_adds_missing_auto_refill_columns():
    engine = _engine_with_pre_migration_tables()

    sync_schema(engine)

    inspector = inspect(engine)
    campaign_columns = {c["name"] for c in inspector.get_columns("campaigns")}
    assert {"auto_refill_enabled", "auto_refill_social_account_id", "auto_refill_platform", "auto_refill_interval_hours"} <= campaign_columns


def test_sync_schema_adds_missing_image_ids_and_edit_ids_columns():
    engine = _engine_with_pre_migration_tables()

    sync_schema(engine)

    inspector = inspect(engine)
    scheduled_post_columns = {c["name"] for c in inspector.get_columns("scheduled_posts")}
    assert {"image_ids", "edit_ids"} <= scheduled_post_columns


def test_sync_schema_is_idempotent():
    engine = _engine_with_pre_migration_tables()

    sync_schema(engine)
    sync_schema(engine)  # must not raise a duplicate-column error

    inspector = inspect(engine)
    batch_job_columns = [c["name"] for c in inspector.get_columns("batch_jobs")]
    assert batch_job_columns.count("campaign_id") == 1


def test_sync_schema_skips_tables_that_dont_exist_yet():
    engine = create_engine("sqlite:///:memory:")
    # No tables at all — must not raise.
    sync_schema(engine)
