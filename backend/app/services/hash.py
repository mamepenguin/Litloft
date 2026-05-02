import hashlib
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

HASH_CHUNK_SIZE = 256 * 1024  # 256KB head + 256KB tail


def compute_file_hash(path: Path) -> str | None:
    """SHA-256 of (first 256KB || last 256KB) bytes, paired with file_size
    by callers to form a strong identity key for move detection.

    For files smaller than 2 * HASH_CHUNK_SIZE the head and tail ranges
    overlap; this is intentional and yields a stable hash equivalent to a
    whole-file hash for small files.

    Returns the hex digest string, or None on any error.
    """
    try:
        size = path.stat().st_size
        with open(path, "rb") as f:
            head = f.read(HASH_CHUNK_SIZE)
            if size > HASH_CHUNK_SIZE:
                f.seek(max(0, size - HASH_CHUNK_SIZE))
                tail = f.read(HASH_CHUNK_SIZE)
            else:
                tail = b""
        return hashlib.sha256(head + tail).hexdigest()
    except (OSError, IOError):
        logger.warning("Failed to compute hash for: %s", path)
        return None
