"""Scanner-side md_id injection for `.md` files.

Spec: docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md §3.1
Phase A — first-detect injection complements PUT /content + note_scanner.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

import app.config as config
from app.models import File
from app.services.frontmatter import parse as parse_frontmatter
from app.services.scanner import _scan_and_register, register_single_file


@pytest.fixture()
def drive_env(tmp_path, monkeypatch):
    drive_dir = tmp_path / "drive"
    drive_dir.mkdir()
    drives_json = tmp_path / "drives.json"
    drives_json.write_text(
        json.dumps([{"name": "test-drive", "path": str(drive_dir)}])
    )
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "_drives_cache", None)
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    return drive_dir


class TestRegisterSingleFileInjectsId:
    def test_md_without_id_gets_injected(self, db_session, drive_env):
        drive_dir = drive_env
        md = drive_dir / "note.md"
        md.write_text("---\ntags:\n  - x\n---\n\nbody\n")

        file_id = register_single_file(db_session, "test-drive", md)
        db_session.commit()

        on_disk = md.read_text()
        fm = parse_frontmatter(on_disk).metadata
        assert isinstance(fm.get("id"), str)
        assert fm["id"].isdigit()
        assert 12 <= len(fm["id"]) <= 17

        record = db_session.query(File).filter(File.id == file_id).first()
        assert record.md_id == fm["id"]

    def test_md_with_existing_id_preserved(self, db_session, drive_env):
        drive_dir = drive_env
        md = drive_dir / "note.md"
        original = "---\nid: \"20251231235959\"\ntags:\n  - x\n---\n\nbody\n"
        md.write_text(original)
        original_bytes = md.read_bytes()

        file_id = register_single_file(db_session, "test-drive", md)
        db_session.commit()

        # No rewrite happened on disk
        assert md.read_bytes() == original_bytes

        record = db_session.query(File).filter(File.id == file_id).first()
        assert record.md_id == "20251231235959"

    def test_md_without_frontmatter_skipped(self, db_session, drive_env):
        drive_dir = drive_env
        md = drive_dir / "plain.md"
        original = "# Plain note\n\nNo frontmatter at all.\n"
        md.write_text(original)
        original_bytes = md.read_bytes()

        file_id = register_single_file(db_session, "test-drive", md)
        db_session.commit()

        # No injection (no frontmatter to extend)
        assert md.read_bytes() == original_bytes
        record = db_session.query(File).filter(File.id == file_id).first()
        assert record.md_id is None

    def test_non_md_not_touched(self, db_session, drive_env):
        drive_dir = drive_env
        txt = drive_dir / "note.txt"
        txt.write_text("---\nid: \"20251231235959\"\n---\n\nbody\n")
        original_bytes = txt.read_bytes()

        file_id = register_single_file(db_session, "test-drive", txt)
        db_session.commit()

        assert txt.read_bytes() == original_bytes
        record = db_session.query(File).filter(File.id == file_id).first()
        assert record.md_id is None


class TestScanRegisterInjectsId:
    def test_scan_picks_up_md_and_injects(self, db_session, drive_env):
        drive_dir = drive_env
        (drive_dir / "a.md").write_text("---\ntags: [a]\n---\n\nbody\n")
        (drive_dir / "b.md").write_text("---\nid: \"20240101000000\"\ntags: [b]\n---\n\nbody\n")

        _scan_and_register(db_session, "test-drive")
        db_session.commit()

        a_rec = db_session.query(File).filter(File.filename == "a.md").first()
        b_rec = db_session.query(File).filter(File.filename == "b.md").first()
        assert a_rec.md_id is not None
        assert a_rec.md_id.isdigit()
        assert b_rec.md_id == "20240101000000"


class TestCollisionInScanner:
    def test_scanner_uses_17_digit_on_collision(self, db_session, drive_env, monkeypatch):
        drive_dir = drive_env
        # Pre-seed an existing file whose md_id will collide with the
        # scanner's first attempt.
        other = drive_dir / "other.md"
        other.write_text("---\nid: \"20260512143028\"\n---\n\nbody\n")
        # Register the colliding file first (id preserved).
        register_single_file(db_session, "test-drive", other)
        db_session.commit()

        # Freeze datetime.now within scanner to match the colliding id.
        import app.services.scanner as scanner_mod

        class _FrozenDT:
            @staticmethod
            def now(tz=None):
                return datetime(2026, 5, 12, 14, 30, 28, 123_000, tzinfo=tz or UTC)

            @staticmethod
            def fromtimestamp(ts, tz=None):
                return datetime.fromtimestamp(ts, tz)

        monkeypatch.setattr(scanner_mod, "datetime", _FrozenDT)

        fresh = drive_dir / "fresh.md"
        fresh.write_text("---\ntags: [x]\n---\n\nbody\n")
        file_id = register_single_file(db_session, "test-drive", fresh)
        db_session.commit()

        on_disk = fresh.read_text()
        fm = parse_frontmatter(on_disk).metadata
        assert fm["id"] == "20260512143028123"
        record = db_session.query(File).filter(File.id == file_id).first()
        assert record.md_id == "20260512143028123"
