import logging
from math import gcd
from pathlib import Path

from PIL import Image
from PIL.ExifTags import GPSTAGS, TAGS

logger = logging.getLogger(__name__)


def _to_float(value) -> float | None:
    """Convert IFDRational or tuple (numerator, denominator) to float."""
    try:
        if hasattr(value, "numerator") and hasattr(value, "denominator"):
            if value.denominator == 0:
                return None
            return float(value.numerator) / float(value.denominator)
        if isinstance(value, tuple) and len(value) == 2:
            if value[1] == 0:
                return None
            return float(value[0]) / float(value[1])
        return float(value)
    except Exception:
        return None


def _exposure_time_str(value) -> str | None:
    """Convert shutter speed rational to string like '1/250'."""
    try:
        if hasattr(value, "numerator") and hasattr(value, "denominator"):
            n, d = int(value.numerator), int(value.denominator)
        elif isinstance(value, tuple) and len(value) == 2:
            n, d = int(value[0]), int(value[1])
        else:
            return str(value)
        if d == 0:
            return None
        if n == 1:
            return f"1/{d}"
        g = gcd(n, d)
        n, d = n // g, d // g
        if d == 1:
            return str(n)
        return f"{n}/{d}"
    except Exception:
        return None


def _gps_decimal(coord, ref) -> float | None:
    """Convert GPS DMS (degrees, minutes, seconds) to decimal degrees."""
    try:
        degrees = _to_float(coord[0])
        minutes = _to_float(coord[1])
        seconds = _to_float(coord[2])
        if degrees is None or minutes is None or seconds is None:
            return None
        decimal = degrees + minutes / 60 + seconds / 3600
        if ref in ("S", "W"):
            decimal = -decimal
        return decimal
    except Exception:
        return None


def extract_exif(image_path: Path) -> dict | None:
    """Extract EXIF from image, return normalized dict or None."""
    try:
        with Image.open(image_path) as img:
            raw = img._getexif()
        if not raw:
            return None

        tag_map = {v: k for k, v in TAGS.items()}

        def get_tag(name):
            tag_id = tag_map.get(name)
            if tag_id is None:
                return None
            return raw.get(tag_id)

        # Datetime
        dt_raw = get_tag("DateTimeOriginal")
        datetime_original = None
        if dt_raw and isinstance(dt_raw, str) and len(dt_raw) >= 16:
            try:
                datetime_original = dt_raw[:10].replace(":", "-") + "T" + dt_raw[11:19]
            except Exception:
                pass

        # Camera
        make = get_tag("Make")
        if isinstance(make, bytes):
            make = make.decode("utf-8", errors="replace").rstrip("\x00")
        elif make is not None:
            make = str(make).rstrip("\x00")

        model = get_tag("Model")
        if isinstance(model, bytes):
            model = model.decode("utf-8", errors="replace").rstrip("\x00")
        elif model is not None:
            model = str(model).rstrip("\x00")

        # Exposure
        f_number = _to_float(get_tag("FNumber"))
        exposure_time = _exposure_time_str(get_tag("ExposureTime"))
        iso_raw = get_tag("ISOSpeedRatings")
        iso_speed = int(iso_raw) if iso_raw is not None else None
        focal_length = _to_float(get_tag("FocalLength"))

        # GPS
        gps_lat = None
        gps_lon = None
        gps_tag_id = tag_map.get("GPSInfo")
        if gps_tag_id and gps_tag_id in raw:
            gps_info = raw[gps_tag_id]
            gps_map = {GPSTAGS.get(k, k): v for k, v in gps_info.items()}
            lat = gps_map.get("GPSLatitude")
            lat_ref = gps_map.get("GPSLatitudeRef", "N")
            lon = gps_map.get("GPSLongitude")
            lon_ref = gps_map.get("GPSLongitudeRef", "E")
            if lat and lon:
                gps_lat = _gps_decimal(lat, lat_ref)
                gps_lon = _gps_decimal(lon, lon_ref)

        result = {
            "datetime_original": datetime_original,
            "make": make or None,
            "model": model or None,
            "f_number": f_number,
            "exposure_time": exposure_time,
            "iso_speed": iso_speed,
            "focal_length": focal_length,
            "gps_lat": gps_lat,
            "gps_lon": gps_lon,
        }

        # Return None if all fields are None (no meaningful EXIF)
        if all(v is None for v in result.values()):
            return None

        return result
    except Exception as exc:
        logger.warning("EXIF extraction failed for %s: %s", image_path, type(exc).__name__)
        return None
