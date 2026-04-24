"""Tests for PUT /api/files/{id}/content — text file write API.

Covers:
- 200 success with new ETag
- 412 Precondition Failed on ETag mismatch
- 428 Precondition Required when If-Match is missing
- 413 Payload Too Large when body exceeds 1 MB
- 415 Unsupported Media Type for non-allowlisted mime types
- 404 for missing / trashed files
- Frontmatter → File.tags projection for .md writes (spec 2026-04-24, Phase 11)
"""
import hashlib

import pytest

from app.models import File, Tag
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


class TestFrontmatterTagProjection:
    """PUT /content on a .md file projects frontmatter tags onto File.tags.

    Spec: docs/superpowers/specs/2026-04-24-knowledge-tag-unification.md §D1
    (β canonical rule). Before Phase 11 this projection was done by a
    separate knowledge-addon call; now it happens in the same handler
    as the content write.
    """

    def _tag_names(self, session, file_id: str) -> list[str]:
        f = session.query(File).filter(File.id == file_id).first()
        return sorted(t.name for t in f.tags)

    def test_writes_frontmatter_tags_to_file_tags(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/memo.md", "initial\n")
        new_content = "---\ntags:\n  - cooking\n  - weeknight\n---\n\n# Dinner\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        session.expire_all()
        assert self._tag_names(session, file.id) == ["cooking", "weeknight"]

    def test_removing_tags_clears_file_tags(self, client):
        # β rule: absence of ``tags:`` means File.tags should be empty.
        api, session, drive_dir, _ = client
        file = _seed_md(
            session, drive_dir, "notes/memo.md",
            "---\ntags: [keep, drop]\n---\n\nbody\n",
        )
        # Pre-seed File.tags as if a previous write / scanner had run.
        tag_keep = Tag(name="keep", drive=TEST_DRIVE)
        tag_drop = Tag(name="drop", drive=TEST_DRIVE)
        session.add_all([tag_keep, tag_drop])
        session.commit()
        file.tags = [tag_keep, tag_drop]
        session.commit()

        current = "---\ntags: [keep, drop]\n---\n\nbody\n"
        new_content = "no frontmatter anymore\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of(current)}"',
            },
        )
        assert r.status_code == 200, r.text
        session.expire_all()
        assert self._tag_names(session, file.id) == []

    def test_malformed_yaml_does_not_block_write(self, client):
        # Broken frontmatter must succeed the write; the bytes land on
        # disk even if we can't project tags.
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/memo.md", "initial\n")
        new_content = "---\ntags: [unterminated\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        assert (drive_dir / "notes/memo.md").read_text() == new_content

    def test_invalid_tag_names_are_silently_dropped(self, client):
        # A frontmatter with mixed valid / invalid tags must project
        # the valid ones only, not 422 the whole write.
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/memo.md", "initial\n")
        new_content = (
            "---\n"
            "tags:\n"
            "  - valid-tag\n"
            "  - \"has space\"\n"  # invalid (space)
            "  - ok_2\n"
            "---\n\nbody\n"
        )
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        session.expire_all()
        assert self._tag_names(session, file.id) == ["ok_2", "valid-tag"]

    def test_non_markdown_file_is_not_projected(self, client):
        # A .txt write goes through PUT /content but must NOT interpret
        # its body as frontmatter — plain text shouldn't surprise-sync
        # tags.
        api, session, drive_dir, _ = client
        file_path = drive_dir / "plain.txt"
        file_path.write_text("old\n")
        file = File(
            filename="plain.txt",
            title="plain.txt",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="plain.txt",
            file_size=4,
            file_type="document",
            mime_type="text/plain",
        )
        session.add(file)
        session.commit()
        session.refresh(file)
        existing = Tag(name="manual", drive=TEST_DRIVE)
        session.add(existing)
        session.commit()
        file.tags = [existing]
        session.commit()

        new_content = "---\ntags: [should_not_apply]\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("old\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        session.expire_all()
        assert self._tag_names(session, file.id) == ["manual"]

    def test_txt_extension_md_mime_is_projected(self, client):
        # If mime is text/markdown we trust it regardless of
        # extension — matches the frontend's isMarkdown.
        api, session, drive_dir, _ = client
        file_path = drive_dir / "weird.txt"
        file_path.write_text("initial\n")
        file = File(
            filename="weird.txt",
            title="weird.txt",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="weird.txt",
            file_size=8,
            file_type="document",
            mime_type="text/markdown",
        )
        session.add(file)
        session.commit()
        session.refresh(file)

        r = api.put(
            f"/api/files/{file.id}/content",
            content=b"---\ntags: [a]\n---\n\nbody\n",
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        session.expire_all()
        assert self._tag_names(session, file.id) == ["a"]
