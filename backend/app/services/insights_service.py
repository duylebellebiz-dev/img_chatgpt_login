"""Syncs Meta Graph API engagement insights (reach/likes/comments/shares)
into PostMetrics for posted ScheduledPosts. Degrades gracefully: a Meta
permission error (expected until the read_insights/instagram_manage_insights
App Review is approved — see meta_service.py) is recorded as
unavailable_reason on the row instead of raised, matching the best-effort
pattern used elsewhere for Meta-gated features (cloudinary_client.py's
silent no-op, publishing_service.py's catch-and-mark-failed).
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models.db_models import PostMetrics, ScheduledPost, SocialAccount
from app.services import token_crypto
from app.services.meta_service import MetaAPIError, MetaService


class InsightsService:
    def __init__(self, settings: Settings | None = None, meta_service: MetaService | None = None):
        self.settings = settings or get_settings()
        self.meta_service = meta_service or MetaService(self.settings)

    def sync_metrics_for_post(self, db: Session, post: ScheduledPost) -> PostMetrics:
        metrics = db.query(PostMetrics).filter(PostMetrics.scheduled_post_id == post.id).one_or_none()
        if metrics is None:
            metrics = PostMetrics(scheduled_post_id=post.id, platform=post.platform or "")
            db.add(metrics)

        metrics.platform = post.platform or metrics.platform
        metrics.fetched_at = datetime.now(timezone.utc)

        account = db.get(SocialAccount, post.social_account_id) if post.social_account_id else None
        if account is None or not post.platform_post_id:
            metrics.unavailable_reason = "No connected social account or platform post id on this post."
            db.commit()
            db.refresh(metrics)
            return metrics

        try:
            access_token = token_crypto.decrypt_token(account.access_token_encrypted, self.settings)
            if account.platform == "facebook_page":
                data = self.meta_service.get_facebook_post_insights(post.platform_post_id, access_token)
            elif account.platform == "instagram_business":
                data = self.meta_service.get_instagram_media_insights(post.platform_post_id, access_token)
            else:
                raise ValueError(f"Unsupported platform: {account.platform}")

            metrics.impressions = data.get("impressions")
            metrics.reach = data.get("reach")
            metrics.likes = data.get("likes")
            metrics.comments = data.get("comments")
            metrics.shares = data.get("shares")
            metrics.unavailable_reason = None
        except (MetaAPIError, ValueError) as exc:
            metrics.unavailable_reason = (
                f"Meta permission denied — pending App Review for read_insights/instagram_manage_insights: {exc}"
            )

        db.commit()
        db.refresh(metrics)
        return metrics

    def sync_all_posted_metrics(self, db: Session, user_id: str | None = None) -> list[PostMetrics]:
        """user_id=None (the scheduler's periodic sweep) syncs every tenant's
        posted posts; a real user_id (the interactive "sync now" endpoint)
        scopes it to just that tenant's posts."""
        query = (
            db.query(ScheduledPost)
            .filter(ScheduledPost.status == "posted")
            .filter(ScheduledPost.platform_post_id.isnot(None))
        )
        if user_id is not None:
            query = query.filter(ScheduledPost.user_id == user_id)
        posts = query.all()
        return [self.sync_metrics_for_post(db, post) for post in posts]
