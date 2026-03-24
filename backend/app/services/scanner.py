import asyncio
import logging
from pathlib import Path

from sqlalchemy.orm import Session

import app.config as config
from app.database import SessionLocal
from app.models import Video
from app.services.thumbnail import generate_thumbnail, get_video_duration

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
    """Remove empty parent directories up to (but not including) stop_at."""
    current = directory
    while current != stop_at and current.is_dir():
        try:
            current.rmdir()  # only succeeds if empty
            current = current.parent
        except OSError:
            break


def _scan_and_register(db: Session, drive_name: str) -> dict[str, int]:
    drive_path = config.get_drive_path(drive_name)
    if not drive_path.exists():
        logger.warning("Drive directory does not exist: %s (%s)", drive_name, drive_path)
        return {"added": 0, "removed": 0, "total": 0}

    existing: dict[str, Video] = {
        v.file_path: v
        for v in db.query(Video).filter(Video.drive == drive_name).all()
    }
    found_paths: set[str] = set()
    added = 0
    updated = 0

    for mp4_file in drive_path.rglob("*.mp4"):
        relative_path = str(mp4_file.relative_to(drive_path))
        found_paths.add(relative_path)
        folder_path = _get_folder_path(mp4_file, drive_path)

        if relative_path in existing:
            video = existing[relative_path]
            expected_thumb = f"{drive_name}/{folder_path}/{mp4_file.stem}.jpg" if folder_path else f"{drive_name}/{mp4_file.stem}.jpg"
            needs_update = False
            if video.folder_path != folder_path:
                video.folder_path = folder_path
                needs_update = True
            if video.thumbnail_path != expected_thumb:
                # Thumbnail path changed (folder moved) — move or regenerate
                old_thumb = config.THUMBNAILS_DIR / video.thumbnail_path if video.thumbnail_path else None
                new_thumb = config.THUMBNAILS_DIR / expected_thumb
                if old_thumb and old_thumb.exists():
                    new_thumb.parent.mkdir(parents=True, exist_ok=True)
                    old_thumb.rename(new_thumb)
                    _cleanup_empty_parents(old_thumb.parent, config.THUMBNAILS_DIR)
                else:
                    generate_thumbnail(str(mp4_file), str(new_thumb))
                video.thumbnail_path = expected_thumb
                needs_update = True
            elif not (config.THUMBNAILS_DIR / expected_thumb).exists():
                # Thumbnail file missing — regenerate
                generate_thumbnail(str(mp4_file), str(config.THUMBNAILS_DIR / expected_thumb))
                video.thumbnail_path = expected_thumb
                needs_update = True
            if needs_update:
                updated += 1
                logger.info("Updated video: %s (folder: %s)", relative_path, folder_path)
            continue

        duration = get_video_duration(str(mp4_file))

        thumbnail_rel = f"{drive_name}/{folder_path}/{mp4_file.stem}.jpg" if folder_path else f"{drive_name}/{mp4_file.stem}.jpg"
        thumbnail_full = config.THUMBNAILS_DIR / thumbnail_rel
        thumbnail_ok = generate_thumbnail(str(mp4_file), str(thumbnail_full))

        video = Video(
            filename=mp4_file.name,
            title=_filename_to_title(mp4_file.name),
            drive=drive_name,
            folder_path=folder_path,
            file_path=relative_path,
            thumbnail_path=thumbnail_rel if thumbnail_ok else None,
            file_size=mp4_file.stat().st_size,
            duration=duration,
        )
        db.add(video)
        added += 1
        logger.info("Added video: %s (drive: %s, folder: %s)", relative_path, drive_name, folder_path)

    removed_paths = set(existing.keys()) - found_paths
    removed = 0
    if removed_paths:
        for rp in removed_paths:
            video = existing[rp]
            if video.thumbnail_path:
                thumb = config.THUMBNAILS_DIR / video.thumbnail_path
                if thumb.exists():
                    thumb.unlink()
                    _cleanup_empty_parents(thumb.parent, config.THUMBNAILS_DIR)
        removed = (
            db.query(Video)
            .filter(Video.drive == drive_name, Video.file_path.in_(removed_paths))
            .delete(synchronize_session="fetch")
        )
        logger.info("Removed %d videos and their thumbnails (drive: %s)", removed, drive_name)

    db.commit()
    total = db.query(Video).filter(Video.drive == drive_name).count()
    if updated:
        logger.info("Updated %d video folder paths (drive: %s)", updated, drive_name)
    return {"added": added, "removed": removed, "updated": updated, "total": total}


async def scan_drive(drive_name: str) -> dict[str, int]:
    if _scan_lock.locked():
        raise RuntimeError("Scan already in progress")

    async with _scan_lock:
        logger.info("Starting video scan for drive '%s'", drive_name)
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
