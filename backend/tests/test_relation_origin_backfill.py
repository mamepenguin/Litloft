"""One-time resync that marks existing Markdown link rows with their origin."""
from __future__ import annotations

from app.models import File, FileRelation
from app.services.relation_origin_backfill import (
    SENTINEL_NAME,
    backfill_markdown_relation_origin,
)
from tests.test_files_content_sync_v2 import _seed_md, _seed_video


def _rows(session) -> set[tuple[str, str, str, str | None]]:
    session.expire_all()
    return {
        (r.file_id_a, r.file_id_b, r.kind, r.origin)
        for r in session.query(FileRelation).all()
    }


def _legacy(session, a: File, b: File, kind: str = "related") -> None:
    session.add(FileRelation(file_id_a=a.id, file_id_b=b.id, kind=kind))
    session.commit()


def _run(session, data_dir) -> bool:
    (data_dir / SENTINEL_NAME).unlink(missing_ok=True)
    return backfill_markdown_relation_origin(session)


class TestBackfill:
    def test_linked_legacy_row_is_marked(self, client):
        _, session, drive_dir, data_dir = client
        target = _seed_md(session, drive_dir, "target.md")
        note = _seed_md(session, drive_dir, "note.md", "See [[target]].\n")
        _legacy(session, note, target)

        assert _run(session, data_dir) is True

        assert _rows(session) == {(note.id, target.id, "related", "markdown")}
        assert (data_dir / SENTINEL_NAME).exists()

    def test_legacy_outgoing_row_no_longer_linked_is_removed(self, client):
        _, session, drive_dir, data_dir = client
        stale = _seed_video(session, drive_dir, "stale.mp4")
        note = _seed_md(session, drive_dir, "note.md", "No links.\n")
        _legacy(session, note, stale)

        _run(session, data_dir)

        assert _rows(session) == set()

    def test_link_without_a_row_gains_one(self, client):
        _, session, drive_dir, data_dir = client
        x = _seed_md(session, drive_dir, "x.md", "See [[y]].\n")
        y = _seed_md(session, drive_dir, "y.md", "See [[x]].\n")
        _legacy(session, y, x)

        _run(session, data_dir)

        assert _rows(session) == {
            (x.id, y.id, "related", "markdown"),
            (y.id, x.id, "related", "markdown"),
        }

    def test_seed_duplicated_by_the_notes_citation_is_removed(self, client):
        _, session, drive_dir, data_dir = client
        source = _seed_video(session, drive_dir, "source.mp4")
        note = _seed_md(
            session, drive_dir, "note.md",
            f'---\nsource_file_ids:\n  - "{source.id}"\n---\n',
        )
        _legacy(session, source, note)

        _run(session, data_dir)

        assert _rows(session) == {(note.id, source.id, "related", "markdown")}

    def test_seed_the_note_no_longer_cites_is_kept(self, client):
        _, session, drive_dir, data_dir = client
        source = _seed_video(session, drive_dir, "source.mp4")
        note = _seed_md(session, drive_dir, "note.md", "No citations.\n")
        _legacy(session, source, note)

        _run(session, data_dir)

        assert _rows(session) == {(source.id, note.id, "related", None)}

    def test_other_kinds_are_left_alone(self, client):
        _, session, drive_dir, data_dir = client
        other = _seed_video(session, drive_dir, "other.mp4")
        note = _seed_md(session, drive_dir, "note.md", "No links.\n")
        _legacy(session, note, other, kind="derived_from")

        _run(session, data_dir)

        assert _rows(session) == {(note.id, other.id, "derived_from", None)}

    def test_unreadable_note_keeps_its_rows_and_blocks_the_sentinel(self, client):
        _, session, drive_dir, data_dir = client
        other = _seed_video(session, drive_dir, "other.mp4")
        gone = _seed_md(session, drive_dir, "gone.md", "No links.\n")
        _legacy(session, gone, other)
        (drive_dir / "gone.md").unlink()

        assert _run(session, data_dir) is False

        assert _rows(session) == {(gone.id, other.id, "related", None)}
        assert not (data_dir / SENTINEL_NAME).exists()

    def test_duplicate_touching_an_unreadable_note_is_kept(self, client):
        _, session, drive_dir, data_dir = client
        gone = _seed_md(session, drive_dir, "gone.md", "x\n")
        note = _seed_md(
            session, drive_dir, "note.md",
            f'---\nsource_file_ids:\n  - "{gone.id}"\n---\n',
        )
        _legacy(session, gone, note)
        (drive_dir / "gone.md").unlink()

        _run(session, data_dir)

        assert _rows(session) == {
            (gone.id, note.id, "related", None),
            (note.id, gone.id, "related", "markdown"),
        }

    def test_second_run_changes_nothing(self, client):
        _, session, drive_dir, data_dir = client
        source = _seed_video(session, drive_dir, "source.mp4")
        target = _seed_md(session, drive_dir, "target.md")
        note = _seed_md(
            session, drive_dir, "note.md",
            f'---\nsource_file_ids:\n  - "{source.id}"\n---\nSee [[target]].\n',
        )
        _legacy(session, source, note)
        _legacy(session, target, note)

        _run(session, data_dir)
        first = _rows(session)
        _run(session, data_dir)

        assert _rows(session) == first

    def test_sentinel_skips_the_run(self, client):
        _, session, drive_dir, data_dir = client
        stale = _seed_video(session, drive_dir, "stale.mp4")
        note = _seed_md(session, drive_dir, "note.md", "No links.\n")
        _legacy(session, note, stale)
        (data_dir / SENTINEL_NAME).touch()

        assert backfill_markdown_relation_origin(session) is True

        assert _rows(session) == {(note.id, stale.id, "related", None)}

    def test_trashed_note_is_not_resynced(self, client):
        _, session, drive_dir, data_dir = client
        from datetime import UTC, datetime

        stale = _seed_video(session, drive_dir, "stale.mp4")
        note = _seed_md(session, drive_dir, "note.md", "No links.\n")
        _legacy(session, note, stale)
        note.deleted_at = datetime.now(UTC).replace(tzinfo=None)
        session.commit()

        _run(session, data_dir)

        assert _rows(session) == {(note.id, stale.id, "related", None)}
