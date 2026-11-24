"""No pooled DB connection is held while an addon upstream is working.

The ``file_access`` pre-check reads through the request's session, and that
session's connection goes back to the pool when the session closes. If the
close waits for the upstream, a slow addon pins one connection per request —
for a stream route, for as long as the first byte takes — and the pool runs
dry for every other endpoint.

The count is read inside the fake upstream, so it is what the core request
still holds at the moment the upstream is handed the request.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

import app.database as database
from app.models import File
from app.services import addon_registry

ADDON = "_pooldb"
DRIVE = "pooldb-drive"
FILE_ID = "pooldb000001"


def _checkedout() -> int:
    return database.engine.pool.checkedout()


class _BufferedSpyClient:
    checkedout_at_request: list[int] = []

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    async def request(self, **kwargs) -> Any:
        _BufferedSpyClient.checkedout_at_request.append(_checkedout())

        class _R:
            status_code = 200
            headers = httpx.Headers({"content-type": "application/json"})
            text = ""

            def json(self_inner):
                return {"reached": "upstream"}

            def raise_for_status(self_inner):
                return None

        return _R()


class _StreamSpyClient:
    checkedout_at_send: list[int] = []

    def __init__(self, *a, **kw):
        pass

    async def aclose(self):
        return None

    def build_request(self, **kwargs) -> Any:
        return kwargs

    async def send(self, req: Any, *, stream: bool) -> Any:
        _StreamSpyClient.checkedout_at_send.append(_checkedout())

        class _R:
            status_code = 200
            headers = httpx.Headers({"content-type": "text/event-stream"})

            async def aiter_bytes(self_inner):
                yield b'data: {"reached": "upstream"}\n\n'

            async def aclose(self_inner):
                return None

        return _R()


MANIFEST = {
    "label": "Pool DB",
    "icon": "database",
    "type": "external_service",
    "scope": "drive",
    "href": "/drive/{drive}/addons/_pooldb",
    "proxy": {
        "target_default": "http://_pooldb:9999",
        "routes": [
            {
                "path": "/files/{file_id}/thing",
                "methods": ["GET"],
                "pre_check": {"type": "file_access", "param": "file_id"},
            },
            {
                "path": "/files/{file_id}/stream",
                "methods": ["GET"],
                "stream": True,
                "pre_check": {"type": "file_access", "param": "file_id"},
            },
        ],
    },
}


@pytest.fixture()
def pooldb_addon(client, tmp_path: Path, monkeypatch):
    """One drive with one file, and an addon with a buffered and a stream route."""
    import app.config as config

    c, session, drive_dir, _data = client

    drives_path = tmp_path / "pooldb-drives.json"
    drives_path.write_text(json.dumps([{"name": DRIVE, "path": str(drive_dir)}]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_path)
    monkeypatch.setattr(config, "_drives_cache", None)

    session.add(File(
        id=FILE_ID, filename="clip.mp4", title="clip", drive=DRIVE,
        folder_path="", file_path="clip.mp4", file_size=1,
        file_type="video", mime_type="video/mp4",
    ))
    session.commit()

    prev = addon_registry._registry.get(ADDON)
    addon_registry._registry[ADDON] = MANIFEST
    _BufferedSpyClient.checkedout_at_request = []
    _StreamSpyClient.checkedout_at_send = []

    yield c

    if prev is None:
        addon_registry._registry.pop(ADDON, None)
    else:
        addon_registry._registry[ADDON] = prev


def test_a_buffered_route_holds_no_connection_while_the_upstream_works(
    pooldb_addon, monkeypatch,
):
    import app.routers.addon_proxy as proxy_module

    monkeypatch.setattr(
        proxy_module.httpx, "AsyncClient", _BufferedSpyClient
    )

    response = pooldb_addon.get(
        f"/api/addons/{ADDON}/files/{FILE_ID}/thing",
        headers={"X-Lit-Drive": DRIVE},
    )

    assert response.status_code == 200
    assert _BufferedSpyClient.checkedout_at_request == [0]


def test_a_stream_route_holds_no_connection_while_the_upstream_works(
    pooldb_addon, monkeypatch,
):
    import app.routers.addon_proxy as proxy_module

    monkeypatch.setattr(proxy_module.httpx, "AsyncClient", _StreamSpyClient)

    response = pooldb_addon.get(
        f"/api/addons/{ADDON}/files/{FILE_ID}/stream",
        headers={"X-Lit-Drive": DRIVE},
    )

    assert response.status_code == 200
    assert _StreamSpyClient.checkedout_at_send == [0]
