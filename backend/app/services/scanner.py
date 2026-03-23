import asyncio
import logging
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import THUMBNAILS_DIR, VIDEOS_DIR
from app.database import SessionLocal
from app.models import Video
from app.services.thumbnail import generate_thumbnail, get_video_duration

logger = logging.getLogger(__name__)

_scan_lock = asyncio.Lock()

UNCATEGORIZED = "未分類"


def _filename_to_title(filename: str) -> str:
    name = Path(filename).stem
    name = name.replace("_", " ").replace("-", " ")
    return name.title()


def _get_category(file_path: Path, base_dir: Path) -> str:
    relative = file_path.relative_to(base_dir)
    parts = relative.parts
    if len(parts) <= 1:
        return UNCATEGORIZED
    return parts[0]


def _scan_and_register(db: Session) -> dict[str, int]:
    if not VIDEOS_DIR.exists():
        logger.warning("Videos directory does not exist: %s", VIDEOS_DIR)
        return {"added": 0, "removed": 0, "total": 0}

    existing_paths: set[str] = {
        row[0] for row in db.query(Video.file_path).all()
    }
    found_paths: set[str] = set()
    added = 0

    for mp4_file in VIDEOS_DIR.rglob("*.mp4"):
        relative_path = str(mp4_file.relative_to(VIDEOS_DIR))
        found_paths.add(relative_path)

        if relative_path in existing_paths:
            continue

        category = _get_category(mp4_file, VIDEOS_DIR)
        duration = get_video_duration(str(mp4_file))

        thumbnail_rel = f"{category}/{mp4_file.stem}.jpg"
        thumbnail_full = THUMBNAILS_DIR / thumbnail_rel
        thumbnail_ok = generate_thumbnail(str(mp4_file), str(thumbnail_full))

        video = Video(
            filename=mp4_file.name,
            title=_filename_to_title(mp4_file.name),
            category=category,
            file_path=relative_path,
            thumbnail_path=thumbnail_rel if thumbnail_ok else None,
            file_size=mp4_file.stat().st_size,
            duration=duration,
        )
        db.add(video)
        added += 1
        logger.info("Added video: %s (category: %s)", relative_path, category)

    removed_paths = existing_paths - found_paths
    removed = 0
    if removed_paths:
        removed = (
            db.query(Video)
            .filter(Video.file_path.in_(removed_paths))
            .delete(synchronize_session="fetch")
        )
        logger.info("Removed %d videos no longer on disk", removed)

    db.commit()
    total = db.query(Video).count()
    return {"added": added, "removed": removed, "total": total}


async def scan_videos_directory() -> dict[str, int]:
    if _scan_lock.locked():
        raise RuntimeError("Scan already in progress")

    async with _scan_lock:
        logger.info("Starting video scan in %s", VIDEOS_DIR)
        loop = asyncio.get_event_loop()
        db = SessionLocal()
        try:
            result = await loop.run_in_executor(None, _scan_and_register, db)
            logger.info(
                "Scan complete: added=%d, removed=%d, total=%d",
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
