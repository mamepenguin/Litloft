import os
import shutil
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

FIXTURES_DIR = Path(__file__).parent / "fixtures"


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
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    videos_dir = tmp_path / "videos"
    videos_dir.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    import app.config as config
    orig_videos = config.VIDEOS_DIR
    orig_data = config.DATA_DIR
    orig_thumbs = config.THUMBNAILS_DIR

    config.VIDEOS_DIR = videos_dir
    config.DATA_DIR = data_dir
    config.THUMBNAILS_DIR = data_dir / "thumbnails"

    with TestClient(app) as c:
        yield c, TestSession(), videos_dir, data_dir

    config.VIDEOS_DIR = orig_videos
    config.DATA_DIR = orig_data
    config.THUMBNAILS_DIR = orig_thumbs
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture()
def sample_video():
    return FIXTURES_DIR / "long_video.mp4"


@pytest.fixture()
def short_video():
    return FIXTURES_DIR / "short_video.mp4"
