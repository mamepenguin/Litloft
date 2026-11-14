"""SPEC-CORE-108: a name is unique per drive across collections and Smart Collections.

Invariants I7 and I8 of docs/specs/smart-collection.md, held through the four
write routes.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import app.config as config
from tests.conftest import TEST_DRIVE

OTHER_DRIVE = "other-drive"
IN_USE = "Name already in use"


@pytest.fixture()
def two_drives(client, tmp_path):
    c, db, drive_dir, data_dir = client
    other_dir = tmp_path / "drives" / "other"
    other_dir.mkdir(parents=True, exist_ok=True)
    Path(config.DRIVES_CONFIG).write_text(
        json.dumps(
            [
                {"name": TEST_DRIVE, "path": str(drive_dir)},
                {"name": OTHER_DRIVE, "path": str(other_dir)},
            ]
        )
    )
    config._drives_cache = None
    yield c, db


def _collections(drive: str) -> str:
    return f"/api/drives/{drive}/collections"


def _smart(drive: str) -> str:
    return f"/api/drives/{drive}/smart-folders"


def _make_collection(c, name: str, drive: str = TEST_DRIVE, **extra) -> dict:
    res = c.post(_collections(drive), json={"name": name, **extra})
    assert res.status_code == 201, res.text
    return res.json()


def _make_smart(c, name: str, drive: str = TEST_DRIVE, query: str = "q") -> dict:
    res = c.post(_smart(drive), json={"name": name, "query": query})
    assert res.status_code == 201, res.text
    return res.json()


def _make(c, kind: str, name: str, drive: str = TEST_DRIVE) -> dict:
    return _make_collection(c, name, drive) if kind == "collection" else _make_smart(c, name, drive)


def _create(c, kind: str, name: str, drive: str = TEST_DRIVE):
    if kind == "collection":
        return c.post(_collections(drive), json={"name": name})
    return c.post(_smart(drive), json={"name": name, "query": "new-q"})


def _rename(c, kind: str, item_id: str, name: str, drive: str = TEST_DRIVE):
    if kind == "collection":
        return c.put(f"{_collections(drive)}/{item_id}", json={"name": name})
    return c.patch(f"{_smart(drive)}/{item_id}", json={"name": name})


def _names(c, drive: str = TEST_DRIVE) -> list[tuple[str, str]]:
    cols = [("collection", r["name"]) for r in c.get(_collections(drive)).json()]
    sfs = [("smart", r["name"]) for r in c.get(_smart(drive)).json()]
    return sorted(cols + sfs)


def _assert_in_use(res) -> None:
    assert res.status_code == 409, res.text
    assert res.json()["detail"] == IN_USE


KINDS = ["collection", "smart"]

# (existing name, requested name): equal after Python str.lower() on both sides.
MATCHING = [
    pytest.param("Trip", "Trip", id="identical"),
    pytest.param("Trip", "trip", id="case-only"),
    pytest.param("trip", "TRIP", id="upper-vs-lower"),
    pytest.param("été", "ÉTÉ", id="non-ascii-accented"),
    pytest.param("ΑΘΗΝΑ", "αθηνα", id="non-ascii-greek"),
    pytest.param("Trip", "  trip  ", id="trimmed-by-schema"),
]


class TestCreateConflicts:
    """SPEC-CORE-108 I7: a create whose name is in use in the drive is 409 and writes nothing."""

    @pytest.mark.parametrize("existing_kind", KINDS)
    @pytest.mark.parametrize("new_kind", KINDS)
    @pytest.mark.parametrize("existing,requested", MATCHING)
    def test_spec_core_108_create_with_a_name_in_use_is_409(
        self, client, existing_kind, new_kind, existing, requested
    ):
        c, *_ = client
        _make(c, existing_kind, existing)
        before = _names(c)

        res = _create(c, new_kind, requested)

        _assert_in_use(res)
        assert _names(c) == before

    @pytest.mark.parametrize("existing_kind", KINDS)
    @pytest.mark.parametrize("new_kind", KINDS)
    def test_spec_core_108_lower_is_not_casefold(self, client, existing_kind, new_kind):
        # "straße".lower() != "strasse"; only casefold() would make them equal.
        c, *_ = client
        _make(c, existing_kind, "Straße")
        _make(c, "collection" if existing_kind == "smart" else "smart", "trip")

        _assert_in_use(_create(c, new_kind, "TRIP"))
        res = _create(c, new_kind, "STRASSE")
        assert res.status_code == 201, res.text

    @pytest.mark.parametrize("existing_kind", KINDS)
    @pytest.mark.parametrize("new_kind", KINDS)
    def test_spec_core_108_same_name_in_another_drive_is_accepted(
        self, two_drives, existing_kind, new_kind
    ):
        c, _db = two_drives
        _make(c, existing_kind, "Trip", drive=OTHER_DRIVE)
        _make_smart(c, "Kyoto")

        _assert_in_use(_create(c, new_kind, "kyoto"))
        res = _create(c, new_kind, "trip")
        assert res.status_code == 201, res.text


class TestRenameConflicts:
    """SPEC-CORE-108 I7: a rename to a name in use is 409 and changes no field."""

    @pytest.mark.parametrize("other_kind", KINDS)
    @pytest.mark.parametrize("kind", KINDS)
    @pytest.mark.parametrize("existing,requested", MATCHING)
    def test_spec_core_108_rename_to_a_name_in_use_is_409(
        self, client, kind, other_kind, existing, requested
    ):
        c, *_ = client
        _make(c, other_kind, existing)
        mine = _make(c, kind, "Mine")
        before = _names(c)

        _assert_in_use(_rename(c, kind, mine["id"], requested))
        assert _names(c) == before

    @pytest.mark.parametrize("other_kind", KINDS)
    def test_spec_core_108_collection_put_409_applies_no_field(self, client, other_kind):
        c, *_ = client
        _make(c, other_kind, "Taken")
        mine = _make_collection(c, "Mine", description="keep me")

        res = c.put(
            f"{_collections(TEST_DRIVE)}/{mine['id']}",
            json={"name": "TAKEN", "description": "changed"},
        )

        _assert_in_use(res)
        detail = c.get(f"{_collections(TEST_DRIVE)}/{mine['id']}").json()
        assert detail["name"] == "Mine"
        assert detail["description"] == "keep me"

    @pytest.mark.parametrize("other_kind", KINDS)
    def test_spec_core_108_smart_patch_409_applies_no_field(self, client, other_kind):
        c, *_ = client
        _make(c, other_kind, "Taken")
        mine = c.post(
            _smart(TEST_DRIVE),
            json={"name": "Mine", "query": "old-q", "file_type": "video"},
        ).json()

        res = c.patch(
            f"{_smart(TEST_DRIVE)}/{mine['id']}",
            json={"name": "taken", "query": "new-q", "file_type": "image"},
        )

        _assert_in_use(res)
        row = next(r for r in c.get(_smart(TEST_DRIVE)).json() if r["id"] == mine["id"])
        assert row["name"] == "Mine"
        assert row["query"] == "old-q"
        assert row["file_type"] == "video"


class TestRenameSelfAndUncheckedWrites:
    """SPEC-CORE-108 I8: the item itself is excluded, and a write without a new name is not checked."""

    @pytest.mark.parametrize("kind", KINDS)
    def test_spec_core_108_rename_to_own_name_in_another_case_succeeds(self, client, kind):
        c, *_ = client
        mine = _make(c, kind, "trip")
        _make(c, "collection" if kind == "smart" else "smart", "Kyoto")

        _assert_in_use(_rename(c, kind, mine["id"], "KYOTO"))
        res = _rename(c, kind, mine["id"], "Trip")
        assert res.status_code == 200, res.text
        assert res.json()["name"] == "Trip"

    @pytest.mark.parametrize("kind", KINDS)
    def test_spec_core_108_rename_to_own_name_in_another_case_is_409_when_another_item_matches(
        self, client, kind
    ):
        c, db, *_ = client
        mine = _make(c, kind, "trip")
        _seed_legacy(db, "collection" if kind == "smart" else "smart", "TRIP")

        _assert_in_use(_rename(c, kind, mine["id"], "Trip"))

    def test_spec_core_108_collection_put_without_name_succeeds_beside_a_duplicate(self, client):
        c, db, *_ = client
        mine = _make_collection(c, "Trip")
        _seed_legacy(db, "smart", "trip")

        res = c.put(f"{_collections(TEST_DRIVE)}/{mine['id']}", json={"description": "d"})
        assert res.status_code == 200, res.text
        assert res.json()["description"] == "d"

        res = c.put(
            f"{_collections(TEST_DRIVE)}/{mine['id']}",
            json={"name": "Trip", "description": "d2"},
        )
        assert res.status_code == 200, res.text

        _assert_in_use(c.put(f"{_collections(TEST_DRIVE)}/{mine['id']}", json={"name": "TRIP"}))

    def test_spec_core_108_smart_patch_without_name_succeeds_beside_a_duplicate(self, client):
        c, db, *_ = client
        mine = _make_smart(c, "Trip", query="old-q")
        _seed_legacy(db, "collection", "trip")

        res = c.patch(
            f"{_smart(TEST_DRIVE)}/{mine['id']}",
            json={"query": "new-q", "file_type": "video"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["query"] == "new-q"

        res = c.patch(f"{_smart(TEST_DRIVE)}/{mine['id']}", json={"name": "Trip"})
        assert res.status_code == 200, res.text

        _assert_in_use(c.patch(f"{_smart(TEST_DRIVE)}/{mine['id']}", json={"name": "tRIP"}))

    def test_spec_core_108_existing_duplicates_are_left_as_they_are(self, client):
        c, db, *_ = client
        _seed_legacy(db, "collection", "Trip")
        _seed_legacy(db, "collection", "trip")
        _seed_legacy(db, "smart", "TRIP")

        assert _names(c) == [("collection", "Trip"), ("collection", "trip"), ("smart", "TRIP")]
        _assert_in_use(_create(c, "collection", "tRiP"))
        assert _names(c) == [("collection", "Trip"), ("collection", "trip"), ("smart", "TRIP")]


def _seed_legacy(db, kind: str, name: str, drive: str = TEST_DRIVE):
    """A row written before names were checked, so it may duplicate another."""
    from app.models import Collection, SmartFolder

    row = (
        Collection(drive=drive, name=name)
        if kind == "collection"
        else SmartFolder(drive=drive, name=name, query="legacy")
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
