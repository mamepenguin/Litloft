import json
import os
from pathlib import Path


DRIVES_CONFIG = Path(os.getenv("DRIVES_CONFIG", "./drives.json"))
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
DATABASE_URL = f"sqlite:///{DATA_DIR}/videos.db"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
UPLOAD_DIR = DATA_DIR / "uploads"
CHUNK_SIZE = 1024 * 1024  # 1MB for streaming
MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024  # 2GB
DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024  # 5MB

_drives_cache: list[dict] | None = None


def load_drives() -> list[dict]:
    global _drives_cache
    if _drives_cache is None:
        with open(DRIVES_CONFIG) as f:
            raw = json.load(f)
        if not isinstance(raw, list):
            raise ValueError("drives.json must be a JSON array")
        for i, entry in enumerate(raw):
            if not isinstance(entry, dict) or "name" not in entry or "path" not in entry:
                raise ValueError(f"drives.json entry {i} must have 'name' and 'path'")
            if "/" in entry["name"] or "\\" in entry["name"]:
                raise ValueError(f"Drive name must not contain path separators: {entry['name']}")
        _drives_cache = raw
    return list(_drives_cache)


def get_drive_path(drive_name: str) -> Path:
    for drive in load_drives():
        if drive["name"] == drive_name:
            return Path(drive["path"])
    raise ValueError(f"Drive not found: {drive_name}")


def get_drive_names() -> list[str]:
    return [d["name"] for d in load_drives()]


def is_drive_readonly(drive_name: str) -> bool:
    for drive in load_drives():
        if drive["name"] == drive_name:
            return drive.get("readonly", False)
    raise ValueError(f"Drive not found: {drive_name}")
