"""Acceptance guard for SPEC-CORE-039 I18: the drive listing is unchanged.

The tag, kind, favourite and liked predicates move into a shared helper, so
this pins the answers they gave before the move: the same ids, in the same
order, with the same total.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models import File, Tag
from tests.conftest import TEST_DRIVE

OTHER_DRIVE = "elsewhere"


def _at(day: int) -> datetime:
    return datetime(2026, 1, day, tzinfo=UTC)


def _seed(db) -> dict[str, File]:
    trip = Tag(name="Trip", drive=TEST_DRIVE)
    year = Tag(name="2024", drive=TEST_DRIVE)
    # A tag row that belongs to another drive. A file moved before its tags
    # followed links to the old drive's row, and the listing folds over all
    # Tag rows rather than narrowing them to this drive.
    shared = Tag(name="Shared", drive=OTHER_DRIVE)
    db.add_all([trip, year, shared])

    rows = [
        ("a-trip.mp4", 1, "video", "video/mp4", [trip], False, False, {}),
        ("b-both.pdf", 2, "document", "application/pdf", [trip, year], True, True, {}),
        ("c-year.md", 3, "document", "text/markdown", [year], False, True, {}),
        ("d-shared.mp4", 4, "video", "video/mp4", [shared], True, False, {}),
        ("e-missing.mp4", 5, "video", "video/mp4", [trip], False, False, {"missing": True}),
        ("f-trashed.mp4", 6, "video", "video/mp4", [trip], False, False, {"deleted": True}),
    ]
    seeded: dict[str, File] = {}
    for name, day, file_type, mime, tags, favorite, liked, state in rows:
        file = File(
            filename=name,
            title=name,
            drive=TEST_DRIVE,
            folder_path="",
            file_path=name,
            file_size=1,
            file_type=file_type,
            mime_type=mime,
            is_favorite=favorite,
            liked_at=_at(day) if liked else None,
            created_at=_at(day),
            missing_since=_at(day) if state.get("missing") else None,
            deleted_at=_at(day) if state.get("deleted") else None,
        )
        file.tags.extend(tags)
        db.add(file)
        seeded[name] = file
    db.commit()
    return seeded


class TestListingFiltersAreUnchanged:
    """SPEC-CORE-039 I18."""

    ROWS = [
        ("no filters", "", ["d-shared.mp4", "c-year.md", "b-both.pdf", "a-trip.mp4"]),
        ("a tag", "tag=Trip", ["b-both.pdf", "a-trip.mp4"]),
        ("a tag folded case-insensitively", "tag=trip", ["b-both.pdf", "a-trip.mp4"]),
        ("two tags are AND", "tag=Trip&tag=2024", ["b-both.pdf"]),
        ("an empty tag name is dropped", "tag=Trip&tag=", ["b-both.pdf", "a-trip.mp4"]),
        ("only an empty tag name lists everything", "tag=", ["d-shared.mp4", "c-year.md", "b-both.pdf", "a-trip.mp4"]),
        ("a tag folded across drives", "tag=shared", ["d-shared.mp4"]),
        ("type=markdown reads as text", "type=markdown", ["c-year.md"]),
        ("type=text", "type=text", ["c-year.md"]),
        ("a repeated tag", "tag=Trip&tag=Trip", ["b-both.pdf", "a-trip.mp4"]),
        ("favorite", "favorite=true", ["d-shared.mp4", "b-both.pdf"]),
        ("liked", "liked=true", ["c-year.md", "b-both.pdf"]),
        ("every filter at once", "tag=2024&type=document&favorite=true&liked=true", ["b-both.pdf"]),
        ("a tag that names nothing", "tag=nowhere", []),
        ("video that is not a favorite", "type=video&favorite=false", ["a-trip.mp4"]),
        ("two kinds are OR", "type=video&type=image", ["d-shared.mp4", "a-trip.mp4"]),
    ]

    @pytest.mark.parametrize(
        ("query", "titles"),
        [(row[1], row[2]) for row in ROWS],
        ids=[row[0] for row in ROWS],
    )
    def test_ids_order_and_total(self, client, query, titles):
        c, db, _drive_dir, _data_dir = client
        seeded = _seed(db)

        res = c.get(f"/api/drives/{TEST_DRIVE}/files?limit=100&{query}")

        assert res.status_code == 200, res.text
        body = res.json()
        assert [item["title"] for item in body["data"]] == titles
        assert [item["id"] for item in body["data"]] == [
            seeded[title].id for title in titles
        ]
        assert body["meta"]["total"] == len(titles)
