"""Tests for EXIF extraction service and GET /api/files/{id}/exif endpoint."""
import sqlite3
import struct
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

import pytest
from PIL import ExifTags, Image, TiffImagePlugin

import app.services.heic  # noqa: F401  (registers the HEIF opener, as the running backend does)
from app.models import File, FileExif
from app.services import upload as upload_service
from app.services.scanner import _scan_and_register
from tests.conftest import TEST_DRIVE
from app.services.exif import (
    _exposure_time_str,
    _gps_decimal,
    _to_float,
    extract_exif,
)


def _make_plain_jpeg(path: Path) -> Path:
    """Create a plain JPEG with no EXIF tags."""
    img = Image.new("RGB", (100, 100), color=(128, 128, 128))
    img.save(str(path), "JPEG")
    return path


def _make_jpeg_with_exif_piexif(path: Path, **fields) -> Path:
    """Create a JPEG with EXIF using piexif (skip if not available)."""
    piexif = pytest.importorskip("piexif")

    img = Image.new("RGB", (100, 100), color=(128, 128, 128))
    exif_dict: dict = {"0th": {}, "Exif": {}, "GPS": {}}

    if "make" in fields:
        exif_dict["0th"][piexif.ImageIFD.Make] = fields["make"].encode()
    if "model" in fields:
        exif_dict["0th"][piexif.ImageIFD.Model] = fields["model"].encode()
    if "datetime_original" in fields:
        exif_dict["Exif"][piexif.ExifIFD.DateTimeOriginal] = fields["datetime_original"].encode()
    if "f_number" in fields:
        n, d = fields["f_number"]
        exif_dict["Exif"][piexif.ExifIFD.FNumber] = (n, d)
    if "iso_speed" in fields:
        exif_dict["Exif"][piexif.ExifIFD.ISOSpeedRatings] = fields["iso_speed"]
    if "focal_length" in fields:
        n, d = fields["focal_length"]
        exif_dict["Exif"][piexif.ExifIFD.FocalLength] = (n, d)
    if "exposure_time" in fields:
        n, d = fields["exposure_time"]
        exif_dict["Exif"][piexif.ExifIFD.ExposureTime] = (n, d)

    if "gps" in fields:
        gps = fields["gps"]
        # lat/lon as list of (n, d) tuples for degrees, minutes, seconds
        exif_dict["GPS"][piexif.GPSIFD.GPSLatitudeRef] = gps["lat_ref"].encode()
        exif_dict["GPS"][piexif.GPSIFD.GPSLatitude] = gps["lat"]
        exif_dict["GPS"][piexif.GPSIFD.GPSLongitudeRef] = gps["lon_ref"].encode()
        exif_dict["GPS"][piexif.GPSIFD.GPSLongitude] = gps["lon"]

    exif_bytes = piexif.dump(exif_dict)
    img.save(str(path), "JPEG", exif=exif_bytes)
    return path


class TestExtractExif:
    def test_returns_none_for_no_exif(self, tmp_path):
        jpeg = _make_plain_jpeg(tmp_path / "plain.jpg")
        result = extract_exif(jpeg)
        assert result is None

    def test_returns_none_for_error(self, tmp_path):
        result = extract_exif(tmp_path / "nonexistent.jpg")
        assert result is None

    def test_extracts_basic_fields(self, tmp_path):
        path = tmp_path / "with_exif.jpg"
        _make_jpeg_with_exif_piexif(
            path,
            make="Apple",
            model="iPhone 15 Pro",
            datetime_original="2024:03:15 14:23:01",
            f_number=(28, 10),
            iso_speed=400,
            focal_length=(240, 10),
            exposure_time=(1, 250),
        )
        result = extract_exif(path)
        assert result is not None
        assert result["make"] == "Apple"
        assert result["model"] == "iPhone 15 Pro"
        assert result["datetime_original"] == "2024-03-15T14:23:01"
        assert result["f_number"] == pytest.approx(2.8)
        assert result["iso_speed"] == 400
        assert result["focal_length"] == pytest.approx(24.0)
        assert result["exposure_time"] == "1/250"

    def test_gps_decimal_degrees(self, tmp_path):
        path = tmp_path / "gps.jpg"
        # 35°40'34.32" N, 139°39'1.08" E → approx 35.6762, 139.6503
        _make_jpeg_with_exif_piexif(
            path,
            make="TestCam",  # ensure at least one non-GPS field so result is non-None
            gps={
                "lat_ref": "N",
                "lat": [(35, 1), (40, 1), (3432, 100)],
                "lon_ref": "E",
                "lon": [(139, 1), (39, 1), (108, 100)],
            },
        )
        result = extract_exif(path)
        assert result is not None
        assert result["gps_lat"] == pytest.approx(35.6762, abs=0.001)
        assert result["gps_lon"] == pytest.approx(139.6503, abs=0.001)

    def test_returns_none_for_png(self, tmp_path):
        """PNG images have no EXIF; extract_exif should return None."""
        png = tmp_path / "plain.png"
        img = Image.new("RGB", (100, 100), color=(0, 0, 0))
        img.save(str(png), "PNG")
        result = extract_exif(png)
        assert result is None


# UNSPEC: a photo's EXIF is read the same way whatever its container, so a HEIC
# photo from a phone keeps its capture time, camera and location.
@pytest.mark.parametrize(("name", "fmt"), [("a.jpg", "JPEG"), ("a.heic", "HEIF"), ("a.webp", "WEBP"), ("a.tiff", "TIFF")])
def test_exif_is_read_from_every_container(tmp_path, name, fmt):
    exif = _exif_with_everything()
    path = tmp_path / name
    Image.new("RGB", (64, 64), "red").save(path, fmt, exif=exif.tobytes())

    result = extract_exif(path)

    assert result is not None
    assert result["make"] == "Apple"
    assert result["model"] == "iPhone 15 Pro"
    assert result["datetime_original"] == "2024-03-15T14:23:01"
    assert result["f_number"] == pytest.approx(2.8)
    assert result["exposure_time"] == "1/250"
    assert result["iso_speed"] == 400
    assert result["focal_length"] == pytest.approx(24.0)
    assert result["gps_lat"] == pytest.approx(-35.6762, abs=0.001)
    assert result["gps_lon"] == pytest.approx(-139.6503, abs=0.001)


def _exif_with_everything(taken="2024:03:15 14:23:01"):
    exif = Image.Exif()
    exif[ExifTags.Base.Make] = "Apple"
    exif[ExifTags.Base.Model] = "iPhone 15 Pro"
    details = exif.get_ifd(ExifTags.IFD.Exif)
    details[ExifTags.Base.DateTimeOriginal] = taken
    details[ExifTags.Base.FNumber] = TiffImagePlugin.IFDRational(28, 10)
    details[ExifTags.Base.ExposureTime] = TiffImagePlugin.IFDRational(1, 250)
    details[ExifTags.Base.ISOSpeedRatings] = 400
    details[ExifTags.Base.FocalLength] = TiffImagePlugin.IFDRational(240, 10)
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    gps[ExifTags.GPS.GPSLatitudeRef] = "S"
    gps[ExifTags.GPS.GPSLatitude] = (35.0, 40.0, 34.32)
    gps[ExifTags.GPS.GPSLongitudeRef] = "W"
    gps[ExifTags.GPS.GPSLongitude] = (139.0, 39.0, 1.08)
    return exif


def _photo_bytes(fmt="JPEG", exif=None):
    buffer = BytesIO()
    options = {"exif": exif.tobytes()} if exif is not None else {}
    Image.new("RGB", (64, 64), "red").save(buffer, fmt, **options)
    return buffer.getvalue()


def _upload(c, filename, payload):
    res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
        "filename": filename,
        "file_size": len(payload),
        "folder_path": "",
        "chunk_size": len(payload),
    })
    assert res.status_code == 200, res.text
    upload_id = res.json()["upload_id"]
    res = c.post(
        f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
        data={"chunk_index": "0"},
        files={"chunk": ("chunk", BytesIO(payload), "application/octet-stream")},
    )
    assert res.status_code == 200, res.text
    res = c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
    assert res.status_code == 200, res.text
    return res.json()["id"]


# UNSPEC: a photo has its EXIF as soon as it is in the library, however it got
# there, so nobody has to rescan before its capture time and location appear.
class TestEveryWayIn:
    @pytest.mark.parametrize(("name", "fmt"), [("a.jpg", "JPEG"), ("a.heic", "HEIF")])
    def test_an_uploaded_photo_has_its_exif_at_once(self, client, name, fmt):
        c, _, _, _ = client

        file_id = _upload(c, name, _photo_bytes(fmt, _exif_with_everything()))

        res = c.get(f"/api/files/{file_id}/exif")
        assert res.status_code == 200, res.text
        assert res.json()["datetime_original"] == "2024-03-15T14:23:01"
        assert res.json()["gps_lat"] == pytest.approx(-35.6762, abs=0.001)

    def test_re_uploading_over_a_path_replaces_the_exif(self, client):
        c, _, drive_dir, _ = client
        first = _upload(c, "a.jpg", _photo_bytes(exif=_exif_with_everything()))
        # The API rejects an upload onto a live path. A file gone from disk keeps
        # its row, and an upload to that path revives the row.
        (drive_dir / "a.jpg").unlink()

        second = _upload(c, "a.jpg", _photo_bytes(exif=_exif_with_everything("2025:01:02 03:04:05")))

        assert second == first
        assert c.get(f"/api/files/{second}/exif").json()["datetime_original"] == "2025-01-02T03:04:05"

    def test_re_uploading_a_photo_without_exif_removes_the_old_exif(self, client):
        c, _, drive_dir, _ = client
        first = _upload(c, "a.jpg", _photo_bytes(exif=_exif_with_everything()))
        # The API rejects an upload onto a live path. A file gone from disk keeps
        # its row, and an upload to that path revives the row.
        (drive_dir / "a.jpg").unlink()

        second = _upload(c, "a.jpg", _photo_bytes())

        assert second == first
        assert c.get(f"/api/files/{second}/exif").status_code == 404

    def test_reading_an_upload_holds_no_write_lock(self, client, monkeypatch):
        # A large PNG with no eXIf chunk is decoded whole by this read, and every
        # other writer would wait on it.
        c, db, _, _ = client
        path = db.get_bind().url.database
        writable = []

        def read_while_another_connection_writes(image_path):
            other = sqlite3.connect(path, timeout=0)
            try:
                other.execute("BEGIN IMMEDIATE")
                other.rollback()
                writable.append(True)
            except sqlite3.OperationalError:
                writable.append(False)
            finally:
                other.close()
            return None

        monkeypatch.setattr(upload_service, "extract_exif", read_while_another_connection_writes)

        _upload(c, "a.png", _photo_bytes("PNG"))

        assert writable == [True]

    def test_a_scan_reads_a_photo_it_finds_and_one_with_no_exif_row(self, client):
        # The second case is every HEIC already in a library: a row, and no EXIF.
        c, db, drive_dir, _ = client
        (drive_dir / "a.heic").write_bytes(_photo_bytes("HEIF", _exif_with_everything()))

        _scan_and_register(db, TEST_DRIVE)
        db.commit()
        record = db.query(File).filter(File.filename == "a.heic").one()
        assert c.get(f"/api/files/{record.id}/exif").json()["datetime_original"] == "2024-03-15T14:23:01"

        db.delete(db.get(FileExif, record.id))
        db.commit()
        assert c.get(f"/api/files/{record.id}/exif").status_code == 404

        _scan_and_register(db, TEST_DRIVE)
        db.commit()
        res = c.get(f"/api/files/{record.id}/exif")
        assert res.status_code == 200, res.text
        assert res.json()["gps_lat"] == pytest.approx(-35.6762, abs=0.001)

    def test_a_copied_photo_has_the_same_exif(self, client):
        c, _, _, _ = client
        source = _upload(c, "a.jpg", _photo_bytes(exif=_exif_with_everything()))

        res = c.post(f"/api/files/{source}/copy", json={"target_folder_path": ""})
        assert res.status_code == 200, res.text
        copy = res.json()["id"]

        assert copy != source
        assert c.get(f"/api/files/{copy}/exif").json() == c.get(f"/api/files/{source}/exif").json()

    def test_copying_a_photo_without_exif_leaves_none(self, client):
        c, _, _, _ = client
        source = _upload(c, "a.jpg", _photo_bytes())

        res = c.post(f"/api/files/{source}/copy", json={"target_folder_path": ""})
        assert res.status_code == 200, res.text

        assert c.get(f"/api/files/{res.json()['id']}/exif").status_code == 404


class TestHelpers:
    def test_to_float_rational(self):
        class Rational:
            def __init__(self, n, d):
                self.numerator = n
                self.denominator = d

        assert _to_float(Rational(28, 10)) == pytest.approx(2.8)
        assert _to_float(Rational(5, 0)) is None

    def test_to_float_tuple(self):
        assert _to_float((1, 250)) == pytest.approx(0.004)
        assert _to_float((5, 0)) is None

    def test_exposure_time_str_unit_fraction(self):
        assert _exposure_time_str((1, 250)) == "1/250"

    def test_exposure_time_str_reducible(self):
        assert _exposure_time_str((2, 500)) == "1/250"

    def test_exposure_time_str_whole(self):
        assert _exposure_time_str((4, 1)) == "4"

    def test_gps_decimal_north(self):
        result = _gps_decimal([(35, 1), (40, 1), (0, 1)], "N")
        assert result == pytest.approx(35 + 40 / 60, abs=0.001)

    def test_gps_decimal_south(self):
        result = _gps_decimal([(10, 1), (0, 1), (0, 1)], "S")
        assert result == pytest.approx(-10.0, abs=0.001)

    def test_gps_decimal_west(self):
        result = _gps_decimal([(139, 1), (39, 1), (0, 1)], "W")
        assert result == pytest.approx(-139.65, abs=0.01)


class TestExifEndpoint:
    def test_returns_exif_for_image(self, client):
        test_client, session, drive_dir, data_dir = client

        file_record = File(
            id="aaaaaaaaaaaa",
            filename="photo.jpg",
            title="Photo",
            drive="test-drive",
            folder_path="",
            file_path="photo.jpg",
            file_size=1024,
            file_type="image",
            mime_type="image/jpeg",
        )
        session.add(file_record)
        session.flush()

        exif_record = FileExif(
            file_id="aaaaaaaaaaaa",
            datetime_original="2024-03-15T14:23:01",
            make="Apple",
            model="iPhone 15 Pro",
            f_number=2.8,
            exposure_time="1/250",
            iso_speed=400,
            focal_length=24.0,
            gps_lat=35.6762,
            gps_lon=139.6503,
        )
        session.add(exif_record)
        session.commit()

        response = test_client.get("/api/files/aaaaaaaaaaaa/exif")
        assert response.status_code == 200
        data = response.json()
        assert data["make"] == "Apple"
        assert data["model"] == "iPhone 15 Pro"
        assert data["datetime_original"] == "2024-03-15T14:23:01"
        assert data["f_number"] == pytest.approx(2.8)
        assert data["exposure_time"] == "1/250"
        assert data["iso_speed"] == 400
        assert data["focal_length"] == pytest.approx(24.0)
        assert data["gps_lat"] == pytest.approx(35.6762)
        assert data["gps_lon"] == pytest.approx(139.6503)

    def test_404_for_no_exif(self, client):
        test_client, session, drive_dir, data_dir = client

        file_record = File(
            id="bbbbbbbbbbbb",
            filename="photo.jpg",
            title="Photo",
            drive="test-drive",
            folder_path="",
            file_path="photo_no_exif.jpg",
            file_size=512,
            file_type="image",
            mime_type="image/jpeg",
        )
        session.add(file_record)
        session.commit()

        response = test_client.get("/api/files/bbbbbbbbbbbb/exif")
        assert response.status_code == 404

    def test_404_for_non_image(self, client):
        test_client, session, drive_dir, data_dir = client

        file_record = File(
            id="cccccccccccc",
            filename="video.mp4",
            title="Video",
            drive="test-drive",
            folder_path="",
            file_path="video.mp4",
            file_size=1024 * 1024,
            file_type="video",
            mime_type="video/mp4",
        )
        session.add(file_record)
        session.commit()

        response = test_client.get("/api/files/cccccccccccc/exif")
        assert response.status_code == 404

    def test_404_for_missing_file(self, client):
        response = client[0].get("/api/files/zzzzzzzzzzzz/exif")
        assert response.status_code == 404

    def test_nullable_fields_returned_as_null(self, client):
        test_client, session, drive_dir, data_dir = client

        file_record = File(
            id="dddddddddddd",
            filename="minimal.jpg",
            title="Minimal",
            drive="test-drive",
            folder_path="",
            file_path="minimal.jpg",
            file_size=512,
            file_type="image",
            mime_type="image/jpeg",
        )
        session.add(file_record)
        session.flush()

        exif_record = FileExif(
            file_id="dddddddddddd",
            make="Sony",
        )
        session.add(exif_record)
        session.commit()

        response = test_client.get("/api/files/dddddddddddd/exif")
        assert response.status_code == 200
        data = response.json()
        assert data["make"] == "Sony"
        assert data["model"] is None
        assert data["f_number"] is None
        assert data["gps_lat"] is None
        assert data["gps_lon"] is None
