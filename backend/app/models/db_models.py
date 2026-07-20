import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """One row per registered salon (tenant). Every other table's rows are
    scoped to a user_id — see CLAUDE.md's auth section for the ownership
    rules each router/service must enforce."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    salon_name: Mapped[str] = mapped_column(String(255), default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class BatchJob(Base):
    __tablename__ = "batch_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|processing|completed|failed|cancelled
    pairing_mode: Mapped[str] = mapped_column(String(20))  # cross|random|one_to_one
    num_images: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text, default="")

    image_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    design_paths: Mapped[list[str]] = mapped_column(JSON, default=list)
    pose_paths: Mapped[list[str]] = mapped_column(JSON, default=list)

    progress_completed: Mapped[int] = mapped_column(Integer, default=0)
    progress_total: Mapped[int] = mapped_column(Integer, default=0)

    zip_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    campaign_id: Mapped[str | None] = mapped_column(ForeignKey("campaigns.id"), nullable=True)

    images: Mapped[list["GeneratedImage"]] = relationship(
        back_populates="batch_job", cascade="all, delete-orphan"
    )
    campaign: Mapped["Campaign | None"] = relationship(back_populates="batch_jobs")


class GeneratedImage(Base):
    __tablename__ = "generated_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    batch_job_id: Mapped[str] = mapped_column(ForeignKey("batch_jobs.id"))

    design_filename: Mapped[str] = mapped_column(String(255))
    pose_filename: Mapped[str] = mapped_column(String(255))
    original_design_path: Mapped[str] = mapped_column(String(500))
    original_pose_path: Mapped[str] = mapped_column(String(500))
    variation: Mapped[int] = mapped_column(Integer, default=1)

    prompt_used: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_breakdown: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    passed: Mapped[bool] = mapped_column(default=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|generating|passed|needs_review|cancelled

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    batch_job: Mapped["BatchJob"] = relationship(back_populates="images")


class EditJob(Base):
    """A multi-image AI edit batch: the same edit instruction is applied to
    every uploaded photo (see CLAUDE.md #2 — this is Module 1's edit sibling,
    not a new module). Mirrors BatchJob's status/progress/zip shape so the
    frontend can reuse the same polling pattern."""

    __tablename__ = "edit_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|processing|completed|failed|cancelled
    prompt: Mapped[str] = mapped_column(Text)

    image_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    apply_logo: Mapped[bool] = mapped_column(default=False)

    progress_completed: Mapped[int] = mapped_column(Integer, default=0)
    progress_total: Mapped[int] = mapped_column(Integer, default=0)

    zip_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    edits: Mapped[list["ImageEdit"]] = relationship(back_populates="edit_job", cascade="all, delete-orphan")


class ImageEdit(Base):
    """Single-photo AI edit: upload one image + a freeform instruction, get back
    an edited image. Separate from BatchJob's design+pose pairing flow.
    edit_job_id is null for the original single-photo endpoint and set when
    the edit belongs to a multi-image EditJob batch."""

    __tablename__ = "image_edits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    edit_job_id: Mapped[str | None] = mapped_column(ForeignKey("edit_jobs.id"), nullable=True)

    original_filename: Mapped[str] = mapped_column(String(255))
    original_path: Mapped[str] = mapped_column(String(500), default="")

    prompt: Mapped[str] = mapped_column(Text)
    prompt_used: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    image_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="processing")  # processing|completed|failed|cancelled
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    edit_job: Mapped["EditJob | None"] = relationship(back_populates="edits")


class ScheduledPost(Base):
    """A post queued for auto-publishing to a connected SocialAccount.

    Lifecycle: pending_content -> pending_review -> approved -> posted
    (or -> rejected, or -> failed). Content is generated automatically by
    scheduler_service ahead of suggested_date, but publishing NEVER happens
    without an explicit admin approval — see app/routers/scheduled_posts.py
    and app/services/publishing_service.py.
    """

    __tablename__ = "scheduled_posts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # Legacy single-image columns — superseded by image_ids/edit_ids below but
    # kept forever (additive-only schema, see db_schema_sync.py) so old rows
    # keep resolving via resolved_image_ids()/resolved_edit_ids(). New posts
    # leave these null and populate the JSON list columns instead.
    batch_job_id: Mapped[str | None] = mapped_column(ForeignKey("batch_jobs.id"), nullable=True)
    image_id: Mapped[str | None] = mapped_column(ForeignKey("generated_images.id"), nullable=True)
    edit_id: Mapped[str | None] = mapped_column(ForeignKey("image_edits.id"), nullable=True)
    # Exactly one of image_ids/edit_ids is populated per post (1-10 items) —
    # a Batch Generator carousel or a Photo Editor carousel, never mixed. See
    # routers/scheduled_posts.py's create_scheduled_post for the validation.
    image_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    edit_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    social_account_id: Mapped[str | None] = mapped_column(ForeignKey("social_accounts.id"), nullable=True)

    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    hashtags: Mapped[str | None] = mapped_column(Text, nullable=True)
    platform: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # pending_content|pending_review|approved|posted|failed|rejected
    status: Mapped[str] = mapped_column(String(20), default="pending_content")
    suggested_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    platform_post_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    campaign_id: Mapped[str | None] = mapped_column(ForeignKey("campaigns.id"), nullable=True)

    social_account: Mapped["SocialAccount | None"] = relationship(back_populates="scheduled_posts")
    campaign: Mapped["Campaign | None"] = relationship(back_populates="scheduled_posts")

    def resolved_image_ids(self) -> list[str]:
        return list(self.image_ids) if self.image_ids else ([self.image_id] if self.image_id else [])

    def resolved_edit_ids(self) -> list[str]:
        return list(self.edit_ids) if self.edit_ids else ([self.edit_id] if self.edit_id else [])


class SocialAccount(Base):
    """A connected Facebook Page or Instagram Business account (OAuth via
    Meta Graph API — see app/services/meta_service.py), owned by one tenant."""

    __tablename__ = "social_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    platform: Mapped[str] = mapped_column(String(30))  # facebook_page|instagram_business
    account_id: Mapped[str] = mapped_column(String(255))  # Page ID or IG user ID
    name: Mapped[str] = mapped_column(String(255), default="")

    access_token_encrypted: Mapped[str] = mapped_column(Text)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # pending_selection|active|expired|revoked. A Facebook login can manage
    # many Pages — every Page (and its linked Instagram account) returned by
    # OAuth lands here as pending_selection first; the admin picks the one(s)
    # to actually use (see routers/social.py's /accounts/{id}/select).
    status: Mapped[str] = mapped_column(String(20), default="active")

    # For a pending_selection facebook_page row, points at its sibling
    # instagram_business row (if the Page has one linked) so selecting the
    # Page activates both together in one action.
    linked_account_id: Mapped[str | None] = mapped_column(ForeignKey("social_accounts.id"), nullable=True)

    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    scheduled_posts: Mapped[list["ScheduledPost"]] = relationship(back_populates="social_account")


class Notification(Base):
    """In-app notification (no email/SMS infra yet) surfaced in the frontend
    bell icon — e.g. 'content ready for review' or 'post failed to publish'."""

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(50))
    message: Mapped[str] = mapped_column(Text)
    scheduled_post_id: Mapped[str | None] = mapped_column(ForeignKey("scheduled_posts.id"), nullable=True)
    is_read: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Campaign(Base):
    """Groups BatchJob(s) + ScheduledPost(s) under one named initiative (e.g.
    'Hè 2026 - luxury nail') so a salon owner can see all images, posts, and
    performance for one push in one place. Purely organizational — a
    BatchJob/ScheduledPost works fine with campaign_id left null."""

    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|archived
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Auto-refill (opt-in): when enabled, auto_refill_service tops up this
    # campaign's content pipeline by cloning its last completed batch job's
    # design/pose images into a new one, then auto-schedules the results
    # using these defaults. Both account + platform must be set for a
    # campaign to actually be eligible — see auto_refill_service.py.
    auto_refill_enabled: Mapped[bool] = mapped_column(default=False)
    auto_refill_social_account_id: Mapped[str | None] = mapped_column(ForeignKey("social_accounts.id"), nullable=True)
    auto_refill_platform: Mapped[str | None] = mapped_column(String(30), nullable=True)
    auto_refill_interval_hours: Mapped[float] = mapped_column(Float, default=24.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    batch_jobs: Mapped[list["BatchJob"]] = relationship(back_populates="campaign")
    scheduled_posts: Mapped[list["ScheduledPost"]] = relationship(back_populates="campaign")


class ApiUsageRecord(Base):
    """One row per real (non-mock) Claude/ChatGPT call, for a monthly
    cost/usage summary. Never blocks or fails the generation pipeline if
    writing this row fails (see usage_service.py) - it's observability, not
    a control path."""

    __tablename__ = "api_usage_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    provider: Mapped[str] = mapped_column(String(20))  # anthropic|chatgpt_oauth
    # build_prompt|refine_edit_prompt|generate_post_content|score_image|generate_image|edit_image
    operation: Mapped[str] = mapped_column(String(50))
    model: Mapped[str] = mapped_column(String(100))

    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_count: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PostMetrics(Base):
    """Latest-snapshot engagement metrics for a posted ScheduledPost, pulled
    from Meta Graph API insights (see insights_service.py). One row per post,
    overwritten on each sync - not an append-only history. unavailable_reason
    is set (instead of raising) whenever Meta denies the request, which is
    the expected outcome until the read_insights/instagram_manage_insights
    scopes are approved via Meta App Review (see meta_service.py)."""

    __tablename__ = "post_metrics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    scheduled_post_id: Mapped[str] = mapped_column(ForeignKey("scheduled_posts.id"), unique=True)
    platform: Mapped[str] = mapped_column(String(30))

    impressions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reach: Mapped[int | None] = mapped_column(Integer, nullable=True)
    likes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comments: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shares: Mapped[int | None] = mapped_column(Integer, nullable=True)

    unavailable_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class SalonBranding(Base):
    """One row per tenant, holding that salon's logo used to watermark
    generated/edited images (see branding_service.py's get-or-create by
    user_id)."""

    __tablename__ = "salon_branding"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    logo_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
