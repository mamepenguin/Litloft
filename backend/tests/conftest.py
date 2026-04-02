import os
import json
import shutil
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker


def _enable_fk(engine):
    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

from app.database import Base, get_db
from app.main import app

FIXTURES_DIR = Path(__file__).parent / "fixtures"
TEST_DRIVE = "test-drive"


@pytest.fixture()
def tmp_dirs(tmp_path):
    videos_dir = tmp_path / "videos"
    data_dir = tmp_path / "data"
    videos_dir.mkdir()
    data_dir.mkdir()
    return videos_dir, data_dir


@pytest.fixture()
def db_session(tmp_path):
    db_path = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    _enable_fk(engine)
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(tmp_path):
    db_path = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    _enable_fk(engine)
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    drive_dir = tmp_path / "drives" / "default"
    drive_dir.mkdir(parents=True)
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    # Create drives.json for test
    drives_json = tmp_path / "drives.json"
    drives_json.write_text(json.dumps([
        {"name": TEST_DRIVE, "path": str(drive_dir)}
    ]))

    import app.config as config
    orig_drives_config = config.DRIVES_CONFIG
    orig_data = config.DATA_DIR
    orig_thumbs = config.THUMBNAILS_DIR
    orig_converted = config.CONVERTED_DIR
    orig_previews = config.PREVIEWS_DIR
    orig_cache = config._drives_cache

    config.DRIVES_CONFIG = drives_json
    config.DATA_DIR = data_dir
    config.THUMBNAILS_DIR = data_dir / "thumbnails"
    config.CONVERTED_DIR = data_dir / "converted"
    config.PREVIEWS_DIR = data_dir / "previews"
    config._drives_cache = None  # Reset cache so new config is loaded

    with TestClient(app) as c:
        yield c, TestSession(), drive_dir, data_dir

    config.DRIVES_CONFIG = orig_drives_config
    config.DATA_DIR = orig_data
    config.THUMBNAILS_DIR = orig_thumbs
    config.CONVERTED_DIR = orig_converted
    config.PREVIEWS_DIR = orig_previews
    config._drives_cache = orig_cache
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture()
def sample_video():
    return FIXTURES_DIR / "long_video.mp4"


@pytest.fixture()
def short_video():
    return FIXTURES_DIR / "short_video.mp4"
