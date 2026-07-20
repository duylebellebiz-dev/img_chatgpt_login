from types import SimpleNamespace

import pytest

from app.services.anthropic_utils import extract_text


def _block(type_, text=None):
    return SimpleNamespace(type=type_, text=text)


def _response(blocks, stop_reason="end_turn"):
    return SimpleNamespace(content=blocks, stop_reason=stop_reason)


def test_extract_text_reads_simple_text_response():
    response = _response([_block("text", "hello world")])
    assert extract_text(response) == "hello world"


def test_extract_text_strips_whitespace():
    response = _response([_block("text", "  hello world  \n")])
    assert extract_text(response) == "hello world"


def test_extract_text_skips_leading_non_text_blocks():
    """Regression guard: extended-thinking responses can put a 'thinking'
    block before the text block; content[0].text would be None there."""
    response = _response([_block("thinking", None), _block("text", "the real answer")])
    assert extract_text(response) == "the real answer"


def test_extract_text_raises_clear_error_when_no_text_block_present():
    response = _response([_block("tool_use", None)], stop_reason="tool_use")
    with pytest.raises(RuntimeError, match="tool_use"):
        extract_text(response)


def test_extract_text_raises_on_empty_content():
    response = _response([])
    with pytest.raises(RuntimeError):
        extract_text(response)
