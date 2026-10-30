import hashlib

import pytest

from app.models import File, Tag
from app.services.frontmatter import parse
from app.services.tagops import resolve_tag
from tests.test_move_tags_follow_drive import (
    DST,
    SRC,
    _move,
    _rows_attached_to_nothing,
    _seed,
    _tags,
    _unlock,
    two_drives,  # noqa: F401  (fixture)
)

# UNSPEC: within a drive a tag name resolves to the row spelled exactly that
# way, otherwise to the oldest row whose name is the same in Python's Unicode
# lower-casing, whatever script the name is written in.
@pytest.mark.parametrize(
    ("rows", "requested", "expected"),
    [
        ([(1, "Übung")], "Übung", 1),
        ([(1, "Übung")], "übung", 1),
        ([(1, "übung")], "Übung", 1),
        ([(1, "Ａ")], "ａ", 1),
        ([(1, "ａ")], "Ａ", 1),
        ([(1, "Alpha")], "alpha", 1),
        ([(1, "Alpha"), (2, "ALPHA")], "alpha", 1),
        ([(2, "ALPHA"), (1, "Alpha")], "alpha", 1),
        ([(1, "Alpha"), (2, "alpha")], "alpha", 2),
        ([(1, "Übung"), (2, "übung")], "übung", 2),
        ([(1, "Übung"), (2, "übung")], "Übung", 1),
        ([(1, "Ａ"), (2, "ａ")], "ａ", 2),
        ([(1, "Alpha")], "beta", None),
        ([], "alpha", None),
    ],
)
def test_a_name_resolves_to_the_exact_row_else_the_oldest_variant(rows, requested, expected):
    tags = [Tag(id=i, name=n, drive=SRC) for i, n in rows]

    found = resolve_tag(tags, requested)

    assert (found.id if found else None) == expected


def _listed(c, drive, name):
    res = c.get(f"/api/drives/{drive}/files", params={"tag": name})
    assert res.status_code == 200
    return {f["id"] for f in res.json()["data"]}


# UNSPEC: choosing a tag lists the files of every row in the drive that is the
# same name in another case, and nothing from another drive.
class TestTagFilter:
    @pytest.mark.parametrize(
        ("held", "chosen"),
        [("Übung", "Übung"), ("Übung", "übung"), ("Ａ", "Ａ"), ("Ａ", "ａ")],
    )
    def test_a_non_ascii_name_lists_its_files(self, two_drives, held, chosen):
        c, db, open_dir, _ = two_drives
        f = _seed(db, open_dir, SRC, "a.mp4", [held])
        _seed(db, open_dir, SRC, "b.mp4", ["other"])

        assert _listed(c, SRC, chosen) == {f.id}

    @pytest.mark.parametrize(("first", "second"), [("Übung", "übung"), ("Ａ", "ａ")])
    def test_coexisting_variants_list_the_files_of_both(self, two_drives, first, second):
        c, db, open_dir, _ = two_drives
        f1 = _seed(db, open_dir, SRC, "a.mp4", [first])
        f2 = _seed(db, open_dir, SRC, "b.mp4", [second])

        assert _listed(c, SRC, first) == {f1.id, f2.id}
        assert _listed(c, SRC, second) == {f1.id, f2.id}

    def test_another_drives_tag_is_not_listed(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        _unlock(c)
        f = _seed(db, open_dir, SRC, "a.mp4", ["Übung"])
        _seed(db, locked_dir, DST, "b.mp4", ["übung"])

        assert _listed(c, SRC, "Übung") == {f.id}


# UNSPEC: editing the tags of a file that holds a non-ASCII-capital tag
# succeeds and leaves one row per name in the drive.
class TestTagEdits:
    @pytest.mark.parametrize("held", ["Übung", "Ａ"])
    def test_adding_a_tag_to_a_file_holding_one(self, two_drives, held):
        c, db, open_dir, _ = two_drives
        f = _seed(db, open_dir, SRC, "a.mp4", [held])

        res = c.put(f"/api/files/{f.id}/tags", json={"tags": [held, "extra"]})

        assert res.status_code == 200
        assert _tags(c, SRC) == {held: 1, "extra": 1}

    def test_a_case_variant_renames_the_row_to_the_spelling_given(self, two_drives):
        c, db, open_dir, _ = two_drives
        f = _seed(db, open_dir, SRC, "a.mp4", ["Übung"])

        res = c.put(f"/api/files/{f.id}/tags", json={"tags": ["übung"]})

        assert res.status_code == 200
        assert _tags(c, SRC) == {"übung": 1}

    @pytest.mark.parametrize("held", ["Übung", "Ａ"])
    def test_batch_tagging_with_a_name_the_drive_holds(self, two_drives, held):
        c, db, open_dir, _ = two_drives
        f1 = _seed(db, open_dir, SRC, "a.mp4", [held])
        f2 = _seed(db, open_dir, SRC, "b.mp4", [])

        res = c.put("/api/files/batch/tags", json={"ids": [f1.id, f2.id], "tags": [held]})

        assert res.status_code == 200
        assert res.json() == {"updated": 2, "errors": []}
        assert _tags(c, SRC) == {held: 2}

    def test_batch_tagging_with_a_case_variant_keeps_the_existing_spelling(self, two_drives):
        c, db, open_dir, _ = two_drives
        _seed(db, open_dir, SRC, "a.mp4", ["Übung"])
        f2 = _seed(db, open_dir, SRC, "b.mp4", [])

        res = c.put("/api/files/batch/tags", json={"ids": [f2.id], "tags": ["übung"]})

        assert res.json() == {"updated": 1, "errors": []}
        assert _tags(c, SRC) == {"Übung": 2}

    def test_a_note_edited_through_content_keeps_file_and_projection_in_step(self, two_drives):
        c, db, open_dir, _ = two_drives
        text = "---\ntags:\n- Übung\n---\n\nbody\n"
        (open_dir / "n.md").write_text(text, encoding="utf-8")
        f = File(
            filename="n.md",
            title="n.md",
            drive=SRC,
            folder_path="",
            file_path="n.md",
            file_size=len(text.encode()),
            file_type="document",
            mime_type="text/markdown",
        )
        f.tags.append(Tag(name="Übung", drive=SRC))
        db.add(f)
        db.commit()
        edited = "---\ntags:\n- Übung\n- extra\n---\n\nbody\n"

        res = c.put(
            f"/api/files/{f.id}/content",
            content=edited.encode("utf-8"),
            headers={
                "If-Match": f'"{hashlib.sha256(text.encode()).hexdigest()}"',
                "Content-Type": "text/plain",
            },
        )

        assert res.status_code == 200
        on_disk = parse((open_dir / "n.md").read_text(encoding="utf-8"))
        assert on_disk.metadata["tags"] == ["Übung", "extra"]
        assert _tags(c, SRC) == {"Übung": 1, "extra": 1}


# UNSPEC: moving a file whose tag links are stale into the drive those rows
# belong to leaves no row without files in that drive.
class TestMoveBackToTheDriveOfItsStaleRows:
    def test_no_row_is_left_with_count_zero(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        _unlock(c)
        f = _seed(db, locked_dir, DST, "a.mp4", [])
        f.tags.append(Tag(name="Alpha", drive=SRC))
        db.add(Tag(name="leftover", drive=SRC))
        db.commit()

        _move(c, f.id, SRC)

        assert _tags(c, SRC) == {"Alpha": 1}
        assert _tags(c, DST) == {}
        assert _rows_attached_to_nothing(db) == 0


# UNSPEC: a move reuses the destination row spelled exactly like the tag even
# when an older row there differs only in case.
class TestMoveToADestinationWithAnExactRow:
    @pytest.mark.parametrize(
        ("name", "older", "newer"),
        [("alpha", "Alpha", "alpha"), ("übung", "Übung", "übung"), ("ａ", "Ａ", "ａ")],
    )
    def test_the_newer_exact_row_wins(self, two_drives, name, older, newer):
        c, db, open_dir, locked_dir = two_drives
        _unlock(c)
        _seed(db, locked_dir, DST, "one.mp4", [older])
        _seed(db, locked_dir, DST, "two.mp4", [newer])
        f = _seed(db, open_dir, SRC, "a.mp4", [name])

        _move(c, f.id, DST)

        assert _tags(c, DST) == {older: 1, newer: 2}
