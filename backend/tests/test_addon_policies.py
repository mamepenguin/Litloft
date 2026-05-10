"""Tests for the public drive addon-policies endpoint.

Phase 2 (spec 2026-05-10-markdown-document-layout § D4) introduces a public,
read-only endpoint that exposes per-drive addon policy to the frontend so
features like the Knowledge editor can be toggled per drive without leaking
any policy machinery to addons that don't need it.

Endpoint shape (TDD target):

    GET /api/drives/{drive}/addon-policies

    {
      "addons": {
        "<addon_name>": {
          "default": bool,            # bool shorthand or implicit
          "features": { "<feature>": bool, ... }  # empty if no per-feature dict
        }
      }
    }

Access control: piggybacks on the existing accessible_drives logic. Locked
protected drives are hidden as 404 (consistent with .claude/rules/
design-decisions.md "Access control" rule: 404 not 403).

The endpoint lives under ``backend/app/routers/drive_policies.py`` (a public
router). It is intentionally **not** placed under ``routers/internal.py``
because the consumer is the browser, not addons. The Internal API Policy
(R1-R5) therefore does not directly apply, but the design satisfies its
spirit: read-only, generic shape (no addon name in the path/parameters), and
the response is a generic dictionary.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.conftest import TEST_DRIVE


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _rewrite_drives(monkeypatch, tmp_path: Path, drives: list[dict]) -> Path:
    """Atomically rewrite drives.json + reset cache for the duration of a test."""
    import app.config as config

    path = tmp_path / "drives.json"
    path.write_text(json.dumps(drives))
    monkeypatch.setattr(config, "DRIVES_CONFIG", path)
    monkeypatch.setattr(config, "_drives_cache", None)
    return path


# ----------------------------------------------------------------------
# 1. happy path: existing drive, no policy configured -> empty addons dict
# ----------------------------------------------------------------------


class TestAddonPoliciesShape:
    def test_returns_200_with_addons_key(self, client):
        """An accessible drive with no addon policy returns ``addons: {}``."""
        c, _, _, _ = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/addon-policies")
        assert res.status_code == 200
        body = res.json()
        # The top-level shape is always { "addons": {...} } — even when no
        # addons are configured. Generic shape (Internal API Policy R2 spirit).
        assert body == {"addons": {}}

    def test_dict_policy_expands_to_features(self, tmp_path, monkeypatch):
        """``addons.knowledge: {editor: false}`` surfaces under ``features``."""
        drive_dir = tmp_path / "drives" / "fine"
        drive_dir.mkdir(parents=True)
        _rewrite_drives(
            monkeypatch,
            tmp_path,
            [
                {
                    "name": "fine",
                    "path": str(drive_dir),
                    "addons": {
                        "knowledge": {"editor": False, "scanner": True},
                    },
                }
            ],
        )
        from app.main import app

        with TestClient(app) as c:
            res = c.get("/api/drives/fine/addon-policies")
        assert res.status_code == 200
        body = res.json()
        assert "knowledge" in body["addons"]
        knowledge = body["addons"]["knowledge"]
        # ``default`` always exists; with a feature dict it is True
        # (graceful degradation: anything not listed is enabled).
        assert knowledge["default"] is True
        assert knowledge["features"] == {"editor": False, "scanner": True}

    def test_bool_shorthand_collapses_to_default(self, tmp_path, monkeypatch):
        """``addons.knowledge: false`` => ``default: false`` and empty features."""
        drive_dir = tmp_path / "drives" / "off"
        drive_dir.mkdir(parents=True)
        _rewrite_drives(
            monkeypatch,
            tmp_path,
            [
                {
                    "name": "off",
                    "path": str(drive_dir),
                    "addons": {"knowledge": False},
                }
            ],
        )
        from app.main import app

        with TestClient(app) as c:
            res = c.get("/api/drives/off/addon-policies")
        assert res.status_code == 200
        body = res.json()
        assert body["addons"]["knowledge"] == {"default": False, "features": {}}

    def test_bool_true_shorthand_collapses_to_default_true(
        self, tmp_path, monkeypatch
    ):
        """``addons.knowledge: true`` => ``default: true`` (explicit enable)."""
        drive_dir = tmp_path / "drives" / "on"
        drive_dir.mkdir(parents=True)
        _rewrite_drives(
            monkeypatch,
            tmp_path,
            [
                {
                    "name": "on",
                    "path": str(drive_dir),
                    "addons": {"knowledge": True},
                }
            ],
        )
        from app.main import app

        with TestClient(app) as c:
            res = c.get("/api/drives/on/addon-policies")
        assert res.status_code == 200
        body = res.json()
        assert body["addons"]["knowledge"] == {"default": True, "features": {}}

    def test_multiple_addons_are_independent(self, tmp_path, monkeypatch):
        """Each addon key gets its own ``{default, features}`` envelope."""
        drive_dir = tmp_path / "drives" / "mixed"
        drive_dir.mkdir(parents=True)
        _rewrite_drives(
            monkeypatch,
            tmp_path,
            [
                {
                    "name": "mixed",
                    "path": str(drive_dir),
                    "addons": {
                        "knowledge": {"editor": False},
                        "intelligence": False,
                    },
                }
            ],
        )
        from app.main import app

        with TestClient(app) as c:
            res = c.get("/api/drives/mixed/addon-policies")
        assert res.status_code == 200
        addons = res.json()["addons"]
        assert addons["knowledge"] == {
            "default": True,
            "features": {"editor": False},
        }
        assert addons["intelligence"] == {"default": False, "features": {}}


# ----------------------------------------------------------------------
# 2. missing addons key => empty dict (graceful degradation)
# ----------------------------------------------------------------------


class TestAddonPoliciesGracefulDegradation:
    def test_no_addons_key_returns_empty(self, tmp_path, monkeypatch):
        """A drive with no ``addons`` field at all returns ``addons: {}``."""
        drive_dir = tmp_path / "drives" / "plain"
        drive_dir.mkdir(parents=True)
        _rewrite_drives(
            monkeypatch,
            tmp_path,
            [{"name": "plain", "path": str(drive_dir)}],
        )
        from app.main import app

        with TestClient(app) as c:
            res = c.get("/api/drives/plain/addon-policies")
        assert res.status_code == 200
        assert res.json() == {"addons": {}}


# ----------------------------------------------------------------------
# 3. unknown drive => 404
# ----------------------------------------------------------------------


class TestAddonPoliciesUnknownDrive:
    def test_unknown_drive_returns_404(self, client):
        c, _, _, _ = client
        res = c.get("/api/drives/no-such-drive/addon-policies")
        assert res.status_code == 404


# ----------------------------------------------------------------------
# 4. access control: protected drive locked => 404 (not 403, not visible)
# ----------------------------------------------------------------------


class TestAddonPoliciesAccessControl:
    def test_protected_locked_drive_returns_404(self, tmp_path, monkeypatch):
        """A locked protected drive must be invisible (404, not 403).

        Mirrors the convention from .claude/rules/design-decisions.md
        "Access control": 404 hides existence.
        """
        import app.auth as auth
        import app.config as config
        from app.main import app

        drive_dir = tmp_path / "drives" / "secret"
        drive_dir.mkdir(parents=True)
        passwords_path = tmp_path / "passwords.json"
        passwords_path.write_text(json.dumps([
            {"password": "vippass", "groups": ["vip"]},
        ]))
        _rewrite_drives(
            monkeypatch,
            tmp_path,
            [
                {
                    "name": "secret-drive",
                    "path": str(drive_dir),
                    "access_group": "vip",
                    "addons": {"knowledge": {"editor": False}},
                }
            ],
        )

        monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_path)
        monkeypatch.setattr(auth, "_passwords_cache", None)
        monkeypatch.setattr(auth, "_jwt_secret", "test-jwt-secret")

        # No unlock cookie -> drive must be hidden as 404.
        with TestClient(app) as c:
            res = c.get("/api/drives/secret-drive/addon-policies")
        assert res.status_code == 404

    def test_protected_unlocked_drive_returns_200(self, tmp_path, monkeypatch):
        """Once the viewer holds the access group, the policy is visible."""
        import app.auth as auth
        from app.main import app

        drive_dir = tmp_path / "drives" / "secret"
        drive_dir.mkdir(parents=True)
        passwords_path = tmp_path / "passwords.json"
        passwords_path.write_text(json.dumps([
            {"password": "vippass", "groups": ["vip"]},
        ]))
        _rewrite_drives(
            monkeypatch,
            tmp_path,
            [
                {
                    "name": "secret-drive",
                    "path": str(drive_dir),
                    "access_group": "vip",
                    "addons": {"knowledge": {"editor": False}},
                }
            ],
        )

        monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_path)
        monkeypatch.setattr(auth, "_passwords_cache", None)
        monkeypatch.setattr(auth, "_jwt_secret", "test-jwt-secret")

        with TestClient(app) as c:
            unlock = c.post(
                "/api/auth/unlock", json={"password": "vippass"}
            )
            assert unlock.status_code == 200
            res = c.get("/api/drives/secret-drive/addon-policies")
        assert res.status_code == 200
        body = res.json()
        assert body["addons"]["knowledge"]["features"] == {"editor": False}


# ----------------------------------------------------------------------
# 5. negative: invalid drives.json should not crash the endpoint
# (best-effort: behaviour is defined by config.load_drives raising,
#  so we expect a 500 only when an explicitly malformed drive is hit;
#  for now we just assert the loader does its own validation.)
# ----------------------------------------------------------------------


class TestAddonPoliciesLoadFailures:
    def test_invalid_addons_value_propagates_loader_error(
        self, tmp_path, monkeypatch
    ):
        """Drives.json with a non-dict, non-bool addon value must surface as a
        load-time error from ``config.load_drives`` (existing contract).

        We don't pin a specific HTTP status here — the goal is to confirm the
        endpoint does not silently swallow invalid config.
        """
        drive_dir = tmp_path / "drives" / "broken"
        drive_dir.mkdir(parents=True)
        _rewrite_drives(
            monkeypatch,
            tmp_path,
            [
                {
                    "name": "broken",
                    "path": str(drive_dir),
                    "addons": {"knowledge": "yes"},  # invalid: must be bool|dict
                }
            ],
        )
        from app.main import app

        with TestClient(app) as c:
            res = c.get("/api/drives/broken/addon-policies")
        # Either 4xx (router rejects) or 5xx (loader exception). Anything
        # other than 200 is acceptable; we explicitly forbid silently
        # treating broken config as "all enabled".
        assert res.status_code != 200
