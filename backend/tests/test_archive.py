import io
import zipfile
from pathlib import Path
from unittest.mock import patch
from urllib.parse import quote

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


def _build_sjis_zip_bytes() -> bytes:
    """Build a minimal ZIP with Shift_JIS encoded filenames at byte level.

    Python's zipfile always sets UTF-8 flag for non-ASCII names and stores
    UTF-8 bytes. To simulate a Japanese Windows ZIP, we must write raw
    Shift_JIS bytes with no UTF-8 flag, which requires manual construction.
    """
    import struct
    import zlib

    def deflate(data: bytes) -> bytes:
        # Raw deflate (wbits=-15) matching ZIP's deflate format
        obj = zlib.compressobj(zlib.Z_DEFAULT_COMPRESSION, zlib.DEFLATED, -15)
        return obj.compress(data) + obj.flush()

    def local_header(fname_bytes: bytes, data: bytes, compressed: bytes, is_dir: bool = False) -> bytes:
        crc = zlib.crc32(data) & 0xFFFFFFFF
        return struct.pack(
            "<4sHHHHHIIIHH",
            b"PK\x03\x04",  # signature
            20,              # version needed
            0,               # flags (NO UTF-8 flag)
            8 if not is_dir else 0,  # compression (deflate / store)
            0, 0,            # mod time, mod date
            crc,
            len(compressed) if not is_dir else 0,
            len(data),
            len(fname_bytes),
            0,               # extra field length
        ) + fname_bytes + (compressed if not is_dir else b"")

    def central_dir(fname_bytes: bytes, data: bytes, compressed: bytes, offset: int, is_dir: bool = False) -> bytes:
        crc = zlib.crc32(data) & 0xFFFFFFFF
        ext_attr = (0x10 << 16) if is_dir else 0
        return struct.pack(
            "<4sHHHHHHIIIHHHHHII",
            b"PK\x01\x02",  # signature
            20,              # version made by
            20,              # version needed
            0,               # flags (NO UTF-8 flag)
            8 if not is_dir else 0,
            0, 0,            # mod time, mod date
            crc,
            len(compressed) if not is_dir else 0,
            len(data),
            len(fname_bytes),
            0,               # extra field length
            0,               # comment length
            0,               # disk number start
            0,               # internal attrs
            ext_attr,
            offset,
        ) + fname_bytes

    dir_name = "画像/".encode("cp932")
    file_name = "画像/写真.txt".encode("cp932")
    file_data = b"test content"
    file_compressed = deflate(file_data)

    # Build local headers
    local1 = local_header(dir_name, b"", b"", is_dir=True)
    local2 = local_header(file_name, file_data, file_compressed)

    # Build central directory
    cd1 = central_dir(dir_name, b"", b"", 0, is_dir=True)
    cd2 = central_dir(file_name, file_data, file_compressed, len(local1))

    cd_offset = len(local1) + len(local2)
    cd_size = len(cd1) + len(cd2)

    # End of central directory
    eocd = struct.pack(
        "<4sHHHHIIH",
        b"PK\x05\x06",
        0, 0,            # disk numbers
        2, 2,            # entries
        cd_size,
        cd_offset,
        0,               # comment length
    )

    return local1 + local2 + cd1 + cd2 + eocd


def _create_sjis_zip(drive_dir, filename="sjis.zip"):
    """Create a ZIP with Shift_JIS encoded filenames (simulating Japanese Windows)."""
    zip_path = drive_dir / filename
    zip_path.write_bytes(_build_sjis_zip_bytes())
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


def _seed_zip_raw(db, zip_path):
    """Seed an already-created ZIP file into the database."""
    from app.models import File

    file = File(
        filename=zip_path.name,
        title=zip_path.stem,
        drive=TEST_DRIVE,
        folder_path="",
        file_path=zip_path.name,
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
            assert dir_entry["filename"] == "images"

        # Entries should be sorted by path
        paths = [e["path"] for e in body["entries"]]
        assert paths == sorted(paths)

    def test_archive_list_hides_macos_packaging(self, client):
        """The Finder's sidecar tree is packaging, not content.

        Compressing on macOS adds a `__MACOSX/` AppleDouble for every file and
        a `.DS_Store` per directory. Sorted by path they land at the top of the
        listing, so they are the first thing a reader sees in almost every ZIP
        made on a Mac.
        """
        c, db, drive_dir, data_dir = client
        zip_path = drive_dir / "mac.zip"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("__MACOSX/", "")
            zf.writestr("__MACOSX/._hello.txt", b"\x00\x05\x16\x07")
            zf.writestr("__MACOSX/notes/._draft.txt", b"\x00\x05\x16\x07")
            zf.writestr(".DS_Store", b"\x00\x00\x00\x01Bud1")
            zf.writestr("notes/.DS_Store", b"\x00\x00\x00\x01Bud1")
            zf.writestr("hello.txt", "Hello, World!")
            zf.writestr("notes/draft.txt", "draft")
        zip_path.write_bytes(buf.getvalue())
        file = _seed_zip_raw(db, zip_path)

        res = c.get(f"/api/files/{file.id}/archive")
        assert res.status_code == 200

        paths = [e["path"] for e in res.json()["entries"]]
        assert paths == ["hello.txt", "notes/draft.txt"]

    def test_archive_list_keeps_a_name_that_merely_contains_the_marker(self, client):
        """Only the tree macOS actually writes is dropped, not lookalike names."""
        c, db, drive_dir, data_dir = client
        zip_path = drive_dir / "lookalike.zip"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("docs/__MACOSX_notes.txt", "kept")
            zf.writestr("__MACOSX_backup/report.txt", "kept")
        zip_path.write_bytes(buf.getvalue())
        file = _seed_zip_raw(db, zip_path)

        res = c.get(f"/api/files/{file.id}/archive")
        paths = [e["path"] for e in res.json()["entries"]]
        assert paths == ["__MACOSX_backup/report.txt", "docs/__MACOSX_notes.txt"]

    def test_archive_list_sjis(self, client):
        """Shift_JIS encoded filenames should be decoded correctly."""
        c, db, drive_dir, data_dir = client
        zip_path = _create_sjis_zip(drive_dir)
        file = _seed_zip_raw(db, zip_path)

        res = c.get(f"/api/files/{file.id}/archive")
        assert res.status_code == 200

        body = res.json()
        paths = [e["path"] for e in body["entries"]]
        filenames = [e["filename"] for e in body["entries"]]

        # Verify Japanese characters are properly decoded
        assert any("画像" in p for p in paths), f"Expected '画像' in paths: {paths}"
        assert any("写真" in f for f in filenames), f"Expected '写真' in filenames: {filenames}"

    def test_archive_entry_sjis(self, client):
        """Accessing entries by decoded Shift_JIS path should work."""
        c, db, drive_dir, data_dir = client
        zip_path = _create_sjis_zip(drive_dir)
        file = _seed_zip_raw(db, zip_path)

        # First get the listing to find the decoded path
        list_res = c.get(f"/api/files/{file.id}/archive")
        entries = list_res.json()["entries"]
        text_entry = next(e for e in entries if not e["is_dir"])

        # Access the entry using the decoded path (URL-encode for httpx)
        encoded_path = quote(text_entry["path"], safe="")
        res = c.get(
            f"/api/files/{file.id}/archive/entry?path={encoded_path}",
        )
        assert res.status_code == 200
        assert res.content == b"test content"

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
