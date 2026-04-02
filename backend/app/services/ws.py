"""WebSocket connection manager for real-time event broadcasting."""

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

import app.config as config

logger = logging.getLogger(__name__)

MAX_CONNECTIONS = 100


class ConnectionManager:
    """Manages WebSocket connections and broadcasts events with access filtering."""

    def __init__(self) -> None:
        self._connections: dict[WebSocket, list[str]] = {}

    async def connect(self, websocket: WebSocket, groups: list[str]) -> bool:
        """Accept and register a WebSocket connection with its access groups.

        Returns False and closes if connection limit is reached.
        """
        if len(self._connections) >= MAX_CONNECTIONS:
            await websocket.close(code=1008, reason="Too many connections")
            return False
        await websocket.accept()
        self._connections[websocket] = groups
        return True

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        self._connections.pop(websocket, None)

    async def broadcast(
        self,
        event: str,
        data: dict[str, Any],
        drive: str | None = None,
    ) -> None:
        """Broadcast an event to all eligible connections.

        If drive is specified, only connections with the matching access group
        receive the message. Public drives (no access_group) send to everyone.
        """
        message = {"event": event, "data": data}
        try:
            access_group = config.get_drive_access_group(drive) if drive else None
        except ValueError:
            logger.warning("Broadcast for unknown drive: %s", drive)
            return

        disconnected: list[WebSocket] = []
        for ws, groups in list(self._connections.items()):
            if access_group and access_group not in groups:
                continue
            try:
                await ws.send_json(message)
            except Exception as exc:
                logger.debug("Failed to send to WebSocket, disconnecting: %s", exc)
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws)


_event_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Store the running event loop reference for thread-safe broadcasts."""
    global _event_loop
    _event_loop = loop


def broadcast_from_thread(
    event: str,
    data: dict[str, Any],
    drive: str | None = None,
) -> None:
    """Thread-safe broadcast helper for use from run_in_executor contexts.

    Schedules the async broadcast on the stored event loop from a worker thread.
    """
    if _event_loop is None or _event_loop.is_closed():
        logger.warning("No event loop available for broadcast: %s", event)
        return
    _event_loop.call_soon_threadsafe(
        asyncio.ensure_future,
        manager.broadcast(event, data, drive=drive),
    )


manager = ConnectionManager()
