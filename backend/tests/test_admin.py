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
        # Disk figures moved to the system section: they describe the
        # filesystem, not the drive. See TestFilesystemUsage.
        assert "total_bytes" not in drive
        assert isinstance(drive["file_count"], int)
        assert isinstance(drive["file_types"], dict)
        assert isinstance(drive["is_scanning"], bool)

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


class TestFilesystemUsage:
    """Disk usage is reported per filesystem, not per drive.

    ``shutil.disk_usage`` measures a mount. Asking it once per drive
    gave every drive on one disk the same numbers, so an empty drive
    read as 48% full and three drives on one SSD looked like three disks
    filling in step.
    """

    def test_drive_cards_carry_no_disk_figures(self, client):
        c, db, drive_dir, data_dir = client
        for drive in c.get("/api/admin/dashboard").json()["drives"]:
            for gone in ("total_bytes", "used_bytes", "free_bytes"):
                assert gone not in drive, gone

    def test_one_row_per_filesystem_naming_its_drives(self, client):
        c, db, drive_dir, data_dir = client
        rows = c.get("/api/admin/dashboard").json()["system"]["filesystems"]
        assert rows, "the configured drive must appear on some filesystem"
        for row in rows:
            assert row["total_bytes"] > 0
            assert row["drives"], "a filesystem row that names no drive is noise"

    def test_drives_sharing_a_disk_share_one_row(self, client, monkeypatch, tmp_path):
        # Two drives under one tmp_path are on one filesystem, and being
        # reported once is the whole point.
        import app.config as config

        c, db, drive_dir, data_dir = client
        first = tmp_path / "one"
        second = tmp_path / "two"
        first.mkdir()
        second.mkdir()
        monkeypatch.setattr(
            config,
            "load_drives",
            lambda: [
                {"name": "one", "path": str(first)},
                {"name": "two", "path": str(second)},
            ],
        )

        rows = c.get("/api/admin/dashboard").json()["system"]["filesystems"]
        assert len(rows) == 1
        assert sorted(rows[0]["drives"]) == ["one", "two"]

    def test_an_unreadable_drive_contributes_no_row(self, client, monkeypatch, tmp_path):
        import app.config as config

        c, db, drive_dir, data_dir = client
        monkeypatch.setattr(
            config,
            "load_drives",
            lambda: [{"name": "ghost", "path": str(tmp_path / "not-mounted")}],
        )

        # A row of zeroes would read as a full disk, which is worse than
        # saying nothing.
        assert c.get("/api/admin/dashboard").json()["system"]["filesystems"] == []
