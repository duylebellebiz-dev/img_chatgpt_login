"""Cloudinary client — the durable copy of everything under storage_root.
Free-tier web hosts (e.g. Render's free web service) don't offer a persistent
disk, so local storage_root is treated as a scratch/cache directory that can
be wiped by a restart or scale-to-zero cycle; Cloudinary is what actually
survives. All methods are no-ops when Cloudinary isn't configured, so local
dev (and CI) keeps working purely on local disk without any credentials.

Everything is stored as resource_type="raw" — i.e. Cloudinary is used as a
plain key/value blob store keyed by the same relative path StorageService
already uses for local files, rather than routing through Cloudinary's
image-CDN/transformation URLs. Media is still served by this backend's own
/media/... routes, unchanged.
"""

import logging
from pathlib import Path

import httpx

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_RESOURCE_TYPE = "raw"


class CloudinaryClient:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self._configured = False
        if self.settings.has_cloudinary:
            import cloudinary

            cloudinary.config(
                cloud_name=self.settings.cloudinary_cloud_name,
                api_key=self.settings.cloudinary_api_key,
                api_secret=self.settings.cloudinary_api_secret,
                secure=True,
            )
            self._configured = True

    @property
    def is_configured(self) -> bool:
        return self._configured

    def upload_file(self, local_path: Path, key: str) -> None:
        if not self.is_configured or not local_path.exists():
            return
        try:
            import cloudinary.uploader

            cloudinary.uploader.upload(
                str(local_path),
                public_id=key,
                resource_type=_RESOURCE_TYPE,
                overwrite=True,
                invalidate=True,
            )
        except Exception:  # noqa: BLE001 - best-effort; local disk still has the file for this process's lifetime
            logger.exception("Cloudinary upload failed for key=%s", key)

    def download_file(self, key: str, local_path: Path) -> bool:
        if not self.is_configured:
            return False
        try:
            import cloudinary.utils

            url, _ = cloudinary.utils.cloudinary_url(key, resource_type=_RESOURCE_TYPE, secure=True)
            local_path.parent.mkdir(parents=True, exist_ok=True)
            with httpx.stream("GET", url) as response:
                response.raise_for_status()
                with local_path.open("wb") as f:
                    for chunk in response.iter_bytes():
                        f.write(chunk)
            return True
        except Exception:  # noqa: BLE001 - object may simply not exist (never uploaded, or already deleted)
            return False

    def delete_file(self, key: str) -> None:
        if not self.is_configured:
            return
        try:
            import cloudinary.uploader

            cloudinary.uploader.destroy(key, resource_type=_RESOURCE_TYPE, invalidate=True)
        except Exception:  # noqa: BLE001 - best-effort cleanup, never block the caller's main flow
            logger.exception("Cloudinary delete failed for key=%s", key)

    def delete_prefix(self, prefix: str) -> None:
        """Deletes every object whose key starts with `prefix` in one call —
        used to purge a whole job's folder (original/<job_id>/, generated/
        <job_id>/) without the caller having to enumerate each file."""
        if not self.is_configured:
            return
        try:
            import cloudinary.api

            cloudinary.api.delete_resources_by_prefix(prefix, resource_type=_RESOURCE_TYPE)
        except Exception:  # noqa: BLE001 - best-effort cleanup, never block the caller's main flow
            logger.exception("Cloudinary delete_prefix failed for prefix=%s", prefix)
