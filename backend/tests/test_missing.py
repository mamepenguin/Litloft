"""Tests for the missing-files feature (Phase 1: scanner behavior).

Covers:
- Scan marks vanished files as missing instead of physically deleting them
- Scan recovers missing files when they reappear on disk
- Thumbnails are preserved for missing files
- Trashed files are not touched by missing detection
- Drive unmount (drive dir missing) does not mark files as missing
- Missing files are excluded from active_file_filter-based queries
"""
import shutil
from datetime import UTC, datetime
from pathlib import Path

from app.database import SessionLocal
from app.models import File, active_file_filter
from app.services.scanner import _scan_and_register
from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_on_disk_and_db(db, drive_dir, filename="video.mp4", folder=""):
    """Create a file on disk and its matching DB record."""
    if folder:
        d = drive_dir / folder
        d.mkdir(exist_ok=True, parents=True)
        target = d / filename
    else:
        target = drive_dir / filename
    shutil.copy(FIXTURES_DIR / "short_video.mp4", target)

    rel = f"{folder}/{filename}" if folder else filename
    file = File(
        filename=filename,
        title="Test",
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=rel,
        file_size=target.stat().st_size,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file, target


class TestScanMarksMissing:
    def test_scan_marks_vanished_file_as_missing(self, client):
        c, db, drive_dir, _ = client
        file, target = _seed_on_disk_and_db(db, drive_dir, "vanish.mp4")

        # Simulate user deleting the file outside the app
        target.unlink()

        # Run scanner in the same DB session
        result = _scan_and_register(db, TEST_DRIVE)

        db.expire_all()
        record = db.query(File).filter(File.id == file.id).first()
        assert record is not None, "File should NOT be physically deleted"
        assert record.missing_since is not None, "missing_since should be set"
        assert record.deleted_at is None, "deleted_at should remain None"
        assert result["missing"] == 1
        assert result.get("added", 0) == 0

    def test_scan_does_not_remark_already_missing_files(self, client):
        c, db, drive_dir, _ = client
        file, target = _seed_on_disk_and_db(db, drive_dir, "already.mp4")
        target.unlink()

        # First scan: marks as missing
        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()
        first_timestamp = (
            db.query(File).filter(File.id == file.id).first().missing_since
        )
        assert first_timestamp is not None

        # Second scan: should not update missing_since (file still absent)
        result = _scan_and_register(db, TEST_DRIVE)
        db.expire_all()
        second_timestamp = (
            db.query(File).filter(File.id == file.id).first().missing_since
        )
        assert second_timestamp == first_timestamp
        assert result["missing"] == 0

    def test_scan_preserves_thumbnail_for_missing_files(self, client):
        c, db, drive_dir, data_dir = client
        file, target = _seed_on_disk_and_db(db, drive_dir, "thumb.mp4")

        # Create a thumbnail file on disk and record its path
        thumb_rel = f"{TEST_DRIVE}/thumb.jpg"
        thumb_full = data_dir / "thumbnails" / thumb_rel
        thumb_full.parent.mkdir(parents=True, exist_ok=True)
        thumb_full.write_bytes(b"fake jpeg")
        file.thumbnail_path = thumb_rel
        db.commit()

        target.unlink()
        _scan_and_register(db, TEST_DRIVE)

        # Thumbnail should remain on disk
        assert thumb_full.exists(), "Thumbnail must survive missing marking"

    def test_scan_skips_trashed_files(self, client):
        c, db, drive_dir, _ = client
        file, target = _seed_on_disk_and_db(db, drive_dir, "trashed.mp4")
        # Soft-delete: file stays on disk, deleted_at set
        file.deleted_at = datetime.now(UTC)
        db.commit()
        # Now remove the disk file (simulating user deleting manually)
        target.unlink()

        _scan_and_register(db, TEST_DRIVE)

        db.expire_all()
        record = db.query(File).filter(File.id == file.id).first()
        assert record is not None
        # Must remain trashed, not marked as missing
        assert record.deleted_at is not None
        assert record.missing_since is None


class TestScanRecovery:
    def test_scan_recovers_missing_file_on_reappearance(self, client):
        c, db, drive_dir, _ = client
        file, target = _seed_on_disk_and_db(db, drive_dir, "back.mp4")
        target.unlink()
        _scan_and_register(db, TEST_DRIVE)

        db.expire_all()
        assert db.query(File).filter(File.id == file.id).first().missing_since is not None

        # File reappears
        shutil.copy(FIXTURES_DIR / "short_video.mp4", target)
        result = _scan_and_register(db, TEST_DRIVE)

        db.expire_all()
        record = db.query(File).filter(File.id == file.id).first()
        assert record.missing_since is None, "missing_since should be cleared"
        assert result["recovered"] == 1


class TestDriveUnmount:
    def test_missing_drive_dir_does_not_mark_missing(self, client, tmp_path):
        c, db, drive_dir, _ = client
        file, target = _seed_on_disk_and_db(db, drive_dir, "safe.mp4")

        # Simulate drive unmount by renaming the drive dir away
        unmounted_path = tmp_path / "unmounted"
        drive_dir.rename(unmounted_path)
        try:
            result = _scan_and_register(db, TEST_DRIVE)
            assert result.get("missing", 0) == 0
        finally:
            unmounted_path.rename(drive_dir)

        db.expire_all()
        record = db.query(File).filter(File.id == file.id).first()
        assert record.missing_since is None, (
            "Unmounted drive must not mark files as missing"
        )


class TestActiveFileFilter:
    def test_missing_file_excluded_from_active_filter(self, client):
        c, db, drive_dir, _ = client
        file, target = _seed_on_disk_and_db(db, drive_dir, "invisible.mp4")
        target.unlink()
        _scan_and_register(db, TEST_DRIVE)

        db.expire_all()
        # Active query should exclude missing file
        active = db.query(File).filter(active_file_filter()).all()
        assert file.id not in [f.id for f in active]

        # Drive listing API should also exclude missing files
        res = c.get(f"/api/drives/{TEST_DRIVE}/files")
        assert res.status_code == 200
        ids = [f["id"] for f in res.json()["data"]]
        assert file.id not in ids

    def test_missing_file_not_returned_by_file_get(self, client):
        c, db, drive_dir, _ = client
        file, target = _seed_on_disk_and_db(db, drive_dir, "gone.mp4")
        target.unlink()
        _scan_and_register(db, TEST_DRIVE)

        res = c.get(f"/api/files/{file.id}")
        assert res.status_code == 404


def _make_missing_file(client, name="missing.mp4", folder=""):
    """Helper: seed a file, remove from disk, scan to mark as missing."""
    c, db, drive_dir, _ = client
    file, target = _seed_on_disk_and_db(db, drive_dir, name, folder)
    target.unlink()
    _scan_and_register(db, TEST_DRIVE)
    db.expire_all()
    return file


class TestMissingListAPI:
    def test_list_missing_empty(self, client):
        c, _, _, _ = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/missing")
        assert res.status_code == 200
        assert res.json()["data"] == []

    def test_list_missing(self, client):
        file = _make_missing_file(client)
        c, _, _, _ = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/missing")
        assert res.status_code == 200
        body = res.json()
        assert body["meta"]["total"] == 1
        assert len(body["data"]) == 1
        assert body["data"][0]["id"] == file.id
        assert body["data"][0]["missing_since"] is not None

    def test_list_missing_pagination(self, client):
        c, _, _, _ = client
        for i in range(5):
            _make_missing_file(client, f"f{i}.mp4")
        res = c.get(f"/api/drives/{TEST_DRIVE}/missing?limit=2&page=1")
        assert res.status_code == 200
        body = res.json()
        assert len(body["data"]) == 2
        assert body["meta"]["total"] == 5

    def test_trash_and_missing_are_separate(self, client):
        c, db, drive_dir, _ = client
        # Trashed file
        trashed_file, _ = _seed_on_disk_and_db(db, drive_dir, "in_trash.mp4")
        c.delete(f"/api/files/{trashed_file.id}")
        # Missing file
        missing_file = _make_missing_file(client, "gone.mp4")

        trash_res = c.get(f"/api/drives/{TEST_DRIVE}/trash")
        missing_res = c.get(f"/api/drives/{TEST_DRIVE}/missing")
        trash_ids = [f["id"] for f in trash_res.json()["data"]]
        missing_ids = [f["id"] for f in missing_res.json()["data"]]
        assert trashed_file.id in trash_ids
        assert trashed_file.id not in missing_ids
        assert missing_file.id in missing_ids
        assert missing_file.id not in trash_ids


class TestMissingPurgeAPI:
    def test_purge_missing_file(self, client):
        file = _make_missing_file(client)
        file_id = file.id  # save before purge so expire doesn't throw
        c, db, _, _ = client
        res = c.delete(f"/api/files/{file_id}/purge")
        assert res.status_code == 200
        db.expire_all()
        assert db.query(File).filter(File.id == file_id).first() is None

    def test_purge_all_missing(self, client):
        c, db, _, _ = client
        for i in range(3):
            _make_missing_file(client, f"m{i}.mp4")

        res = c.post(f"/api/drives/{TEST_DRIVE}/missing/purge-all")
        assert res.status_code == 200
        assert res.json()["purged"] == 3
        db.expire_all()
        remaining = (
            db.query(File)
            .filter(File.missing_since.isnot(None), File.deleted_at.is_(None))
            .all()
        )
        assert remaining == []

    def test_batch_purge_with_missing(self, client):
        c, db, drive_dir, _ = client
        trash, _ = _seed_on_disk_and_db(db, drive_dir, "bp_trash.mp4")
        trash_id = trash.id
        c.delete(f"/api/files/{trash_id}")
        missing = _make_missing_file(client, "bp_missing.mp4")
        missing_id = missing.id

        res = c.post(
            "/api/files/batch/purge",
            json={"ids": [trash_id, missing_id]},
        )
        assert res.status_code == 200
        assert res.json()["purged"] == 2
        db.expire_all()
        assert db.query(File).filter(File.id.in_([trash_id, missing_id])).count() == 0


class TestMissingAccessControl:
    def test_stream_missing_returns_410(self, client):
        file = _make_missing_file(client)
        c, _, _, _ = client
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 410

    def test_thumbnail_still_served_for_missing(self, client):
        """Missing files keep their thumbnails to support the recovery UX."""
        c, db, drive_dir, data_dir = client
        file, target = _seed_on_disk_and_db(db, drive_dir, "thumb_missing.mp4")
        # Create thumbnail
        thumb_rel = f"{TEST_DRIVE}/thumb_missing.jpg"
        thumb_full = data_dir / "thumbnails" / thumb_rel
        thumb_full.parent.mkdir(parents=True, exist_ok=True)
        thumb_full.write_bytes(b"\xff\xd8\xff\xe0" + b"jpeg data")
        file.thumbnail_path = thumb_rel
        db.commit()

        target.unlink()
        _scan_and_register(db, TEST_DRIVE)

        res = c.get(f"/api/files/{file.id}/thumbnail")
        assert res.status_code == 200

    def test_file_metadata_inaccessible_via_main_endpoint(self, client):
        """Main file GET should 404 for missing files (they appear only in /missing)."""
        file = _make_missing_file(client)
        c, _, _, _ = client
        res = c.get(f"/api/files/{file.id}")
        assert res.status_code == 404


class TestRestoreClearsMissingDefensively:
    """Safety net: restore_file should clear missing_since even though
    mutual exclusion should prevent this state ever occurring via normal
    flows."""

    def test_restore_clears_missing_since_if_set(self, client):
        c, db, drive_dir, _ = client
        file, _ = _seed_on_disk_and_db(db, drive_dir, "safety.mp4")
        # Force an inconsistent state (never happens via normal flows)
        file.deleted_at = datetime.now(UTC)
        file.missing_since = datetime.now(UTC)
        db.commit()

        res = c.post(f"/api/files/{file.id}/restore")
        assert res.status_code == 200
        db.expire_all()
        record = db.query(File).filter(File.id == file.id).first()
        assert record.deleted_at is None
        assert record.missing_since is None


class TestPlaylistAddRejectsMissing:
    def test_cannot_add_missing_file_to_playlist(self, client):
        c, db, drive_dir, _ = client
        missing = _make_missing_file(client, "pl_missing.mp4")

        create = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists",
            json={"name": "test-playlist"},
        )
        assert create.status_code == 201
        pl_id = create.json()["id"]

        res = c.post(
            f"/api/drives/{TEST_DRIVE}/playlists/{pl_id}/items",
            json={"file_ids": [missing.id]},
        )
        assert res.status_code == 404


class TestPurgeAllBatching:
    def test_purge_all_missing_batches(self, client):
        """Verify purge_all_missing handles many files without issues."""
        c, db, _, _ = client
        # Seed 250 missing files (batch size is 200)
        for i in range(250):
            _make_missing_file(client, f"batch_{i:03d}.mp4")

        res = c.post(f"/api/drives/{TEST_DRIVE}/missing/purge-all")
        assert res.status_code == 200
        assert res.json()["purged"] == 250

        db.expire_all()
        remaining = (
            db.query(File)
            .filter(File.missing_since.isnot(None), File.deleted_at.is_(None))
            .count()
        )
        assert remaining == 0


class TestDriveSummary:
    def test_summary_counts(self, client):
        c, db, drive_dir, _ = client
        # 2 missing
        _make_missing_file(client, "m1.mp4")
        _make_missing_file(client, "m2.mp4")
        # 1 trashed
        trashed, _ = _seed_on_disk_and_db(db, drive_dir, "t1.mp4")
        c.delete(f"/api/files/{trashed.id}")

        res = c.get(f"/api/drives/{TEST_DRIVE}/summary")
        assert res.status_code == 200
        body = res.json()
        assert body["name"] == TEST_DRIVE
        assert body["missing_count"] == 2
        assert body["trash_count"] == 1

    def test_summary_empty(self, client):
        c, _, _, _ = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/summary")
        assert res.status_code == 200
        body = res.json()
        assert body["missing_count"] == 0
        assert body["trash_count"] == 0
