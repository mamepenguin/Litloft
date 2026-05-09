"""Tests for POST /api/drives/{drive}/files — new text file creation.

Lightweight alternative to multipart upload for creating files with
initial UTF-8 text content. Originally `.md` / `.txt` only (knowledge
addon); Phase 4 of the Vault-Core merger drops the allowlist so any
extension is creatable, with automatic suffix numbering on name
conflicts.

Covers:
- 201 on new file creation (any extension, including no extension)
- 201 on existing active file collision (suffix-numbered fallback)
- 201 on existing trashed file collision (suffix-numbered fallback)
- Missing file recovery (UPSERT): if a row exists with missing_since set,
  the new content replaces it and the row becomes active again
  (precedence over suffix numbering)
- 400 on path traversal, absolute paths, NUL/control chars
- 413 on oversize body (regardless of extension)
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

    def test_create_text_file_suffix_numbering_on_active_collision(self, client):
        """Phase 4: active-file collision → suffix-numbered 201, both
        files survive on disk and in DB."""
        api, session, drive_dir, _ = client
        (drive_dir / "untitled-20260509.md").write_text("first")
        session.add(File(
            filename="untitled-20260509.md",
            title="untitled-20260509",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="untitled-20260509.md",
            file_size=5,
            file_type="document",
            mime_type="text/markdown",
        ))
        session.commit()

        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "untitled-20260509.md", "content": "second"},
        )
        assert r.status_code == 201, r.text
        data = r.json()
        # Response reflects the suffix-numbered path
        assert data["filename"] == "untitled-20260509 (1).md"
        assert data["folder_path"] == ""
        # Both files exist on disk
        assert (drive_dir / "untitled-20260509.md").read_text() == "first"
        assert (drive_dir / "untitled-20260509 (1).md").read_text() == "second"
        # Both DB rows exist (active)
        rows = (
            session.query(File)
            .filter(File.drive == TEST_DRIVE)
            .filter(File.deleted_at.is_(None))
            .filter(File.missing_since.is_(None))
            .order_by(File.file_path)
            .all()
        )
        paths = {r.file_path for r in rows}
        assert "untitled-20260509.md" in paths
        assert "untitled-20260509 (1).md" in paths

    def test_create_text_file_suffix_numbering_on_trash_collision(self, client):
        """Phase 4: trashed-file collision → suffix-numbered 201; the
        trashed file is preserved at its original path."""
        from datetime import UTC, datetime

        api, session, drive_dir, _ = client
        # Trashed file: DB row marked deleted, FS may or may not exist.
        # The suffix logic should ignore the trashed row's path slot.
        session.add(File(
            filename="note.md",
            title="note",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="note.md",
            file_size=1,
            file_type="document",
            mime_type="text/markdown",
            deleted_at=datetime.now(UTC).replace(tzinfo=None),
        ))
        session.commit()

        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "note.md", "content": "fresh"},
        )
        assert r.status_code == 201, r.text
        data = r.json()
        # New file lands at the suffixed path
        assert data["filename"] == "note (1).md"
        assert data["folder_path"] == ""
        assert (drive_dir / "note (1).md").read_text() == "fresh"
        # Trashed row is untouched
        trashed = (
            session.query(File)
            .filter(File.file_path == "note.md")
            .filter(File.deleted_at.isnot(None))
            .first()
        )
        assert trashed is not None

    def test_create_text_file_suffix_numbering_increments_to_2(self, client):
        """Phase 4: triggering the same collision twice lands at (2)."""
        api, session, drive_dir, _ = client
        (drive_dir / "note.md").write_text("orig")
        session.add(File(
            filename="note.md",
            title="note",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="note.md",
            file_size=4,
            file_type="document",
            mime_type="text/markdown",
        ))
        session.commit()

        # First collision → (1)
        r1 = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "note.md", "content": "one"},
        )
        assert r1.status_code == 201, r1.text
        assert r1.json()["filename"] == "note (1).md"

        # Second collision → (2)
        r2 = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "note.md", "content": "two"},
        )
        assert r2.status_code == 201, r2.text
        assert r2.json()["filename"] == "note (2).md"
        assert (drive_dir / "note (2).md").read_text() == "two"

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

    def test_create_text_file_accepts_json_extension(self, client):
        """Phase 4: allowlist removed — `.json` is creatable."""
        api, _, drive_dir, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "foo.json", "content": "{}"},
        )
        assert r.status_code == 201, r.text
        # mime classification is still applied (sanity check)
        assert r.json().get("mime_type")
        assert (drive_dir / "foo.json").read_text() == "{}"

    def test_create_text_file_accepts_python_extension(self, client):
        """Phase 4: `.py` is creatable."""
        api, _, drive_dir, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "script.py", "content": "x = 1\n"},
        )
        assert r.status_code == 201, r.text
        assert (drive_dir / "script.py").read_text() == "x = 1\n"

    def test_create_text_file_accepts_html_extension(self, client):
        """Phase 4: `.html` is creatable (XSS risk equivalent to upload)."""
        api, _, drive_dir, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "page.html", "content": "<p>hi</p>"},
        )
        assert r.status_code == 201, r.text
        assert (drive_dir / "page.html").read_text() == "<p>hi</p>"

    def test_create_text_file_accepts_arbitrary_extension(self, client):
        """Phase 4: unknown extensions fall through to octet-stream and
        are still creatable (treated as plain text by the JSON body)."""
        api, _, drive_dir, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "weird.xyz", "content": "hi"},
        )
        assert r.status_code == 201, r.text
        assert (drive_dir / "weird.xyz").read_text() == "hi"

    def test_create_text_file_accepts_no_extension(self, client):
        """Phase 4: extensionless filenames (e.g. README) are creatable."""
        api, _, drive_dir, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "README", "content": "hi"},
        )
        assert r.status_code == 201, r.text
        assert (drive_dir / "README").read_text() == "hi"

    def test_create_text_file_size_limit_still_enforced(self, client):
        """Phase 4: 1 MB cap survives allowlist removal (use .json to
        prove the gate is size-based, not extension-based)."""
        api, _, _, _ = client
        big = "x" * (2 * 1024 * 1024)
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "big.json", "content": big},
        )
        assert r.status_code == 413

    def test_create_text_file_path_traversal_still_rejected(self, client):
        """Phase 4: traversal protection survives allowlist removal."""
        api, _, _, _ = client
        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "../etc/passwd", "content": "x"},
        )
        assert r.status_code == 400

    def test_create_text_file_missing_state_still_upserts(self, client):
        """Phase 4: missing-state precedence over suffix numbering.

        When a row exists with `missing_since` set at the requested path,
        re-create must reuse the row (UPSERT, status 200) rather than
        falling through to suffix-numbered creation.
        """
        from datetime import UTC, datetime

        api, session, drive_dir, _ = client
        row = File(
            filename="upsert.md",
            title="upsert",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="upsert.md",
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
            json={"path": "upsert.md", "content": "back"},
        )
        # Recovery returns 200 (not 201, and not a suffix-numbered path)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == original_id
        assert data["filename"] == "upsert.md"
        assert data["folder_path"] == ""
        assert (drive_dir / "upsert.md").read_text() == "back"
        # No suffix-numbered file should have been created
        assert not (drive_dir / "upsert (1).md").exists()

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

    def test_create_text_file_atomic_creation_does_not_clobber_existing_fs_file(
        self, client
    ):
        """Phase 4 + race-safety: a stray FS file at the candidate path
        (no DB row) must not be overwritten. The atomic create path
        (O_CREAT|O_EXCL) detects FS-level existence and falls through to
        the next suffix.
        """
        api, session, drive_dir, _ = client
        # Stray file on disk only — no DB row anywhere.
        (drive_dir / "untitled-XXX.md").write_text("preexisting")

        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "untitled-XXX.md", "content": "fresh"},
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["filename"] == "untitled-XXX (1).md"
        # Stray FS file content is untouched.
        assert (drive_dir / "untitled-XXX.md").read_text() == "preexisting"
        # New file written at the suffixed path.
        assert (drive_dir / "untitled-XXX (1).md").read_text() == "fresh"
        # Only the suffixed path has a DB row.
        rows = (
            session.query(File)
            .filter(File.drive == TEST_DRIVE)
            .filter(File.deleted_at.is_(None))
            .filter(File.missing_since.is_(None))
            .all()
        )
        paths = {r.file_path for r in rows}
        assert "untitled-XXX (1).md" in paths
        assert "untitled-XXX.md" not in paths
