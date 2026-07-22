from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg2://nailsocial:change-me-locally@127.0.0.1:5432/nailsocial"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5"

    # Default image provider used when a request doesn't specify one — "agy"
    # (Gemini via the locally authenticated Antigravity CLI) or "gpt" (ChatGPT
    # via ima2-gen's local OAuth server). Use "mock" for deterministic
    # placeholders in tests or offline work. Batch/edit jobs can override this
    # per-request; see ImageService.resolve_provider.
    image_provider: str = "agy"
    agy_bin: str = ""
    agy_image_model: str = "nano-banana-2"
    # Orchestrator model the Antigravity CLI itself runs as (see `agy models`
    # for the full list). This is the agent that reads the prompt and calls
    # the generate_image tool — a stronger model here can follow the
    # compositing instructions more precisely, but it does not change which
    # underlying model actually renders the pixels.
    agy_model: str = "gemini-3.1-pro-high"
    agy_generation_timeout_seconds: float = 400.0

    # ChatGPT image generation via ima2-gen's local OAuth server (`ima2
    # serve`, POST /api/generate with provider="oauth") — draws on the signed-
    # in ChatGPT account's plan quota (via `codex login`), not a billed
    # OPENAI_API_KEY. Requires `ima2 serve` running alongside this backend;
    # see ima2-gen/README.md and ima2-gen/docs/FAQ.md.
    ima2_server_url: str = "http://localhost:3333"
    gpt_oauth_model: str = "gpt-5.4-mini"
    gpt_oauth_quality: str = "low"
    gpt_oauth_generation_timeout_seconds: float = 180.0

    storage_root: str = "./storage"

    # Object storage (Cloudinary) — the durable copy of everything under
    # storage_root. Needed because free-tier web hosts don't give you a
    # persistent disk: local storage_root is just a scratch/cache directory
    # that can be wiped by a restart or scale-to-zero cycle. Leave blank to
    # run local-disk-only (fine for local dev).
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    quality_pass_threshold: int = 80
    # 0 = no auto-regenerate on a failed quality score — generate once, and a
    # failing score just lands the image in "needs_review" status for a human
    # to look at instead of spending another image generation + Claude
    # score attempting to fix it automatically.
    quality_max_retries: int = 0
    # Separate, smaller retry budget reserved for known, usually-correctable
    # provider compositing bugs — as opposed to an ordinary mediocre score,
    # which is a "have a human look at it" outcome, not a "spend another
    # paid attempt trying to fix it" one. Two independent detectors feed
    # this same budget:
    #  1. is_near_duplicate_image — a cheap pixel-diff check that catches
    #     The provider returning one reference image back almost byte-for-byte
    #     unchanged.
    #  2. quality_hard_failure_threshold below — pixel-diff alone isn't
    #     reliable (in production data, genuinely good composites can score
    #     a similar diff to a genuine near-duplicate), so a catastrophically
    #     low vision-judge score is treated as the same known failure mode,
    #     since _VISION_RUBRIC already scores a compositing failure this low
    #     on purpose (see its "CRITICAL COMPOSITING CHECK" clause).
    near_duplicate_max_retries: int = 2
    # A score below this is treated as a hard compositing failure (case 2
    # above), not an ordinary "needs more polish" low score — e.g. an
    # observed real failure scored every criterion at 10/100, while ordinary
    # below-threshold images cluster in the 60-79 range. Deliberately well
    # below quality_pass_threshold so this never fires on a merely mediocre
    # image, only a clearly broken one.
    quality_hard_failure_threshold: int = 30
    # pose_fidelity and nail_accuracy are the two criteria that actually
    # measure "did the output keep the reference images unchanged" — the
    # other five (lighting/background/realism/anatomy/marketing_quality)
    # score general photo quality and say nothing about reference fidelity.
    # Averaging all seven equally lets a design that got reinterpreted by the
    # image provider (low nail_accuracy) get diluted by high scores on the
    # other six and still clear quality_pass_threshold on the overall
    # average. These two must independently clear this floor too, or the
    # attempt fails regardless of its overall score.
    quality_fidelity_floor: int = 70

    batch_min_images: int = 1
    batch_max_images: int = 100
    # How many images in a batch job to generate concurrently. Generation is
    # I/O-bound (Gemini + Claude network round trips), so running several in
    # parallel cuts wall-clock time for a batch without changing per-image cost.
    batch_concurrency: int = 4

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Facebook/Instagram (Meta Graph API) auto-posting. Leave blank to run in
    # mock mode (simulated OAuth/publish calls) so the flow works end to end
    # without a real Meta App — see app/services/meta_service.py.
    facebook_app_id: str = ""
    facebook_app_secret: str = ""
    facebook_redirect_uri: str = "http://localhost:8000/api/social/connect/facebook/callback"

    # Fernet key (generate with `Fernet.generate_key()`) used to encrypt
    # SocialAccount access tokens at rest. Required once a real Facebook App
    # is connected; mock mode doesn't store real tokens.
    token_encryption_key: str = ""

    # Signs the httpOnly session cookie issued on login/register (see
    # auth_service.py). Every tenant's session is signed with this one key.
    session_secret_key: str = "dev-only-insecure-session-secret-change-me"

    # How long before a scheduled post's target datetime the content
    # generation sweep should produce the caption/hashtags for review.
    content_lead_time_hours: int = 24

    # Estimated Anthropic pricing for the usage/cost dashboard.
    anthropic_input_price_per_million_usd: float = 1.0
    anthropic_output_price_per_million_usd: float = 5.0
    # 0 = no budget configured; the usage dashboard shows a running total
    # instead of a budget meter bar.
    monthly_budget_usd: float = 0.0

    # This backend's own publicly-reachable base URL (e.g. the Render URL).
    # Meta Graph API fetches the image by URL when publishing, so it must be
    # able to reach it over the internet — not needed in mock mode, and not
    # satisfied by http://localhost during local development.
    public_base_url: str = ""

    # Any endpoint that accepts a JSON POST (Slack/Discord incoming webhook,
    # Zapier/Make catch hook, etc.) — every Notification (content ready for
    # review, post failed, auto-refill triggered) is also POSTed here so a
    # salon owner doesn't have to keep the app open to catch it. Leave blank
    # to only surface notifications in-app (see notification_service.py).
    notification_webhook_url: str = ""

    # Module: auto-refill content pipeline (opt-in per Campaign — see
    # Campaign.auto_refill_enabled and auto_refill_service.py). How far ahead
    # to count "upcoming" scheduled posts, and how few of them must exist
    # before a campaign is topped up with a new cloned batch job.
    auto_refill_buffer_days: int = 7
    auto_refill_min_buffer_posts: int = 3
    # Minimum time between two auto-refill batch jobs for the same campaign,
    # so a slow-to-review queue can't trigger runaway paid generation.
    auto_refill_cooldown_hours: int = 24

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def storage_path(self) -> Path:
        path = Path(self.storage_root)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def has_anthropic_key(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def uses_agy(self) -> bool:
        return self.image_provider.strip().lower() == "agy"

    @property
    def uses_mock_images(self) -> bool:
        return self.image_provider.strip().lower() == "mock"

    @property
    def has_cloudinary(self) -> bool:
        return bool(self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret)

    @property
    def has_facebook_credentials(self) -> bool:
        return bool(self.facebook_app_id and self.facebook_app_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
