"""Acceptance tests for SPEC-CORE-106: hidden home and sidebar entries per drive.

Backend side only: the visibility endpoint, the drives.json key as read by the
shared loader, and the admin save path. The browser side (hook and rendering)
is not covered here; see the report for the blocking questions.
"""

import json
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def admin_setup(tmp_path, monkeypatch):
    import app.auth as auth
    import app.config as config

    drive_a = tmp_path / "drive_a"
    drive_a.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    drives_json = tmp_path / "drives.json"
    drives_json.write_text(json.dumps([
        {"name": "alpha", "path": str(drive_a), "access_group": "g1"},
    ]))
    passwords_json = tmp_path / "passwords.json"
    passwords_json.write_text(json.dumps([
        {"password": "master-pw", "groups": ["g1"]},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_json)
    monkeypatch.setattr(auth, "_passwords_cache", None)
    yield {"drives_json": drives_json, "data_dir": data_dir, "drive_a": drive_a}


@pytest.fixture()
def admin_client(admin_setup):
    """Admin TestClient: the setup sentinel is removed so writes need the setup token."""
    import app.setup_token as setup_token
    from app.main import app

    sentinel = admin_setup["data_dir"] / "setup_completed"
    with TestClient(app) as c:
        if sentinel.exists():
            sentinel.unlink()
        c.headers[setup_token.HEADER] = setup_token.setup_token()
        resp = c.post("/api/auth/unlock", json={"password": "master-pw"})
        assert resp.status_code == 200, resp.text
        yield c, admin_setup


def _write_drives(monkeypatch, tmp_path: Path, drives: list[dict]) -> Path:
    """Write drives.json for the test and reset the per-process drives cache."""
    import app.config as config

    path = tmp_path / "drives.json"
    path.write_text(json.dumps(drives))
    monkeypatch.setattr(config, "DRIVES_CONFIG", path)
    monkeypatch.setattr(config, "_drives_cache", None)
    return path


def _drive(tmp_path: Path, name: str, **extra) -> dict:
    drive_dir = tmp_path / "drives" / name
    drive_dir.mkdir(parents=True, exist_ok=True)
    return {"name": name, "path": str(drive_dir), **extra}


def _unlock_setup(tmp_path, monkeypatch, drives: list[dict]):
    import app.auth as auth

    passwords_path = tmp_path / "passwords.json"
    passwords_path.write_text(json.dumps([
        {"password": "vippass", "groups": ["vip"]},
    ]))
    _write_drives(monkeypatch, tmp_path, drives)
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_path)
    monkeypatch.setattr(auth, "_passwords_cache", None)
    monkeypatch.setattr(auth, "_jwt_secret", "test-jwt-secret")


class TestEntryVisibilityEndpoint:
    def test_spec_core_106_i1_missing_key_hides_nothing(self, tmp_path, monkeypatch):
        """SPEC-CORE-106 (Required 2, I1): no hidden_entries key gives an empty list."""
        _write_drives(monkeypatch, tmp_path, [_drive(tmp_path, "plain")])
        from app.main import app

        with TestClient(app) as c:
            res = c.get("/api/drives/plain/entry-visibility")
        assert res.status_code == 200
        assert res.json() == {"hidden": []}

    def test_spec_core_106_i1_empty_list_hides_nothing(self, tmp_path, monkeypatch):
        """SPEC-CORE-106 (I1): an empty hidden_entries list is a valid list and hides nothing."""
        _write_drives(
            monkeypatch,
            tmp_path,
            [_drive(tmp_path, "empty", hidden_entries=[])],
        )
        from app.main import app

        with TestClient(app) as c:
            res = c.get("/api/drives/empty/entry-visibility")
        assert res.status_code == 200
        assert res.json() == {"hidden": []}

    def test_spec_core_106_normal_flow_listed_key_is_returned(self, tmp_path, monkeypatch):
        """SPEC-CORE-106 (Required 1 step 2, I2): the configured list is returned."""
        _write_drives(
            monkeypatch,
            tmp_path,
            [_drive(tmp_path, "tv", hidden_entries=["video"])],
        )
        from app.main import app

        with TestClient(app) as c:
            res = c.get("/api/drives/tv/entry-visibility")
        assert res.status_code == 200
        assert res.json() == {"hidden": ["video"]}

    def test_spec_core_106_i2_list_is_per_drive(self, tmp_path, monkeypatch):
        """SPEC-CORE-106 (I2): a key hidden on one drive is not hidden on another drive."""
        _write_drives(
            monkeypatch,
            tmp_path,
            [
                _drive(tmp_path, "hides", hidden_entries=["reading"]),
                _drive(tmp_path, "shows"),
            ],
        )
        from app.main import app

        with TestClient(app) as c:
            hides = c.get("/api/drives/hides/entry-visibility").json()
            shows = c.get("/api/drives/shows/entry-visibility").json()
        assert hides == {"hidden": ["reading"]}
        assert shows == {"hidden": []}

    def test_spec_core_106_i5_unknown_keys_are_ignored_and_stay_in_file(
        self, tmp_path, monkeypatch
    ):
        """SPEC-CORE-106 (Failure 2, I5): unknown and non-hideable keys do not fail the
        load and stay in drives.json. The endpoint returns the configured strings as they
        are; the browser keeps only the keys it knows."""
        path = _write_drives(
            monkeypatch,
            tmp_path,
            [_drive(tmp_path, "mixed", hidden_entries=["no-such-app", "library", "video"])],
        )
        from app.main import app

        with TestClient(app) as c:
            res = c.get("/api/drives/mixed/entry-visibility")
            drives_after = c.get("/api/drives")
        assert res.status_code == 200
        assert res.json() == {"hidden": ["no-such-app", "library", "video"]}
        assert drives_after.status_code == 200
        on_disk = json.loads(path.read_text())
        assert on_disk[0]["hidden_entries"] == ["no-such-app", "library", "video"]

    @pytest.mark.parametrize(
        "bad_value",
        ["video", ["video", 1], {"video": True}, None],
        ids=["string", "list-with-non-string", "object", "null"],
    )
    def test_spec_core_106_i6_non_list_of_strings_answers_500(
        self, tmp_path, monkeypatch, bad_value
    ):
        """SPEC-CORE-106 (Failure 3, I6): a value that is not a list of strings answers
        500 Configuration error from the endpoint."""
        _write_drives(
            monkeypatch,
            tmp_path,
            [_drive(tmp_path, "broken", hidden_entries=bad_value)],
        )
        from app.main import app

        with TestClient(app) as c:
            res = c.get("/api/drives/broken/entry-visibility")
        assert res.status_code == 500
        assert "Configuration error" in res.text

    def test_spec_core_106_i6_malformed_value_is_logged_server_side(
        self, tmp_path, monkeypatch, caplog
    ):
        """SPEC-CORE-106 (Failure 3, Section 8): the malformed value is logged server-side."""
        _write_drives(
            monkeypatch,
            tmp_path,
            [_drive(tmp_path, "logged", hidden_entries="video")],
        )
        from app.main import app

        with caplog.at_level(logging.WARNING):
            with TestClient(app) as c:
                res = c.get("/api/drives/logged/entry-visibility")
        assert res.status_code == 500
        assert any(r.levelno >= logging.WARNING for r in caplog.records)

    def test_spec_core_106_i6_malformed_value_does_not_break_other_routes(
        self, tmp_path, monkeypatch
    ):
        """SPEC-CORE-106 (I6): with a malformed hidden_entries, other drive routes still work."""
        _write_drives(
            monkeypatch,
            tmp_path,
            [
                _drive(tmp_path, "broken", hidden_entries=42),
                _drive(tmp_path, "fine"),
            ],
        )
        from app.main import app

        with TestClient(app) as c:
            listing = c.get("/api/drives")
            policies = c.get("/api/drives/fine/addon-policies")
        assert listing.status_code == 200
        assert policies.status_code == 200
        assert policies.json() == {"addons": {}}

    def test_spec_core_106_i6_loader_does_not_raise_for_malformed_value(
        self, tmp_path, monkeypatch
    ):
        """SPEC-CORE-106 (I6): config.load_drives() does not raise for a non-list value."""
        import app.config as config

        _write_drives(
            monkeypatch,
            tmp_path,
            [_drive(tmp_path, "broken", hidden_entries={"video": True})],
        )
        config.load_drives()

    def test_spec_core_106_i3_hidden_entries_change_no_other_response(
        self, tmp_path, monkeypatch
    ):
        """SPEC-CORE-106 (I3, Section 6): the key changes the visibility endpoint only.
        Other drive-scoped responses are identical with and without it."""
        from app.main import app

        _write_drives(monkeypatch, tmp_path, [_drive(tmp_path, "plain")])
        with TestClient(app) as c:
            before_policies = c.get("/api/drives/plain/addon-policies").json()
            before_listing = c.get("/api/drives").json()

        _write_drives(
            monkeypatch,
            tmp_path,
            [_drive(tmp_path, "plain", hidden_entries=["video", "reading"])],
        )
        with TestClient(app) as c:
            after_policies = c.get("/api/drives/plain/addon-policies").json()
            after_listing = c.get("/api/drives").json()

        assert after_policies == before_policies
        assert after_listing == before_listing


class TestEntryVisibilityAccessControl:
    def test_spec_core_106_i7_locked_drive_404_then_list_once_unlocked(
        self, tmp_path, monkeypatch
    ):
        """SPEC-CORE-106 (I7, Section 6): a locked drive answers 404 and does not reveal
        the list; once the viewer holds the access group, the list is returned."""
        _unlock_setup(
            tmp_path,
            monkeypatch,
            [_drive(tmp_path, "secret", access_group="vip", hidden_entries=["video"])],
        )
        from app.main import app

        with TestClient(app) as c:
            locked = c.get("/api/drives/secret/entry-visibility")
            assert locked.status_code == 404
            assert "video" not in locked.text

            unlock = c.post("/api/auth/unlock", json={"password": "vippass"})
            assert unlock.status_code == 200
            res = c.get("/api/drives/secret/entry-visibility")
        assert res.status_code == 200
        assert res.json() == {"hidden": ["video"]}


class TestAdminSavePreservesKey:
    def test_spec_core_106_i8_put_drives_keeps_hidden_entries(
        self, admin_client, monkeypatch
    ):
        """SPEC-CORE-106 (I8, Section 4): saving each drive back as a whole object through
        PUT /api/admin/config/drives keeps its hidden_entries value unchanged on disk."""
        import app.config as config

        c, ctx = admin_client
        path = ctx["drives_json"]
        drives = json.loads(path.read_text())
        drives[0]["hidden_entries"] = ["video", "reading"]
        path.write_text(json.dumps(drives))
        monkeypatch.setattr(config, "_drives_cache", None)

        got = c.get("/api/admin/config/drives")
        assert got.status_code == 200, got.text
        body = got.json()
        listed = body if isinstance(body, list) else body["drives"]
        assert next(d for d in listed if d["name"] == "alpha")["hidden_entries"] == [
            "video",
            "reading",
        ]

        put = c.put("/api/admin/config/drives", json=listed)
        assert put.status_code == 200, put.text

        saved = {d["name"]: d for d in json.loads(path.read_text())}
        assert saved["alpha"]["hidden_entries"] == ["video", "reading"]
