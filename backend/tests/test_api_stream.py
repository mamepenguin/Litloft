import hashlib
import shutil
from pathlib import Path

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir):
    folder = drive_dir / "旅行"
    folder.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "long_video.mp4", folder / "test.mp4")

    from app.models import File

    file = File(
        filename="test.mp4",
        title="Test",
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


class TestStreamFile:
    def test_full_stream(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        assert res.headers["content-type"] == "video/mp4"
        assert res.headers["accept-ranges"] == "bytes"

    def test_range_request(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.get(
            f"/api/files/{file.id}/stream",
            headers={"Range": "bytes=0-1023"},
        )
        assert res.status_code == 206
        assert res.headers["content-type"] == "video/mp4"
        assert "content-range" in res.headers
        assert res.headers["content-length"] == "1024"
        assert len(res.content) == 1024

    def test_range_open_end(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.get(
            f"/api/files/{file.id}/stream",
            headers={"Range": "bytes=0-"},
        )
        assert res.status_code == 206
        assert "content-range" in res.headers

    def test_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/files/zzNOTFOUNDzz/stream")
        assert res.status_code == 404

    def test_text_file_returns_etag(self, client):
        """Small text files should include an ETag header so editors can
        use optimistic locking without client-side hashing (crypto.subtle
        is unavailable outside secure contexts)."""
        c, db, drive_dir, _ = client
        content = "# hello\nworld\n"
        note_path = drive_dir / "note.md"
        note_path.write_text(content)

        from app.models import File

        file = File(
            filename="note.md",
            title="note",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="note.md",
            file_size=len(content.encode("utf-8")),
            file_type="document",
            mime_type="text/markdown",
        )
        db.add(file)
        db.commit()
        db.refresh(file)

        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        assert res.headers["content-type"] == "text/markdown"
        assert res.text == content
        expected = hashlib.sha256(content.encode("utf-8")).hexdigest()
        assert res.headers.get("etag") == f'"{expected}"'


class TestThumbnail:
    def test_placeholder(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/thumbnail")
        assert res.status_code == 200
        assert res.headers["content-type"] == "image/jpeg"

    def test_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/files/zzNOTFOUNDzz/thumbnail")
        assert res.status_code == 404
