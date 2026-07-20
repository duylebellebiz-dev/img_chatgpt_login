from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import get_settings
from app.database import Base, engine
from app.db_schema_sync import sync_schema
from app.routers import auth, batch, branding, campaigns, edit, notifications, performance, scheduled_posts, social, usage
from app.services import scheduler_service
from app.services.storage_service import StorageService


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 1 MVP: create tables directly instead of Alembic migrations.
    Base.metadata.create_all(bind=engine)
    sync_schema(engine)
    scheduler_service.start_scheduler()
    yield
    scheduler_service.stop_scheduler()


settings = get_settings()

app = FastAPI(title="NailSocial AI - Image Pipeline", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(batch.router)
app.include_router(edit.router)
app.include_router(branding.router)
app.include_router(auth.router)
app.include_router(social.router)
app.include_router(scheduled_posts.router)
app.include_router(notifications.router)
app.include_router(campaigns.router)
app.include_router(usage.router)
app.include_router(performance.router)

(settings.storage_path / "generated").mkdir(parents=True, exist_ok=True)
(settings.storage_path / "original").mkdir(parents=True, exist_ok=True)
(settings.storage_path / "branding").mkdir(parents=True, exist_ok=True)

_storage = StorageService(settings)


def _serve(path: Path) -> FileResponse:
    """Local storage_root is just a cache in front of Cloudinary — a host
    without a persistent disk (e.g. Render's free web service) can lose local
    files on restart, so pull the file back from Cloudinary on a cache miss
    before serving."""
    _storage.ensure_local(path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


@app.get("/media/generated/{job_id}/{filename}", name="generated")
def media_generated(job_id: str, filename: str) -> FileResponse:
    job_id = Path(job_id).name
    filename = Path(filename).name
    return _serve(settings.storage_path / "generated" / job_id / filename)


@app.get("/media/original/{job_id}/{kind}/{filename}", name="original")
def media_original(job_id: str, kind: str, filename: str) -> FileResponse:
    job_id = Path(job_id).name
    kind = Path(kind).name
    filename = Path(filename).name
    return _serve(settings.storage_path / "original" / job_id / kind / filename)


@app.get("/media/branding/{user_id}/{filename}", name="branding")
def media_branding(user_id: str, filename: str) -> FileResponse:
    user_id = Path(user_id).name
    filename = Path(filename).name
    return _serve(settings.storage_path / "branding" / user_id / filename)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "mock_claude": not settings.has_anthropic_key,
        "image_provider": settings.image_provider,
        "mock_images": settings.uses_mock_images,
    }
