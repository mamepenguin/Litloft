"""Tests for the safepath helper module.

Validates that path resolution is safe against:
- Path traversal (.., absolute paths)
- NUL / control characters
- Symbolic links (O_NOFOLLOW semantics)
- Windows reserved names
- realpath escape from drive root
- Filename length limits
"""
import json
import os
from pathlib import Path

import pytest
from fastapi import HTTPException


@pytest.fixture()
def drive_root(tmp_path, monkeypatch):
    """Set up a single drive for safepath tests."""
    drive_dir = tmp_path / "drive-root"
    drive_dir.mkdir()

    drives_json = tmp_path / "drives.json"
    drives_json.write_text(json.dumps([
        {"name": "test-drive", "path": str(drive_dir)}
    ]))

    import app.config as config
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "_drives_cache", None)

    return drive_dir


class TestResolveSafePath:
    def test_resolves_valid_relative_path(self, drive_root):
        from app.services.safepath import resolve_safe_path

        (drive_root / "notes").mkdir()
        (drive_root / "notes" / "memo.md").write_text("hello")

        result = resolve_safe_path("test-drive", "notes/memo.md")
        assert result == (drive_root / "notes" / "memo.md").resolve()

    def test_resolves_drive_root_itself(self, drive_root):
        from app.services.safepath import resolve_safe_path

        result = resolve_safe_path("test-drive", "")
        assert result == drive_root.resolve()

    def test_rejects_parent_traversal(self, drive_root):
        from app.services.safepath import resolve_safe_path

        with pytest.raises(HTTPException) as exc_info:
            resolve_safe_path("test-drive", "../etc/passwd")
        assert exc_info.value.status_code == 400

    def test_rejects_absolute_path(self, drive_root):
        from app.services.safepath import resolve_safe_path

        with pytest.raises(HTTPException) as exc_info:
            resolve_safe_path("test-drive", "/etc/passwd")
        assert exc_info.value.status_code == 400

    def test_rejects_nul_byte(self, drive_root):
        from app.services.safepath import resolve_safe_path

        with pytest.raises(HTTPException) as exc_info:
            resolve_safe_path("test-drive", "notes\x00/memo.md")
        assert exc_info.value.status_code == 400

    def test_rejects_control_chars(self, drive_root):
        from app.services.safepath import resolve_safe_path

        with pytest.raises(HTTPException) as exc_info:
            resolve_safe_path("test-drive", "notes\x01/memo.md")
        assert exc_info.value.status_code == 400

    def test_rejects_symlink_in_path(self, drive_root):
        from app.services.safepath import resolve_safe_path

        outside = drive_root.parent / "outside"
        outside.mkdir()
        (outside / "secret.md").write_text("secret")

        # symlink inside drive pointing outside
        (drive_root / "link").symlink_to(outside)

        with pytest.raises(HTTPException) as exc_info:
            resolve_safe_path("test-drive", "link/secret.md")
        assert exc_info.value.status_code == 400

    def test_rejects_symlink_component_even_when_target_inside(self, drive_root):
        """Symlinks are rejected wholesale, even if target is inside drive.

        Rationale: defense in depth. If a symlink exists in the drive, we
        cannot guarantee it will keep pointing inside across TOCTOU windows.
        """
        from app.services.safepath import resolve_safe_path

        (drive_root / "real").mkdir()
        (drive_root / "real" / "note.md").write_text("x")
        (drive_root / "link").symlink_to(drive_root / "real")

        with pytest.raises(HTTPException) as exc_info:
            resolve_safe_path("test-drive", "link/note.md")
        assert exc_info.value.status_code == 400

    def test_rejects_windows_reserved_names(self, drive_root):
        from app.services.safepath import resolve_safe_path

        for reserved in ("CON", "NUL", "AUX", "COM1", "LPT1", "con"):
            with pytest.raises(HTTPException) as exc_info:
                resolve_safe_path("test-drive", f"notes/{reserved}.md")
            assert exc_info.value.status_code == 400

    def test_rejects_unknown_drive(self, drive_root):
        from app.services.safepath import resolve_safe_path

        with pytest.raises(HTTPException) as exc_info:
            resolve_safe_path("nonexistent-drive", "notes/memo.md")
        assert exc_info.value.status_code == 404

    def test_accepts_japanese_characters(self, drive_root):
        from app.services.safepath import resolve_safe_path

        path = "ノート/メモ.md"
        result = resolve_safe_path("test-drive", path)
        assert result == (drive_root / "ノート" / "メモ.md").resolve()

    def test_rejects_path_too_long(self, drive_root):
        from app.services.safepath import resolve_safe_path

        # 4096 chars, well beyond max
        long_path = "a" * 4096
        with pytest.raises(HTTPException) as exc_info:
            resolve_safe_path("test-drive", long_path)
        assert exc_info.value.status_code == 400

    def test_normalizes_slashes(self, drive_root):
        """Multiple or redundant slashes should be handled."""
        from app.services.safepath import resolve_safe_path

        (drive_root / "notes").mkdir()
        result = resolve_safe_path("test-drive", "notes//./sub")
        # This should either resolve cleanly or reject — it must not escape
        assert str(result).startswith(str(drive_root.resolve()))


class TestValidateFilename:
    def test_accepts_normal_filename(self):
        from app.services.safepath import validate_filename

        validate_filename("memo.md")
        validate_filename("ノート.md")
        validate_filename("2026-04-13-meeting.md")

    def test_rejects_empty(self):
        from app.services.safepath import validate_filename

        with pytest.raises(HTTPException) as exc_info:
            validate_filename("")
        assert exc_info.value.status_code == 400

    def test_rejects_only_dots(self):
        from app.services.safepath import validate_filename

        for name in (".", ".."):
            with pytest.raises(HTTPException) as exc_info:
                validate_filename(name)
            assert exc_info.value.status_code == 400

    def test_rejects_path_separator(self):
        from app.services.safepath import validate_filename

        for name in ("foo/bar.md", "foo\\bar.md"):
            with pytest.raises(HTTPException) as exc_info:
                validate_filename(name)
            assert exc_info.value.status_code == 400

    def test_rejects_nul_byte(self):
        from app.services.safepath import validate_filename

        with pytest.raises(HTTPException) as exc_info:
            validate_filename("foo\x00.md")
        assert exc_info.value.status_code == 400

    def test_rejects_control_chars(self):
        from app.services.safepath import validate_filename

        with pytest.raises(HTTPException) as exc_info:
            validate_filename("foo\x01bar.md")
        assert exc_info.value.status_code == 400

    def test_rejects_reserved_names(self):
        from app.services.safepath import validate_filename

        for reserved in ("CON", "NUL", "AUX", "PRN", "COM1", "LPT1"):
            with pytest.raises(HTTPException):
                validate_filename(reserved)
            with pytest.raises(HTTPException):
                validate_filename(f"{reserved}.md")  # reserved stems also rejected
            with pytest.raises(HTTPException):
                validate_filename(reserved.lower())

    def test_rejects_too_long(self):
        from app.services.safepath import validate_filename

        long_name = "a" * 256 + ".md"
        with pytest.raises(HTTPException) as exc_info:
            validate_filename(long_name)
        assert exc_info.value.status_code == 400

    def test_accepts_near_limit(self):
        from app.services.safepath import validate_filename

        # 250 char name within 255 limit
        validate_filename("a" * 250 + ".md")
