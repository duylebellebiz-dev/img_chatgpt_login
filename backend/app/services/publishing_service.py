"""Dispatches an approved ScheduledPost to the right Meta Graph API call.
This is the only place that calls meta_service (see CLAUDE.md #7 — never
call the API wrapper directly from a route handler). Callers must ensure
the post is already status="approved" — publish() itself does not check
approval, that gate lives in app/routers/scheduled_posts.py and
app/services/scheduler_service.py (the only two callers).
"""

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models.db_models import GeneratedImage, ImageEdit, ScheduledPost, SocialAccount
from app.services import token_crypto
from app.services.meta_service import MetaAPIError, MetaService


class PublishingService:
    def __init__(self, settings: Settings | None = None, meta_service: MetaService | None = None):
        self.settings = settings or get_settings()
        self.meta_service = meta_service or MetaService(self.settings)

    def publish(self, db: Session, post: ScheduledPost) -> ScheduledPost:
        account = db.get(SocialAccount, post.social_account_id) if post.social_account_id else None
        if account is None:
            post.status = "failed"
            post.error_message = "No connected social account on this post."
            db.commit()
            db.refresh(post)
            return post

        try:
            image_urls = self._image_urls(db, post)
            access_token = token_crypto.decrypt_token(account.access_token_encrypted, self.settings)
            caption_text = f"{post.caption or ''}\n\n{post.hashtags or ''}".strip()

            if account.platform == "facebook_page":
                result = (
                    self.meta_service.publish_to_facebook(account.account_id, access_token, image_urls[0], caption_text)
                    if len(image_urls) == 1
                    else self.meta_service.publish_to_facebook_carousel(
                        account.account_id, access_token, image_urls, caption_text
                    )
                )
            elif account.platform == "instagram_business":
                result = (
                    self.meta_service.publish_to_instagram(account.account_id, access_token, image_urls[0], caption_text)
                    if len(image_urls) == 1
                    else self.meta_service.publish_to_instagram_carousel(
                        account.account_id, access_token, image_urls, caption_text
                    )
                )
            else:
                raise ValueError(f"Unsupported platform: {account.platform}")

            post.status = "posted"
            post.platform_post_id = result.platform_post_id
            post.posted_at = datetime.now(timezone.utc)
            post.error_message = None
        except (MetaAPIError, ValueError) as exc:
            post.status = "failed"
            post.error_message = str(exc)

        db.commit()
        db.refresh(post)
        return post

    def _image_urls(self, db: Session, post: ScheduledPost) -> list[str]:
        edit_ids = post.resolved_edit_ids()
        image_ids = post.resolved_image_ids()

        if not edit_ids and not image_ids:
            raise ValueError("Scheduled post has no generated image to publish.")

        if self.meta_service.is_mock:
            ids = edit_ids or image_ids or [post.id]
            return [f"mock://media/{i}" for i in ids]

        if not self.settings.public_base_url:
            raise ValueError(
                "PUBLIC_BASE_URL is not configured; Meta Graph API cannot fetch the "
                "generated image without a publicly-reachable URL."
            )

        base = self.settings.public_base_url.rstrip("/")

        if edit_ids:
            urls = []
            for edit_id in edit_ids:
                edit = db.get(ImageEdit, edit_id)
                if edit is None or not edit.generated_path:
                    raise ValueError("Scheduled post has no generated image to publish.")
                filename = Path(edit.generated_path).name
                job_folder = edit.edit_job_id or edit.id
                urls.append(f"{base}/media/generated/{job_folder}/{filename}")
            return urls

        urls = []
        for image_id in image_ids:
            image = db.get(GeneratedImage, image_id)
            if image is None or not image.generated_path:
                raise ValueError("Scheduled post has no generated image to publish.")
            filename = Path(image.generated_path).name
            urls.append(f"{base}/media/generated/{image.batch_job_id}/{filename}")
        return urls
