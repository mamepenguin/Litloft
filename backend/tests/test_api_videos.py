import shutil
from pathlib import Path

import pytest

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_video(db, drive_dir):
    folder = drive_dir / "旅行"
    folder.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "long_video.mp4", folder / "test.mp4")

    from app.models import Video

    video = Video(
        filename="test.mp4",
        title="Test Video",
        drive=TEST_DRIVE,
        folder_path="旅行",
        file_path="旅行/test.mp4",
        file_size=folder.joinpath("test.mp4").stat().st_size,
        duration=10.0,
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    return video


class TestGetVideo:
    def test_existing(self, client):
        c, db, drive_dir, data_dir = client
        video = _seed_video(db, drive_dir)
        res = c.get(f"/api/videos/{video.id}")
        assert res.status_code == 200
        assert res.json()["title"] == "Test Video"
        assert res.json()["drive"] == TEST_DRIVE
        assert res.json()["folder_path"] == "旅行"

    def test_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/videos/999")
        assert res.status_code == 404


class TestUpdateVideo:
    def test_update_title(self, client):
        c, db, drive_dir, data_dir = client
        video = _seed_video(db, drive_dir)
        res = c.put(
            f"/api/videos/{video.id}",
            json={"title": "New Title"},
        )
        assert res.status_code == 200
        assert res.json()["title"] == "New Title"

    def test_update_description(self, client):
        c, db, drive_dir, data_dir = client
        video = _seed_video(db, drive_dir)
        res = c.put(
            f"/api/videos/{video.id}",
            json={"description": "New desc"},
        )
        assert res.status_code == 200
        assert res.json()["description"] == "New desc"

    def test_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.put("/api/videos/999", json={"title": "x"})
        assert res.status_code == 404
