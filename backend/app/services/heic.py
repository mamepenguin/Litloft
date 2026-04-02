import hashlib
import logging
import os
import tempfile
from pathlib import Path

import pillow_heif
from PIL import Image

pillow_heif.register_heif_opener()
Image.MAX_IMAGE_PIXELS = 100_000_000  # 100 megapixels

logger = logging.getLogger(__name__)

HEIC_MIME_TYPES = frozenset({
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
})

HEIC_EXTENSIONS = frozenset({".heic", ".heif"})


def _cache_path_for(source_path: str, cache_dir: Path) -> Path:
    path_hash = hashlib.sha256(source_path.encode("utf-8")).hexdigest()[:16]
    return cache_dir / f"{path_hash}.jpg"


def convert_heic_to_jpeg(source_path: str, cache_dir: Path) -> Path | None:
    """Convert a HEIC file to JPEG, returning the cached JPEG path.

    Returns the cache path if conversion succeeds or cache already exists.
    Returns None on failure.
    """
    cached = _cache_path_for(source_path, cache_dir)
    if cached.exists():
        return cached

    try:
        cache_dir.mkdir(parents=True, exist_ok=True)

        with Image.open(source_path) as img:
            oriented = _apply_exif_orientation(img)
            fd, tmp_path = tempfile.mkstemp(suffix=".jpg", dir=str(cache_dir))
            try:
                os.close(fd)
                oriented.save(tmp_path, format="JPEG", quality=90, exif=b"")
                os.replace(tmp_path, str(cached))
            except Exception:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                raise

        logger.info("Converted HEIC to JPEG: %s -> %s", source_path, cached)
        return cached
    except Exception as e:
        logger.error("Failed to convert HEIC %s: %s", source_path, e)
        if cached.exists():
            cached.unlink()
        return None


def _apply_exif_orientation(img):
    """Return a new image with EXIF orientation applied."""
    from PIL import ImageOps

    return ImageOps.exif_transpose(img)


def cleanup_heic_cache(file_path: str, cache_dir: Path) -> None:
    """Remove cached JPEG for a given source file path, if it exists."""
    cached = _cache_path_for(file_path, cache_dir)
    if cached.exists():
        try:
            cached.unlink()
            logger.info("Removed HEIC cache: %s", cached)
        except OSError as e:
            logger.error("Failed to remove HEIC cache %s: %s", cached, e)


def is_heic_file(file_path: str) -> bool:
    """Check if a file path has a HEIC/HEIF extension."""
    return Path(file_path).suffix.lower() in HEIC_EXTENSIONS


def is_heic_mime(mime_type: str | None) -> bool:
    """Check if a MIME type is a HEIC/HEIF type."""
    return mime_type in HEIC_MIME_TYPES
