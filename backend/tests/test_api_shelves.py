"""Acceptance tests for GET /api/drives/{drive}/shelves (SPEC-CORE-056).

Invariant ids (I1 to I5) are those of docs/specs/video-library-app.md.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models import File, Tag, WatchHistory
from app.routers.progress import nickname_to_viewer_id
from tests.conftest import TEST_DRIVE
from tests.test_auth import _make_auth_client

OTHER_DRIVE = "elsewhere"
ALICE = {"X-Lit-Viewer": "alice"}
BOB = {"X-Lit-Viewer": "bob"}


def _t(month: int, day: int, hour: int = 12) -> datetime:
    return datetime(2026, month, day, hour, tzinfo=UTC)


def _file(name, folder, duration, created, *, drive=TEST_DRIVE, kind="video", **extra):
    path = f"{folder}/{name}" if folder else name
    return File(
        filename=name,
        title=name,
        drive=drive,
        folder_path=folder,
        file_path=path,
        file_size=extra.pop("size", 1),
        file_type=kind,
        mime_type="video/mp4" if kind == "video" else "image/jpeg",
        duration=duration,
        created_at=created,
        **extra,
    )


def _seed(db) -> dict[str, File]:
    trip = Tag(name="Trip", drive=TEST_DRIVE)
    year = Tag(name="2024", drive=TEST_DRIVE)
    foreign_trip = Tag(name="Trip", drive=OTHER_DRIVE)
    db.add_all([trip, year, foreign_trip])

    rows = {
        "a1.mp4": _file("a1.mp4", "Movies/Action", 599.9, _t(1, 10)),
        "a2.mp4": _file("a2.mp4", "Movies", 600, _t(1, 20), is_favorite=True),
        "b1.mp4": _file("b1.mp4", "Shows", 1799.9, _t(2, 5)),
        "b2.mp4": _file("b2.mp4", "Shows/S1", 1800, _t(2, 6)),
        "root.mp4": _file("root.mp4", "", None, _t(2, 7)),
        "zero.mp4": _file("zero.mp4", "Shows", 0, _t(2, 28, 23)),
        "x.mp4": _file("x.mp4", "Moviesx", 100, datetime(2026, 3, 1, 0, tzinfo=UTC)),
        "pic.jpg": _file("pic.jpg", "Movies", None, _t(1, 15), kind="image"),
        "gone.mp4": _file("gone.mp4", "Movies", 100, _t(1, 16), missing_since=_t(1, 17)),
        "bin.mp4": _file("bin.mp4", "Movies", 100, _t(1, 18), deleted_at=_t(1, 19)),
        "foreign.mp4": _file("foreign.mp4", "Movies", 100, _t(1, 21), drive=OTHER_DRIVE),
    }
    rows["a1.mp4"].tags.extend([trip])
    rows["a2.mp4"].tags.extend([trip, year])
    rows["foreign.mp4"].tags.extend([foreign_trip])
    db.add_all(rows.values())
    db.commit()

    alice = nickname_to_viewer_id("alice")
    bob = nickname_to_viewer_id("bob")
    history = [
        (alice, "a1.mp4", 100, 599.9, _t(5, 2)),
        (alice, "a2.mp4", 540, 600, _t(5, 1)),
        (alice, "root.mp4", 5, 100, _t(5, 3)),
        (alice, "b1.mp4", 0, 1799.9, _t(5, 4)),
        (alice, "b2.mp4", 10, 0, _t(5, 5)),
        (bob, "x.mp4", 100, 100, _t(5, 6)),
        (bob, "a1.mp4", 599, 599.9, _t(5, 7)),
    ]
    for viewer, name, pos, dur, at in history:
        db.add(
            WatchHistory(
                viewer_id=viewer,
                file_id=rows[name].id,
                playback_position=pos,
                duration=dur,
                last_played_at=at,
            )
        )
    db.commit()
    return rows


def _get(c, query: str, headers=None, drive: str = TEST_DRIVE):
    return c.get(f"/api/drives/{drive}/shelves?{query}", headers=headers or {})


def _shelves(res):
    assert res.status_code == 200, res.text
    return res.json()["shelves"]


def _names(shelf) -> list[str]:
    return [item["title"] for item in shelf["items"]]


def _by_key(res) -> dict:
    return {s["key"]: s for s in _shelves(res)}


class TestGroupingByClassification:
    """SPEC-CORE-056 key matching, I2, I3, I9."""

    def test_folder_shelves_are_first_segments_ordered_by_count_then_name(self, client):
        c, db, *_ = client
        _seed(db)

        res = _get(c, "by=folder&type=video&sort=title&order=asc&per_shelf=10")

        shelves = _shelves(res)
        assert [(s["key"], s["count"]) for s in shelves] == [
            ("Shows", 3),
            ("Movies", 2),
            ("", 1),
            ("Moviesx", 1),
        ]
        assert res.json()["by"] == "folder"
        assert res.json()["total_shelves"] == 4
        assert _names(shelves[0]) == ["b1.mp4", "b2.mp4", "zero.mp4"]
        assert shelves[2]["items"][0]["title"] == "root.mp4"

    def test_folder_key_matches_equal_or_slash_prefix_only(self, client):
        c, db, *_ = client
        _seed(db)

        shelf = _shelves(_get(c, "by=folder&key=Movies&type=video&sort=title&order=asc"))[0]

        assert shelf["count"] == 2
        assert _names(shelf) == ["a1.mp4", "a2.mp4"]

    def test_empty_key_under_folder_is_the_root_shelf(self, client):
        c, db, *_ = client
        _seed(db)

        shelf = _shelves(_get(c, "by=folder&key=&type=video"))[0]

        assert shelf["count"] == 1
        assert _names(shelf) == ["root.mp4"]

    def test_tag_shelves_use_this_drives_tags_and_no_tag_comes_last(self, client):
        c, db, *_ = client
        _seed(db)

        shelves = _shelves(_get(c, "by=tag&type=video&sort=title&order=asc&per_shelf=10"))

        assert [(s["key"], s["count"]) for s in shelves] == [
            ("Trip", 2),
            ("2024", 1),
            ("no_tag", 5),
        ]
        assert [s["label"] for s in shelves[:2]] == ["Trip", "2024"]
        assert _names(shelves[0]) == ["a1.mp4", "a2.mp4"]

    def test_a_multi_tagged_video_is_in_each_of_its_tag_shelves(self, client):
        c, db, *_ = client
        _seed(db)

        shelves = _by_key(_get(c, "by=tag&type=video&per_shelf=10"))

        assert "a2.mp4" in _names(shelves["Trip"])
        assert "a2.mp4" in _names(shelves["2024"])
        assert "a2.mp4" not in _names(shelves["no_tag"])

    def test_month_shelves_are_utc_months_newest_first(self, client):
        c, db, *_ = client
        _seed(db)

        shelves = _shelves(_get(c, "by=month&type=video"))

        assert [(s["key"], s["count"]) for s in shelves] == [
            ("2026-03", 1),
            ("2026-02", 4),
            ("2026-01", 2),
        ]
        assert [s["label"] for s in shelves] == ["2026-03", "2026-02", "2026-01"]

    def test_duration_buckets_cut_at_whole_seconds_and_skip_unknown(self, client):
        c, db, *_ = client
        _seed(db)

        shelves = _shelves(_get(c, "by=duration&type=video&sort=title&order=asc&per_shelf=10"))

        assert [s["key"] for s in shelves] == ["under_10m", "10_to_30m", "30m_plus"]
        assert [s["count"] for s in shelves] == [2, 2, 1]
        assert _names(shelves[0]) == ["a1.mp4", "x.mp4"]
        assert _names(shelves[1]) == ["a2.mp4", "b1.mp4"]
        assert _names(shelves[2]) == ["b2.mp4"]
        assert all(s["label"] == "" for s in shelves)
        listed = {name for s in shelves for name in _names(s)}
        assert "root.mp4" not in listed and "zero.mp4" not in listed

    def test_empty_fixed_shelves_are_omitted(self, client):
        c, db, *_ = client
        _seed(db)

        shelves = _shelves(_get(c, "by=duration&type=video&folder=Shows"))

        assert [s["key"] for s in shelves] == ["10_to_30m", "30m_plus"]

    def test_under_10m_key_equals_listing_duration_filter_without_unknown_duration(self, client):
        c, db, *_ = client
        rows = _seed(db)
        listing = c.get(
            f"/api/drives/{TEST_DRIVE}/files?limit=100&type=video&duration=lt:600"
        ).json()["data"]

        shelf = _shelves(_get(c, "by=duration&key=under_10m&type=video&per_shelf=60"))[0]

        known = {i["id"] for i in listing} - {rows["zero.mp4"].id}
        assert {i["id"] for i in shelf["items"]} == known
        assert rows["zero.mp4"].id in {i["id"] for i in listing}
        assert rows["a1.mp4"].id in {i["id"] for i in shelf["items"]}

    def test_a_folder_or_tag_named_like_a_fixed_key_does_not_collide(self, client):
        c, db, *_ = client
        _seed(db)

        shelf = _shelves(_get(c, "by=folder&key=no_tag&type=video"))[0]

        assert shelf["count"] == 0 and shelf["items"] == []


class TestWatchState:
    """SPEC-CORE-056 I4 and the viewer boundary."""

    def test_buckets_follow_the_viewers_own_rows(self, client):
        c, db, *_ = client
        _seed(db)

        shelves = _shelves(_get(c, "by=watch&type=video&sort=title&order=asc&per_shelf=10", ALICE))

        assert [s["key"] for s in shelves] == ["in_progress", "unwatched", "finished"]
        by = {s["key"]: s for s in shelves}
        assert sorted(_names(by["in_progress"])) == ["a1.mp4", "root.mp4"]
        assert _names(by["finished"]) == ["a2.mp4"]
        assert sorted(_names(by["unwatched"])) == ["b1.mp4", "b2.mp4", "x.mp4", "zero.mp4"]
        assert [s["count"] for s in shelves] == [2, 4, 1]

    def test_ninety_percent_is_finished_and_position_zero_or_duration_zero_is_unwatched(self, client):
        c, db, *_ = client
        _seed(db)

        by = _by_key(_get(c, "by=watch&type=video&per_shelf=10", ALICE))

        assert "a2.mp4" in _names(by["finished"])
        assert "b1.mp4" in _names(by["unwatched"])
        assert "b2.mp4" in _names(by["unwatched"])

    def test_another_viewers_history_does_not_move_a_file(self, client):
        c, db, *_ = client
        _seed(db)

        alice = _by_key(_get(c, "by=watch&type=video&per_shelf=10", ALICE))
        bob = _by_key(_get(c, "by=watch&type=video&per_shelf=10", BOB))

        assert "x.mp4" in _names(alice["unwatched"])
        assert "x.mp4" in _names(bob["finished"])
        assert "a1.mp4" in _names(alice["in_progress"])
        assert "a1.mp4" in _names(bob["finished"])

    def test_viewer_with_no_history_sees_everything_unwatched(self, client):
        c, db, *_ = client
        _seed(db)

        shelves = _shelves(_get(c, "by=watch&type=video", {"X-Lit-Viewer": "carol"}))

        assert [s["key"] for s in shelves] == ["unwatched"]
        assert shelves[0]["count"] == 7

    def test_watch_progress_comes_from_the_viewers_row(self, client):
        c, db, *_ = client
        _seed(db)

        by = _by_key(_get(c, "by=watch&type=video&per_shelf=10", ALICE))

        progress = {i["title"]: i.get("watch_progress") for i in by["in_progress"]["items"]}
        assert progress["a1.mp4"]["position"] == pytest.approx(100)
        assert progress["a1.mp4"]["duration"] == pytest.approx(599.9)
        no_row = {i["title"]: i.get("watch_progress") for i in by["unwatched"]["items"]}
        assert not no_row["x.mp4"]

    def test_last_played_orders_by_the_viewers_last_played_at(self, client):
        c, db, *_ = client
        _seed(db)

        desc = _shelves(
            _get(c, "by=watch&key=in_progress&sort=last_played&order=desc&per_shelf=12", ALICE)
        )[0]
        asc = _shelves(
            _get(c, "by=watch&key=in_progress&sort=last_played&order=asc&per_shelf=12", ALICE)
        )[0]

        assert _names(desc) == ["root.mp4", "a1.mp4"]
        assert _names(asc) == ["a1.mp4", "root.mp4"]

    def test_files_without_a_row_sort_after_files_with_one(self, client):
        c, db, *_ = client
        _seed(db)

        shelf = _shelves(
            _get(c, "by=watch&key=unwatched&type=video&sort=last_played&order=desc&per_shelf=12", ALICE)
        )[0]

        names = _names(shelf)
        assert set(names[:2]) == {"b1.mp4", "b2.mp4"}
        assert set(names[2:]) == {"x.mp4", "zero.mp4"}

    @pytest.mark.parametrize(
        "query",
        [
            "by=watch",
            "by=watch&key=in_progress&sort=last_played&per_shelf=12",
            "by=watch&sort=random&key=unwatched&per_shelf=12",
        ],
    )
    def test_without_a_viewer_it_is_400_viewer_required_and_no_files(self, client, query):
        c, db, *_ = client
        _seed(db)

        res = _get(c, query)

        assert res.status_code == 400
        assert "viewer_required" in str(res.json()["detail"])
        assert "a1.mp4" not in res.text


class TestPagingAndKeys:
    """SPEC-CORE-056 paging, I5."""

    def test_count_is_the_whole_shelf_not_the_items_length(self, client):
        c, db, *_ = client
        _seed(db)

        shelf = _by_key(_get(c, "by=folder&type=video&per_shelf=1"))["Shows"]

        assert shelf["count"] == 3
        assert len(shelf["items"]) == 1

    def test_default_per_shelf_is_five(self, client, ):
        c, db, drive_dir, _ = client
        for i in range(7):
            db.add(_file(f"v{i}.mp4", "Many", 60, _t(4, 1 + i)))
        db.commit()

        shelf = _shelves(_get(c, "by=folder&type=video"))[0]

        assert shelf["count"] == 7
        assert len(shelf["items"]) == 5

    def test_keyed_pages_partition_the_shelf_and_match_the_unkeyed_head(self, client):
        c, db, *_ = client
        _seed(db)
        order = "sort=created_at&order=asc&type=video"

        head = _by_key(_get(c, f"by=folder&per_shelf=2&{order}"))["Shows"]
        page1 = _shelves(_get(c, f"by=folder&key=Shows&per_shelf=2&page=1&{order}"))[0]
        page2 = _shelves(_get(c, f"by=folder&key=Shows&per_shelf=2&page=2&{order}"))[0]

        ids = [i["id"] for i in page1["items"]] + [i["id"] for i in page2["items"]]
        assert len(ids) == len(set(ids)) == page1["count"] == 3
        assert [i["id"] for i in head["items"]] == [i["id"] for i in page1["items"]]

    def test_page_past_the_last_page_is_an_empty_shelf(self, client):
        c, db, *_ = client
        _seed(db)

        res = _get(c, "by=folder&key=Shows&per_shelf=2&page=9&type=video")

        shelf = _shelves(res)[0]
        assert shelf["items"] == []
        assert shelf["count"] == 3

    def test_unknown_key_is_an_empty_shelf(self, client):
        c, db, *_ = client
        _seed(db)

        res = _get(c, "by=tag&key=nope&type=video")

        shelf = _shelves(res)[0]
        assert (shelf["count"], shelf["items"]) == (0, [])

    def test_keyed_request_reports_one_total_shelf_and_ignores_shelf_paging(self, client):
        c, db, *_ = client
        _seed(db)

        res = _get(c, "by=folder&key=Shows&shelf_limit=1&offset=5&type=video")

        assert res.json()["total_shelves"] == 1
        assert [s["key"] for s in _shelves(res)] == ["Shows"]

    def test_shelf_limit_and_offset_page_over_shelves(self, client):
        c, db, *_ = client
        _seed(db)

        first = _get(c, "by=folder&type=video&shelf_limit=2&offset=0")
        rest = _get(c, "by=folder&type=video&shelf_limit=2&offset=2")

        assert [s["key"] for s in _shelves(first)] == ["Shows", "Movies"]
        assert [s["key"] for s in _shelves(rest)] == ["", "Moviesx"]
        assert first.json()["total_shelves"] == rest.json()["total_shelves"] == 4

    def test_offset_past_the_last_shelf_is_empty_with_the_true_total(self, client):
        c, db, *_ = client
        _seed(db)

        res = _get(c, "by=folder&type=video&offset=99")

        assert res.status_code == 200
        assert res.json()["shelves"] == []
        assert res.json()["total_shelves"] == 4

    def test_empty_drive_has_no_shelves(self, client):
        c, *_ = client

        res = _get(c, "by=folder")

        assert res.status_code == 200
        assert res.json()["shelves"] == []
        assert res.json()["total_shelves"] == 0

    def test_per_shelf_and_shelf_limit_caps_are_accepted_at_the_boundary(self, client):
        c, db, *_ = client
        _seed(db)

        assert _get(c, "by=folder&per_shelf=60&shelf_limit=24").status_code == 200
        assert _get(c, "by=folder&per_shelf=1&shelf_limit=1").status_code == 200

    def test_random_without_page_returns_a_sample_of_the_shelf(self, client):
        c, db, *_ = client
        _seed(db)

        shelf = _shelves(
            _get(c, "by=watch&key=unwatched&type=video&sort=random&per_shelf=2", ALICE)
        )[0]

        assert shelf["count"] == 4
        assert len(shelf["items"]) == 2
        assert {n for n in _names(shelf)} <= {"b1.mp4", "b2.mp4", "x.mp4", "zero.mp4"}

    def test_every_sort_the_library_offers_orders_items(self, client):
        c, db, *_ = client
        rows = _seed(db)
        rows["b1.mp4"].file_size = 30
        rows["b2.mp4"].file_size = 20
        rows["zero.mp4"].file_size = 10
        db.commit()

        def order(sort, direction):
            shelf = _shelves(
                _get(c, f"by=folder&key=Shows&type=video&sort={sort}&order={direction}")
            )[0]
            return _names(shelf)

        assert order("title", "asc") == ["b1.mp4", "b2.mp4", "zero.mp4"]
        assert order("file_size", "desc") == ["b1.mp4", "b2.mp4", "zero.mp4"]
        assert order("file_size", "asc") == ["zero.mp4", "b2.mp4", "b1.mp4"]
        assert order("created_at", "desc") == ["zero.mp4", "b2.mp4", "b1.mp4"]


class TestFiltersAndState:
    """SPEC-CORE-056 filters, I1, I2."""

    def test_only_active_files_of_this_drive_are_counted_or_listed(self, client):
        c, db, *_ = client
        _seed(db)

        movies = _by_key(_get(c, "by=folder&per_shelf=20"))["Movies"]

        assert movies["count"] == 3
        names = _names(movies)
        assert "gone.mp4" not in names
        assert "bin.mp4" not in names
        assert "foreign.mp4" not in names

    def test_no_kind_condition_is_added_by_the_backend(self, client):
        c, db, *_ = client
        _seed(db)

        everything = _by_key(_get(c, "by=folder"))["Movies"]
        videos = _by_key(_get(c, "by=folder&type=video"))["Movies"]
        # The only image lies directly in Movies, so that folder is the base
        # and its own shelf takes the trailing-slash key.
        images = _by_key(_get(c, "by=folder&type=image"))["Movies/"]

        assert (everything["count"], videos["count"], images["count"]) == (3, 2, 1)

    @pytest.mark.parametrize(
        ("query", "expected"),
        [
            ("favorite=true", ["a2.mp4"]),
            ("tag=Trip&tag=2024", ["a2.mp4"]),
            ("tag=trip", ["a1.mp4", "a2.mp4"]),
            ("search=b1", ["b1.mp4"]),
            ("folder=Shows", ["b1.mp4", "b2.mp4", "zero.mp4"]),
            ("duration=lt:600", ["a1.mp4", "x.mp4", "zero.mp4"]),
        ],
    )
    def test_listing_filters_narrow_every_shelf(self, client, query, expected):
        c, db, *_ = client
        _seed(db)

        shelves = _shelves(_get(c, f"by=month&type=video&per_shelf=20&{query}"))

        assert sorted(n for s in shelves for n in _names(s)) == expected
        assert sum(s["count"] for s in shelves) == len(expected)

    def test_filters_agree_with_the_listing(self, client):
        c, db, *_ = client
        _seed(db)
        query = "type=video&folder=Movies&favorite=true"

        listing = c.get(f"/api/drives/{TEST_DRIVE}/files?limit=100&{query}").json()["data"]
        shelves = _shelves(_get(c, f"by=month&{query}"))

        assert sorted(i["id"] for s in shelves for i in s["items"]) == sorted(
            i["id"] for i in listing
        )

    def test_the_request_does_not_change_any_row(self, client):
        c, db, *_ = client
        _seed(db)
        before = (db.query(File).count(), db.query(WatchHistory).count(), db.query(Tag).count())

        for by in ("folder", "tag", "month", "duration", "watch"):
            assert _get(c, f"by={by}", ALICE).status_code == 200

        db.expire_all()
        after = (db.query(File).count(), db.query(WatchHistory).count(), db.query(Tag).count())
        assert after == before

    def test_unknown_drive_is_404(self, client):
        c, db, *_ = client
        _seed(db)
        listing = c.get("/api/drives/nowhere/files")

        res = _get(c, "by=folder", drive="nowhere")

        assert _get(c, "by=folder").status_code == 200
        assert res.status_code == 404
        assert res.json() == listing.json()

    def test_locked_drive_is_404_and_hides_its_files(self, tmp_path):
        drive_dir = tmp_path / "drives" / "secret"
        drive_dir.mkdir(parents=True)
        c, cleanup = _make_auth_client(
            tmp_path,
            passwords=[{"password": "pw", "groups": ["g"]}],
            drives=[{"name": "locked", "path": str(drive_dir), "access_group": "g"}],
        )
        try:
            locked = c.get("/api/drives/locked/shelves?by=folder")
            listing = c.get("/api/drives/locked/files")
            c.post("/api/auth/unlock", json={"password": "pw"})
            unlocked = c.get("/api/drives/locked/shelves?by=folder")

            assert locked.status_code == 404
            assert locked.json() == listing.json()
            assert unlocked.status_code == 200
        finally:
            cleanup()


class TestRejectedRequests:
    """SPEC-CORE-056 failure cases."""

    @pytest.mark.parametrize(
        "query",
        [
            "",
            "by=bogus",
            "by=folder&per_shelf=0",
            "by=folder&per_shelf=61",
            "by=folder&shelf_limit=0",
            "by=folder&shelf_limit=25",
            "by=folder&order=sideways",
            "by=folder&trust=bogus",
            "by=folder&page=1",
            "by=folder&key=Shows&page=1&sort=random",
            "by=folder&sort=last_played",
            "by=tag&key=&type=video",
            "by=watch&key=&type=video",
            "by=duration&key=",
            "by=month&key=",
        ],
        ids=lambda q: q or "no-by",
    )
    def test_malformed_requests_are_422(self, client, query):
        c, db, *_ = client
        _seed(db)

        assert _get(c, query, ALICE).status_code == 422

    @pytest.mark.parametrize(
        "query",
        ["size=garbage", "duration=garbage", "folder=../x"],
    )
    def test_filter_normalisation_errors_are_400_like_the_listing(self, client, query):
        c, db, *_ = client
        _seed(db)

        listing = c.get(f"/api/drives/{TEST_DRIVE}/files?{query}")
        res = _get(c, f"by=folder&{query}")

        assert listing.status_code == 400
        assert res.status_code == 400
