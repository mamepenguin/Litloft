"""Integration tests for frontmatter ``aliases:`` → ``File.md_aliases`` projection.

Spec: docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md
§3.6 and Phase B.

For ``.md`` files, ``PUT /api/files/{id}/content`` must:

1. Parse the frontmatter ``aliases:`` list.
2. Validate each entry (string, length <= 100, non-empty after strip).
3. Project the cleaned list (JSON-encoded) into ``File.md_aliases``.
4. Cap the list at 20 entries.
5. Same isolation pattern as the Phase A ``md_id`` projection: a
   projection failure must not roll back the content write.

Storage shape (resolved spec ambiguity): a JSON-encoded list of
strings (``json.dumps(["alpha", "beta"])`` → ``'["alpha", "beta"]'``)
because the column is ``Text`` (per spec §3.6).

For non-list / empty / invalid input, ``md_aliases`` is set to ``NULL``
(resolved spec ambiguity: NULL is "no aliases" — both an empty list
and absence of the key serialise the same way; NULL is the canonical
"missing" form).

These tests RED until Phase B implementation lands.
"""
from __future__ import annotations

import hashlib
import json

import pytest

from app.models import File
from tests.conftest import TEST_DRIVE


def _etag_of(content: str | bytes) -> str:
    if isinstance(content, str):
        content = content.encode("utf-8")
    return hashlib.sha256(content).hexdigest()


def _seed_md(db, drive_dir, path: str, content: str = "initial\n") -> File:
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


def _refresh(session, file_id: str) -> File:
    session.expire_all()
    return session.query(File).filter(File.id == file_id).first()


class TestAliasesProjectionHappyPath:
    def test_aliases_list_serialised_to_json(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")
        new_content = (
            "---\naliases:\n  - alpha\n  - beta\n---\n\nbody\n"
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
        refreshed = _refresh(session, file.id)
        assert refreshed.md_aliases is not None
        assert json.loads(refreshed.md_aliases) == ["alpha", "beta"]

    def test_single_alias(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")
        new_content = "---\naliases:\n  - only\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        refreshed = _refresh(session, file.id)
        assert json.loads(refreshed.md_aliases) == ["only"]

    def test_unicode_aliases(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")
        new_content = (
            "---\n"
            "aliases:\n  - 年次振り返り\n  - YearRecap\n"
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
        refreshed = _refresh(session, file.id)
        loaded = json.loads(refreshed.md_aliases)
        assert "年次振り返り" in loaded
        assert "YearRecap" in loaded

    def test_control_chars_and_bidi_stripped(self, client):
        # RTL override + zero-width spaces are removed; surviving visible
        # characters form the canonical alias.
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")
        # YAML double-quoted scalar so we can embed \u escapes literally.
        new_content = (
            "---\n"
            'aliases:\n  - "‮evil‬"\n  - "year​recap"\n'
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
        refreshed = _refresh(session, file.id)
        loaded = json.loads(refreshed.md_aliases)
        assert loaded == ["evil", "yearrecap"]


class TestAliasesProjectionDegenerateInput:
    def test_empty_list_becomes_null(self, client):
        # Empty ``aliases: []`` projects to NULL (canonical "no aliases").
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")
        new_content = "---\naliases: []\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        refreshed = _refresh(session, file.id)
        assert refreshed.md_aliases is None

    def test_missing_aliases_key_becomes_null(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")
        new_content = "---\ntags:\n  - x\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        refreshed = _refresh(session, file.id)
        assert refreshed.md_aliases is None

    def test_non_list_aliases_becomes_null(self, client):
        # ``aliases: "alpha"`` (a bare string, not a list) → invalid →
        # NULL.  The frontmatter is still accepted; only the projection
        # is rejected silently.
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")
        new_content = "---\naliases: alpha\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        refreshed = _refresh(session, file.id)
        assert refreshed.md_aliases is None

    def test_non_string_elements_filtered_out(self, client):
        # YAML allows mixed types in a list.  Non-string entries are
        # dropped silently.
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")
        new_content = (
            "---\naliases:\n  - alpha\n  - 42\n  - beta\n  - true\n"
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
        refreshed = _refresh(session, file.id)
        loaded = json.loads(refreshed.md_aliases)
        assert loaded == ["alpha", "beta"]


class TestAliasesProjectionLimits:
    def test_caps_at_20_entries(self, client):
        # The cap is 20 entries; everything beyond is dropped.
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")
        aliases = "\n".join(f"  - a{i:02d}" for i in range(30))
        new_content = f"---\naliases:\n{aliases}\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        refreshed = _refresh(session, file.id)
        loaded = json.loads(refreshed.md_aliases)
        assert len(loaded) == 20
        # First 20 survive in order.
        assert loaded == [f"a{i:02d}" for i in range(20)]

    def test_drops_entries_longer_than_100_chars(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")
        long_alias = "x" * 101
        new_content = (
            "---\n"
            f"aliases:\n  - good\n  - {long_alias}\n  - alsogood\n"
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
        refreshed = _refresh(session, file.id)
        loaded = json.loads(refreshed.md_aliases)
        assert loaded == ["good", "alsogood"]

    def test_drops_empty_string_entries(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")
        new_content = (
            "---\naliases:\n  - alpha\n  - ''\n  - beta\n"
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
        refreshed = _refresh(session, file.id)
        loaded = json.loads(refreshed.md_aliases)
        assert loaded == ["alpha", "beta"]


class TestAliasesProjectionRewrite:
    def test_subsequent_write_replaces_aliases(self, client):
        # Editing the frontmatter to a smaller list must overwrite,
        # not merge.
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")

        first = "---\naliases:\n  - alpha\n  - beta\n  - gamma\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=first.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        # Read current ETag — server may have rewritten body to inject id.
        current_bytes = (drive_dir / "n.md").read_bytes()
        first_etag = _etag_of(current_bytes)

        second = "---\naliases:\n  - only-one\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=second.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{first_etag}"',
            },
        )
        assert r.status_code == 200, r.text
        refreshed = _refresh(session, file.id)
        loaded = json.loads(refreshed.md_aliases)
        assert loaded == ["only-one"]

    def test_removing_aliases_key_clears_projection(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "n.md", "initial\n")

        first = "---\naliases:\n  - alpha\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=first.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        current_bytes = (drive_dir / "n.md").read_bytes()
        first_etag = _etag_of(current_bytes)

        # Now remove the key entirely.
        second = "---\ntags: []\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=second.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{first_etag}"',
            },
        )
        assert r.status_code == 200, r.text
        refreshed = _refresh(session, file.id)
        assert refreshed.md_aliases is None


class TestAliasesProjectionNonMd:
    def test_txt_file_md_aliases_remains_null(self, client):
        # Non-markdown files: ``md_aliases`` is always NULL.
        api, session, drive_dir, _ = client
        txt_path = drive_dir / "plain.txt"
        txt_path.write_text("initial\n")
        f = File(
            filename="plain.txt",
            title="plain.txt",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="plain.txt",
            file_size=8,
            file_type="document",
            mime_type="text/plain",
        )
        session.add(f)
        session.commit()
        session.refresh(f)

        new_content = "---\naliases:\n  - x\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{f.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        refreshed = _refresh(session, f.id)
        assert refreshed.md_aliases is None


class TestMdAliasesColumn:
    """Schema-level contract for the ``File.md_aliases`` column."""

    def test_column_exists_and_nullable(self, db_session):
        f = File(
            filename="x.md",
            title="x.md",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="x.md",
            file_size=10,
            file_type="document",
            mime_type="text/markdown",
        )
        db_session.add(f)
        db_session.commit()
        db_session.refresh(f)
        # NULL is the default for new rows.
        assert f.md_aliases is None

    def test_column_accepts_json_string(self, db_session):
        f = File(
            filename="x.md",
            title="x.md",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="x.md",
            file_size=10,
            file_type="document",
            mime_type="text/markdown",
            md_aliases=json.dumps(["alpha", "beta"]),
        )
        db_session.add(f)
        db_session.commit()
        db_session.refresh(f)
        assert json.loads(f.md_aliases) == ["alpha", "beta"]
