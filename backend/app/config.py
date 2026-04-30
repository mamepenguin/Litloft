import json
import os
from pathlib import Path


DRIVES_CONFIG = Path(os.getenv("DRIVES_CONFIG", "./drives.json"))
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
DATABASE_URL = f"sqlite:///{DATA_DIR}/videos.db"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
CONVERTED_DIR = DATA_DIR / "converted"
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
            addons = entry.get("addons")
            if addons is not None and not isinstance(addons, dict):
                raise ValueError(
                    f"drives.json entry {i} 'addons' must be an object"
                )
            if isinstance(addons, dict):
                for addon_name, policy in addons.items():
                    if not isinstance(policy, (dict, bool)):
                        raise ValueError(
                            f"drives.json entry {i} addons.{addon_name} "
                            "must be a bool or object"
                        )
        _drives_cache = raw
    return list(_drives_cache)


def get_drive_path(drive_name: str) -> Path:
    for drive in load_drives():
        if drive["name"] == drive_name:
            return Path(drive["path"])
    raise ValueError(f"Drive not found: {drive_name}")


def get_drive_names() -> list[str]:
    return [d["name"] for d in load_drives()]


def get_drive_access_group(drive_name: str) -> str | None:
    for drive in load_drives():
        if drive["name"] == drive_name:
            return drive.get("access_group")
    raise ValueError(f"Drive not found: {drive_name}")


def get_drive_addon_policy(drive_name: str, addon_name: str) -> dict:
    """Return the per-drive policy dict for an addon.

    drives.json schema:
        { "name": "...", "addons": { "<addon>": { "<feature>": bool, ... } } }

    Returns empty dict if no policy is configured (= all features enabled).
    A bool value (e.g. ``"intelligence": false``) is normalised to a dict
    where the implicit feature ``enabled`` carries that value, and any
    feature lookup falls back to it.
    """
    for drive in load_drives():
        if drive["name"] == drive_name:
            addons = drive.get("addons", {})
            policy = addons.get(addon_name, {})
            if isinstance(policy, bool):
                return {"_all": policy}
            if not isinstance(policy, dict):
                return {}
            return policy
    raise ValueError(f"Drive not found: {drive_name}")


def is_addon_feature_enabled(
    drive_name: str, addon_name: str, feature: str
) -> bool:
    """Return True if a per-drive addon feature is enabled.

    Default is True (graceful degradation: missing config = full enable).
    Bool shorthand ``"<addon>": false`` disables every feature.
    """
    policy = get_drive_addon_policy(drive_name, addon_name)
    if "_all" in policy:
        return bool(policy["_all"])
    value = policy.get(feature, True)
    return bool(value)
