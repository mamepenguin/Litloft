"""Tests for PUT /api/files/{id}/content — text file write API.

Covers:
- 200 success with new ETag
- 412 Precondition Failed on ETag mismatch
- 428 Precondition Required when If-Match is missing
- 413 Payload Too Large when body exceeds 1 MB
- 415 Unsupported Media Type for non-allowlisted mime types
- 404 for missing / trashed files
"""
import hashlib

import pytest

from app.models import File
from tests.conftest import TEST_DRIVE


def _etag_of(content: str | bytes) -> str:
    if isinstance(content, str):
        content = content.encode("utf-8")
    return hashlib.sha256(content).hexdigest()


def _seed_md(db, drive_dir, path: str, content: str = "initial\n") -> File:
    """Create a .md file on disk and its File row."""
    file_path = drive_dir / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content)

    *folders, filename = path.split("/")
    folder = "/".join(folders)

    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=path,
        file_size=len(content.encode("utf-8")),
        file_type="document",
        mime_type="text/markdown",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _seed_video(db, drive_dir, path: str) -> File:
    file_path = drive_dir / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(b"\x00" * 128)

    *folders, filename = path.split("/")
    folder = "/".join(folders)

    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=path,
        file_size=128,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


class TestPutContent:
    def test_rejects_missing_if_match(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/memo.md")
        r = api.put(
            f"/api/files/{file.id}/content",
            content=b"new content\n",
            headers={"Content-Type": "text/plain; charset=utf-8"},
        )
        assert r.status_code == 428

    def test_rejects_wrong_etag(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/memo.md")
        r = api.put(
            f"/api/files/{file.id}/content",
            content=b"new content\n",
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": '"wrong-etag-value"',
            },
        )
        assert r.status_code == 412

    def test_updates_on_correct_etag(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/memo.md", "initial\n")
        current_etag = _etag_of("initial\n")
        new_content = "updated content\n"

        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{current_etag}"',
            },
        )
        assert r.status_code == 200, r.text
        assert r.headers["ETag"].strip('"') == _etag_of(new_content)
        assert (drive_dir / "notes/memo.md").read_text() == new_content

    def test_rejects_oversize_body(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/memo.md")
        big = b"x" * (2 * 1024 * 1024)
        r = api.put(
            f"/api/files/{file.id}/content",
            content=big,
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 413

    def test_rejects_video_mime(self, client):
        api, session, drive_dir, _ = client
        file = _seed_video(session, drive_dir, "v.mp4")
        r = api.put(
            f"/api/files/{file.id}/content",
            content=b"text trying to overwrite video",
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": '"anything"',
            },
        )
        assert r.status_code == 415

    def test_404_for_deleted_file(self, client):
        from datetime import UTC, datetime

        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/memo.md")
        # Soft-delete
        file.deleted_at = datetime.now(UTC).replace(tzinfo=None)
        session.commit()

        r = api.put(
            f"/api/files/{file.id}/content",
            content=b"after delete",
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 404

    def test_empty_content_allowed(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/memo.md", "initial\n")
        r = api.put(
            f"/api/files/{file.id}/content",
            content=b"",
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200
        assert (drive_dir / "notes/memo.md").read_text() == ""
        assert r.headers["ETag"].strip('"') == _etag_of("")

    def test_accepts_text_plain_mime(self, client):
        """text/plain files (e.g., .txt) should also be writable."""
        api, session, drive_dir, _ = client
        file_path = drive_dir / "notes.txt"
        file_path.write_text("old\n")
        file = File(
            filename="notes.txt",
            title="notes.txt",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="notes.txt",
            file_size=4,
            file_type="document",
            mime_type="text/plain",
        )
        session.add(file)
        session.commit()
        session.refresh(file)

        r = api.put(
            f"/api/files/{file.id}/content",
            content=b"new\n",
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("old\n")}"',
            },
        )
        assert r.status_code == 200

    def test_missing_file_returns_404(self, client):
        """File marked missing (FS gone) rejects content write."""
        from datetime import UTC, datetime

        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/memo.md")
        file.missing_since = datetime.now(UTC).replace(tzinfo=None)
        session.commit()

        r = api.put(
            f"/api/files/{file.id}/content",
            content=b"data",
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 404
