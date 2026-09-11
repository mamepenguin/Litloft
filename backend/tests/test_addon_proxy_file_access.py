"""The addon proxy's file gate: what it refuses, and that it refuses first.

``pre_check: {"type": "file_access"}`` is what stands between an addon and a
file the caller may not read. For a route that carries no route-level
``addon_feature`` it is the whole of the core-side check — the drive-match half
is the addon's — which is why the tests here are about access rather than about
drive context.

How many routes that is belongs in the PR body, not here: they are declared in
another repository, so a count written down here cannot be falsified from this
one and a submodule pointer bump silently edits it.

Both of its refusals return 404 and both return the same body: ``design
-decisions.md`` §Access control keeps a locked drive's existence hidden, so
"there is no such file" and "that file is in a drive you cannot open" must not
be distinguishable from the outside.

Every refusal is also asserted to have happened **before** anything was
forwarded. A gate that runs after the proxy call has already sent the file id
upstream is not a gate; the addon has done the work and, for an addon that
logs or caches by id, has recorded it.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.services import addon_registry

ADDON = "_gate"
OPEN_DRIVE = "open-drive"
SECRET_DRIVE = "secret-drive"


class _SpyClient:
    """Stands in for httpx.AsyncClient and records that it was used at all."""

    calls: list[dict[str, Any]] = []

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    async def request(self, **kwargs) -> Any:
        _SpyClient.calls.append(kwargs)

        class _R:
            status_code = 200
            headers = httpx.Headers({"content-type": "application/json"})
            text = ""

            def json(self_inner):
                return {"reached": "upstream"}

            def raise_for_status(self_inner):
                return None

        return _R()


MANIFEST = {
    "label": "Gate",
    "icon": "lock",
    "type": "external_service",
    "scope": "drive",
    "href": "/drive/{drive}/addons/_gate",
    "proxy": {
        "target_default": "http://_gate:9999",
        "routes": [
            # The 23-route shape: a file gate and nothing else on the core side.
            {
                "path": "/files/{file_id}/thing",
                "methods": ["GET"],
                "pre_check": {"type": "file_access", "param": "file_id"},
            },
            # Reachable without ``X-Lit-Drive`` (the ``<img src>`` shape), so
            # the feature gate is what has to answer when there is no drive.
            {
                "path": "/gated",
                "methods": ["GET"],
                "drive_optional": True,
                "pre_check": {"type": "addon_feature", "feature": "rag"},
            },
        ],
    },
}


@pytest.fixture()
def two_drives(client, tmp_path: Path, monkeypatch):
    """One public drive and one behind a password, with a file in each."""
    import app.auth as auth
    import app.config as config
    import app.routers.addon_proxy as proxy_module
    from app.models import File

    c, session, drive_dir, _data = client

    secret_dir = tmp_path / "drives" / "secret"
    secret_dir.mkdir(parents=True, exist_ok=True)
    drives_path = tmp_path / "drives.json"
    drives_path.write_text(json.dumps([
        {"name": OPEN_DRIVE, "path": str(drive_dir)},
        {"name": SECRET_DRIVE, "path": str(secret_dir), "access_group": "vip"},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_path)
    monkeypatch.setattr(config, "_drives_cache", None)

    passwords_path = tmp_path / "passwords.json"
    passwords_path.write_text(json.dumps([
        {"password": "vippass", "groups": ["vip"]},
    ]))
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_path)
    monkeypatch.setattr(auth, "_passwords_cache", None)
    monkeypatch.setattr(auth, "_jwt_secret", "test-jwt-secret")

    for file_id, drive in (("open00000001", OPEN_DRIVE), ("secret000001", SECRET_DRIVE)):
        session.add(File(
            id=file_id, filename=f"{file_id}.mp4", title=file_id, drive=drive,
            folder_path="", file_path=f"{file_id}.mp4", file_size=1,
            file_type="video", mime_type="video/mp4",
        ))
    session.commit()

    prev = addon_registry._registry.get(ADDON)
    addon_registry._registry[ADDON] = MANIFEST
    monkeypatch.setattr(proxy_module.httpx, "AsyncClient", _SpyClient)
    _SpyClient.calls = []

    yield c

    if prev is None:
        addon_registry._registry.pop(ADDON, None)
    else:
        addon_registry._registry[ADDON] = prev


def _get_thing(c, file_id: str, drive: str = OPEN_DRIVE):
    return c.get(
        f"/api/addons/{ADDON}/files/{file_id}/thing",
        headers={"X-Lit-Drive": drive},
    )


class TestFileAccessGate:
    def test_a_file_in_a_drive_the_caller_cannot_open_is_not_found(self, two_drives):
        """The drive boundary, through the addon surface.

        The caller holds ``open-drive`` only. Asking for a file in the locked
        drive must not reach the addon — it is the addon that holds the
        transcripts, summaries and descriptions derived from that file.
        """
        response = _get_thing(two_drives, "secret000001")

        assert response.status_code == 404
        assert _SpyClient.calls == []

    def test_the_same_file_answers_once_the_drive_is_unlocked(self, two_drives):
        """Positive control.

        Without it a gate that refused everything would satisfy the test above
        while breaking every addon that reads a file.
        """
        unlocked = two_drives.post("/api/auth/unlock", json={"password": "vippass"})
        assert unlocked.status_code == 200

        response = _get_thing(two_drives, "secret000001", drive=SECRET_DRIVE)

        assert response.status_code == 200
        assert len(_SpyClient.calls) == 1

    def test_an_unknown_file_id_is_not_found(self, two_drives):
        response = _get_thing(two_drives, "nosuchfile01")

        assert response.status_code == 404
        assert _SpyClient.calls == []

    def test_the_two_refusals_are_indistinguishable(self, two_drives):
        """No oracle: a caller must not be able to tell "no such file" from
        "a file you may not see", or the addon surface becomes a way to
        enumerate the contents of a locked drive."""
        unknown = _get_thing(two_drives, "nosuchfile01")
        forbidden = _get_thing(two_drives, "secret000001")

        assert unknown.status_code == forbidden.status_code
        assert unknown.json() == forbidden.json()


class TestFeatureGateWithoutADrive:
    def test_a_drive_optional_route_is_not_found_without_a_drive(self, two_drives):
        """``drive_optional`` waives the blanket ``X-Lit-Drive`` requirement,
        so the per-drive feature gate is the only thing left. It cannot decide
        a per-drive policy with no drive, and answers 404 rather than falling
        open — 404 and not 403, so a route disabled by policy is not revealed
        by asking for it."""
        response = two_drives.get(f"/api/addons/{ADDON}/gated")

        assert response.status_code == 404
        assert _SpyClient.calls == []

    def test_the_same_route_answers_with_a_drive(self, two_drives):
        """Positive control for the gate above."""
        response = two_drives.get(
            f"/api/addons/{ADDON}/gated", headers={"X-Lit-Drive": OPEN_DRIVE},
        )

        assert response.status_code == 200
        assert len(_SpyClient.calls) == 1
