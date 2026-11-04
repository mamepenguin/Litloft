"""A cross-drive move takes the file out of collections of the drive it leaves.

SPEC-CORE-034 I1, I2, I9, I10.
"""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime

import pytest

import app.config as config
import app.services.fileops as fileops
from app.models import Collection, CollectionItem, File
from app.nanoid import generate_nanoid
from tests.conftest import TEST_DRIVE
from tests.test_target_drive_access import (  # noqa: F401  (fixture)
    FIXTURES_DIR,
    LOCKED_DRIVE,
    LOCKED_PASSWORD,
    OPEN_DRIVE,
    two_drives,
)

SRC, DST = OPEN_DRIVE, LOCKED_DRIVE
THIRD_DRIVE = "third"
FIXED_UPDATED_AT = datetime(2026, 1, 2, 3, 4, 5)


def _unlock(c):
    assert (
        c.post("/api/auth/unlock", json={"password": LOCKED_PASSWORD}).status_code
        == 200
    )


def _add_third_drive(open_dir):
    third_dir = open_dir.parent / THIRD_DRIVE
    third_dir.mkdir()
    drives = json.loads(config.DRIVES_CONFIG.read_text())
    drives.append({"name": THIRD_DRIVE, "path": str(third_dir)})
    config.DRIVES_CONFIG.write_text(json.dumps(drives))
    config._drives_cache = None
    return third_dir


def _seed_file(db, drive_dir, drive, filename="clip.mp4", *, on_disk=True):
    if on_disk:
        shutil.copy(FIXTURES_DIR / "short_video.mp4", drive_dir / filename)
        size = (drive_dir / filename).stat().st_size
    else:
        size = 1
    row = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="",
        file_path=filename,
        file_size=size,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _seed_db_file(db, drive, filename, *, deleted_at=None, missing_since=None):
    row = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="",
        file_path=filename,
        file_size=1,
        file_type="video",
        mime_type="video/mp4",
        deleted_at=deleted_at,
        missing_since=missing_since,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _collection(db, drive, name, entries, *, updated_at=None):
    collection = Collection(id=generate_nanoid(), drive=drive, name=name)
    if updated_at is not None:
        collection.created_at = updated_at
        collection.updated_at = updated_at
    db.add(collection)
    db.flush()
    for position, file_id in entries:
        db.add(
            CollectionItem(
                collection_id=collection.id, file_id=file_id, position=position
            )
        )
    db.commit()
    db.refresh(collection)
    return collection


def _items(db, collection_id):
    db.expire_all()
    return [
        (item.file_id, item.position)
        for item in (
            db.query(CollectionItem)
            .filter(CollectionItem.collection_id == collection_id)
            .order_by(CollectionItem.position, CollectionItem.id)
            .all()
        )
    ]


def _move(c, file_id, drive, folder=""):
    return c.put(
        f"/api/files/{file_id}/move",
        json={"target_drive": drive, "target_folder_path": folder},
    )


# SPEC-CORE-034 I1
def test_single_cross_drive_move_removes_the_file_from_every_other_drives_collections(
    two_drives,
):
    c, db, open_dir, _locked_dir = two_drives
    _unlock(c)
    _add_third_drive(open_dir)
    moved = _seed_file(db, open_dir, SRC, "moved.mp4")
    kept = _seed_file(db, open_dir, SRC, "kept.mp4")
    source_one = _collection(db, SRC, "Source one", [(0, moved.id), (1, kept.id)])
    source_two = _collection(db, SRC, "Source two", [(0, moved.id)])
    destination = _collection(db, DST, "Destination", [(0, moved.id)])
    stale_third = _collection(db, THIRD_DRIVE, "Stale", [(0, moved.id)])

    assert _move(c, moved.id, DST).status_code == 200

    assert _items(db, source_one.id) == [(kept.id, 1)]
    assert _items(db, source_two.id) == []
    assert _items(db, stale_third.id) == []
    assert _items(db, destination.id) == [(moved.id, 0)]


# SPEC-CORE-034 I10
def test_other_items_keep_their_positions_and_the_collection_keeps_its_updated_at(
    two_drives,
):
    c, db, open_dir, _locked_dir = two_drives
    _unlock(c)
    moved = _seed_file(db, open_dir, SRC, "moved.mp4")
    first_kept = _seed_file(db, open_dir, SRC, "first.mp4")
    second_kept = _seed_file(db, open_dir, SRC, "second.mp4")
    collection = _collection(
        db,
        SRC,
        "Source",
        [(0, moved.id), (1, first_kept.id), (5, second_kept.id)],
        updated_at=FIXED_UPDATED_AT,
    )

    def rows():
        db.expire_all()
        return [
            (item.id, item.file_id, item.position)
            for item in db.query(CollectionItem)
            .filter(CollectionItem.collection_id == collection.id)
            .order_by(CollectionItem.position, CollectionItem.id)
            .all()
        ]

    before = rows()
    expected = [row for row in before if row[1] != moved.id]

    assert _move(c, moved.id, DST).status_code == 200

    assert rows() == expected
    assert [(file_id, position) for _, file_id, position in expected] == [
        (first_kept.id, 1),
        (second_kept.id, 5),
    ]
    assert db.get(Collection, collection.id).updated_at == FIXED_UPDATED_AT


# SPEC-CORE-034 I10
def test_moving_the_file_back_does_not_recreate_a_removed_item(two_drives):
    c, db, open_dir, _locked_dir = two_drives
    _unlock(c)
    moved = _seed_file(db, open_dir, SRC, "moved.mp4")
    collection = _collection(db, SRC, "Source", [(0, moved.id)])

    assert _move(c, moved.id, DST).status_code == 200
    assert _move(c, moved.id, SRC).status_code == 200

    assert _items(db, collection.id) == []


# SPEC-CORE-034 I1
@pytest.mark.parametrize(
    "payload",
    [
        {"target_folder_path": "sub"},
        {"target_drive": SRC, "target_folder_path": "sub"},
        {"target_drive": "", "target_folder_path": "sub"},
    ],
    ids=["drive-absent", "same-drive-name", "empty-drive"],
)
def test_a_within_drive_move_leaves_every_item_and_position_in_place(
    two_drives, payload
):
    c, db, open_dir, _locked_dir = two_drives
    (open_dir / "sub").mkdir()
    moved = _seed_file(db, open_dir, SRC, "moved.mp4")
    other = _seed_file(db, open_dir, SRC, "other.mp4")
    collection = _collection(
        db,
        SRC,
        "Source",
        [(0, moved.id), (3, other.id)],
        updated_at=FIXED_UPDATED_AT,
    )

    res = c.put(f"/api/files/{moved.id}/move", json=payload)

    assert res.status_code == 200
    assert _items(db, collection.id) == [(moved.id, 0), (other.id, 3)]
    assert db.get(Collection, collection.id).updated_at == FIXED_UPDATED_AT


# SPEC-CORE-034 I2
def test_a_target_that_already_exists_changes_no_item(two_drives):
    c, db, open_dir, locked_dir = two_drives
    _unlock(c)
    moved = _seed_file(db, open_dir, SRC, "clip.mp4")
    (locked_dir / "clip.mp4").write_bytes(b"occupied")
    collection = _collection(db, SRC, "Source", [(0, moved.id)])

    res = _move(c, moved.id, DST)

    assert res.status_code == 409
    assert _items(db, collection.id) == [(moved.id, 0)]


# SPEC-CORE-034 I2
def test_a_file_missing_from_disk_changes_no_item(two_drives):
    c, db, open_dir, _locked_dir = two_drives
    _unlock(c)
    missing = _seed_file(db, open_dir, SRC, "missing.mp4", on_disk=False)
    collection = _collection(db, SRC, "Source", [(0, missing.id)])

    res = _move(c, missing.id, DST)

    assert res.status_code == 404
    assert _items(db, collection.id) == [(missing.id, 0)]


# SPEC-CORE-034 I2
def test_a_locked_destination_changes_no_item(two_drives):
    c, db, open_dir, _locked_dir = two_drives
    moved = _seed_file(db, open_dir, SRC, "clip.mp4")
    collection = _collection(db, SRC, "Source", [(0, moved.id)])

    res = _move(c, moved.id, DST)

    assert res.status_code == 404
    assert _items(db, collection.id) == [(moved.id, 0)]


# SPEC-CORE-034 I2
def test_a_database_error_after_the_disk_move_restores_the_removed_item(
    two_drives, monkeypatch
):
    c, db, open_dir, locked_dir = two_drives
    _unlock(c)
    moved = _seed_file(db, open_dir, SRC, "clip.mp4")
    collection = _collection(db, SRC, "Source", [(0, moved.id)])

    def boom(*_args, **_kwargs):
        raise RuntimeError("db step failed")

    monkeypatch.setattr(fileops, "_ensure_empty_folder_tracked", boom)
    res = _move(c, moved.id, DST)

    assert res.status_code == 500
    assert not (locked_dir / "clip.mp4").exists()
    db.expire_all()
    assert db.get(File, moved.id).drive == SRC
    assert _items(db, collection.id) == [(moved.id, 0)]


# SPEC-CORE-034 I2
def test_in_a_batch_a_later_failure_does_not_restore_an_earlier_files_removal(
    two_drives,
):
    c, db, open_dir, locked_dir = two_drives
    _unlock(c)
    first = _seed_file(db, open_dir, SRC, "first.mp4")
    second = _seed_file(db, open_dir, SRC, "second.mp4")
    kept = _seed_file(db, open_dir, SRC, "kept.mp4")
    collection = _collection(
        db,
        SRC,
        "Source",
        [(0, first.id), (1, second.id), (2, kept.id)],
    )
    # The second file cannot land: its name is already taken on the target.
    (locked_dir / "second.mp4").write_bytes(b"occupied")

    res = c.put(
        "/api/files/batch/move",
        json={
            "ids": [first.id, second.id],
            "target_drive": DST,
            "target_folder_path": "",
        },
    )

    assert res.status_code == 200
    assert res.json()["moved"] == 1
    assert [error["id"] for error in res.json()["errors"]] == [second.id]
    assert _items(db, collection.id) == [(second.id, 1), (kept.id, 2)]


# SPEC-CORE-034 I9
def test_same_drive_data_still_reads_through_the_public_collection_endpoints(
    client,
):
    c, db, *_ = client
    active = _seed_db_file(db, TEST_DRIVE, "active.mp4")
    trashed = _seed_db_file(
        db, TEST_DRIVE, "trashed.mp4", deleted_at=datetime.now(UTC)
    )
    missing = _seed_db_file(
        db, TEST_DRIVE, "missing.mp4", missing_since=datetime.now(UTC)
    )
    collection = _collection(
        db,
        TEST_DRIVE,
        "Same drive",
        [(0, active.id), (1, trashed.id), (2, missing.id)],
    )

    detail = c.get(f"/api/drives/{TEST_DRIVE}/collections/{collection.id}")

    assert detail.status_code == 200
    assert [item["file"]["id"] for item in detail.json()["items"]] == [
        active.id,
        trashed.id,
        missing.id,
    ]
    assert [item["position"] for item in detail.json()["items"]] == [0, 1, 2]

    summaries = c.get(f"/api/drives/{TEST_DRIVE}/collections").json()
    assert summaries[0]["item_count"] == 3
    assert summaries[0]["first_file_id"] == active.id
