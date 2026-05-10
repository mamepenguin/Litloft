"""Generic event hook dispatcher.

Reads webhook listeners from a JSON config file and dispatches events
to registered URLs.  If no config file exists, all emit calls are no-ops.

Config format (event-hooks.json):

    {
      "hooks": {
        "files.deleted": [
          {"url": "http://search:8100/webhook/files-deleted",
           "secret_env": "SEARCH_WEBHOOK_SECRET",
           "addon": "intelligence",
           "feature": "index"}
        ]
      }
    }

Per-listener ``addon``/``feature`` keys (optional) enable per-drive policy
filtering: events whose payload references drives where the addon feature
is disabled are silently dropped or stripped before dispatch.
"""

import json
import logging
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_hooks: dict[str, list[dict[str, str]]] = {}


def init(config_path: str | None = None) -> None:
    """Load hook definitions from JSON config.

    Falls back to EVENT_HOOKS_PATH env var, then /app/event-hooks.json.
    If the file doesn't exist, hooks remain empty (all emits are no-ops).
    """
    global _hooks

    path = config_path or os.environ.get(
        "EVENT_HOOKS_PATH", "/app/event-hooks.json"
    )
    config_file = Path(path)
    if not config_file.exists():
        logger.info("No event hooks config at %s (hooks disabled)", path)
        _hooks = {}
        return

    try:
        raw = json.loads(config_file.read_text())
        _hooks = raw.get("hooks", {})
        total = sum(len(v) for v in _hooks.values())
        logger.info(
            "Loaded %d event hook(s) for %d event(s) from %s",
            total,
            len(_hooks),
            path,
        )
    except Exception:
        logger.exception("Failed to load event hooks from %s", path)
        _hooks = {}


def _is_feature_enabled(drive: str, addon: str, feature: str) -> bool:
    try:
        import app.config as config
        return config.is_addon_feature_enabled(drive, addon, feature)
    except ValueError:
        return False
    except Exception:
        logger.exception(
            "Failed to evaluate addon policy for drive=%s addon=%s feature=%s",
            drive, addon, feature,
        )
        return True


def _file_ids_to_drives(file_ids: list[str]) -> dict[str, str]:
    """Resolve file_id → drive via the DB. Returns {} on any failure.

    Missing/trashed file ids are still resolved (we want their owning drive
    to apply policy correctly when notifying about purges).
    """
    if not file_ids:
        return {}
    try:
        from app.database import SessionLocal
        from app.models import File
        with SessionLocal() as db:
            rows = (
                db.query(File.id, File.drive)
                .filter(File.id.in_(file_ids))
                .all()
            )
            return {row.id: row.drive for row in rows}
    except Exception:
        logger.exception("Failed to resolve file→drive for policy filter")
        return {}


def _filter_payload_for_listener(
    data: dict[str, Any], hook: dict[str, str]
) -> dict[str, Any] | None:
    """Apply per-listener policy. Returns None to drop the event entirely.

    - When ``data["drive"]`` is set: drop the event if the listener's
      (addon, feature) is disabled for that drive.
    - When ``data["file_ids"]`` is set: filter file_ids by per-file drive
      policy. Drop the event if no ids remain.
    - Listeners without ``addon`` configured pass through unchanged.
    """
    addon = hook.get("addon")
    if not addon:
        return data
    feature = hook.get("feature", "index")

    drive = data.get("drive")
    if isinstance(drive, str):
        if not _is_feature_enabled(drive, addon, feature):
            return None
        return data

    file_ids = data.get("file_ids")
    if isinstance(file_ids, list) and file_ids:
        drives = _file_ids_to_drives(file_ids)
        if not drives:
            return data
        allowed = [
            fid for fid in file_ids
            if fid in drives
            and _is_feature_enabled(drives[fid], addon, feature)
        ]
        if not allowed:
            return None
        if len(allowed) == len(file_ids):
            return data
        return {**data, "file_ids": allowed}

    return data


def _build_headers(hook: dict[str, str]) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    secret_env = hook.get("secret_env")
    if secret_env:
        secret = os.environ.get(secret_env, "")
        if secret:
            headers["X-Webhook-Secret"] = secret
    return headers


async def emit(event: str, data: dict[str, Any]) -> None:
    """Fire-and-forget async notification to all listeners for an event."""
    listeners = _hooks.get(event, [])
    if not listeners:
        return

    try:
        import httpx

        # trust_env=False: hook URLs target Docker-internal addon services
        # (e.g. http://intelligence:8100/...). Honoring HTTP(S)_PROXY env
        # would route those through a host-side proxy that cannot resolve
        # Docker DNS.
        async with httpx.AsyncClient(timeout=5.0, trust_env=False) as client:
            for hook in listeners:
                payload = _filter_payload_for_listener(data, hook)
                if payload is None:
                    continue
                try:
                    await client.post(
                        hook["url"],
                        json=payload,
                        headers=_build_headers(hook),
                    )
                except Exception:
                    logger.debug(
                        "Event hook failed: %s -> %s (listener may be down)",
                        event,
                        hook["url"],
                    )
    except Exception:
        logger.debug("Event hook dispatch failed for %s", event)


def emit_sync(event: str, data: dict[str, Any]) -> None:
    """Fire-and-forget synchronous notification for use in threads."""
    listeners = _hooks.get(event, [])
    if not listeners:
        return

    for hook in listeners:
        payload_data = _filter_payload_for_listener(data, hook)
        if payload_data is None:
            continue
        payload = json.dumps(payload_data).encode("utf-8")
        try:
            req = urllib.request.Request(
                hook["url"],
                data=payload,
                headers=_build_headers(hook),
                method="POST",
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception:
            logger.debug(
                "Event hook failed: %s -> %s (listener may be down)",
                event,
                hook["url"],
            )
