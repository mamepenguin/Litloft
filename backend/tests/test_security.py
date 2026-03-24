import shutil
from pathlib import Path

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir):
    from app.models import File

    folder = drive_dir / "旅行"
    folder.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", folder / "test.mp4")

    file = File(
        filename="test.mp4",
        title="Test",
        drive=TEST_DRIVE,
        folder_path="旅行",
        file_path="旅行/test.mp4",
        file_size=folder.joinpath("test.mp4").stat().st_size,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(file)
    db.commit()
    db.refresh(file)

    # Tamper with file_path to simulate path traversal
    file.file_path = "../../../etc/passwd"
    db.commit()
    return file


class TestPathTraversal:
    def test_stream_blocked(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code in (403, 404)

    def test_thumbnail_blocked(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        file.thumbnail_path = "../../../etc/passwd"
        db.commit()
        res = c.get(f"/api/files/{file.id}/thumbnail")
        # Should return placeholder or 403, not the file
        assert res.status_code in (200, 403, 404)
        if res.status_code == 200:
            assert res.headers["content-type"] == "image/jpeg"
