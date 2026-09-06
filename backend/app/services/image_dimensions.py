import logging
from pathlib import Path

from PIL import Image

logger = logging.getLogger(__name__)


def read_image_dimensions(image_path: Path) -> tuple[int, int] | None:
    """Return the image's displayed pixel ``(width, height)``, or None.

    "Displayed" rather than "stored": a phone that shoots in portrait
    writes landscape pixels plus an EXIF Orientation tag, and every
    consumer that matters here — the browser, and this app's own
    thumbnail generator — honours it. Reporting the stored size would
    transpose the ratio of every upright photo, so a listing laying rows
    out by ratio would size them against a picture nobody sees.

    ``Image.open`` parses the header and stops, and ``getexif`` reads
    only the EXIF block, so this stays cheap enough to run over every
    image on a drive during a scan.
    """
    # heic registers the pillow-heif opener at import; without it Pillow
    # cannot identify HEIC/HEIF at all.
    from app.services import heic  # noqa: F401

    try:
        with Image.open(image_path) as img:
            width, height = img.size
            if _is_transposing(img):
                width, height = height, width
    except Exception:
        logger.debug("Could not read image dimensions: %s", image_path, exc_info=True)
        return None

    if width <= 0 or height <= 0:
        return None
    return width, height


# EXIF Orientation values that rotate by a quarter turn, so the displayed
# size is the stored size with its axes swapped. 1-4 are identity, mirror,
# or half turns, which leave the axes alone.
_QUARTER_TURNS = frozenset({5, 6, 7, 8})
_ORIENTATION_TAG = 0x0112


def _is_transposing(img: Image.Image) -> bool:
    try:
        exif = img.getexif()
    except Exception:
        return False
    return exif.get(_ORIENTATION_TAG) in _QUARTER_TURNS

