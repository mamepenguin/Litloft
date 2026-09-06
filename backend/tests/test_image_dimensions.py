"""Pixel dimensions on ``File`` — spec 2026-09-06-ui-redesign-p4-viewers §1.

The justified image grid lays a row out by aspect ratio, and nothing in the
tree could supply one: thumbnails are letterboxed to 320x180, so the browser
reports 16:9 for every image. These tests pin the columns the scanner fills.
"""

import io
import json

import pytest
from PIL import Image

import app.config as config
from app.models import File
from app.services import scanner as scanner_module
from app.services.image_dimensions import read_image_dimensions
from app.services.scanner import _scan_and_register, register_single_file
from tests.conftest import TEST_DRIVE

# Distinct per format so a test cannot pass by reading the wrong file.
FORMAT_SIZES = {
    "jpeg": (321, 123),
    "png": (222, 444),
    "gif": (150, 90),
    "heic": (260, 130),
}


def _write_image(path, size, fmt):
    img = Image.new("RGB", size, (200, 40, 40))
    if fmt == "heic":
        import pillow_heif

        pillow_heif.register_heif_opener()
        img.save(path, format="HEIF")
    else:
        img.save(path, format=fmt.upper())


@pytest.fixture()
def drive(tmp_path, monkeypatch):
    drive_dir = tmp_path / "drive"
    drive_dir.mkdir()
    drives_json = tmp_path / "drives.json"
    drives_json.write_text(json.dumps([{"name": "test-drive", "path": str(drive_dir)}]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "_drives_cache", None)
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    return drive_dir


class TestReadImageDimensions:
    @pytest.mark.parametrize("fmt", ["jpeg", "png", "gif", "heic"])
    def test_reads_the_pixel_size_of_every_supported_format(self, fmt, tmp_path):
        suffix = {"jpeg": ".jpg", "png": ".png", "gif": ".gif", "heic": ".heic"}[fmt]
        path = tmp_path / f"photo{suffix}"
        _write_image(path, FORMAT_SIZES[fmt], fmt)

        assert read_image_dimensions(path) == FORMAT_SIZES[fmt]

    def test_reports_the_size_the_viewer_sees_not_the_stored_one(self, tmp_path):
        """A portrait phone photo stores landscape pixels plus Orientation.

        Measured, not assumed: for a 400x200 JPEG tagged Orientation=6,
        this repo's own ``generate_image_thumbnail`` produces a 320x180
        letterbox whose content band is 90px wide — i.e. 90x180, upright.
        A dimension read that ignored the tag would hand the justified
        grid 2:1 for a picture the app itself renders 1:2.
        """
        path = tmp_path / "portrait.jpg"
        img = Image.new("RGB", (400, 200), (220, 30, 30))
        exif = img.getexif()
        exif[0x0112] = 6
        img.save(path, format="JPEG", exif=exif.tobytes())

        assert read_image_dimensions(path) == (200, 400)

    @pytest.mark.parametrize("orientation", [1, 2, 3, 4])
    def test_leaves_the_axes_alone_for_orientations_that_do_not_turn(
        self, orientation, tmp_path
    ):
        # 1-4 are identity, mirror, half turn and mirrored half turn.
        # Swapping there would break the images that were already right.
        path = tmp_path / f"o{orientation}.jpg"
        img = Image.new("RGB", (400, 200), (30, 30, 220))
        exif = img.getexif()
        exif[0x0112] = orientation
        img.save(path, format="JPEG", exif=exif.tobytes())

        assert read_image_dimensions(path) == (400, 200)

    def test_returns_none_for_a_file_that_is_not_an_image(self, tmp_path):
        path = tmp_path / "notes.txt"
        path.write_text("not an image")

        assert read_image_dimensions(path) is None


class TestScannerFillsDimensions:
    @pytest.mark.parametrize("fmt", ["jpeg", "png", "gif", "heic"])
    def test_a_newly_registered_image_carries_its_size(
        self, fmt, drive, db_session
    ):
        suffix = {"jpeg": ".jpg", "png": ".png", "gif": ".gif", "heic": ".heic"}[fmt]
        path = drive / f"photo{suffix}"
        _write_image(path, FORMAT_SIZES[fmt], fmt)

        file_id = register_single_file(db_session, "test-drive", path)
        db_session.commit()

        record = db_session.get(File, file_id)
        assert (record.image_width, record.image_height) == FORMAT_SIZES[fmt]

    def test_a_file_that_is_not_an_image_keeps_null_dimensions(
        self, drive, db_session
    ):
        path = drive / "notes.txt"
        path.write_text("hello")

        file_id = register_single_file(db_session, "test-drive", path)
        db_session.commit()

        record = db_session.get(File, file_id)
        assert record.image_width is None
        assert record.image_height is None

    def test_a_full_scan_fills_dimensions_for_new_images(self, drive, db_session):
        _write_image(drive / "photo.png", FORMAT_SIZES["png"], "png")

        _scan_and_register(db_session, "test-drive")
        db_session.commit()

        record = db_session.query(File).filter(File.filename == "photo.png").one()
        assert (record.image_width, record.image_height) == FORMAT_SIZES["png"]


class TestBackfill:
    """A drive scanned before the columns existed has rows with a NULL width.

    The scanner fills those in on the next pass, and opens nothing else —
    a rescan of a large drive must not re-read every file to learn what it
    already knows.
    """

    def _record_dimension_reads(self, monkeypatch):
        """Record which paths the scanner asks for dimensions.

        Counting ``Image.open`` itself would be counting the wrong thing:
        the name lives on the shared ``PIL.Image`` module, so a patch there
        also catches the EXIF and thumbnail readers and says nothing about
        this pass.
        """
        read = []

        def recording_read(path):
            read.append(str(path))
            return read_image_dimensions(path)

        monkeypatch.setattr(scanner_module, "read_image_dimensions", recording_read)
        return read

    def test_only_images_without_a_width_are_reopened(
        self, drive, db_session, monkeypatch
    ):
        _write_image(drive / "old.png", (640, 480), "png")
        _write_image(drive / "known.png", (100, 200), "png")
        (drive / "notes.txt").write_text("text")
        (drive / "doc.pdf").write_bytes(b"%PDF-1.4\n%stub\n")

        # First pass registers everything; the second is the one under test.
        _scan_and_register(db_session, "test-drive")
        db_session.commit()

        # Put one row back into the pre-migration shape.
        old = db_session.query(File).filter(File.filename == "old.png").one()
        old.image_width = None
        old.image_height = None
        db_session.commit()

        read = self._record_dimension_reads(monkeypatch)
        _scan_and_register(db_session, "test-drive")
        db_session.commit()

        assert [p.rsplit("/", 1)[-1] for p in read] == ["old.png"]

        refreshed = db_session.query(File).filter(File.filename == "old.png").one()
        assert (refreshed.image_width, refreshed.image_height) == (640, 480)

    def test_the_population_is_not_empty(self, drive, db_session, monkeypatch):
        """Guard for the assertion above: "only old.png was opened" is also
        true when the scanner opens nothing at all, so the fixture has to
        prove there was something to skip."""
        _write_image(drive / "known.png", (100, 200), "png")
        (drive / "notes.txt").write_text("text")

        _scan_and_register(db_session, "test-drive")
        db_session.commit()

        rows = db_session.query(File).all()
        assert len(rows) == 2
        assert sum(1 for r in rows if r.file_type == "image") == 1
        assert sum(1 for r in rows if r.file_type != "image") == 1


def _upload(c, drive, filename, payload, folder=""):
    """Push one file through the chunked upload API. Returns the response."""
    res = c.post(f"/api/drives/{drive}/upload/init", json={
        "filename": filename,
        "file_size": len(payload),
        "folder_path": folder,
        "chunk_size": len(payload),
    })
    assert res.status_code == 200, res.text
    upload_id = res.json()["upload_id"]
    res = c.post(
        f"/api/drives/{drive}/upload/{upload_id}/chunk",
        data={"chunk_index": "0"},
        files={"chunk": ("chunk", io.BytesIO(payload), "application/octet-stream")},
    )
    assert res.status_code == 200, res.text
    return c.post(f"/api/drives/{drive}/upload/{upload_id}/complete")


def _png_bytes(size):
    buf = io.BytesIO()
    Image.new("RGB", size, (10, 120, 200)).save(buf, format="PNG")
    return buf.getvalue()


class TestUploadPath:
    """An upload has the file in hand; it must not leave the columns to
    the scanner.

    The re-upload case is the one that cannot self-heal: the row keeps a
    non-NULL width from the picture it used to hold, and the backfill
    only visits rows where the width is still NULL.
    """

    def test_an_uploaded_image_carries_its_size(self, client):
        c, db, drive_dir, _ = client

        res = _upload(c, TEST_DRIVE, "shot.png", _png_bytes((640, 400)))
        assert res.status_code == 200, res.text

        record = db.query(File).filter(File.filename == "shot.png").one()
        assert (record.image_width, record.image_height) == (640, 400)

    def test_re_uploading_over_a_path_replaces_the_size(self, client):
        c, db, drive_dir, _ = client

        assert _upload(c, TEST_DRIVE, "shot.png", _png_bytes((640, 400))).status_code == 200
        first = db.query(File).filter(File.filename == "shot.png").one()
        assert (first.image_width, first.image_height) == (640, 400)

        # The API rejects an upload onto a live path, so clear the way the
        # same manner a user would: the record survives, the file does not.
        (drive_dir / "shot.png").unlink()

        assert _upload(c, TEST_DRIVE, "shot.png", _png_bytes((200, 900))).status_code == 200
        db.expire_all()
        second = db.query(File).filter(File.filename == "shot.png").one()
        assert (second.image_width, second.image_height) == (200, 900)

    def test_an_uploaded_non_image_keeps_null_dimensions(self, client):
        c, db, _, _ = client

        assert _upload(c, TEST_DRIVE, "notes.txt", b"hello").status_code == 200

        record = db.query(File).filter(File.filename == "notes.txt").one()
        assert record.image_width is None
        assert record.image_height is None


class TestApiExposesTheColumns:
    """The listing that lays rows out by ratio reads them over HTTP.

    Both fields default to ``None`` on the schema, so a field the API
    never populates still serialises — the response has to be asserted,
    not just the row.
    """

    def test_the_file_endpoint_returns_the_size(self, client):
        c, db, drive_dir, _ = client

        assert _upload(c, TEST_DRIVE, "shot.png", _png_bytes((640, 400))).status_code == 200
        record = db.query(File).filter(File.filename == "shot.png").one()

        body = c.get(f"/api/files/{record.id}").json()
        assert body["image_width"] == 640
        assert body["image_height"] == 400

    def test_a_non_image_reports_null(self, client):
        c, db, _, _ = client

        assert _upload(c, TEST_DRIVE, "notes.txt", b"hello").status_code == 200
        record = db.query(File).filter(File.filename == "notes.txt").one()

        body = c.get(f"/api/files/{record.id}").json()
        assert body["image_width"] is None
        assert body["image_height"] is None


class TestCopyPath:
    """A copy is the same picture, so it is the same size.

    Leaving them NULL would self-heal on the next scan, but only after a
    scan; the copy is visible in the listing before that.
    """

    def test_a_copy_carries_the_size_of_its_source(self, client):
        c, db, drive_dir, _ = client

        assert _upload(c, TEST_DRIVE, "shot.png", _png_bytes((640, 400))).status_code == 200
        source = db.query(File).filter(File.filename == "shot.png").one()

        res = c.post(f"/api/files/{source.id}/copy", json={"target_folder_path": "copies"})
        assert res.status_code == 200, res.text

        assert res.json()["image_width"] == 640
        assert res.json()["image_height"] == 400
