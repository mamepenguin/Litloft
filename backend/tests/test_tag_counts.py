"""SPEC-CORE-148: `GET /api/drives/{drive}/tag-counts` and its `POST …/query` form.

Invariant ids are those of docs/specs/app-library-filters.md. Each count is
checked against the shelves route's `by=all&key=all` answer with `tag=<name>`
added, and the whole answer is also pinned by hand so the two cannot drift
together unnoticed.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models import Collection, CollectionItem, File, Tag, WatchHistory
from app.routers.progress import nickname_to_viewer_id
from tests.conftest import TEST_DRIVE
from tests.test_target_drive_access import LOCKED_DRIVE, OPEN_DRIVE, two_drives  # noqa: F401

OTHER_DRIVE = "elsewhere"
ALICE = {"X-Lit-Viewer": "alice"}
BOB = {"X-Lit-Viewer": "bob"}


def _at(day: int) -> datetime:
    return datetime(2026, 5, day, tzinfo=UTC)


class _Tags:
    def __init__(self, db):
        self.db = db
        self.rows: dict[tuple[str, str], Tag] = {}

    def __call__(self, name: str, drive: str = TEST_DRIVE) -> Tag:
        key = (drive, name)
        if key not in self.rows:
            row = Tag(name=name, drive=drive)
            self.db.add(row)
            self.db.flush()
            self.rows[key] = row
        return self.rows[key]


def _file(
    db,
    path: str,
    tags: list[Tag],
    *,
    drive: str = TEST_DRIVE,
    kind: str = "video",
    day: int = 1,
    deleted: bool = False,
    missing: bool = False,
) -> File:
    *folders, filename = path.split("/")
    row = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="/".join(folders),
        file_path=path,
        file_size=1,
        file_type=kind,
        mime_type="video/mp4" if kind == "video" else "image/jpeg",
        duration=1000 if kind == "video" else None,
        created_at=_at(day),
        deleted_at=_at(day) if deleted else None,
        missing_since=_at(day) if missing else None,
    )
    row.tags.extend(tags)
    db.add(row)
    db.commit()
    return row


def _collection(db, name: str, files: list[File], drive: str = TEST_DRIVE) -> Collection:
    collection = Collection(drive=drive, name=name)
    db.add(collection)
    db.commit()
    db.refresh(collection)
    for position, f in enumerate(files):
        db.add(CollectionItem(collection_id=collection.id, file_id=f.id, position=position))
    db.commit()
    return collection


def _seed(db) -> dict[str, File]:
    t = _Tags(db)
    rows = {
        "v1": _file(db, "Movies/v1.mp4", [t("trip"), t("food")], day=1),
        # A moved file still linked to another drive's spelling of a tag this drive has.
        "v2": _file(db, "Movies/v2.mp4", [t("trip"), t("TRIP", OTHER_DRIVE)], day=2),
        "v3": _file(db, "Shows/v3.mp4", [t("trip"), t("Über")], day=3),
        # Non-ASCII capitals: SQLite's lower() would keep "Über" and "über" apart.
        "v4": _file(db, "Shows/v4.mp4", [t("über", OTHER_DRIVE)], day=4),
        "v5": _file(db, "Shows/v5.mp4", [t("moved", OTHER_DRIVE)], day=5),
        "v6": _file(db, "v6.mp4", [t("food")], day=6),
        "v7": _file(db, "v7.mp4", [], day=7),
        "pic": _file(db, "Movies/pic.jpg", [t("trip"), t("pics")], kind="image", day=8),
        "gone": _file(db, "Movies/gone.mp4", [t("trip"), t("ghost")], deleted=True, day=9),
        "lost": _file(db, "Movies/lost.mp4", [t("ghost")], missing=True, day=10),
        "foreign": _file(
            db, "Movies/foreign.mp4", [t("trip", OTHER_DRIVE), t("alien", OTHER_DRIVE)],
            drive=OTHER_DRIVE, day=11,
        ),
    }
    _collection(db, "Picks", [rows["v1"], rows["v3"], rows["v5"], rows["gone"]])
    _collection(db, "Picks", [rows["foreign"]], drive=OTHER_DRIVE)

    alice = nickname_to_viewer_id("alice")
    bob = nickname_to_viewer_id("bob")
    for viewer, name, pos in [
        (alice, "v1", 100),
        (alice, "v2", 950),
        (bob, "v3", 950),
    ]:
        db.add(
            WatchHistory(
                viewer_id=viewer,
                file_id=rows[name].id,
                playback_position=pos,
                duration=1000,
                last_played_at=_at(20),
            )
        )
    db.commit()
    return rows


def _get(c, params, headers=None, drive: str = TEST_DRIVE):
    return c.get(f"/api/drives/{drive}/tag-counts", params=params, headers=headers or {})


def _post(c, params, body, headers=None, drive: str = TEST_DRIVE):
    return c.post(
        f"/api/drives/{drive}/tag-counts/query", params=params, json=body, headers=headers or {}
    )


def _ok(res):
    assert res.status_code == 200, res.text
    return res.json()


def _shelf_count(c, params, name: str, headers=None) -> int:
    query = [("by", "all"), ("key", "all"), ("per_shelf", "1"), *params, ("tag", name)]
    res = c.get(f"/api/drives/{TEST_DRIVE}/shelves", params=query, headers=headers or {})
    shelves = _ok(res)["shelves"]
    return shelves[0]["count"] if shelves else 0


def _listing_total(c, params, name: str) -> int:
    query = [*params, ("tag", name), ("limit", "1")]
    return _ok(c.get(f"/api/drives/{TEST_DRIVE}/files", params=query))["meta"]["total"]


# (label, parameters, viewer headers, the answer pinned by hand)
CASES = [
    (
        "no condition",
        [],
        None,
        [("trip", 4), ("food", 2), ("Über", 2), ("moved", 1), ("pics", 1)],
    ),
    (
        "a kind",
        [("type", "video")],
        None,
        [("trip", 3), ("food", 2), ("Über", 2), ("moved", 1)],
    ),
    (
        "a chosen tag narrows every count, itself included",
        [("tag", "trip")],
        None,
        [("trip", 4), ("food", 1), ("pics", 1), ("Über", 1)],
    ),
    (
        "two chosen tags are AND",
        [("tag", "trip"), ("tag", "food")],
        None,
        [("food", 1), ("trip", 1)],
    ),
    (
        "a folder subtree",
        [("folder", "Shows")],
        None,
        [("Über", 2), ("moved", 1), ("trip", 1)],
    ),
    (
        "a collection",
        [("collection", "Picks")],
        None,
        [("trip", 2), ("food", 1), ("moved", 1), ("Über", 1)],
    ),
    (
        "a condition that matches nothing",
        [("tag", "nowhere")],
        None,
        [],
    ),
    (
        "watch in_progress uses the viewer's own rows",
        [("type", "video"), ("watch", "in_progress")],
        ALICE,
        [("food", 1), ("trip", 1)],
    ),
    (
        "watch finished uses the viewer's own rows",
        [("type", "video"), ("watch", "finished")],
        ALICE,
        [("trip", 1)],
    ),
    (
        "watch unwatched uses the viewer's own rows",
        [("type", "video"), ("watch", "unwatched")],
        ALICE,
        [("Über", 2), ("food", 1), ("moved", 1), ("trip", 1)],
    ),
    (
        "another viewer's history moves nothing for this one",
        [("type", "video"), ("watch", "finished")],
        BOB,
        [("trip", 1), ("Über", 1)],
    ),
]


class TestGet:
    """SPEC-CORE-148 normal flow, I1."""

    @pytest.mark.parametrize(
        ("params", "headers", "pinned"),
        [case[1:] for case in CASES],
        ids=[case[0] for case in CASES],
    )
    def test_spec_core_148_each_count_is_the_shelves_all_count_with_that_tag(
        self, client, params, headers, pinned
    ):
        c, db, *_ = client
        _seed(db)

        answer = _ok(_get(c, params, headers))

        assert [(e["name"], e["count"]) for e in answer] == pinned
        for entry in answer:
            assert entry["count"] == _shelf_count(c, params, entry["name"], headers), entry

    @pytest.mark.parametrize(
        "params",
        [case[1] for case in CASES if case[2] is None],
        ids=[case[0] for case in CASES if case[2] is None],
    )
    def test_spec_core_148_without_watch_each_count_is_the_listings_total(self, client, params):
        c, db, *_ = client
        _seed(db)

        answer = _ok(_get(c, params))

        for entry in answer:
            assert entry["count"] == _listing_total(c, params, entry["name"]), entry

    def test_spec_core_148_entries_are_name_and_count_only(self, client):
        c, db, *_ = client
        _seed(db)

        answer = _ok(_get(c, []))

        assert answer
        assert all(set(e) == {"name", "count"} for e in answer)
        assert all(isinstance(e["name"], str) and isinstance(e["count"], int) for e in answer)

    def test_spec_core_148_paging_and_sort_parameters_are_ignored(self, client):
        c, db, *_ = client
        _seed(db)

        plain = _ok(_get(c, [("type", "video")]))
        paged = _ok(
            _get(
                c,
                [("type", "video"), ("limit", "1"), ("page", "2"), ("sort", "title"), ("order", "asc")],
            )
        )

        assert plain == [
            {"name": "trip", "count": 3},
            {"name": "food", "count": 2},
            {"name": "Über", "count": 2},
            {"name": "moved", "count": 1},
        ]
        assert paged == plain


class TestGrouping:
    """SPEC-CORE-148 grouping by folded name, I1."""

    def test_spec_core_148_a_file_carrying_two_spellings_counts_once(self, client):
        c, db, *_ = client
        rows = _seed(db)

        answer = _ok(_post(c, [], {"file_ids": [rows["v2"].id]}))

        assert answer == [{"name": "trip", "count": 1}]

    def test_spec_core_148_non_ascii_capitals_fold_into_one_group(self, client):
        c, db, *_ = client
        _seed(db)

        folded = [(e["name"].lower(), e["count"]) for e in _ok(_get(c, []))]

        assert [entry for entry in folded if entry[0] == "über"] == [("über", 2)]

    def test_spec_core_148_the_name_is_this_drives_spelling(self, client):
        c, db, *_ = client
        rows = _seed(db)

        answer = _ok(_post(c, [], {"file_ids": [rows["v3"].id, rows["v4"].id]}))

        assert {"name": "Über", "count": 2} in answer

    def test_spec_core_148_a_group_without_a_row_of_this_drive_uses_the_other_spelling(self, client):
        c, db, *_ = client
        rows = _seed(db)

        answer = _ok(_post(c, [], {"file_ids": [rows["v4"].id, rows["v5"].id]}))

        assert answer == [{"name": "moved", "count": 1}, {"name": "über", "count": 1}]

    def test_spec_core_148_two_spellings_held_by_this_drive_are_one_group(self, client):
        c, db, *_ = client
        t = _Tags(db)
        _file(db, "a.mp4", [t("Über")])
        _file(db, "b.mp4", [t("über")])
        _file(db, "c.mp4", [t("Über"), t("über")])

        answer = _ok(_get(c, []))

        assert len(answer) == 1
        assert answer[0]["name"] in {"Über", "über"}
        assert answer[0]["count"] == 3

    def test_spec_core_148_an_empty_drive_answers_an_empty_list(self, client):
        c, *_ = client

        assert _ok(_get(c, [])) == []

    def test_spec_core_148_inactive_and_foreign_files_count_nothing(self, client):
        c, db, *_ = client
        _seed(db)

        names = {e["name"].lower() for e in _ok(_get(c, []))}

        assert "ghost" not in names
        assert "alien" not in names


class TestPostQuery:
    """SPEC-CORE-148 the POST form, I1, I2."""

    def test_spec_core_148_ids_answer_what_a_collection_of_exactly_those_answers(self, client):
        c, db, *_ = client
        rows = _seed(db)
        members = [rows["v1"], rows["v3"], rows["v5"]]
        _collection(db, "Exactly", members)

        by_ids = _ok(_post(c, [], {"file_ids": [r.id for r in members]}))
        by_collection = _ok(_get(c, [("collection", "Exactly")]))

        assert by_ids == by_collection
        assert by_ids == [
            {"name": "trip", "count": 2},
            {"name": "food", "count": 1},
            {"name": "moved", "count": 1},
            {"name": "Über", "count": 1},
        ]

    def test_spec_core_148_ids_join_a_collection_in_the_in_condition(self, client):
        c, db, *_ = client
        rows = _seed(db)

        answer = _ok(_post(c, [("collection", "Picks")], {"file_ids": [rows["v6"].id]}))

        assert answer == [
            {"name": "food", "count": 2},
            {"name": "trip", "count": 2},
            {"name": "moved", "count": 1},
            {"name": "Über", "count": 1},
        ]

    def test_spec_core_148_other_conditions_still_apply_to_listed_ids(self, client):
        c, db, *_ = client
        rows = _seed(db)

        answer = _ok(
            _post(c, [("type", "video"), ("tag", "food")], {"file_ids": [rows["v1"].id, rows["pic"].id]})
        )

        assert answer == [{"name": "food", "count": 1}, {"name": "trip", "count": 1}]

    def test_spec_core_148_trashed_missing_and_foreign_ids_count_nothing(self, client):
        c, db, *_ = client
        rows = _seed(db)

        answer = _ok(
            _post(
                c,
                [],
                {"file_ids": [rows["gone"].id, rows["lost"].id, rows["foreign"].id, rows["v6"].id]},
            )
        )

        assert answer == [{"name": "food", "count": 1}]

    def test_spec_core_148_an_empty_id_list_counts_nothing(self, client):
        c, db, *_ = client
        _seed(db)

        assert _ok(_post(c, [], {"file_ids": []})) == []

    def test_spec_core_148_post_accepts_watch_with_a_viewer(self, client):
        c, db, *_ = client
        rows = _seed(db)

        answer = _ok(
            _post(c, [("watch", "unwatched")], {"file_ids": [rows["v1"].id, rows["v6"].id]}, ALICE)
        )

        assert answer == [{"name": "food", "count": 1}]


class TestViewerRequired:
    """SPEC-CORE-148 failure cases, I2."""

    @pytest.mark.parametrize("state", ["in_progress", "unwatched", "finished"])
    def test_spec_core_148_watch_without_a_viewer_is_400_viewer_required(self, client, state):
        c, db, *_ = client
        rows = _seed(db)
        body = {"file_ids": [rows["v1"].id]}

        assert _get(c, [("watch", state)], ALICE).status_code == 200
        get = _get(c, [("watch", state)])
        post = _post(c, [("watch", state)], body)

        for res in (get, post):
            assert res.status_code == 400, res.text
            assert "viewer_required" in str(res.json()["detail"])
            assert "trip" not in res.text


def _in(db, drive: str, path: str, names=()) -> File:
    t = db.info.setdefault("tags", _Tags(db))
    return _file(db, path, [t(n, drive) for n in names], drive=drive)


class TestDriveBoundary:
    """SPEC-CORE-148 authorization, I2."""

    def test_spec_core_148_locked_and_unknown_drives_are_404_on_both_forms(self, two_drives):
        c, db, *_ = two_drives
        mine = _in(db, OPEN_DRIVE, "Notes/a.mp4", ["t"])
        _in(db, LOCKED_DRIVE, "Secret/b.mp4", ["t"])
        body = {"file_ids": [mine.id]}

        assert _ok(_get(c, [], drive=OPEN_DRIVE)) == [{"name": "t", "count": 1}]
        assert _ok(_post(c, [], body, drive=OPEN_DRIVE)) == [{"name": "t", "count": 1}]
        for drive in (LOCKED_DRIVE, "nope"):
            assert _get(c, [], drive=drive).status_code == 404
            assert _post(c, [], body, drive=drive).status_code == 404

    def test_spec_core_148_another_drives_ids_and_collections_count_nothing(self, two_drives):
        c, db, *_ = two_drives
        mine = _in(db, OPEN_DRIVE, "Notes/a.mp4", ["mine"])
        theirs = _in(db, LOCKED_DRIVE, "Notes/b.mp4", ["theirs"])
        theirs_too = _in(db, LOCKED_DRIVE, "Secret/c.mp4", ["theirs"])
        _collection(db, "Shared", [theirs, theirs_too], drive=LOCKED_DRIVE)
        _collection(db, "Shared", [mine], drive=OPEN_DRIVE)

        by_ids = _post(c, [], {"file_ids": [mine.id, theirs.id, theirs_too.id]}, drive=OPEN_DRIVE)
        by_collection = _post(c, [("collection", "Shared")], {"file_ids": [theirs.id]}, drive=OPEN_DRIVE)
        by_get = _get(c, [("collection", "Shared")], drive=OPEN_DRIVE)

        for res in (by_ids, by_collection, by_get):
            assert _ok(res) == [{"name": "mine", "count": 1}]


class TestShelvesWatchProgress:
    """SPEC-CORE-147 progress bars, I13."""

    @pytest.mark.parametrize("by", ["all", "folder", "tag", "month", "duration"])
    def test_spec_core_147_every_by_attaches_the_viewers_progress(self, client, by):
        c, db, *_ = client
        _seed(db)

        res = c.get(
            f"/api/drives/{TEST_DRIVE}/shelves",
            params=[("by", by), ("type", "video"), ("per_shelf", "60"), ("sort", "title"), ("order", "asc")],
            headers=ALICE,
        )

        items = [i for s in _ok(res)["shelves"] for i in s["items"]]
        by_title = {i["title"]: i.get("watch_progress") for i in items}
        assert by_title["v1.mp4"]["position"] == pytest.approx(100)
        assert by_title["v1.mp4"]["duration"] == pytest.approx(1000)
        assert by_title["v2.mp4"]["position"] == pytest.approx(950)
        assert not by_title["v6.mp4"]

    def test_spec_core_147_the_progress_is_the_requesting_viewers(self, client):
        c, db, *_ = client
        _seed(db)

        res = c.get(
            f"/api/drives/{TEST_DRIVE}/shelves",
            params=[("by", "all"), ("key", "all"), ("type", "video"), ("per_shelf", "60")],
            headers=BOB,
        )

        by_title = {i["title"]: i.get("watch_progress") for i in _ok(res)["shelves"][0]["items"]}
        assert by_title["v3.mp4"]["position"] == pytest.approx(950)
        assert not by_title["v1.mp4"]
