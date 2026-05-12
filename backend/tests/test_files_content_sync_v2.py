"""Integration tests for ``_sync_md_file_relations`` v2 (Phase B).

Spec: docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md
§3.5 and Phase B.

After Phase B, the sync function combines:

- ``loft://`` ids extracted from the body (existing behaviour from
  Phase 6's spec ``2026-05-06-knowledge-ask-citation-links.md``).
- Resolved wiki-link targets from ``[[X]]`` syntax.

Both contribute to ``target_ids`` and end up as ``file_relations``
rows with ``kind='related'``.

Ambiguous wiki targets DO NOT create relations — the user must
disambiguate explicitly.  Unresolved targets DO NOT create relations.

Phase A behaviours (loft:// only) must remain green — verified in
``test_content_put.py:TestLoftLinkRelationsSync``; here we focus on
new behaviours involving wiki-links.

RED until Phase B lands.
"""
from __future__ import annotations

import hashlib
import json

import pytest

from app.models import File, FileRelation
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


def _relation_targets(session, file_id: str) -> set[str]:
    rels = (
        session.query(FileRelation)
        .filter(
            (FileRelation.file_id_a == file_id)
            | (FileRelation.file_id_b == file_id),
            FileRelation.kind == "related",
        )
        .all()
    )
    out: set[str] = set()
    for r in rels:
        out.add(r.file_id_b if r.file_id_a == file_id else r.file_id_a)
    return out


def _put(api, file_id: str, body: str, old_body: str):
    return api.put(
        f"/api/files/{file_id}/content",
        content=body.encode("utf-8"),
        headers={
            "Content-Type": "text/plain; charset=utf-8",
            "If-Match": f'"{_etag_of(old_body)}"',
        },
    )


# ---------------------------------------------------------------------------
# Phase A behaviour preserved (regressions)
# ---------------------------------------------------------------------------

class TestLoftOnlyStillWorks:
    """Pre-Phase-B behaviour: loft:// only must still produce relations."""

    def test_pure_loft_link(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md", "initial\n")
        target = _seed_video(session, drive_dir, "video.mp4")

        body = f"[v](loft://{target.id})\n"
        r = _put(api, note.id, body, "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        assert _relation_targets(session, note.id) == {target.id}


# ---------------------------------------------------------------------------
# New Phase B behaviour: wiki-link → file_relations
# ---------------------------------------------------------------------------

class TestWikiLinkSync:
    def test_basename_wiki_link_creates_relation(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md", "initial\n")
        target = _seed_md(session, drive_dir, "year-recap.md", "x\n")

        body = "See [[year-recap]] for context.\n"
        r = _put(api, note.id, body, "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        assert _relation_targets(session, note.id) == {target.id}

    def test_id_wiki_link_creates_relation(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md", "initial\n")
        target = _seed_md(session, drive_dir, "other.md", "x\n")
        target.md_id = "20260512143028"
        session.commit()

        body = "Refer to [[20260512143028]].\n"
        r = _put(api, note.id, body, "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        assert _relation_targets(session, note.id) == {target.id}

    def test_alias_wiki_link_creates_relation(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md", "initial\n")
        target = _seed_md(session, drive_dir, "year.md", "x\n")
        target.md_aliases = json.dumps(["annual-review"])
        session.commit()

        body = "See [[annual-review]].\n"
        r = _put(api, note.id, body, "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        assert _relation_targets(session, note.id) == {target.id}

    def test_mixed_loft_and_wiki(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md", "initial\n")
        video = _seed_video(session, drive_dir, "v.mp4")
        wiki_target = _seed_md(session, drive_dir, "year-recap.md", "x\n")

        body = (
            f"See [[year-recap]] and [video](loft://{video.id}?t=10).\n"
        )
        r = _put(api, note.id, body, "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        assert _relation_targets(session, note.id) == {
            wiki_target.id,
            video.id,
        }


# ---------------------------------------------------------------------------
# Ambiguous / unresolved must not create relations
# ---------------------------------------------------------------------------

class TestAmbiguousAndUnresolvedNotCreated:
    def test_ambiguous_does_not_create_relation(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md", "initial\n")
        _seed_md(session, drive_dir, "a/year.md", "x")
        _seed_md(session, drive_dir, "b/year.md", "y")

        body = "[[year]]\n"
        r = _put(api, note.id, body, "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        # Two candidates → ambiguous → no relation rows.
        assert _relation_targets(session, note.id) == set()

    def test_unresolved_does_not_create_relation(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md", "initial\n")
        body = "[[never-existed]]\n"
        r = _put(api, note.id, body, "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        assert _relation_targets(session, note.id) == set()


# ---------------------------------------------------------------------------
# Diff math: INSERT / DELETE
# ---------------------------------------------------------------------------

class TestSyncDiffMath:
    def test_remove_wiki_link_removes_relation(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md", "initial\n")
        target = _seed_md(session, drive_dir, "year-recap.md", "x\n")

        # First write: add link.
        body1 = "See [[year-recap]].\n"
        r = _put(api, note.id, body1, "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        assert _relation_targets(session, note.id) == {target.id}

        # Capture new ETag (server may have rewritten body with id).
        new_bytes = (drive_dir / "note.md").read_bytes()
        new_etag = _etag_of(new_bytes)

        # Second write: link removed.
        body2 = "Plain prose now.\n"
        r = api.put(
            f"/api/files/{note.id}/content",
            content=body2.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{new_etag}"',
            },
        )
        assert r.status_code == 200, r.text
        session.expire_all()
        assert _relation_targets(session, note.id) == set()

    def test_swap_wiki_target_swaps_relation(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md", "initial\n")
        target_a = _seed_md(session, drive_dir, "alpha.md", "x")
        target_b = _seed_md(session, drive_dir, "beta.md", "y")

        # First write: link to alpha.
        body1 = "[[alpha]]\n"
        r = _put(api, note.id, body1, "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        assert _relation_targets(session, note.id) == {target_a.id}

        new_bytes = (drive_dir / "note.md").read_bytes()
        new_etag = _etag_of(new_bytes)

        # Second write: link to beta only.
        body2 = "[[beta]]\n"
        r = api.put(
            f"/api/files/{note.id}/content",
            content=body2.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{new_etag}"',
            },
        )
        assert r.status_code == 200, r.text
        session.expire_all()
        # alpha removed, beta added.
        assert _relation_targets(session, note.id) == {target_b.id}


# ---------------------------------------------------------------------------
# Self-exclusion
# ---------------------------------------------------------------------------

class TestSyncSelfExclusion:
    def test_wiki_link_to_self_via_basename_skipped(self, client):
        api, session, drive_dir, _ = client
        # Note basename is ``note`` → wiki target ``[[note]]`` would
        # otherwise resolve to itself. Self-exclusion must drop it.
        note = _seed_md(session, drive_dir, "note.md", "initial\n")

        body = "Self-ref: [[note]]\n"
        r = _put(api, note.id, body, "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        assert _relation_targets(session, note.id) == set()

    def test_wiki_link_to_self_via_id_skipped(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md", "initial\n")
        # After the first write, the note will receive an md_id via
        # Phase A injection.  Subsequent wiki-link [[<that id>]]
        # should be filtered as self.
        r = _put(api, note.id, "first write\n", "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        refreshed = session.query(File).filter(File.id == note.id).first()
        # Phase A may not always inject when body lacks frontmatter;
        # in that case the test skips the id self-link assertion.
        if not refreshed.md_id:
            pytest.skip("md_id not auto-injected on body without frontmatter")

        new_bytes = (drive_dir / "note.md").read_bytes()
        new_etag = _etag_of(new_bytes)
        body = f"[[{refreshed.md_id}]]\n"
        r = api.put(
            f"/api/files/{note.id}/content",
            content=body.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{new_etag}"',
            },
        )
        assert r.status_code == 200, r.text
        session.expire_all()
        assert _relation_targets(session, note.id) == set()


# ---------------------------------------------------------------------------
# Drive boundary preserved
# ---------------------------------------------------------------------------

class TestSyncDriveBoundary:
    def test_cross_drive_wiki_target_not_synced(self, client, tmp_path):
        import json as _json

        import app.config as config

        api, session, drive_dir, _ = client

        # Add a second drive with a matching basename.
        second_dir = tmp_path / "drives" / "other"
        second_dir.mkdir(parents=True, exist_ok=True)
        drives_json_path = config.DRIVES_CONFIG
        existing = _json.loads(drives_json_path.read_text())
        existing.append({"name": "other-drive", "path": str(second_dir)})
        drives_json_path.write_text(_json.dumps(existing))
        config._drives_cache = None

        (second_dir / "year-recap.md").write_text("x")
        other = File(
            filename="year-recap.md",
            title="year-recap.md",
            drive="other-drive",
            folder_path="",
            file_path="year-recap.md",
            file_size=1,
            file_type="document",
            mime_type="text/markdown",
        )
        session.add(other)
        session.commit()

        note = _seed_md(session, drive_dir, "note.md", "initial\n")
        r = _put(api, note.id, "[[year-recap]]\n", "initial\n")
        assert r.status_code == 200, r.text
        session.expire_all()
        # No relation: cross-drive resolution forbidden.
        assert _relation_targets(session, note.id) == set()
