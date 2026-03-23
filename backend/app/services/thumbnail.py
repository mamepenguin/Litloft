import logging

logger = logging.getLogger(__name__)


def generate_thumbnail(video_path: str, output_path: str) -> bool:
    # Phase 2 で実装
    logger.info("Thumbnail generation stub: %s -> %s", video_path, output_path)
    return False


def get_video_duration(video_path: str) -> float | None:
    # Phase 2 で実装
    logger.info("Duration extraction stub: %s", video_path)
    return None
