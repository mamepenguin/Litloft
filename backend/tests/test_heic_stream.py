import pytest
from pathlib import Path

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _create_heic_fixture(drive_dir):
    """Create a small HEIC file in the test drive directory."""
    try:
        import pillow_heif
        from PIL import Image

        pillow_heif.register_heif_opener()
    except ImportError:
        pytest.skip("pillow-heif not installed")

    heic_path = drive_dir / "photo.heic"
    img = Image.new("RGB", (200, 150), color=(255, 128, 0))
    img.save(str(heic_path), format="HEIF", quality=80)
    return heic_path


def _seed_heic(db, drive_dir):
    heic_path = _create_heic_fixture(drive_dir)

    from app.models import File

    file = File(
        filename="photo.heic",
        title="Photo",
        drive=TEST_DRIVE,
        folder_path="",
        file_path="photo.heic",
        file_size=heic_path.stat().st_size,
        file_type="image",
        mime_type="image/heic",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestHeicStream:
    def test_stream_heic_returns_jpeg(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_heic(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        assert res.headers["content-type"] == "image/jpeg"
        # JPEG magic bytes
        assert res.content[:2] == b"\xff\xd8"

    def test_stream_heic_range_request(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_heic(db, drive_dir)
        res = c.get(
            f"/api/files/{file.id}/stream",
            headers={"Range": "bytes=0-99"},
        )
        assert res.status_code == 206
        assert res.headers["content-type"] == "image/jpeg"
        assert len(res.content) == 100

    def test_stream_heic_caches_conversion(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_heic(db, drive_dir)

        # First request triggers conversion
        res1 = c.get(f"/api/files/{file.id}/stream")
        assert res1.status_code == 200

        # Verify cache file exists
        converted_dir = data_dir / "converted"
        assert converted_dir.exists()
        cached_files = list(converted_dir.glob("*.jpg"))
        assert len(cached_files) == 1

        # Second request uses cache
        res2 = c.get(f"/api/files/{file.id}/stream")
        assert res2.status_code == 200
        assert res2.content == res1.content


class TestHeicDeleteCleanup:
    def test_delete_cleans_up_heic_cache(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_heic(db, drive_dir)

        # Trigger conversion to create cache
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200

        converted_dir = data_dir / "converted"
        cached_files = list(converted_dir.glob("*.jpg"))
        assert len(cached_files) == 1

        # Delete the file
        res = c.delete(f"/api/files/{file.id}")
        assert res.status_code == 200

        # Cache should be cleaned up
        cached_files = list(converted_dir.glob("*.jpg"))
        assert len(cached_files) == 0
