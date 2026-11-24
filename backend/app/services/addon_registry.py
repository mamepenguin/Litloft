"""Addon manifest registry.

Loads and merges addon metadata from two sources:
1. In-process addons: ADDON_META dicts from backend/addons/*/router.py
2. External service addons: manifest.json files from addons/*/manifest.json

Provides a unified view of all addons including their slots and proxy config.
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_registry: dict[str, dict[str, Any]] = {}

_VALID_SCOPES = {"drive", "global", "both"}


def _validate_scope(name: str, meta: dict[str, Any]) -> bool:
    """Return True if meta declares a valid scope, log and return False otherwise."""
    scope = meta.get("scope")
    if not isinstance(scope, str) or scope not in _VALID_SCOPES:
        logger.error(
            "Addon %r skipped: missing or invalid 'scope' field (got %r, expected one of %s)",
            name,
            scope,
            sorted(_VALID_SCOPES),
        )
        return False
    return True


_VALID_PLACEMENTS = {"primary", "sources", "utility"}


def _navigation_error(nav: Any) -> str | None:
    if not isinstance(nav, dict):
        return "not an object"
    placement = nav.get("placement")
    # Checked as a string first: a list or object is unhashable, and `in` on a set raises.
    if not isinstance(placement, str) or placement not in _VALID_PLACEMENTS:
        return f"placement must be one of {sorted(_VALID_PLACEMENTS)}"
    label = nav.get("label")
    if not isinstance(label, str) or not label.strip():
        return "label must be a non-empty string"
    priority = nav.get("priority")
    # bool is an int subclass, and True would sort as 1.
    if not isinstance(priority, int) or isinstance(priority, bool):
        return "priority must be an integer"
    for key in ("i18n_key", "icon"):
        if key in nav and not isinstance(nav[key], str):
            return f"{key} must be a string"
    return None


# The addon subpage route's slug rule, with a length cap, so every accepted
# `path` names a page it can load.
_NAVIGATION_PATH = re.compile(r"[a-z][a-z0-9-]{0,39}")


def _navigation_path_error(nav: dict[str, Any]) -> str | None:
    if "path" not in nav:
        return None
    path = nav["path"]
    if not isinstance(path, str) or _NAVIGATION_PATH.fullmatch(path) is None:
        return "path must match ^[a-z][a-z0-9-]{0,39}$"
    return None


def _navigation_kept(name: str, navigation: Any) -> Any:
    """The block to keep, or ``None`` when the whole block should go."""
    if isinstance(navigation, dict):
        error = _navigation_error(navigation) or _navigation_path_error(navigation)
        if error is None:
            return navigation
        logger.warning("Addon %r navigation ignored: %s", name, error)
        return None
    if not isinstance(navigation, list):
        logger.warning("Addon %r navigation ignored: not an object or list", name)
        return None
    if not navigation:
        logger.warning("Addon %r navigation ignored: empty list", name)
        return None
    if len(navigation) > 4:
        logger.warning(
            "Addon %r navigation ignored: %d entries, at most 4",
            name,
            len(navigation),
        )
        return None

    kept: list[Any] = []
    seen_paths: set[str | None] = set()
    for index, element in enumerate(navigation):
        # `_navigation_error` also refuses a non-object, which the path check
        # cannot look inside.
        error = _navigation_error(element)
        if error is None:
            error = _navigation_path_error(element)
        if error is not None:
            logger.warning(
                "Addon %r navigation entry %d dropped: %s", name, index, error
            )
            continue
        path = element.get("path")
        if path in seen_paths:
            logger.warning(
                "Addon %r navigation entry %d dropped: duplicate path %r",
                name,
                index,
                path,
            )
            continue
        seen_paths.add(path)
        kept.append(element)

    if not kept:
        logger.warning("Addon %r navigation ignored: no valid entry", name)
        return None
    return kept


def _without_invalid_navigation(name: str, meta: dict[str, Any]) -> dict[str, Any]:
    """Drop an invalid ``navigation`` block; the addon itself stays registered."""
    if "navigation" not in meta:
        return meta
    kept = _navigation_kept(name, meta["navigation"])
    if kept is None:
        return {k: v for k, v in meta.items() if k != "navigation"}
    return {**meta, "navigation": kept}

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
            _registry[addon_name] = _without_invalid_navigation(addon_name, raw)
            logger.info(
                "External addon manifest loaded: %s (%s)", addon_name, manifest_path
            )
        except Exception:
            logger.exception("Failed to load addon manifest: %s", manifest_path)


def register_in_process(name: str, meta: dict[str, Any]) -> bool:
    """Register an in-process addon's metadata.

    Returns True if registered, False if skipped due to invalid metadata.
    """
    if not isinstance(meta, dict):
        logger.error("Addon %r skipped: ADDON_META must be a dict (got %r)", name, meta)
        return False
    meta_copy = {**meta, "type": meta.get("type", "in_process")}
    if not _validate_scope(name, meta_copy):
        return False
    _registry[name] = _without_invalid_navigation(name, meta_copy)
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


def resolve_target_url(proxy_config: dict[str, Any]) -> str | None:
    """Resolve the target URL from env var or default."""
    env_name = proxy_config.get("target_env", "")
    default_url = proxy_config.get("target_default", "")
    if env_name:
        configured = os.environ.get(env_name)
        if configured:
            return configured
    return default_url or None


def get_processing_addons() -> list[tuple[str, dict[str, Any]]]:
    """External addons that declare a processing-status path, in name order."""
    addons = [
        (name, meta)
        for name, meta in get_external_addons().items()
        if isinstance(meta.get("processing_status"), dict)
        and isinstance(meta["processing_status"].get("path"), str)
    ]
    return sorted(addons, key=lambda item: item[0])


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
