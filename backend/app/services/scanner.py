import asyncio
import logging

from app.config import VIDEOS_DIR
from app.database import SessionLocal

logger = logging.getLogger(__name__)

_scan_lock = asyncio.Lock()


async def scan_videos_directory() -> dict[str, int]:
    if _scan_lock.locked():
        raise RuntimeError("Scan already in progress")

    async with _scan_lock:
        logger.info("Starting video scan in %s", VIDEOS_DIR)
        # Phase 2 で実装
        return {"added": 0, "removed": 0, "total": 0}
