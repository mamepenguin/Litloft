import shutil
from pathlib import Path

from app.models import File
from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_files(db, drive_dir):
    """Create test files with various file types."""
    # Video file
    d = drive_dir / "videos"
    d.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", d / "clip.mp4")
    db.add(
        File(
            filename="clip.mp4",
            title="Clip",
            drive=TEST_DRIVE,
            folder_path="videos",
            file_path="videos/clip.mp4",
            file_size=d.joinpath("clip.mp4").stat().st_size,
            file_type="video",
            mime_type="video/mp4",
        )
    )

    # Image file
    (drive_dir / "photo.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    db.add(
        File(
            filename="photo.jpg",
            title="Photo",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="photo.jpg",
            file_size=104,
            file_type="image",
            mime_type="image/jpeg",
        )
    )

    # Audio file
    (drive_dir / "song.mp3").write_bytes(b"\x00" * 50)
    db.add(
        File(
            filename="song.mp3",
            title="Song",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="song.mp3",
            file_size=50,
            file_type="audio",
            mime_type="audio/mpeg",
        )
    )

    # Document file
    (drive_dir / "readme.txt").write_text("hello")
    db.add(
        File(
            filename="readme.txt",
            title="Readme",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="readme.txt",
            file_size=5,
            file_type="document",
            mime_type="text/plain",
        )
    )

    db.commit()


def _seed_trashed_file(db, drive_dir):
    """Create a soft-deleted file."""
    from datetime import UTC, datetime

    (drive_dir / "old.mp4").write_bytes(b"\x00" * 30)
    file = File(
        filename="old.mp4",
        title="Old",
        drive=TEST_DRIVE,
        folder_path="",
        file_path="old.mp4",
        file_size=30,
        file_type="video",
        mime_type="video/mp4",
        deleted_at=datetime.now(UTC),
    )
    db.add(file)
    db.commit()


class TestDashboard:
    def test_returns_200(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/admin/dashboard")
        assert res.status_code == 200

    def test_response_structure(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/admin/dashboard")
        body = res.json()

        assert "drives" in body
        assert "system" in body
        assert isinstance(body["drives"], list)
        assert isinstance(body["system"], dict)

    def test_drive_info_fields(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/admin/dashboard")
        body = res.json()

        assert len(body["drives"]) == 1
        drive = body["drives"][0]
        assert drive["name"] == TEST_DRIVE
        assert drive["total_bytes"] > 0
        assert drive["used_bytes"] >= 0
        assert drive["free_bytes"] >= 0
        assert isinstance(drive["file_count"], int)
        assert isinstance(drive["file_types"], dict)
        assert isinstance(drive["is_scanning"], bool)
        assert isinstance(drive["readonly"], bool)

    def test_drive_file_type_counts(self, client):
        c, db, drive_dir, data_dir = client
        _seed_files(db, drive_dir)

        res = c.get("/api/admin/dashboard")
        drive = res.json()["drives"][0]

        assert drive["file_count"] == 4
        assert drive["file_types"]["video"] == 1
        assert drive["file_types"]["image"] == 1
        assert drive["file_types"]["audio"] == 1
        assert drive["file_types"]["document"] == 1

    def test_scan_status_fields_present(self, client):
        """Scan status fields exist and have correct types."""
        c, db, drive_dir, data_dir = client
        res = c.get("/api/admin/dashboard")
        drive = res.json()["drives"][0]

        assert isinstance(drive["is_scanning"], bool)
        # last_scanned_at is either None or an ISO 8601 string
        assert drive["last_scanned_at"] is None or isinstance(
            drive["last_scanned_at"], str
        )

    def test_system_info_fields(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/admin/dashboard")
        system = res.json()["system"]

        assert isinstance(system["db_size_bytes"], int)
        assert isinstance(system["thumbnail_cache_bytes"], int)
        assert isinstance(system["converted_cache_bytes"], int)
        assert isinstance(system["upload_temp_bytes"], int)
        assert isinstance(system["total_files"], int)
        assert isinstance(system["trash_count"], int)
        assert isinstance(system["uptime_seconds"], float)
        assert system["uptime_seconds"] > 0

    def test_total_files_excludes_trashed(self, client):
        c, db, drive_dir, data_dir = client
        _seed_files(db, drive_dir)
        _seed_trashed_file(db, drive_dir)

        res = c.get("/api/admin/dashboard")
        system = res.json()["system"]

        assert system["total_files"] == 4
        assert system["trash_count"] == 1

    def test_empty_drive(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/admin/dashboard")
        drive = res.json()["drives"][0]

        assert drive["file_count"] == 0
        assert drive["file_types"] == {}

    def test_readonly_drive(self, client, tmp_path):
        """Readonly flag from drives.json is reflected in dashboard."""
        import json

        import app.config as config

        c, db, drive_dir, data_dir = client

        ro_dir = tmp_path / "ro_drive"
        ro_dir.mkdir()
        drives_json = tmp_path / "drives_ro.json"
        drives_json.write_text(json.dumps([
            {"name": TEST_DRIVE, "path": str(drive_dir)},
            {"name": "readonly-drive", "path": str(ro_dir), "readonly": True},
        ]))

        orig_config = config.DRIVES_CONFIG
        orig_cache = config._drives_cache
        config.DRIVES_CONFIG = drives_json
        config._drives_cache = None
        try:
            res = c.get("/api/admin/dashboard")
            body = res.json()
            assert len(body["drives"]) == 2

            drive_map = {d["name"]: d for d in body["drives"]}
            assert drive_map[TEST_DRIVE]["readonly"] is False
            assert drive_map["readonly-drive"]["readonly"] is True
        finally:
            config.DRIVES_CONFIG = orig_config
            config._drives_cache = orig_cache

    def test_cache_size_calculation(self, client):
        """Cache directories with files report non-zero sizes."""
        c, db, drive_dir, data_dir = client

        # Create some cache files
        thumb_dir = data_dir / "thumbnails"
        thumb_dir.mkdir(parents=True, exist_ok=True)
        (thumb_dir / "test.jpg").write_bytes(b"\x00" * 1024)

        res = c.get("/api/admin/dashboard")
        system = res.json()["system"]

        assert system["thumbnail_cache_bytes"] >= 1024
