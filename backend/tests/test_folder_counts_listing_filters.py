"""SPEC-CORE-130: `folder-counts` under the file listing's filters, and its `POST …/query` form.

Invariant ids are those of docs/specs/notes-app.md. Where a count can be stated
as an equality with the listing (I14), the expected answer is derived from
`files` / `files/query` for the same parameters, and the path set is also
pinned by hand so a listing and a count that drift together still fail.
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

import pytest

from app.models import Collection, CollectionItem, File, Tag
from tests.conftest import TEST_DRIVE
from tests.test_target_drive_access import LOCKED_DRIVE, OPEN_DRIVE, two_drives  # noqa: F401

OTHER_DRIVE = "elsewhere"


def _at(day: int) -> datetime:
    return datetime(2026, 5, day, tzinfo=UTC)


def _tag(db, drive: str, name: str) -> Tag:
    tag = db.query(Tag).filter(Tag.drive == drive, Tag.name == name).first()
    if tag is None:
        tag = Tag(name=name, drive=drive)
        db.add(tag)
        db.flush()
    return tag


def _file(
    db,
    path: str,
    *,
    drive: str = TEST_DRIVE,
    mime: str = "text/markdown",
    file_type: str = "document",
    size: int = 1,
    duration: float | None = None,
    tags=(),
    favorite: bool = False,
    liked: bool = False,
    origin: str | None = None,
    deleted: bool = False,
    missing: bool = False,
    day: int = 1,
) -> File:
    *folders, filename = path.split("/")
    row = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="/".join(folders),
        file_path=path,
        file_size=size,
        file_type=file_type,
        mime_type=mime,
        duration=duration,
        is_favorite=favorite,
        liked_at=_at(day) if liked else None,
        md_origin=origin,
        created_at=_at(day),
        deleted_at=_at(day) if deleted else None,
        missing_since=_at(day) if missing else None,
    )
    for name in tags:
        row.tags.append(_tag(db, drive, name))
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
    rows = {
        "root.md": _file(db, "root.md", tags=["trip"], favorite=True, day=1),
        "j/a.md": _file(db, "Journal/a.md", tags=["trip", "food"], liked=True, day=2),
        "j/b.md": _file(db, "Journal/b.md", tags=["food"], size=5000, day=3),
        "j/c.txt": _file(db, "Journal/c.txt", mime="text/plain", tags=["trip"], favorite=True, day=4),
        "j/clip.md": _file(db, "Journal/clip.md", tags=["trip"], origin="webclip", day=5),
        "j/2026/d.md": _file(db, "Journal/2026/d.md", tags=["trip", "food"], size=9000, day=6),
        "w/e.md": _file(db, "Work/e.md", tags=["food"], favorite=True, liked=True, day=7),
        "w/clip2.md": _file(db, "Work/clip2.md", origin="webclip", day=8),
        "w/doc.pdf": _file(db, "Work/doc.pdf", mime="application/pdf", tags=["trip"], size=7000, day=9),
        "v/long.mp4": _file(db, "Videos/long.mp4", mime="video/mp4", file_type="video", duration=3600, tags=["trip"], day=10),
        "v/short.mp4": _file(db, "Videos/short.mp4", mime="video/mp4", file_type="video", duration=30, day=11),
        "j/gone.md": _file(db, "Journal/gone.md", tags=["trip"], deleted=True, day=12),
        "j/lost.md": _file(db, "Journal/lost.md", tags=["trip"], missing=True, day=13),
        "foreign.md": _file(db, "Journal/foreign.md", drive=OTHER_DRIVE, tags=["trip"], day=14),
    }
    _collection(db, "Picks", [rows["j/a.md"], rows["j/2026/d.md"], rows["w/e.md"], rows["j/gone.md"]])
    _collection(db, "Also", [rows["j/a.md"], rows["root.md"]])
    _collection(db, "Picks", [rows["foreign.md"]], drive=OTHER_DRIVE)
    return rows


def _counts_get(c, params: list[tuple[str, str]], drive: str = TEST_DRIVE):
    return c.get(f"/api/drives/{drive}/folder-counts", params=params)


def _counts_post(c, params: list[tuple[str, str]], body, drive: str = TEST_DRIVE):
    return c.post(f"/api/drives/{drive}/folder-counts/query", params=params, json=body)


def _ok(res):
    assert res.status_code == 200, res.text
    return res.json()


def _listing(c, params, body=None) -> list[dict]:
    """Every row the listing returns for these parameters (the whole drive)."""
    base = [*params, ("limit", "500")]
    if body is None:
        res = c.get(f"/api/drives/{TEST_DRIVE}/files", params=base)
    else:
        res = c.post(f"/api/drives/{TEST_DRIVE}/files/query", params=base, json=body)
    return _ok(res)["data"]


def _listing_total_at(c, params, path: str, body=None) -> int:
    base = [*params, ("path", path), ("limit", "1")]
    if body is None:
        res = c.get(f"/api/drives/{TEST_DRIVE}/files", params=base)
    else:
        res = c.post(f"/api/drives/{TEST_DRIVE}/files/query", params=base, json=body)
    return _ok(res)["meta"]["total"]


# (label, listing parameters, the path -> count answer pinned by hand)
FILTER_CASES = [
    (
        "a tag",
        [("type", "text"), ("exclude_origin", "webclip"), ("tag", "trip")],
        {"": 1, "Journal": 2, "Journal/2026": 1},
    ),
    (
        "two tags are AND, a file with both counted once",
        [("type", "text"), ("tag", "trip"), ("tag", "food")],
        {"Journal": 1, "Journal/2026": 1},
    ),
    (
        "favorite",
        [("type", "text"), ("favorite", "true")],
        {"": 1, "Journal": 1, "Work": 1},
    ),
    (
        "liked",
        [("type", "text"), ("liked", "true")],
        {"Journal": 1, "Work": 1},
    ),
    (
        "search on title",
        [("type", "text"), ("exclude_origin", "webclip"), ("search", "e.md")],
        {"Work": 1},
    ),
    (
        "a folder subtree",
        [("type", "text"), ("exclude_origin", "webclip"), ("folder", "Journal")],
        {"Journal": 3, "Journal/2026": 1},
    ),
    (
        "a collection",
        [("type", "text"), ("exclude_origin", "webclip"), ("collection", "Picks")],
        {"Journal": 1, "Journal/2026": 1, "Work": 1},
    ),
    (
        "two collections sharing a file count it once",
        [("type", "text"), ("collection", "Picks"), ("collection", "Also")],
        {"": 1, "Journal": 1, "Journal/2026": 1, "Work": 1},
    ),
    (
        "a size comparison",
        [("size", "gt:4000")],
        {"Journal": 1, "Journal/2026": 1, "Work": 1},
    ),
    (
        "a duration comparison",
        [("type", "video"), ("duration", "gt:60")],
        {"Videos": 1},
    ),
    (
        "type in its list form",
        [("type", "text"), ("type", "pdf"), ("exclude_origin", "webclip"), ("folder", "Work")],
        {"Work": 2},
    ),
    (
        "a target that matches nothing",
        [("type", "text"), ("tag", "nowhere")],
        {},
    ),
]


class TestGetUnderTheListingFilters:
    """SPEC-CORE-130 folder counts step 1, step 3, I14."""

    @pytest.mark.parametrize(
        ("params", "pinned"),
        [case[1:] for case in FILTER_CASES],
        ids=[case[0] for case in FILTER_CASES],
    )
    def test_spec_core_130_each_count_is_the_listings_total_at_that_path(self, client, params, pinned):
        c, db, *_ = client
        _seed(db)

        answer = _ok(_counts_get(c, params))

        listed = Counter(row["folder_path"] for row in _listing(c, params))
        assert answer == [{"path": p, "count": n} for p, n in sorted(listed.items())]
        for entry in answer:
            assert entry["count"] == _listing_total_at(c, params, entry["path"])
        assert {e["path"]: e["count"] for e in answer} == pinned

    def test_spec_core_130_a_filter_narrows_what_type_alone_counts(self, client):
        c, db, *_ = client
        _seed(db)

        alone = {e["path"]: e["count"] for e in _ok(_counts_get(c, [("type", "text")]))}
        narrowed = {
            e["path"]: e["count"]
            for e in _ok(_counts_get(c, [("type", "text"), ("tag", "food")]))
        }

        assert alone == {"": 1, "Journal": 4, "Journal/2026": 1, "Work": 2}
        assert narrowed == {"Journal": 2, "Journal/2026": 1, "Work": 1}

    def test_spec_core_130_answer_is_ordered_by_path(self, client):
        c, db, *_ = client
        _seed(db)

        answer = _ok(_counts_get(c, [("tag", "food")]))

        assert [e["path"] for e in answer] == ["Journal", "Journal/2026", "Work"]


class TestPostQuery:
    """SPEC-CORE-130 folder counts step 2, step 3, I14."""

    CASES = [
        ("ids only", [("type", "text")], [], ["j/a.md", "j/b.md", "w/e.md"], {"Journal": 2, "Work": 1}),
        (
            "ids or a collection",
            [("type", "text"), ("exclude_origin", "webclip")],
            ["Also"],
            ["w/e.md", "j/clip.md"],
            {"": 1, "Journal": 1, "Work": 1},
        ),
        ("an empty id list passes nothing", [("type", "text")], [], [], {}),
        (
            "other conditions still apply to listed ids",
            [("type", "text"), ("tag", "food")],
            [],
            ["root.md", "j/a.md", "j/2026/d.md", "w/doc.pdf"],
            {"Journal": 1, "Journal/2026": 1},
        ),
        (
            "trashed, missing and another drive's ids count nothing",
            [("type", "text")],
            [],
            ["j/gone.md", "j/lost.md", "foreign.md", "root.md"],
            {"": 1},
        ),
        (
            "duplicate ids count once",
            [("type", "text")],
            [],
            ["j/a.md", "j/a.md", "j/b.md"],
            {"Journal": 2},
        ),
    ]

    @pytest.mark.parametrize(
        ("params", "collections", "names", "pinned"),
        [case[1:] for case in CASES],
        ids=[case[0] for case in CASES],
    )
    def test_spec_core_130_each_count_is_the_files_query_total_at_that_path(
        self, client, params, collections, names, pinned
    ):
        c, db, *_ = client
        rows = _seed(db)
        body = {"file_ids": [rows[n].id for n in names]}
        full = [*params, *(("collection", name) for name in collections)]

        answer = _ok(_counts_post(c, full, body))

        listed = Counter(row["folder_path"] for row in _listing(c, full, body))
        assert answer == [{"path": p, "count": n} for p, n in sorted(listed.items())]
        for entry in answer:
            assert entry["count"] == _listing_total_at(c, full, entry["path"], body)
        assert {e["path"]: e["count"] for e in answer} == pinned


BAD_PARAMS = [
    ("a malformed folder", [("folder", "../etc")], 400),
    ("a malformed size", [("size", "huge")], 400),
    ("a malformed duration", [("duration", "lt:soon")], 400),
    ("more than ten collections", [("collection", f"c{i}") for i in range(11)], 400),
    ("an unknown kind", [("type", "bogus")], 422),
    ("a favorite that is not a bool", [("favorite", "maybe")], 422),
    ("an empty origin", [("origin", "")], 422),
]
# `type` and `origin` are validated on the GET already (test_drive_folder_counts.py,
# test_origin_conditions.py); the GET cases here are the parameters it gains.
NEW_ON_GET = [case for case in BAD_PARAMS if case[0] not in {"an unknown kind", "an empty origin"}]


class TestInvalidParameters:
    """SPEC-CORE-130 folder counts step 5: what `files` answers for them."""

    @pytest.mark.parametrize(
        ("params", "status"),
        [case[1:] for case in NEW_ON_GET],
        ids=[case[0] for case in NEW_ON_GET],
    )
    def test_spec_core_130_get_answers_what_files_answers(self, client, params, status):
        c, db, *_ = client
        _seed(db)

        listing = c.get(f"/api/drives/{TEST_DRIVE}/files", params=params)
        counts = _counts_get(c, params)

        assert listing.status_code == status
        assert counts.status_code == status, counts.text

    @pytest.mark.parametrize(
        ("params", "status"),
        [case[1:] for case in BAD_PARAMS],
        ids=[case[0] for case in BAD_PARAMS],
    )
    def test_spec_core_130_post_answers_what_files_query_answers(self, client, params, status):
        c, db, *_ = client
        rows = _seed(db)
        body = {"file_ids": [rows["root.md"].id]}

        listing = c.post(f"/api/drives/{TEST_DRIVE}/files/query", params=params, json=body)
        counts = _counts_post(c, params, body)

        assert listing.status_code == status
        assert counts.status_code == status, counts.text

    @pytest.mark.parametrize(
        "body",
        [{}, {"file_ids": "abc"}, {"file_ids": [""]}],
        ids=["no file_ids", "not a list", "an empty element"],
    )
    def test_spec_core_130_a_bad_body_is_422_as_on_files_query(self, client, body):
        c, db, *_ = client
        _seed(db)

        listing = c.post(f"/api/drives/{TEST_DRIVE}/files/query", json=body)
        counts = _counts_post(c, [], body)
        good = _counts_post(c, [], {"file_ids": []})

        assert listing.status_code == 422
        assert counts.status_code == 422, counts.text
        assert good.status_code == 200, good.text


def _in(db, drive: str, path: str, tags=()) -> File:
    return _file(db, path, drive=drive, tags=tags)


class TestDriveBoundary:
    """SPEC-CORE-130 folder counts step 3 and 5, I15."""

    def test_spec_core_130_locked_and_unknown_drives_are_404_on_both_forms(self, two_drives):
        c, db, *_ = two_drives
        mine = _in(db, OPEN_DRIVE, "Notes/a.md", tags=["t"])
        _in(db, LOCKED_DRIVE, "Secret/b.md", tags=["t"])
        body = {"file_ids": [mine.id]}

        assert _ok(_counts_post(c, [("tag", "t")], body, drive=OPEN_DRIVE)) == [
            {"path": "Notes", "count": 1}
        ]
        assert _ok(_counts_get(c, [("tag", "t")], drive=OPEN_DRIVE)) == [{"path": "Notes", "count": 1}]
        for drive in (LOCKED_DRIVE, "nope"):
            assert _counts_get(c, [("tag", "t")], drive=drive).status_code == 404
            assert _counts_post(c, [("tag", "t")], body, drive=drive).status_code == 404

    def test_spec_core_130_another_drives_ids_and_collections_count_nothing(self, two_drives):
        c, db, *_ = two_drives
        mine = _in(db, OPEN_DRIVE, "Notes/a.md")
        theirs = _in(db, LOCKED_DRIVE, "Notes/b.md")
        theirs_too = _in(db, LOCKED_DRIVE, "Secret/c.md")
        _collection(db, "Shared", [theirs, theirs_too], drive=LOCKED_DRIVE)
        _collection(db, "Shared", [mine], drive=OPEN_DRIVE)

        by_ids = _counts_post(c, [], {"file_ids": [mine.id, theirs.id, theirs_too.id]}, drive=OPEN_DRIVE)
        by_collection = _counts_post(c, [("collection", "Shared")], {"file_ids": [theirs.id]}, drive=OPEN_DRIVE)
        by_get = _counts_get(c, [("collection", "Shared")], drive=OPEN_DRIVE)

        assert _ok(by_ids) == [{"path": "Notes", "count": 1}]
        assert _ok(by_collection) == [{"path": "Notes", "count": 1}]
        assert _ok(by_get) == [{"path": "Notes", "count": 1}]
