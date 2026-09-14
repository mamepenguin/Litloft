"""Which relation rows a Markdown note's link sync may touch."""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import create_engine, inspect, text

from app.models import File, FileRelation
from tests.conftest import TEST_DRIVE
from tests.test_files_content_sync_v2 import _put, _seed_md, _seed_video


def _rows(session) -> set[tuple[str, str, str, str | None]]:
    session.expire_all()
    return {
        (r.file_id_a, r.file_id_b, r.kind, r.origin)
        for r in session.query(FileRelation).all()
    }


def _save(api, drive_dir, file: File, body: str):
    r = _put(api, file.id, body, (drive_dir / file.file_path).read_text())
    assert r.status_code == 200, r.text


def _unmarked(session, a: File, b: File, kind: str = "related") -> None:
    session.add(FileRelation(file_id_a=a.id, file_id_b=b.id, kind=kind))
    session.commit()


class TestSaveOwnsOnlyItsMarkdownRows:
    def test_saved_links_are_marked_markdown(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md")
        target = _seed_md(session, drive_dir, "target.md")

        _save(api, drive_dir, note, "See [[target]].\n")

        assert _rows(session) == {(note.id, target.id, "related", "markdown")}

    def test_saving_link_target_keeps_incoming_wiki_link(self, client):
        api, session, drive_dir, _ = client
        source = _seed_md(session, drive_dir, "source.md")
        target = _seed_md(session, drive_dir, "target.md")

        _save(api, drive_dir, source, "See [[target]].\n")
        _save(api, drive_dir, target, "No links.\n")

        assert _rows(session) == {(source.id, target.id, "related", "markdown")}

    def test_saving_cited_markdown_keeps_incoming_citation(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md")
        cited = _seed_md(session, drive_dir, "cited.md")

        _save(api, drive_dir, note, f'---\nsource_file_ids:\n  - "{cited.id}"\n---\n')
        _save(api, drive_dir, cited, "Edited.\n")

        assert _rows(session) == {(note.id, cited.id, "related", "markdown")}

    def test_mutual_links_keep_one_row_per_direction(self, client):
        api, session, drive_dir, _ = client
        x = _seed_md(session, drive_dir, "x.md")
        y = _seed_md(session, drive_dir, "y.md")

        _save(api, drive_dir, y, "See [[x]].\n")
        _save(api, drive_dir, x, "See [[y]].\n")
        assert _rows(session) == {
            (y.id, x.id, "related", "markdown"),
            (x.id, y.id, "related", "markdown"),
        }

        _save(api, drive_dir, y, "Dropped.\n")
        assert _rows(session) == {(x.id, y.id, "related", "markdown")}

    def test_removing_one_of_two_links_removes_only_that_row(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md")
        kept = _seed_md(session, drive_dir, "kept.md")
        dropped = _seed_md(session, drive_dir, "dropped.md")

        _save(api, drive_dir, note, "[[kept]] and [[dropped]]\n")
        _save(api, drive_dir, note, "[[kept]] only\n")

        assert _rows(session) == {(note.id, kept.id, "related", "markdown")}

    def test_another_note_dropping_its_link_keeps_this_notes_link(self, client):
        api, session, drive_dir, _ = client
        first = _seed_md(session, drive_dir, "first.md")
        second = _seed_md(session, drive_dir, "second.md")
        target = _seed_md(session, drive_dir, "target.md")

        _save(api, drive_dir, first, "[[target]]\n")
        _save(api, drive_dir, second, "[[target]]\n")
        _save(api, drive_dir, second, "Dropped.\n")

        assert _rows(session) == {(first.id, target.id, "related", "markdown")}

    def test_unmarked_incoming_row_survives_save(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md")
        source = _seed_video(session, drive_dir, "source.mp4")
        _unmarked(session, source, note)

        _save(api, drive_dir, note, "No citations.\n")

        assert _rows(session) == {(source.id, note.id, "related", None)}

    def test_unmarked_outgoing_row_not_linked_survives_save(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md")
        other = _seed_video(session, drive_dir, "other.mp4")
        _unmarked(session, note, other)

        _save(api, drive_dir, note, "No links.\n")

        assert _rows(session) == {(note.id, other.id, "related", None)}

    def test_unmarked_outgoing_row_that_is_linked_is_adopted(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md")
        target = _seed_video(session, drive_dir, "target.mp4")
        _unmarked(session, note, target)

        _save(api, drive_dir, note, f"[v](loft://{target.id})\n")
        assert _rows(session) == {(note.id, target.id, "related", "markdown")}

        _save(api, drive_dir, note, "Dropped.\n")
        assert _rows(session) == set()

    def test_other_kinds_are_left_alone(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md(session, drive_dir, "note.md")
        target = _seed_video(session, drive_dir, "target.mp4")
        _unmarked(session, note, target, kind="derived_from")

        _save(api, drive_dir, note, "No links.\n")
        assert _rows(session) == {(note.id, target.id, "derived_from", None)}

        _save(api, drive_dir, note, f"[v](loft://{target.id})\n")
        assert _rows(session) == {
            (note.id, target.id, "derived_from", None),
            (note.id, target.id, "related", "markdown"),
        }


class TestCreateSyncsMarkdown:
    def test_created_markdown_gets_its_link_rows(self, client):
        api, session, drive_dir, _ = client
        target = _seed_md(session, drive_dir, "target.md")
        cited = _seed_video(session, drive_dir, "cited.mp4")

        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={
                "path": "new.md",
                "content": f'---\nsource_file_ids:\n  - "{cited.id}"\n---\nSee [[target]].\n',
            },
        )
        assert r.status_code == 201, r.text
        new_id = r.json()["id"]

        assert _rows(session) == {
            (new_id, target.id, "related", "markdown"),
            (new_id, cited.id, "related", "markdown"),
        }

    def test_created_plain_text_gets_no_rows(self, client):
        api, session, drive_dir, _ = client
        _seed_md(session, drive_dir, "target.md")

        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "memo.txt", "content": "See [[target]].\n"},
        )
        assert r.status_code == 201, r.text

        assert _rows(session) == set()

    def test_recovered_missing_markdown_gets_its_link_rows(self, client):
        api, session, drive_dir, _ = client
        target = _seed_md(session, drive_dir, "target.md")
        missing = File(
            filename="back.md", title="back", drive=TEST_DRIVE, folder_path="",
            file_path="back.md", file_size=0, file_type="document",
            mime_type="text/markdown",
            missing_since=datetime.now(UTC).replace(tzinfo=None),
        )
        session.add(missing)
        session.commit()

        r = api.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "back.md", "content": "See [[target]].\n"},
        )
        assert r.status_code == 200, r.text

        assert _rows(session) == {(missing.id, target.id, "related", "markdown")}


class TestPublicListingShowsEachCounterpartOnce:
    def test_both_directions_list_the_other_file_once(self, client):
        api, session, drive_dir, _ = client
        a = _seed_video(session, drive_dir, "a.mp4")
        b = _seed_video(session, drive_dir, "b.mp4")
        _unmarked(session, a, b)
        _unmarked(session, b, a)

        for source, other in ((a, b), (b, a)):
            items = api.get(f"/api/files/{source.id}/relations").json()["relations"]
            assert [i["file"]["id"] for i in items] == [other.id]

    def test_same_counterpart_under_two_kinds_is_listed_per_kind(self, client):
        api, session, drive_dir, _ = client
        a = _seed_video(session, drive_dir, "a.mp4")
        b = _seed_video(session, drive_dir, "b.mp4")
        _unmarked(session, a, b, kind="related")
        _unmarked(session, b, a, kind="derived_from")

        items = api.get(f"/api/files/{a.id}/relations").json()["relations"]
        assert sorted(i["kind"] for i in items) == ["derived_from", "related"]


class TestOriginColumnMigration:
    def test_legacy_file_relations_gains_origin(self, tmp_path, private_data_dir):
        from app.database import Base, _migrate

        engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
        Base.metadata.create_all(bind=engine)
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE file_relations"))
            conn.execute(text(
                "CREATE TABLE file_relations ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                "file_id_a VARCHAR(12) NOT NULL,"
                "file_id_b VARCHAR(12) NOT NULL,"
                "kind VARCHAR(32) NOT NULL,"
                "created_at DATETIME,"
                "created_by VARCHAR(16))"
            ))
            conn.execute(text(
                "INSERT INTO file_relations (file_id_a, file_id_b, kind) "
                "VALUES ('aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'related')"
            ))

        _migrate(engine)

        assert "origin" in {c["name"] for c in inspect(engine).get_columns("file_relations")}
        with engine.connect() as conn:
            assert conn.execute(text("SELECT origin FROM file_relations")).all() == [(None,)]
