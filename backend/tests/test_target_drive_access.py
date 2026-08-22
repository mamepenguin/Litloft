"""The destination of a move/copy must be access-checked, not just the source.

``_get_file_or_404`` gates the file being moved, but ``target_drive`` arrives
straight from the request body and only ever reached ``resolve_drive_path``,
which checks that the drive *exists* and nothing else. A caller who had
unlocked one drive could therefore move or copy files into a drive they
cannot see.

The UI cannot reach this — you can only paste where you can navigate, and a
locked drive is absent from every listing — so these tests exercise the API
directly, which is where the gap lives (MCP clients and scripts call it too).
"""

import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.auth as auth
import app.config as config
import app.database as database
import app.main as main
from app.database import Base, get_db
from app.main import app
from app.models import File

FIXTURES_DIR = Path(__file__).parent / "fixtures"

OPEN_DRIVE = "open"
LOCKED_DRIVE = "locked"
LOCKED_GROUP = "secret"
LOCKED_PASSWORD = "let-me-in"


@pytest.fixture()
def two_drives(tmp_path):
    """A public drive and a protected one, with the protected drive locked.

    Yields ``(client, db_session, open_dir, locked_dir)``.
    """
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

    open_dir = tmp_path / "drives" / OPEN_DRIVE
    locked_dir = tmp_path / "drives" / LOCKED_DRIVE
    open_dir.mkdir(parents=True)
    locked_dir.mkdir(parents=True)
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"
    drives_json.write_text(
        json.dumps(
            [
                {"name": OPEN_DRIVE, "path": str(open_dir)},
                {
                    "name": LOCKED_DRIVE,
                    "path": str(locked_dir),
                    "access_group": LOCKED_GROUP,
                },
            ]
        )
    )
    pw_json = tmp_path / "passwords.json"
    pw_json.write_text(
        json.dumps([{"password": LOCKED_PASSWORD, "groups": [LOCKED_GROUP]}])
    )

    orig = {
        "drives_config": config.DRIVES_CONFIG,
        "data_dir": config.DATA_DIR,
        "thumbnails_dir": config.THUMBNAILS_DIR,
        "converted_dir": config.CONVERTED_DIR,
        "drives_cache": config._drives_cache,
        "passwords_config": auth.PASSWORDS_CONFIG,
        "pw_cache": auth._passwords_cache,
        "jwt_secret": auth._jwt_secret,
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
    auth.PASSWORDS_CONFIG = pw_json
    auth._passwords_cache = None
    auth._jwt_secret = "test-jwt-secret"

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
            yield c, session, open_dir, locked_dir
    finally:
        session.close()
        config.DRIVES_CONFIG = orig["drives_config"]
        config.DATA_DIR = orig["data_dir"]
        config.THUMBNAILS_DIR = orig["thumbnails_dir"]
        config.CONVERTED_DIR = orig["converted_dir"]
        config._drives_cache = orig["drives_cache"]
        auth.PASSWORDS_CONFIG = orig["passwords_config"]
        auth._passwords_cache = orig["pw_cache"]
        auth._jwt_secret = orig["jwt_secret"]
        database.engine = orig["engine"]
        database.SessionLocal = orig["session_local"]
        main.SessionLocal = orig["main_session_local"]
        main.scan_all_drives = orig["scan_all_drives"]
        main.purge_expired_trash = orig["purge_expired_trash"]
        app.dependency_overrides.clear()
        orig["engine"].dispose()
        engine.dispose()


def _seed(db, drive_dir, drive_name, filename="clip.mp4"):
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
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestSingleFileDestination:
    def test_move_into_locked_drive_is_404(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        f = _seed(db, open_dir, OPEN_DRIVE)

        res = c.put(
            f"/api/files/{f.id}/move",
            json={"target_drive": LOCKED_DRIVE, "target_folder_path": ""},
        )

        # 404, not 403: a locked drive must not confirm its own existence.
        assert res.status_code == 404
        # And the file must still be where it was, on disk and in the DB.
        assert (open_dir / "clip.mp4").exists()
        assert not (locked_dir / "clip.mp4").exists()
        db.refresh(f)
        assert f.drive == OPEN_DRIVE

    def test_copy_into_locked_drive_is_404(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        f = _seed(db, open_dir, OPEN_DRIVE)

        res = c.post(
            f"/api/files/{f.id}/copy",
            json={"target_drive": LOCKED_DRIVE, "target_folder_path": ""},
        )

        assert res.status_code == 404
        assert not (locked_dir / "clip.mp4").exists()

    def test_move_into_unknown_drive_is_404(self, two_drives):
        c, db, open_dir, _locked_dir = two_drives
        f = _seed(db, open_dir, OPEN_DRIVE)

        res = c.put(
            f"/api/files/{f.id}/move",
            json={"target_drive": "no-such-drive", "target_folder_path": ""},
        )

        # Same status as the locked case, so the response cannot be used to
        # tell "this drive is locked" from "this drive does not exist".
        assert res.status_code == 404

    def test_move_without_target_drive_still_works(self, two_drives):
        c, db, open_dir, _locked_dir = two_drives
        f = _seed(db, open_dir, OPEN_DRIVE)
        (open_dir / "sub").mkdir()

        res = c.put(
            f"/api/files/{f.id}/move",
            json={"target_folder_path": "sub"},
        )

        # A null target_drive means "same drive", which the source check
        # already covered. It must not be treated as a missing drive.
        assert res.status_code == 200
        assert (open_dir / "sub" / "clip.mp4").exists()

    def test_empty_target_drive_means_same_drive(self, two_drives):
        c, db, open_dir, _locked_dir = two_drives
        f = _seed(db, open_dir, OPEN_DRIVE)
        (open_dir / "sub").mkdir()

        res = c.put(
            f"/api/files/{f.id}/move",
            json={"target_drive": "", "target_folder_path": "sub"},
        )

        # ``fileops.move_file`` resolves the destination with
        # ``target_drive or src_drive``, so an empty string has always meant
        # "the drive it is already in" — same as null. The schema has no
        # min_length, so callers can and do send it. Rejecting it would be a
        # silent compatibility break, not a tightening.
        assert res.status_code == 200
        assert (open_dir / "sub" / "clip.mp4").exists()

    def test_empty_target_drive_on_copy_means_same_drive(self, two_drives):
        c, db, open_dir, _locked_dir = two_drives
        f = _seed(db, open_dir, OPEN_DRIVE)
        (open_dir / "sub").mkdir()

        res = c.post(
            f"/api/files/{f.id}/copy",
            json={"target_drive": "", "target_folder_path": "sub"},
        )

        assert res.status_code == 200

    def test_move_into_unlocked_drive_succeeds(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        f = _seed(db, open_dir, OPEN_DRIVE)

        unlock = c.post("/api/auth/unlock", json={"password": LOCKED_PASSWORD})
        assert unlock.status_code == 200

        res = c.put(
            f"/api/files/{f.id}/move",
            json={"target_drive": LOCKED_DRIVE, "target_folder_path": ""},
        )

        # The check gates access, not the feature: once the caller can see
        # the destination, a cross-drive move is still allowed.
        assert res.status_code == 200
        assert (locked_dir / "clip.mp4").exists()
        assert not (open_dir / "clip.mp4").exists()


class TestBatchDestination:
    def test_batch_move_into_locked_drive_is_404(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        a = _seed(db, open_dir, OPEN_DRIVE, "a.mp4")
        b = _seed(db, open_dir, OPEN_DRIVE, "b.mp4")

        res = c.put(
            "/api/files/batch/move",
            json={
                "ids": [a.id, b.id],
                "target_drive": LOCKED_DRIVE,
                "target_folder_path": "",
            },
        )

        # The destination is one value for the whole batch, so it is rejected
        # once, as a request-level 404 — not reported as N per-file errors
        # after some of the files have already been moved.
        assert res.status_code == 404
        assert (open_dir / "a.mp4").exists()
        assert (open_dir / "b.mp4").exists()
        assert not any(locked_dir.iterdir())

    def test_batch_copy_into_locked_drive_is_404(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        a = _seed(db, open_dir, OPEN_DRIVE, "a.mp4")

        res = c.post(
            "/api/files/batch/copy",
            json={
                "ids": [a.id],
                "target_drive": LOCKED_DRIVE,
                "target_folder_path": "",
            },
        )

        assert res.status_code == 404
        assert not any(locked_dir.iterdir())
