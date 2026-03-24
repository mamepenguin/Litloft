import asyncio
import logging
import unicodedata
from pathlib import Path

from sqlalchemy.orm import Session

import app.config as config
from app.database import SessionLocal
from app.models import File
from app.services.filetype import classify, is_hidden
from app.services.thumbnail import generate_image_thumbnail, generate_thumbnail, get_video_duration

logger = logging.getLogger(__name__)

_scan_lock = asyncio.Lock()


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


def _scan_and_register(db: Session, drive_name: str) -> dict[str, int]:
    drive_path = config.get_drive_path(drive_name)
    if not drive_path.exists():
        logger.warning("Drive directory does not exist: %s (%s)", drive_name, drive_path)
        return {"added": 0, "removed": 0, "total": 0}

    existing: dict[str, File] = {
        f.file_path: f
        for f in db.query(File).filter(File.drive == drive_name).all()
    }
    found_paths: set[str] = set()
    added = 0
    updated = 0

    for item in drive_path.rglob("*"):
        if not item.is_file():
            continue
        if is_hidden(item, drive_path):
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

            if file_record.filename != nfc_name:
                file_record.filename = nfc_name
                file_record.title = _filename_to_title(nfc_name)
                needs_update = True
            if file_record.folder_path != folder_path:
                file_record.folder_path = folder_path
                needs_update = True
            if file_record.file_type != file_type:
                file_record.file_type = file_type
                file_record.mime_type = mime_type
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
        )
        db.add(file_record)
        added += 1
        logger.info("Added file: %s (drive: %s, type: %s)", relative_path, drive_name, file_type)

    removed_paths = set(existing.keys()) - found_paths
    removed = 0
    if removed_paths:
        for rp in removed_paths:
            file_record = existing[rp]
            if file_record.thumbnail_path:
                thumb = config.THUMBNAILS_DIR / file_record.thumbnail_path
                if thumb.exists():
                    thumb.unlink()
                    _cleanup_empty_parents(thumb.parent, config.THUMBNAILS_DIR)
        removed = (
            db.query(File)
            .filter(File.drive == drive_name, File.file_path.in_(removed_paths))
            .delete(synchronize_session="fetch")
        )
        logger.info("Removed %d files and their thumbnails (drive: %s)", removed, drive_name)

    db.commit()
    total = db.query(File).filter(File.drive == drive_name).count()
    if updated:
        logger.info("Updated %d file records (drive: %s)", updated, drive_name)
    return {"added": added, "removed": removed, "updated": updated, "total": total}


async def scan_drive(drive_name: str) -> dict[str, int]:
    if _scan_lock.locked():
        raise RuntimeError("Scan already in progress")

    async with _scan_lock:
        logger.info("Starting file scan for drive '%s'", drive_name)
        loop = asyncio.get_running_loop()
        db = SessionLocal()
        try:
            result = await loop.run_in_executor(None, _scan_and_register, db, drive_name)
            logger.info(
                "Scan complete for drive '%s': added=%d, removed=%d, total=%d",
                drive_name,
                result["added"],
                result["removed"],
                result["total"],
            )
            return result
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()


async def scan_all_drives() -> dict[str, dict[str, int]]:
    results = {}
    for drive_name in config.get_drive_names():
        results[drive_name] = await scan_drive(drive_name)
    return results
