"""HTTP tests for GET /api/internal/files/{id}/content.

Returns the raw UTF-8 text content of a file from its drive mount. Used
by the knowledge addon's note scanner to reconcile ``note_origins``
cache against Vault ``.md`` frontmatter even when the file lives on a
password-protected drive (the scanner has no user cookie). Gated by an
optional shared secret ``CORE_INTERNAL_SECRET`` that matches the
``KNOWLEDGE_WEBHOOK_SECRET`` pattern in reverse direction.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime

import pytest

from app.models import File
from tests.conftest import TEST_DRIVE


def _seed_md(db, drive_dir, path: str, content: str = "---\ntitle: x\n---\nbody\n") -> File:
    fp = drive_dir / path
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(content, encoding="utf-8")

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
    fp = drive_dir / path
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_bytes(b"\x00" * 64)

    *folders, filename = path.split("/")
    folder = "/".join(folders)

    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=path,
        file_size=64,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


@pytest.fixture(autouse=True)
def _clear_secret_env():
    """Each test starts with CORE_INTERNAL_SECRET unset; individual tests
    set it explicitly when exercising the gated path.
    """
    prev = os.environ.pop("CORE_INTERNAL_SECRET", None)
    try:
        yield
    finally:
        if prev is not None:
            os.environ["CORE_INTERNAL_SECRET"] = prev
        else:
            os.environ.pop("CORE_INTERNAL_SECRET", None)


class TestInternalFileContent:
    def test_returns_text_when_secret_unset(self, client):
        c, db, drive_dir, _ = client
        f = _seed_md(db, drive_dir, "notes/hello.md", "hello world\n")
        r = c.get(f"/api/internal/files/{f.id}/content")
        assert r.status_code == 200, r.text
        assert r.text == "hello world\n"
        assert r.headers["content-type"].startswith("text/plain")

    def test_returns_text_with_matching_secret(self, client):
        c, db, drive_dir, _ = client
        os.environ["CORE_INTERNAL_SECRET"] = "topsecret"
        f = _seed_md(db, drive_dir, "notes/with-secret.md", "guarded\n")
        r = c.get(
            f"/api/internal/files/{f.id}/content",
            headers={"X-Internal-Secret": "topsecret"},
        )
        assert r.status_code == 200
        assert r.text == "guarded\n"

    def test_rejects_mismatched_secret(self, client):
        c, db, drive_dir, _ = client
        os.environ["CORE_INTERNAL_SECRET"] = "topsecret"
        f = _seed_md(db, drive_dir, "notes/x.md")
        r = c.get(
            f"/api/internal/files/{f.id}/content",
            headers={"X-Internal-Secret": "wrong"},
        )
        assert r.status_code == 403

    def test_rejects_missing_secret_when_configured(self, client):
        c, db, drive_dir, _ = client
        os.environ["CORE_INTERNAL_SECRET"] = "topsecret"
        f = _seed_md(db, drive_dir, "notes/x.md")
        r = c.get(f"/api/internal/files/{f.id}/content")
        assert r.status_code == 403

    def test_404_for_unknown_file(self, client):
        c, _db, _, _ = client
        r = c.get("/api/internal/files/no-such-file/content")
        assert r.status_code == 404

    def test_404_for_trashed_file(self, client):
        c, db, drive_dir, _ = client
        f = _seed_md(db, drive_dir, "notes/t.md")
        f.deleted_at = datetime.now(UTC).replace(tzinfo=None)
        db.commit()
        r = c.get(f"/api/internal/files/{f.id}/content")
        assert r.status_code == 404

    def test_404_for_missing_file(self, client):
        c, db, drive_dir, _ = client
        f = _seed_md(db, drive_dir, "notes/m.md")
        f.missing_since = datetime.now(UTC).replace(tzinfo=None)
        db.commit()
        r = c.get(f"/api/internal/files/{f.id}/content")
        assert r.status_code == 404

    def test_415_for_non_text_mime(self, client):
        c, db, drive_dir, _ = client
        f = _seed_video(db, drive_dir, "v.mp4")
        r = c.get(f"/api/internal/files/{f.id}/content")
        assert r.status_code == 415

    def test_413_when_file_exceeds_limit(self, client, monkeypatch):
        """Oversized text files are rejected up front via stat(), not streamed."""
        c, db, drive_dir, _ = client
        from app.routers import internal as internal_mod

        monkeypatch.setattr(internal_mod, "_CONTENT_READ_MAX_BYTES", 16)
        f = _seed_md(db, drive_dir, "notes/big.md", "x" * 1024)
        r = c.get(f"/api/internal/files/{f.id}/content")
        assert r.status_code == 413

    def test_415_on_non_utf8_bytes(self, client):
        """Binary bytes labelled text/plain still fail the UTF-8 decode guard."""
        c, db, drive_dir, _ = client
        fp = drive_dir / "junk.txt"
        fp.write_bytes(b"\xff\xfe\x00\x01\x80")
        f = File(
            filename="junk.txt",
            title="junk.txt",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="junk.txt",
            file_size=5,
            file_type="document",
            mime_type="text/plain",
        )
        db.add(f)
        db.commit()
        db.refresh(f)
        r = c.get(f"/api/internal/files/{f.id}/content")
        assert r.status_code == 415

    def test_404_when_db_row_exists_but_file_missing(self, client):
        """Row present + FS file already removed. No missing_since set yet
        (race between scanner and scan-time physical delete). We return 404
        rather than leaking an empty body or a stack trace.
        """
        c, db, drive_dir, _ = client
        f = _seed_md(db, drive_dir, "notes/phantom.md")
        (drive_dir / "notes/phantom.md").unlink()
        r = c.get(f"/api/internal/files/{f.id}/content")
        assert r.status_code == 404
