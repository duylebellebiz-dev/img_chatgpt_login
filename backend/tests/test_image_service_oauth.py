import json

import httpx

from app.services.image_service import _extract_image_from_sse, _tool_size


def test_extracts_image_and_usage_from_oauth_sse():
    events = [
        {
            "type": "response.output_item.done",
            "item": {"type": "image_generation_call", "result": "aGVsbG8="},
        },
        {
            "type": "response.completed",
            "response": {"usage": {"input_tokens": 12, "output_tokens": 34}},
        },
    ]
    body = "".join(f"data: {json.dumps(event)}\n\n" for event in events) + "data: [DONE]\n\n"
    response = httpx.Response(
        200,
        headers={"content-type": "text/event-stream"},
        content=body.encode(),
    )

    image_b64, usage = _extract_image_from_sse(response)

    assert image_b64 == "aGVsbG8="
    assert usage == {"input_tokens": 12, "output_tokens": 34}


def test_tool_size_tracks_target_orientation(tmp_path, tiny_png_bytes):
    reference = tmp_path / "reference.png"
    reference.write_bytes(tiny_png_bytes)

    assert _tool_size(1080, 1350, reference) == "1024x1536"
    assert _tool_size(1920, 1080, reference) == "1536x1024"
    assert _tool_size(1024, 1024, reference) == "1024x1024"
