import asyncio
import importlib
import logging
import os
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
from app.routers import admin, auth, collections, comments, drives, files, progress, uploads, ws
from app.routers import addon_proxy, admin_config, drive_policies, internal, smart_folders
from app.services.fileops import physical_delete
from app.services.scanner import scan_all_drives
from app.services import addon_registry, drive_seed, event_hooks
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
                event_hooks.emit("files.purged", {"file_ids": all_purged_ids})
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
                if addon_registry.register_in_process(name, meta):
                    _loaded_addons[name] = meta
                    logger.info("Addon loaded: %s", name)
                else:
                    logger.warning("Addon %s router loaded but metadata invalid; excluded from registry", name)
            if hasattr(mod, "on_startup"):
                _addon_startup_fns.append(mod.on_startup)
        except Exception:
            logger.exception("Failed to load addon: %s", name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Drive bootstrap: pre-seed count -> setup-sentinel migration -> seed.
    #
    # The mere *existence* of drives.json no longer distinguishes a fresh
    # install from an upgrade: the shrunk configure.py writes an empty
    # ``[]`` for brand-new users too (a footgun guard for the single-file
    # bind-mount — an absent host file would otherwise make Docker mount a
    # directory at /app/drives.json). The discriminator is the **pre-seed
    # non-empty** state: only a non-empty drives.json means a pre-existing
    # user who configured logical settings via the old configure.py and
    # must keep skipping /setup. An empty ``[]`` is a new user — the
    # sentinel must NOT be touched so /setup runs, and the seed then
    # populates drives.json from the Docker mount directories.
    #
    # Ordering is load-bearing (spec 2026-05-19 §3.1, H5 grounding fix):
    # the pre-seed count is read once, the migration inspects that
    # pre-seed count and runs *before* the seed, and everything here
    # happens before scan_all_drives() so the freshly seeded drives are
    # picked up and the persistent _drives_cache is invalidated in time.
    drive_seed.run_startup_drive_bootstrap()

    # The restart-pending flag is set by admin_config writes. Once we've
    # restarted the backend, the new config is in effect, so the banner
    # must disappear — we clear the flag here.
    try:
        flag = config.DATA_DIR / "restart_pending"
        if flag.exists():
            flag.unlink()
            logger.info("Cleared restart_pending flag on startup")
    except OSError:
        logger.exception("Failed to clear restart_pending flag")

    init_db()
    logger.info("Database initialized")
    load_passwords()
    init_jwt_secret()
    logger.info("Auth initialized")
    if not os.environ.get("CORE_INTERNAL_SECRET"):
        # Surface the unset secret at startup so the ops-time implication
        # is visible without grep. Docker network isolation is still the
        # primary defence, but any container on the network can hit write
        # endpoints like POST /api/internal/files/{id}/tags unauthenticated
        # (spec 2026-04-24-knowledge-tag-unification.md).
        logger.warning(
            "CORE_INTERNAL_SECRET is unset — internal write endpoints "
            "(e.g. POST /api/internal/files/{id}/tags) are reachable from "
            "any Docker-network peer without authentication. Set the env "
            "var in production to add a second line of defence."
        )
    event_hooks.init()
    addon_registry.load_external_manifests()
    set_event_loop(asyncio.get_running_loop())
    cleanup_abandoned_uploads()
    asyncio.create_task(scan_all_drives())
    logger.info("Background scan started for all drives")
    asyncio.create_task(purge_expired_trash())
    logger.info("Trash auto-purge task started")
    for startup_fn in _addon_startup_fns:
        try:
            await startup_fn()
        except Exception:
            logger.exception("Addon startup failed: %s", getattr(startup_fn, "__module__", startup_fn))
    yield


app = FastAPI(title="Video Share API", lifespan=lifespan)

app.include_router(admin.router)
app.include_router(admin_config.router)
app.include_router(auth.router)
app.include_router(comments.router)
app.include_router(files.router)
app.include_router(drives.router)
app.include_router(drive_policies.router)
app.include_router(uploads.router)
app.include_router(collections.router)
app.include_router(smart_folders.router)
app.include_router(progress.router)
app.include_router(ws.router)
app.include_router(internal.router)
_load_addons(app)
app.include_router(addon_proxy.router)


@app.get("/api/addons/status")
async def addons_status(drive: str | None = None):
    """Return the addon catalogue, optionally filtered by a drive.

    When ``drive`` is omitted (admin / global UI) every loaded addon
    is returned with all its slots — same as before.

    When ``drive`` is provided, addons whose per-drive policy in
    drives.json sets the umbrella ``index`` feature to false are
    dropped entirely along with every slot they own. This is the
    UI-side hook for the "intelligence: false" config: the sidebar
    link disappears, the slot stays empty, no API calls fire.

    A ``drive`` that is not in drives.json yields an empty addon /
    slot map rather than 404 so the frontend can render the admin
    surface without special-casing missing drives.
    """
    # Strip internal-only fields (proxy config) before returning to clients
    _FRONTEND_FIELDS = {"label", "description", "icon", "href", "type", "slots", "scope", "policy_features"}
    addons = {
        name: {k: v for k, v in meta.items() if k in _FRONTEND_FIELDS}
        for name, meta in addon_registry.get_all().items()
    }
    slots = addon_registry.get_all_slots()

    if drive is None:
        return {"addons": addons, "slots": slots}

    try:
        config.get_drive_path(drive)  # validate drive exists
    except ValueError:
        return {"addons": {}, "slots": {}}

    enabled_names = {
        name for name in addons
        if config.is_addon_feature_enabled(drive, name, "index")
    }
    filtered_addons = {n: m for n, m in addons.items() if n in enabled_names}
    filtered_slots = {
        slot_id: [
            entry for entry in entries
            if entry.get("addonName") in enabled_names
        ]
        for slot_id, entries in slots.items()
    }
    # Drop slots whose entries were all stripped so the frontend
    # doesn't allocate an empty slot UI.
    filtered_slots = {k: v for k, v in filtered_slots.items() if v}
    return {"addons": filtered_addons, "slots": filtered_slots}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
