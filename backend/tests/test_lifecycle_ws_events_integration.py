"""The coarse WS events survive the mutation they describe.

These deliberately do **not** mock `_file_ids_to_drives`. The unit tests do,
and that is exactly how two bugs got through review: resolving a file id to
its drive can only ever see the state *after* the mutation, which is empty
for a purge (the row is gone) and wrong for a cross-drive move (only the
destination remains).

Spec: `docs/superpowers/specs/2026-08-22-core-lifecycle-events-over-websocket.md`
"""

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.auth as auth
import app.config as config
import app.database as database
import app.main as main
import app.services.ws as ws
from app.database import Base, get_db
from app.main import app
from app.models import File
from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"
STRUCTURE = "drive.structure_changed"


@pytest.fixture()
def broadcasts(monkeypatch):
    """Record every WS broadcast, including the thread-scheduled ones."""
    calls: list[tuple[str, dict, str | None]] = []

    async def fake_broadcast(event_name, data, drive=None):
        calls.append((event_name, data, drive))

    def fake_from_thread(event_name, data, drive=None):
        calls.append((event_name, data, drive))

    monkeypatch.setattr(ws.manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(ws, "broadcast_from_thread", fake_from_thread)
    return calls


def _seed(db, drive_dir, drive_name, filename="clip.mp4", trashed=False):
    shutil.copy(FIXTURES_DIR / "short_video.mp4", drive_dir / filename)
    row = File(
        filename=filename,
        title="Clip",
        drive=drive_name,
        folder_path="",
        file_path=filename,
        file_size=(drive_dir / filename).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
        deleted_at=datetime.now(UTC) if trashed else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _structural(calls):
    return [(d, drive) for e, d, drive in calls if e == STRUCTURE]


class TestPurgeStillNotifies:
    """Every purge path deletes the row and commits before emitting.

    A lookup after that returns nothing, so the fail-closed broadcast used
    to stay silent for every purge — the notification most worth having,
    since the file is gone and a stale list is now simply wrong.
    """

    def test_single_purge_notifies_the_drive(self, client, broadcasts):
        c, db, drive_dir, _data_dir = client
        f = _seed(db, drive_dir, TEST_DRIVE, trashed=True)

        res = c.delete(f"/api/files/{f.id}/purge")
        assert res.status_code in (200, 204)

        assert _structural(broadcasts) == [({"drive": TEST_DRIVE}, TEST_DRIVE)]

    def test_batch_purge_notifies_the_drive(self, client, broadcasts):
        c, db, drive_dir, _data_dir = client
        a = _seed(db, drive_dir, TEST_DRIVE, "a.mp4", trashed=True)
        b = _seed(db, drive_dir, TEST_DRIVE, "b.mp4", trashed=True)

        res = c.post("/api/files/batch/purge", json={"ids": [a.id, b.id]})
        assert res.status_code == 200

        assert _structural(broadcasts) == [({"drive": TEST_DRIVE}, TEST_DRIVE)]

    def test_empty_trash_notifies_the_drive(self, client, broadcasts):
        c, db, drive_dir, _data_dir = client
        _seed(db, drive_dir, TEST_DRIVE, "a.mp4", trashed=True)

        res = c.post(f"/api/drives/{TEST_DRIVE}/trash/empty")
        assert res.status_code == 200

        assert _structural(broadcasts) == [({"drive": TEST_DRIVE}, TEST_DRIVE)]


@pytest.fixture()
def two_drives(tmp_path):
    """Two public drives, so a cross-drive move can be observed."""
    db_path = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )

    @event.listens_for(engine, "connect")
    def _fk(dbapi_connection, _record):
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    alpha = tmp_path / "drives" / "alpha"
    beta = tmp_path / "drives" / "beta"
    alpha.mkdir(parents=True)
    beta.mkdir(parents=True)
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"
    drives_json.write_text(
        json.dumps(
            [
                {"name": "alpha", "path": str(alpha)},
                {"name": "beta", "path": str(beta)},
            ]
        )
    )

    orig = {
        "drives_config": config.DRIVES_CONFIG,
        "data_dir": config.DATA_DIR,
        "thumbnails_dir": config.THUMBNAILS_DIR,
        "converted_dir": config.CONVERTED_DIR,
        "drives_cache": config._drives_cache,
        "pw_cache": auth._passwords_cache,
        "engine": database.engine,
        "session_local": database.SessionLocal,
        "main_session_local": main.SessionLocal,
        "scan_all_drives": main.scan_all_drives,
        "purge_expired_trash": main.purge_expired_trash,
    }

    config.DRIVES_CONFIG = drives_json
    config.DATA_DIR = data_dir
    config.THUMBNAILS_DIR = data_dir / "thumbnails"
    config.CONVERTED_DIR = data_dir / "converted"
    config._drives_cache = None
    auth._passwords_cache = None

    orig["engine"].dispose()
    database.engine = engine
    database.SessionLocal = TestSession
    main.SessionLocal = TestSession

    async def _noop_scan():
        return {}

    async def _noop_purge():
        return None

    main.scan_all_drives = _noop_scan
    main.purge_expired_trash = _noop_purge

    session = TestSession()
    try:
        with TestClient(app) as c:
            yield c, session, alpha, beta
    finally:
        session.close()
        config.DRIVES_CONFIG = orig["drives_config"]
        config.DATA_DIR = orig["data_dir"]
        config.THUMBNAILS_DIR = orig["thumbnails_dir"]
        config.CONVERTED_DIR = orig["converted_dir"]
        config._drives_cache = orig["drives_cache"]
        auth._passwords_cache = orig["pw_cache"]
        database.engine = orig["engine"]
        database.SessionLocal = orig["session_local"]
        main.SessionLocal = orig["main_session_local"]
        main.scan_all_drives = orig["scan_all_drives"]
        main.purge_expired_trash = orig["purge_expired_trash"]
        app.dependency_overrides.clear()
        orig["engine"].dispose()
        engine.dispose()


class TestCrossDriveMoveNotifiesBothSides:
    """A cross-drive move changes two listings, not one.

    Resolving the id after the move returns only the destination, so a tab
    showing the source drive was never told and kept displaying a file that
    had left.
    """

    def test_single_move_notifies_source_and_destination(
        self, two_drives, broadcasts
    ):
        c, db, alpha, _beta = two_drives
        f = _seed(db, alpha, "alpha")

        res = c.put(
            f"/api/files/{f.id}/move",
            json={"target_drive": "beta", "target_folder_path": ""},
        )
        assert res.status_code == 200

        drives = sorted(drive for _data, drive in _structural(broadcasts))
        assert drives == ["alpha", "beta"]

    def test_batch_move_notifies_source_and_destination(
        self, two_drives, broadcasts
    ):
        c, db, alpha, _beta = two_drives
        f = _seed(db, alpha, "alpha")

        res = c.put(
            "/api/files/batch/move",
            json={
                "ids": [f.id],
                "target_drive": "beta",
                "target_folder_path": "",
            },
        )
        assert res.status_code == 200

        drives = sorted(drive for _data, drive in _structural(broadcasts))
        assert drives == ["alpha", "beta"]

    def test_same_drive_move_notifies_once(self, two_drives, broadcasts):
        c, db, alpha, _beta = two_drives
        f = _seed(db, alpha, "alpha")
        (alpha / "sub").mkdir()

        res = c.put(
            f"/api/files/{f.id}/move",
            json={"target_folder_path": "sub"},
        )
        assert res.status_code == 200

        # No target_drive means the same drive; it must not be announced twice.
        assert _structural(broadcasts) == [({"drive": "alpha"}, "alpha")]
