"""Admin endpoints + addon_proxy admin pre_check enforcement."""

import json

import pytest

import app.config as config
from app.services import addon_registry


@pytest.fixture()
def two_drive_setup(tmp_path, monkeypatch):
    """One public drive, one protected drive (group=secret)."""
    drives = tmp_path / "drives.json"
    drives.write_text(json.dumps([
        {"name": "open", "path": str(tmp_path / "open")},
        {"name": "vault", "path": str(tmp_path / "vault"),
         "access_group": "secret"},
    ]))
    pwds = tmp_path / "passwords.json"
    pwds.write_text(json.dumps([
        {"password": "shh", "groups": ["secret"]},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives)
    monkeypatch.setattr(config, "_drives_cache", None)
    import app.auth as auth
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", pwds)
    monkeypatch.setattr(auth, "_passwords_cache", None)
    yield
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(auth, "_passwords_cache", None)


def test_admin_dashboard_public_when_no_protected_drives(client):
    """Default test fixture has no passwords.json — every caller is admin."""
    c, _, _, _ = client
    resp = c.get("/api/admin/dashboard")
    assert resp.status_code == 200


def test_admin_dashboard_403_without_unlock(two_drive_setup):
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        resp = c.get("/api/admin/dashboard")
    assert resp.status_code == 403


def test_admin_dashboard_200_when_unlocked(two_drive_setup):
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        unlock = c.post("/api/auth/unlock", json={"password": "shh"})
        assert unlock.status_code == 200
        resp = c.get("/api/admin/dashboard")
    assert resp.status_code == 403 if unlock.status_code != 200 else resp.status_code == 200


# ---------------------------------------------------------------------------
# addon_proxy admin pre_check
# ---------------------------------------------------------------------------


def _register_admin_addon():
    addon_registry._registry["_admintest"] = {
        "label": "AdminTest",
        "icon": "x",
        "type": "external_service",
        "scope": "drive",
        "href": "/drive/{drive}/addons/_admintest",
        "proxy": {
            "target_default": "http://_admintest:9999",
            "routes": [
                {
                    "path": "/status",
                    "methods": ["GET"],
                    "drive_optional": True,
                    "pre_check": {"type": "admin"},
                },
            ],
        },
    }


def _restore_registry(snap):
    addon_registry._registry.clear()
    addon_registry._registry.update(snap)


def test_addon_proxy_admin_precheck_403_without_admin(two_drive_setup):
    snap = dict(addon_registry._registry)
    try:
        _register_admin_addon()
        from fastapi.testclient import TestClient
        from app.main import app
        with TestClient(app) as c:
            resp = c.get("/api/addons/_admintest/status")
        assert resp.status_code == 403
    finally:
        _restore_registry(snap)


def test_addon_proxy_admin_precheck_passes_in_public_mode(client):
    """No protected drives → everyone is admin → addon admin pre_check passes."""
    c, _, _, _ = client
    snap = dict(addon_registry._registry)
    try:
        _register_admin_addon()
        # Don't actually proxy to a real upstream — match the route then
        # let the request fail at network level (502). We only care that
        # the pre_check does NOT 403 here.
        resp = c.get("/api/addons/_admintest/status")
        assert resp.status_code != 403
    finally:
        _restore_registry(snap)
