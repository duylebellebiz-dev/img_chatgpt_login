"""Generate/edit images through ima2-gen's local OAuth server.

ima2-gen (vendored at ../ima2-gen) handles the ChatGPT/Codex OAuth login and
exposes a plain local HTTP API (`ima2 serve`, POST /api/generate) that draws
on the signed-in ChatGPT account's plan quota instead of a billed
OPENAI_API_KEY — mirroring how agy_service.py uses Gemini's free Antigravity
CLI OAuth session. See ima2-gen/bin/commands/gen.ts and
ima2-gen/bin/lib/client.ts for the reference request/response shape this
mirrors.
"""

import base64
import mimetypes
from pathlib import Path

import httpx

from app.config import Settings


def _file_to_data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    b64 = base64.b64encode(path.read_bytes()).decode()
    return f"data:{mime};base64,{b64}"


def _data_uri_to_bytes(data_uri: str) -> bytes:
    if data_uri.startswith("data:") and "," in data_uri:
        data_uri = data_uri.split(",", 1)[1]
    return base64.b64decode(data_uri)


def generate_via_gpt_oauth(prompt: str, reference_paths: list[Path], settings: Settings) -> bytes:
    url = f"{settings.ima2_server_url.rstrip('/')}/api/generate"
    payload = {
        "prompt": prompt,
        "provider": "oauth",
        "quality": settings.gpt_oauth_quality,
        "size": "auto",
        "n": 1,
        "model": settings.gpt_oauth_model,
        "references": [_file_to_data_uri(p) for p in reference_paths],
    }
    try:
        response = httpx.post(url, json=payload, timeout=settings.gpt_oauth_generation_timeout_seconds)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        raise RuntimeError(f"ChatGPT OAuth image generation failed ({exc.response.status_code}): {detail}") from exc
    except httpx.HTTPError as exc:
        raise RuntimeError(
            f"Could not reach the ima2 server at {url} — make sure `ima2 serve` is running "
            f"and signed in (`codex login`)."
        ) from exc

    data = response.json()
    images = data.get("images") or ([{"image": data["image"]}] if data.get("image") else [])
    if not images or not images[0].get("image"):
        raise RuntimeError("ima2 server returned no image data")
    return _data_uri_to_bytes(images[0]["image"])
