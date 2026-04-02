"""WebSocket endpoint for real-time event streaming."""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth import COOKIE_NAME, decode_jwt
from app.services.ws import manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Accept a WebSocket connection and keep it alive for broadcasting.

    Reads JWT from cookies to determine access groups. Connections without
    valid JWT are allowed with empty groups (public-only events).
    """
    token = websocket.cookies.get(COOKIE_NAME)
    groups = decode_jwt(token) if token else []

    connected = await manager.connect(websocket, groups)
    if not connected:
        return

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
