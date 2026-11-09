"""Acceptance tests for the shelves endpoint's `ids` filter (SPEC-CORE-067).

Invariant ids are those of docs/specs/video-discover-addon-shelves.md.
"""

from __future__ import annotations

import pytest

from tests.test_api_shelves import ALICE, _get, _names, _seed, _shelves


def _ids_query(*ids: str) -> str:
    return "&".join(f"ids={i}" for i in ids)


def _all(c, query: str, headers=None):
    shelves = _shelves(_get(c, f"by=all&key=all&per_shelf=60&sort=title&order=asc&{query}", headers))
    return shelves[0] if shelves else {"count": 0, "items": []}


class TestIdsNarrowing:
    """SPEC-CORE-067 I1."""

    def test_only_the_listed_ids_are_returned_and_counted(self, client):
        c, db, *_ = client
        rows = _seed(db)

        shelf = _all(c, f"type=video&{_ids_query(rows['b1.mp4'].id, rows['a2.mp4'].id)}")

        assert _names(shelf) == ["a2.mp4", "b1.mp4"]
        assert shelf["count"] == 2

    def test_a_listed_id_must_still_pass_every_other_filter(self, client):
        c, db, *_ = client
        rows = _seed(db)

        shelf = _all(
            c,
            f"type=video&folder=Shows&{_ids_query(rows['pic.jpg'].id, rows['a1.mp4'].id, rows['b2.mp4'].id)}",
        )

        assert _names(shelf) == ["b2.mp4"]
        assert shelf["count"] == 1

    @pytest.mark.parametrize("name", ["foreign.mp4", "gone.mp4", "bin.mp4"])
    def test_another_drives_trash_or_missing_id_matches_nothing(self, client, name):
        c, db, *_ = client
        rows = _seed(db)

        shelf = _all(c, f"type=video&{_ids_query(rows[name].id, rows['x.mp4'].id)}")

        assert _names(shelf) == ["x.mp4"]
        assert shelf["count"] == 1

    def test_an_unknown_id_matches_nothing(self, client):
        c, db, *_ = client
        _seed(db)

        shelf = _all(c, "type=video&ids=doesnotexist")

        assert shelf["items"] == []
        assert shelf["count"] == 0

    def test_watch_unwatched_drops_the_viewers_started_and_finished_files(self, client):
        c, db, *_ = client
        rows = _seed(db)
        listed = ["a1.mp4", "a2.mp4", "b1.mp4", "x.mp4"]

        shelf = _all(c, f"type=video&watch=unwatched&{_ids_query(*(rows[n].id for n in listed))}", ALICE)

        assert _names(shelf) == ["b1.mp4", "x.mp4"]

    def test_ids_narrow_every_grouped_shelf(self, client):
        c, db, *_ = client
        rows = _seed(db)

        shelves = _shelves(
            _get(c, f"by=folder&type=video&per_shelf=20&{_ids_query(rows['a1.mp4'].id, rows['b2.mp4'].id)}")
        )

        assert sorted(n for s in shelves for n in _names(s)) == ["a1.mp4", "b2.mp4"]
        assert sum(s["count"] for s in shelves) == 2

    def test_sixty_ids_are_accepted(self, client):
        c, db, *_ = client
        rows = _seed(db)
        ids = [rows["a1.mp4"].id] + [f"none{i:08d}" for i in range(59)]

        shelf = _all(c, f"type=video&{_ids_query(*ids)}")

        assert _names(shelf) == ["a1.mp4"]


class TestIdsRejected:
    """SPEC-CORE-067 I1 limits."""

    @pytest.mark.parametrize(
        "ids",
        [
            [f"none{i:08d}" for i in range(61)],
            [f"none{i:08d}" for i in range(31)] * 2,
            ["dup"] * 61,
        ],
        ids=["61-distinct", "31-twice", "one-61-times"],
    )
    def test_more_than_sixty_ids_is_422(self, client, ids):
        c, db, *_ = client
        _seed(db)

        assert _get(c, f"by=all&key=all&per_shelf=60&{_ids_query(*ids)}").status_code == 422

    @pytest.mark.parametrize("ids_query", ["ids=", "ids=x&ids=", "ids=&ids=x"])
    def test_an_empty_element_is_422(self, client, ids_query):
        c, db, *_ = client
        _seed(db)

        assert _get(c, f"by=all&key=all&per_shelf=60&{ids_query}").status_code == 422
