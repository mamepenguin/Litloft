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

import asyncio
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


# ---------------------------------------------------------------------------
# Browser notification (WebSocket)
#
# Addon listeners get the fine-grained event with its ids. Browsers get a
# coarse "something changed in this drive" signal instead, because every
# structural subscriber goes through ``useWebSocketRefresh``, which ignores
# the payload and simply refetches.
#
# Two events rather than one: the folder tree deliberately does not watch
# content updates, and collapsing them would make the Markdown editor's
# autosave refetch the tree on every debounce while the user types.
#
# Spec: docs/superpowers/specs/2026-08-22-core-lifecycle-events-over-websocket.md
# ---------------------------------------------------------------------------

# Keeps the IN clause well inside SQLite's bind-variable ceiling.
_DRIVE_LOOKUP_CHUNK = 500

WS_STRUCTURE_CHANGED = "drive.structure_changed"
WS_FILE_UPDATED = "drive.file_updated"

_WS_EVENT_FOR: dict[str, str] = {
    "files.created": WS_STRUCTURE_CHANGED,
    "files.deleted": WS_STRUCTURE_CHANGED,
    "files.moved": WS_STRUCTURE_CHANGED,
    "files.restored": WS_STRUCTURE_CHANGED,
    "files.recovered": WS_STRUCTURE_CHANGED,
    "files.missing": WS_STRUCTURE_CHANGED,
    "files.purged": WS_STRUCTURE_CHANGED,
    "folders.created": WS_STRUCTURE_CHANGED,
    "folders.moved": WS_STRUCTURE_CHANGED,
    "folders.deleted": WS_STRUCTURE_CHANGED,
    "scan.complete": WS_STRUCTURE_CHANGED,
    "files.updated": WS_FILE_UPDATED,
}


def _affected_drives(data: dict[str, Any]) -> list[str]:
    """Which drives a payload concerns, for per-drive broadcast scoping.

    ``folders.*`` and ``scan.complete`` already carry ``drive``. The
    ``files.*`` payloads carry only ``file_ids``, and a single batch can
    span drives — the startup auto-purge emits every purged id from every
    drive at once — so the ids are resolved and the caller fans out.

    Returns ``[]`` when the drives cannot be determined. That is
    deliberately **fail closed**, the opposite of the webhook path's
    fail-open filter: for a webhook the recipient is one known addon, but
    for a broadcast the drive filter *is* the recipient set, so failing
    open would send a protected drive's notification to every connection.
    """
    drive = data.get("drive")
    if isinstance(drive, str) and drive:
        return [drive]

    file_ids = data.get("file_ids")
    if not file_ids:
        return []

    # Chunked because a single event can carry every id in the library:
    # the startup auto-purge emits all expired ids at once, and
    # ``_file_ids_to_drives`` expands them into one IN clause. Previously
    # an install with no addon listeners returned early and never ran this
    # query at all, so bounding it here is new work, not a regression.
    ids = list(file_ids)
    drives: set[str] = set()
    try:
        for start in range(0, len(ids), _DRIVE_LOOKUP_CHUNK):
            chunk = ids[start : start + _DRIVE_LOOKUP_CHUNK]
            resolved = _file_ids_to_drives(chunk)
            if not resolved:
                # Fail closed: a chunk we could not resolve may have held
                # the only ids belonging to a drive we would then omit —
                # but omitting is safe, whereas guessing is not.
                continue
            drives.update(resolved.values())
    except Exception as exc:  # noqa: BLE001
        logger.debug("Drive lookup failed, skipping broadcast: %s", exc)
        return []

    return sorted(drives)


def _ws_plan(
    event: str,
    data: dict[str, Any],
    drives_hint: list[str] | None = None,
) -> tuple[str, list[str]] | None:
    """Resolve an event to (ws_event_name, drives), or None to stay silent.

    ``drives_hint`` wins over anything derivable from ``data``, because a
    lookup can only ever observe the state *after* the mutation:

    - a purge has already deleted the row, so nothing resolves at all;
    - a cross-drive move has already rewritten ``File.drive``, so only the
      destination resolves and the source drive is never told.

    Only the caller holds the pre-mutation truth, so callers in those paths
    capture it and pass it here. The hint travels beside the payload rather
    than inside it: the webhook body is an addon-facing contract and must
    not change shape.
    """
    ws_event = _WS_EVENT_FOR.get(event)
    if ws_event is None:
        return None

    if drives_hint:
        drives = sorted({d for d in drives_hint if d})
    else:
        drives = _affected_drives(data)
        if not drives and event == "files.purged":
            # Purge always deletes before it notifies, so this is not a
            # transient miss — it means a call site forgot the hint.
            logger.warning(
                "files.purged emitted without a drives hint; "
                "browsers will not be told (%d ids)",
                len(data.get("file_ids") or []),
            )

    if not drives:
        return None
    return ws_event, drives


async def _broadcast_to_browsers(
    event: str, data: dict[str, Any], drives: list[str] | None = None
) -> None:
    plan = _ws_plan(event, data, drives)
    if plan is None:
        return
    ws_event, drives = plan
    from app.services.ws import manager

    for drive in drives:
        try:
            await manager.broadcast(ws_event, {"drive": drive}, drive=drive)
        except Exception as exc:  # noqa: BLE001
            # Notification is best effort. A write must never fail because
            # a browser could not be told about it.
            logger.debug("WS broadcast failed for %s: %s", ws_event, exc)


def _broadcast_to_browsers_sync(
    event: str, data: dict[str, Any], drives: list[str] | None = None
) -> None:
    plan = _ws_plan(event, data, drives)
    if plan is None:
        return
    ws_event, drives = plan
    import app.services.ws as ws

    for drive in drives:
        try:
            ws.broadcast_from_thread(ws_event, {"drive": drive}, drive=drive)
        except Exception as exc:  # noqa: BLE001
            logger.debug("WS broadcast failed for %s: %s", ws_event, exc)


async def emit(
    event: str, data: dict[str, Any], drives: list[str] | None = None
) -> None:
    """Fire-and-forget async notification to all listeners for an event.

    ``drives`` scopes the browser broadcast when the payload cannot be
    resolved after the fact — purges and cross-drive moves. It never
    reaches addon listeners.
    """
    # Before the listener guard on purpose: with no addons installed there
    # are no listeners, and that is exactly the install that needs the
    # browser notification.
    await _broadcast_to_browsers(event, data, drives)

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


def emit_sync(
    event: str, data: dict[str, Any], drives: list[str] | None = None
) -> None:
    """Fire-and-forget synchronous notification for use in threads."""
    # Same reasoning as ``emit``: before the listener guard. Uses the
    # thread-safe broadcaster because the scanner calls this from a worker
    # thread, where ``manager.broadcast`` has no running loop.
    _broadcast_to_browsers_sync(event, data, drives)

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


_event_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Store the running event loop reference for thread-safe emits."""
    global _event_loop
    _event_loop = loop


def emit_from_thread(
    event: str, data: dict[str, Any], drives: list[str] | None = None
) -> None:
    """Thread-safe fire-and-forget emit for use from FastAPI's sync (threadpool) handlers.

    Schedules the async ``emit`` coroutine on the stored event loop from a
    worker thread, so the calling thread returns immediately instead of
    blocking on the webhook HTTP call (unlike ``emit_sync``). Mirrors
    ``app.services.ws.broadcast_from_thread``.
    """
    if _event_loop is None or _event_loop.is_closed():
        logger.warning("No event loop available for emit: %s", event)
        return
    _event_loop.call_soon_threadsafe(
        asyncio.ensure_future,
        emit(event, data, drives),
    )
