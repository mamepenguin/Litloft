import logging
from pathlib import Path

from PIL import Image

logger = logging.getLogger(__name__)


def read_image_dimensions(image_path: Path) -> tuple[int, int] | None:
    """Return the image's pixel ``(width, height)``, or None if unreadable.

    ``Image.open`` parses the header and stops, so this is cheap enough to
    run over every image on a drive during a scan.
    """
    # heic registers the pillow-heif opener at import; without it Pillow
    # cannot identify HEIC/HEIF at all.
    from app.services import heic  # noqa: F401

    try:
        with Image.open(image_path) as img:
            width, height = img.size
    except Exception:
        logger.debug("Could not read image dimensions: %s", image_path, exc_info=True)
        return None

    if width <= 0 or height <= 0:
        return None
    return width, height
