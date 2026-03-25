import shutil
from pathlib import Path

import pytest

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_file(db, drive_dir):
    folder = drive_dir / "旅行"
    folder.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "long_video.mp4", folder / "test.mp4")

    from app.models import File

    file = File(
        filename="test.mp4",
        title="Test Video",
        drive=TEST_DRIVE,
        folder_path="旅行",
        file_path="旅行/test.mp4",
        file_size=folder.joinpath("test.mp4").stat().st_size,
        file_type="video",
        mime_type="video/mp4",
        duration=10.0,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestGetFile:
    def test_existing(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.get(f"/api/files/{file.id}")
        assert res.status_code == 200
        assert res.json()["title"] == "Test Video"
        assert res.json()["drive"] == TEST_DRIVE
        assert res.json()["folder_path"] == "旅行"
        assert res.json()["file_type"] == "video"
        assert res.json()["mime_type"] == "video/mp4"

    def test_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/files/zzNOTFOUNDzz")
        assert res.status_code == 404


class TestUpdateFile:
    def test_update_title(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(
            f"/api/files/{file.id}",
            json={"title": "New Title"},
        )
        assert res.status_code == 200
        assert res.json()["title"] == "New Title"

    def test_update_description(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(
            f"/api/files/{file.id}",
            json={"description": "New desc"},
        )
        assert res.status_code == 200
        assert res.json()["description"] == "New desc"

    def test_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.put("/api/files/zzNOTFOUNDzz", json={"title": "x"})
        assert res.status_code == 404


class TestLikeDislike:
    def test_like_increments(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(f"/api/files/{file.id}/like")
        assert res.status_code == 200
        assert res.json()["likes"] == 1

    def test_dislike_decrements(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(f"/api/files/{file.id}/dislike")
        assert res.status_code == 200
        assert res.json()["likes"] == -1

    def test_like_then_dislike(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(f"/api/files/{file.id}/like")
        res = c.post(f"/api/files/{file.id}/dislike")
        assert res.status_code == 200
        assert res.json()["likes"] == 0

    def test_response_has_no_dislikes(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(f"/api/files/{file.id}/like")
        assert "dislikes" not in res.json()

    def test_negative_likes(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(f"/api/files/{file.id}/dislike")
        res = c.post(f"/api/files/{file.id}/dislike")
        assert res.status_code == 200
        assert res.json()["likes"] == -2
