"""Generate images through the locally authenticated Antigravity CLI."""

import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from app.config import Settings

_OUTPUT_PREFIX = "ima2_generated"
_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
_MAX_OUTPUT_CHARS = 1_000_000


def _resolve_agy_bin(configured_bin: str = "") -> str:
    if configured_bin:
        configured_path = Path(configured_bin).expanduser()
        if configured_path.is_file():
            return str(configured_path)
        resolved = shutil.which(configured_bin)
        if resolved:
            return resolved
        raise RuntimeError(f"Configured AGY_BIN was not found: {configured_bin}")

    resolved = shutil.which("agy")
    if resolved:
        return resolved

    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        fallback = Path(local_app_data) / "agy" / "bin" / "agy.exe"
        if fallback.is_file():
            return str(fallback)

    raise RuntimeError(
        "Antigravity CLI was not found. Install it, restart the terminal, "
        "or set AGY_BIN to the full path of agy.exe."
    )


def _build_agy_prompt(prompt: str, reference_paths: list[Path]) -> str:
    paths = ", ".join(f'"{path.resolve()}"' for path in reference_paths[:3])
    image_paths = f"[{paths}]"
    return "\n".join(
        [
            "You are an image generation assistant inside a professional creative tool.",
            "Generate exactly one image by calling default_api:generate_image exactly once.",
            "Do not answer with text instead of calling the image tool.",
            "",
            f"Prompt: {prompt}",
            f'ImageName: "{_OUTPUT_PREFIX}"',
            f"ImagePaths: {image_paths}",
            'toolSummary: "NailSocial image generation"',
            'toolAction: "Generating NailSocial image"',
            "",
            "Preserve the reference-image order and follow the prompt precisely.",
            "After success print: RESULT|<absolute_artifact_path>|<file_extension>",
            "After failure print: ERROR|<concise error message>",
        ]
    )


def _run_agy(prompt: str, settings: Settings) -> str:
    agy_bin = _resolve_agy_bin(settings.agy_bin)
    env = os.environ.copy()
    agy_parent = str(Path(agy_bin).parent)
    env["PATH"] = agy_parent + os.pathsep + env.get("PATH", "")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    command = [agy_bin, "-p", prompt]
    if settings.agy_model:
        command += ["--model", settings.agy_model]
    try:
        result = subprocess.run(
            command,
            text=True,
            capture_output=True,
            timeout=settings.agy_generation_timeout_seconds,
            env=env,
            creationflags=flags,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Gemini OAuth image generation timed out") from exc
    except OSError as exc:
        raise RuntimeError(f"Could not start Antigravity CLI: {exc}") from exc

    output = (result.stdout + "\n" + result.stderr)[:_MAX_OUTPUT_CHARS]
    if result.returncode != 0 and not result.stdout.strip():
        detail = result.stderr.strip()[:500]
        raise RuntimeError(f"Antigravity CLI exited with code {result.returncode}: {detail}")
    return output


def _parse_artifact_path(output: str) -> Path | None:
    for raw_line in output.replace("\r", "").splitlines():
        line = raw_line.strip()
        if line.startswith("RESULT|"):
            parts = line.split("|")
            if len(parts) < 3:
                raise RuntimeError(f"Malformed Antigravity result: {line[:200]}")
            return Path(parts[1].strip().strip('"'))
        if line.startswith("ERROR|"):
            message = line.removeprefix("ERROR|").strip() or "Unknown generation error"
            raise RuntimeError(f"Gemini OAuth generation failed: {message}")
        if line.startswith("SAVED_PATH="):
            return Path(line.removeprefix("SAVED_PATH=").strip().strip('"'))

    normalized = output.replace("\\", "/")
    match = re.search(
        r"(?:[A-Za-z]:)?/[^\s\"']+/(?:brain|artifacts|\.gemini)/[^\s\"']+\.(?:png|jpe?g|webp)",
        normalized,
        re.IGNORECASE,
    )
    if not match:
        return None
    matched = match.group(0)
    if os.name == "nt":
        matched = matched.replace("/", "\\")
    return Path(matched)


def _find_recent_artifact(since: float) -> Path | None:
    roots = [Path.home() / ".gemini" / "antigravity-cli" / "brain", Path.home() / ".gemini"]
    candidates: list[tuple[float, Path]] = []
    for root in roots:
        if not root.is_dir():
            continue
        try:
            for path in root.rglob(f"{_OUTPUT_PREFIX}*"):
                if path.suffix.lower() not in _IMAGE_SUFFIXES or not path.is_file():
                    continue
                modified = path.stat().st_mtime
                if modified >= since - 5:
                    candidates.append((modified, path))
        except OSError:
            continue
    return max(candidates, default=(0.0, None), key=lambda item: item[0])[1]


def _is_allowed_artifact(path: Path) -> bool:
    resolved = path.resolve()
    allowed_roots = [Path.home() / ".gemini", Path.home() / ".cache", Path(tempfile.gettempdir())]
    return any(resolved == root.resolve() or resolved.is_relative_to(root.resolve()) for root in allowed_roots)


def generate_via_agy(prompt: str, reference_paths: list[Path], settings: Settings) -> bytes:
    started_at = time.time()
    output = _run_agy(_build_agy_prompt(prompt, reference_paths), settings)
    artifact = _parse_artifact_path(output) or _find_recent_artifact(started_at)
    if artifact is None:
        raise RuntimeError(f"Could not find the image produced by Antigravity CLI: {output[:300]}")
    if not _is_allowed_artifact(artifact):
        raise RuntimeError(f"Antigravity returned an unsafe artifact path: {artifact}")
    if not artifact.is_file():
        raise RuntimeError(f"Antigravity image artifact does not exist: {artifact}")

    image_bytes = artifact.read_bytes()
    try:
        artifact.unlink(missing_ok=True)
    except OSError:
        pass
    return image_bytes
