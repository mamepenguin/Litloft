import hashlib
import shutil
from pathlib import Path
from unittest.mock import patch

from app.models import File
from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_file(db, drive_dir, filename="test.mp4", folder="", file_hash=None):
    """Seed a file record with optional hash."""
    if folder:
        d = drive_dir / folder
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(FIXTURES_DIR / "short_video.mp4", d / filename)
        file_path = f"{folder}/{filename}"
    else:
        shutil.copy(FIXTURES_DIR / "short_video.mp4", drive_dir / filename)
        file_path = filename

    target = drive_dir / file_path
    file = File(
        filename=filename,
        title="Test",
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=file_path,
        file_size=target.stat().st_size,
        file_type="video",
        mime_type="video/mp4",
        file_hash=file_hash,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestDuplicatesAPI:
    def test_no_duplicates_returns_empty(self, client):
        """When no duplicates exist, return empty groups."""
        c, db, drive_dir, _ = client
        _seed_file(db, drive_dir, "a.mp4", file_hash="hash_a")
        _seed_file(db, drive_dir, "b.mp4", file_hash="hash_b")

        res = c.get(f"/api/drives/{TEST_DRIVE}/duplicates")
        assert res.status_code == 200
        body = res.json()
        assert body["groups"] == []
        assert body["total_groups"] == 0
        assert body["total_wasted_bytes"] == 0

    def test_duplicates_returns_correct_groups(self, client):
        """When duplicates exist, return them grouped by hash."""
        c, db, drive_dir, _ = client
        same_hash = "abc123def456"
        f1 = _seed_file(db, drive_dir, "dup1.mp4", folder="a", file_hash=same_hash)
        f2 = _seed_file(db, drive_dir, "dup2.mp4", folder="b", file_hash=same_hash)
        _seed_file(db, drive_dir, "unique.mp4", file_hash="unique_hash")

        res = c.get(f"/api/drives/{TEST_DRIVE}/duplicates")
        assert res.status_code == 200
        body = res.json()
        assert body["total_groups"] == 1

        group = body["groups"][0]
        assert group["hash"] == same_hash
        assert len(group["files"]) == 2
        file_ids = {f["id"] for f in group["files"]}
        assert file_ids == {f1.id, f2.id}

    def test_soft_deleted_excluded(self, client):
        """Soft-deleted files should not appear in duplicate groups."""
        c, db, drive_dir, _ = client
        same_hash = "dup_hash_123"
        f1 = _seed_file(db, drive_dir, "keep.mp4", folder="a", file_hash=same_hash)
        f2 = _seed_file(db, drive_dir, "trash.mp4", folder="b", file_hash=same_hash)

        # Soft delete one
        c.delete(f"/api/files/{f2.id}")

        res = c.get(f"/api/drives/{TEST_DRIVE}/duplicates")
        assert res.status_code == 200
        body = res.json()
        # Only one file left with that hash, so no duplicate group
        assert body["total_groups"] == 0

    def test_total_wasted_bytes(self, client):
        """total_wasted_bytes = sum of file_size * (count-1) for each group."""
        c, db, drive_dir, _ = client
        same_hash = "wasted_hash"
        f1 = _seed_file(db, drive_dir, "w1.mp4", folder="a", file_hash=same_hash)
        f2 = _seed_file(db, drive_dir, "w2.mp4", folder="b", file_hash=same_hash)
        f3 = _seed_file(db, drive_dir, "w3.mp4", folder="c", file_hash=same_hash)

        res = c.get(f"/api/drives/{TEST_DRIVE}/duplicates")
        assert res.status_code == 200
        body = res.json()
        assert body["total_groups"] == 1

        group = body["groups"][0]
        # 3 copies, so wasted = file_size * 2
        expected_wasted = f1.file_size * 2
        assert group["total_size"] == f1.file_size * 3
        assert body["total_wasted_bytes"] == expected_wasted

    def test_null_hash_excluded(self, client):
        """Files with null file_hash should not be included in duplicates."""
        c, db, drive_dir, _ = client
        _seed_file(db, drive_dir, "no_hash1.mp4", folder="a", file_hash=None)
        _seed_file(db, drive_dir, "no_hash2.mp4", folder="b", file_hash=None)

        res = c.get(f"/api/drives/{TEST_DRIVE}/duplicates")
        assert res.status_code == 200
        body = res.json()
        assert body["total_groups"] == 0

    def test_multiple_duplicate_groups(self, client):
        """Multiple groups of duplicates are returned correctly."""
        c, db, drive_dir, _ = client
        _seed_file(db, drive_dir, "g1a.mp4", folder="a", file_hash="group1")
        _seed_file(db, drive_dir, "g1b.mp4", folder="b", file_hash="group1")
        _seed_file(db, drive_dir, "g2a.mp4", folder="c", file_hash="group2")
        _seed_file(db, drive_dir, "g2b.mp4", folder="d", file_hash="group2")
        _seed_file(db, drive_dir, "g2c.mp4", folder="e", file_hash="group2")

        res = c.get(f"/api/drives/{TEST_DRIVE}/duplicates")
        assert res.status_code == 200
        body = res.json()
        assert body["total_groups"] == 2

        hashes = {g["hash"] for g in body["groups"]}
        assert hashes == {"group1", "group2"}

    def test_invalid_drive_returns_404(self, client):
        """Request to non-existent drive returns 404."""
        c, _, _, _ = client

        res = c.get("/api/drives/nonexistent/duplicates")
        assert res.status_code == 404
