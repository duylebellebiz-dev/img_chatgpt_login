"""Generate images through Google's real Gemini Batch API
(`models/{model}:batchGenerateContent`) — same billed API key as
gemini_api_service.py's "gemini_api" provider, but priced at Google's Batch
Mode discount (~50% off the standard synchronous cost per
ai.google.dev/gemini-api/docs/batch-mode) in exchange for not being instant:
each request is submitted as its own one-item batch job, then polled until
Google finishes it, instead of returning a rendered image synchronously.

Submitting one image per batch job (rather than bundling a whole
BatchJob's images into a single Google batch) is deliberate: it lets this
provider slot into the exact same per-image generate/quality-gate/retry
pipeline as every other provider (see ImageService._request_image and
batch_tasks.py) with no changes to that pipeline, at the cost of one extra
poll loop per image instead of one shared poll for the whole job.
"""

import base64
import time
from collections.abc import Callable
from pathlib import Path

import httpx

from app.config import Settings
from app.services.gemini_api_service import _encode_reference, _resolve_model_id

_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


def _submit_batch(prompt: str, reference_paths: list[Path], model_id: str, settings: Settings) -> str:
    parts: list[dict] = [_encode_reference(path) for path in reference_paths[:3]]
    parts.append({"text": prompt})

    # BatchGenerateContentRequest has exactly one top-level field, "batch"
    # (a GenerateContentBatch) — everything must be nested under it, using
    # the raw proto (snake_case) field names, or the API rejects the whole
    # request with "Unknown name ...: Cannot find field" (confirmed against
    # the live API — see ai.google.dev/gemini-api/docs/batch-mode's curl
    # example for the exact shape this mirrors).
    body = {
        "batch": {
            "display_name": "nailsocial-batch",
            "input_config": {
                "requests": {
                    "requests": [
                        {
                            "request": {
                                "contents": [{"role": "user", "parts": parts}],
                                "generation_config": {"response_modalities": ["TEXT", "IMAGE"]},
                            }
                        }
                    ]
                }
            },
        }
    }

    try:
        response = httpx.post(
            f"{_API_BASE}/models/{model_id}:batchGenerateContent",
            json=body,
            headers={"x-goog-api-key": settings.gemini_api_key},
            timeout=60.0,
        )
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Could not reach the Gemini Batch API: {exc}") from exc

    if response.status_code != 200:
        raise RuntimeError(f"Gemini Batch API submit failed ({response.status_code}): {response.text[:500]}")

    name = response.json().get("name")
    if not name:
        raise RuntimeError("Gemini Batch API submit did not return a job name")
    return name


def _poll_batch(job_name: str, settings: Settings) -> dict:
    """GET .../{job_name} returns a google.longrunning.Operation, not the
    GenerateContentBatch resource directly: {name, metadata, done, and once
    done is true, either `response` (GenerateContentBatchOutput, on success)
    or `error` (a google.rpc.Status, on failure)}. `metadata.state` (the
    BATCH_STATE_* enum) tracks progress but isn't itself the completion
    signal — `done` is. Confirmed against a real submitted job; the REST
    reference docs describe the GenerateContentBatch resource's own field
    layout, which is what `metadata` holds, not the Operation envelope
    wrapping it."""
    deadline = time.monotonic() + settings.gemini_batch_api_timeout_seconds
    while True:
        try:
            response = httpx.get(
                f"{_API_BASE}/{job_name}",
                headers={"x-goog-api-key": settings.gemini_api_key},
                timeout=30.0,
            )
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Could not reach the Gemini Batch API: {exc}") from exc

        if response.status_code != 200:
            raise RuntimeError(f"Gemini Batch API status check failed ({response.status_code}): {response.text[:500]}")

        payload = response.json()
        if payload.get("done"):
            if "error" in payload:
                raise RuntimeError(f"Gemini Batch API job {job_name} failed: {payload['error']}")
            return payload

        if time.monotonic() >= deadline:
            state = payload.get("metadata", {}).get("state")
            raise RuntimeError(
                f"Gemini Batch API job {job_name} did not finish within "
                f"{settings.gemini_batch_api_timeout_seconds:.0f}s (state={state}). "
                "Google's own target turnaround is up to 24h — raise "
                "GEMINI_BATCH_API_TIMEOUT_SECONDS if your batches are consistently this slow."
            )
        time.sleep(settings.gemini_batch_api_poll_interval_seconds)


def _extract_image(payload: dict, job_name: str) -> bytes:
    result = payload.get("response") or {}
    responses = result.get("inlinedResponses", {}).get("inlinedResponses") or []
    if not responses:
        raise RuntimeError(f"Gemini Batch API job {job_name} succeeded with no responses")

    candidates = responses[0].get("response", {}).get("candidates") or []
    parts = (candidates[0].get("content", {}).get("parts") if candidates else None) or []
    for part in parts:
        inline_data = part.get("inlineData") or part.get("inline_data")
        if inline_data and inline_data.get("data"):
            return base64.b64decode(inline_data["data"])

    finish_reason = candidates[0].get("finishReason") if candidates else None
    if finish_reason == "SAFETY":
        raise RuntimeError("Gemini Batch API: generation blocked by safety filter")
    raise RuntimeError(f"Gemini Batch API: no image in response (finishReason: {finish_reason or 'unknown'})")


def generate_via_gemini_batch_api(
    prompt: str,
    reference_paths: list[Path],
    settings: Settings,
    on_job_submitted: Callable[[str], None] | None = None,
) -> bytes:
    """on_job_submitted, if given, is called with the Google job name right
    after submission succeeds — before the (potentially long) poll loop
    starts. This is the caller's one chance to persist the job name
    somewhere durable: if the process dies mid-poll, that's the only way a
    restarted backend can reconnect to the job Google is still processing
    instead of losing it (or paying to resubmit) — see
    recover_via_gemini_batch_api and batch_tasks.process_batch_job's resume
    path."""
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured. Set it in the backend .env to use the "
            "'Gemini Batch API' provider (same key as 'gemini_api', billed at Google's "
            "cheaper Batch Mode rate)."
        )

    model_id = _resolve_model_id(settings.gemini_api_model)
    job_name = _submit_batch(prompt, reference_paths, model_id, settings)
    if on_job_submitted is not None:
        on_job_submitted(job_name)
    payload = _poll_batch(job_name, settings)
    return _extract_image(payload, job_name)


def recover_via_gemini_batch_api(job_name: str, settings: Settings) -> bytes:
    """Reconnects to a batch job that was already submitted by an earlier
    (now-dead) process, instead of submitting a new one — skips
    _submit_batch entirely so recovering an interrupted job never causes a
    duplicate, separately-billed submission for the same image."""
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured. Set it in the backend .env to recover a "
            "pending 'Gemini Batch API' job."
        )
    payload = _poll_batch(job_name, settings)
    return _extract_image(payload, job_name)
