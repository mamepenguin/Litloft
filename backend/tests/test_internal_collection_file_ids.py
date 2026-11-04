"""Internal API: GET /api/internal/collections/{id}/file-ids.

SPEC-ADDON-058 I4, I5, I6, and the core-side parity reference for the addon's
Layer 2 table.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

import app.config as config
from app import schemas
from app.models import Collection, CollectionItem, File
from tests.conftest import TEST_DRIVE

OTHER_DRIVE = "other-drive"
CID = "col000000001"
OTHER_CID = "col000000002"
MISSING_CID = "missingcol01"

ACTIVE_1 = "file000000aa"
ACTIVE_2 = "file000000bb"
TRASHED = "file000000cc"
MISSING = "file000000dd"
OTHER_DRIVE_FILE = "file000000ee"


def _add_second_drive(drive_dir):
    other_dir = drive_dir.parent / OTHER_DRIVE
    other_dir.mkdir()
    drives = json.loads(config.DRIVES_CONFIG.read_text())
    drives.append({"name": OTHER_DRIVE, "path": str(other_dir)})
    config.DRIVES_CONFIG.write_text(json.dumps(drives))
    config._drives_cache = None


def _seed_file(
    db,
    file_id,
    drive,
    *,
    deleted_at=None,
    missing_since=None,
):
    row = File(
        id=file_id,
        filename=f"{file_id}.mp4",
        title=file_id,
        drive=drive,
        folder_path="",
        file_path=f"{file_id}.mp4",
        file_size=1,
        file_type="video",
        mime_type="video/mp4",
        deleted_at=deleted_at,
        missing_since=missing_since,
    )
    db.add(row)
    db.commit()
    return row


def _seed_collection(db, collection_id, drive, entries):
    collection = Collection(id=collection_id, drive=drive, name=collection_id)
    db.add(collection)
    db.flush()
    for item_id, file_id, position in entries:
        db.add(
            CollectionItem(
                id=item_id,
                collection_id=collection_id,
                file_id=file_id,
                position=position,
            )
        )
    db.commit()
    return collection


def _ids(c, collection_id, drive=TEST_DRIVE):
    return c.get(
        f"/api/internal/collections/{collection_id}/file-ids",
        params={"drive": drive},
    )


# SPEC-ADDON-058 I4
def test_returns_active_same_drive_ids_in_position_then_item_id_order(client):
    c, db, drive_dir, _ = client
    _add_second_drive(drive_dir)
    _seed_file(db, ACTIVE_1, TEST_DRIVE)
    _seed_file(db, ACTIVE_2, TEST_DRIVE)
    _seed_file(db, OTHER_DRIVE_FILE, TEST_DRIVE)
    _seed_collection(
        db,
        CID,
        TEST_DRIVE,
        [
            (7, ACTIVE_1, 0),
            (3, ACTIVE_2, 0),
            (5, OTHER_DRIVE_FILE, 1),
        ],
    )

    res = _ids(c, CID)

    assert res.status_code == 200
    assert res.json() == {"file_ids": [ACTIVE_2, ACTIVE_1, OTHER_DRIVE_FILE]}


# SPEC-ADDON-058 I4
def test_an_empty_collection_answers_an_empty_list(client):
    c, db, *_ = client
    _seed_collection(db, CID, TEST_DRIVE, [])

    res = _ids(c, CID)

    assert res.status_code == 200
    assert res.json() == {"file_ids": []}


# SPEC-ADDON-058 I4
def test_excludes_trashed_missing_and_other_drive_files_even_when_the_item_survives(
    client,
):
    c, db, drive_dir, _ = client
    _add_second_drive(drive_dir)
    _seed_file(db, ACTIVE_1, TEST_DRIVE)
    _seed_file(db, TRASHED, TEST_DRIVE, deleted_at=datetime.now(UTC))
    _seed_file(db, MISSING, TEST_DRIVE, missing_since=datetime.now(UTC))
    _seed_file(db, OTHER_DRIVE_FILE, OTHER_DRIVE)
    _seed_collection(
        db,
        CID,
        TEST_DRIVE,
        [
            (1, ACTIVE_1, 0),
            (2, TRASHED, 1),
            (3, MISSING, 2),
            (4, OTHER_DRIVE_FILE, 3),
        ],
    )

    res = _ids(c, CID)

    assert res.status_code == 200
    assert res.json() == {"file_ids": [ACTIVE_1]}


# SPEC-ADDON-058 I4
def test_a_collection_whose_files_are_all_inactive_answers_an_empty_list(client):
    c, db, *_ = client
    _seed_file(db, TRASHED, TEST_DRIVE, deleted_at=datetime.now(UTC))
    _seed_file(db, MISSING, TEST_DRIVE, missing_since=datetime.now(UTC))
    _seed_collection(
        db,
        CID,
        TEST_DRIVE,
        [(1, TRASHED, 0), (2, MISSING, 1)],
    )

    res = _ids(c, CID)

    assert res.status_code == 200
    assert res.json() == {"file_ids": []}


# SPEC-ADDON-058 I5
def test_a_missing_collection_is_404_collection_not_found(client):
    c, *_ = client

    res = _ids(c, MISSING_CID)

    assert res.status_code == 404
    assert res.json()["detail"] == "Collection not found"


# SPEC-ADDON-058 I5
def test_a_collection_of_another_drive_answers_the_same_404(client):
    c, db, drive_dir, _ = client
    _add_second_drive(drive_dir)
    _seed_file(db, OTHER_DRIVE_FILE, OTHER_DRIVE)
    _seed_collection(
        db, OTHER_CID, OTHER_DRIVE, [(1, OTHER_DRIVE_FILE, 0)]
    )

    res = _ids(c, OTHER_CID, drive=TEST_DRIVE)

    assert res.status_code == 404
    assert res.json()["detail"] == "Collection not found"
    # The same id answers for the drive that owns it, so the 404 above is the
    # drive boundary and not a missing row.
    assert _ids(c, OTHER_CID, drive=OTHER_DRIVE).json() == {
        "file_ids": [OTHER_DRIVE_FILE]
    }


# SPEC-ADDON-058 I5
def test_an_unknown_drive_is_404_drive_not_found(client):
    c, *_ = client

    res = _ids(c, CID, drive="no-such-drive")

    assert res.status_code == 404
    assert res.json()["detail"] == "Drive not found"


# SPEC-ADDON-058 I5
@pytest.mark.parametrize(
    "collection_id",
    [
        "short",
        "!!!!!!!!!!!!",
        "col00000000",
        "col0000000011",
    ],
    ids=["too-short", "bad-chars", "eleven", "thirteen"],
)
def test_a_malformed_collection_id_is_400(client, collection_id):
    c, *_ = client

    res = _ids(c, collection_id)

    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid collection_id"


# SPEC-ADDON-058 I5
def test_an_omitted_drive_is_422(client):
    c, *_ = client

    res = c.get(f"/api/internal/collections/{CID}/file-ids")

    assert res.status_code == 422


# SPEC-ADDON-058 I5
def test_a_wrong_secret_is_403_when_the_secret_is_set(client, monkeypatch):
    c, db, *_ = client
    monkeypatch.setenv("CORE_INTERNAL_SECRET", "s3cret")
    _seed_collection(db, CID, TEST_DRIVE, [])

    res = c.get(
        f"/api/internal/collections/{CID}/file-ids",
        params={"drive": TEST_DRIVE},
        headers={"X-Internal-Secret": "wrong"},
    )

    assert res.status_code == 403
    assert res.json()["detail"] == "Invalid internal secret"


# SPEC-ADDON-058 I5
def test_the_matching_secret_is_accepted(client, monkeypatch):
    c, db, *_ = client
    monkeypatch.setenv("CORE_INTERNAL_SECRET", "s3cret")
    _seed_collection(db, CID, TEST_DRIVE, [])

    res = c.get(
        f"/api/internal/collections/{CID}/file-ids",
        params={"drive": TEST_DRIVE},
        headers={"X-Internal-Secret": "s3cret"},
    )

    assert res.status_code == 200
    assert res.json() == {"file_ids": []}


# SPEC-ADDON-058 I6
def test_answers_without_a_secret_when_the_secret_is_unset(client, monkeypatch):
    c, db, *_ = client
    monkeypatch.delenv("CORE_INTERNAL_SECRET", raising=False)
    _seed_collection(db, CID, TEST_DRIVE, [])

    res = _ids(c, CID)

    assert res.status_code == 200
    assert res.json() == {"file_ids": []}


# SPEC-ADDON-058 Layer 2 parity: the addon's hand-copied reference of this
# pattern and response key is checked against these two values.
def test_the_collection_id_pattern_is_pinned():
    assert schemas._NANOID_RE.pattern == r"^[A-Za-z0-9_-]{12}$"


# SPEC-ADDON-058 Layer 2 parity
def test_the_response_key_is_pinned(client):
    c, db, *_ = client
    _seed_collection(db, CID, TEST_DRIVE, [])

    res = _ids(c, CID)

    assert set(res.json()) == {"file_ids"}
