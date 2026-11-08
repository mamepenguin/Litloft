"""Acceptance tests for the shelves changes of the Reading app.

SPEC-CORE-060 (docs/specs/reading-app.md): the `epub` kind, `by=all`, the `watch`
filter, and the folder `base` descent. Invariant ids are those of that spec.
"""

from __future__ import annotations

import unicodedata
from datetime import UTC, datetime

import pytest

from app.models import File, Tag, WatchHistory
from app.routers.progress import nickname_to_viewer_id
from tests.conftest import TEST_DRIVE

OTHER_DRIVE = "elsewhere"
ALICE = {"X-Lit-Viewer": "alice"}
BOB = {"X-Lit-Viewer": "bob"}

EPUB_MIME = "application/epub+zip"
PDF_MIME = "application/pdf"
ZIP_MIME = "application/zip"


def _t(day: int) -> datetime:
    return datetime(2026, 3, day, 12, tzinfo=UTC)


def _book(name, folder, created, *, mime=PDF_MIME, drive=TEST_DRIVE, **extra):
    path = f"{folder}/{name}" if folder else name
    return File(
        filename=name,
        title=name,
        drive=drive,
        folder_path=folder,
        file_path=path,
        file_size=extra.pop("size", 1),
        file_type="document",
        mime_type=mime,
        created_at=created,
        **extra,
    )


def _add(db, *files):
    db.add_all(files)
    db.commit()
    return files


def _get(c, query, headers=None, drive=TEST_DRIVE):
    return c.get(f"/api/drives/{drive}/shelves?{query}", headers=headers or {})


def _ok(res):
    assert res.status_code == 200, res.text
    return res.json()


def _titles(shelf):
    return [i["title"] for i in shelf["items"]]


def _listing_titles(c, query):
    res = c.get(f"/api/drives/{TEST_DRIVE}/files?limit=100&{query}")
    assert res.status_code == 200, res.text
    return {i["filename"] for i in res.json()["data"]}


class TestEpubKind:
    """SPEC-CORE-060 I4, I5."""

    def _seed(self, db):
        _add(
            db,
            _book("a.epub", "", _t(1), mime=EPUB_MIME),
            _book("recorded-as-octet.epub", "", _t(2), mime="application/octet-stream"),
            _book("mime-only", "", _t(3), mime=EPUB_MIME),
            _book("b.pdf", "", _t(4), mime=PDF_MIME),
            _book("c.zip", "", _t(5), mime=ZIP_MIME),
            _book("notes.txt", "", _t(6), mime="text/plain"),
            _book("gone.epub", "", _t(7), mime=EPUB_MIME, missing_since=_t(8)),
        )

    def test_shelves_type_epub_is_mime_or_suffix(self, client):
        c, db, *_ = client
        self._seed(db)

        body = _ok(_get(c, "by=all&type=epub&sort=title&order=asc&per_shelf=60"))

        assert _titles(body["shelves"][0]) == ["a.epub", "mime-only", "recorded-as-octet.epub"]
        assert body["shelves"][0]["count"] == 3

    def test_listing_agrees_with_shelves_on_epub(self, client):
        c, db, *_ = client
        self._seed(db)

        shelf = _ok(_get(c, "by=all&type=epub&per_shelf=60"))["shelves"][0]

        assert _listing_titles(c, "type=epub") == set(_titles(shelf))

    def test_folder_tree_type_filter_accepts_epub(self, client):
        c, db, *_ = client
        self._seed(db)

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?flat=true&include_files=true&type_filter=epub")

        assert res.status_code == 200, res.text
        assert {n["name"] for n in res.json() if n["kind"] == "file"} == {
            "a.epub",
            "mime-only",
            "recorded-as-octet.epub",
        }

    def test_document_still_returns_epub(self, client):
        c, db, *_ = client
        self._seed(db)

        shelf = _ok(_get(c, "by=all&type=document&per_shelf=60"))["shelves"][0]

        assert {"a.epub", "mime-only"} <= set(_titles(shelf))

    @pytest.mark.parametrize("kind,expected", [("pdf", {"b.pdf"}), ("archive", {"c.zip"})])
    def test_other_kinds_do_not_gain_epub(self, client, kind, expected):
        c, db, *_ = client
        self._seed(db)

        shelf = _ok(_get(c, f"by=all&type={kind}&per_shelf=60"))["shelves"][0]

        assert set(_titles(shelf)) == expected


class TestByAll:
    """SPEC-CORE-060 I6, I10b, I3."""

    def _seed(self, db, n=5):
        _add(db, *[_book(f"b{i}.pdf", "x", _t(i + 1), size=i + 1) for i in range(n)])

    def test_one_shelf_with_the_matching_total(self, client):
        c, db, *_ = client
        self._seed(db)

        body = _ok(_get(c, "by=all&per_shelf=2&sort=title&order=asc"))

        assert body["by"] == "all"
        assert body["total_shelves"] == 1
        (shelf,) = body["shelves"]
        assert shelf["key"] == "all"
        assert shelf["label"] == ""
        assert shelf["count"] == 5
        assert _titles(shelf) == ["b0.pdf", "b1.pdf"]

    def test_key_all_pages_through_every_file_once(self, client):
        c, db, *_ = client
        self._seed(db)

        seen = []
        for page in (1, 2, 3):
            shelf = _ok(_get(c, f"by=all&key=all&per_shelf=2&page={page}&sort=title&order=asc"))["shelves"][0]
            seen += _titles(shelf)

        assert seen == [f"b{i}.pdf" for i in range(5)]

    def test_sort_and_order_apply(self, client):
        c, db, *_ = client
        self._seed(db)

        newest = _titles(_ok(_get(c, "by=all&sort=created_at&order=desc&per_shelf=3"))["shelves"][0])
        biggest = _titles(_ok(_get(c, "by=all&sort=file_size&order=desc&per_shelf=2"))["shelves"][0])

        assert newest == ["b4.pdf", "b3.pdf", "b2.pdf"]
        assert biggest == ["b4.pdf", "b3.pdf"]

    def test_unknown_key_is_200_with_an_empty_shelf(self, client):
        c, db, *_ = client
        self._seed(db)

        shelf = _ok(_get(c, "by=all&key=other"))["shelves"][0]

        assert shelf["count"] == 0
        assert shelf["items"] == []

    def test_empty_drive_still_has_one_shelf_with_count_zero(self, client):
        c, *_ = client

        body = _ok(_get(c, "by=all"))

        assert body["total_shelves"] == 1
        assert body["shelves"][0]["count"] == 0

    def test_count_follows_the_filters(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("a.epub", "", _t(1), mime=EPUB_MIME),
            _book("b.pdf", "", _t(2)),
            _book("t.md", "", _t(3), mime="text/markdown"),
        )

        shelf = _ok(_get(c, "by=all&type=epub"))["shelves"][0]

        assert shelf["count"] == 1

    def test_never_returns_inactive_or_foreign_files(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("ok.pdf", "", _t(1)),
            _book("gone.pdf", "", _t(2), missing_since=_t(3)),
            _book("bin.pdf", "", _t(2), deleted_at=_t(3)),
            _book("foreign.pdf", "", _t(2), drive=OTHER_DRIVE),
        )

        shelf = _ok(_get(c, "by=all&per_shelf=60"))["shelves"][0]

        assert _titles(shelf) == ["ok.pdf"]
        assert shelf["count"] == 1

    def test_does_not_write_rows(self, client):
        c, db, *_ = client
        self._seed(db)

        _ok(_get(c, "by=all"))

        assert db.query(File).count() == 5


def _watch_seed(db):
    alice = nickname_to_viewer_id("alice")
    bob = nickname_to_viewer_id("bob")
    rows = {
        name: _book(name, "", _t(i + 1))
        for i, name in enumerate(
            ["none.pdf", "zero-dur.pdf", "zero-pos.pdf", "mid.pdf", "edge89.pdf", "edge90.pdf", "done.pdf"]
        )
    }
    _add(db, *rows.values())
    history = [
        (alice, "zero-dur.pdf", 10, 0),
        (alice, "zero-pos.pdf", 0, 100),
        (alice, "mid.pdf", 50, 100),
        (alice, "edge89.pdf", 89.9, 100),
        (alice, "edge90.pdf", 90, 100),
        (alice, "done.pdf", 100, 100),
        (bob, "none.pdf", 100, 100),
        (bob, "mid.pdf", 100, 100),
    ]
    for viewer, name, pos, dur in history:
        db.add(
            WatchHistory(
                viewer_id=viewer,
                file_id=rows[name].id,
                playback_position=pos,
                duration=dur,
                last_played_at=_t(20),
            )
        )
    db.commit()
    return rows


class TestWatchFilter:
    """SPEC-CORE-060 I7, I8, I10b, I2."""

    @pytest.mark.parametrize(
        "state,expected",
        [
            ("in_progress", {"mid.pdf", "edge89.pdf"}),
            ("finished", {"edge90.pdf", "done.pdf"}),
            ("unwatched", {"none.pdf", "zero-dur.pdf", "zero-pos.pdf"}),
        ],
    )
    def test_filter_uses_the_viewers_boundary_on_every_by(self, client, state, expected):
        c, db, *_ = client
        _watch_seed(db)

        for by in ("all", "folder", "tag", "month"):
            shelves = _ok(_get(c, f"by={by}&watch={state}&per_shelf=60", ALICE))["shelves"]
            assert {t for s in shelves for t in _titles(s)} == expected, by
            assert sum(s["count"] for s in shelves) == len(expected), by

    def test_another_viewers_history_changes_nothing(self, client):
        c, db, *_ = client
        _watch_seed(db)

        bob = _ok(_get(c, "by=all&watch=finished&per_shelf=60", BOB))["shelves"][0]

        assert set(_titles(bob)) == {"none.pdf", "mid.pdf"}

    @pytest.mark.parametrize("by", ["all", "folder", "tag"])
    def test_without_a_viewer_it_is_400_and_no_files(self, client, by):
        c, db, *_ = client
        _watch_seed(db)

        res = _get(c, f"by={by}&watch=finished")

        assert res.status_code == 400
        assert "viewer_required" in str(res.json()["detail"])
        assert "done.pdf" not in res.text

    def test_a_value_outside_the_vocabulary_is_422(self, client):
        c, db, *_ = client
        _watch_seed(db)

        assert _get(c, "by=folder&watch=half", ALICE).status_code == 422

    def test_by_watch_with_an_excluding_watch_is_200_with_that_shelf_empty(self, client):
        c, db, *_ = client
        _watch_seed(db)

        shelf = _ok(_get(c, "by=watch&key=finished&watch=in_progress", ALICE))["shelves"][0]

        assert shelf["count"] == 0
        assert shelf["items"] == []

    def test_unkeyed_by_watch_lists_only_shelves_that_still_hold_a_file(self, client):
        c, db, *_ = client
        _watch_seed(db)

        body = _ok(_get(c, "by=watch&watch=finished", ALICE))

        assert [s["key"] for s in body["shelves"]] == ["finished"]
        assert body["total_shelves"] == 1

    def test_watch_combines_with_type_and_tag(self, client):
        c, db, *_ = client
        rows = _watch_seed(db)
        tag = Tag(name="Keep", drive=TEST_DRIVE)
        db.add(tag)
        rows["mid.pdf"].tags.append(tag)
        rows["edge89.pdf"].mime_type = EPUB_MIME
        db.commit()

        shelf = _ok(_get(c, "by=all&watch=in_progress&type=epub", ALICE))["shelves"][0]
        tagged = _ok(_get(c, "by=all&watch=in_progress&tag=Keep", ALICE))["shelves"][0]

        assert _titles(shelf) == ["edge89.pdf"]
        assert _titles(tagged) == ["mid.pdf"]


class TestFolderBase:
    """SPEC-CORE-060 I9, I10, I10a."""

    def _folders(self, res):
        body = _ok(res)
        return body["base"], [(s["key"], s["label"], s["count"]) for s in body["shelves"]]

    def test_descends_past_one_common_parent(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("n1.pdf", "Books/Novels", _t(1)),
            _book("n2.pdf", "Books/Novels", _t(2)),
            _book("m1.pdf", "Books/Manga", _t(3)),
            _book("m2.pdf", "Books/Manga/Vol1", _t(4)),
        )

        base, shelves = self._folders(_get(c, "by=folder&per_shelf=1"))

        assert base == "Books"
        assert shelves == [
            ("Books/Novels", "Novels", 2),
            ("Books/Manga", "Manga", 2),
        ]

    def test_files_directly_in_base_form_a_trailing_slash_shelf(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("n1.pdf", "Books/Novels", _t(1)),
            _book("m1.pdf", "Books/Manga", _t(2)),
            _book("loose.pdf", "Books", _t(3)),
        )

        base, shelves = self._folders(_get(c, "by=folder&per_shelf=1"))

        assert base == "Books"
        assert sorted(shelves) == sorted(
            [("Books/Novels", "Novels", 1), ("Books/Manga", "Manga", 1), ("Books/", "Books", 1)]
        )

    def test_descent_stops_when_a_file_sits_at_the_level(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("top.pdf", "", _t(1)),
            _book("n1.pdf", "Books/Novels", _t(2)),
        )

        base, shelves = self._folders(_get(c, "by=folder&per_shelf=1"))

        assert base == ""
        assert sorted(shelves) == sorted([("", "", 1), ("Books", "Books", 1)])

    def test_descent_stops_at_two_children(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("a.pdf", "A/B/C", _t(1)),
            _book("b.pdf", "A/B/D", _t(2)),
        )

        base, shelves = self._folders(_get(c, "by=folder&per_shelf=1"))

        assert base == "A/B"
        assert sorted(shelves) == sorted([("A/B/C", "C", 1), ("A/B/D", "D", 1)])

    def test_a_single_leaf_folder_gives_one_trailing_slash_shelf(self, client):
        c, db, *_ = client
        _add(db, _book("a.pdf", "a/b", _t(1)), _book("b.pdf", "a/b", _t(2)))

        base, shelves = self._folders(_get(c, "by=folder&per_shelf=1"))

        assert base == "a/b"
        assert shelves == [("a/b/", "b", 2)]

    def test_no_matching_file_gives_empty_base_and_no_shelves(self, client):
        c, *_ = client

        base, shelves = self._folders(_get(c, "by=folder"))

        assert base == ""
        assert shelves == []

    def test_base_is_computed_over_the_filtered_files(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("a.epub", "Books/Novels", _t(1), mime=EPUB_MIME),
            _book("b.pdf", "Elsewhere", _t(2)),
        )

        base, shelves = self._folders(_get(c, "by=folder&type=epub"))

        assert base == "Books/Novels"
        assert shelves == [("Books/Novels/", "Novels", 1)]

    def test_inactive_and_foreign_files_do_not_move_base(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("a.pdf", "Books/Novels", _t(1)),
            _book("gone.pdf", "Other", _t(2), missing_since=_t(3)),
            _book("bin.pdf", "Other", _t(2), deleted_at=_t(3)),
            _book("foreign.pdf", "Other", _t(2), drive=OTHER_DRIVE),
        )

        base, _shelves = self._folders(_get(c, "by=folder"))

        assert base == "Books/Novels"

    def test_chips_order_is_count_desc_then_name(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("1.pdf", "R/b", _t(1)),
            _book("2.pdf", "R/a", _t(2)),
            _book("3.pdf", "R/c", _t(3)),
            _book("4.pdf", "R/c", _t(4)),
        )

        _, shelves = self._folders(_get(c, "by=folder"))

        assert [k for k, _l, _c in shelves] == ["R/c", "R/a", "R/b"]

    def test_trailing_slash_key_matches_that_folder_only(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("loose.pdf", "Books", _t(1)),
            _book("n1.pdf", "Books/Novels", _t(2)),
        )

        shelf = _ok(_get(c, "by=folder&key=Books/&per_shelf=60"))["shelves"][0]

        assert _titles(shelf) == ["loose.pdf"]
        assert shelf["count"] == 1

    def test_base_and_keys_are_nfc(self, client):
        c, db, *_ = client
        nfc = unicodedata.normalize("NFC", "Bücher")
        nfd = unicodedata.normalize("NFD", "Bücher")
        _add(db, _book("a.pdf", f"{nfd}/x", _t(1)), _book("b.pdf", f"{nfd}/y", _t(2)))

        body = _ok(_get(c, "by=folder"))

        assert body["base"] == nfc
        assert {s["key"] for s in body["shelves"]} == {f"{nfc}/x", f"{nfc}/y"}

    def test_base_is_empty_string_for_other_groupings(self, client):
        c, db, *_ = client
        _add(db, _book("a.pdf", "Books/Novels", _t(1)))

        assert _ok(_get(c, "by=tag"))["base"] == ""
        assert _ok(_get(c, "by=all"))["base"] == ""

    def test_base_is_empty_when_a_key_is_given(self, client):
        c, db, *_ = client
        _add(db, _book("a.pdf", "Books/Novels", _t(1)))

        assert _ok(_get(c, "by=folder&key=Books"))["base"] == ""

    def test_by_all_honours_a_folder_condition(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("n1.pdf", "Books/Novels", _t(1)),
            _book("m1.pdf", "Books/Manga", _t(2)),
        )

        body = _ok(_get(c, "by=all&folder=Books/Manga"))

        assert body["shelves"][0]["count"] == 1


class TestSharedBoundaries:
    """SPEC-CORE-060 I1, I11."""

    def test_by_all_and_folder_never_touch_another_drive(self, client):
        c, db, *_ = client
        _add(
            db,
            _book("mine.pdf", "A", _t(1)),
            _book("theirs.pdf", "B", _t(2), drive=OTHER_DRIVE),
        )

        for by in ("all", "folder", "tag"):
            body = _ok(_get(c, f"by={by}&per_shelf=60"))
            assert "theirs.pdf" not in str(body), by

    def test_tag_shelf_membership_with_watch_filter_keeps_counts_exact(self, client):
        c, db, *_ = client
        rows = _watch_seed(db)
        t1 = Tag(name="T1", drive=TEST_DRIVE)
        t2 = Tag(name="T2", drive=TEST_DRIVE)
        db.add_all([t1, t2])
        rows["mid.pdf"].tags.extend([t1, t2])
        db.commit()

        shelves = {s["key"]: s for s in _ok(_get(c, "by=tag&watch=in_progress&per_shelf=60", ALICE))["shelves"]}

        assert shelves["T1"]["count"] == 1
        assert shelves["T2"]["count"] == 1
        assert shelves["no_tag"]["count"] == 1
        assert _titles(shelves["no_tag"]) == ["edge89.pdf"]
