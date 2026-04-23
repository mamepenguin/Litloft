import asyncio
import logging
import time
import unicodedata
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

import app.config as config
from app.database import SessionLocal
from app.models import EmptyFolder, File, active_file_filter
from app.services.filetype import classify, is_hidden
from app.services.hash import compute_file_hash
from app.services.subtitle import is_subtitle_file
from app.services.thumbnail import generate_image_thumbnail, generate_thumbnail, get_video_duration
from app.services import event_hooks
from app.services.ws import broadcast_from_thread

logger = logging.getLogger(__name__)

_scan_lock = asyncio.Lock()
_last_scanned_at: dict[str, datetime] = {}
_scanning_drives: set[str] = set()


def get_scan_status(drive_name: str) -> dict:
    """Return current scan status for a drive."""
    return {
        "is_scanning": drive_name in _scanning_drives,
        "last_scanned_at": _last_scanned_at.get(drive_name),
    }

PROGRESS_BATCH_SIZE = 50
PROGRESS_INTERVAL = 1.0  # seconds


def _filename_to_title(filename: str) -> str:
    name = Path(filename).stem
    name = name.replace("_", " ").replace("-", " ")
    return name.title()


def _get_folder_path(file_path: Path, base_dir: Path) -> str:
    relative = file_path.relative_to(base_dir)
    parent = str(relative.parent)
    if parent == ".":
        return ""
    return parent


def _cleanup_empty_parents(directory: Path, stop_at: Path) -> None:
    current = directory
    while current != stop_at and current.is_dir():
        try:
            current.rmdir()
            current = current.parent
        except OSError:
            break


def register_single_file(db: Session, drive_name: str, file_path: Path) -> str:
    """Register a single file to the database. Returns file_id.

    The caller is responsible for committing the transaction.

    Raises FileNotFoundError if file doesn't exist.
    Raises ValueError if file is hidden or a subtitle file.
    """
    if not file_path.exists():
        raise FileNotFoundError(f"File does not exist: {file_path}")

    drive_path = config.get_drive_path(drive_name)

    if is_hidden(file_path, drive_path):
        raise ValueError(f"Hidden file cannot be registered: {file_path.name}")
    if is_subtitle_file(file_path.name):
        raise ValueError(f"Subtitle file cannot be registered: {file_path.name}")

    relative_path = unicodedata.normalize("NFC", str(file_path.relative_to(drive_path)))
    folder_path = unicodedata.normalize("NFC", _get_folder_path(file_path, drive_path))
    file_type, mime_type = classify(file_path.name)

    nfc_name = unicodedata.normalize("NFC", file_path.name)
    nfc_stem = Path(nfc_name).stem

    duration = None
    if file_type in ("video", "audio"):
        duration = get_video_duration(str(file_path))

    thumbnail_rel = None
    if file_type in ("video", "image"):
        thumbnail_rel = (
            f"{drive_name}/{folder_path}/{nfc_stem}.jpg"
            if folder_path
            else f"{drive_name}/{nfc_stem}.jpg"
        )
        thumbnail_full = config.THUMBNAILS_DIR / thumbnail_rel
        gen_fn = generate_thumbnail if file_type == "video" else generate_image_thumbnail
        if not gen_fn(str(file_path), str(thumbnail_full)):
            thumbnail_rel = None

    file_hash = compute_file_hash(file_path)

    file_record = File(
        filename=nfc_name,
        title=_filename_to_title(nfc_name),
        drive=drive_name,
        folder_path=folder_path,
        file_path=relative_path,
        file_size=file_path.stat().st_size,
        file_type=file_type,
        mime_type=mime_type,
        thumbnail_path=thumbnail_rel,
        duration=duration,
        file_hash=file_hash,
    )
    db.add(file_record)
    db.flush()

    logger.info(
        "Registered file: %s (drive: %s, type: %s)",
        relative_path, drive_name, file_type,
    )
    return file_record.id


def _scan_and_register(db: Session, drive_name: str) -> dict[str, int]:
    drive_path = config.get_drive_path(drive_name)
    if not drive_path.exists():
        logger.warning("Drive directory does not exist: %s (%s)", drive_name, drive_path)
        return {"added": 0, "missing": 0, "recovered": 0, "total": 0}

    existing: dict[str, File] = {
        f.file_path: f
        for f in db.query(File).filter(File.drive == drive_name).all()
    }
    found_paths: set[str] = set()
    added = 0
    updated = 0
    recovered_ids: list[str] = []
    processed = 0
    last_progress_time = time.monotonic()

    for item in drive_path.rglob("*"):
        if not item.is_file():
            continue
        if is_hidden(item, drive_path):
            continue
        if is_subtitle_file(item.name):
            continue

        relative_path = unicodedata.normalize("NFC", str(item.relative_to(drive_path)))
        found_paths.add(relative_path)
        folder_path = unicodedata.normalize("NFC", _get_folder_path(item, drive_path))
        file_type, mime_type = classify(item.name)

        nfc_name = unicodedata.normalize("NFC", item.name)
        nfc_stem = Path(nfc_name).stem

        if relative_path in existing:
            file_record = existing[relative_path]
            needs_update = False

            # Recovery: file was missing but reappeared on disk
            if file_record.missing_since is not None:
                file_record.missing_since = None
                recovered_ids.append(file_record.id)
                logger.info("Recovered missing file: %s (drive: %s)", relative_path, drive_name)
                needs_update = True

            if file_record.filename != nfc_name:
                file_record.filename = nfc_name
                file_record.title = _filename_to_title(nfc_name)
                needs_update = True
            if file_record.folder_path != folder_path:
                file_record.folder_path = folder_path
                needs_update = True
            if file_record.file_type != file_type or file_record.mime_type != mime_type:
                file_record.file_type = file_type
                file_record.mime_type = mime_type
                needs_update = True

            if file_record.file_hash is None:
                file_hash = compute_file_hash(item)
                if file_hash is not None:
                    file_record.file_hash = file_hash
                    needs_update = True

            # Thumbnail management for video and image
            if file_type in ("video", "image"):
                expected_thumb = f"{drive_name}/{folder_path}/{nfc_stem}.jpg" if folder_path else f"{drive_name}/{nfc_stem}.jpg"
                gen_fn = generate_thumbnail if file_type == "video" else generate_image_thumbnail
                if file_record.thumbnail_path != expected_thumb:
                    old_thumb = config.THUMBNAILS_DIR / file_record.thumbnail_path if file_record.thumbnail_path else None
                    new_thumb = config.THUMBNAILS_DIR / expected_thumb
                    if old_thumb and old_thumb.exists():
                        new_thumb.parent.mkdir(parents=True, exist_ok=True)
                        old_thumb.rename(new_thumb)
                        _cleanup_empty_parents(old_thumb.parent, config.THUMBNAILS_DIR)
                    else:
                        gen_fn(str(item), str(new_thumb))
                    file_record.thumbnail_path = expected_thumb
                    needs_update = True
                elif not (config.THUMBNAILS_DIR / expected_thumb).exists():
                    gen_fn(str(item), str(config.THUMBNAILS_DIR / expected_thumb))
                    file_record.thumbnail_path = expected_thumb
                    needs_update = True

            if needs_update:
                updated += 1
                logger.info("Updated file: %s (folder: %s)", relative_path, folder_path)

            processed += 1
            now = time.monotonic()
            if processed % PROGRESS_BATCH_SIZE == 0 or now - last_progress_time >= PROGRESS_INTERVAL:
                broadcast_from_thread("scan:progress", {
                    "drive": drive_name,
                    "added": added,
                    "total": processed,
                }, drive=drive_name)
                last_progress_time = now
            continue

        # New file
        duration = None
        if file_type in ("video", "audio"):
            duration = get_video_duration(str(item))

        thumbnail_rel = None
        if file_type in ("video", "image"):
            thumbnail_rel = f"{drive_name}/{folder_path}/{nfc_stem}.jpg" if folder_path else f"{drive_name}/{nfc_stem}.jpg"
            thumbnail_full = config.THUMBNAILS_DIR / thumbnail_rel
            gen_fn = generate_thumbnail if file_type == "video" else generate_image_thumbnail
            if not gen_fn(str(item), str(thumbnail_full)):
                thumbnail_rel = None

        file_hash = compute_file_hash(item)

        file_record = File(
            filename=nfc_name,
            title=_filename_to_title(nfc_name),
            drive=drive_name,
            folder_path=folder_path,
            file_path=relative_path,
            file_size=item.stat().st_size,
            file_type=file_type,
            mime_type=mime_type,
            thumbnail_path=thumbnail_rel,
            duration=duration,
            file_hash=file_hash,
        )
        db.add(file_record)
        added += 1
        logger.info("Added file: %s (drive: %s, type: %s)", relative_path, drive_name, file_type)

        processed += 1
        now = time.monotonic()
        if processed % PROGRESS_BATCH_SIZE == 0 or now - last_progress_time >= PROGRESS_INTERVAL:
            broadcast_from_thread("scan:progress", {
                "drive": drive_name,
                "added": added,
                "removed": 0,
                "total": processed,
            }, drive=drive_name)
            last_progress_time = now

    # Files that disappeared from the filesystem: mark as missing instead
    # of physically deleting. Thumbnails stay on disk so they can be reused
    # if the file comes back. Trashed files are skipped (they already have
    # no on-disk presence expected).
    missing_count = 0
    unseen_paths = set(existing.keys()) - found_paths
    if unseen_paths:
        newly_missing_ids = [
            existing[rp].id
            for rp in unseen_paths
            if existing[rp].deleted_at is None
            and existing[rp].missing_since is None
        ]
        if newly_missing_ids:
            now = datetime.now(UTC)
            db.query(File).filter(File.id.in_(newly_missing_ids)).update(
                {"missing_since": now}, synchronize_session="fetch"
            )
            missing_count = len(newly_missing_ids)
            logger.info(
                "Marked %d files as missing (drive: %s)",
                missing_count,
                drive_name,
            )
            event_hooks.emit_sync("files.missing", {"file_ids": newly_missing_ids})

    if recovered_ids:
        event_hooks.emit_sync("files.recovered", {"file_ids": recovered_ids})

    # Sync empty folders: detect filesystem dirs with no files and track them
    folders_with_files = {
        f.folder_path
        for f in db.query(File.folder_path).filter(
            File.drive == drive_name, active_file_filter()
        ).distinct().all()
    }
    # Find all directories on the filesystem
    fs_dirs: set[str] = set()
    for item in drive_path.rglob("*"):
        if item.is_dir() and not is_hidden(item, drive_path):
            rel = unicodedata.normalize("NFC", str(item.relative_to(drive_path)))
            fs_dirs.add(rel)
    # Empty dirs = exist on filesystem but have no files in DB
    empty_dirs = fs_dirs - folders_with_files
    # Also exclude dirs that have sub-folders with files (they appear in list_folders via prefix match)
    truly_empty: set[str] = set()
    for d in empty_dirs:
        has_child_with_files = any(
            fp.startswith(d + "/") for fp in folders_with_files
        )
        if not has_child_with_files:
            truly_empty.add(d)
    # Get existing EmptyFolder records
    existing_efs = {
        ef.path
        for ef in db.query(EmptyFolder).filter(EmptyFolder.drive == drive_name).all()
    }
    # Add missing EmptyFolder records
    for d in truly_empty:
        if d not in existing_efs:
            db.add(EmptyFolder(drive=drive_name, path=d))
    # Remove EmptyFolder records for dirs that no longer exist on filesystem
    # or now have files
    stale_efs = existing_efs - truly_empty
    if stale_efs:
        db.query(EmptyFolder).filter(
            EmptyFolder.drive == drive_name,
            EmptyFolder.path.in_(stale_efs),
        ).delete(synchronize_session="fetch")

    db.commit()
    total = db.query(File).filter(File.drive == drive_name, active_file_filter()).count()
    if updated:
        logger.info("Updated %d file records (drive: %s)", updated, drive_name)

    recovered_count = len(recovered_ids)
    broadcast_from_thread("scan:complete", {
        "drive": drive_name,
        "added": added,
        "missing": missing_count,
        "recovered": recovered_count,
        "updated": updated,
        "total": total,
    }, drive=drive_name)

    event_hooks.emit_sync("scan.complete", {
        "drive": drive_name,
        "added": added,
        "missing": missing_count,
        "recovered": recovered_count,
    })

    return {
        "added": added,
        "missing": missing_count,
        "recovered": recovered_count,
        "updated": updated,
        "total": total,
    }


async def scan_drive(drive_name: str) -> dict[str, int]:
    if _scan_lock.locked():
        raise RuntimeError("Scan already in progress")

    async with _scan_lock:
        _scanning_drives.add(drive_name)
        logger.info("Starting file scan for drive '%s'", drive_name)
        loop = asyncio.get_running_loop()
        db = SessionLocal()
        try:
            result = await loop.run_in_executor(None, _scan_and_register, db, drive_name)
            _last_scanned_at[drive_name] = datetime.now(UTC)
            logger.info(
                "Scan complete for drive '%s': added=%d, missing=%d, recovered=%d, total=%d",
                drive_name,
                result["added"],
                result.get("missing", 0),
                result.get("recovered", 0),
                result["total"],
            )
            return result
        except Exception:
            db.rollback()
            raise
        finally:
            _scanning_drives.discard(drive_name)
            db.close()


async def scan_all_drives() -> dict[str, dict[str, int]]:
    results = {}
    for drive_name in config.get_drive_names():
        results[drive_name] = await scan_drive(drive_name)
    return results
