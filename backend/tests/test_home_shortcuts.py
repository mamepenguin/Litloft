"""SPEC-CORE-100: the drive's Home shortcuts (`GET` / `PUT .../home-shortcuts`)
and the `on_home` field on the Smart Folder, pin and collection responses."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import text

import app.config as config
from tests.conftest import TEST_DRIVE


SECOND_DRIVE = "second-drive"
PAST = "2020-01-01 00:00:00.000000"
EARLY = "2021-03-04 05:06:07.000000"
TIED = "2022-01-01 00:00:00.000000"

TABLE = {"smart_folder": "smart_folders", "collection": "collections", "pin": "pinned_folders"}


@pytest.fixture()
def two_drive_client(client, tmp_path):
    c, db, drive_dir, data_dir = client
    second_dir = tmp_path / "drives" / "second"
    second_dir.mkdir(parents=True, exist_ok=True)
    Path(config.DRIVES_CONFIG).write_text(
        json.dumps(
            [
                {"name": TEST_DRIVE, "path": str(drive_dir)},
                {"name": SECOND_DRIVE, "path": str(second_dir)},
            ]
        )
    )
    config._drives_cache = None
    yield c, db, drive_dir, data_dir


@pytest.fixture()
def protected_client(client, tmp_path):
    c, db, drive_dir, data_dir = client
    Path(config.DRIVES_CONFIG).write_text(
        json.dumps([{"name": TEST_DRIVE, "path": str(drive_dir), "access_group": "private"}])
    )
    config._drives_cache = None

    import app.auth as auth

    pw_file = tmp_path / "passwords_locked.json"
    pw_file.write_text(json.dumps([{"password": "secret123", "groups": ["private"]}]))
    orig = auth.PASSWORDS_CONFIG
    auth._passwords_cache = None
    auth.PASSWORDS_CONFIG = pw_file
    auth.load_passwords()
    try:
        yield c, db, drive_dir, data_dir
    finally:
        auth.PASSWORDS_CONFIG = orig
        auth._passwords_cache = None


# ---- helpers ----------------------------------------------------------------


def _url(drive=TEST_DRIVE):
    return f"/api/drives/{drive}/home-shortcuts"


def _put(c, kind, target_id, on_home, drive=TEST_DRIVE):
    return c.put(_url(drive), json={"kind": kind, "id": target_id, "on_home": on_home})


def _shortcuts(c, drive=TEST_DRIVE):
    res = c.get(_url(drive))
    assert res.status_code == 200, res.text
    return res.json()


def _keys(items):
    return [(i["kind"], i["id"]) for i in items]


def _smart_folder(c, name="SF", query="lecture", file_type=None, drive=TEST_DRIVE):
    body = {"name": name, "query": query}
    if file_type:
        body["file_type"] = file_type
    res = c.post(f"/api/drives/{drive}/smart-folders", json=body)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _collection(c, name="Col", drive=TEST_DRIVE):
    res = c.post(f"/api/drives/{drive}/collections", json={"name": name})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _pin(c, path, drive=TEST_DRIVE):
    res = c.post(f"/api/drives/{drive}/pins", json={"path": path})
    assert res.status_code == 201, res.text
    return path


def _where(kind):
    return "drive = :drive AND path = :id" if kind == "pin" else "drive = :drive AND id = :id"


def _column(db, kind, target_id, column, drive=TEST_DRIVE):
    db.expire_all()
    return db.execute(
        text(f"SELECT {column} FROM {TABLE[kind]} WHERE {_where(kind)}"),
        {"drive": drive, "id": target_id},
    ).scalar()


def _set(db, kind, target_id, column, value, drive=TEST_DRIVE):
    db.execute(
        text(f"UPDATE {TABLE[kind]} SET {column} = :v WHERE {_where(kind)}"),
        {"v": value, "drive": drive, "id": target_id},
    )
    db.commit()


def _seed_file(db, filename="a.mp3", drive=TEST_DRIVE):
    from app.models import File

    f = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="",
        file_path=filename,
        file_size=1000,
        file_type="audio",
        mime_type="audio/mpeg",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _as_datetime(value):
    return datetime.fromisoformat(str(value)[:19].replace("T", " "))


# ---- normal flow --------------------------------------------------------------


class TestPlaceAndList:
    def test_spec_core_100_empty_drive_lists_nothing(self, client):
        c, *_ = client
        assert _shortcuts(c) == []

    def test_spec_core_100_each_kind_is_listed_with_its_fields(self, client):
        c, *_ = client
        sf = _smart_folder(c, name="Lectures", query="lecture tag:math", file_type="video")
        col = _collection(c, name="Papers")
        pin = _pin(c, "Projects/Alpha/papers")
        for kind, tid in [("smart_folder", sf), ("collection", col), ("pin", pin)]:
            assert _put(c, kind, tid, True).status_code == 204

        items = {(i["kind"], i["id"]): i for i in _shortcuts(c)}
        assert items == {
            ("smart_folder", sf): {
                "kind": "smart_folder",
                "id": sf,
                "name": "Lectures",
                "query": "lecture tag:math",
                "file_type": "video",
            },
            ("collection", col): {
                "kind": "collection",
                "id": col,
                "name": "Papers",
                "query": None,
                "file_type": None,
            },
            ("pin", pin): {
                "kind": "pin",
                "id": "Projects/Alpha/papers",
                "name": "papers",
                "query": None,
                "file_type": None,
            },
        }

    def test_spec_core_100_a_smart_folder_without_type_lists_null_file_type(self, client):
        c, *_ = client
        sf = _smart_folder(c, name="All", query="x")
        assert _put(c, "smart_folder", sf, True).status_code == 204
        assert _shortcuts(c)[0]["file_type"] is None

    def test_spec_core_100_a_root_level_pin_is_named_by_its_path(self, client):
        c, *_ = client
        _pin(c, "旅行")
        assert _put(c, "pin", "旅行", True).status_code == 204
        assert _shortcuts(c) == [
            {"kind": "pin", "id": "旅行", "name": "旅行", "query": None, "file_type": None}
        ]

    def test_spec_core_100_targets_never_placed_are_not_listed(self, client):
        c, *_ = client
        placed = _collection(c, name="Placed")
        _collection(c, name="Not placed")
        _smart_folder(c, name="Not placed SF")
        _pin(c, "not-placed")
        assert _put(c, "collection", placed, True).status_code == 204
        assert _keys(_shortcuts(c)) == [("collection", placed)]


class TestPutWritesHomeAddedAt:
    """SPEC-CORE-100 I3."""

    @pytest.mark.parametrize("kind", ["smart_folder", "collection", "pin"])
    def test_spec_core_100_i3_placing_sets_the_current_utc_time(self, client, kind):
        c, db, *_ = client
        tid = {"smart_folder": lambda: _smart_folder(c), "collection": lambda: _collection(c), "pin": lambda: _pin(c, "p")}[kind]()
        assert _column(db, kind, tid, "home_added_at") is None

        before = datetime.utcnow() - timedelta(seconds=5)
        assert _put(c, kind, tid, True).status_code == 204
        after = datetime.utcnow() + timedelta(seconds=5)

        stamped = _column(db, kind, tid, "home_added_at")
        assert stamped is not None
        assert before <= _as_datetime(stamped) <= after

    @pytest.mark.parametrize("kind", ["smart_folder", "collection", "pin"])
    def test_spec_core_100_i3_placing_again_keeps_the_time(self, client, kind):
        c, db, *_ = client
        tid = {"smart_folder": lambda: _smart_folder(c), "collection": lambda: _collection(c), "pin": lambda: _pin(c, "p")}[kind]()
        assert _put(c, kind, tid, True).status_code == 204
        _set(db, kind, tid, "home_added_at", EARLY)

        assert _put(c, kind, tid, True).status_code == 204

        assert str(_column(db, kind, tid, "home_added_at")).startswith("2021-03-04")

    @pytest.mark.parametrize("kind", ["smart_folder", "collection", "pin"])
    def test_spec_core_100_i3_removing_sets_null(self, client, kind):
        c, db, *_ = client
        tid = {"smart_folder": lambda: _smart_folder(c), "collection": lambda: _collection(c), "pin": lambda: _pin(c, "p")}[kind]()
        assert _put(c, kind, tid, True).status_code == 204
        assert _column(db, kind, tid, "home_added_at") is not None

        assert _put(c, kind, tid, False).status_code == 204

        assert _column(db, kind, tid, "home_added_at") is None
        assert _shortcuts(c) == []

    def test_spec_core_100_i3_removing_a_target_off_home_answers_204(self, client):
        c, db, *_ = client
        col = _collection(c)
        assert _put(c, "collection", col, False).status_code == 204
        assert _column(db, "collection", col, "home_added_at") is None

    def test_spec_core_100_i3_unknown_kind_is_422_and_changes_nothing(self, client):
        c, db, *_ = client
        col = _collection(c)
        assert _put(c, "collection", col, True).status_code == 204
        _set(db, "collection", col, "home_added_at", EARLY)

        res = c.put(_url(), json={"kind": "folder", "id": col, "on_home": False})

        assert res.status_code == 422
        assert str(_column(db, "collection", col, "home_added_at")).startswith("2021-03-04")

    @pytest.mark.parametrize("kind,missing", [
        ("smart_folder", "nosuchsfid01"),
        ("collection", "nosuchcolid1"),
        ("pin", "no/such/pin"),
    ])
    def test_spec_core_100_i3_missing_target_is_404_and_changes_nothing(self, client, kind, missing):
        c, db, *_ = client
        sf = _smart_folder(c)
        col = _collection(c)
        _pin(c, "kept")
        for k, tid in [("smart_folder", sf), ("collection", col), ("pin", "kept")]:
            assert _put(c, k, tid, True).status_code == 204
        before = _shortcuts(c)

        assert _put(c, kind, missing, False).status_code == 404
        assert _put(c, kind, missing, True).status_code == 404

        assert _shortcuts(c) == before


class TestUpdatedAtUntouched:
    """SPEC-CORE-100 I8: a PUT is not an edit of the target."""

    @pytest.mark.parametrize("kind", ["smart_folder", "collection"])
    @pytest.mark.parametrize("on_home", [True, False])
    def test_spec_core_100_i8_put_leaves_updated_at(self, client, kind, on_home):
        c, db, *_ = client
        tid = _smart_folder(c) if kind == "smart_folder" else _collection(c)
        if not on_home:
            assert _put(c, kind, tid, True).status_code == 204
        _set(db, kind, tid, "updated_at", PAST)

        assert _put(c, kind, tid, on_home).status_code == 204

        assert str(_column(db, kind, tid, "updated_at")).startswith("2020-01-01")
        assert (_column(db, kind, tid, "home_added_at") is not None) is on_home

    def test_spec_core_100_i8_collections_list_does_not_reorder(self, client):
        c, db, *_ = client
        first = _collection(c, name="First")
        second = _collection(c, name="Second")
        _set(db, "collection", first, "updated_at", "2020-01-01 00:00:00.000000")
        _set(db, "collection", second, "updated_at", "2020-06-01 00:00:00.000000")
        order = [x["name"] for x in c.get(f"/api/drives/{TEST_DRIVE}/collections").json()]
        assert order == ["Second", "First"]

        assert _put(c, "collection", first, True).status_code == 204

        order = [x["name"] for x in c.get(f"/api/drives/{TEST_DRIVE}/collections").json()]
        assert order == ["Second", "First"]


# ---- ordering -------------------------------------------------------------------


class TestOrder:
    """SPEC-CORE-100 I4."""

    def test_spec_core_100_i4_first_placed_first(self, client):
        c, db, *_ = client
        a = _collection(c, name="A")
        b = _smart_folder(c, name="B")
        p = _pin(c, "C")
        for kind, tid in [("collection", a), ("smart_folder", b), ("pin", p)]:
            assert _put(c, kind, tid, True).status_code == 204
        _set(db, "pin", p, "home_added_at", "2021-01-01 00:00:00.000000")
        _set(db, "collection", a, "home_added_at", "2021-01-02 00:00:00.000000")
        _set(db, "smart_folder", b, "home_added_at", "2021-01-03 00:00:00.000000")

        assert _keys(_shortcuts(c)) == [("pin", p), ("collection", a), ("smart_folder", b)]

    def test_spec_core_100_i4_ties_by_kind_then_id(self, client):
        c, db, *_ = client
        sfs = [_smart_folder(c, name=f"sf{i}") for i in range(3)]
        cols = [_collection(c, name=f"col{i}") for i in range(3)]
        pins = [_pin(c, p) for p in ["b/zeta", "a/alpha", "B"]]
        early_sf = _smart_folder(c, name="early")
        targets = (
            [("smart_folder", x) for x in sfs]
            + [("collection", x) for x in cols]
            + [("pin", x) for x in pins]
            + [("smart_folder", early_sf)]
        )
        for kind, tid in targets:
            assert _put(c, kind, tid, True).status_code == 204
            _set(db, kind, tid, "home_added_at", TIED)
        _set(db, "smart_folder", early_sf, "home_added_at", EARLY)

        expected = (
            [("smart_folder", early_sf)]
            + [("collection", x) for x in sorted(cols)]
            + [("pin", x) for x in sorted(pins)]
            + [("smart_folder", x) for x in sorted(sfs)]
        )
        assert _keys(_shortcuts(c)) == expected

    def test_spec_core_100_i4_remove_and_place_again_moves_to_the_end(self, client):
        c, db, *_ = client
        a = _collection(c, name="A")
        b = _collection(c, name="B")
        assert _put(c, "collection", a, True).status_code == 204
        _set(db, "collection", a, "home_added_at", EARLY)
        assert _put(c, "collection", b, True).status_code == 204
        assert _keys(_shortcuts(c)) == [("collection", a), ("collection", b)]

        assert _put(c, "collection", a, False).status_code == 204
        assert _put(c, "collection", a, True).status_code == 204

        assert _keys(_shortcuts(c)) == [("collection", b), ("collection", a)]


# ---- targets that change or go away -------------------------------------------------


class TestTargetLifecycle:
    """SPEC-CORE-100 I2, I8."""

    def test_spec_core_100_i2_deleted_smart_folder_leaves_home(self, client):
        c, *_ = client
        sf = _smart_folder(c)
        assert _put(c, "smart_folder", sf, True).status_code == 204
        assert _keys(_shortcuts(c)) == [("smart_folder", sf)]

        assert c.delete(f"/api/drives/{TEST_DRIVE}/smart-folders/{sf}").status_code == 204

        assert _shortcuts(c) == []

    def test_spec_core_100_i2_deleted_collection_leaves_home(self, client):
        c, *_ = client
        col = _collection(c)
        assert _put(c, "collection", col, True).status_code == 204
        assert _keys(_shortcuts(c)) == [("collection", col)]

        assert c.delete(f"/api/drives/{TEST_DRIVE}/collections/{col}").status_code == 204

        assert _shortcuts(c) == []

    def test_spec_core_100_i2_unpinned_folder_leaves_home_and_repinning_starts_off(self, client):
        c, *_ = client
        _pin(c, "Projects/Alpha")
        assert _put(c, "pin", "Projects/Alpha", True).status_code == 204
        assert _keys(_shortcuts(c)) == [("pin", "Projects/Alpha")]

        assert c.delete(f"/api/drives/{TEST_DRIVE}/pins?path=Projects/Alpha").status_code == 204
        assert _shortcuts(c) == []

        _pin(c, "Projects/Alpha")
        assert _shortcuts(c) == []
        pins = c.get(f"/api/drives/{TEST_DRIVE}/pins").json()
        assert pins == [{"path": "Projects/Alpha", "on_home": False}]

    def test_spec_core_100_i5_renamed_targets_list_their_current_name(self, client):
        c, *_ = client
        sf = _smart_folder(c, name="Old SF")
        col = _collection(c, name="Old Col")
        assert _put(c, "smart_folder", sf, True).status_code == 204
        assert _put(c, "collection", col, True).status_code == 204

        assert c.patch(f"/api/drives/{TEST_DRIVE}/smart-folders/{sf}", json={"name": "New SF"}).status_code == 200
        assert c.put(f"/api/drives/{TEST_DRIVE}/collections/{col}", json={"name": "New Col"}).status_code == 200

        names = {i["id"]: i["name"] for i in _shortcuts(c)}
        assert names == {sf: "New SF", col: "New Col"}

    def test_spec_core_100_i8_smart_folder_edits_keep_home_added_at(self, client):
        c, db, *_ = client
        sf = _smart_folder(c, name="n", query="q", file_type="video")
        assert _put(c, "smart_folder", sf, True).status_code == 204
        _set(db, "smart_folder", sf, "home_added_at", EARLY)

        for body in ({"name": "renamed"}, {"query": "q2"}, {"file_type": "image"}):
            res = c.patch(f"/api/drives/{TEST_DRIVE}/smart-folders/{sf}", json=body)
            assert res.status_code == 200, res.text

        assert str(_column(db, "smart_folder", sf, "home_added_at")).startswith("2021-03-04")
        item = _shortcuts(c)[0]
        assert (item["name"], item["query"], item["file_type"]) == ("renamed", "q2", "image")

    def test_spec_core_100_i8_collection_edits_keep_home_added_at(self, client):
        c, db, *_ = client
        f1 = _seed_file(db, "a.mp3")
        f2 = _seed_file(db, "b.mp3")
        col = _collection(c, name="c")
        assert _put(c, "collection", col, True).status_code == 204
        _set(db, "collection", col, "home_added_at", EARLY)

        assert c.put(f"/api/drives/{TEST_DRIVE}/collections/{col}", json={"name": "c2"}).status_code == 200
        res = c.post(f"/api/drives/{TEST_DRIVE}/collections/{col}/items", json={"file_ids": [f1.id, f2.id]})
        assert res.status_code in (200, 201), res.text
        item_ids = [e["id"] for e in res.json()["items"]]
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/collections/{col}/items/reorder",
            json={"item_ids": list(reversed(item_ids))},
        )
        assert res.status_code == 200, res.text
        assert c.put(
            f"/api/drives/{TEST_DRIVE}/collections/{col}", json={"description": "notes"}
        ).status_code == 200
        res = c.delete(f"/api/drives/{TEST_DRIVE}/collections/{col}/items/{item_ids[0]}")
        assert res.status_code in (200, 204), res.text

        assert str(_column(db, "collection", col, "home_added_at")).startswith("2021-03-04")

    def test_spec_core_100_i8_renaming_a_folder_above_a_pin_carries_its_shortcut(self, client):
        c, db, drive_dir, _ = client
        (drive_dir / "trip" / "day1").mkdir(parents=True)
        _pin(c, "trip/day1")
        later = _collection(c, name="later")
        assert _put(c, "pin", "trip/day1", True).status_code == 204
        _set(db, "pin", "trip/day1", "home_added_at", EARLY)
        assert _put(c, "collection", later, True).status_code == 204

        res = c.put(f"/api/drives/{TEST_DRIVE}/folders", json={"path": "trip", "new_name": "journey"})
        assert res.status_code == 200, res.text

        items = _shortcuts(c)
        assert _keys(items) == [("pin", "journey/day1"), ("collection", later)]
        assert items[0]["name"] == "day1"
        assert str(_column(db, "pin", "journey/day1", "home_added_at")).startswith("2021-03-04")

    def test_spec_core_100_i8_moving_a_pinned_folder_carries_its_shortcut(self, client):
        c, db, drive_dir, _ = client
        (drive_dir / "trip").mkdir()
        (drive_dir / "dest").mkdir()
        _pin(c, "trip")
        assert _put(c, "pin", "trip", True).status_code == 204
        _set(db, "pin", "trip", "home_added_at", EARLY)

        res = c.put(f"/api/drives/{TEST_DRIVE}/folders/move", json={"path": "trip", "target_path": "dest"})
        assert res.status_code == 200, res.text

        assert _shortcuts(c) == [
            {"kind": "pin", "id": "dest/trip", "name": "trip", "query": None, "file_type": None}
        ]
        assert str(_column(db, "pin", "dest/trip", "home_added_at")).startswith("2021-03-04")
        pins = c.get(f"/api/drives/{TEST_DRIVE}/pins").json()
        assert pins == [{"path": "dest/trip", "on_home": True}]


# ---- on_home in the existing responses -------------------------------------------


class TestOnHomeInResponses:
    """SPEC-CORE-100 I10."""

    def test_spec_core_100_i10_smart_folder_list_create_update(self, client):
        c, *_ = client
        created = c.post(f"/api/drives/{TEST_DRIVE}/smart-folders", json={"name": "a", "query": "q"})
        assert created.status_code == 201
        assert created.json()["on_home"] is False
        sf = created.json()["id"]
        other = _smart_folder(c, name="b")

        assert _put(c, "smart_folder", sf, True).status_code == 204

        listed = {x["id"]: x["on_home"] for x in c.get(f"/api/drives/{TEST_DRIVE}/smart-folders").json()}
        assert listed == {sf: True, other: False}
        updated = c.patch(f"/api/drives/{TEST_DRIVE}/smart-folders/{sf}", json={"name": "a2"})
        assert updated.status_code == 200
        assert updated.json()["on_home"] is True

        assert _put(c, "smart_folder", sf, False).status_code == 204
        listed = {x["id"]: x["on_home"] for x in c.get(f"/api/drives/{TEST_DRIVE}/smart-folders").json()}
        assert listed == {sf: False, other: False}

    def test_spec_core_100_i10_pin_list_and_create(self, client):
        c, *_ = client
        created = c.post(f"/api/drives/{TEST_DRIVE}/pins", json={"path": "A"})
        assert created.status_code == 201
        assert created.json() == {"path": "A", "on_home": False}
        _pin(c, "B")

        assert _put(c, "pin", "A", True).status_code == 204

        assert c.get(f"/api/drives/{TEST_DRIVE}/pins").json() == [
            {"path": "A", "on_home": True},
            {"path": "B", "on_home": False},
        ]

    def test_spec_core_100_i10_collection_detail_add_items_reorder(self, client):
        c, db, *_ = client
        f1 = _seed_file(db, "a.mp3")
        f2 = _seed_file(db, "b.mp3")
        col = _collection(c)
        assert c.get(f"/api/drives/{TEST_DRIVE}/collections/{col}").json()["on_home"] is False

        assert _put(c, "collection", col, True).status_code == 204

        assert c.get(f"/api/drives/{TEST_DRIVE}/collections/{col}").json()["on_home"] is True
        added = c.post(f"/api/drives/{TEST_DRIVE}/collections/{col}/items", json={"file_ids": [f1.id, f2.id]})
        assert added.json()["on_home"] is True
        item_ids = [e["id"] for e in added.json()["items"]]
        reordered = c.put(
            f"/api/drives/{TEST_DRIVE}/collections/{col}/items/reorder",
            json={"item_ids": list(reversed(item_ids))},
        )
        assert reordered.status_code == 200
        assert reordered.json()["on_home"] is True

        assert _put(c, "collection", col, False).status_code == 204
        assert c.get(f"/api/drives/{TEST_DRIVE}/collections/{col}").json()["on_home"] is False


# ---- drive boundary and access -------------------------------------------------------


class TestDriveBoundary:
    """SPEC-CORE-100 I1."""

    def test_spec_core_100_i1_get_lists_only_this_drive(self, two_drive_client):
        c, *_ = two_drive_client
        mine = _collection(c, name="mine")
        theirs = _collection(c, name="theirs", drive=SECOND_DRIVE)
        _pin(c, "shared/path")
        _pin(c, "shared/path", drive=SECOND_DRIVE)
        assert _put(c, "collection", mine, True).status_code == 204
        assert _put(c, "collection", theirs, True, drive=SECOND_DRIVE).status_code == 204
        assert _put(c, "pin", "shared/path", True, drive=SECOND_DRIVE).status_code == 204

        assert _keys(_shortcuts(c)) == [("collection", mine)]
        assert sorted(_keys(_shortcuts(c, SECOND_DRIVE))) == sorted(
            [("collection", theirs), ("pin", "shared/path")]
        )

    @pytest.mark.parametrize("kind", ["smart_folder", "collection"])
    def test_spec_core_100_i1_put_naming_another_drives_id_is_404(self, two_drive_client, kind):
        c, db, *_ = two_drive_client
        make = _smart_folder if kind == "smart_folder" else _collection
        theirs = make(c, name="theirs", drive=SECOND_DRIVE)
        assert _put(c, kind, theirs, True, drive=SECOND_DRIVE).status_code == 204
        _set(db, kind, theirs, "home_added_at", EARLY, drive=SECOND_DRIVE)

        assert _put(c, kind, theirs, False).status_code == 404
        assert _put(c, kind, theirs, True).status_code == 404

        assert str(_column(db, kind, theirs, "home_added_at", drive=SECOND_DRIVE)).startswith("2021-03-04")
        assert _shortcuts(c) == []

    def test_spec_core_100_i1_put_on_a_path_pinned_only_in_another_drive_is_404(self, two_drive_client):
        c, db, *_ = two_drive_client
        _pin(c, "only-there", drive=SECOND_DRIVE)
        assert _put(c, "pin", "only-there", True, drive=SECOND_DRIVE).status_code == 204
        _set(db, "pin", "only-there", "home_added_at", EARLY, drive=SECOND_DRIVE)

        assert _put(c, "pin", "only-there", False).status_code == 404

        assert str(_column(db, "pin", "only-there", "home_added_at", drive=SECOND_DRIVE)).startswith("2021-03-04")

    def test_spec_core_100_unknown_drive_is_404(self, client):
        c, *_ = client
        assert c.get(_url()).status_code == 200
        assert c.get(_url("no-such-drive")).status_code == 404
        assert _put(c, "collection", "abc", True, drive="no-such-drive").status_code == 404

    def test_spec_core_100_locked_drive_is_404_and_unlocked_works(self, protected_client):
        c, db, *_ = protected_client
        assert c.get(_url()).status_code == 404

        import app.auth as auth

        token, _ = auth.create_jwt(["private"], remember=False)
        c.headers["Authorization"] = f"Bearer {token}"
        col = _collection(c)
        assert _put(c, "collection", col, True).status_code == 204
        assert _keys(_shortcuts(c)) == [("collection", col)]
        _set(db, "collection", col, "home_added_at", EARLY)

        del c.headers["Authorization"]
        assert c.get(_url()).status_code == 404
        assert _put(c, "collection", col, False).status_code == 404
        assert str(_column(db, "collection", col, "home_added_at")).startswith("2021-03-04")

    def test_spec_core_100_no_viewer_cookie_needed(self, client):
        c, *_ = client
        c.cookies.clear()
        col = _collection(c)
        assert _put(c, "collection", col, True).status_code == 204
        assert _keys(_shortcuts(c)) == [("collection", col)]
