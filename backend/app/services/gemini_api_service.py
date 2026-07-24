"""Generate images through the direct Google Gemini API (a billed API key),
as an alternative to the free `agy` provider (agy_service.py, which shells
out to the locally authenticated Antigravity CLI). Same request/response
shape as ima2-gen/lib/geminiApiImageAdapter.ts's public-API (non-Vertex) path.
"""

import base64
from pathlib import Path

import httpx

from app.config import Settings
from app.services.media_utils import detect_image_mime_type

# Aliases accepted in GEMINI_API_MODEL, mirroring ima2-gen's MODEL_ID_MAP —
# lets the same friendly names ("nano-banana-2"/"nano-banana-pro") be used
# across both providers even though this path hits a different endpoint.
_MODEL_ID_MAP = {
    "nano-banana-2": "gemini-3.1-flash-image",
    "nano-banana-pro": "gemini-3-pro-image",
}

_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def _resolve_model_id(model: str) -> str:
    return _MODEL_ID_MAP.get(model, model)


def _encode_reference(path: Path) -> dict:
    mime_type = detect_image_mime_type(path)
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return {"inlineData": {"mimeType": mime_type, "data": data}}


def generate_via_gemini_api(prompt: str, reference_paths: list[Path], settings: Settings) -> bytes:
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured. Set it in the backend .env to use the "
            "'Google Gemini API' provider (a separate, billed API key — not the free "
            "'agy' Antigravity CLI OAuth provider)."
        )

    model_id = _resolve_model_id(settings.gemini_api_model)
    parts: list[dict] = [_encode_reference(path) for path in reference_paths[:3]]
    parts.append({"text": prompt})

    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generation_config": {"response_modalities": ["TEXT", "IMAGE"]},
    }

    try:
        response = httpx.post(
            f"{_API_BASE}/{model_id}:generateContent",
            json=body,
            headers={"x-goog-api-key": settings.gemini_api_key},
            timeout=settings.gemini_api_timeout_seconds,
        )
    except httpx.TimeoutException as exc:
        raise RuntimeError("Gemini API image generation timed out") from exc
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Could not reach the Gemini API: {exc}") from exc

    if response.status_code != 200:
        raise RuntimeError(f"Gemini API error ({response.status_code}): {response.text[:500]}")

    payload = response.json()
    candidates = payload.get("candidates") or []
    response_parts = (candidates[0].get("content", {}).get("parts") if candidates else None) or []

    for part in response_parts:
        inline_data = part.get("inlineData") or part.get("inline_data")
        if inline_data and inline_data.get("data"):
            return base64.b64decode(inline_data["data"])

    finish_reason = candidates[0].get("finishReason") if candidates else None
    if finish_reason == "SAFETY":
        raise RuntimeError("Gemini API: generation blocked by safety filter")
    raise RuntimeError(f"Gemini API: no image in response (finishReason: {finish_reason or 'unknown'})")
