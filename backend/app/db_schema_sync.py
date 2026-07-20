"""Idempotent, additive-only schema fixups for columns added to tables that
already existed before this feature shipped. Base.metadata.create_all(...)
(see main.py) creates brand-new tables just fine, but it never alters an
already-created table - so a nullable FK column added to an existing table
(e.g. batch_jobs.campaign_id) needs a manual ALTER TABLE the first time a
deployment with an existing DB starts up after this ships.

Deliberately narrow: only handles "add a missing nullable column" on tables
that already exist. Not a migration framework - see the comment in
main.py's lifespan() for why (Phase 1 MVP, no Alembic).
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# Column type is deliberately a plain nullable VARCHAR(36), matching the
# String(36) id columns elsewhere - the FK relationship itself is enforced by
# the ORM model in db_models.py, not by a DB-level constraint added here,
# since ALTER TABLE ADD COLUMN ... REFERENCES support differs across the
# SQLite (tests) and Postgres (prod) dialects this runs against.
_COLUMNS_TO_ENSURE: dict[str, list[tuple[str, str]]] = {
    "batch_jobs": [("campaign_id", "VARCHAR(36)"), ("user_id", "VARCHAR(36)")],
    "scheduled_posts": [
        ("campaign_id", "VARCHAR(36)"),
        ("edit_id", "VARCHAR(36)"),
        ("user_id", "VARCHAR(36)"),
        ("image_ids", "JSON"),
        ("edit_ids", "JSON"),
    ],
    "edit_jobs": [("user_id", "VARCHAR(36)")],
    "image_edits": [("user_id", "VARCHAR(36)")],
    "social_accounts": [("user_id", "VARCHAR(36)")],
    "notifications": [("user_id", "VARCHAR(36)")],
    "campaigns": [
        ("user_id", "VARCHAR(36)"),
        ("auto_refill_enabled", "BOOLEAN"),
        ("auto_refill_social_account_id", "VARCHAR(36)"),
        ("auto_refill_platform", "VARCHAR(30)"),
        ("auto_refill_interval_hours", "FLOAT"),
    ],
    "salon_branding": [("user_id", "VARCHAR(36)")],
}

# scheduled_posts.batch_job_id used to be required (a post always came from a
# Batch Generator image); it's now optional so a post can instead reference a
# Photo Editor result via edit_id. Postgres supports relaxing a NOT NULL
# constraint in place; SQLite has no ALTER COLUMN at all (would need a full
# table rebuild) and only ever backs the test suite, where every table is
# freshly created via Base.metadata.create_all with the new nullable
# constraint already correct - so this step is Postgres-only.
_NULLABLE_COLUMNS_TO_RELAX: dict[str, list[str]] = {
    "scheduled_posts": ["batch_job_id"],
}


def sync_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in _COLUMNS_TO_ENSURE.items():
            if table not in table_names:
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            for col_name, col_type in columns:
                if col_name in existing:
                    continue
                logger.info("Adding missing column %s.%s", table, col_name)
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"))

        if engine.dialect.name == "postgresql":
            for table, columns in _NULLABLE_COLUMNS_TO_RELAX.items():
                if table not in table_names:
                    continue
                columns_by_name = {c["name"]: c for c in inspector.get_columns(table)}
                for col_name in columns:
                    column = columns_by_name.get(col_name)
                    if column is not None and not column["nullable"]:
                        logger.info("Dropping NOT NULL on %s.%s", table, col_name)
                        conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {col_name} DROP NOT NULL"))
