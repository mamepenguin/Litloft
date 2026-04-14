import json


def test_drive_policy_default_returns_default_true(client):
    c, _, _, _ = client
    resp = c.get("/api/internal/drive-policy", params={
        "drive": "test-drive", "addon": "intelligence"
    })
    assert resp.status_code == 200
    assert resp.json() == {"default": True, "features": {}}


def test_drive_policy_unknown_drive_returns_404(client):
    c, _, _, _ = client
    resp = c.get("/api/internal/drive-policy", params={
        "drive": "no-such-drive", "addon": "intelligence"
    })
    assert resp.status_code == 404


def test_drive_policy_bool_shorthand(tmp_path, monkeypatch):
    """Bool shorthand surfaces as default=False, no features."""
    import app.config as config
    path = tmp_path / "drives.json"
    path.write_text(json.dumps([
        {"name": "off", "path": str(tmp_path / "off"),
         "addons": {"intelligence": False}},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", path)
    monkeypatch.setattr(config, "_drives_cache", None)

    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        resp = c.get("/api/internal/drive-policy", params={
            "drive": "off", "addon": "intelligence",
        })
    monkeypatch.setattr(config, "_drives_cache", None)
    assert resp.status_code == 200
    assert resp.json() == {"default": False, "features": {}}


def test_drive_policy_per_feature_dict(tmp_path, monkeypatch):
    import app.config as config
    path = tmp_path / "drives.json"
    path.write_text(json.dumps([
        {"name": "fine", "path": str(tmp_path / "fine"),
         "addons": {"intelligence": {
             "index": True, "search": True,
             "auto_tags": False, "rag": False,
         }}},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", path)
    monkeypatch.setattr(config, "_drives_cache", None)

    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        resp = c.get("/api/internal/drive-policy", params={
            "drive": "fine", "addon": "intelligence",
        })
    monkeypatch.setattr(config, "_drives_cache", None)
    assert resp.status_code == 200
    body = resp.json()
    assert body["default"] is True
    assert body["features"]["index"] is True
    assert body["features"]["auto_tags"] is False
    assert body["features"]["rag"] is False
