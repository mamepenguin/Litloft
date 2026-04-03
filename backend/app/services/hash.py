import hashlib
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

HASH_CHUNK_SIZE = 1_048_576  # 1MB


def compute_file_hash(path: Path) -> str | None:
    """Compute SHA-256 hash of the first 1MB of a file.

    Returns the hex digest string, or None on any error.
    """
    try:
        with open(path, "rb") as f:
            data = f.read(HASH_CHUNK_SIZE)
        return hashlib.sha256(data).hexdigest()
    except (OSError, IOError):
        logger.warning("Failed to compute hash for: %s", path)
        return None
