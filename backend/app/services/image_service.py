"""Generate and edit images through a local ChatGPT/Codex OAuth proxy.

The proxy is supplied by the sibling ima2-gen project. This service never
reads, copies, or persists ChatGPT credentials; it only calls the proxy on
localhost using its Responses-API-compatible endpoint.
"""

import base64
import json
from pathlib import Path
from typing import Any

import httpx
from PIL import Image, ImageDraw, ImageFont

from app.config import Settings, get_settings
from app.services import usage_service
from app.services.media_utils import detect_image_mime_type, extension_for_mime_type, fit_to_size, prepare_image_for_api

_NO_TEXT_SUFFIX = (
    " Do not render any text, letters, numbers, words, captions, watermarks, "
    "logos, or writing of any kind anywhere in the image."
)

_QUALITY_SUFFIX = (
    " Render at the highest possible sharpness with crisp fine detail, "
    "professional macro-photography clarity, and no blur or compression artifacts."
)

_COMPOSITING_CONTRACT = (
    " You are given exactly two reference images in this order: "
    "Image 1 = HAND POSE reference; Image 2 = NAIL DESIGN reference. "
    "Create one new image that preserves the exact hand anatomy, pose, camera angle, "
    "skin tone, lighting, framing, and background from Image 1. Apply the exact nail "
    "design from Image 2 to every visible nail, including colors, gradients, patterns, "
    "embellishments, placement, and finish. Do not copy Image 2's hand or background. "
    "The output must visibly combine both references and must not echo either input unchanged."
)

_DEVELOPER_PROMPT = (
    "Your primary function is to invoke the image_generation tool. Never answer with "
    "plain text only. Preserve the user's prompt and reference-image order. Apply the "
    "requested generation or edit precisely without changing unaffected details."
)


def _mock_generate(
    design_path: Path,
    pose_path: Path,
    prompt: str,
    variation: int,
    attempt: int,
    out_path: Path,
    width: int | None = None,
    height: int | None = None,
) -> tuple[Path, str]:
    canvas = Image.new("RGB", (800, 500), color=(245, 240, 235))
    thumb_size = (360, 360)
    for src_path, x in ((design_path, 20), (pose_path, 420)):
        try:
            with Image.open(src_path) as img:
                img = img.convert("RGB")
                img.thumbnail(thumb_size)
                canvas.paste(img, (x, 20))
        except Exception:
            canvas.paste(Image.new("RGB", thumb_size, color=(200, 200, 200)), (x, 20))
    _draw_mock_label(canvas, f"[MOCK CHATGPT OUTPUT] variation {variation} attempt {attempt}\n{prompt[:180]}")
    return _save_mock(canvas, out_path, width, height)


def _mock_edit(
    image_path: Path,
    prompt: str,
    attempt: int,
    out_path: Path,
    width: int | None = None,
    height: int | None = None,
) -> tuple[Path, str]:
    canvas = Image.new("RGB", (800, 500), color=(245, 240, 235))
    try:
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            img.thumbnail((760, 370))
            canvas.paste(img, (20, 15))
    except Exception:
        canvas.paste(Image.new("RGB", (760, 370), color=(200, 200, 200)), (20, 15))
    _draw_mock_label(canvas, f"[MOCK CHATGPT EDIT] attempt {attempt}\n{prompt[:180]}")
    return _save_mock(canvas, out_path, width, height)


def _draw_mock_label(canvas: Image.Image, label: str) -> None:
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    draw.multiline_text((20, 400), label, fill=(30, 30, 30), font=font)


def _save_mock(canvas: Image.Image, out_path: Path, width: int | None, height: int | None) -> tuple[Path, str]:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, format="PNG")
    if width and height:
        fit_to_size(out_path, width, height)
    return out_path, "image/png"


def _reference_input(path: Path) -> dict[str, str]:
    image_bytes, mime_type = prepare_image_for_api(path)
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return {"type": "input_image", "image_url": f"data:{mime_type};base64,{encoded}"}


def _tool_size(width: int | None, height: int | None, reference_path: Path) -> str:
    if not width or not height:
        with Image.open(reference_path) as image:
            width, height = image.size
    ratio = width / height
    if ratio > 1.15:
        return "1536x1024"
    if ratio < 0.87:
        return "1024x1536"
    return "1024x1024"


def _extract_image_from_json(payload: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    for item in payload.get("output", []):
        if item.get("type") == "image_generation_call" and item.get("result"):
            return item["result"], payload.get("usage")
    return None, payload.get("usage")


def _extract_image_from_sse(response: httpx.Response) -> tuple[str | None, dict[str, Any] | None]:
    image_b64 = None
    usage = None
    data_lines: list[str] = []
    for line in response.iter_lines():
        if line.startswith("data: "):
            data_lines.append(line[6:])
            continue
        if line or not data_lines:
            continue
        raw = "".join(data_lines)
        data_lines.clear()
        if raw == "[DONE]":
            continue
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "error":
            message = event.get("error", {}).get("message", "OAuth stream returned an error")
            raise RuntimeError(message)
        item = event.get("item", {})
        if event.get("type") == "response.output_item.done" and item.get("type") == "image_generation_call":
            image_b64 = item.get("result") or image_b64
        if event.get("type") == "response.completed":
            usage = event.get("response", {}).get("usage")
    return image_b64, usage


def _save_base64_image(
    image_b64: str,
    out_path: Path,
    width: int | None = None,
    height: int | None = None,
) -> tuple[Path, str]:
    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except (ValueError, TypeError) as exc:
        raise RuntimeError("ChatGPT OAuth response contained invalid image data") from exc
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(image_bytes)
    mime_type = detect_image_mime_type(out_path)
    final_path = out_path.with_suffix(extension_for_mime_type(mime_type))
    if final_path != out_path:
        out_path.replace(final_path)
    if width and height:
        fit_to_size(final_path, width, height)
    return final_path, mime_type


class ImageService:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        provider = self.settings.image_provider.strip().lower()
        if provider not in {"chatgpt_oauth", "mock"}:
            raise ValueError("IMAGE_PROVIDER must be 'chatgpt_oauth' or 'mock'")

    @property
    def is_mock(self) -> bool:
        return self.settings.uses_mock_images

    def _request_image(self, prompt: str, references: list[Path], size: str, operation: str) -> str:
        user_content = [_reference_input(path) for path in references]
        user_content.append({"type": "input_text", "text": prompt})
        payload = {
            "model": self.settings.chatgpt_image_model,
            "input": [
                {"role": "developer", "content": _DEVELOPER_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "tools": [{
                "type": "image_generation",
                "quality": self.settings.chatgpt_image_quality,
                "size": size,
                "moderation": self.settings.chatgpt_image_moderation,
            }],
            "tool_choice": "required",
            "reasoning": {"effort": self.settings.chatgpt_reasoning_effort},
            "stream": True,
        }
        image_b64, usage = self._post_responses(payload)
        if not image_b64:
            retry_payload = dict(payload)
            retry_payload["stream"] = False
            image_b64, usage = self._post_responses(retry_payload)
        if not image_b64:
            raise RuntimeError("ChatGPT OAuth response did not contain image data")
        usage_service.record_chatgpt_oauth_usage(
            operation, self.settings.chatgpt_image_model, usage, image_count=1
        )
        return image_b64

    def _post_responses(self, payload: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
        url = self.settings.chatgpt_oauth_proxy_url.rstrip("/") + "/v1/responses"
        timeout = httpx.Timeout(self.settings.chatgpt_generation_timeout_seconds)
        try:
            with httpx.Client(timeout=timeout) as client:
                with client.stream(
                    "POST", url, json=payload, headers={"Accept": "text/event-stream"}
                ) as response:
                    if not response.is_success:
                        detail = response.read().decode("utf-8", errors="replace")[:500]
                        raise RuntimeError(f"ChatGPT OAuth proxy returned {response.status_code}: {detail}")
                    if "text/event-stream" in response.headers.get("content-type", ""):
                        return _extract_image_from_sse(response)
                    response.read()
                    return _extract_image_from_json(response.json())
        except httpx.RequestError as exc:
            raise RuntimeError(
                "ChatGPT OAuth proxy is unavailable. Start/login through ima2-gen first "
                f"({self.settings.chatgpt_oauth_proxy_url})."
            ) from exc

    def generate_image(
        self,
        design_path: Path,
        pose_path: Path,
        prompt: str,
        variation: int,
        out_path: Path,
        attempt: int = 1,
        width: int | None = None,
        height: int | None = None,
    ) -> tuple[Path, str]:
        if self.is_mock:
            return _mock_generate(design_path, pose_path, prompt, variation, attempt, out_path, width, height)
        full_prompt = prompt + _COMPOSITING_CONTRACT + _QUALITY_SUFFIX + _NO_TEXT_SUFFIX
        size = _tool_size(width, height, pose_path)
        image_b64 = self._request_image(full_prompt, [pose_path, design_path], size, "generate_image")
        return _save_base64_image(image_b64, out_path, width, height)

    def edit_image(
        self,
        image_path: Path,
        prompt: str,
        out_path: Path,
        attempt: int = 1,
        width: int | None = None,
        height: int | None = None,
    ) -> tuple[Path, str]:
        if self.is_mock:
            return _mock_edit(image_path, prompt, attempt, out_path, width, height)
        full_prompt = prompt + _QUALITY_SUFFIX + _NO_TEXT_SUFFIX
        size = _tool_size(width, height, image_path)
        image_b64 = self._request_image(full_prompt, [image_path], size, "edit_image")
        return _save_base64_image(image_b64, out_path, width, height)
