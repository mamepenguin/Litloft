"""SPEC-CORE-153: app shortcuts (`kind: "app_target"`) in
`GET` / `PUT /api/drives/{drive}/home-shortcuts`, and the revised SPEC-CORE-100
I1 / I4 for a response that mixes them with the older kinds."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

import app.config as config
from tests.conftest import TEST_DRIVE


SECOND_DRIVE = "second-drive"
PAST = "2020-01-01 00:00:00.000000"
EARLY = "2021-03-04 05:06:07.000000"
TIED = "2022-01-01 00:00:00.000000"


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


def _put_app(c, app, target_id, on_home, drive=TEST_DRIVE):
    return c.put(_url(drive), json={"kind": "app_target", "app": app, "id": target_id, "on_home": on_home})


def _put(c, kind, target_id, on_home, drive=TEST_DRIVE):
    return c.put(_url(drive), json={"kind": kind, "id": target_id, "on_home": on_home})


def _shortcuts(c, drive=TEST_DRIVE):
    res = c.get(_url(drive))
    assert res.status_code == 200, res.text
    return res.json()


def _keys(items):
    return [(i["kind"], i.get("app"), i["id"]) for i in items]


def _smart_folder(c, name="SF", query="lecture", drive=TEST_DRIVE):
    res = c.post(f"/api/drives/{drive}/smart-folders", json={"name": name, "query": query})
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


def _app_rows(db, drive=None):
    db.expire_all()
    sql = "SELECT drive, app, target, home_added_at FROM home_app_shortcuts"
    params = {}
    if drive is not None:
        sql += " WHERE drive = :drive"
        params["drive"] = drive
    return [tuple(r) for r in db.execute(text(sql + " ORDER BY id"), params)]


def _app_added_at(db, app, target, drive=TEST_DRIVE):
    db.expire_all()
    return db.execute(
        text("SELECT home_added_at FROM home_app_shortcuts WHERE drive = :d AND app = :a AND target = :t"),
        {"d": drive, "a": app, "t": target},
    ).scalar()


def _set_app_added_at(db, app, target, value, drive=TEST_DRIVE):
    db.execute(
        text("UPDATE home_app_shortcuts SET home_added_at = :v WHERE drive = :d AND app = :a AND target = :t"),
        {"v": value, "d": drive, "a": app, "t": target},
    )
    db.commit()


TABLE = {"smart_folder": "smart_folders", "collection": "collections", "pin": "pinned_folders"}


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


def _as_datetime(value):
    return datetime.fromisoformat(str(value)[:19].replace("T", " "))


# ---- normal flow --------------------------------------------------------------


class TestPlaceAndList:
    def test_spec_core_153_i2_a_smart_folder_app_shortcut_is_listed_with_its_fields(self, client):
        c, *_ = client
        sf = _smart_folder(c, name="Recipes", query="tag:recipe")

        assert _put_app(c, "video", sf, True).status_code == 204

        assert _shortcuts(c) == [
            {"kind": "app_target", "id": sf, "app": "video", "name": "Recipes", "query": None, "file_type": None}
        ]

    def test_spec_core_153_i1_a_collection_app_shortcut_keeps_the_prefix_and_the_collection_name(self, client):
        c, *_ = client
        col = _collection(c, name="レシピ")

        assert _put_app(c, "knowledge/clips", f"collection:{col}", True).status_code == 204

        assert _shortcuts(c) == [
            {
                "kind": "app_target",
                "id": f"collection:{col}",
                "app": "knowledge/clips",
                "name": "レシピ",
                "query": None,
                "file_type": None,
            }
        ]

    def test_spec_core_153_older_kinds_carry_app_null_beside_an_app_shortcut(self, client):
        c, *_ = client
        sf = _smart_folder(c, name="SF")
        col = _collection(c, name="Col")
        _pin(c, "Projects/Alpha")
        for kind, tid in [("smart_folder", sf), ("collection", col), ("pin", "Projects/Alpha")]:
            assert _put(c, kind, tid, True).status_code == 204
        assert _put_app(c, "reading", sf, True).status_code == 204

        items = _shortcuts(c)
        by_kind = {i["kind"]: i for i in items}
        assert set(by_kind) == {"smart_folder", "collection", "pin", "app_target"}
        assert by_kind["smart_folder"]["app"] is None
        assert by_kind["collection"]["app"] is None
        assert by_kind["pin"]["app"] is None
        assert by_kind["app_target"]["app"] == "reading"

    def test_spec_core_153_i9_the_same_target_in_two_apps_is_two_shortcuts(self, client):
        c, *_ = client
        col = _collection(c, name="Shared")
        target = f"collection:{col}"

        assert _put_app(c, "knowledge", target, True).status_code == 204
        assert _put_app(c, "knowledge/clips", target, True).status_code == 204

        assert sorted(_keys(_shortcuts(c))) == [
            ("app_target", "knowledge", target),
            ("app_target", "knowledge/clips", target),
        ]

        assert _put_app(c, "knowledge", target, False).status_code == 204
        assert _keys(_shortcuts(c)) == [("app_target", "knowledge/clips", target)]

    def test_spec_core_153_an_app_shortcut_and_the_targets_own_shortcut_are_separate(self, client):
        c, *_ = client
        col = _collection(c, name="Both")
        assert _put(c, "collection", col, True).status_code == 204
        assert _put_app(c, "video", f"collection:{col}", True).status_code == 204

        assert sorted(_keys(_shortcuts(c))) == [
            ("app_target", "video", f"collection:{col}"),
            ("collection", None, col),
        ]

    def test_spec_core_153_no_limit_on_the_number_of_app_shortcuts(self, client):
        c, *_ = client
        sfs = [_smart_folder(c, name=f"sf{i}") for i in range(25)]
        for sf in sfs:
            assert _put_app(c, "video", sf, True).status_code == 204
        assert len(_shortcuts(c)) == 25


class TestStates:
    """SPEC-CORE-153 I2, I11."""

    def test_spec_core_153_i2_placing_writes_one_row_at_the_current_utc_time(self, client):
        c, db, *_ = client
        sf = _smart_folder(c)

        before = datetime.utcnow() - timedelta(seconds=5)
        assert _put_app(c, "video", sf, True).status_code == 204
        after = datetime.utcnow() + timedelta(seconds=5)

        rows = _app_rows(db)
        assert [(d, a, t) for d, a, t, _ in rows] == [(TEST_DRIVE, "video", sf)]
        assert before <= _as_datetime(rows[0][3]) <= after

    def test_spec_core_153_i2_placing_again_keeps_the_first_time_and_one_row(self, client):
        c, db, *_ = client
        sf = _smart_folder(c)
        assert _put_app(c, "video", sf, True).status_code == 204
        _set_app_added_at(db, "video", sf, EARLY)

        assert _put_app(c, "video", sf, True).status_code == 204

        assert len(_app_rows(db)) == 1
        assert str(_app_added_at(db, "video", sf)).startswith("2021-03-04")

    def test_spec_core_153_i2_removing_deletes_the_row(self, client):
        c, db, *_ = client
        sf = _smart_folder(c)
        other = _smart_folder(c, name="kept")
        assert _put_app(c, "video", sf, True).status_code == 204
        assert _put_app(c, "video", other, True).status_code == 204

        assert _put_app(c, "video", sf, False).status_code == 204

        assert [(a, t) for _, a, t, _ in _app_rows(db)] == [("video", other)]
        assert _keys(_shortcuts(c)) == [("app_target", "video", other)]

    def test_spec_core_153_i2_remove_and_place_again_moves_to_the_end(self, client):
        c, db, *_ = client
        a = _smart_folder(c, name="A")
        b = _smart_folder(c, name="B")
        assert _put_app(c, "video", a, True).status_code == 204
        _set_app_added_at(db, "video", a, EARLY)
        assert _put_app(c, "video", b, True).status_code == 204
        assert _keys(_shortcuts(c)) == [("app_target", "video", a), ("app_target", "video", b)]

        assert _put_app(c, "video", a, False).status_code == 204
        assert _put_app(c, "video", a, True).status_code == 204

        assert _keys(_shortcuts(c)) == [("app_target", "video", b), ("app_target", "video", a)]

    def test_spec_core_153_i11_removing_an_existing_target_with_no_row_is_204_and_changes_nothing(self, client):
        c, db, *_ = client
        sf = _smart_folder(c)
        kept = _smart_folder(c, name="kept")
        assert _put_app(c, "video", kept, True).status_code == 204
        _set_app_added_at(db, "video", kept, EARLY)
        before = _app_rows(db)

        assert _put_app(c, "video", sf, False).status_code == 204
        assert _put_app(c, "reading", kept, False).status_code == 204

        assert _app_rows(db) == before
        assert _keys(_shortcuts(c)) == [("app_target", "video", kept)]

    def test_spec_core_153_i11_a_second_remove_is_204(self, client):
        c, db, *_ = client
        sf = _smart_folder(c)
        assert _put_app(c, "video", sf, True).status_code == 204

        assert _put_app(c, "video", sf, False).status_code == 204
        assert _put_app(c, "video", sf, False).status_code == 204

        assert _app_rows(db) == []


class TestValidation:
    """SPEC-CORE-153 I2: a malformed request is 422 and changes no row."""

    @pytest.mark.parametrize(
        "app",
        [
            "video",
            "knowledge",
            "knowledge/clips",
            "a",
            "0",
            "a_b-c",
            "x" * 64,
            "a/" + "b" * 62,
        ],
    )
    def test_spec_core_153_i2_an_app_in_the_pattern_is_accepted(self, client, app):
        c, *_ = client
        sf = _smart_folder(c)

        assert _put_app(c, app, sf, True).status_code == 204

        assert _keys(_shortcuts(c)) == [("app_target", app, sf)]

    @pytest.mark.parametrize(
        "body_app",
        [
            pytest.param(None, id="null"),
            pytest.param("", id="empty"),
            pytest.param("Video", id="uppercase"),
            pytest.param("_video", id="leading-underscore"),
            pytest.param("-video", id="leading-dash"),
            pytest.param("/video", id="leading-slash"),
            pytest.param("video/", id="trailing-slash"),
            pytest.param("a/b/c", id="two-slashes"),
            pytest.param("a//b", id="empty-segment"),
            pytest.param("a b", id="space"),
            pytest.param("ビデオ", id="non-ascii"),
            pytest.param("x" * 65, id="65-chars"),
            pytest.param("a/" + "b" * 63, id="65-chars-with-slash"),
        ],
    )
    def test_spec_core_153_i2_a_malformed_app_is_422_and_changes_no_row(self, client, body_app):
        c, db, *_ = client
        sf = _smart_folder(c)
        assert _put_app(c, "video", sf, True).status_code == 204
        _set_app_added_at(db, "video", sf, EARLY)
        before = _app_rows(db)

        for on_home in (True, False):
            res = c.put(_url(), json={"kind": "app_target", "app": body_app, "id": sf, "on_home": on_home})
            assert res.status_code == 422, res.text

        assert _app_rows(db) == before

    def test_spec_core_153_i2_app_target_without_app_is_422_and_changes_no_row(self, client):
        c, db, *_ = client
        sf = _smart_folder(c)
        assert _put_app(c, "video", sf, True).status_code == 204
        before = _app_rows(db)

        for on_home in (True, False):
            res = c.put(_url(), json={"kind": "app_target", "id": sf, "on_home": on_home})
            assert res.status_code == 422, res.text

        assert _app_rows(db) == before

    @pytest.mark.parametrize("kind", ["smart_folder", "collection", "pin"])
    def test_spec_core_153_i2_an_app_with_another_kind_is_422_and_changes_nothing(self, client, kind):
        c, db, *_ = client
        sf = _smart_folder(c)
        col = _collection(c)
        _pin(c, "p")
        tid = {"smart_folder": sf, "collection": col, "pin": "p"}[kind]
        assert _put_app(c, "video", sf, True).status_code == 204
        before = _app_rows(db)

        res = c.put(_url(), json={"kind": kind, "app": "video", "id": tid, "on_home": True})

        assert res.status_code == 422, res.text
        assert _column(db, kind, tid, "home_added_at") is None
        assert _app_rows(db) == before


class TestTargetResolution:
    """SPEC-CORE-153 I1: a target is resolved within the request's drive only."""

    @pytest.mark.parametrize(
        "missing",
        [
            pytest.param("default", id="default"),
            pytest.param("nosuchsfid01", id="unknown-smart-folder"),
            pytest.param("collection:nosuchcolid1", id="unknown-collection"),
            pytest.param("collection:", id="empty-collection-id"),
        ],
    )
    def test_spec_core_153_i1_a_target_not_in_the_drive_is_404_and_writes_nothing(self, client, missing):
        c, db, *_ = client
        sf = _smart_folder(c)
        assert _put_app(c, "video", sf, True).status_code == 204
        before = _app_rows(db)

        assert _put_app(c, "video", missing, True).status_code == 404
        assert _put_app(c, "video", missing, False).status_code == 404

        assert _app_rows(db) == before

    def test_spec_core_153_i1_a_collection_id_without_its_prefix_is_not_a_collection(self, client):
        c, db, *_ = client
        col = _collection(c)
        sf = _smart_folder(c)
        assert _put_app(c, "video", sf, True).status_code == 204
        before = _app_rows(db)

        assert _put_app(c, "video", col, True).status_code == 404

        assert _app_rows(db) == before

    def test_spec_core_153_i1_a_smart_folder_id_under_the_collection_prefix_is_404(self, client):
        c, db, *_ = client
        sf = _smart_folder(c)
        assert _put_app(c, "video", sf, True).status_code == 204
        before = _app_rows(db)

        assert _put_app(c, "video", f"collection:{sf}", True).status_code == 404

        assert _app_rows(db) == before

    @pytest.mark.parametrize("kind", ["smart_folder", "collection"])
    def test_spec_core_153_i1_another_drives_target_is_404_and_writes_nothing(self, two_drive_client, kind):
        c, db, *_ = two_drive_client
        if kind == "smart_folder":
            theirs = _smart_folder(c, name="theirs", drive=SECOND_DRIVE)
        else:
            theirs = f"collection:{_collection(c, name='theirs', drive=SECOND_DRIVE)}"
        assert _put_app(c, "video", theirs, True, drive=SECOND_DRIVE).status_code == 204
        before = _app_rows(db)

        assert _put_app(c, "video", theirs, True).status_code == 404
        assert _put_app(c, "video", theirs, False).status_code == 404

        assert _app_rows(db) == before
        assert _shortcuts(c) == []
        assert _keys(_shortcuts(c, SECOND_DRIVE)) == [("app_target", "video", theirs)]

    def test_spec_core_153_i1_get_lists_only_this_drives_rows(self, two_drive_client):
        c, *_ = two_drive_client
        mine = _smart_folder(c, name="mine")
        theirs = _smart_folder(c, name="theirs", drive=SECOND_DRIVE)
        assert _put_app(c, "video", mine, True).status_code == 204
        assert _put_app(c, "video", theirs, True, drive=SECOND_DRIVE).status_code == 204

        assert _keys(_shortcuts(c)) == [("app_target", "video", mine)]
        assert _keys(_shortcuts(c, SECOND_DRIVE)) == [("app_target", "video", theirs)]

    def test_spec_core_153_i1_a_row_whose_target_lives_in_another_drive_is_not_listed(self, two_drive_client):
        c, db, *_ = two_drive_client
        mine = _smart_folder(c, name="mine")
        theirs = _smart_folder(c, name="theirs", drive=SECOND_DRIVE)
        assert _put_app(c, "video", mine, True).status_code == 204
        db.execute(
            text("UPDATE home_app_shortcuts SET target = :t WHERE drive = :d"),
            {"t": theirs, "d": TEST_DRIVE},
        )
        db.commit()

        assert _shortcuts(c) == []

    def test_spec_core_153_i1_deleted_targets_leave_home(self, client):
        c, db, *_ = client
        sf = _smart_folder(c, name="sf")
        col = _collection(c, name="col")
        assert _put_app(c, "video", sf, True).status_code == 204
        assert _put_app(c, "video", f"collection:{col}", True).status_code == 204
        assert len(_shortcuts(c)) == 2

        assert c.delete(f"/api/drives/{TEST_DRIVE}/smart-folders/{sf}").status_code == 204
        assert _keys(_shortcuts(c)) == [("app_target", "video", f"collection:{col}")]

        assert c.delete(f"/api/drives/{TEST_DRIVE}/collections/{col}").status_code == 204
        assert _shortcuts(c) == []

    def test_spec_core_153_i1_renamed_targets_list_their_current_name(self, client):
        c, *_ = client
        sf = _smart_folder(c, name="Old SF")
        col = _collection(c, name="Old Col")
        assert _put_app(c, "video", sf, True).status_code == 204
        assert _put_app(c, "knowledge", f"collection:{col}", True).status_code == 204

        assert c.patch(f"/api/drives/{TEST_DRIVE}/smart-folders/{sf}", json={"name": "New SF"}).status_code == 200
        assert c.put(f"/api/drives/{TEST_DRIVE}/collections/{col}", json={"name": "New Col"}).status_code == 200

        names = {i["id"]: i["name"] for i in _shortcuts(c)}
        assert names == {sf: "New SF", f"collection:{col}": "New Col"}


class TestOnlyItsOwnTable:
    """SPEC-CORE-153 I14."""

    @pytest.mark.parametrize("on_home", [True, False])
    def test_spec_core_153_i14_put_leaves_the_smart_folder_row(self, client, on_home):
        c, db, *_ = client
        sf = _smart_folder(c)
        if not on_home:
            assert _put_app(c, "video", sf, True).status_code == 204
        _set(db, "smart_folder", sf, "updated_at", PAST)

        assert _put_app(c, "video", sf, on_home).status_code == 204

        assert str(_column(db, "smart_folder", sf, "updated_at")).startswith("2020-01-01")
        assert _column(db, "smart_folder", sf, "home_added_at") is None
        assert (len(_app_rows(db)) == 1) is on_home

    @pytest.mark.parametrize("on_home", [True, False])
    def test_spec_core_153_i14_put_leaves_the_collection_row(self, client, on_home):
        c, db, *_ = client
        col = _collection(c)
        if not on_home:
            assert _put_app(c, "video", f"collection:{col}", True).status_code == 204
        _set(db, "collection", col, "updated_at", PAST)

        assert _put_app(c, "video", f"collection:{col}", on_home).status_code == 204

        assert str(_column(db, "collection", col, "updated_at")).startswith("2020-01-01")
        assert _column(db, "collection", col, "home_added_at") is None
        assert (len(_app_rows(db)) == 1) is on_home

    def test_spec_core_153_i14_the_targets_own_shortcut_keeps_its_time_through_both_puts(self, client):
        c, db, *_ = client
        sf = _smart_folder(c)
        col = _collection(c)
        _pin(c, "p")
        for kind, tid in [("smart_folder", sf), ("collection", col), ("pin", "p")]:
            assert _put(c, kind, tid, True).status_code == 204
            _set(db, kind, tid, "home_added_at", EARLY)

        assert _put_app(c, "video", sf, True).status_code == 204
        assert _put_app(c, "video", f"collection:{col}", True).status_code == 204
        assert _put_app(c, "video", sf, False).status_code == 204
        assert _put_app(c, "video", f"collection:{col}", False).status_code == 204

        for kind, tid in [("smart_folder", sf), ("collection", col), ("pin", "p")]:
            assert str(_column(db, kind, tid, "home_added_at")).startswith("2021-03-04"), kind
        assert sorted((k, i) for k, _, i in _keys(_shortcuts(c))) == [
            ("collection", col),
            ("pin", "p"),
            ("smart_folder", sf),
        ]


class TestOrder:
    """SPEC-CORE-100 I4 as revised by SPEC-CORE-153."""

    def test_spec_core_153_one_get_orders_every_kind_by_placement_time(self, client):
        c, db, *_ = client
        sf = _smart_folder(c, name="sf")
        col = _collection(c, name="col")
        _pin(c, "pin")
        assert _put(c, "collection", col, True).status_code == 204
        assert _put_app(c, "video", sf, True).status_code == 204
        assert _put(c, "pin", "pin", True).status_code == 204
        assert _put_app(c, "knowledge", f"collection:{col}", True).status_code == 204
        _set(db, "pin", "pin", "home_added_at", "2021-01-01 00:00:00.000000")
        _set_app_added_at(db, "knowledge", f"collection:{col}", "2021-01-02 00:00:00.000000")
        _set(db, "collection", col, "home_added_at", "2021-01-03 00:00:00.000000")
        _set_app_added_at(db, "video", sf, "2021-01-04 00:00:00.000000")

        assert _keys(_shortcuts(c)) == [
            ("pin", None, "pin"),
            ("app_target", "knowledge", f"collection:{col}"),
            ("collection", None, col),
            ("app_target", "video", sf),
        ]

    def test_spec_core_153_app_shortcuts_placed_through_the_api_follow_placement_order(self, client):
        c, *_ = client
        sf = _smart_folder(c, name="sf")
        col = _collection(c, name="col")
        assert _put_app(c, "video", sf, True).status_code == 204
        assert _put(c, "collection", col, True).status_code == 204
        assert _put_app(c, "reading", sf, True).status_code == 204

        assert _keys(_shortcuts(c)) == [
            ("app_target", "video", sf),
            ("collection", None, col),
            ("app_target", "reading", sf),
        ]

    def test_spec_core_153_ties_by_kind_then_id_then_app(self, client):
        c, db, *_ = client
        sf1 = _smart_folder(c, name="sf1")
        sf2 = _smart_folder(c, name="sf2")
        col = _collection(c, name="col")
        _pin(c, "p")
        app_targets = [
            ("video", sf2),
            ("knowledge/clips", sf1),
            ("video", sf1),
            ("knowledge", sf1),
            ("reading", f"collection:{col}"),
        ]
        for app, tid in app_targets:
            assert _put_app(c, app, tid, True).status_code == 204
            _set_app_added_at(db, app, tid, TIED)
        for kind, tid in [("smart_folder", sf1), ("collection", col), ("pin", "p")]:
            assert _put(c, kind, tid, True).status_code == 204
            _set(db, kind, tid, "home_added_at", TIED)

        expected_apps = sorted(app_targets, key=lambda at: (at[1], at[0]))
        assert _keys(_shortcuts(c)) == (
            [("app_target", app, tid) for app, tid in expected_apps]
            + [("collection", None, col), ("pin", None, "p"), ("smart_folder", None, sf1)]
        )


class TestAccess:
    """SPEC-CORE-153 Authorization."""

    def test_spec_core_153_unknown_drive_is_404(self, client):
        c, *_ = client
        sf = _smart_folder(c)
        assert _put_app(c, "video", sf, True).status_code == 204
        assert _put_app(c, "video", sf, True, drive="no-such-drive").status_code == 404

    def test_spec_core_153_locked_drive_is_404_and_unlocked_works(self, protected_client):
        c, db, *_ = protected_client
        import app.auth as auth

        token, _ = auth.create_jwt(["private"], remember=False)
        c.headers["Authorization"] = f"Bearer {token}"
        sf = _smart_folder(c)
        assert _put_app(c, "video", sf, True).status_code == 204
        assert _keys(_shortcuts(c)) == [("app_target", "video", sf)]
        before = _app_rows(db)

        del c.headers["Authorization"]
        assert c.get(_url()).status_code == 404
        assert _put_app(c, "video", sf, False).status_code == 404
        assert _put_app(c, "reading", sf, True).status_code == 404
        assert _app_rows(db) == before

    def test_spec_core_153_no_viewer_cookie_needed(self, client):
        c, *_ = client
        c.cookies.clear()
        sf = _smart_folder(c)
        assert _put_app(c, "video", sf, True).status_code == 204
        assert _keys(_shortcuts(c)) == [("app_target", "video", sf)]


# ---- the table on an older database -------------------------------------------------


class TestMigration:
    """SPEC-CORE-153 I13."""

    def test_spec_core_153_i13_init_db_adds_the_table_and_keeps_every_row(self, tmp_path, monkeypatch):
        import app.database as database

        monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
        (tmp_path / "data").mkdir()
        engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
        monkeypatch.setattr(database, "engine", engine)
        database.init_db()
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS home_app_shortcuts"))
            conn.execute(text(
                "INSERT INTO smart_folders (id, drive, viewer_id, name, query, file_type,"
                " sort_by, sort_order, created_at, updated_at, home_added_at) VALUES"
                " ('sfaaaaaaaaaa', 'd', NULL, 'Lectures', 'lecture', 'video', 'created_at',"
                "  'desc', '2026-01-01 00:00:00.000000', '2026-02-02 00:00:00.000000',"
                "  '2026-03-03 00:00:00.000000')"
            ))
            conn.execute(text(
                "INSERT INTO pinned_folders (drive, path, created_at, home_added_at) VALUES"
                " ('d', 'Projects/Alpha', '2026-01-04 00:00:00.000000', NULL)"
            ))
            conn.execute(text(
                "INSERT INTO collections (id, drive, name, description, created_at, updated_at,"
                " home_added_at) VALUES ('colaaaaaaaaa', 'd', 'Papers', 'desc',"
                " '2026-01-06 00:00:00.000000', '2026-01-07 00:00:00.000000',"
                " '2026-01-08 00:00:00.000000')"
            ))
        tables_before = set(inspect(engine).get_table_names())
        assert "home_app_shortcuts" not in tables_before

        def rows(table):
            with engine.connect() as conn:
                return [dict(r._mapping) for r in conn.execute(text(f"SELECT * FROM {table} ORDER BY rowid"))]

        before = {t: rows(t) for t in tables_before}
        columns_before = {t: {col["name"] for col in inspect(engine).get_columns(t)} for t in tables_before}

        database.init_db()

        insp = inspect(engine)
        assert set(insp.get_table_names()) == tables_before | {"home_app_shortcuts"}
        for table in tables_before:
            assert {col["name"] for col in insp.get_columns(table)} == columns_before[table], table
            assert rows(table) == before[table], table

        columns = {col["name"]: col for col in insp.get_columns("home_app_shortcuts")}
        assert {"id", "drive", "app", "target", "home_added_at"} <= set(columns)
        assert columns["home_added_at"]["nullable"] is False
        uniques = [set(u["column_names"]) for u in insp.get_unique_constraints("home_app_shortcuts")]
        assert {"drive", "app", "target"} in uniques
        engine.dispose()
