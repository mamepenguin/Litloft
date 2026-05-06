"""Tests for EXIF extraction service and GET /api/files/{id}/exif endpoint."""
import struct
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from app.models import File, FileExif
from app.services.exif import (
    _exposure_time_str,
    _gps_decimal,
    _to_float,
    extract_exif,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Unit tests for extract_exif()
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Unit tests for helper functions
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Endpoint tests (use DB only, no real image files needed)
# ---------------------------------------------------------------------------

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
