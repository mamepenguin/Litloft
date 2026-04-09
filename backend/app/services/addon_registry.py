"""Addon manifest registry.

Loads and merges addon metadata from two sources:
1. In-process addons: ADDON_META dicts from backend/addons/*/router.py
2. External service addons: JSON manifests from backend/addon-manifests/*.json

Provides a unified view of all addons including their slots and proxy config.
"""

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_registry: dict[str, dict[str, Any]] = {}

MANIFESTS_DIR = Path(__file__).parent.parent.parent / "addon-manifests"


def load_external_manifests() -> None:
    """Load addon manifests from JSON files in addon-manifests/."""
    if not MANIFESTS_DIR.is_dir():
        logger.info("No addon-manifests directory found")
        return

    for manifest_path in sorted(MANIFESTS_DIR.glob("*.json")):
        try:
            raw = json.loads(manifest_path.read_text())
            addon_name = manifest_path.stem
            raw.setdefault("type", "external_service")
            _registry[addon_name] = raw
            logger.info("External addon manifest loaded: %s", addon_name)
        except Exception:
            logger.exception(
                "Failed to load addon manifest: %s", manifest_path.name
            )


def register_in_process(name: str, meta: dict[str, Any]) -> None:
    """Register an in-process addon's metadata."""
    meta_copy = {**meta, "type": meta.get("type", "in_process")}
    _registry[name] = meta_copy


def get_all() -> dict[str, dict[str, Any]]:
    """Return all registered addon metadata."""
    return dict(_registry)


def get(name: str) -> dict[str, Any] | None:
    """Return metadata for a specific addon."""
    return _registry.get(name)


def get_external_addons() -> dict[str, dict[str, Any]]:
    """Return only external service addons (those with proxy config)."""
    return {
        name: meta
        for name, meta in _registry.items()
        if meta.get("type") == "external_service" and "proxy" in meta
    }


def get_all_slots() -> dict[str, list[dict[str, Any]]]:
    """Collect all slot entries across all addons, sorted by priority."""
    slots: dict[str, list[dict[str, Any]]] = {}
    for addon_name, meta in _registry.items():
        addon_slots = meta.get("slots", {})
        for slot_id, entries in addon_slots.items():
            if slot_id not in slots:
                slots[slot_id] = []
            for entry in entries:
                slots[slot_id].append({
                    **entry,
                    "addonName": addon_name,
                })
    for entries in slots.values():
        entries.sort(key=lambda e: e.get("priority", 100))
    return slots
