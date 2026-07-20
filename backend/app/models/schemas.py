from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class PairingMode(str, Enum):
    cross = "cross"
    random = "random"
    one_to_one = "one_to_one"


class CampaignStatus(str, Enum):
    active = "active"
    archived = "archived"


class CampaignCreate(BaseModel):
    name: str
    description: str = ""
    start_date: datetime | None = None
    end_date: datetime | None = None
    auto_refill_enabled: bool = False
    auto_refill_social_account_id: str | None = None
    auto_refill_platform: str | None = None
    auto_refill_interval_hours: float = 24.0


class CampaignUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: CampaignStatus | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    auto_refill_enabled: bool | None = None
    auto_refill_social_account_id: str | None = None
    auto_refill_platform: str | None = None
    auto_refill_interval_hours: float | None = None


class CampaignOut(BaseModel):
    id: str
    name: str
    description: str
    status: str
    start_date: datetime | None
    end_date: datetime | None
    auto_refill_enabled: bool = False
    auto_refill_social_account_id: str | None = None
    auto_refill_platform: str | None = None
    auto_refill_interval_hours: float = 24.0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BatchJobCreateResponse(BaseModel):
    job_id: str
    status: str
    requested_num_images: int
    approved_num_images: int
    progress_total: int
    was_capped: bool
    cap_message: str | None = None


class BatchJobSummaryOut(BaseModel):
    # Lightweight row for "list my batch jobs" (see GET /api/batch) — unlike
    # BatchJobStatusOut, deliberately excludes the full `images` list so
    # browsing history for a job_id doesn't pull every generated image's
    # score/prompt for every past job in one response.
    job_id: str
    status: str
    pairing_mode: str
    num_images: int
    description: str
    progress_completed: int
    progress_total: int
    zip_ready: bool
    campaign_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GeneratedImageOut(BaseModel):
    id: str
    design_filename: str
    pose_filename: str
    variation: int
    prompt_used: str | None
    score: float | None
    score_breakdown: dict | None
    passed: bool
    attempts: int
    status: str
    image_url: str | None

    model_config = {"from_attributes": True}


class BatchJobStatusOut(BaseModel):
    job_id: str
    status: str
    pairing_mode: str
    num_images: int
    description: str
    image_width: int | None
    image_height: int | None
    progress_completed: int
    progress_total: int
    zip_ready: bool
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    campaign_id: str | None = None
    images: list[GeneratedImageOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class BatchJobCancelResponse(BaseModel):
    job_id: str
    status: str
    message: str


class ImageEditResponse(BaseModel):
    id: str
    status: str
    prompt: str
    prompt_used: str | None
    image_width: int | None
    image_height: int | None
    original_image_url: str | None
    image_url: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EditJobCreateResponse(BaseModel):
    job_id: str
    status: str
    progress_total: int


class EditJobStatusOut(BaseModel):
    job_id: str
    status: str
    prompt: str
    image_width: int | None
    image_height: int | None
    apply_logo: bool
    progress_completed: int
    progress_total: int
    zip_ready: bool
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    edits: list[ImageEditResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class EditJobCancelResponse(BaseModel):
    job_id: str
    status: str
    message: str


class BrandingOut(BaseModel):
    logo_url: str | None


class RegisterRequest(BaseModel):
    email: str
    password: str
    salon_name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    salon_name: str

    model_config = {"from_attributes": True}


class SocialAccountOut(BaseModel):
    id: str
    platform: str
    account_id: str
    name: str
    status: str
    connected_at: datetime

    model_config = {"from_attributes": True}


class ScheduledPostCreate(BaseModel):
    # Exactly one image source: 1-10 Batch Generator images (batch_job_id +
    # image_ids) or 1-10 Photo Editor results (edit_ids), never mixed —
    # validated in routers/scheduled_posts.py, since which fields are
    # required depends on which source is used. 2+ ids makes a carousel post.
    batch_job_id: str | None = None
    image_ids: list[str] = Field(default_factory=list)
    edit_ids: list[str] = Field(default_factory=list)
    social_account_id: str
    platform: str
    suggested_date: datetime
    campaign_id: str | None = None


class ScheduledPostUpdate(BaseModel):
    caption: str | None = None
    hashtags: str | None = None
    suggested_date: datetime | None = None


class ScheduledPostOut(BaseModel):
    id: str
    batch_job_id: str | None
    image_ids: list[str] = Field(default_factory=list)
    edit_ids: list[str] = Field(default_factory=list)
    image_id: str | None = None  # deprecated: first of image_ids
    edit_id: str | None = None  # deprecated: first of edit_ids
    social_account_id: str | None
    caption: str | None
    hashtags: str | None
    platform: str | None
    status: str
    suggested_date: datetime | None
    platform_post_id: str | None
    error_message: str | None
    image_urls: list[str] = Field(default_factory=list)
    image_url: str | None = None  # deprecated: first of image_urls
    created_at: datetime
    campaign_id: str | None = None

    model_config = {"from_attributes": True}


class ScheduledPostBulkCreate(BaseModel):
    # Exactly one of batch_job_id / campaign_id — schedules every "passed"
    # image from that batch job, or from every batch job in that campaign,
    # that doesn't already have an active ScheduledPost.
    batch_job_id: str | None = None
    campaign_id: str | None = None
    social_account_id: str
    platform: str
    start_date: datetime
    interval_hours: float = 24.0
    # Groups consecutive ready images into one carousel post each (1 = one
    # post per image, today's behavior).
    images_per_post: int = Field(default=1, ge=1, le=10)


class ScheduledPostBulkCreateResponse(BaseModel):
    created: list[ScheduledPostOut]
    skipped_already_scheduled: int
    skipped_not_ready: int


class ScheduledPostBulkAction(BaseModel):
    # Exactly one of post_ids / campaign_id.
    post_ids: list[str] = Field(default_factory=list)
    campaign_id: str | None = None


class ScheduledPostBulkActionResponse(BaseModel):
    updated: list[ScheduledPostOut]
    skipped: int


class NotificationOut(BaseModel):
    id: str
    type: str
    message: str
    scheduled_post_id: str | None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiUsageRecordOut(BaseModel):
    id: str
    provider: str
    operation: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    image_count: int
    estimated_cost_usd: float
    created_at: datetime

    model_config = {"from_attributes": True}


class UsageSummaryOut(BaseModel):
    year: int
    month: int
    total_requests: int
    total_cost_usd: float
    anthropic_cost_usd: float
    chatgpt_oauth_requests: int
    budget_usd: float = 0.0


class PostMetricsOut(BaseModel):
    id: str
    scheduled_post_id: str
    platform: str
    impressions: int | None
    reach: int | None
    likes: int | None
    comments: int | None
    shares: int | None
    unavailable_reason: str | None
    fetched_at: datetime

    model_config = {"from_attributes": True}


class DesignPerformanceOut(BaseModel):
    image_id: str
    design_filename: str
    image_url: str | None
    reach: int
    engagement: int


class PerformanceSummaryOut(BaseModel):
    total_posts_tracked: int
    total_posts_pending_metrics: int
    total_impressions: int
    total_reach: int
    total_engagement: int
    top_designs: list[DesignPerformanceOut] = Field(default_factory=list)


class CampaignSummaryOut(CampaignOut):
    batch_job_count: int = 0
    scheduled_post_count: int = 0
    image_count: int = 0
    posted_count: int = 0
    total_reach: int | None = None
    total_engagement: int | None = None
    batch_jobs: list[BatchJobStatusOut] = Field(default_factory=list)
    scheduled_posts: list[ScheduledPostOut] = Field(default_factory=list)
