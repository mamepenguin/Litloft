"""/api/addons/status drive-aware filtering."""

import json

from app.services import addon_registry


def _register_test_addon(name: str, **slots):
    addon_registry._registry[name] = {
        "label": name,
        "icon": "x",
        "type": "external_service",
        "scope": "drive",
        "href": f"/drive/{{drive}}/addons/{name}",
        "slots": slots or {},
    }


def _register_configured_service_addon(name: str, target_env: str, **slots):
    addon_registry._registry[name] = {
        "label": name,
        "icon": "x",
        "type": "external_service",
        "scope": "drive",
        "href": f"/drive/{{drive}}/addons/{name}",
        "proxy": {
            "target_env": target_env,
            "target_default": f"http://{name}:9999",
            "routes": [],
        },
        "slots": slots or {},
    }


def _restore_registry(snapshot):
    addon_registry._registry.clear()
    addon_registry._registry.update(snapshot)


def test_status_surfaces_manifest_description(client):
    """Regression: the manifest `description` must reach the frontend.

    `_FRONTEND_FIELDS` previously omitted "description", so the addon
    enable/disable UI always showed a "no description" fallback. The
    allowlist must pass `description` through.
    """
    c, _, _, _ = client
    snap = dict(addon_registry._registry)
    try:
        addon_registry._registry["descaddon"] = {
            "label": "Desc Addon",
            "description": "Does a useful thing.",
            "icon": "x",
            "type": "external_service",
            "scope": "drive",
            "href": "/drive/{drive}/addons/descaddon",
            "slots": {},
        }
        resp = c.get("/api/addons/status")
        assert resp.status_code == 200
        entry = resp.json()["addons"]["descaddon"]
        assert entry["description"] == "Does a useful thing."
    finally:
        _restore_registry(snap)


def test_no_drive_returns_full_catalogue(client):
    c, _, _, _ = client
    snap = dict(addon_registry._registry)
    try:
        _register_test_addon(
            "fakeintel",
            **{"file-detail-sections": [
                {"id": "x", "label": "X", "priority": 10}
            ]},
        )
        resp = c.get("/api/addons/status")
        assert resp.status_code == 200
        body = resp.json()
        assert "fakeintel" in body["addons"]
        assert any(
            entry["addonName"] == "fakeintel"
            for entry in body["slots"].get("file-detail-sections", [])
        )
    finally:
        _restore_registry(snap)


def test_status_hides_unconfigured_external_service(client, monkeypatch):
    """A manifest alone is not enough to expose service-backed addons.

    configure.py wires INTELLIGENCE_SERVICE_URL / KNOWLEDGE_SERVICE_URL
    only when the corresponding compose service exists. Without that env,
    /setup must not offer a policy toggle that cannot start the service or
    add its Docker mounts.
    """
    c, _, _, _ = client
    monkeypatch.delenv("FAKE_SERVICE_URL", raising=False)
    snap = dict(addon_registry._registry)
    try:
        _register_configured_service_addon(
            "fakesvc",
            "FAKE_SERVICE_URL",
            **{"file-detail-sections": [
                {"id": "svc", "label": "Svc", "priority": 10}
            ]},
        )
        resp = c.get("/api/addons/status")
        assert resp.status_code == 200
        body = resp.json()
        assert "fakesvc" not in body["addons"]
        assert "file-detail-sections" not in body["slots"]
    finally:
        _restore_registry(snap)


def test_status_keeps_configured_external_service(client, monkeypatch):
    c, _, _, _ = client
    monkeypatch.setenv("FAKE_SERVICE_URL", "http://fakesvc:9999")
    snap = dict(addon_registry._registry)
    try:
        _register_configured_service_addon(
            "fakesvc",
            "FAKE_SERVICE_URL",
            **{"file-detail-sections": [
                {"id": "svc", "label": "Svc", "priority": 10}
            ]},
        )
        resp = c.get("/api/addons/status")
        assert resp.status_code == 200
        body = resp.json()
        assert "fakesvc" in body["addons"]
        assert any(
            entry["addonName"] == "fakesvc"
            for entry in body["slots"].get("file-detail-sections", [])
        )
    finally:
        _restore_registry(snap)


def test_drive_filter_drops_addon_when_index_disabled(tmp_path, monkeypatch):
    import app.config as config
    drives_path = tmp_path / "drives.json"
    drives_path.write_text(json.dumps([
        {"name": "off", "path": str(tmp_path / "off"),
         "addons": {"fakeintel": False}},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_path)
    monkeypatch.setattr(config, "_drives_cache", None)

    snap = dict(addon_registry._registry)
    try:
        _register_test_addon(
            "fakeintel",
            **{"file-detail-sections": [
                {"id": "x", "label": "X", "priority": 10}
            ]},
        )
        from fastapi.testclient import TestClient
        from app.main import app
        with TestClient(app) as c:
            resp = c.get("/api/addons/status", params={"drive": "off"})
            assert resp.status_code == 200
            body = resp.json()
            assert "fakeintel" not in body["addons"]
            assert "file-detail-sections" not in body["slots"]
    finally:
        _restore_registry(snap)
        monkeypatch.setattr(config, "_drives_cache", None)


def test_drive_filter_keeps_addon_when_index_enabled(tmp_path, monkeypatch):
    import app.config as config
    drives_path = tmp_path / "drives.json"
    drives_path.write_text(json.dumps([
        {"name": "on", "path": str(tmp_path / "on"),
         "addons": {"fakeintel": {"index": True, "auto_tags": False}}},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_path)
    monkeypatch.setattr(config, "_drives_cache", None)

    snap = dict(addon_registry._registry)
    try:
        _register_test_addon(
            "fakeintel",
            **{"file-detail-sections": [
                {"id": "x", "label": "X", "priority": 10}
            ]},
        )
        from fastapi.testclient import TestClient
        from app.main import app
        with TestClient(app) as c:
            resp = c.get("/api/addons/status", params={"drive": "on"})
            assert resp.status_code == 200
            body = resp.json()
            # Only the umbrella ``index`` feature gates the addon at
            # the catalogue level; auto_tags=false leaves the slot
            # visible (the worker-side gate handles the rest).
            assert "fakeintel" in body["addons"]
    finally:
        _restore_registry(snap)
        monkeypatch.setattr(config, "_drives_cache", None)


def test_unknown_drive_returns_empty_catalogue(client):
    c, _, _, _ = client
    resp = c.get("/api/addons/status", params={"drive": "no-such-drive"})
    assert resp.status_code == 200
    assert resp.json() == {"addons": {}, "slots": {}}
