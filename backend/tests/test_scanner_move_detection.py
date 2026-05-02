"""Tests for hash-based move detection in the scanner.

Verifies that when files are renamed/moved on disk between scans, the
scanner detects them via (file_hash, file_size) matching and rewrites
the existing record (preserving file_id) rather than emitting a
missing+add pair.

Spec: docs/superpowers/specs/2026-05-03-hash-based-move-detection.md
"""
from pathlib import Path
from unittest.mock import patch

from app.models import File
from app.services.hash import HASH_CHUNK_SIZE, compute_file_hash
from app.services.scanner import _scan_and_register
from tests.conftest import TEST_DRIVE


def _write_unique_file(path: Path, marker: bytes) -> None:
    """Write a file large enough that head/tail hashing engages."""
    path.parent.mkdir(parents=True, exist_ok=True)
    head = b"H" * HASH_CHUNK_SIZE
    body = marker * 200
    tail = b"T" * HASH_CHUNK_SIZE + marker[:1]
    path.write_bytes(head + body + tail)


def _capture_emits():
    """Capture event_hooks.emit_sync calls."""
    events: list[tuple[str, dict]] = []

    def fake_emit(event, payload):
        events.append((event, payload))

    return events, fake_emit


class TestSimpleRename:
    def test_rename_in_same_folder_detected_as_move(self, client):
        c, db, drive_dir, _ = client
        old_path = drive_dir / "original.bin"
        _write_unique_file(old_path, b"abc")

        # Initial scan: file is added with hash
        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()
        rec = db.query(File).filter(File.file_path == "original.bin").first()
        assert rec is not None
        assert rec.file_hash is not None
        original_id = rec.id
        original_hash = rec.file_hash

        # Rename on disk
        new_path = drive_dir / "renamed.bin"
        old_path.rename(new_path)

        events, fake_emit = _capture_emits()
        with patch("app.services.scanner.event_hooks.emit_sync", side_effect=fake_emit):
            result = _scan_and_register(db, TEST_DRIVE)

        db.expire_all()
        # Same record should now point to the new path
        rec = db.query(File).filter(File.id == original_id).first()
        assert rec is not None
        assert rec.file_path == "renamed.bin"
        assert rec.filename == "renamed.bin"
        assert rec.missing_since is None
        assert rec.file_hash == original_hash

        # No duplicate record was created
        all_records = db.query(File).all()
        assert len(all_records) == 1

        # Result counters
        assert result["moved"] == 1
        assert result["added"] == 0
        assert result["missing"] == 0

        # files.moved was emitted, files.missing was NOT
        emitted = {evt for evt, _ in events}
        assert "files.moved" in emitted
        assert "files.missing" not in emitted

        moved_payload = next(p for e, p in events if e == "files.moved")
        assert moved_payload == {"file_ids": [original_id]}


class TestFolderMove:
    def test_cross_folder_move_detected(self, client):
        c, db, drive_dir, _ = client
        old_path = drive_dir / "folder1" / "video.bin"
        _write_unique_file(old_path, b"xyz")
        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        rec = db.query(File).filter(File.file_path == "folder1/video.bin").first()
        original_id = rec.id

        # Move across folders
        new_path = drive_dir / "folder2" / "video.bin"
        new_path.parent.mkdir(parents=True, exist_ok=True)
        old_path.rename(new_path)

        result = _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        rec = db.query(File).filter(File.id == original_id).first()
        assert rec.file_path == "folder2/video.bin"
        assert rec.folder_path == "folder2"
        assert result["moved"] == 1

    def test_rename_and_folder_move_combined(self, client):
        c, db, drive_dir, _ = client
        old_path = drive_dir / "src" / "old.bin"
        _write_unique_file(old_path, b"qrs")
        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        original_id = db.query(File).first().id

        new_path = drive_dir / "dst" / "new.bin"
        new_path.parent.mkdir(parents=True, exist_ok=True)
        old_path.rename(new_path)

        result = _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        rec = db.query(File).filter(File.id == original_id).first()
        assert rec.file_path == "dst/new.bin"
        assert rec.folder_path == "dst"
        assert rec.filename == "new.bin"
        assert result["moved"] == 1
        assert result["added"] == 0


class TestSafetyAgainstFalsePositives:
    def test_size_mismatch_does_not_match(self, client):
        """Two files with the same head+tail but different size must not be
        treated as the same identity."""
        c, db, drive_dir, _ = client
        old_path = drive_dir / "a.bin"
        _write_unique_file(old_path, b"AA")
        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()
        original_id = db.query(File).first().id

        # Replace with a different file that has same head+tail but different size
        old_path.unlink()
        new_path = drive_dir / "b.bin"
        head = b"H" * HASH_CHUNK_SIZE
        tail = b"T" * HASH_CHUNK_SIZE + b"A"
        # Different middle size
        new_path.write_bytes(head + b"M" * 5000 + tail)

        result = _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        # Old record should be missing, new record inserted
        old_rec = db.query(File).filter(File.id == original_id).first()
        assert old_rec.missing_since is not None
        new_rec = db.query(File).filter(File.file_path == "b.bin").first()
        assert new_rec is not None
        assert new_rec.id != original_id
        assert result["moved"] == 0
        assert result["missing"] == 1
        assert result["added"] == 1

    def test_multiple_missing_with_same_hash_skips_match(self, client):
        """If two missing candidates share the same (hash, size), the match
        is ambiguous and we fall back to missing+add."""
        c, db, drive_dir, _ = client
        # Two identical files
        a = drive_dir / "a.bin"
        b = drive_dir / "b.bin"
        _write_unique_file(a, b"ZZ")
        _write_unique_file(b, b"ZZ")  # same content
        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()
        ids_before = {f.id for f in db.query(File).all()}
        assert len(ids_before) == 2

        # Delete both, add one new identical file at a third path
        a.unlink()
        b.unlink()
        c_path = drive_dir / "c.bin"
        _write_unique_file(c_path, b"ZZ")

        result = _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        # Should be 2 missing + 1 added, no moves (ambiguous)
        assert result["moved"] == 0
        assert result["missing"] == 2
        assert result["added"] == 1

        new_rec = db.query(File).filter(File.file_path == "c.bin").first()
        assert new_rec.id not in ids_before

    def test_copy_does_not_match(self, client):
        """A file copied (original kept) must result in a new record, not a
        move (original is still present, so it's not in unseen)."""
        c, db, drive_dir, _ = client
        a = drive_dir / "a.bin"
        _write_unique_file(a, b"PP")
        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()
        original_id = db.query(File).first().id

        # Copy to second path, keep original
        b = drive_dir / "b.bin"
        b.write_bytes(a.read_bytes())

        result = _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        # Original record unchanged
        a_rec = db.query(File).filter(File.id == original_id).first()
        assert a_rec.file_path == "a.bin"
        # New record for b
        b_rec = db.query(File).filter(File.file_path == "b.bin").first()
        assert b_rec is not None
        assert b_rec.id != original_id
        assert result["moved"] == 0
        assert result["added"] == 1
        assert result["missing"] == 0

    def test_missing_with_null_hash_not_matched(self, client):
        """Files with file_hash IS NULL cannot participate in matching."""
        c, db, drive_dir, _ = client
        a = drive_dir / "old.bin"
        _write_unique_file(a, b"YY")
        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        # Force the existing record's hash to NULL (simulating a record
        # that was created before hash backfill caught up).
        rec = db.query(File).first()
        rec.file_hash = None
        db.commit()

        # Move on disk
        a.unlink()
        b = drive_dir / "new.bin"
        _write_unique_file(b, b"YY")

        result = _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        # No move detected — the record can't be matched without a hash
        assert result["moved"] == 0
        # Old goes missing, new is added
        assert result["missing"] == 1
        assert result["added"] == 1


class TestIdempotency:
    def test_repeat_scan_after_move_is_noop(self, client):
        c, db, drive_dir, _ = client
        old_path = drive_dir / "x.bin"
        _write_unique_file(old_path, b"NN")
        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        new_path = drive_dir / "y.bin"
        old_path.rename(new_path)
        first = _scan_and_register(db, TEST_DRIVE)
        assert first["moved"] == 1

        # Second scan: nothing changes
        second = _scan_and_register(db, TEST_DRIVE)
        assert second["moved"] == 0
        assert second["added"] == 0
        assert second["missing"] == 0


class TestThumbnailFollowsMove:
    def test_thumbnail_relocated_on_move(self, client):
        c, db, drive_dir, data_dir = client
        # Use a small text file as a stand-in (no real thumbnail generation
        # for binary content). We pre-place a thumbnail and verify it moves.
        old_path = drive_dir / "a.bin"
        _write_unique_file(old_path, b"TT")
        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        rec = db.query(File).first()
        # Force the record to look like a video so the thumbnail branch runs
        rec.file_type = "video"
        rec.mime_type = "video/mp4"
        # Pre-place a fake thumbnail
        old_thumb_rel = f"{TEST_DRIVE}/a.jpg"
        old_thumb_full = data_dir / "thumbnails" / old_thumb_rel
        old_thumb_full.parent.mkdir(parents=True, exist_ok=True)
        old_thumb_full.write_bytes(b"\xff\xd8\xff\xe0fake")
        rec.thumbnail_path = old_thumb_rel
        db.commit()

        # Rename file. classify("b.bin") is "other", so to keep file_type
        # at "video" we use a known video extension.
        old_path.unlink()
        new_path = drive_dir / "b.mp4"
        # Re-create the same content under new name
        head = b"H" * HASH_CHUNK_SIZE
        body = b"TT" * 200
        tail = b"T" * HASH_CHUNK_SIZE + b"T"
        new_path.write_bytes(head + body + tail)

        result = _scan_and_register(db, TEST_DRIVE)
        db.expire_all()

        assert result["moved"] == 1
        rec = db.query(File).first()
        assert rec.file_path == "b.mp4"
        # New thumbnail path should reflect new stem
        new_thumb_rel = f"{TEST_DRIVE}/b.jpg"
        new_thumb_full = data_dir / "thumbnails" / new_thumb_rel
        assert rec.thumbnail_path == new_thumb_rel
        assert new_thumb_full.exists()
        # Old thumbnail no longer present
        assert not old_thumb_full.exists()
