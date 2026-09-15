"""Seeded (source, note) rows become the note's own link rows at startup."""
from __future__ import annotations

import threading
import time
from datetime import UTC, datetime

from app.main import _run_relation_seed_flip as REAL_RUN_SEED_FLIP
from app.models import File, FileRelation
from app.services.relation_seed_flip import flip_cited_seed_relations
from tests.test_files_content_sync_v2 import _put, _seed_md, _seed_video


def _rows(session) -> set[tuple[str, str, str, str | None]]:
    session.expire_all()
    return {
        (r.file_id_a, r.file_id_b, r.kind, r.origin)
        for r in session.query(FileRelation).all()
    }


def _seed(session, a: File, b: File, kind: str = "related", origin: str | None = None) -> None:
    session.add(FileRelation(file_id_a=a.id, file_id_b=b.id, kind=kind, origin=origin))
    session.commit()


def _citing(source: File) -> str:
    return f'---\nsource_file_ids:\n  - "{source.id}"\n---\n'


class TestFlip:
    def test_seed_cited_by_frontmatter_is_flipped(self, client):
        _, session, drive_dir, _ = client
        source = _seed_video(session, drive_dir, "source.mp4")
        note = _seed_md(session, drive_dir, "note.md", _citing(source))
        _seed(session, source, note)

        flip_cited_seed_relations(session)

        assert _rows(session) == {(note.id, source.id, "related", "markdown")}

    def test_seed_cited_by_loft_link_is_flipped(self, client):
        _, session, drive_dir, _ = client
        source = _seed_video(session, drive_dir, "source.mp4")
        note = _seed_md(session, drive_dir, "note.md", f"[v](loft://{source.id})\n")
        _seed(session, source, note)

        flip_cited_seed_relations(session)

        assert _rows(session) == {(note.id, source.id, "related", "markdown")}

    def test_seed_from_a_markdown_source_is_flipped(self, client):
        _, session, drive_dir, _ = client
        source = _seed_md(session, drive_dir, "source.md", "No links.\n")
        note = _seed_md(session, drive_dir, "note.md", _citing(source))
        _seed(session, source, note)

        flip_cited_seed_relations(session)

        assert _rows(session) == {(note.id, source.id, "related", "markdown")}

    def test_seed_the_note_does_not_cite_is_kept(self, client):
        _, session, drive_dir, _ = client
        source = _seed_video(session, drive_dir, "source.mp4")
        note = _seed_md(session, drive_dir, "note.md", "No citations.\n")
        _seed(session, source, note)

        flip_cited_seed_relations(session)

        assert _rows(session) == {(source.id, note.id, "related", None)}

    def test_wiki_link_does_not_flip(self, client):
        _, session, drive_dir, _ = client
        source = _seed_md(session, drive_dir, "source.md")
        note = _seed_md(session, drive_dir, "note.md", "See [[source]].\n")
        _seed(session, source, note)

        flip_cited_seed_relations(session)

        assert _rows(session) == {(source.id, note.id, "related", None)}

    def test_unreadable_note_keeps_its_seed(self, client):
        _, session, drive_dir, _ = client
        source = _seed_video(session, drive_dir, "source.mp4")
        note = _seed_md(session, drive_dir, "note.md", _citing(source))
        _seed(session, source, note)
        (drive_dir / "note.md").unlink()

        flip_cited_seed_relations(session)

        assert _rows(session) == {(source.id, note.id, "related", None)}

    def test_trashed_note_keeps_its_seed(self, client):
        _, session, drive_dir, _ = client
        source = _seed_video(session, drive_dir, "source.mp4")
        note = _seed_md(session, drive_dir, "note.md", _citing(source))
        _seed(session, source, note)
        note.deleted_at = datetime.now(UTC).replace(tzinfo=None)
        session.commit()

        flip_cited_seed_relations(session)

        assert _rows(session) == {(source.id, note.id, "related", None)}

    def test_existing_unmarked_note_row_is_marked_and_seed_removed(self, client):
        _, session, drive_dir, _ = client
        source = _seed_video(session, drive_dir, "source.mp4")
        note = _seed_md(session, drive_dir, "note.md", _citing(source))
        _seed(session, note, source)
        _seed(session, source, note)

        flip_cited_seed_relations(session)

        assert _rows(session) == {(note.id, source.id, "related", "markdown")}

    def test_existing_marked_note_row_keeps_and_seed_removed(self, client):
        _, session, drive_dir, _ = client
        source = _seed_video(session, drive_dir, "source.mp4")
        note = _seed_md(session, drive_dir, "note.md", _citing(source))
        _seed(session, note, source, origin="markdown")
        _seed(session, source, note)

        flip_cited_seed_relations(session)

        assert _rows(session) == {(note.id, source.id, "related", "markdown")}

    def test_other_kinds_are_left_alone(self, client):
        _, session, drive_dir, _ = client
        source = _seed_video(session, drive_dir, "source.mp4")
        note = _seed_md(session, drive_dir, "note.md", _citing(source))
        _seed(session, source, note, kind="derived_from")

        flip_cited_seed_relations(session)

        assert _rows(session) == {(source.id, note.id, "derived_from", None)}

    def test_second_run_changes_nothing(self, client):
        _, session, drive_dir, _ = client
        source = _seed_video(session, drive_dir, "source.mp4")
        other = _seed_video(session, drive_dir, "other.mp4")
        note = _seed_md(session, drive_dir, "note.md", _citing(source))
        _seed(session, source, note)
        _seed(session, other, note)

        flip_cited_seed_relations(session)
        first = _rows(session)
        flip_cited_seed_relations(session)

        assert _rows(session) == first == {
            (note.id, source.id, "related", "markdown"),
            (other.id, note.id, "related", None),
        }

    def test_one_failing_note_does_not_stop_the_others(self, client, monkeypatch):
        import app.services.relation_seed_flip as flip

        _, session, drive_dir, _ = client
        source = _seed_video(session, drive_dir, "source.mp4")
        bad = _seed_md(session, drive_dir, "bad.md", _citing(source))
        good = _seed_md(session, drive_dir, "good.md", _citing(source))
        _seed(session, source, bad)
        _seed(session, source, good)
        real = flip._flip_for_note

        def flaky(db, note, seeds):
            if note.id == bad.id:
                raise RuntimeError("forced")
            return real(db, note, seeds)

        monkeypatch.setattr(flip, "_flip_for_note", flaky)

        flip_cited_seed_relations(session)

        assert _rows(session) == {
            (source.id, bad.id, "related", None),
            (good.id, source.id, "related", "markdown"),
        }

    def test_flipped_citation_of_a_trashed_source_goes_when_uncited(self, client):
        api, session, drive_dir, _ = client
        source = _seed_video(session, drive_dir, "source.mp4")
        note = _seed_md(session, drive_dir, "note.md", _citing(source))
        _seed(session, source, note)
        source.deleted_at = datetime.now(UTC).replace(tzinfo=None)
        session.commit()

        flip_cited_seed_relations(session)
        r = _put(api, note.id, "Uncited.\n", (drive_dir / "note.md").read_text())
        assert r.status_code == 200, r.text

        assert _rows(session) == set()


class TestStartup:
    def test_flip_finishes_before_the_backend_serves(self, client, monkeypatch):
        from fastapi.testclient import TestClient

        import app.main as main
        from app.main import app

        finished = threading.Event()

        def slow_flip():
            time.sleep(0.3)
            finished.set()

        monkeypatch.setattr(main, "_run_relation_seed_flip", slow_flip)

        with TestClient(app) as second:
            assert finished.is_set()
            assert second.get("/api/health").status_code == 200

    def test_a_failing_flip_does_not_stop_the_startup(self, client, monkeypatch):
        from fastapi.testclient import TestClient

        import app.main as main
        from app.main import app

        def boom(db):
            raise RuntimeError("forced")

        monkeypatch.setattr(main, "flip_cited_seed_relations", boom)
        monkeypatch.setattr(main, "_run_relation_seed_flip", REAL_RUN_SEED_FLIP)

        with TestClient(app) as second:
            assert second.get("/api/health").status_code == 200
