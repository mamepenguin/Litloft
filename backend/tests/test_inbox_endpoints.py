"""The drive inbox endpoints: SPEC-CORE-032.

List, count, done, undo and neighbors, including the cursor, the filter and
the drive boundary.
"""

import base64

import pytest

from tests.conftest import TEST_DRIVE
from tests.inbox_helpers import (
    CURSOR_RE,
    PROTECTED_DRIVE,
    SECOND_DRIVE,
    WIRE_TS_RE,
    broadcasts,
    configure_drives,
    create,
    drives_for,
    flush,
    only_inbox_events,
    parse_ts,
    row,
    rows,
    seed,
    set_missing,
    update_row,
)

T1 = "2026-01-01 00:00:01.000000"
T2 = "2026-01-01 00:00:02.000000"
T3 = "2026-01-01 00:00:03.000000"
T4 = "2026-01-01 00:00:04.000000"
T5 = "2026-01-01 00:00:05.000000"
UP_TO = "2026-01-01T00:00:03.000000Z"

DONE_TS = "2025-12-01 00:00:00.000000"


def _list(api, drive=TEST_DRIVE, **params):
    return api.get(f"/api/drives/{drive}/inbox", params=params)


def _count(api, drive=TEST_DRIVE):
    return api.get(f"/api/drives/{drive}/inbox/count")


def _done(api, body, drive=TEST_DRIVE):
    return api.post(f"/api/drives/{drive}/inbox/done", json=body)


def _undo(api, body, drive=TEST_DRIVE):
    return api.post(f"/api/drives/{drive}/inbox/undo", json=body)


def _neighbors(api, file_id, drive=TEST_DRIVE):
    return api.get(f"/api/drives/{drive}/inbox/{file_id}/neighbors")


def _b64(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")


@pytest.fixture()
def two_drives(client, tmp_path):
    c, db, drive_dir, _data_dir = client
    configure_drives(drives_for(client, tmp_path, [{"name": SECOND_DRIVE}]))
    return c, db, drive_dir, tmp_path / SECOND_DRIVE


@pytest.fixture()
def protected_drive(client, tmp_path):
    c, db, drive_dir, _data_dir = client
    configure_drives(
        drives_for(
            client, tmp_path, [{"name": PROTECTED_DRIVE, "access_group": "vip"}]
        )
    )
    return c, db, drive_dir


class TestInboxList:
    def test_list_answers_items_open_count_and_no_next(self, client):
        """SPEC-CORE-032 I5/I6: open rows newest first, with the drive's count."""
        c, db, drive_dir, _ = client
        older = seed(c, db, "older.md", arrived_at=T1)
        newer = seed(c, db, "newer.md", arrived_at=T2)

        r = _list(c)

        assert r.status_code == 200
        body = r.json()
        assert [item["file"]["id"] for item in body["items"]] == [newer, older]
        assert body["open_count"] == 2
        assert body["next"] is None
        item = body["items"][0]
        assert item["file"]["filename"] == "newer.md"
        assert item["source"] == "upload"
        assert item["source_i18n_key"] == "inbox.sourceUpload"
        assert WIRE_TS_RE.match(item["arrived_at"])

    def test_list_breaks_arrival_ties_by_file_id_desc(self, client):
        """SPEC-CORE-032 I6: equal arrivals order by file id, descending."""
        c, db, drive_dir, _ = client
        ids = [seed(c, db, f"tie-{index}.md", arrived_at=T1) for index in range(3)]

        body = _list(c).json()

        assert [item["file"]["id"] for item in body["items"]] == sorted(
            ids, reverse=True
        )

    def test_following_next_visits_every_row_exactly_once(self, client):
        """SPEC-CORE-032 I6: paging with next covers the list without repeats."""
        c, db, drive_dir, _ = client
        ids = [
            seed(c, db, f"page-{index}.md", arrived_at=stamp)
            for index, stamp in enumerate([T1, T2, T3, T4, T5])
        ]
        expected = list(reversed(ids))

        seen: list[str] = []
        cursor = None
        pages = 0
        while True:
            params = {"limit": 2}
            if cursor is not None:
                params["before"] = cursor
            body = _list(c, **params).json()
            assert body["open_count"] == 5
            seen.extend(item["file"]["id"] for item in body["items"])
            pages += 1
            cursor = body["next"]
            if cursor is None:
                break
            assert CURSOR_RE.match(cursor)

        assert seen == expected
        assert len(set(seen)) == 5
        assert pages == 3

    @pytest.mark.parametrize("limit", [1, 100])
    def test_list_accepts_the_limit_bounds(self, client, limit):
        """SPEC-CORE-032 §1: limit is 1 to 100."""
        c, db, drive_dir, _ = client
        seed(c, db, "only.md", arrived_at=T1)

        r = _list(c, limit=limit)

        assert r.status_code == 200
        assert len(r.json()["items"]) == 1

    @pytest.mark.parametrize("limit", [0, 101, "many"])
    def test_list_rejects_a_limit_outside_the_bounds(self, client, limit):
        """SPEC-CORE-032 §1: anything outside 1 to 100 is 422."""
        c, db, drive_dir, _ = client

        assert _list(c, limit=limit).status_code == 422

    @pytest.mark.parametrize(
        "cursor",
        [
            "!!!not-base64!!!",
            _b64("2026-01-01T00:00:00.000000Z"),
            _b64("nonsense|AAAAAAAAAAAA"),
        ],
        ids=["not-base64", "no-file-id", "unparsable-timestamp"],
    )
    def test_list_rejects_a_cursor_it_cannot_decode(self, client, cursor):
        """SPEC-CORE-032 §1: a cursor that is not timestamp and id is 422."""
        c, db, drive_dir, _ = client

        assert _list(c, before=cursor).status_code == 422

    def test_list_hides_rows_of_trashed_and_missing_files(self, client):
        """SPEC-CORE-032 I5: only active files are listed and counted."""
        c, db, drive_dir, _ = client
        trashed = seed(c, db, "trashed.md", arrived_at=T1)
        assert c.delete(f"/api/files/{trashed}").status_code == 200
        update_row(db, trashed, done_at=None)
        missing = seed(c, db, "missing.md", arrived_at=T2)
        set_missing(db, missing)
        done = seed(c, db, "done.md", arrived_at=T3)
        _done(c, {"file_ids": [done]})
        active = seed(c, db, "active.md", arrived_at=T4)

        body = _list(c).json()

        assert [item["file"]["id"] for item in body["items"]] == [active]
        assert body["open_count"] == 1
        assert _count(c).json() == {"open": 1}


class TestInboxCount:
    def test_count_answers_the_open_rows_of_active_files(self, client):
        """SPEC-CORE-032 I5: the count applies the list's filter."""
        c, db, drive_dir, _ = client
        seed(c, db, "a.md")
        seed(c, db, "b.md")
        missing = seed(c, db, "c.md")
        set_missing(db, missing)
        closed = seed(c, db, "d.md")
        _done(c, {"file_ids": [closed]})

        assert _count(c).json() == {"open": 2}

    def test_count_is_scoped_to_the_drive(self, two_drives):
        """SPEC-CORE-032 I5: another drive's rows are not counted."""
        c, db, drive_dir, second_dir = two_drives
        seed(c, db, "here.md")
        seed(c, db, "there.md", drive=SECOND_DRIVE)

        assert _count(c, TEST_DRIVE).json() == {"open": 1}
        assert _count(c, SECOND_DRIVE).json() == {"open": 1}


class TestInboxDone:
    def test_done_by_ids_closes_only_qualifying_rows(self, client):
        """SPEC-CORE-032 I7: only open rows of active files in this drive close."""
        c, db, drive_dir, _ = client
        target = seed(c, db, "target.md")
        already = seed(c, db, "already.md")
        update_row(db, already, done_at=DONE_TS)
        missing = seed(c, db, "missing.md")
        set_missing(db, missing)
        trashed = seed(c, db, "trashed.md")
        assert c.delete(f"/api/files/{trashed}").status_code == 200
        update_row(db, trashed, done_at=None)

        r = _done(
            c,
            {
                "file_ids": [
                    target,
                    already,
                    missing,
                    trashed,
                    "ZZZZZZZZZZZZ",
                ]
            },
        )

        assert r.status_code == 200
        body = r.json()
        assert body["done"] == 1
        assert WIRE_TS_RE.match(body["done_at"])
        assert parse_ts(row(db, target)["done_at"]) == parse_ts(body["done_at"])
        assert row(db, already)["done_at"] == DONE_TS
        assert row(db, missing)["done_at"] is None
        assert row(db, trashed)["done_at"] is None

    def test_done_does_not_touch_another_drive(self, two_drives):
        """SPEC-CORE-032 I7: done is per drive, not per file id."""
        c, db, drive_dir, second_dir = two_drives
        here = seed(c, db, "here.md")
        there = seed(c, db, "there.md", drive=SECOND_DRIVE)

        r = _done(c, {"file_ids": [here, there]})

        assert r.json()["done"] == 1
        assert row(db, there)["done_at"] is None

    def test_done_all_closes_rows_arrived_at_or_before_up_to(self, client):
        """SPEC-CORE-032 I7: all closes only rows arrived at or before up_to."""
        c, db, drive_dir, _ = client
        old = seed(c, db, "old.md", arrived_at=T1)
        edge = seed(c, db, "edge.md", arrived_at=T3)
        new = seed(c, db, "new.md", arrived_at=T4)

        r = _done(c, {"all": True, "up_to": UP_TO})

        assert r.status_code == 200
        assert r.json()["done"] == 2
        assert row(db, old)["done_at"] is not None
        assert row(db, edge)["done_at"] is not None
        assert row(db, new)["done_at"] is None

    def test_closing_a_done_row_keeps_its_done_at(self, client):
        """SPEC-CORE-032 I7: a close of a done row changes nothing."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md")
        first = _done(c, {"file_ids": [file_id]}).json()["done_at"]

        second = _done(c, {"file_ids": [file_id]})

        assert second.json()["done"] == 0
        assert row(db, file_id)["done_at"] == parse_ts(first).strftime(
            "%Y-%m-%d %H:%M:%S.%f"
        )

    @pytest.mark.parametrize(
        "body",
        [
            {},
            {"file_ids": []},
            {"file_ids": ["short"]},
            {"file_ids": ["A" * 12] * 1001},
            {"all": True},
            {"all": True, "up_to": "yesterday"},
            {"all": False, "up_to": UP_TO},
            {"all": True, "up_to": UP_TO, "file_ids": ["AAAAAAAAAAAA"]},
        ],
        ids=[
            "neither",
            "empty-ids",
            "malformed-id",
            "over-1000",
            "all-without-up-to",
            "unparsable-up-to",
            "all-false",
            "both",
        ],
    )
    def test_done_rejects_an_invalid_body(self, client, body):
        """SPEC-CORE-032 §3: exactly one of the two shapes, within the bounds."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md")

        r = _done(c, body)

        assert r.status_code == 422
        assert row(db, file_id)["done_at"] is None


class TestInboxUndo:
    def test_undo_reopens_the_rows_carrying_that_done_at(self, client):
        """SPEC-CORE-032 I7: undo reopens exactly those rows, keeping their arrival."""
        c, db, drive_dir, _ = client
        first = seed(c, db, "first.md", arrived_at=T1)
        second = seed(c, db, "second.md", arrived_at=T2)
        done = _done(c, {"file_ids": [first, second]}).json()
        before = {file_id: row(db, file_id) for file_id in (first, second)}

        r = _undo(c, {"done_at": done["done_at"]})

        assert r.status_code == 200
        assert r.json() == {"reopened": 2}
        for file_id in (first, second):
            after = row(db, file_id)
            assert after["done_at"] is None
            assert after["arrived_at"] == before[file_id]["arrived_at"]
            assert after["source"] == before[file_id]["source"]

    def test_undo_leaves_rows_whose_file_is_no_longer_active_done(self, client):
        """SPEC-CORE-032 I7: a row whose file was trashed since stays done."""
        c, db, drive_dir, _ = client
        active = seed(c, db, "active.md")
        trashed = seed(c, db, "trashed.md")
        done = _done(c, {"file_ids": [active, trashed]}).json()
        assert c.delete(f"/api/files/{trashed}").status_code == 200

        r = _undo(c, {"done_at": done["done_at"]})

        assert r.json() == {"reopened": 1}
        assert row(db, active)["done_at"] is None
        assert row(db, trashed)["done_at"] is not None

    def test_undo_with_an_unknown_timestamp_reopens_nothing(self, client):
        """SPEC-CORE-032 §2: reopened 0 when no row carries the timestamp."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md")
        _done(c, {"file_ids": [file_id]})

        r = _undo(c, {"done_at": "2025-01-01T00:00:00.000000Z"})

        assert r.status_code == 200
        assert r.json() == {"reopened": 0}
        assert row(db, file_id)["done_at"] is not None

    @pytest.mark.parametrize(
        "body", [{}, {"done_at": "nope"}, {"done_at": None}], ids=["missing", "junk", "null"]
    )
    def test_undo_rejects_an_unparsable_done_at(self, client, body):
        """SPEC-CORE-032 §4: an unparsable done_at is 422."""
        c, db, drive_dir, _ = client

        assert _undo(c, body).status_code == 422


class TestInboxNeighbors:
    def test_neighbors_walk_the_list_order(self, client):
        """SPEC-CORE-032 I15: prev/next/position/total follow the list order."""
        c, db, drive_dir, _ = client
        oldest = seed(c, db, "oldest.md", arrived_at=T1)
        middle = seed(c, db, "middle.md", arrived_at=T2)
        newest = seed(c, db, "newest.md", arrived_at=T3)

        first = _neighbors(c, newest).json()
        second = _neighbors(c, middle).json()
        last = _neighbors(c, oldest).json()

        assert first == {
            "prev_id": None,
            "next_id": middle,
            "position": 1,
            "total": 3,
        }
        assert second == {
            "prev_id": newest,
            "next_id": oldest,
            "position": 2,
            "total": 3,
        }
        assert last == {
            "prev_id": middle,
            "next_id": None,
            "position": 3,
            "total": 3,
        }

    def test_a_closed_row_keeps_its_place_without_a_position(self, client):
        """SPEC-CORE-032 I15: a row closed while viewed is placed, position null."""
        c, db, drive_dir, _ = client
        oldest = seed(c, db, "oldest.md", arrived_at=T1)
        middle = seed(c, db, "middle.md", arrived_at=T2)
        newest = seed(c, db, "newest.md", arrived_at=T3)
        _done(c, {"file_ids": [middle]})

        body = _neighbors(c, middle).json()

        assert body == {
            "prev_id": newest,
            "next_id": oldest,
            "position": None,
            "total": 2,
        }

    def test_a_file_without_a_row_answers_four_nulls(self, client):
        """SPEC-CORE-032 I15: no row in that drive means no neighbors."""
        c, db, drive_dir, _ = client
        seed(c, db, "arrived.md")
        plain = create(c, "plain.md", "x").json()["id"]

        body = _neighbors(c, plain).json()

        assert body == {
            "prev_id": None,
            "next_id": None,
            "position": None,
            "total": None,
        }

    def test_a_file_with_a_row_in_another_drive_answers_four_nulls(self, two_drives):
        """SPEC-CORE-032 I15: the row must be in the requested drive."""
        c, db, drive_dir, second_dir = two_drives
        elsewhere = seed(c, db, "elsewhere.md", drive=SECOND_DRIVE)

        body = _neighbors(c, elsewhere, TEST_DRIVE).json()

        assert body == {
            "prev_id": None,
            "next_id": None,
            "position": None,
            "total": None,
        }

    def test_neighbors_excludes_closed_and_inactive_rows_from_total(self, client):
        """SPEC-CORE-032 I15: the total counts the same rows the list shows."""
        c, db, drive_dir, _ = client
        target = seed(c, db, "target.md", arrived_at=T2)
        closed = seed(c, db, "closed.md", arrived_at=T3)
        missing = seed(c, db, "missing.md", arrived_at=T1)
        _done(c, {"file_ids": [closed]})
        set_missing(db, missing)

        body = _neighbors(c, target).json()

        assert body == {
            "prev_id": None,
            "next_id": None,
            "position": 1,
            "total": 1,
        }


class TestInboxAuthorization:
    def test_list_hides_a_locked_drive(self, protected_drive):
        """SPEC-CORE-032 I10: a locked drive answers 404, as every drive route does."""
        c, db, drive_dir = protected_drive

        assert _list(c, TEST_DRIVE).status_code == 200
        assert _list(c, PROTECTED_DRIVE).status_code == 404

    def test_count_hides_a_locked_drive(self, protected_drive):
        """SPEC-CORE-032 I10: a locked drive answers 404, as every drive route does."""
        c, db, drive_dir = protected_drive

        assert _count(c, TEST_DRIVE).status_code == 200
        assert _count(c, PROTECTED_DRIVE).status_code == 404

    def test_done_hides_a_locked_drive_and_stays_silent(
        self, protected_drive, broadcasts
    ):
        """SPEC-CORE-032 I10: a locked drive's done is 404 and changes nothing."""
        c, db, drive_dir = protected_drive
        assert _done(c, {"all": True, "up_to": UP_TO}, TEST_DRIVE).status_code == 200
        flush(c)
        broadcasts.clear()

        r = _done(c, {"all": True, "up_to": UP_TO}, PROTECTED_DRIVE)
        flush(c)

        assert r.status_code == 404
        assert only_inbox_events(broadcasts) == []

    def test_undo_hides_a_locked_drive_and_stays_silent(
        self, protected_drive, broadcasts
    ):
        """SPEC-CORE-032 I10: a locked drive's undo is 404 and changes nothing."""
        c, db, drive_dir = protected_drive
        assert _undo(c, {"done_at": UP_TO}, TEST_DRIVE).status_code == 200
        flush(c)
        broadcasts.clear()

        r = _undo(c, {"done_at": UP_TO}, PROTECTED_DRIVE)
        flush(c)

        assert r.status_code == 404
        assert only_inbox_events(broadcasts) == []

    def test_neighbors_hides_a_locked_drive(self, protected_drive):
        """SPEC-CORE-032 I10: a locked drive answers 404, as every drive route does."""
        c, db, drive_dir = protected_drive
        file_id = seed(c, db, "here.md")

        assert _neighbors(c, file_id, TEST_DRIVE).status_code == 200
        assert _neighbors(c, file_id, PROTECTED_DRIVE).status_code == 404


class TestInboxEndpointBroadcasts:
    def test_done_broadcasts_once_for_the_drive(self, client, broadcasts):
        """SPEC-CORE-032 I16: one inbox.updated per request that closes rows."""
        c, db, drive_dir, _ = client
        first = seed(c, db, "first.md")
        second = seed(c, db, "second.md")

        _done(c, {"file_ids": [first, second]})
        flush(c)

        assert only_inbox_events(broadcasts) == [
            ("inbox.updated", {"drive": TEST_DRIVE}, TEST_DRIVE)
        ]

    def test_done_broadcasts_nothing_when_no_row_closes(self, client, broadcasts):
        """SPEC-CORE-032 I16: never when no row changed."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md")
        _done(c, {"file_ids": [file_id]})
        flush(c)
        broadcasts.clear()

        r = _done(c, {"file_ids": [file_id]})
        flush(c)

        assert r.status_code == 200
        assert r.json()["done"] == 0
        assert only_inbox_events(broadcasts) == []

    def test_undo_broadcasts_once_when_a_row_reopens(self, client, broadcasts):
        """SPEC-CORE-032 I16: undo notifies once when it reopens anything."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md")
        done = _done(c, {"file_ids": [file_id]}).json()
        flush(c)
        broadcasts.clear()

        _undo(c, {"done_at": done["done_at"]})
        flush(c)

        assert only_inbox_events(broadcasts) == [
            ("inbox.updated", {"drive": TEST_DRIVE}, TEST_DRIVE)
        ]

    def test_undo_broadcasts_nothing_when_nothing_reopens(self, client, broadcasts):
        """SPEC-CORE-032 I16: never when no row changed."""
        c, db, drive_dir, _ = client

        r = _undo(c, {"done_at": "2025-01-01T00:00:00.000000Z"})
        flush(c)

        assert r.status_code == 200
        assert r.json() == {"reopened": 0}
        assert only_inbox_events(broadcasts) == []
