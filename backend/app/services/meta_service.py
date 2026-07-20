"""Meta Graph API wrapper for connecting a Facebook Page via OAuth,
publishing to it, and reading back post-level engagement insights. Mirrors
the mock-mode convention in agent_service.py/image_service.py: with no
FACEBOOK_APP_ID/SECRET configured, every method returns deterministic fake
data instead of calling graph.facebook.com, so the connect -> generate ->
review -> publish -> insights flow works end to end without a real Meta App.

read_insights, instagram_basic, and instagram_manage_insights are now
requested so the performance dashboard can show real reach/engagement, but
these scopes (and Instagram Page-linking) require a Meta App Review that is
submitted manually by the user in the Meta dashboard — this module cannot do
that step. Until that review is approved, Meta will reject these scopes
("Invalid Scopes") — see routers/social.py's OAuth callback, which redirects
back to the frontend with an error instead of a raw 500 in that case, and
insights_service.py, which marks metrics unavailable instead of raising.

Posting permissions (pages_manage_posts) only work for accounts added as
Admin/Developer/Tester while the Meta App is in Development mode. Taking a
real salon live requires Meta App Review + Business Verification, submitted
by the user in the Meta dashboard — this module cannot do that step.
"""

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import httpx

from app.config import Settings, get_settings

GRAPH_API_VERSION = "v21.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

_OAUTH_SCOPES = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "business_management",
    "read_insights",
    "instagram_basic",
    "instagram_manage_insights",
]


@dataclass
class FacebookPage:
    page_id: str
    name: str
    page_access_token: str
    instagram_business_account_id: str | None = None


@dataclass
class PublishResult:
    platform_post_id: str
    raw: dict = field(default_factory=dict)


class MetaAPIError(RuntimeError):
    pass


class MetaService:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    @property
    def is_mock(self) -> bool:
        return not self.settings.has_facebook_credentials

    # -- OAuth -----------------------------------------------------------

    def get_oauth_url(self, state: str) -> str:
        if self.is_mock:
            # Real Facebook would redirect the browser back to
            # facebook_redirect_uri with a real ?code=...&state=... once the
            # user approves the dialog. Mock mode skips straight to that —
            # redirecting to an unnavigable "mock://" URL would leave the
            # browser stuck on a dead link instead of completing the flow.
            return f"{self.settings.facebook_redirect_uri}?code=mock-auth-code&state={state}"

        scope = ",".join(_OAUTH_SCOPES)
        return (
            f"https://www.facebook.com/{GRAPH_API_VERSION}/dialog/oauth"
            f"?client_id={self.settings.facebook_app_id}"
            f"&redirect_uri={self.settings.facebook_redirect_uri}"
            f"&state={state}"
            f"&scope={scope}"
        )

    def exchange_code_for_token(self, code: str) -> str:
        """Exchanges the OAuth `code` for a short-lived user token, then that
        for a long-lived (~60 day) token. Returns the long-lived token."""
        if self.is_mock:
            return f"mock-user-token-{code}"

        with httpx.Client(timeout=15) as client:
            short_lived = client.get(
                f"{GRAPH_API_BASE}/oauth/access_token",
                params={
                    "client_id": self.settings.facebook_app_id,
                    "client_secret": self.settings.facebook_app_secret,
                    "redirect_uri": self.settings.facebook_redirect_uri,
                    "code": code,
                },
            )
            _raise_for_graph_error(short_lived)
            short_token = short_lived.json()["access_token"]

            long_lived = client.get(
                f"{GRAPH_API_BASE}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": self.settings.facebook_app_id,
                    "client_secret": self.settings.facebook_app_secret,
                    "fb_exchange_token": short_token,
                },
            )
            _raise_for_graph_error(long_lived)
            return long_lived.json()["access_token"]

    def list_pages(self, user_token: str) -> list[FacebookPage]:
        """Lists Facebook Pages the user manages, resolving each Page's
        linked Instagram Business account if it has one (requires the
        account to already be Business/Creator and linked to the Page — an
        external prerequisite this code cannot satisfy on its own)."""
        if self.is_mock:
            return [
                FacebookPage(
                    page_id="mock-page-1",
                    name="Mock Nail Salon Page",
                    page_access_token=f"mock-page-token-{user_token}",
                    instagram_business_account_id="mock-ig-business-1",
                )
            ]

        with httpx.Client(timeout=15) as client:
            resp = client.get(
                f"{GRAPH_API_BASE}/me/accounts",
                params={"access_token": user_token, "fields": "id,name,access_token,instagram_business_account{id}"},
            )
            _raise_for_graph_error(resp)
            return [
                FacebookPage(
                    page_id=entry["id"],
                    name=entry["name"],
                    page_access_token=entry["access_token"],
                    instagram_business_account_id=(entry.get("instagram_business_account") or {}).get("id"),
                )
                for entry in resp.json().get("data", [])
            ]

    # -- Publishing --------------------------------------------------------

    def publish_to_facebook(self, page_id: str, page_access_token: str, image_url: str, caption: str) -> PublishResult:
        if self.is_mock:
            return PublishResult(platform_post_id=f"mock-fb-post-{page_id}-{datetime.now(timezone.utc).timestamp():.0f}")

        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"{GRAPH_API_BASE}/{page_id}/photos",
                data={"url": image_url, "caption": caption, "access_token": page_access_token},
            )
            _raise_for_graph_error(resp)
            return PublishResult(platform_post_id=resp.json()["post_id"], raw=resp.json())

    def publish_to_instagram(
        self, ig_user_id: str, page_access_token: str, image_url: str, caption: str
    ) -> PublishResult:
        if self.is_mock:
            return PublishResult(platform_post_id=f"mock-ig-post-{ig_user_id}-{datetime.now(timezone.utc).timestamp():.0f}")

        with httpx.Client(timeout=30) as client:
            container = client.post(
                f"{GRAPH_API_BASE}/{ig_user_id}/media",
                data={"image_url": image_url, "caption": caption, "access_token": page_access_token},
            )
            _raise_for_graph_error(container)
            creation_id = container.json()["id"]

            published = client.post(
                f"{GRAPH_API_BASE}/{ig_user_id}/media_publish",
                data={"creation_id": creation_id, "access_token": page_access_token},
            )
            _raise_for_graph_error(published)
            return PublishResult(platform_post_id=published.json()["id"], raw=published.json())

    def publish_to_facebook_carousel(
        self, page_id: str, page_access_token: str, image_urls: list[str], caption: str
    ) -> PublishResult:
        if self.is_mock:
            return PublishResult(
                platform_post_id=f"mock-fb-carousel-{page_id}-{datetime.now(timezone.utc).timestamp():.0f}"
            )

        with httpx.Client(timeout=30) as client:
            media_fbids = []
            for url in image_urls:
                resp = client.post(
                    f"{GRAPH_API_BASE}/{page_id}/photos",
                    data={"url": url, "published": "false", "access_token": page_access_token},
                )
                _raise_for_graph_error(resp)
                media_fbids.append(resp.json()["id"])

            attached_media = json.dumps([{"media_fbid": media_id} for media_id in media_fbids])
            feed_resp = client.post(
                f"{GRAPH_API_BASE}/{page_id}/feed",
                data={"message": caption, "attached_media": attached_media, "access_token": page_access_token},
            )
            _raise_for_graph_error(feed_resp)
            return PublishResult(platform_post_id=feed_resp.json()["id"], raw=feed_resp.json())

    def publish_to_instagram_carousel(
        self, ig_user_id: str, page_access_token: str, image_urls: list[str], caption: str
    ) -> PublishResult:
        if self.is_mock:
            return PublishResult(
                platform_post_id=f"mock-ig-carousel-{ig_user_id}-{datetime.now(timezone.utc).timestamp():.0f}"
            )

        with httpx.Client(timeout=30) as client:
            child_ids = []
            for url in image_urls:
                resp = client.post(
                    f"{GRAPH_API_BASE}/{ig_user_id}/media",
                    data={"image_url": url, "is_carousel_item": "true", "access_token": page_access_token},
                )
                _raise_for_graph_error(resp)
                child_ids.append(resp.json()["id"])

            parent = client.post(
                f"{GRAPH_API_BASE}/{ig_user_id}/media",
                data={
                    "media_type": "CAROUSEL",
                    "children": ",".join(child_ids),
                    "caption": caption,
                    "access_token": page_access_token,
                },
            )
            _raise_for_graph_error(parent)
            creation_id = parent.json()["id"]

            published = client.post(
                f"{GRAPH_API_BASE}/{ig_user_id}/media_publish",
                data={"creation_id": creation_id, "access_token": page_access_token},
            )
            _raise_for_graph_error(published)
            return PublishResult(platform_post_id=published.json()["id"], raw=published.json())

    # -- Insights ------------------------------------------------------------

    def get_facebook_post_insights(self, post_id: str, access_token: str) -> dict:
        """Returns {impressions, reach, likes, comments, shares} for a
        published Facebook post. Requires the read_insights scope — until
        Meta approves it, this raises MetaAPIError, which
        insights_service.py catches and records as unavailable rather than
        propagating."""
        if self.is_mock:
            seed = sum(ord(c) for c in post_id)
            return {
                "impressions": 200 + seed % 800,
                "reach": 150 + seed % 600,
                "likes": 5 + seed % 50,
                "comments": seed % 10,
                "shares": seed % 5,
            }

        with httpx.Client(timeout=15) as client:
            insights_resp = client.get(
                f"{GRAPH_API_BASE}/{post_id}/insights",
                params={"metric": "post_impressions,post_engaged_users", "access_token": access_token},
            )
            _raise_for_graph_error(insights_resp)
            insights_values = {
                entry["name"]: (entry.get("values") or [{}])[0].get("value", 0)
                for entry in insights_resp.json().get("data", [])
            }

            engagement_resp = client.get(
                f"{GRAPH_API_BASE}/{post_id}",
                params={"fields": "likes.summary(true),comments.summary(true),shares", "access_token": access_token},
            )
            _raise_for_graph_error(engagement_resp)
            engagement = engagement_resp.json()

            return {
                "impressions": insights_values.get("post_impressions", 0),
                "reach": insights_values.get("post_engaged_users", 0),
                "likes": (engagement.get("likes") or {}).get("summary", {}).get("total_count", 0),
                "comments": (engagement.get("comments") or {}).get("summary", {}).get("total_count", 0),
                "shares": (engagement.get("shares") or {}).get("count", 0),
            }

    def get_instagram_media_insights(self, media_id: str, access_token: str) -> dict:
        """Returns {impressions, reach, likes, comments, shares} for a
        published Instagram media item. Requires instagram_manage_insights
        and the account to be Business/Creator — same not-yet-approved
        caveat as get_facebook_post_insights."""
        if self.is_mock:
            seed = sum(ord(c) for c in media_id)
            return {
                "impressions": 300 + seed % 900,
                "reach": 200 + seed % 700,
                "likes": 10 + seed % 80,
                "comments": seed % 15,
                "shares": seed % 8,
            }

        with httpx.Client(timeout=15) as client:
            resp = client.get(
                f"{GRAPH_API_BASE}/{media_id}/insights",
                params={"metric": "impressions,reach,likes,comments,shares", "access_token": access_token},
            )
            _raise_for_graph_error(resp)
            values = {
                entry["name"]: (entry.get("values") or [{}])[0].get("value", 0)
                for entry in resp.json().get("data", [])
            }
            return {
                "impressions": values.get("impressions", 0),
                "reach": values.get("reach", 0),
                "likes": values.get("likes", 0),
                "comments": values.get("comments", 0),
                "shares": values.get("shares", 0),
            }


def _raise_for_graph_error(response: httpx.Response) -> None:
    if response.status_code >= 400:
        try:
            detail = response.json().get("error", {}).get("message", response.text)
        except ValueError:
            detail = response.text
        raise MetaAPIError(f"Meta Graph API error ({response.status_code}): {detail}")


def _default_token_expiry() -> datetime:
    # Long-lived Page tokens don't expire under normal use, but we track a
    # nominal ~60 day horizon (matching the long-lived user token TTL) so a
    # background job can flag stale connections for re-auth.
    return datetime.now(timezone.utc) + timedelta(days=60)
