"""SPEC-CORE-092: `origin`, `exclude_origin` and `opened` on the listing endpoints.

Invariant ids are those of docs/specs/clips-app.md. The origins are arbitrary
strings, so a core that kept or dropped one literal value would fail (I16).
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models import File, WatchHistory
from app.routers.progress import nickname_to_viewer_id
from tests.conftest import TEST_DRIVE

A = "zz-origin"
B = "yy-origin"
LONG = "l" * 32
ONE = "q"
OTHER_DRIVE = "elsewhere"
ALICE_H = {"X-Lit-Viewer": "alice"}
BOB_H = {"X-Lit-Viewer": "bob"}
ALICE_C = {"lit_viewer": "alice"}


def _t(day: int) -> datetime:
    return datetime(2026, 3, day, 12, tzinfo=UTC)


def _file(name, *, origin=None, folder="", day=1, drive=TEST_DRIVE, video=False, **extra) -> File:
    path = f"{folder}/{name}" if folder else name
    return File(
        filename=name,
        title=name,
        drive=drive,
        folder_path=folder,
        file_path=path,
        file_size=1,
        file_type="video" if video else "document",
        mime_type="video/mp4" if video else "text/markdown",
        duration=100 if video else None,
        created_at=_t(day),
        md_origin=origin,
        **extra,
    )


def _seed_plain(db) -> None:
    """A file with no origin, for the requests that must be refused before any data."""
    db.add(File(
        filename="c2.md", title="c2.md", drive=TEST_DRIVE, folder_path="", file_path="c2.md",
        file_size=1, file_type="document", mime_type="text/markdown", created_at=_t(1),
    ))
    db.commit()


def _seed(db) -> dict[str, File]:
    rows = {
        "c1.md": _file("c1.md", origin=A, day=3),
        "c2.md": _file("c2.md", origin=A, folder="Clips", day=5),
        "c3.md": _file("c3.md", origin=A, day=4, deleted_at=_t(6)),
        "c4.md": _file("c4.md", origin=A, day=6, missing_since=_t(7)),
        "n1.md": _file("n1.md", day=2),
        "n2.md": _file("n2.md", origin=B, day=1),
        "long.md": _file("long.md", origin=LONG, day=7, folder="Long"),
        "one.md": _file("one.md", origin=ONE, day=8),
        "v1.mp4": _file("v1.mp4", day=9, video=True),
        "foreign.md": _file("foreign.md", origin=A, day=10, drive=OTHER_DRIVE),
    }
    db.add_all(rows.values())
    db.commit()
    alice = nickname_to_viewer_id("alice")
    bob = nickname_to_viewer_id("bob")
    for viewer, name, pos, dur, day in [
        (alice, "c1.md", 0, 0, 10),
        (alice, "n1.md", 0, 0, 11),
        (alice, "n2.md", 50, 100, 12),
        (alice, "v1.mp4", 99, 100, 13),
        (bob, "c2.md", 0, 0, 14),
    ]:
        db.add(WatchHistory(
            viewer_id=viewer, file_id=rows[name].id, playback_position=pos,
            duration=dur, last_played_at=_t(day),
        ))
    db.commit()
    return rows


ACTIVE = {"c1.md", "c2.md", "n1.md", "n2.md", "long.md", "one.md", "v1.mp4"}
ORIGIN_OF = {"c1.md": A, "c2.md": A, "n1.md": None, "n2.md": B, "long.md": LONG, "one.md": ONE, "v1.mp4": None}


def _expected(origin=None, exclude=None, base=ACTIVE) -> set[str]:
    return {
        n for n in base
        if (origin is None or ORIGIN_OF[n] == origin) and (exclude is None or ORIGIN_OF[n] != exclude)
    }


def _query(**params) -> str:
    return "&".join(f"{k}={v}" for k, v in params.items() if v is not None)


def _files(c, **params) -> tuple[set[str], int]:
    res = c.get(f"/api/drives/{TEST_DRIVE}/files?limit=100&{_query(**params)}")
    assert res.status_code == 200, res.text
    body = res.json()
    return {i["title"] for i in body["data"]}, body["meta"]["total"]


def _all_shelf(c, headers=None, **params) -> tuple[list[str], int]:
    res = c.get(
        f"/api/drives/{TEST_DRIVE}/shelves?by=all&key=all&per_shelf=60&{_query(**params)}",
        headers=headers or {},
    )
    assert res.status_code == 200, res.text
    shelves = res.json()["shelves"]
    if not shelves:
        return [], 0
    assert len(shelves) == 1
    return [i["title"] for i in shelves[0]["items"]], shelves[0]["count"]


def _history(c, cookies=ALICE_C, **params) -> list[str]:
    res = c.get(
        f"/api/drives/{TEST_DRIVE}/watch-history?filter=all&limit=50&{_query(**params)}",
        cookies=cookies,
    )
    assert res.status_code == 200, res.text
    return [i["title"] for i in res.json()["data"]]


def _counts(c, **params) -> dict[str, int]:
    res = c.get(f"/api/drives/{TEST_DRIVE}/folder-counts?{_query(**params)}")
    assert res.status_code == 200, res.text
    return {e["path"]: e["count"] for e in res.json()}


CONDITIONS = [
    pytest.param({"origin": A}, id="origin"),
    pytest.param({"exclude_origin": A}, id="exclude"),
    pytest.param({"origin": B, "exclude_origin": A}, id="both-disjoint"),
    pytest.param({"origin": A, "exclude_origin": A}, id="both-same"),
    pytest.param({"origin": LONG}, id="origin-32-chars"),
    pytest.param({"origin": ONE}, id="origin-1-char"),
    pytest.param({"exclude_origin": LONG}, id="exclude-32-chars"),
    pytest.param({"origin": "nobody"}, id="origin-no-match"),
]


class TestFiles:
    """SPEC-CORE-092 step 4, I5, I6."""

    @pytest.mark.parametrize("cond", CONDITIONS)
    def test_spec_core_092_files_keeps_and_drops_by_origin_and_counts_after(self, client, cond):
        c, db, *_ = client
        _seed(db)

        titles, total = _files(c, **cond)

        want = _expected(cond.get("origin"), cond.get("exclude_origin"))
        assert titles == want
        assert total == len(want)

    def test_spec_core_092_conditions_compose_with_the_kind_filter(self, client):
        c, db, *_ = client
        _seed(db)

        titles, total = _files(c, type="text", exclude_origin=A)

        assert titles == {"n1.md", "n2.md", "long.md", "one.md"}
        assert total == 4

    def test_spec_core_092_paging_covers_exactly_the_kept_set(self, client):
        c, db, *_ = client
        _seed(db)

        seen, totals = [], set()
        for page in (1, 2, 3):
            res = c.get(f"/api/drives/{TEST_DRIVE}/files?origin={A}&limit=1&page={page}")
            assert res.status_code == 200, res.text
            seen += [i["title"] for i in res.json()["data"]]
            totals.add(res.json()["meta"]["total"])

        assert sorted(seen) == ["c1.md", "c2.md"]
        assert totals == {2}

    def test_spec_core_092_another_drives_files_never_appear(self, client):
        c, db, *_ = client
        _seed(db)

        titles, _ = _files(c, origin=A)

        assert "foreign.md" not in titles
        assert titles == {"c1.md", "c2.md"}


class TestShelves:
    """SPEC-CORE-092 step 4, I5, I6: `shelves` answers the same set as `files`."""

    @pytest.mark.parametrize("cond", CONDITIONS)
    def test_spec_core_092_all_shelf_count_equals_files_total(self, client, cond):
        c, db, *_ = client
        _seed(db)

        items, count = _all_shelf(c, **cond)
        titles, total = _files(c, **cond)

        assert set(items) == titles
        assert count == total
        assert set(items) == _expected(cond.get("origin"), cond.get("exclude_origin"))

    def test_spec_core_092_origin_with_created_at_desc_orders_newest_first(self, client):
        c, db, *_ = client
        _seed(db)

        items, count = _all_shelf(c, origin=A, sort="created_at", order="desc")

        assert items == ["c2.md", "c1.md"]
        assert count == 2

    def test_spec_core_092_origin_narrows_folder_shelves(self, client):
        c, db, *_ = client
        _seed(db)

        res = c.get(f"/api/drives/{TEST_DRIVE}/shelves?by=folder&per_shelf=60&origin={A}")

        assert res.status_code == 200, res.text
        by_key = {s["key"]: sorted(i["title"] for i in s["items"]) for s in res.json()["shelves"]}
        assert by_key == {"Clips": ["c2.md"], "": ["c1.md"]}


class TestWatchHistory:
    """SPEC-CORE-092 step 4, I5 on `watch-history`."""

    def test_spec_core_092_watch_history_keeps_only_the_origin(self, client):
        c, db, *_ = client
        _seed(db)

        assert _history(c, origin=A) == ["c1.md"]

    def test_spec_core_092_watch_history_drops_the_origin_and_keeps_null(self, client):
        c, db, *_ = client
        _seed(db)

        without = _history(c)
        dropped = _history(c, exclude_origin=A)

        assert dropped == [t for t in without if t != "c1.md"]
        assert "n1.md" in dropped and "v1.mp4" in dropped

    def test_spec_core_092_watch_history_both_conditions_apply(self, client):
        c, db, *_ = client
        _seed(db)

        assert _history(c, origin=B, exclude_origin=A) == ["n2.md"]


class TestFolderCounts:
    """SPEC-CORE-092 step 4, I5 per folder."""

    def test_spec_core_092_folder_counts_keep_only_the_origin(self, client):
        c, db, *_ = client
        _seed(db)

        assert _counts(c, type="text", origin=A) == {"": 1, "Clips": 1}

    def test_spec_core_092_folder_counts_drop_the_origin(self, client):
        c, db, *_ = client
        _seed(db)

        assert _counts(c, type="text", exclude_origin=A) == {"": 3, "Long": 1}

    def test_spec_core_092_folder_counts_both_conditions(self, client):
        c, db, *_ = client
        _seed(db)

        assert _counts(c, type="text", origin=LONG, exclude_origin=A) == {"Long": 1}


ENDPOINTS = [
    pytest.param("files", id="files"),
    pytest.param("shelves?by=all&key=all", id="shelves"),
    pytest.param("watch-history?filter=all", id="watch-history"),
    pytest.param("folder-counts", id="folder-counts"),
]


class TestBadValues:
    """SPEC-CORE-092 step 4, I17: empty or over 32 characters is a 422."""

    @pytest.mark.parametrize("endpoint", ENDPOINTS)
    @pytest.mark.parametrize("param", ["origin", "exclude_origin"])
    @pytest.mark.parametrize("value", ["", "x" * 33], ids=["empty", "33-chars"])
    def test_spec_core_092_bad_length_is_422(self, client, endpoint, param, value):
        c, db, *_ = client
        _seed_plain(db)
        sep = "&" if "?" in endpoint else "?"

        res = c.get(f"/api/drives/{TEST_DRIVE}/{endpoint}{sep}{param}={value}", cookies=ALICE_C)

        assert res.status_code == 422, res.text


class TestOpened:
    """SPEC-CORE-092 step 5, I7, I17."""

    def test_spec_core_092_opened_true_is_the_viewers_rows_whatever_the_position(self, client):
        c, db, *_ = client
        _seed(db)

        items, count = _all_shelf(c, ALICE_H, opened="true")

        assert set(items) == {"c1.md", "n1.md", "n2.md", "v1.mp4"}
        assert count == 4

    def test_spec_core_092_opened_false_is_every_file_without_a_row(self, client):
        c, db, *_ = client
        _seed(db)

        items, count = _all_shelf(c, ALICE_H, opened="false")

        assert set(items) == {"c2.md", "long.md", "one.md"}
        assert count == 3

    def test_spec_core_092_another_viewers_rows_never_change_the_answer(self, client):
        c, db, *_ = client
        _seed(db)

        alice_open, _ = _all_shelf(c, ALICE_H, opened="true")
        bob_open, _ = _all_shelf(c, BOB_H, opened="true")
        bob_closed, _ = _all_shelf(c, BOB_H, opened="false")

        assert "c2.md" not in alice_open
        assert set(bob_open) == {"c2.md"}
        assert set(bob_closed) == ACTIVE - {"c2.md"}

    def test_spec_core_092_unread_request_is_origin_and_not_opened(self, client):
        c, db, *_ = client
        _seed(db)

        items, count = _all_shelf(
            c, ALICE_H, origin=A, opened="false", sort="created_at", order="desc"
        )

        assert items == ["c2.md"]
        assert count == 1

    def test_spec_core_092_opened_with_exclude_origin(self, client):
        c, db, *_ = client
        _seed(db)

        items, _ = _all_shelf(c, ALICE_H, exclude_origin=A, opened="true")

        assert set(items) == {"n1.md", "n2.md", "v1.mp4"}

    @pytest.mark.parametrize(
        "query",
        [
            "by=watch&opened=true",
            "by=watch&key=unwatched&opened=false",
            "by=all&key=all&watch=finished&opened=true",
            "by=folder&watch=in_progress&opened=false",
            "by=watch&key=in_progress&sort=last_played&opened=true",
        ],
    )
    @pytest.mark.parametrize("who", ["no-viewer", "viewer"])
    def test_spec_core_092_opened_with_watch_conditions_is_422_with_or_without_a_viewer(
        self, client, query, who
    ):
        c, db, *_ = client
        _seed_plain(db)

        res = c.get(
            f"/api/drives/{TEST_DRIVE}/shelves?{query}",
            headers=ALICE_H if who == "viewer" else {},
        )

        assert res.status_code == 422, res.text

    @pytest.mark.parametrize("value", ["true", "false"])
    def test_spec_core_092_opened_without_a_viewer_is_400_viewer_required(self, client, value):
        c, db, *_ = client
        _seed_plain(db)

        res = c.get(f"/api/drives/{TEST_DRIVE}/shelves?by=all&key=all&opened={value}&origin={A}")

        assert res.status_code == 400
        assert "viewer_required" in str(res.json()["detail"])
        assert "c2.md" not in res.text

    def test_spec_core_092_opened_that_is_not_a_bool_is_422(self, client):
        c, db, *_ = client
        _seed_plain(db)

        res = c.get(f"/api/drives/{TEST_DRIVE}/shelves?by=all&key=all&opened=sometimes", headers=ALICE_H)

        assert res.status_code == 422, res.text
