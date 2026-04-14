"""Addon manifest registry.

Loads and merges addon metadata from two sources:
1. In-process addons: ADDON_META dicts from backend/addons/*/router.py
2. External service addons: manifest.json files from addons/*/manifest.json

Provides a unified view of all addons including their slots and proxy config.
"""

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_registry: dict[str, dict[str, Any]] = {}

_VALID_SCOPES = {"drive", "global", "both"}


def _validate_scope(name: str, meta: dict[str, Any]) -> bool:
    """Return True if meta declares a valid scope, log and return False otherwise."""
    scope = meta.get("scope")
    if scope not in _VALID_SCOPES:
        logger.error(
            "Addon %r skipped: missing or invalid 'scope' field (got %r, expected one of %s)",
            name,
            scope,
            sorted(_VALID_SCOPES),
        )
        return False
    return True

# Candidate directories to scan for addon manifests.
# - Docker: /app/addons (backend Dockerfile places manifests alongside addon code)
# - Local dev: <repo>/addons (manifests live in each addon's own repo, checked out at repo root)
_BACKEND_ROOT = Path(__file__).parent.parent.parent


def _iter_manifest_files() -> list[Path]:
    """Discover addon manifest files in known addon directories, deduped by addon name."""
    candidates = [
        _BACKEND_ROOT / "addons",         # Docker layout (/app/addons)
        _BACKEND_ROOT.parent / "addons",  # Local dev layout (<repo>/addons)
    ]
    found: dict[str, Path] = {}
    for base in candidates:
        if not base.is_dir():
            continue
        for manifest_path in sorted(base.glob("*/manifest.json")):
            name = manifest_path.parent.name
            if name not in found:
                found[name] = manifest_path
    return list(found.values())


def load_external_manifests() -> None:
    """Load addon manifests from addons/*/manifest.json."""
    manifest_files = _iter_manifest_files()
    if not manifest_files:
        logger.info("No addon manifests found")
        return

    for manifest_path in manifest_files:
        addon_name = manifest_path.parent.name
        try:
            raw = json.loads(manifest_path.read_text())
            raw.setdefault("type", "external_service")
            if not _validate_scope(addon_name, raw):
                continue
            _registry[addon_name] = raw
            logger.info(
                "External addon manifest loaded: %s (%s)", addon_name, manifest_path
            )
        except Exception:
            logger.exception("Failed to load addon manifest: %s", manifest_path)


def register_in_process(name: str, meta: dict[str, Any]) -> bool:
    """Register an in-process addon's metadata.

    Returns True if registered, False if skipped due to invalid metadata.
    """
    meta_copy = {**meta, "type": meta.get("type", "in_process")}
    if not _validate_scope(name, meta_copy):
        return False
    _registry[name] = meta_copy
    return True


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
