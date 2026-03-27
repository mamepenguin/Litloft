import io
import zipfile
from pathlib import Path
from unittest.mock import patch

from tests.conftest import TEST_DRIVE

from app.services.filetype import classify


FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _create_test_zip(drive_dir, filename="test.zip"):
    """Create a small test ZIP file with various entry types."""
    zip_path = drive_dir / filename
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("hello.txt", "Hello, World!")
        # 1x1 red pixel PNG
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
            b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
            b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        zf.writestr("images/photo.png", png_bytes)
        zf.writestr("images/", "")  # directory entry
        zf.writestr("data.bin", b"\x00\x01\x02\x03")
    zip_path.write_bytes(buf.getvalue())
    return zip_path


def _seed_zip(db, drive_dir, filename="test.zip"):
    """Seed a ZIP file into the database."""
    zip_path = _create_test_zip(drive_dir, filename)

    from app.models import File

    file = File(
        filename=filename,
        title="Test Archive",
        drive=TEST_DRIVE,
        folder_path="",
        file_path=filename,
        file_size=zip_path.stat().st_size,
        file_type="archive",
        mime_type="application/zip",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _seed_non_archive(db, drive_dir):
    """Seed a non-archive file (text file) into the database."""
    txt_path = drive_dir / "readme.txt"
    txt_path.write_text("just text")

    from app.models import File

    file = File(
        filename="readme.txt",
        title="Readme",
        drive=TEST_DRIVE,
        folder_path="",
        file_path="readme.txt",
        file_size=txt_path.stat().st_size,
        file_type="document",
        mime_type="text/plain",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestClassifyZip:
    def test_classify_zip(self):
        assert classify("archive.zip") == ("archive", "application/zip")

    def test_classify_zip_uppercase(self):
        assert classify("ARCHIVE.ZIP") == ("archive", "application/zip")


class TestArchiveList:
    def test_archive_list(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_zip(db, drive_dir)

        res = c.get(f"/api/files/{file.id}/archive")
        assert res.status_code == 200

        body = res.json()
        assert "entries" in body
        assert "total_entries" in body
        assert "total_size" in body
        assert body["total_entries"] >= 3  # hello.txt, images/photo.png, data.bin

        # Verify entry structure
        entry_paths = [e["path"] for e in body["entries"]]
        assert "hello.txt" in entry_paths
        assert "images/photo.png" in entry_paths

        # Check an entry has all expected fields
        txt_entry = next(e for e in body["entries"] if e["path"] == "hello.txt")
        assert txt_entry["filename"] == "hello.txt"
        assert txt_entry["file_size"] > 0
        assert txt_entry["compressed_size"] >= 0
        assert txt_entry["is_dir"] is False
        assert txt_entry["file_type"] == "document"
        assert "text/plain" in txt_entry["mime_type"]

        # Check directory entry
        dir_entry = next(
            (e for e in body["entries"] if e["path"] == "images/"), None
        )
        if dir_entry:
            assert dir_entry["is_dir"] is True

        # Entries should be sorted by path
        paths = [e["path"] for e in body["entries"]]
        assert paths == sorted(paths)

    def test_archive_list_not_archive(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_non_archive(db, drive_dir)

        res = c.get(f"/api/files/{file.id}/archive")
        assert res.status_code == 404


class TestArchiveEntry:
    def test_archive_entry_text(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_zip(db, drive_dir)

        res = c.get(
            f"/api/files/{file.id}/archive/entry",
            params={"path": "hello.txt"},
        )
        assert res.status_code == 200
        assert b"Hello, World!" in res.content
        assert "text/plain" in res.headers.get("content-type", "")

    def test_archive_entry_image(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_zip(db, drive_dir)

        res = c.get(
            f"/api/files/{file.id}/archive/entry",
            params={"path": "images/photo.png"},
        )
        assert res.status_code == 200
        assert res.headers.get("content-type") == "image/png"
        assert res.content[:4] == b"\x89PNG"

    def test_archive_entry_not_found(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_zip(db, drive_dir)

        res = c.get(
            f"/api/files/{file.id}/archive/entry",
            params={"path": "nonexistent.txt"},
        )
        assert res.status_code == 404

    def test_archive_entry_path_traversal(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_zip(db, drive_dir)

        res = c.get(
            f"/api/files/{file.id}/archive/entry",
            params={"path": "../etc/passwd"},
        )
        assert res.status_code == 400

    def test_archive_entry_path_traversal_encoded(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_zip(db, drive_dir)

        res = c.get(
            f"/api/files/{file.id}/archive/entry",
            params={"path": "images/../../etc/passwd"},
        )
        assert res.status_code == 400

    def test_archive_entry_size_limit(self, client):
        c, db, drive_dir, data_dir = client

        # Create a ZIP with a large entry (mock the file_size check)
        zip_path = drive_dir / "big.zip"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("big.txt", "x" * 100)  # small actual data
        zip_path.write_bytes(buf.getvalue())

        from app.models import File

        file = File(
            filename="big.zip",
            title="Big Archive",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="big.zip",
            file_size=zip_path.stat().st_size,
            file_type="archive",
            mime_type="application/zip",
        )
        db.add(file)
        db.commit()
        db.refresh(file)

        # Patch the size limit to be very small for testing
        with patch("app.routers.files._ARCHIVE_ENTRY_MAX_SIZE", 50):
            res = c.get(
                f"/api/files/{file.id}/archive/entry",
                params={"path": "big.txt"},
            )
            assert res.status_code == 413

    def test_archive_entry_on_non_archive(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_non_archive(db, drive_dir)

        res = c.get(
            f"/api/files/{file.id}/archive/entry",
            params={"path": "anything"},
        )
        assert res.status_code == 404
