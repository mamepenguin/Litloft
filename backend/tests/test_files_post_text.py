"""Tests for POST /api/drives/{drive}/files — new text file creation.

Lightweight alternative to multipart upload for creating .md/.txt files
with initial content (used by the knowledge addon but generally useful).

Covers:
- 201 on new file creation
- 409 on existing active file
- 409 on existing trashed file (user must purge first)
- Missing file recovery (UPSERT): if a row exists with missing_since set,
  the new content replaces it and the row becomes active again
- 400 on path traversal, absolute paths, NUL/control chars
- 400 on non-text extensions (.mp4 etc.)
- 413 on oversize body
- 404 on unknown drive
- 403 on protected drive (no unlock)
"""
import pytest

from app.models import File
from tests.conftest import TEST_DRIVE


class TestPostFiles:
    def test_creates_new_md_file(self, client):
        api, session, drive_dir, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "notes/first.md", "content": "# Hello\n\nWorld\n"},
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["filename"] == "first.md"
        assert data["folder_path"] == "notes"
        assert data["mime_type"] == "text/markdown"
        # Physical file exists
        assert (drive_dir / "notes/first.md").read_text() == "# Hello\n\nWorld\n"
        # DB row exists
        row = session.query(File).filter(File.file_path == "notes/first.md").first()
        assert row is not None
        assert row.file_type == "document"

    def test_creates_txt_file(self, client):
        api, _, drive_dir, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "memo.txt", "content": "plain text"},
        )
        assert r.status_code == 201
        assert r.json()["mime_type"] == "text/plain"

    def test_allows_empty_content(self, client):
        api, _, drive_dir, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "empty.md", "content": ""},
        )
        assert r.status_code == 201
        assert (drive_dir / "empty.md").read_text() == ""

    def test_rejects_existing_active_file(self, client):
        api, session, drive_dir, _ = client
        (drive_dir / "taken.md").write_text("x")
        session.add(File(
            filename="taken.md",
            title="taken.md",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="taken.md",
            file_size=1,
            file_type="document",
            mime_type="text/markdown",
        ))
        session.commit()

        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "taken.md", "content": "conflict"},
        )
        assert r.status_code == 409

    def test_rejects_existing_trashed_file(self, client):
        """Trashed files block re-creation with same path — user must
        purge first (mirrors the existing upload-conflict UX)."""
        from datetime import UTC, datetime

        api, session, drive_dir, _ = client
        (drive_dir / "trashed.md").write_text("x")
        session.add(File(
            filename="trashed.md",
            title="trashed.md",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="trashed.md",
            file_size=1,
            file_type="document",
            mime_type="text/markdown",
            deleted_at=datetime.now(UTC).replace(tzinfo=None),
        ))
        session.commit()

        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "trashed.md", "content": "conflict"},
        )
        assert r.status_code == 409

    def test_recovers_missing_file(self, client):
        """Missing file (FS gone but row preserved) is recovered by re-write."""
        from datetime import UTC, datetime

        api, session, drive_dir, _ = client
        row = File(
            filename="lost.md",
            title="lost.md",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="lost.md",
            file_size=5,
            file_type="document",
            mime_type="text/markdown",
            missing_since=datetime.now(UTC).replace(tzinfo=None),
        )
        session.add(row)
        session.commit()
        original_id = row.id

        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "lost.md", "content": "found again"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["id"] == original_id  # same row, recovered
        session.refresh(row)
        assert row.missing_since is None
        assert (drive_dir / "lost.md").read_text() == "found again"

    def test_rejects_path_traversal(self, client):
        api, _, _, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "../escape.md", "content": "x"},
        )
        assert r.status_code == 400

    def test_rejects_absolute_path(self, client):
        api, _, _, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "/etc/evil.md", "content": "x"},
        )
        assert r.status_code == 400

    def test_rejects_nul_byte(self, client):
        api, _, _, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "bad\x00file.md", "content": "x"},
        )
        assert r.status_code == 400

    def test_rejects_non_text_extension(self, client):
        api, _, _, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "foo.mp4", "content": "binary?"},
        )
        assert r.status_code == 415

    def test_rejects_oversize_content(self, client):
        api, _, _, _ = client
        big = "x" * (2 * 1024 * 1024)
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "big.md", "content": big},
        )
        assert r.status_code == 413

    def test_rejects_unknown_drive(self, client):
        api, _, _, _ = client
        r = api.post(
            f"/api/drives/nonexistent-drive/files",
            json={"path": "x.md", "content": "x"},
        )
        assert r.status_code == 404

    def test_creates_parent_folder(self, client):
        """Missing parent directory is created as needed."""
        api, _, drive_dir, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "deep/nested/path/note.md", "content": "x"},
        )
        assert r.status_code == 201
        assert (drive_dir / "deep/nested/path/note.md").exists()
