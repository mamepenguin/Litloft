"""Acceptance tests for SPEC-CORE-039: POST /api/internal/files/matching.

The endpoint resolves a search filter to a drive's active file ids. I1 holds
it to the listing's own predicates; I10 and I12 hold the request contract.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

import app.config as config
from app.models import File, Tag
from tests.conftest import TEST_DRIVE

URL = "/api/internal/files/matching"
OTHER_DRIVE = "elsewhere"


def _at(day: int) -> datetime:
    return datetime(2026, 1, day, tzinfo=UTC)


def _tag(db, name: str, drive: str = TEST_DRIVE) -> Tag:
    tag = Tag(name=name, drive=drive)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def _file(
    db,
    name: str,
    *,
    file_type: str = "video",
    mime_type: str = "video/mp4",
    tags: list[Tag] | None = None,
    favorite: bool = False,
    liked: bool = False,
    drive: str = TEST_DRIVE,
    day: int = 1,
    deleted: bool = False,
    missing: bool = False,
) -> File:
    file = File(
        filename=name,
        title=name,
        drive=drive,
        folder_path="",
        file_path=name,
        file_size=1,
        file_type=file_type,
        mime_type=mime_type,
        is_favorite=favorite,
        liked_at=_at(day) if liked else None,
        created_at=_at(day),
        deleted_at=_at(day) if deleted else None,
        missing_since=_at(day) if missing else None,
    )
    file.tags.extend(tags or [])
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _match(c, *, drive: str = TEST_DRIVE, **conditions):
    body = {"drive": drive, **conditions}
    return c.post(URL, json=body)


@pytest.fixture()
def corpus(client):
    """One active file per interesting condition, plus the rows I1 excludes."""
    _c, db, _drive_dir, _data_dir = client
    meeting = _tag(db, "会議")
    budget = _tag(db, "予算")
    shared = _tag(db, "Shared", drive=OTHER_DRIVE)

    video = _file(db, "a.mp4", tags=[meeting], day=1)
    pdf = _file(
        db,
        "b.pdf",
        file_type="document",
        mime_type="application/pdf",
        tags=[meeting, budget],
        favorite=True,
        liked=True,
        day=2,
    )
    text = _file(
        db,
        "c.md",
        file_type="document",
        mime_type="text/markdown",
        tags=[budget],
        liked=True,
        day=3,
    )
    image = _file(
        db, "d.png", file_type="image", mime_type="image/png", favorite=True, day=4
    )
    archive = _file(
        db, "e.zip", file_type="archive", mime_type="application/zip", tags=[meeting], day=5
    )
    folded = _file(db, "f.mp4", tags=[shared], day=6)

    gone = _file(db, "gone.mp4", tags=[meeting], missing=True, day=7)
    trashed = _file(db, "trashed.mp4", tags=[meeting], deleted=True, day=8)
    elsewhere = _file(db, "other.mp4", tags=[meeting], drive=OTHER_DRIVE, day=9)

    return {
        "active": [video, pdf, text, image, archive, folded],
        "excluded": [gone, trashed, elsewhere],
        "video": video,
        "pdf": pdf,
        "text": text,
        "image": image,
        "archive": archive,
        "folded": folded,
    }


class TestMatchingIsTheListing:
    """SPEC-CORE-039 I1: the ids are exactly the listing's active ids."""

    ROWS = [
        ("no conditions", {}, ["video", "pdf", "text", "image", "archive", "folded"]),
        ("one tag", {"tags": ["会議"]}, ["video", "pdf", "archive"]),
        ("two tags are AND", {"tags": ["会議", "予算"]}, ["pdf"]),
        ("an empty tag name is dropped", {"tags": ["会議", ""]}, ["video", "pdf", "archive"]),
        ("a tag folded across drives", {"tags": ["shared"]}, ["folded"]),
        ("one kind", {"kinds": ["video"]}, ["video", "folded"]),
        ("document holds its nested kinds", {"kinds": ["document"]}, ["pdf", "text"]),
        ("a nested kind", {"kinds": ["pdf"]}, ["pdf"]),
        ("text by its own name", {"kinds": ["text"]}, ["text"]),
        ("markdown is text", {"kinds": ["markdown"]}, ["text"]),
        ("kinds are OR", {"kinds": ["video", "image"]}, ["video", "image", "folded"]),
        ("favorite true", {"favorite": True}, ["pdf", "image"]),
        ("favorite false", {"favorite": False}, ["video", "text", "archive", "folded"]),
        ("liked true", {"liked": True}, ["pdf", "text"]),
        ("liked false", {"liked": False}, ["video", "image", "archive", "folded"]),
        (
            "every condition at once",
            {"tags": ["会議"], "kinds": ["document"], "favorite": True, "liked": True},
            ["pdf"],
        ),
        ("a tag that names nothing", {"tags": ["nowhere"]}, []),
        (
            "a kind and a tag that never meet",
            {"tags": ["予算"], "kinds": ["video"]},
            [],
        ),
    ]

    @pytest.mark.parametrize(
        ("conditions", "expected"),
        [(row[1], row[2]) for row in ROWS],
        ids=[row[0] for row in ROWS],
    )
    def test_returns_the_listing_ids_sorted(self, client, corpus, conditions, expected):
        c, _db, _drive_dir, _data_dir = client
        wanted = sorted(corpus[name].id for name in expected)

        res = _match(c, **conditions)

        assert res.status_code == 200, res.text
        body = res.json()
        assert body["file_ids"] == wanted
        assert body["file_ids"] == sorted(body["file_ids"])

    @pytest.mark.parametrize(
        ("conditions", "expected"),
        [(row[1], row[2]) for row in ROWS],
        ids=[row[0] for row in ROWS],
    )
    def test_listing_agrees_for_the_same_conditions(
        self, client, corpus, conditions, expected
    ):
        c, _db, _drive_dir, _data_dir = client
        params: list[tuple[str, str]] = [("limit", "100")]
        for tag in conditions.get("tags", []):
            params.append(("tag", tag))
        for kind in conditions.get("kinds", []):
            params.append(("type", kind))
        if "favorite" in conditions:
            params.append(("favorite", str(conditions["favorite"]).lower()))
        if "liked" in conditions:
            params.append(("liked", str(conditions["liked"]).lower()))

        listing = c.get(f"/api/drives/{TEST_DRIVE}/files", params=params)
        assert listing.status_code == 200, listing.text
        listed = [item["id"] for item in listing.json()["data"]]

        matched = _match(c, **conditions).json()["file_ids"]

        assert sorted(listed) == matched
        assert listing.json()["meta"]["total"] == len(matched)

    def test_never_returns_a_missing_trashed_or_other_drive_file(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        returned = set(_match(c).json()["file_ids"])

        for file in corpus["excluded"]:
            assert file.id not in returned

    def test_defaults_to_every_active_file(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = c.post(URL, json={"drive": TEST_DRIVE})

        assert res.status_code == 200, res.text
        assert len(res.json()["file_ids"]) == 6

    def test_answers_only_file_ids(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        body = _match(c).json()

        assert list(body) == ["file_ids"]
        assert all(isinstance(file_id, str) for file_id in body["file_ids"])


class TestRequestCaps:
    """SPEC-CORE-039 I10: the caps the listing already lives within."""

    def test_twenty_one_tags_are_rejected(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _match(c, tags=[f"t{i}" for i in range(21)])

        assert res.status_code == 422

    def test_twenty_tags_are_accepted(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _match(c, tags=[f"t{i}" for i in range(20)])

        assert res.status_code == 200, res.text

    def test_the_cap_counts_tags_after_case_insensitive_deduplication(
        self, client, corpus
    ):
        c, _db, _drive_dir, _data_dir = client
        tags = [f"t{i}" for i in range(20)] + ["T0"]

        res = _match(c, tags=tags)

        assert res.status_code == 200, res.text

    @pytest.mark.parametrize(
        "tags",
        [
            [f"t{i}" for i in range(19)] + ["stra\u00dfe", "STRASSE"],
            ["\u0130" * 101, "i\u0307" * 101],
        ],
        ids=["casefold-only-pair-is-two-tags", "long-duplicate-checked-before-dedup"],
    )
    def test_fold_sensitive_tags_match_the_addon_validator(
        self, client, corpus, tags
    ):
        c, _db, _drive_dir, _data_dir = client

        res = _match(c, tags=tags)

        assert res.status_code == 422

    def test_empty_tag_names_do_not_count_towards_the_cap(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client
        tags = [""] * 5 + [f"t{i}" for i in range(20)]

        res = _match(c, tags=tags)

        assert res.status_code == 200, res.text

    @pytest.mark.parametrize(
        ("length", "status"),
        [(200, 200), (201, 422)],
        ids=["200-characters", "201-characters"],
    )
    def test_a_tag_length_cap_of_two_hundred(self, client, corpus, length, status):
        c, _db, _drive_dir, _data_dir = client

        res = _match(c, tags=["x" * length])

        assert res.status_code == status

    @pytest.mark.parametrize(
        "kinds",
        [
            ["video", "image", "audio", "document", "archive", "other", "text", "pdf"],
            ["video"] * 9,
            ["markdown"],
            ["markdown", "text"],
        ],
        ids=["eight-kinds", "duplicates-dedup", "markdown-alias", "markdown-is-text"],
    )
    def test_valid_kind_lists_are_accepted(self, client, corpus, kinds):
        c, _db, _drive_dir, _data_dir = client

        res = _match(c, kinds=kinds)

        assert res.status_code == 200, res.text

    @pytest.mark.parametrize(
        "kinds",
        [["bogus"], ["video", "bogus"], [""]],
        ids=["unknown", "unknown-beside-known", "empty-name"],
    )
    def test_an_unknown_kind_is_rejected(self, client, corpus, kinds):
        c, _db, _drive_dir, _data_dir = client

        res = _match(c, kinds=kinds)

        assert res.status_code == 422

    @pytest.mark.parametrize(
        "body",
        [
            {"drive": TEST_DRIVE, "tags": "会議"},
            {"drive": TEST_DRIVE, "kinds": "video"},
            {"drive": TEST_DRIVE, "favorite": "yes"},
            {"drive": TEST_DRIVE, "liked": 1},
        ],
        ids=["tags-not-a-list", "kinds-not-a-list", "favorite-not-a-bool", "liked-not-a-bool"],
    )
    def test_wrong_types_are_rejected(self, client, corpus, body):
        c, _db, _drive_dir, _data_dir = client

        res = c.post(URL, json=body)

        assert res.status_code == 422

    def test_markdown_answers_the_same_ids_as_text(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        alias = _match(c, kinds=["markdown"]).json()["file_ids"]
        own_name = _match(c, kinds=["text"]).json()["file_ids"]

        assert alias == own_name


class TestDriveContract:
    """SPEC-CORE-039 I12: unknown drives, and locked drives without a cookie."""

    def test_an_unknown_drive_is_404(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _match(c, drive="no-such-drive")

        assert res.status_code == 404

    def test_a_password_protected_drive_answers_without_a_viewer_credential(
        self, client, corpus
    ):
        c, db, drive_dir, _data_dir = client
        protected = _file(db, "locked.mp4", day=10)
        config.DRIVES_CONFIG.write_text(
            json.dumps(
                [
                    {
                        "name": TEST_DRIVE,
                        "path": str(drive_dir),
                        "access_group": "family",
                    }
                ]
            )
        )
        config._drives_cache = None

        listing = c.get(f"/api/drives/{TEST_DRIVE}/files?limit=100")
        res = _match(c)

        assert listing.status_code == 404
        assert res.status_code == 200, res.text
        assert protected.id in res.json()["file_ids"]
