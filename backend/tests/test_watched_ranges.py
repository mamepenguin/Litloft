"""SPEC-CORE-141: ``watched_ranges`` on watch-history and shelf items.

Invariant ids (I7, I9) are those of docs/specs/watched-ranges-display.md.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, text

from app.main import app
from app.models import File, PlayedSegment, WatchHistory
from app.routers.progress import nickname_to_viewer_id
from tests.conftest import TEST_DRIVE

ALICE_COOKIE = {"lit_viewer": "alice"}
ALICE = {"X-Lit-Viewer": "alice"}

WATCH_SHELVES = "by=watch&type=video&per_shelf=60"


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _add_file(db, name: str, duration: float | None = 100.0) -> File:
    file = File(
        filename=name,
        title=name,
        drive=TEST_DRIVE,
        folder_path="",
        file_path=name,
        file_size=1,
        file_type="video",
        mime_type="video/mp4",
        duration=duration,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _watch(db, file: File, position: float, duration: float, nickname="alice", ago_h=1):
    db.add(
        WatchHistory(
            viewer_id=nickname_to_viewer_id(nickname),
            file_id=file.id,
            playback_position=position,
            duration=duration,
            last_played_at=_now() - timedelta(hours=ago_h),
        )
    )
    db.commit()


def _segments(db, file: File, totals: dict[int, float], nickname="alice"):
    viewer = nickname_to_viewer_id(nickname)
    db.add_all(
        PlayedSegment(
            viewer_id=viewer, file_id=file.id, segment_index=index, played_seconds=seconds
        )
        for index, seconds in totals.items()
    )
    db.commit()


def _history_items(c) -> dict[str, dict]:
    res = c.get(f"/api/drives/{TEST_DRIVE}/watch-history?limit=50", cookies=ALICE_COOKIE)
    assert res.status_code == 200, res.text
    return {item["id"]: item for item in res.json()["data"]}


def _shelf_items(res) -> list[dict]:
    assert res.status_code == 200, res.text
    return [item for shelf in res.json()["shelves"] for item in shelf["items"]]


def _shelf_items_by_id(c, query=WATCH_SHELVES) -> dict[str, dict]:
    res = c.get(f"/api/drives/{TEST_DRIVE}/shelves?{query}", headers=ALICE)
    return {item["id"]: item for item in _shelf_items(res)}


def _r(start: float, end: float) -> dict:
    return {"start": start, "end": end}


def _ranges(item: dict) -> list[tuple[float, float]]:
    return [(r["start"], r["end"]) for r in item["watched_ranges"]]


WORKED_SEGMENTS = {19: 4.0, 0: 5.0, 5: 12.5, 1: 5.0, 2: 2.0}
WORKED_RANGES = [(0, 15), (25, 30), (95, 100)]


class TestWorkedExample:
    """SPEC-CORE-141 worked example, on every list that carries watch_progress."""

    def test_spec_core_141_watch_history_item_carries_the_worked_example_ranges(self, client):
        c, db, *_ = client
        file = _add_file(db, "worked.mp4")
        _watch(db, file, 40, 100)
        _segments(db, file, WORKED_SEGMENTS)

        item = _history_items(c)[file.id]

        assert _ranges(item) == WORKED_RANGES

    def test_spec_core_141_watch_shelf_item_carries_the_worked_example_ranges(self, client):
        c, db, *_ = client
        file = _add_file(db, "worked.mp4")
        _watch(db, file, 40, 100)
        _segments(db, file, WORKED_SEGMENTS)

        item = _shelf_items_by_id(c)[file.id]

        assert item["watch_progress"]["duration"] == pytest.approx(100)
        assert _ranges(item) == WORKED_RANGES

    def test_spec_core_141_shelves_query_item_carries_the_worked_example_ranges(self, client):
        c, db, *_ = client
        file = _add_file(db, "worked.mp4")
        _watch(db, file, 40, 100)
        _segments(db, file, WORKED_SEGMENTS)

        res = c.post(
            f"/api/drives/{TEST_DRIVE}/shelves/query?{WATCH_SHELVES}",
            json={"file_ids": [file.id]},
            headers=ALICE,
        )
        items = {i["id"]: i for i in _shelf_items(res)}

        assert _ranges(items[file.id]) == WORKED_RANGES


class TestRuns:
    """SPEC-CORE-141 I7: how segment rows become runs."""

    @pytest.mark.parametrize(
        "watch_duration, totals, expected",
        [
            # A run crossing the duration is clipped to it.
            (97, {18: 5.0, 19: 5.0, 20: 5.0}, [(90, 97)]),
            # A run ending exactly at the duration is unchanged.
            (100, {19: 5.0}, [(95, 100)]),
            # A run starting exactly at the duration clips to nothing and is dropped.
            (95, {0: 5.0, 19: 5.0}, [(0, 5)]),
            # A run wholly past the duration is dropped.
            (97, {0: 5.0, 21: 5.0}, [(0, 5)]),
            # A row with played_seconds 0 is not watched and splits the run.
            (100, {0: 5.0, 1: 0.0, 2: 5.0}, [(0, 5), (10, 15)]),
            # Any played seconds count the segment whole.
            (100, {3: 0.25}, [(15, 20)]),
            # One-segment gap: two runs that neither overlap nor touch.
            (100, {0: 5.0, 2: 5.0}, [(0, 5), (10, 15)]),
            # Only zero rows: nothing watched.
            (100, {4: 0.0}, []),
        ],
        ids=[
            "crossing-clipped",
            "ends-at-duration",
            "starts-at-duration-dropped",
            "past-duration-dropped",
            "zero-row-splits",
            "partial-segment-whole",
            "gap-keeps-runs-apart",
            "only-zero-rows",
        ],
    )
    def test_spec_core_141_runs_are_merged_clipped_and_dropped(
        self, client, watch_duration, totals, expected
    ):
        c, db, *_ = client
        file = _add_file(db, "runs.mp4", duration=100.0)
        _watch(db, file, 40, watch_duration)
        _segments(db, file, totals)

        assert _ranges(_history_items(c)[file.id]) == expected

    def test_spec_core_141_clips_to_the_watch_progress_duration_not_the_files(self, client):
        c, db, *_ = client
        file = _add_file(db, "clip.mp4", duration=200.0)
        _watch(db, file, 40, 97)
        _segments(db, file, {19: 5.0, 30: 5.0})

        item = _history_items(c)[file.id]

        assert item["watch_progress"]["duration"] == pytest.approx(97)
        assert _ranges(item) == [(95, 97)]

    def test_spec_core_141_a_zero_watch_duration_clips_nothing(self, client):
        c, db, *_ = client
        file = _add_file(db, "zero.mp4", duration=100.0)
        _watch(db, file, 10, 0)
        _segments(db, file, {30: 5.0})

        item = _shelf_items_by_id(c)[file.id]

        assert "watch_progress" in item
        assert _ranges(item) == [(150, 155)]

    def test_spec_core_141_a_file_with_no_segments_has_an_empty_list(self, client):
        c, db, *_ = client
        file = _add_file(db, "none.mp4")
        _watch(db, file, 40, 100)

        item = _history_items(c)[file.id]

        assert item["watched_ranges"] == []

    def test_spec_core_141_ranges_are_the_requesting_viewers_only(self, client):
        c, db, *_ = client
        file = _add_file(db, "shared.mp4")
        _watch(db, file, 40, 100, nickname="alice")
        _watch(db, file, 40, 100, nickname="bob")
        _segments(db, file, {0: 5.0}, nickname="alice")
        _segments(db, file, {3: 5.0, 4: 5.0}, nickname="bob")

        assert _ranges(_history_items(c)[file.id]) == [(0, 5)]
        assert _ranges(_shelf_items_by_id(c)[file.id]) == [(0, 5)]

    def test_spec_core_141_each_file_gets_its_own_ranges(self, client):
        c, db, *_ = client
        a = _add_file(db, "a.mp4")
        b = _add_file(db, "b.mp4")
        _watch(db, a, 40, 100, ago_h=1)
        _watch(db, b, 40, 100, ago_h=2)
        _segments(db, a, {0: 5.0})
        _segments(db, b, {10: 5.0})

        items = _history_items(c)

        assert _ranges(items[a.id]) == [(0, 5)]
        assert _ranges(items[b.id]) == [(50, 55)]


class TestKeys:
    """SPEC-CORE-141 I7: the key travels with watch_progress and only with it."""

    def test_spec_core_141_watch_shelves_carry_ranges_exactly_where_they_carry_progress(
        self, client
    ):
        c, db, *_ = client
        watched = _add_file(db, "watched.mp4")
        _add_file(db, "never.mp4")
        _watch(db, watched, 40, 100)
        _segments(db, watched, {0: 5.0})

        items = _shelf_items(
            c.get(f"/api/drives/{TEST_DRIVE}/shelves?{WATCH_SHELVES}", headers=ALICE)
        )

        assert any("watch_progress" in i and "watched_ranges" in i for i in items)
        for item in items:
            assert ("watched_ranges" in item) == ("watch_progress" in item), item["title"]

    def test_spec_core_141_shelves_without_progress_carry_no_ranges_key(self, client):
        c, db, *_ = client
        watched = _add_file(db, "watched.mp4")
        _watch(db, watched, 40, 100)
        _segments(db, watched, {0: 5.0})

        assert _ranges(_shelf_items_by_id(c)[watched.id]) == [(0, 5)]

        folder_items = _shelf_items(
            c.get(f"/api/drives/{TEST_DRIVE}/shelves?by=folder&per_shelf=60", headers=ALICE)
        )
        assert folder_items
        for item in folder_items:
            assert "watch_progress" not in item
            assert "watched_ranges" not in item

    def test_spec_core_141_every_watch_history_item_carries_ranges(self, client):
        c, db, *_ = client
        a = _add_file(db, "a.mp4")
        b = _add_file(db, "b.mp4")
        _watch(db, a, 40, 100, ago_h=1)
        _watch(db, b, 40, 100, ago_h=2)
        _segments(db, a, {0: 5.0})

        items = _history_items(c)

        assert set(items) == {a.id, b.id}
        for item in items.values():
            assert "watch_progress" in item
            assert isinstance(item["watched_ranges"], list)


class TestReadOnly:
    """SPEC-CORE-141 I9: the reads write nothing and list the same files."""

    def test_spec_core_141_lists_write_nothing_and_keep_their_files(self, client):
        c, db, *_ = client
        a = _add_file(db, "a.mp4")
        b = _add_file(db, "b.mp4")
        _watch(db, a, 40, 100, ago_h=1)
        _watch(db, b, 40, 100, ago_h=2)
        _segments(db, a, WORKED_SEGMENTS)

        def snapshot():
            db.expire_all()
            return (
                db.execute(
                    text(
                        "SELECT viewer_id, file_id, playback_position, duration, last_played_at "
                        "FROM watch_history ORDER BY file_id"
                    )
                ).all(),
                db.execute(
                    text(
                        "SELECT viewer_id, file_id, segment_index, played_seconds "
                        "FROM played_segments ORDER BY file_id, segment_index"
                    )
                ).all(),
            )

        before = snapshot()
        res = c.get(f"/api/drives/{TEST_DRIVE}/watch-history?limit=50", cookies=ALICE_COOKIE)
        shelves = c.get(f"/api/drives/{TEST_DRIVE}/shelves?{WATCH_SHELVES}", headers=ALICE)

        assert [i["id"] for i in res.json()["data"]] == [a.id, b.id]
        assert _ranges(res.json()["data"][0]) == WORKED_RANGES
        assert _ranges({i["id"]: i for i in _shelf_items(shelves)}[a.id]) == WORKED_RANGES
        assert snapshot() == before


class TestOneQuery:
    """SPEC-CORE-141 step 2: one played_segments read per response."""

    @staticmethod
    def _count_segment_reads(db):
        statements: list[str] = []

        def record(conn, cursor, statement, parameters, context, executemany):
            if "played_segments" in statement.lower():
                statements.append(statement)

        engine = db.get_bind()
        event.listen(engine, "before_cursor_execute", record)
        return statements, lambda: event.remove(engine, "before_cursor_execute", record)

    @pytest.mark.parametrize(
        "request_kind",
        ["watch-history", "shelves", "shelves-query"],
    )
    def test_spec_core_141_one_segment_query_per_response(self, client, request_kind):
        c, db, *_ = client
        files = [_add_file(db, f"f{i}.mp4") for i in range(3)]
        for i, file in enumerate(files):
            _watch(db, file, 40, 100, ago_h=i + 1)
            _segments(db, file, {i: 5.0})

        statements, stop = self._count_segment_reads(db)
        try:
            if request_kind == "watch-history":
                res = c.get(
                    f"/api/drives/{TEST_DRIVE}/watch-history?limit=50", cookies=ALICE_COOKIE
                )
                items = res.json()["data"]
            elif request_kind == "shelves":
                items = _shelf_items(
                    c.get(f"/api/drives/{TEST_DRIVE}/shelves?{WATCH_SHELVES}", headers=ALICE)
                )
            else:
                items = _shelf_items(
                    c.post(
                        f"/api/drives/{TEST_DRIVE}/shelves/query?{WATCH_SHELVES}",
                        json={"file_ids": [f.id for f in files]},
                        headers=ALICE,
                    )
                )
        finally:
            stop()

        by_id = {i["id"]: i for i in items}
        for i, file in enumerate(files):
            assert _ranges(by_id[file.id]) == [(5 * i, 5 * i + 5)]
        assert len(statements) == 1, statements


class TestFailure:
    """SPEC-CORE-141 failure table: a failed ranges query fails the request."""

    @pytest.mark.parametrize(
        "path, kwargs",
        [
            (f"/api/drives/{TEST_DRIVE}/watch-history?limit=50", {"cookies": ALICE_COOKIE}),
            (f"/api/drives/{TEST_DRIVE}/shelves?{WATCH_SHELVES}", {"headers": ALICE}),
        ],
        ids=["watch-history", "shelves"],
    )
    def test_spec_core_141_a_failed_ranges_query_is_500_and_writes_nothing(
        self, client, path, kwargs
    ):
        c, db, *_ = client
        file = _add_file(db, "f.mp4")
        _watch(db, file, 40, 100)
        db.execute(text("DROP TABLE played_segments"))
        db.commit()

        def history_rows():
            db.expire_all()
            return db.execute(
                text("SELECT playback_position, duration, last_played_at FROM watch_history")
            ).all()

        before = history_rows()
        plain = TestClient(app, raise_server_exceptions=False)
        res = plain.get(path, **kwargs)

        assert res.status_code == 500
        assert history_rows() == before

    def test_spec_core_141_a_failed_ranges_query_on_shelves_is_logged_like_any_shelves_failure(
        self, client, caplog
    ):
        c, db, *_ = client
        file = _add_file(db, "f.mp4")
        _watch(db, file, 40, 100)
        db.execute(text("DROP TABLE played_segments"))
        db.commit()

        plain = TestClient(app, raise_server_exceptions=False)
        with caplog.at_level("ERROR"):
            res = plain.get(f"/api/drives/{TEST_DRIVE}/shelves?{WATCH_SHELVES}", headers=ALICE)

        assert res.status_code == 500
        assert any("Shelves failed" in r.getMessage() for r in caplog.records)
