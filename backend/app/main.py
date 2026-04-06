import asyncio
import importlib
import logging
import pkgutil
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Callable, Coroutine

from fastapi import FastAPI

from app.database import SessionLocal, init_db
from app.auth import init_jwt_secret, load_passwords
import app.config as config
from app.models import File
from app.routers import admin, auth, comments, drives, files, playlists, progress, search, uploads, ws
from app.services.fileops import physical_delete
from app.services.scanner import scan_all_drives
from app.services.search_notify import notify_search_service
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
        all_purged_ids: list[str] = []
        folders_to_check: set[tuple[str, str]] = set()
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
                        file_id = file.id
                        if file.folder_path:
                            folders_to_check.add((file.drive, file.folder_path))
                        physical_delete(db, file)
                        purged += 1
                        all_purged_ids.append(file_id)
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
            asyncio.create_task(
                notify_search_service("files-purged", {"file_ids": all_purged_ids})
            )
        _cleanup_empty_folders_after_purge(folders_to_check)
        await asyncio.sleep(_PURGE_INTERVAL_SECONDS)


def _cleanup_empty_folders_after_purge(
    folders: set[tuple[str, str]],
) -> None:
    """Remove empty directories left after purging files, walking up to drive root."""
    for drive_name, folder_path in folders:
        try:
            drive_root = config.get_drive_path(drive_name)
            target = drive_root / folder_path
            _rmdir_up_to_root(target, drive_root)
        except Exception:
            logger.exception(
                "Failed to clean up folder %s in drive %s", folder_path, drive_name
            )


def _rmdir_up_to_root(directory: Path, root: Path) -> None:
    """Remove directory and empty parents up to (but not including) root."""
    resolved_root = root.resolve()
    current = directory.resolve()
    while current != resolved_root and current.is_relative_to(resolved_root):
        if not current.is_dir():
            break
        try:
            current.rmdir()  # fails if not empty
        except OSError:
            break
        current = current.parent


_loaded_addons: dict[str, dict] = {}
_addon_startup_fns: list[Callable[[], Coroutine]] = []


def _load_addons(app: FastAPI) -> None:
    """Discover and load addon routers from backend/addons/.

    Each addon package must have a ``router`` module with:
    - ``router``: FastAPI APIRouter instance
    - ``ADDON_META`` (optional): dict with sidebar metadata, e.g.
      ``{"label": "Download", "icon": "download", "href": "/download"}``
    - ``on_startup`` (optional): async function called during lifespan
    """
    addons_path = Path(__file__).parent.parent / "addons"
    if not addons_path.is_dir():
        logger.info("No addons directory found (skipping)")
        return
    init_path = addons_path / "__init__.py"
    if not init_path.exists():
        logger.info("Addons directory has no __init__.py (skipping)")
        return
    for _finder, name, ispkg in pkgutil.iter_modules([str(addons_path)]):
        if not ispkg:
            continue
        try:
            mod = importlib.import_module(f"addons.{name}.router")
            if hasattr(mod, "router"):
                app.include_router(mod.router)
                meta = getattr(mod, "ADDON_META", {})
                _loaded_addons[name] = meta
                logger.info("Addon loaded: %s", name)
            if hasattr(mod, "on_startup"):
                _addon_startup_fns.append(mod.on_startup)
        except Exception:
            logger.exception("Failed to load addon: %s", name)


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
    for startup_fn in _addon_startup_fns:
        await startup_fn()
    yield


app = FastAPI(title="Video Share API", lifespan=lifespan)

app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(comments.router)
app.include_router(files.router)
app.include_router(drives.router)
app.include_router(search.router)
app.include_router(uploads.router)
app.include_router(playlists.router)
app.include_router(progress.router)
app.include_router(ws.router)

_load_addons(app)


@app.get("/api/addons/status")
async def addons_status():
    return {"addons": _loaded_addons}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
