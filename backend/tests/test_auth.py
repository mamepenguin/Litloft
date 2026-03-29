"""Tests for authentication: auth.py + routers/auth.py"""

import json
import time
from unittest.mock import patch

import jwt
import pytest

from tests.conftest import TEST_DRIVE


# ────────────────────────────────────────────────
# Unit tests for app.auth module
# ────────────────────────────────────────────────


class TestLoadPasswords:
    def test_no_file_returns_empty(self, tmp_path):
        import app.auth as auth
        auth._passwords_cache = None
        with patch.object(auth, "PASSWORDS_CONFIG", tmp_path / "nonexistent.json"):
            result = auth.load_passwords()
        assert result == []

    def test_valid_file(self, tmp_path):
        import app.auth as auth
        auth._passwords_cache = None
        pw_file = tmp_path / "passwords.json"
        pw_file.write_text(json.dumps([
            {"password": "secret1", "groups": ["private"]}
        ]))
        with patch.object(auth, "PASSWORDS_CONFIG", pw_file):
            result = auth.load_passwords()
        assert len(result) == 1
        assert result[0]["groups"] == ["private"]

    def test_invalid_not_list(self, tmp_path):
        import app.auth as auth
        auth._passwords_cache = None
        pw_file = tmp_path / "passwords.json"
        pw_file.write_text(json.dumps({"password": "x"}))
        with patch.object(auth, "PASSWORDS_CONFIG", pw_file):
            with pytest.raises(ValueError, match="must be a JSON array"):
                auth.load_passwords()

    def test_missing_password_field(self, tmp_path):
        import app.auth as auth
        auth._passwords_cache = None
        pw_file = tmp_path / "passwords.json"
        pw_file.write_text(json.dumps([{"groups": ["a"]}]))
        with patch.object(auth, "PASSWORDS_CONFIG", pw_file):
            with pytest.raises(ValueError, match="must have 'password' and 'groups'"):
                auth.load_passwords()

    def test_empty_password_rejected(self, tmp_path):
        import app.auth as auth
        auth._passwords_cache = None
        pw_file = tmp_path / "passwords.json"
        pw_file.write_text(json.dumps([{"password": "", "groups": ["a"]}]))
        with patch.object(auth, "PASSWORDS_CONFIG", pw_file):
            with pytest.raises(ValueError, match="non-empty string"):
                auth.load_passwords()

    def test_empty_groups_rejected(self, tmp_path):
        import app.auth as auth
        auth._passwords_cache = None
        pw_file = tmp_path / "passwords.json"
        pw_file.write_text(json.dumps([{"password": "x", "groups": []}]))
        with patch.object(auth, "PASSWORDS_CONFIG", pw_file):
            with pytest.raises(ValueError, match="non-empty list"):
                auth.load_passwords()

    def test_cache_returns_copy(self, tmp_path):
        import app.auth as auth
        auth._passwords_cache = [{"password": "a", "groups": ["g"]}]
        result = auth.load_passwords()
        result.append({"password": "b", "groups": ["h"]})
        assert len(auth._passwords_cache) == 1


class TestVerifyPassword:
    def test_correct_password(self, tmp_path):
        import app.auth as auth
        auth._passwords_cache = [
            {"password": "secret1", "groups": ["group_a"]},
            {"password": "secret2", "groups": ["group_b", "group_c"]},
        ]
        result = auth.verify_password("secret2")
        assert result == ["group_b", "group_c"]

    def test_wrong_password(self):
        import app.auth as auth
        auth._passwords_cache = [{"password": "correct", "groups": ["g"]}]
        result = auth.verify_password("wrong")
        assert result is None

    def test_empty_entries(self):
        import app.auth as auth
        auth._passwords_cache = []
        result = auth.verify_password("any")
        assert result is None


class TestJWT:
    def test_create_and_decode_session(self):
        import app.auth as auth
        auth._jwt_secret = "test-secret-key"
        token, max_age = auth.create_jwt(["private"], remember=False)
        assert max_age is None
        groups = auth.decode_jwt(token)
        assert groups == ["private"]

    def test_create_and_decode_remember(self):
        import app.auth as auth
        auth._jwt_secret = "test-secret-key"
        token, max_age = auth.create_jwt(["a", "b"], remember=True)
        assert max_age == 365 * 24 * 3600
        groups = auth.decode_jwt(token)
        assert groups == ["a", "b"]

    def test_decode_invalid_token(self):
        import app.auth as auth
        auth._jwt_secret = "test-secret-key"
        groups = auth.decode_jwt("invalid.token.here")
        assert groups == []

    def test_decode_expired_token(self):
        import app.auth as auth
        auth._jwt_secret = "test-secret-key"
        payload = {
            "groups": ["g"],
            "iat": time.time() - 100,
            "exp": time.time() - 50,
        }
        token = jwt.encode(payload, "test-secret-key", algorithm="HS256")
        groups = auth.decode_jwt(token)
        assert groups == []

    def test_decode_wrong_secret(self):
        import app.auth as auth
        auth._jwt_secret = "test-secret-key"
        token, _ = auth.create_jwt(["g"], remember=False)
        auth._jwt_secret = "different-secret"
        groups = auth.decode_jwt(token)
        assert groups == []


class TestRateLimit:
    def test_allows_under_limit(self):
        from app.auth import check_rate_limit, _failed_attempts
        _failed_attempts.clear()
        check_rate_limit("1.2.3.4")  # Should not raise

    def test_blocks_over_limit(self):
        from app.auth import check_rate_limit, record_failed_attempt, _failed_attempts
        _failed_attempts.clear()
        for _ in range(5):
            record_failed_attempt("1.2.3.4")
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            check_rate_limit("1.2.3.4")
        assert exc_info.value.status_code == 429

    def test_separate_ips(self):
        from app.auth import check_rate_limit, record_failed_attempt, _failed_attempts
        _failed_attempts.clear()
        for _ in range(5):
            record_failed_attempt("1.1.1.1")
        check_rate_limit("2.2.2.2")  # Different IP, should pass


class TestFilterDrives:
    def test_public_drives_always_visible(self):
        from app.auth import filter_drives
        drives = [{"name": "public"}]
        result = filter_drives(drives, [])
        assert len(result) == 1

    def test_protected_hidden_without_group(self):
        from app.auth import filter_drives
        drives = [{"name": "private", "access_group": "secret"}]
        result = filter_drives(drives, [])
        assert len(result) == 0

    def test_protected_visible_with_group(self):
        from app.auth import filter_drives
        drives = [{"name": "private", "access_group": "secret"}]
        result = filter_drives(drives, ["secret"])
        assert len(result) == 1


# ────────────────────────────────────────────────
# Integration tests for /api/auth endpoints
# ────────────────────────────────────────────────


def _make_auth_client(tmp_path, passwords=None, drives=None):
    """Create a test client with optional passwords.json."""
    import app.auth as auth
    import app.config as config
    from app.main import app
    from app.database import Base, get_db
    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import sessionmaker
    from fastapi.testclient import TestClient

    db_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    TestSess = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        s = TestSess()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db

    drive_dir = tmp_path / "drives" / "default"
    drive_dir.mkdir(parents=True)
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_list = drives or [{"name": TEST_DRIVE, "path": str(drive_dir)}]
    drives_json = tmp_path / "drives.json"
    drives_json.write_text(json.dumps(drives_list))

    orig = {
        "drives_config": config.DRIVES_CONFIG,
        "data_dir": config.DATA_DIR,
        "thumbnails_dir": config.THUMBNAILS_DIR,
        "drives_cache": config._drives_cache,
        "pw_cache": auth._passwords_cache,
        "jwt_secret": auth._jwt_secret,
        "failed": dict(auth._failed_attempts),
    }

    config.DRIVES_CONFIG = drives_json
    config.DATA_DIR = data_dir
    config.THUMBNAILS_DIR = data_dir / "thumbnails"
    config._drives_cache = None
    auth._passwords_cache = None
    auth._jwt_secret = "test-jwt-secret"
    auth._failed_attempts.clear()

    if passwords is not None:
        pw_file = tmp_path / "passwords.json"
        pw_file.write_text(json.dumps(passwords))
        auth.PASSWORDS_CONFIG = pw_file

    client = TestClient(app)

    def cleanup():
        config.DRIVES_CONFIG = orig["drives_config"]
        config.DATA_DIR = orig["data_dir"]
        config.THUMBNAILS_DIR = orig["thumbnails_dir"]
        config._drives_cache = orig["drives_cache"]
        auth._passwords_cache = orig["pw_cache"]
        auth._jwt_secret = orig["jwt_secret"]
        auth._failed_attempts.clear()
        auth._failed_attempts.update(orig["failed"])
        auth.PASSWORDS_CONFIG = auth.__class__.__module__ and auth.PASSWORDS_CONFIG  # noqa
        app.dependency_overrides.clear()
        engine.dispose()

    return client, cleanup


class TestUnlockEndpoint:
    def test_unlock_success(self, tmp_path):
        passwords = [{"password": "pass123", "groups": ["private"]}]
        c, cleanup = _make_auth_client(tmp_path, passwords=passwords)
        try:
            res = c.post("/api/auth/unlock", json={"password": "pass123"})
            assert res.status_code == 200
            body = res.json()
            assert body["success"] is True
            assert body["groups"] == ["private"]
            assert "access_token" in res.cookies
        finally:
            cleanup()

    def test_unlock_wrong_password(self, tmp_path):
        passwords = [{"password": "pass123", "groups": ["private"]}]
        c, cleanup = _make_auth_client(tmp_path, passwords=passwords)
        try:
            res = c.post("/api/auth/unlock", json={"password": "wrong"})
            assert res.status_code == 200
            body = res.json()
            assert body["success"] is False
            assert body["error"] == "Invalid password"
        finally:
            cleanup()

    def test_unlock_remember_cookie(self, tmp_path):
        passwords = [{"password": "pass123", "groups": ["private"]}]
        c, cleanup = _make_auth_client(tmp_path, passwords=passwords)
        try:
            res = c.post("/api/auth/unlock", json={"password": "pass123", "remember": True})
            assert res.status_code == 200
            assert res.json()["success"] is True
        finally:
            cleanup()


class TestLockEndpoint:
    def test_lock_clears_cookie(self, tmp_path):
        passwords = [{"password": "pass123", "groups": ["g"]}]
        c, cleanup = _make_auth_client(tmp_path, passwords=passwords)
        try:
            c.post("/api/auth/unlock", json={"password": "pass123"})
            res = c.post("/api/auth/lock")
            assert res.status_code == 200
            assert res.json()["success"] is True
        finally:
            cleanup()


class TestStatusEndpoint:
    def test_status_no_auth(self, tmp_path):
        c, cleanup = _make_auth_client(tmp_path)
        try:
            res = c.get("/api/auth/status")
            assert res.status_code == 200
            body = res.json()
            assert body["unlocked_groups"] == []
            assert body["has_protected_drives"] is False
        finally:
            cleanup()

    def test_status_after_unlock(self, tmp_path):
        passwords = [{"password": "pass123", "groups": ["private"]}]
        drive_dir = tmp_path / "drives" / "protected"
        drive_dir.mkdir(parents=True)
        drives = [
            {"name": TEST_DRIVE, "path": str(drive_dir), "access_group": "private"},
        ]
        c, cleanup = _make_auth_client(tmp_path, passwords=passwords, drives=drives)
        try:
            c.post("/api/auth/unlock", json={"password": "pass123"})
            res = c.get("/api/auth/status")
            body = res.json()
            assert body["unlocked_groups"] == ["private"]
            assert body["has_protected_drives"] is True
        finally:
            cleanup()


class TestDriveAccessControl:
    def test_protected_drive_hidden(self, tmp_path):
        drive_dir = tmp_path / "drives" / "secret"
        drive_dir.mkdir(parents=True)
        drives = [
            {"name": "public-drive", "path": str(drive_dir)},
            {"name": "secret-drive", "path": str(drive_dir), "access_group": "vip"},
        ]
        c, cleanup = _make_auth_client(tmp_path, passwords=[], drives=drives)
        try:
            res = c.get("/api/drives")
            names = [d["name"] for d in res.json()]
            assert "public-drive" in names
            assert "secret-drive" not in names
        finally:
            cleanup()

    def test_protected_drive_visible_after_unlock(self, tmp_path):
        drive_dir = tmp_path / "drives" / "secret"
        drive_dir.mkdir(parents=True)
        passwords = [{"password": "vippass", "groups": ["vip"]}]
        drives = [
            {"name": "public-drive", "path": str(drive_dir)},
            {"name": "secret-drive", "path": str(drive_dir), "access_group": "vip"},
        ]
        c, cleanup = _make_auth_client(tmp_path, passwords=passwords, drives=drives)
        try:
            c.post("/api/auth/unlock", json={"password": "vippass"})
            res = c.get("/api/drives")
            names = [d["name"] for d in res.json()]
            assert "public-drive" in names
            assert "secret-drive" in names
        finally:
            cleanup()

    def test_protected_drive_404_on_access(self, tmp_path):
        drive_dir = tmp_path / "drives" / "secret"
        drive_dir.mkdir(parents=True)
        drives = [
            {"name": "secret-drive", "path": str(drive_dir), "access_group": "vip"},
        ]
        c, cleanup = _make_auth_client(tmp_path, passwords=[], drives=drives)
        try:
            res = c.get("/api/drives/secret-drive/files")
            assert res.status_code == 404
        finally:
            cleanup()
