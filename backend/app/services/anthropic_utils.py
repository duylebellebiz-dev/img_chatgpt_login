"""Shared helper for reading Claude responses.

Anthropic responses can lead with a non-text block (e.g. an extended-thinking
block) before the text block, or contain no text block at all (e.g. a
refusal). Blindly reading response.content[0].text crashes with
'NoneType' object has no attribute 'strip'' in those cases — this walks the
block list instead of assuming position 0 is text.
"""


def extract_text(response) -> str:
    for block in response.content:
        if getattr(block, "type", None) == "text" and getattr(block, "text", None):
            return block.text.strip()

    stop_reason = getattr(response, "stop_reason", None)
    raise RuntimeError(f"Claude response did not contain a text block (stop_reason={stop_reason})")
