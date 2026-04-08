"""Generic event hook dispatcher.

Reads webhook listeners from a JSON config file and dispatches events
to registered URLs.  If no config file exists, all emit calls are no-ops.

Config format (event-hooks.json):

    {
      "hooks": {
        "files.deleted": [
          {"url": "http://search:8100/webhook/files-deleted",
           "secret_env": "SEARCH_WEBHOOK_SECRET"}
        ]
      }
    }
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

        async with httpx.AsyncClient(timeout=5.0) as client:
            for hook in listeners:
                try:
                    await client.post(
                        hook["url"],
                        json=data,
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

    payload = json.dumps(data).encode("utf-8")
    for hook in listeners:
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
