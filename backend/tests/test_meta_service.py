from app.config import Settings
from app.services.meta_service import MetaService


def _settings(**overrides) -> Settings:
    defaults = {"facebook_app_id": "", "facebook_app_secret": ""}
    defaults.update(overrides)
    return Settings(**defaults)


def test_is_mock_when_no_facebook_credentials():
    service = MetaService(_settings())
    assert service.is_mock is True


def test_is_mock_false_when_credentials_configured():
    service = MetaService(_settings(facebook_app_id="app-id", facebook_app_secret="app-secret"))
    assert service.is_mock is False


def test_mock_oauth_url_is_browser_navigable_and_completes_the_flow():
    """Mock mode must redirect somewhere the browser can actually load —
    an unnavigable "mock://" URL leaves the user stuck on a dead link when
    clicking "Connect Facebook" for real (see the callback route, which is
    this same URL). It should point back at our own callback with a fake
    code, not out to a fake external domain."""
    service = MetaService(_settings())
    url = service.get_oauth_url("some-state")
    assert url.startswith(service.settings.facebook_redirect_uri)
    assert "state=some-state" in url
    assert "code=" in url


def test_mock_exchange_code_for_token_is_deterministic():
    service = MetaService(_settings())
    token1 = service.exchange_code_for_token("abc")
    token2 = service.exchange_code_for_token("abc")
    assert token1 == token2
    assert "abc" in token1


def test_mock_list_pages_resolves_a_linked_instagram_account():
    """Instagram account resolution is enabled now that read_insights/
    instagram_manage_insights are requested (see meta_service.py module
    docstring) — mock mode mirrors that so the full connect flow is
    exercisable without a real Meta App."""
    service = MetaService(_settings())
    pages = service.list_pages("user-token")
    assert len(pages) == 1
    assert pages[0].page_id
    assert pages[0].instagram_business_account_id is not None


def test_mock_facebook_post_insights_returns_engagement_fields():
    service = MetaService(_settings())
    data = service.get_facebook_post_insights("post-1", "token")
    assert set(data) == {"impressions", "reach", "likes", "comments", "shares"}


def test_mock_instagram_media_insights_returns_engagement_fields():
    service = MetaService(_settings())
    data = service.get_instagram_media_insights("media-1", "token")
    assert set(data) == {"impressions", "reach", "likes", "comments", "shares"}


def test_mock_publish_to_facebook_returns_platform_post_id():
    service = MetaService(_settings())
    result = service.publish_to_facebook("page-1", "token", "mock://media/img", "caption")
    assert result.platform_post_id


def test_mock_publish_to_instagram_returns_platform_post_id():
    service = MetaService(_settings())
    result = service.publish_to_instagram("ig-1", "token", "mock://media/img", "caption")
    assert result.platform_post_id


def test_mock_publish_to_facebook_carousel_returns_platform_post_id():
    service = MetaService(_settings())
    result = service.publish_to_facebook_carousel(
        "page-1", "token", ["mock://media/img1", "mock://media/img2"], "caption"
    )
    assert result.platform_post_id
    assert "carousel" in result.platform_post_id


def test_mock_publish_to_instagram_carousel_returns_platform_post_id():
    service = MetaService(_settings())
    result = service.publish_to_instagram_carousel(
        "ig-1", "token", ["mock://media/img1", "mock://media/img2"], "caption"
    )
    assert result.platform_post_id
    assert "carousel" in result.platform_post_id
