import shutil
from pathlib import Path

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir):
    folder = drive_dir / "旅行"
    folder.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "long_video.mp4", folder / "test.mp4")

    from app.models import Video

    video = Video(
        filename="test.mp4",
        title="Test",
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


class TestStreamVideo:
    def test_full_stream(self, client):
        c, db, drive_dir, data_dir = client
        video = _seed(db, drive_dir)
        res = c.get(f"/api/videos/{video.id}/stream")
        assert res.status_code == 200
        assert res.headers["content-type"] == "video/mp4"
        assert res.headers["accept-ranges"] == "bytes"

    def test_range_request(self, client):
        c, db, drive_dir, data_dir = client
        video = _seed(db, drive_dir)
        res = c.get(
            f"/api/videos/{video.id}/stream",
            headers={"Range": "bytes=0-1023"},
        )
        assert res.status_code == 206
        assert res.headers["content-type"] == "video/mp4"
        assert "content-range" in res.headers
        assert res.headers["content-length"] == "1024"
        assert len(res.content) == 1024

    def test_range_open_end(self, client):
        c, db, drive_dir, data_dir = client
        video = _seed(db, drive_dir)
        res = c.get(
            f"/api/videos/{video.id}/stream",
            headers={"Range": "bytes=0-"},
        )
        assert res.status_code == 206
        assert "content-range" in res.headers

    def test_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/videos/999/stream")
        assert res.status_code == 404


class TestThumbnail:
    def test_placeholder(self, client):
        c, db, drive_dir, data_dir = client
        video = _seed(db, drive_dir)
        res = c.get(f"/api/videos/{video.id}/thumbnail")
        assert res.status_code == 200
        assert res.headers["content-type"] == "image/jpeg"

    def test_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/videos/999/thumbnail")
        assert res.status_code == 404
