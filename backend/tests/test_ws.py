"""Tests for WebSocket foundation: services/ws.py + routers/ws.py"""

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import TEST_DRIVE


# ────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────


def _run(coro):
    """Run an async coroutine synchronously."""
    return asyncio.get_event_loop().run_until_complete(coro)


def _make_mock_ws():
    """Create a mock WebSocket with async methods."""
    ws = AsyncMock()
    ws.send_json = AsyncMock()
    ws.accept = AsyncMock()
    return ws


# ────────────────────────────────────────────────
# Unit tests for ConnectionManager
# ────────────────────────────────────────────────


class TestConnectionManagerConnect:
    def test_connect_adds_websocket(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws = _make_mock_ws()

        _run(mgr.connect(ws, ["group_a"]))

        assert ws in mgr._connections
        assert mgr._connections[ws] == ["group_a"]

    def test_connect_accepts_websocket(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws = _make_mock_ws()

        _run(mgr.connect(ws, []))

        ws.accept.assert_awaited_once()

    def test_connect_with_empty_groups(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws = _make_mock_ws()

        _run(mgr.connect(ws, []))

        assert mgr._connections[ws] == []

    def test_connect_with_multiple_groups(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws = _make_mock_ws()

        _run(mgr.connect(ws, ["group_a", "group_b", "group_c"]))

        assert mgr._connections[ws] == ["group_a", "group_b", "group_c"]


class TestConnectionManagerDisconnect:
    def test_disconnect_removes_websocket(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws = _make_mock_ws()
        _run(mgr.connect(ws, []))

        mgr.disconnect(ws)

        assert ws not in mgr._connections

    def test_disconnect_nonexistent_is_noop(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws = _make_mock_ws()

        # Should not raise
        mgr.disconnect(ws)

    def test_disconnect_only_removes_target(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws1 = _make_mock_ws()
        ws2 = _make_mock_ws()
        _run(mgr.connect(ws1, []))
        _run(mgr.connect(ws2, []))

        mgr.disconnect(ws1)

        assert ws1 not in mgr._connections
        assert ws2 in mgr._connections


class TestConnectionManagerBroadcast:
    def test_broadcast_sends_to_all(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws1 = _make_mock_ws()
        ws2 = _make_mock_ws()
        _run(mgr.connect(ws1, []))
        _run(mgr.connect(ws2, []))

        _run(mgr.broadcast("scan:complete", {"drive": "media"}))

        expected = {"event": "scan:complete", "data": {"drive": "media"}}
        ws1.send_json.assert_awaited_once_with(expected)
        ws2.send_json.assert_awaited_once_with(expected)

    def test_broadcast_no_connections(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()

        # Should not raise when no connections
        _run(mgr.broadcast("scan:complete", {"drive": "media"}))

    def test_broadcast_with_drive_filters_by_access_group(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws_authorized = _make_mock_ws()
        ws_unauthorized = _make_mock_ws()
        _run(mgr.connect(ws_authorized, ["private"]))
        _run(mgr.connect(ws_unauthorized, []))

        with patch("app.config.get_drive_access_group", return_value="private"):
            _run(mgr.broadcast(
                "scan:progress",
                {"drive": "secret", "added": 1},
                drive="secret",
            ))

        expected = {"event": "scan:progress", "data": {"drive": "secret", "added": 1}}
        ws_authorized.send_json.assert_awaited_once_with(expected)
        ws_unauthorized.send_json.assert_not_awaited()

    def test_broadcast_public_drive_sends_to_all(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws1 = _make_mock_ws()
        ws2 = _make_mock_ws()
        _run(mgr.connect(ws1, ["private"]))
        _run(mgr.connect(ws2, []))

        # Public drive has no access_group (returns None)
        with patch("app.config.get_drive_access_group", return_value=None):
            _run(mgr.broadcast(
                "scan:complete",
                {"drive": "public"},
                drive="public",
            ))

        ws1.send_json.assert_awaited_once()
        ws2.send_json.assert_awaited_once()

    def test_broadcast_without_drive_sends_to_all(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws1 = _make_mock_ws()
        ws2 = _make_mock_ws()
        _run(mgr.connect(ws1, ["private"]))
        _run(mgr.connect(ws2, []))

        _run(mgr.broadcast("some:event", {"key": "value"}))

        ws1.send_json.assert_awaited_once()
        ws2.send_json.assert_awaited_once()

    def test_broadcast_handles_send_failure(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws_ok = _make_mock_ws()
        ws_fail = _make_mock_ws()
        ws_fail.send_json.side_effect = Exception("connection lost")
        _run(mgr.connect(ws_ok, []))
        _run(mgr.connect(ws_fail, []))

        _run(mgr.broadcast("test:event", {"x": 1}))

        # Failed ws should be disconnected
        assert ws_fail not in mgr._connections
        # Healthy ws should remain
        assert ws_ok in mgr._connections
        ws_ok.send_json.assert_awaited_once()

    def test_broadcast_multiple_failures(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws1 = _make_mock_ws()
        ws1.send_json.side_effect = Exception("fail 1")
        ws2 = _make_mock_ws()
        ws2.send_json.side_effect = Exception("fail 2")
        ws3 = _make_mock_ws()
        _run(mgr.connect(ws1, []))
        _run(mgr.connect(ws2, []))
        _run(mgr.connect(ws3, []))

        _run(mgr.broadcast("test:event", {}))

        assert ws1 not in mgr._connections
        assert ws2 not in mgr._connections
        assert ws3 in mgr._connections

    def test_broadcast_correct_message_format(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        ws = _make_mock_ws()
        _run(mgr.connect(ws, []))

        _run(mgr.broadcast("upload:complete", {
            "drive": "media",
            "file_id": "abc123",
            "filename": "video.mp4",
        }))

        ws.send_json.assert_awaited_once_with({
            "event": "upload:complete",
            "data": {
                "drive": "media",
                "file_id": "abc123",
                "filename": "video.mp4",
            },
        })


class TestConnectionManagerConcurrency:
    def test_multiple_concurrent_connections(self):
        from app.services.ws import ConnectionManager

        mgr = ConnectionManager()
        connections = [_make_mock_ws() for _ in range(10)]

        for i, ws in enumerate(connections):
            _run(mgr.connect(ws, [f"group_{i}"]))

        assert len(mgr._connections) == 10

        for i, ws in enumerate(connections):
            assert mgr._connections[ws] == [f"group_{i}"]


# ────────────────────────────────────────────────
# Integration tests for WebSocket endpoint
# ────────────────────────────────────────────────


class TestWebSocketEndpoint:
    def test_client_can_connect(self, client):
        c, _, _, _ = client
        with c.websocket_connect("/api/ws") as ws:
            # Connection established successfully
            pass

    def test_client_receives_broadcast(self, client):
        c, _, _, _ = client

        with c.websocket_connect("/api/ws") as ws:
            from app.services.ws import manager

            _run(manager.broadcast("test:event", {"key": "value"}))

            data = ws.receive_json()
            assert data["event"] == "test:event"
            assert data["data"]["key"] == "value"

    def test_connection_without_cookie_gets_empty_groups(self, client):
        c, _, _, _ = client

        with c.websocket_connect("/api/ws"):
            from app.services.ws import manager

            # Find the connection and verify empty groups
            found_empty = False
            for _, groups in manager._connections.items():
                if groups == []:
                    found_empty = True
                    break
            assert found_empty, "Expected a connection with empty groups"

    def test_disconnection_cleanup(self, client):
        c, _, _, _ = client
        from app.services.ws import manager

        initial_count = len(manager._connections)

        with c.websocket_connect("/api/ws"):
            assert len(manager._connections) == initial_count + 1

        # After disconnect, connection should be removed
        assert len(manager._connections) == initial_count


class TestWebSocketEndpointAuth:
    def test_connection_with_valid_jwt_gets_groups(self, tmp_path):
        """Authorized connection should have groups from JWT."""
        import app.auth as auth
        import app.config as config
        from app.main import app
        from app.database import Base, get_db
        from sqlalchemy import create_engine, event
        from sqlalchemy.orm import sessionmaker
        from fastapi.testclient import TestClient

        db_path = tmp_path / "test.db"
        engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )

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

        drives_json = tmp_path / "drives.json"
        drives_json.write_text(json.dumps([
            {"name": TEST_DRIVE, "path": str(drive_dir)}
        ]))

        orig_drives_config = config.DRIVES_CONFIG
        orig_data = config.DATA_DIR
        orig_thumbs = config.THUMBNAILS_DIR
        orig_cache = config._drives_cache
        orig_jwt_secret = auth._jwt_secret

        config.DRIVES_CONFIG = drives_json
        config.DATA_DIR = data_dir
        config.THUMBNAILS_DIR = data_dir / "thumbnails"
        config._drives_cache = None
        auth._jwt_secret = "test-jwt-secret"

        try:
            token, _ = auth.create_jwt(["private", "vip"], remember=False)

            with TestClient(app, cookies={auth.COOKIE_NAME: token}) as tc:
                with tc.websocket_connect("/api/ws") as ws:
                    from app.services.ws import manager

                    # Find this connection and check its groups
                    found = False
                    for _, groups in manager._connections.items():
                        if groups == ["private", "vip"]:
                            found = True
                            break
                    assert found, "Expected connection with ['private', 'vip'] groups"
        finally:
            config.DRIVES_CONFIG = orig_drives_config
            config.DATA_DIR = orig_data
            config.THUMBNAILS_DIR = orig_thumbs
            config._drives_cache = orig_cache
            auth._jwt_secret = orig_jwt_secret
            app.dependency_overrides.clear()
            engine.dispose()
