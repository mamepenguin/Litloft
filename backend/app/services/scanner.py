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
from app.services.thumbnail import get_thumbnail_generator, get_video_duration
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


def _expected_thumbnail_path(drive_name: str, folder_path: str, nfc_stem: str) -> str:
    return (
        f"{drive_name}/{folder_path}/{nfc_stem}.jpg"
        if folder_path
        else f"{drive_name}/{nfc_stem}.jpg"
    )


def _relocate_thumbnail(
    file_record: File,
    new_thumb_rel: str,
    file_type: str,
    item_path: Path,
) -> None:
    """Move a thumbnail to a new path (when a record's path changes), or
    regenerate it from source if the old thumbnail is missing."""
    old_thumb_rel = file_record.thumbnail_path
    new_thumb_full = config.THUMBNAILS_DIR / new_thumb_rel

    if old_thumb_rel == new_thumb_rel and new_thumb_full.exists():
        return

    if old_thumb_rel:
        old_thumb_full = config.THUMBNAILS_DIR / old_thumb_rel
        if old_thumb_full.exists() and old_thumb_rel != new_thumb_rel:
            new_thumb_full.parent.mkdir(parents=True, exist_ok=True)
            old_thumb_full.rename(new_thumb_full)
            _cleanup_empty_parents(old_thumb_full.parent, config.THUMBNAILS_DIR)
            file_record.thumbnail_path = new_thumb_rel
            return

    gen_fn = get_thumbnail_generator(file_type, file_record.mime_type)
    if gen_fn and gen_fn(str(item_path), str(new_thumb_full)):
        file_record.thumbnail_path = new_thumb_rel
    else:
        file_record.thumbnail_path = None


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
    gen_fn = get_thumbnail_generator(file_type, mime_type)
    if gen_fn is not None:
        thumbnail_rel = _expected_thumbnail_path(drive_name, folder_path, nfc_stem)
        thumbnail_full = config.THUMBNAILS_DIR / thumbnail_rel
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
        return {"added": 0, "missing": 0, "recovered": 0, "moved": 0, "total": 0}

    existing: dict[str, File] = {
        f.file_path: f
        for f in db.query(File).filter(File.drive == drive_name).all()
    }
    found_paths: set[str] = set()
    pending_new: list[dict] = []
    added = 0
    updated = 0
    moved = 0
    recovered_ids: list[str] = []
    moved_ids: list[str] = []
    processed = 0
    last_progress_time = time.monotonic()

    # Pass 1: walk filesystem, update existing records in place, defer
    # new-path candidates until missing has been determined.
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

            if get_thumbnail_generator(file_type, mime_type) is not None:
                expected_thumb = _expected_thumbnail_path(drive_name, folder_path, nfc_stem)
                if file_record.thumbnail_path != expected_thumb or not (
                    config.THUMBNAILS_DIR / expected_thumb
                ).exists():
                    _relocate_thumbnail(file_record, expected_thumb, file_type, item)
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

        # New path candidate — defer to Pass 2 so we can match against
        # missing candidates by (file_hash, file_size).
        pending_new.append({
            "item": item,
            "relative_path": relative_path,
            "folder_path": folder_path,
            "file_type": file_type,
            "mime_type": mime_type,
            "nfc_name": nfc_name,
            "nfc_stem": nfc_stem,
        })
        processed += 1
        now = time.monotonic()
        if processed % PROGRESS_BATCH_SIZE == 0 or now - last_progress_time >= PROGRESS_INTERVAL:
            broadcast_from_thread("scan:progress", {
                "drive": drive_name,
                "added": added,
                "total": processed,
            }, drive=drive_name)
            last_progress_time = now

    # Determine missing candidates (paths that exist in DB but not on FS).
    unseen_paths = set(existing.keys()) - found_paths
    missing_candidates = [
        existing[rp]
        for rp in unseen_paths
        if existing[rp].deleted_at is None
        and existing[rp].missing_since is None
        and existing[rp].file_hash is not None
        and existing[rp].file_size is not None
    ]
    # Build (hash, size) → File index. Drop keys that map to multiple
    # candidates to keep matching unambiguous (single-candidate only).
    candidate_counts: dict[tuple, int] = {}
    for rec in missing_candidates:
        key = (rec.file_hash, rec.file_size)
        candidate_counts[key] = candidate_counts.get(key, 0) + 1
    unseen_index: dict[tuple, File] = {
        (rec.file_hash, rec.file_size): rec
        for rec in missing_candidates
        if candidate_counts[(rec.file_hash, rec.file_size)] == 1
    }

    # Pre-compute hashes for pending_new and count duplicate keys on the
    # new side too (so a copy + move pair stays unmatched).
    pending_key_counts: dict[tuple, int] = {}
    for entry in pending_new:
        item = entry["item"]
        try:
            size = item.stat().st_size
        except OSError:
            size = None
        h = compute_file_hash(item) if size is not None else None
        entry["file_size"] = size
        entry["file_hash"] = h
        if h is not None and size is not None:
            key = (h, size)
            entry["match_key"] = key
            pending_key_counts[key] = pending_key_counts.get(key, 0) + 1
        else:
            entry["match_key"] = None

    consumed_unseen: set[str] = set()

    # Pass 2: pending_new × unseen_index — single-candidate matches only.
    for entry in pending_new:
        item: Path = entry["item"]
        relative_path: str = entry["relative_path"]
        folder_path: str = entry["folder_path"]
        file_type: str = entry["file_type"]
        mime_type: str = entry["mime_type"]
        nfc_name: str = entry["nfc_name"]
        nfc_stem: str = entry["nfc_stem"]
        match_key = entry["match_key"]
        file_hash = entry["file_hash"]
        file_size = entry["file_size"]

        candidate: File | None = None
        if (
            match_key is not None
            and pending_key_counts.get(match_key, 0) == 1
        ):
            cand = unseen_index.get(match_key)
            if cand is not None and cand.id not in consumed_unseen:
                candidate = cand

        if candidate is not None:
            old_path = candidate.file_path
            candidate.file_path = relative_path
            candidate.folder_path = folder_path
            candidate.filename = nfc_name
            candidate.title = _filename_to_title(nfc_name)
            candidate.file_type = file_type
            candidate.mime_type = mime_type
            candidate.missing_since = None

            if get_thumbnail_generator(file_type, mime_type) is not None:
                new_thumb_rel = _expected_thumbnail_path(drive_name, folder_path, nfc_stem)
                _relocate_thumbnail(candidate, new_thumb_rel, file_type, item)
            else:
                candidate.thumbnail_path = None

            moved_ids.append(candidate.id)
            consumed_unseen.add(candidate.id)
            moved += 1
            logger.info(
                "Detected move: %s → %s (drive: %s, file_id: %s)",
                old_path, relative_path, drive_name, candidate.id,
            )
            continue

        # Genuine new file — INSERT.
        duration = None
        if file_type in ("video", "audio"):
            duration = get_video_duration(str(item))

        thumbnail_rel = None
        gen_fn = get_thumbnail_generator(file_type, mime_type)
        if gen_fn is not None:
            thumbnail_rel = _expected_thumbnail_path(drive_name, folder_path, nfc_stem)
            thumbnail_full = config.THUMBNAILS_DIR / thumbnail_rel
            if not gen_fn(str(item), str(thumbnail_full)):
                thumbnail_rel = None

        if file_size is None:
            try:
                file_size = item.stat().st_size
            except OSError:
                file_size = 0

        file_record = File(
            filename=nfc_name,
            title=_filename_to_title(nfc_name),
            drive=drive_name,
            folder_path=folder_path,
            file_path=relative_path,
            file_size=file_size,
            file_type=file_type,
            mime_type=mime_type,
            thumbnail_path=thumbnail_rel,
            duration=duration,
            file_hash=file_hash,
        )
        db.add(file_record)
        added += 1
        logger.info("Added file: %s (drive: %s, type: %s)", relative_path, drive_name, file_type)

    # Mark genuinely missing files (excluding those promoted to moved).
    missing_count = 0
    if unseen_paths:
        newly_missing_ids = [
            existing[rp].id
            for rp in unseen_paths
            if existing[rp].deleted_at is None
            and existing[rp].missing_since is None
            and existing[rp].id not in consumed_unseen
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

    if moved_ids:
        event_hooks.emit_sync("files.moved", {"file_ids": moved_ids})

    # Sync empty folders: detect filesystem dirs with no files and track them
    folders_with_files = {
        f.folder_path
        for f in db.query(File.folder_path).filter(
            File.drive == drive_name, active_file_filter()
        ).distinct().all()
    }
    fs_dirs: set[str] = set()
    for item in drive_path.rglob("*"):
        if item.is_dir() and not is_hidden(item, drive_path):
            rel = unicodedata.normalize("NFC", str(item.relative_to(drive_path)))
            fs_dirs.add(rel)
    empty_dirs = fs_dirs - folders_with_files
    truly_empty: set[str] = set()
    for d in empty_dirs:
        has_child_with_files = any(
            fp.startswith(d + "/") for fp in folders_with_files
        )
        if not has_child_with_files:
            truly_empty.add(d)
    existing_efs = {
        ef.path
        for ef in db.query(EmptyFolder).filter(EmptyFolder.drive == drive_name).all()
    }
    for d in truly_empty:
        if d not in existing_efs:
            db.add(EmptyFolder(drive=drive_name, path=d))
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
        "moved": moved,
        "updated": updated,
        "total": total,
    }, drive=drive_name)

    event_hooks.emit_sync("scan.complete", {
        "drive": drive_name,
        "added": added,
        "missing": missing_count,
        "recovered": recovered_count,
        "moved": moved,
    })

    return {
        "added": added,
        "missing": missing_count,
        "recovered": recovered_count,
        "moved": moved,
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
                "Scan complete for drive '%s': added=%d, missing=%d, recovered=%d, moved=%d, total=%d",
                drive_name,
                result["added"],
                result.get("missing", 0),
                result.get("recovered", 0),
                result.get("moved", 0),
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
    try:
        drive_names = config.get_drive_names()
    except (FileNotFoundError, ValueError):
        # drives.json may be missing (fresh install before first-run wizard
        # has been completed) or malformed. Either way, skip the background
        # scan rather than crashing the lifespan.
        return results
    for drive_name in drive_names:
        results[drive_name] = await scan_drive(drive_name)
    return results
