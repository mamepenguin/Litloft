"""Tests for /api/admin/config/* endpoints (admin config GUI feature).

Spec: docs/superpowers/specs/2026-04-30-config-gui.md

These tests are written BEFORE the router exists (TDD RED phase).
The router will live at backend/app/routers/admin_config.py and is
guarded by `auth.require_admin` (already in auth.py).

Validation rules (Y mode — all errors, no warnings):
1. JSON syntax  → 400  {code: "json_syntax"}
2. Required fields missing → 422 {code: "missing_field"}
3. Drive name duplicates → 422 {code: "duplicate_name"}
4. Path not absolute → 422 {code: "not_absolute_path"}
5. Path not isdir → 422 {code: "path_not_found"}
6. passwords.groups[] references unknown group → 422 {code: "unknown_group"}
7. Duplicate password values → 422 {code: "duplicate_password"}
8. Unknown addon name → 422 {code: "unknown_addon"}

The new sentinel/flag paths:
- data/setup_completed
- data/restart_pending
- drives.json.bak / passwords.json.bak (single-generation backups)
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def admin_setup(tmp_path, monkeypatch):
    """drives.json + passwords.json with one master password covering all groups.

    Returns dict with paths and the master password so tests can unlock.
    """
    import app.config as config
    import app.auth as auth

    drive_a = tmp_path / "drive_a"
    drive_b = tmp_path / "drive_b"
    drive_a.mkdir()
    drive_b.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"
    drives_json.write_text(
        json.dumps(
            [
                {
                    "name": "alpha",
                    "path": str(drive_a),
                    "access_group": "g1",
                },
                {
                    "name": "beta",
                    "path": str(drive_b),
                    "access_group": "g2",
                    "addons": {"intelligence": False},
                },
            ]
        )
    )

    passwords_json = tmp_path / "passwords.json"
    passwords_json.write_text(
        json.dumps(
            [
                {"password": "master-pw", "groups": ["g1", "g2"]},
                {"password": "alpha-only", "groups": ["g1"]},
            ]
        )
    )

    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_json)
    monkeypatch.setattr(auth, "_passwords_cache", None)

    yield {
        "drives_json": drives_json,
        "passwords_json": passwords_json,
        "data_dir": data_dir,
        "drive_a": drive_a,
        "drive_b": drive_b,
        "master_pw": "master-pw",
        "non_master_pw": "alpha-only",
    }

    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(auth, "_passwords_cache", None)


def _reset_setup_sentinel(admin_setup):
    """Delete the setup_completed sentinel created by lifespan startup.

    The fixture pre-creates drives.json, so the corrected migration in
    ``main.lifespan`` (which touches the sentinel whenever drives.json
    exists, regardless of passwords.json state) fires before each test.
    Tests that exercise ``setup-status`` semantics or first-run wizard
    flows need the sentinel absent at the start of the test body.
    """
    sentinel = admin_setup["data_dir"] / "setup_completed"
    if sentinel.exists():
        sentinel.unlink()


@pytest.fixture()
def admin_client(admin_setup):
    """TestClient unlocked with the master password."""
    from app.main import app

    with TestClient(app) as c:
        _reset_setup_sentinel(admin_setup)
        resp = c.post("/api/auth/unlock", json={"password": admin_setup["master_pw"]})
        assert resp.status_code == 200, resp.text
        yield c, admin_setup


@pytest.fixture()
def non_admin_client(admin_setup):
    """TestClient unlocked with a partial-access password (not admin).

    Sentinel is left in place (lifespan creates it) so the first-run
    bypass on write endpoints does NOT apply — the admin gate fires and
    a non-admin viewer gets 403. Without the sentinel, the bypass would
    let any caller through and the auth-gate assertions would fail.
    """
    from app.main import app

    with TestClient(app) as c:
        sentinel = admin_setup["data_dir"] / "setup_completed"
        sentinel.parent.mkdir(parents=True, exist_ok=True)
        sentinel.touch()
        resp = c.post(
            "/api/auth/unlock", json={"password": admin_setup["non_master_pw"]}
        )
        assert resp.status_code == 200, resp.text
        yield c, admin_setup


@pytest.fixture()
def anonymous_client(admin_setup):
    """TestClient with no unlock cookie.

    Sentinel is left in place so the admin gate fires on GETs and on
    write endpoints (which would otherwise hit the first-run bypass).
    Tests of first-run bypass behaviour explicitly delete the sentinel
    in their own setup.
    """
    from app.main import app

    with TestClient(app) as c:
        sentinel = admin_setup["data_dir"] / "setup_completed"
        sentinel.parent.mkdir(parents=True, exist_ok=True)
        sentinel.touch()
        yield c, admin_setup


@pytest.fixture()
def admin_client_with_sentinel(admin_setup):
    """TestClient unlocked with master password, sentinel present.

    Use this when the test needs ``require_admin`` semantics to apply to
    write endpoints (i.e. first-run bypass should be closed). Lifespan
    startup creates the sentinel because drives.json exists; we leave it
    in place rather than deleting it.
    """
    from app.main import app

    with TestClient(app) as c:
        sentinel = admin_setup["data_dir"] / "setup_completed"
        sentinel.parent.mkdir(parents=True, exist_ok=True)
        sentinel.touch()
        resp = c.post("/api/auth/unlock", json={"password": admin_setup["master_pw"]})
        assert resp.status_code == 200, resp.text
        yield c, admin_setup


# ---------------------------------------------------------------------------
# Auth gate tests
# ---------------------------------------------------------------------------


def test_get_drives_403_without_admin(anonymous_client):
    c, _ = anonymous_client
    resp = c.get("/api/admin/config/drives")
    assert resp.status_code == 403


def test_get_drives_403_for_non_admin_viewer(non_admin_client):
    c, _ = non_admin_client
    resp = c.get("/api/admin/config/drives")
    assert resp.status_code == 403


def test_get_drives_200_with_admin(admin_client):
    c, _ = admin_client
    resp = c.get("/api/admin/config/drives")
    assert resp.status_code == 200


def test_get_drives_200_when_no_passwords_json(client):
    """Default test fixture has no passwords.json → everyone is admin."""
    c, _, _, _ = client
    resp = c.get("/api/admin/config/drives")
    assert resp.status_code == 200


def test_setup_status_no_auth_required(anonymous_client):
    c, _ = anonymous_client
    resp = c.get("/api/admin/config/setup-status")
    assert resp.status_code == 200
    assert "completed" in resp.json()


# ---------------------------------------------------------------------------
# GET endpoints
# ---------------------------------------------------------------------------


def test_get_drives_returns_full_json(admin_client):
    c, ctx = admin_client
    resp = c.get("/api/admin/config/drives")
    assert resp.status_code == 200
    body = resp.json()
    # The response should mirror drives.json (a JSON array of drive entries).
    drives = body if isinstance(body, list) else body.get("drives")
    assert isinstance(drives, list)
    names = [d["name"] for d in drives]
    assert "alpha" in names
    assert "beta" in names


def test_get_passwords_masks_password_values(admin_client):
    c, _ = admin_client
    resp = c.get("/api/admin/config/passwords")
    assert resp.status_code == 200
    body = resp.json()
    entries = body if isinstance(body, list) else body.get("passwords")
    assert isinstance(entries, list)
    assert len(entries) == 2
    for entry in entries:
        # Real password value must NEVER leak through GET.
        assert entry.get("password") == "***"
        # Groups remain visible.
        assert isinstance(entry.get("groups"), list)
        assert len(entry["groups"]) >= 1
    # Sanity: master entry still has both groups.
    all_groups = {tuple(sorted(e["groups"])) for e in entries}
    assert ("g1", "g2") in all_groups


def test_get_addon_policy_returns_addons_portion(admin_client):
    c, _ = admin_client
    resp = c.get("/api/admin/config/addon-policy")
    assert resp.status_code == 200
    body = resp.json()
    # Expected shape: { "<drive_name>": {<addon_name>: bool|dict} }
    assert isinstance(body, dict)
    # `beta` had {"intelligence": False}; `alpha` had no addons key.
    beta_policy = body.get("beta", {})
    assert beta_policy.get("intelligence") is False
    # Drives without addons should appear (possibly empty dict) so the
    # GUI can show them.
    assert "alpha" in body


def test_get_restart_status_pending_false_initially(admin_client):
    c, _ = admin_client
    resp = c.get("/api/admin/config/restart-status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["pending"] is False
    assert body.get("files") == []


def test_get_restart_status_pending_true_after_put(admin_client):
    c, ctx = admin_client
    new_drives = [
        {"name": "alpha", "path": str(ctx["drive_a"]), "access_group": "g1"},
        {"name": "beta", "path": str(ctx["drive_b"]), "access_group": "g2"},
    ]
    put = c.put("/api/admin/config/drives", json=new_drives)
    assert put.status_code == 200, put.text
    resp = c.get("/api/admin/config/restart-status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["pending"] is True
    files = body.get("files", [])
    assert any(f.get("name") == "drives.json" for f in files)


def test_get_setup_status_completed_false_initially(admin_client):
    c, _ = admin_client
    resp = c.get("/api/admin/config/setup-status")
    assert resp.status_code == 200
    assert resp.json()["completed"] is False


def test_get_setup_status_completed_true_after_post_complete_setup(admin_client):
    c, _ = admin_client
    post = c.post("/api/admin/config/complete-setup")
    assert post.status_code == 200, post.text
    resp = c.get("/api/admin/config/setup-status")
    assert resp.status_code == 200
    assert resp.json()["completed"] is True


# ---------------------------------------------------------------------------
# PUT /drives — happy path + validation
# ---------------------------------------------------------------------------


def test_put_drives_happy_path(admin_client):
    c, ctx = admin_client
    new_drives = [
        {"name": "alpha", "path": str(ctx["drive_a"]), "access_group": "g1"},
        {"name": "beta", "path": str(ctx["drive_b"]), "access_group": "g2"},
    ]
    resp = c.put("/api/admin/config/drives", json=new_drives)
    assert resp.status_code == 200, resp.text

    # File rewritten on disk.
    on_disk = json.loads(ctx["drives_json"].read_text())
    assert on_disk == new_drives

    # .bak created with old content.
    bak = ctx["drives_json"].with_suffix(".json.bak")
    assert bak.exists()
    bak_content = json.loads(bak.read_text())
    assert any(d["name"] == "alpha" for d in bak_content)

    # restart_pending flag created in DATA_DIR.
    assert (ctx["data_dir"] / "restart_pending").exists()


def test_put_drives_missing_field_name(admin_client):
    c, ctx = admin_client
    bad = [{"path": str(ctx["drive_a"])}]  # no name
    resp = c.put("/api/admin/config/drives", json=bad)
    assert resp.status_code == 422
    body = resp.json()
    # Pull the error code out of the response (FastAPI wraps with detail).
    detail = body.get("detail", body)
    flat = json.dumps(detail)
    assert "missing_field" in flat


def test_put_drives_missing_field_path(admin_client):
    c, _ = admin_client
    bad = [{"name": "x"}]  # no path
    resp = c.put("/api/admin/config/drives", json=bad)
    assert resp.status_code == 422
    flat = json.dumps(resp.json())
    assert "missing_field" in flat


def test_put_drives_duplicate_name(admin_client):
    c, ctx = admin_client
    bad = [
        {"name": "dup", "path": str(ctx["drive_a"])},
        {"name": "dup", "path": str(ctx["drive_b"])},
    ]
    resp = c.put("/api/admin/config/drives", json=bad)
    assert resp.status_code == 422
    flat = json.dumps(resp.json())
    assert "duplicate_name" in flat


def test_put_drives_not_absolute_path(admin_client):
    c, _ = admin_client
    bad = [{"name": "rel", "path": "relative/path"}]
    resp = c.put("/api/admin/config/drives", json=bad)
    assert resp.status_code == 422
    flat = json.dumps(resp.json())
    assert "not_absolute_path" in flat


def test_put_drives_path_not_found(admin_client, tmp_path):
    c, _ = admin_client
    nonexistent = tmp_path / "definitely_does_not_exist_xyz"
    bad = [{"name": "ghost", "path": str(nonexistent)}]
    resp = c.put("/api/admin/config/drives", json=bad)
    assert resp.status_code == 422
    flat = json.dumps(resp.json())
    assert "path_not_found" in flat


# ---------------------------------------------------------------------------
# PUT /passwords — happy path + validation
# ---------------------------------------------------------------------------


def test_put_passwords_happy_path(admin_client):
    c, ctx = admin_client
    new_pwds = [
        {"password": "new-master", "groups": ["g1", "g2"]},
        {"password": "g1-only", "groups": ["g1"]},
    ]
    resp = c.put("/api/admin/config/passwords", json=new_pwds)
    assert resp.status_code == 200, resp.text

    on_disk = json.loads(ctx["passwords_json"].read_text())
    assert on_disk == new_pwds

    bak = ctx["passwords_json"].with_suffix(".json.bak")
    assert bak.exists()
    assert (ctx["data_dir"] / "restart_pending").exists()


def test_put_passwords_rejects_masked_value(admin_client):
    """Submitting `***` as the password must NOT be silently accepted.

    The GUI should send the real new password; any `***` passthrough means
    the form leaked the masked GET value back into PUT.
    """
    c, _ = admin_client
    bad = [{"password": "***", "groups": ["g1", "g2"]}]
    resp = c.put("/api/admin/config/passwords", json=bad)
    assert resp.status_code == 422
    flat = json.dumps(resp.json())
    # Either an explicit code or a generic missing_field — just assert
    # that the write is rejected and the body explains why.
    assert "***" in flat or "masked" in flat or "missing_field" in flat


def test_put_passwords_unknown_group_when_no_drive_has_access_group(
    tmp_path, monkeypatch
):
    """When no drive declares access_group, passwords.groups[] must reject every value.

    Previously the validator short-circuited (``if known_groups and ...``)
    when ``known_groups`` was empty, silently letting any group through.
    """
    import app.config as config
    import app.auth as auth
    from app.main import app

    drive_dir = tmp_path / "d"
    drive_dir.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"
    # No access_group on any drive.
    drives_json.write_text(json.dumps([{"name": "d", "path": str(drive_dir)}]))
    passwords_json = tmp_path / "passwords.json"

    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_json)
    monkeypatch.setattr(auth, "_passwords_cache", None)

    with TestClient(app) as c:
        bad = [{"password": "any", "groups": ["g1"]}]
        resp = c.put("/api/admin/config/passwords", json=bad)
        assert resp.status_code == 422, resp.text
        flat = json.dumps(resp.json())
        assert "unknown_group" in flat


def test_append_password_unknown_group_when_no_drive_has_access_group(
    tmp_path, monkeypatch
):
    """Same rule must apply to POST /append."""
    import app.config as config
    import app.auth as auth
    from app.main import app

    drive_dir = tmp_path / "d"
    drive_dir.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"
    drives_json.write_text(json.dumps([{"name": "d", "path": str(drive_dir)}]))
    passwords_json = tmp_path / "passwords.json"
    passwords_json.write_text(json.dumps([]))

    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_json)
    monkeypatch.setattr(auth, "_passwords_cache", None)

    with TestClient(app) as c:
        resp = c.post(
            "/api/admin/config/passwords/append",
            json={"password": "any", "groups": ["g1"]},
        )
        assert resp.status_code == 422, resp.text
        flat = json.dumps(resp.json())
        assert "unknown_group" in flat


def test_put_passwords_unknown_group(admin_client):
    c, _ = admin_client
    bad = [{"password": "x", "groups": ["does_not_exist"]}]
    resp = c.put("/api/admin/config/passwords", json=bad)
    assert resp.status_code == 422
    flat = json.dumps(resp.json())
    assert "unknown_group" in flat


def test_put_passwords_duplicate_password(admin_client):
    c, _ = admin_client
    bad = [
        {"password": "same", "groups": ["g1"]},
        {"password": "same", "groups": ["g2"]},
    ]
    resp = c.put("/api/admin/config/passwords", json=bad)
    assert resp.status_code == 422
    flat = json.dumps(resp.json())
    assert "duplicate_password" in flat


# ---------------------------------------------------------------------------
# POST /passwords/append — incremental add
# ---------------------------------------------------------------------------


def test_append_password_happy_path(admin_client):
    """Adding a new password via POST /append leaves existing entries untouched."""
    c, ctx = admin_client
    resp = c.post(
        "/api/admin/config/passwords/append",
        json={"password": "fresh-pw", "groups": ["g1"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["count"] == 3

    on_disk = json.loads(ctx["passwords_json"].read_text())
    assert len(on_disk) == 3
    # Original two entries still intact.
    pw_values = [e["password"] for e in on_disk]
    assert "master-pw" in pw_values
    assert "alpha-only" in pw_values
    assert "fresh-pw" in pw_values
    # Newly appended entry is the last one.
    assert on_disk[-1] == {"password": "fresh-pw", "groups": ["g1"]}


def test_append_password_unknown_group(admin_client):
    """Appending with a group not in drives.json → 422 unknown_group."""
    c, _ = admin_client
    resp = c.post(
        "/api/admin/config/passwords/append",
        json={"password": "x-pw", "groups": ["does_not_exist"]},
    )
    assert resp.status_code == 422
    flat = json.dumps(resp.json())
    assert "unknown_group" in flat


def test_append_password_duplicate(admin_client):
    """Appending a password value that already exists → 422 duplicate_password."""
    c, _ = admin_client
    resp = c.post(
        "/api/admin/config/passwords/append",
        json={"password": "master-pw", "groups": ["g1"]},
    )
    assert resp.status_code == 422
    flat = json.dumps(resp.json())
    assert "duplicate_password" in flat


def test_append_password_masked_rejection(admin_client):
    """Appending {password: '***', ...} → 422 masked_password."""
    c, _ = admin_client
    resp = c.post(
        "/api/admin/config/passwords/append",
        json={"password": "***", "groups": ["g1"]},
    )
    assert resp.status_code == 422
    flat = json.dumps(resp.json())
    assert "masked" in flat or "***" in flat or "missing_field" in flat


def test_append_password_403_without_admin(non_admin_client):
    """Non-admin viewer cannot append."""
    c, _ = non_admin_client
    resp = c.post(
        "/api/admin/config/passwords/append",
        json={"password": "should-not-stick", "groups": ["g1"]},
    )
    assert resp.status_code == 403


def test_append_password_touches_restart_flag(admin_client):
    """Successful append creates data/restart_pending."""
    c, ctx = admin_client
    flag = ctx["data_dir"] / "restart_pending"
    if flag.exists():
        flag.unlink()
    resp = c.post(
        "/api/admin/config/passwords/append",
        json={"password": "restart-test", "groups": ["g2"]},
    )
    assert resp.status_code == 200, resp.text
    assert flag.exists()


# ---------------------------------------------------------------------------
# DELETE /passwords/{index} — incremental remove
# ---------------------------------------------------------------------------


def test_delete_password_happy_path(admin_client):
    """DELETE /passwords/0 removes entry at index 0; remaining entries preserved."""
    c, ctx = admin_client
    resp = c.delete("/api/admin/config/passwords/0")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["count"] == 1

    on_disk = json.loads(ctx["passwords_json"].read_text())
    assert len(on_disk) == 1
    # The first entry (master-pw) was removed; alpha-only remains.
    assert on_disk[0]["password"] == "alpha-only"


def test_delete_password_out_of_range_404(admin_client):
    """DELETE /passwords/99 → 404."""
    c, _ = admin_client
    resp = c.delete("/api/admin/config/passwords/99")
    assert resp.status_code == 404


def test_delete_password_403_without_admin(non_admin_client):
    """Non-admin viewer cannot delete."""
    c, _ = non_admin_client
    resp = c.delete("/api/admin/config/passwords/0")
    assert resp.status_code == 403


def test_delete_password_touches_restart_flag(admin_client):
    """Successful delete creates data/restart_pending."""
    c, ctx = admin_client
    flag = ctx["data_dir"] / "restart_pending"
    if flag.exists():
        flag.unlink()
    resp = c.delete("/api/admin/config/passwords/1")
    assert resp.status_code == 200, resp.text
    assert flag.exists()


# ---------------------------------------------------------------------------
# PUT /addon-policy — happy path + validation
# ---------------------------------------------------------------------------


def test_put_addon_policy_happy_path(admin_client, monkeypatch):
    c, ctx = admin_client

    # Mock the addon registry so "intelligence" appears installed.
    from app.services import addon_registry

    snap = dict(addon_registry._registry)
    addon_registry._registry["intelligence"] = {
        "label": "Intelligence",
        "icon": "x",
        "type": "external_service",
        "scope": "drive",
    }
    try:
        new_policy = {
            "alpha": {"intelligence": True},
            "beta": {"intelligence": False},
        }
        resp = c.put("/api/admin/config/addon-policy", json=new_policy)
        assert resp.status_code == 200, resp.text

        # The drives.json was rewritten with addons portion merged.
        on_disk = json.loads(ctx["drives_json"].read_text())
        by_name = {d["name"]: d for d in on_disk}
        assert by_name["alpha"]["addons"]["intelligence"] is True
        assert by_name["beta"]["addons"]["intelligence"] is False

        # restart_pending touched.
        assert (ctx["data_dir"] / "restart_pending").exists()
    finally:
        addon_registry._registry.clear()
        addon_registry._registry.update(snap)


def test_put_addon_policy_unknown_addon(admin_client):
    c, _ = admin_client
    from app.services import addon_registry

    snap = dict(addon_registry._registry)
    # Clear registry so any addon name is considered unknown.
    addon_registry._registry.clear()
    try:
        bad = {"alpha": {"nonexistent_addon": True}}
        resp = c.put("/api/admin/config/addon-policy", json=bad)
        assert resp.status_code == 422
        flat = json.dumps(resp.json())
        assert "unknown_addon" in flat
    finally:
        addon_registry._registry.clear()
        addon_registry._registry.update(snap)


def test_put_addon_policy_unknown_drive(admin_client):
    """A top-level drive name not in drives.json must be rejected.

    Without this guard the merge loop in put_addon_policy silently drops
    the policy and returns ``{"ok": true}`` despite the change being a no-op.
    """
    c, _ = admin_client
    from app.services import addon_registry

    snap = dict(addon_registry._registry)
    addon_registry._registry["intelligence"] = {
        "label": "Intelligence",
        "icon": "x",
        "type": "external_service",
        "scope": "drive",
    }
    try:
        bad = {"nonexistent_drive": {"intelligence": True}}
        resp = c.put("/api/admin/config/addon-policy", json=bad)
        assert resp.status_code == 422
        flat = json.dumps(resp.json())
        assert "unknown_drive" in flat
    finally:
        addon_registry._registry.clear()
        addon_registry._registry.update(snap)


# ---------------------------------------------------------------------------
# Atomic write + .bak behaviour
# ---------------------------------------------------------------------------


def test_put_drives_creates_bak(admin_client):
    c, ctx = admin_client
    original = ctx["drives_json"].read_text()
    new_drives = [
        {"name": "alpha", "path": str(ctx["drive_a"]), "access_group": "g1"},
        {"name": "beta", "path": str(ctx["drive_b"]), "access_group": "g2"},
    ]
    resp = c.put("/api/admin/config/drives", json=new_drives)
    assert resp.status_code == 200, resp.text
    bak = ctx["drives_json"].with_suffix(".json.bak")
    assert bak.exists()
    assert bak.read_text() == original


def test_put_drives_no_bak_when_no_existing(tmp_path, monkeypatch):
    """If drives.json doesn't exist at PUT time, no .bak should be created."""
    import app.config as config
    import app.auth as auth
    from app.main import app

    drive_dir = tmp_path / "d1"
    drive_dir.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"  # NOT created on disk yet
    # passwords.json absent → public/admin mode.
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(
        auth, "PASSWORDS_CONFIG", tmp_path / "no_passwords.json"
    )
    monkeypatch.setattr(auth, "_passwords_cache", None)

    with TestClient(app) as c:
        new_drives = [{"name": "fresh", "path": str(drive_dir)}]
        resp = c.put("/api/admin/config/drives", json=new_drives)
        assert resp.status_code == 200, resp.text

    bak = drives_json.with_suffix(".json.bak")
    assert not bak.exists()
    assert drives_json.exists()  # but the new file was written


def test_put_drives_atomic_on_failure(admin_client, monkeypatch):
    """If os.replace fails mid-write, drives.json must remain unchanged
    and the .tmp file must be cleaned up."""
    c, ctx = admin_client
    original = ctx["drives_json"].read_text()

    real_replace = os.replace

    def boom(src, dst):
        raise OSError("disk full (simulated)")

    monkeypatch.setattr(os, "replace", boom)

    new_drives = [
        {"name": "alpha", "path": str(ctx["drive_a"])},
        {"name": "beta", "path": str(ctx["drive_b"])},
    ]
    resp = c.put("/api/admin/config/drives", json=new_drives)
    assert resp.status_code >= 500

    # Restore for cleanup steps.
    monkeypatch.setattr(os, "replace", real_replace)

    assert ctx["drives_json"].read_text() == original
    tmp = ctx["drives_json"].with_suffix(".json.tmp")
    assert not tmp.exists(), "leftover .tmp file after failed write"


# ---------------------------------------------------------------------------
# Sentinel migration / restart-pending clear on startup
# ---------------------------------------------------------------------------


def test_startup_creates_sentinel_when_drives_exists_no_sentinel(
    tmp_path, monkeypatch
):
    """Existing user upgrade path: drives.json present, no sentinel → sentinel created."""
    import app.config as config
    import app.auth as auth
    from app.main import app

    drive_dir = tmp_path / "d"
    drive_dir.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"
    drives_json.write_text(json.dumps([{"name": "d", "path": str(drive_dir)}]))

    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(
        auth, "PASSWORDS_CONFIG", tmp_path / "absent_passwords.json"
    )
    monkeypatch.setattr(auth, "_passwords_cache", None)

    sentinel = data_dir / "setup_completed"
    assert not sentinel.exists()

    with TestClient(app):
        pass  # Lifespan startup runs.

    assert sentinel.exists(), "startup must create sentinel for existing users"


def test_startup_does_not_create_sentinel_when_drives_missing(
    tmp_path, monkeypatch
):
    """Fresh install path: no drives.json → no sentinel after startup."""
    import app.config as config
    import app.auth as auth
    from app.main import app

    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"  # absent on disk
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(
        auth, "PASSWORDS_CONFIG", tmp_path / "absent_passwords.json"
    )
    monkeypatch.setattr(auth, "_passwords_cache", None)

    sentinel = data_dir / "setup_completed"
    assert not sentinel.exists()

    try:
        with TestClient(app):
            pass
    except Exception:
        # If startup chokes on missing drives.json, that's fine for this
        # test — the assertion below is what we care about.
        pass

    assert not sentinel.exists()


def test_startup_clears_restart_pending_flag(tmp_path, monkeypatch):
    """A pre-existing restart_pending flag must be removed on startup."""
    import app.config as config
    import app.auth as auth
    from app.main import app

    drive_dir = tmp_path / "d"
    drive_dir.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"
    drives_json.write_text(json.dumps([{"name": "d", "path": str(drive_dir)}]))

    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(
        auth, "PASSWORDS_CONFIG", tmp_path / "absent_passwords.json"
    )
    monkeypatch.setattr(auth, "_passwords_cache", None)

    flag = data_dir / "restart_pending"
    flag.touch()
    assert flag.exists()

    with TestClient(app):
        pass

    assert not flag.exists(), "startup must clear restart_pending flag"


# ---------------------------------------------------------------------------
# POST /complete-setup
# ---------------------------------------------------------------------------


def test_post_complete_setup_creates_sentinel(admin_client):
    c, ctx = admin_client
    sentinel = ctx["data_dir"] / "setup_completed"
    # admin_setup didn't create it; ensure it's absent.
    if sentinel.exists():
        sentinel.unlink()
    resp = c.post("/api/admin/config/complete-setup")
    assert resp.status_code == 200, resp.text
    assert sentinel.exists()


def test_post_complete_setup_409_when_already_completed(admin_client):
    c, ctx = admin_client
    sentinel = ctx["data_dir"] / "setup_completed"
    sentinel.touch()
    resp = c.post("/api/admin/config/complete-setup")
    assert resp.status_code == 409


def test_post_complete_setup_no_auth_required(anonymous_client):
    """First-run wizard must be callable BEFORE admin exists."""
    c, ctx = anonymous_client
    sentinel = ctx["data_dir"] / "setup_completed"
    if sentinel.exists():
        sentinel.unlink()
    resp = c.post("/api/admin/config/complete-setup")
    # Must NOT be 403 — wizard runs before any admin viewer exists.
    assert resp.status_code != 403
    assert resp.status_code in (200, 409)


def test_startup_migration_fires_when_drives_exists_and_passwords_exists(
    tmp_path, monkeypatch
):
    """An existing user with both drives.json AND passwords.json gets the
    sentinel auto-created on startup.

    Before the C2 fix the migration only fired when passwords.json was
    absent, which incorrectly excluded users who had set up protected mode
    before this feature shipped — they got redirected to /setup and their
    config was overwritten.
    """
    import app.config as config
    import app.auth as auth
    from app.main import app

    drive_dir = tmp_path / "d"
    drive_dir.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"
    drives_json.write_text(
        json.dumps([{"name": "d", "path": str(drive_dir), "access_group": "g1"}])
    )
    passwords_json = tmp_path / "passwords.json"
    passwords_json.write_text(
        json.dumps([{"password": "pw", "groups": ["g1"]}])
    )

    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_json)
    monkeypatch.setattr(auth, "_passwords_cache", None)

    sentinel = data_dir / "setup_completed"
    assert not sentinel.exists()

    with TestClient(app):
        pass  # Lifespan startup runs.

    assert sentinel.exists(), (
        "startup must create sentinel for existing users with BOTH drives.json "
        "and passwords.json (the legacy protected-mode case)"
    )


# ---------------------------------------------------------------------------
# First-run admin bypass — write endpoints must work before any admin exists
# ---------------------------------------------------------------------------


def test_put_drives_no_auth_required_during_first_run(tmp_path, monkeypatch):
    """When sentinel is absent, PUT /drives works without unlock.

    The wizard's first PUT establishes drive access_groups. After that
    point a strict require_admin would lock the user out before they
    can supply a password; the bypass closes only when the wizard
    touches the sentinel.
    """
    import app.config as config
    import app.auth as auth
    from app.main import app

    drive_dir = tmp_path / "d"
    drive_dir.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    # passwords.json with one entry → admin gate would normally apply.
    drives_json = tmp_path / "drives.json"  # absent on disk so sentinel won't auto-create
    passwords_json = tmp_path / "passwords.json"
    passwords_json.write_text(
        json.dumps([{"password": "secret", "groups": ["g1"]}])
    )

    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_json)
    monkeypatch.setattr(auth, "_passwords_cache", None)

    sentinel = data_dir / "setup_completed"
    assert not sentinel.exists()

    with TestClient(app) as c:
        # Anonymous client. No /unlock call.
        new_drives = [
            {"name": "d", "path": str(drive_dir), "access_group": "g1"}
        ]
        resp = c.put("/api/admin/config/drives", json=new_drives)
        assert resp.status_code == 200, resp.text


def test_put_drives_requires_admin_after_setup_completed(
    admin_setup, monkeypatch
):
    """When sentinel exists, PUT /drives requires admin again.

    The bypass closes the moment the sentinel is touched; from that
    point on require_admin semantics resume.
    """
    from app.main import app

    sentinel = admin_setup["data_dir"] / "setup_completed"
    sentinel.parent.mkdir(parents=True, exist_ok=True)
    sentinel.touch()

    with TestClient(app) as c:
        # Anonymous client (no unlock cookie).
        new_drives = [
            {
                "name": "alpha",
                "path": str(admin_setup["drive_a"]),
                "access_group": "g1",
            }
        ]
        resp = c.put("/api/admin/config/drives", json=new_drives)
        assert resp.status_code == 403


def test_put_passwords_no_auth_required_during_first_run(tmp_path, monkeypatch):
    """When sentinel is absent, PUT /passwords works without unlock.

    This is the second wizard step — drives.json was just written with
    access_groups, so require_admin would fail without this bypass.
    """
    import app.config as config
    import app.auth as auth
    from app.main import app

    drive_dir = tmp_path / "d"
    drive_dir.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"
    drives_json.write_text(
        json.dumps([{"name": "d", "path": str(drive_dir), "access_group": "g1"}])
    )
    passwords_json = tmp_path / "passwords.json"  # absent on disk

    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_json)
    monkeypatch.setattr(auth, "_passwords_cache", None)

    # Lifespan would touch the sentinel because drives.json exists. Delete it
    # post-startup to put us back in first-run mode (simulating a wizard
    # mid-flight on a clean install where the lifespan migration didn't fire).
    with TestClient(app) as c:
        sentinel = data_dir / "setup_completed"
        if sentinel.exists():
            sentinel.unlink()

        bad_pwds = [{"password": "p1", "groups": ["g1"]}]
        resp = c.put("/api/admin/config/passwords", json=bad_pwds)
        assert resp.status_code == 200, resp.text
