import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI

from app.database import SessionLocal, init_db
from app.auth import init_jwt_secret, load_passwords
from app.models import File
from app.routers import auth, drives, files, playlists, progress, uploads, ws
from app.services.fileops import physical_delete
from app.services.scanner import scan_all_drives
from app.services.upload import cleanup_abandoned_uploads
from app.services.ws import set_event_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

TRASH_RETENTION_DAYS = 30
_PURGE_INTERVAL_SECONDS = 86400  # 24 hours
_PURGE_BATCH_SIZE = 100


async def purge_expired_trash() -> None:
    """Periodically purge soft-deleted files older than TRASH_RETENTION_DAYS."""
    while True:
        cutoff = datetime.now(UTC) - timedelta(days=TRASH_RETENTION_DAYS)
        total_purged = 0
        while True:
            db = SessionLocal()
            try:
                batch = (
                    db.query(File)
                    .filter(File.deleted_at.isnot(None), File.deleted_at < cutoff)
                    .limit(_PURGE_BATCH_SIZE)
                    .all()
                )
                if not batch:
                    break
                purged = 0
                for file in batch:
                    try:
                        physical_delete(db, file)
                        purged += 1
                    except Exception:
                        logger.exception("Failed to purge file %s", file.id)
                if purged:
                    db.commit()
                    total_purged += purged
            except Exception:
                db.rollback()
                logger.exception("Error during trash purge")
                break
            finally:
                db.close()
        if total_purged:
            logger.info("Purged %d expired trash files", total_purged)
        await asyncio.sleep(_PURGE_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Database initialized")
    load_passwords()
    init_jwt_secret()
    logger.info("Auth initialized")
    set_event_loop(asyncio.get_running_loop())
    cleanup_abandoned_uploads()
    asyncio.create_task(scan_all_drives())
    logger.info("Background scan started for all drives")
    asyncio.create_task(purge_expired_trash())
    logger.info("Trash auto-purge task started")
    yield


app = FastAPI(title="Video Share API", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(files.router)
app.include_router(drives.router)
app.include_router(uploads.router)
app.include_router(playlists.router)
app.include_router(progress.router)
app.include_router(ws.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
