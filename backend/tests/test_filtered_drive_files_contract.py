"""SPEC-ADDON-106 I9: `filtered_drive_files`, called with the documented parameters,
selects exactly the files `GET /api/drives/{drive}/files` lists for the same parameters.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.models import File, Tag
from app.routers.drives import filtered_drive_files
from tests.conftest import TEST_DRIVE

OTHER_DRIVE = "elsewhere"

LIST_PARAMS = ("tag", "type", "folder", "collection", "size", "duration")


def _at(day: int) -> datetime:
    return datetime(2026, 1, day, tzinfo=UTC)


def _seed(c, db) -> None:
    trip = Tag(name="Trip", drive=TEST_DRIVE)
    year = Tag(name="2024", drive=TEST_DRIVE)
    db.add_all([trip, year])

    rows = [
        # name, folder, day, kind, mime, size, duration, tags, favourite, liked, state
        ("beach.jpg", "Photos/2024", 1, "image", "image/jpeg", 2_000_000, None, [trip, year], True, False, {}),
        ("dunes.jpg", "Photos/2023", 2, "image", "image/jpeg", 500, None, [trip], False, True, {}),
        ("clip.mp4", "Photos/2024", 3, "video", "video/mp4", 50_000_000, 95.0, [trip], False, False, {}),
        ("long.mp4", "Movies", 4, "video", "video/mp4", 900_000_000, 4000.0, [], True, True, {}),
        ("notes.md", "", 5, "document", "text/markdown", 10, None, [year], False, False, {}),
        ("guide.pdf", "Docs", 6, "document", "application/pdf", 3_000_000, None, [], False, False, {}),
        ("gone.jpg", "Photos/2024", 7, "image", "image/jpeg", 1, None, [trip], True, True, {"missing": True}),
        ("binned.jpg", "Photos/2024", 8, "image", "image/jpeg", 1, None, [trip], True, True, {"deleted": True}),
    ]
    for name, folder, day, kind, mime, size, duration, tags, favorite, liked, state in rows:
        file = File(
            filename=name,
            title=name,
            drive=TEST_DRIVE,
            folder_path=folder,
            file_path=f"{folder}/{name}" if folder else name,
            file_size=size,
            duration=duration,
            file_type=kind,
            mime_type=mime,
            is_favorite=favorite,
            liked_at=_at(day) if liked else None,
            created_at=_at(day),
            missing_since=_at(day) if state.get("missing") else None,
            deleted_at=_at(day) if state.get("deleted") else None,
        )
        file.tags.extend(tags)
        db.add(file)
    db.add(
        File(
            filename="beach.jpg",
            title="beach.jpg",
            drive=OTHER_DRIVE,
            folder_path="Photos/2024",
            file_path="Photos/2024/beach.jpg",
            file_size=2_000_000,
            file_type="image",
            mime_type="image/jpeg",
            created_at=_at(1),
        )
    )
    db.commit()

    ids = {f.title: f.id for f in db.query(File).filter(File.drive == TEST_DRIVE)}
    res = c.post(f"/api/drives/{TEST_DRIVE}/collections", json={"name": "Summer"})
    assert res.status_code in (200, 201), res.text
    collection_id = res.json()["id"]
    res = c.post(
        f"/api/drives/{TEST_DRIVE}/collections/{collection_id}/items",
        json={"file_ids": [ids["dunes.jpg"], ids["clip.mp4"]]},
    )
    assert res.status_code == 200, res.text


def _wire(params: dict) -> list[tuple[str, str]]:
    query: list[tuple[str, str]] = []
    for key, value in params.items():
        if isinstance(value, list):
            query.extend((key, v) for v in value)
        elif isinstance(value, bool):
            query.append((key, "true" if value else "false"))
        else:
            query.append((key, value))
    return query


def _listed_ids(c, params: dict) -> set[str]:
    query = [("limit", "500"), *_wire(params)]
    res = c.get(f"/api/drives/{TEST_DRIVE}/files", params=query)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["meta"]["total"] <= 500
    return {item["id"] for item in body["data"]}


def _call(db, params: dict):
    kwargs = {
        "path": "",
        "recursive": True,
        "search": None,
        "favorite": None,
        "liked": None,
        **{name: [] for name in LIST_PARAMS},
    }
    kwargs.update(params)
    return filtered_drive_files(db, TEST_DRIVE, **kwargs)


def _helper_ids(db, params: dict) -> set[str]:
    query, _normalized_search = _call(db, params)
    return {row[0] for row in query.with_entities(File.id).all()}


ROWS = [
    ("no filters", {}),
    ("a path, direct children", {"path": "Photos/2024", "recursive": False}),
    ("a path and its subtree", {"path": "Photos", "recursive": True}),
    ("the drive root, direct children", {"path": "", "recursive": False}),
    ("search", {"search": "beach"}),
    ("search matching a folder", {"search": "2023"}),
    ("favorite", {"favorite": True}),
    ("not a favorite", {"favorite": False}),
    ("liked", {"liked": True}),
    ("a tag, folded", {"tag": ["trip"]}),
    ("two tags are AND", {"tag": ["Trip", "2024"]}),
    ("a kind", {"type": ["image"]}),
    ("two kinds are OR", {"type": ["image", "video"]}),
    ("a parent kind", {"type": ["document"]}),
    ("markdown reads as text", {"type": ["markdown"]}),
    ("a folder", {"folder": ["Photos"]}),
    ("two folders", {"folder": ["Photos/2023", "Docs"]}),
    ("a collection", {"collection": ["summer"]}),
    ("a size", {"size": ["gt:1048576"]}),
    ("two sizes", {"size": ["gt:1000", "lt:10000000"]}),
    ("a duration", {"duration": ["lte:1800"]}),
    (
        "a smart-folder target",
        {"tag": ["Trip"], "type": ["image", "video"], "folder": ["Photos"], "size": ["gt:1000"]},
    ),
    ("everything at once", {"search": "clip", "tag": ["trip"], "type": ["video"], "collection": ["Summer"], "duration": ["gt:60"]}),
]


@pytest.mark.parametrize("params", [row[1] for row in ROWS], ids=[row[0] for row in ROWS])
def test_spec_addon_106_i9_selects_what_the_listing_lists(client, params):
    c, db, _drive_dir, _data_dir = client
    _seed(c, db)

    listed = _listed_ids(c, params)

    assert _helper_ids(db, params) == listed


def test_spec_addon_106_i9_the_parity_rows_are_not_vacuous(client):
    c, db, _drive_dir, _data_dir = client
    _seed(c, db)

    sizes = {name: len(_listed_ids(c, params)) for name, params in ROWS}

    assert sizes["no filters"] == 6
    assert sizes["a collection"] == 2
    assert all(0 < n < 6 for name, n in sizes.items() if name != "no filters")


@pytest.mark.parametrize(
    "params",
    [
        {"size": ["huge"]},
        {"duration": ["about:5"]},
        {"path": "../outside"},
        {"path": "/Photos"},
    ],
    ids=["malformed size", "malformed duration", "path with ..", "leading slash"],
)
def test_spec_addon_106_i9_raises_400_where_the_listing_answers_400(client, params):
    c, db, _drive_dir, _data_dir = client
    _seed(c, db)

    assert c.get(f"/api/drives/{TEST_DRIVE}/files", params=_wire(params)).status_code == 400

    with pytest.raises(HTTPException) as raised:
        _call(db, params)
    assert raised.value.status_code == 400


def test_spec_addon_106_i9_returns_the_normalised_search(client):
    _c, db, _drive_dir, _data_dir = client

    _query, normalized = _call(db, {"search": "beach"})

    assert normalized == "beach"
