"""SPEC-CORE-148 I1 as revised: the order of the tag-counts answer and its names.

The acceptance tests pin the counts; these hold the ordering rule (count
descending, then `str.casefold` of the name, then code point) and the spelling
chosen among this drive's several spellings of one group.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models import File, Tag, WatchHistory
from app.routers.progress import nickname_to_viewer_id
from tests.conftest import TEST_DRIVE

ALICE = {"X-Lit-Viewer": "alice"}


def _tag(db, name: str, drive: str = TEST_DRIVE) -> Tag:
    row = db.query(Tag).filter(Tag.drive == drive, Tag.name == name).first()
    if row is None:
        row = Tag(name=name, drive=drive)
        db.add(row)
        db.flush()
    return row


def _file(db, path: str, names=()) -> File:
    row = File(
        filename=path,
        title=path,
        drive=TEST_DRIVE,
        folder_path="",
        file_path=path,
        file_size=1,
        file_type="video",
        mime_type="video/mp4",
        duration=1000,
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    row.tags.extend(_tag(db, name) for name in names)
    db.add(row)
    db.commit()
    return row


def _counts(c, params=(), headers=None) -> list[tuple[str, int]]:
    res = c.get(
        f"/api/drives/{TEST_DRIVE}/tag-counts", params=list(params), headers=headers or {}
    )
    assert res.status_code == 200, res.text
    return [(entry["name"], entry["count"]) for entry in res.json()]


class TestOrder:
    def test_equal_counts_are_ordered_by_name_ignoring_case(self, client):
        c, db, *_ = client
        _file(db, "a.mp4", ["apple", "Banana"])
        _file(db, "b.mp4", ["apple"])
        _file(db, "c.mp4", ["Banana", "cherry"])
        _file(db, "d.mp4", ["cherry"])

        assert _counts(c) == [("apple", 2), ("Banana", 2), ("cherry", 2)]

    def test_names_that_casefold_alike_are_ordered_by_code_point(self, client):
        c, db, *_ = client
        # Seeded against the expected order, so a sort key without the code
        # point cannot pass by keeping the rows' own order.
        _file(db, "b.mp4", ["ß"])
        _file(db, "a.mp4", ["ss"])

        assert _counts(c) == [("ss", 1), ("ß", 1)]


class TestSpelling:
    def test_two_spellings_this_drive_holds_answer_the_first_in_order(self, client):
        c, db, *_ = client
        _file(db, "a.mp4", ["Über"])
        _file(db, "b.mp4", ["über"])

        assert _counts(c) == [("Über", 2)]

    def test_this_drives_spelling_wins_over_another_drives_earlier_one(self, client):
        c, db, *_ = client
        moved = _file(db, "a.mp4", ["trip"])
        moved.tags.append(_tag(db, "TRIP", "elsewhere"))
        db.commit()

        assert _counts(c) == [("trip", 1)]


class TestIgnoredViewerFilter:
    def test_opened_is_ignored_like_an_unknown_parameter(self, client):
        c, db, *_ = client
        watched = _file(db, "a.mp4", ["seen"])
        _file(db, "b.mp4", ["unseen"])
        db.add(
            WatchHistory(
                viewer_id=nickname_to_viewer_id("alice"),
                file_id=watched.id,
                playback_position=500,
                duration=1000,
                last_played_at=datetime(2026, 5, 2, tzinfo=UTC),
            )
        )
        db.commit()

        plain = _counts(c, [("type", "video")], ALICE)
        assert _counts(c, [("type", "video"), ("opened", "true")], ALICE) == plain
        assert _counts(c, [("type", "video"), ("opened", "true")]) == plain
