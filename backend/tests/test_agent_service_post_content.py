from app.config import Settings
from app.services.agent_service import AgentService


def _settings(**overrides) -> Settings:
    return Settings(anthropic_api_key="", **overrides)


def test_mock_generate_post_content_returns_caption_and_hashtags():
    agent = AgentService(_settings())
    assert agent.is_mock is True

    content = agent.generate_post_content("elegant summer nail set", salon_context="", platform="facebook_page")

    assert content["caption"]
    assert isinstance(content["hashtags"], list)
    assert len(content["hashtags"]) > 0
    assert all(tag.startswith("#") for tag in content["hashtags"])


def test_mock_generate_post_content_includes_image_context():
    agent = AgentService(_settings())
    content = agent.generate_post_content("chrome french tips", salon_context="", platform="instagram_business")
    assert "chrome french tips" in content["caption"]


def test_mock_generate_post_content_varies_by_recent_captions_length():
    agent = AgentService(_settings())
    no_history = agent.generate_post_content("elegant summer nail set", salon_context="", platform="facebook_page")
    with_history = agent.generate_post_content(
        "elegant summer nail set",
        salon_context="",
        platform="facebook_page",
        recent_captions=["caption one", "caption two", "caption three"],
    )
    assert no_history["caption"] != with_history["caption"]
