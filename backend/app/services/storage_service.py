"""Keeps originals and generated images in separate folders (per CLAUDE.md #7)
so a failed Vision QA pass is easy to audit against its source references,
and builds the final ZIP export for a batch job.
"""

import re
import shutil
import zipfile
from pathlib import Path

from fastapi import UploadFile

from app.config import Settings, get_settings
from app.services.cloudinary_client import CloudinaryClient
from app.services.media_utils import extension_for_mime_type


def _safe_filename(name: str) -> str:
    name = Path(name).name  # strip any directory components
    name = re.sub(r"[^A-Za-z0-9_.-]", "_", name)
    return name or "file"


class StorageService:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.root = self.settings.storage_path
        self.cloudinary = CloudinaryClient(self.settings)

    def _key_for(self, path: Path) -> str:
        return path.resolve().relative_to(self.root.resolve()).as_posix()

    def _is_under_root(self, path: Path) -> bool:
        return path.resolve().is_relative_to(self.root.resolve())

    def upload(self, path: Path) -> None:
        """Pushes a local file to Cloudinary as its durable copy. Best-effort
        — never raises, so a Cloudinary hiccup doesn't sink the generation
        pipeline. A no-op for any path outside storage_root (e.g. a caller's
        own tmp file) since there's no key to store it under."""
        if not self._is_under_root(path):
            return
        self.cloudinary.upload_file(path, self._key_for(path))

    def ensure_local(self, path: Path) -> Path:
        """Pulls a file back from Cloudinary into its local scratch path if
        it's missing locally (e.g. after a restart wiped storage_root). Local
        disk acts as a cache in front of Cloudinary, not the source of
        truth. A no-op for any path outside storage_root — nothing Cloudinary
        would know it by."""
        if not path.exists() and self._is_under_root(path):
            self.cloudinary.download_file(self._key_for(path), path)
        return path

    def original_dir(self, job_id: str, kind: str) -> Path:
        path = self.root / "original" / job_id / kind
        path.mkdir(parents=True, exist_ok=True)
        return path

    def generated_dir(self, job_id: str) -> Path:
        path = self.root / "generated" / job_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def exports_dir(self) -> Path:
        path = self.root / "exports"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def branding_dir(self, user_id: str) -> Path:
        path = self.root / "branding" / Path(user_id).name
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_logo(self, user_id: str, upload_file: UploadFile) -> Path:
        """Saves the salon logo, replacing any previous one for this tenant.
        Keeps a fixed stem so old extensions left behind by a prior upload
        don't linger and get served stale."""
        dest_dir = self.branding_dir(user_id)
        for existing in dest_dir.glob("logo.*"):
            self.cloudinary.delete_file(self._key_for(existing))
            existing.unlink(missing_ok=True)

        suffix = Path(upload_file.filename or "logo.png").suffix or ".png"
        dest_path = dest_dir / f"logo{suffix}"
        with dest_path.open("wb") as f:
            upload_file.file.seek(0)
            shutil.copyfileobj(upload_file.file, f)
        self.upload(dest_path)
        return dest_path

    def save_upload(self, job_id: str, kind: str, upload_file: UploadFile) -> Path:
        filename = _safe_filename(upload_file.filename or "upload")
        dest_dir = self.original_dir(job_id, kind)
        dest_path = dest_dir / filename

        counter = 1
        stem, suffix = dest_path.stem, dest_path.suffix
        while dest_path.exists():
            dest_path = dest_dir / f"{stem}_{counter}{suffix}"
            counter += 1

        with dest_path.open("wb") as f:
            upload_file.file.seek(0)
            shutil.copyfileobj(upload_file.file, f)
        self.upload(dest_path)
        return dest_path

    def clone_original(self, job_id: str, kind: str, source_path: Path) -> Path:
        """Copies an existing original upload (e.g. a prior batch job's
        design/pose image, for auto-refill — see auto_refill_service.py)
        into a new job's own original/ folder, so the new job doesn't depend
        on the source job's files still existing."""
        source_path = self.ensure_local(source_path)
        dest_dir = self.original_dir(job_id, kind)
        dest_path = dest_dir / source_path.name

        counter = 1
        stem, suffix = dest_path.stem, dest_path.suffix
        while dest_path.exists():
            dest_path = dest_dir / f"{stem}_{counter}{suffix}"
            counter += 1

        shutil.copy2(source_path, dest_path)
        self.upload(dest_path)
        return dest_path

    def generated_image_path(self, job_id: str, image_id: str, mime_type: str = "image/png") -> Path:
        return self.generated_dir(job_id) / f"{image_id}{extension_for_mime_type(mime_type)}"

    def build_zip(self, job_id: str, image_paths: list[Path]) -> Path:
        zip_path = self.exports_dir() / f"{job_id}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for path in image_paths:
                if path.exists():
                    zf.write(path, arcname=path.name)
        self.upload(zip_path)
        return zip_path

    def cleanup_job(self, job_id: str) -> None:
        """Removes a job's files both locally and from Cloudinary (its
        durable copy — see CloudinaryClient) so a deleted job doesn't keep
        costing storage or serving images that no longer exist in the app."""
        self.cloudinary.delete_prefix(f"original/{job_id}/")
        self.cloudinary.delete_prefix(f"generated/{job_id}/")
        self.cloudinary.delete_file(f"exports/{job_id}.zip")
        for path in (
            self.root / "original" / job_id,
            self.root / "generated" / job_id,
            self.exports_dir() / f"{job_id}.zip",
        ):
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            elif path.exists():
                path.unlink(missing_ok=True)
