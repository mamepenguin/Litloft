import shutil
from pathlib import Path

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir):
    from app.models import Video

    folder = drive_dir / "旅行"
    folder.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", folder / "test.mp4")

    video = Video(
        filename="test.mp4",
        title="Test",
        drive=TEST_DRIVE,
        folder_path="旅行",
        file_path="旅行/test.mp4",
        file_size=folder.joinpath("test.mp4").stat().st_size,
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    # Tamper with file_path to simulate path traversal
    video.file_path = "../../../etc/passwd"
    db.commit()
    return video


class TestPathTraversal:
    def test_stream_blocked(self, client):
        c, db, drive_dir, data_dir = client
        video = _seed(db, drive_dir)
        res = c.get(f"/api/videos/{video.id}/stream")
        assert res.status_code in (403, 404)

    def test_thumbnail_blocked(self, client):
        c, db, drive_dir, data_dir = client
        video = _seed(db, drive_dir)
        video.thumbnail_path = "../../../etc/passwd"
        db.commit()
        res = c.get(f"/api/videos/{video.id}/thumbnail")
        # Should return placeholder or 403, not the file
        assert res.status_code in (200, 403, 404)
        if res.status_code == 200:
            assert res.headers["content-type"] == "image/jpeg"
