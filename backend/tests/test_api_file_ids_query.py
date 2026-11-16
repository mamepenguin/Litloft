"""Acceptance tests for SPEC-CORE-115: the id filter on the listing and the shelves.

`POST /api/drives/{drive}/files/query` and `POST /api/drives/{drive}/shelves/query`
answer what the matching GET answers for the same parameters, restricted by the
`file_ids` semantics (I1): a file passes `in:` when it is in a named collection or
listed in `file_ids`, only when listed if no collection is named, and every other
condition still applies. Invariant ids are those of
docs/specs/smart-collection-id-filter.md.

Where the equality with the GET can be stated, the expected answer is derived
from the GET.
"""

from __future__ import annotations

import pytest

from app.models import Collection, CollectionItem, File
from tests.conftest import TEST_DRIVE
from tests.test_api_shelves import ALICE, _seed
from tests.test_auth import _make_auth_client

MAX_IDS = 10_000
# An id no file has. `ids` on the GET shelves rejects an empty element, so an
# empty expected set is expressed as this id.
NO_FILE = "nofile000000"


def _collection(db, name: str, files: list[File], drive: str = TEST_DRIVE) -> Collection:
    collection = Collection(drive=drive, name=name)
    db.add(collection)
    db.commit()
    db.refresh(collection)
    for position, file in enumerate(files):
        db.add(CollectionItem(collection_id=collection.id, file_id=file.id, position=position))
    db.commit()
    return collection


def _seed_all(db) -> tuple[dict[str, File], dict[str, list[str]]]:
    rows = _seed(db)
    members = {
        "Picks": [rows["a2.mp4"].id, rows["b2.mp4"].id, rows["gone.mp4"].id],
        "Other": [rows["root.mp4"].id, rows["pic.jpg"].id],
    }
    _collection(db, "Picks", [rows["a2.mp4"], rows["b2.mp4"], rows["gone.mp4"]])
    _collection(db, "Other", [rows["root.mp4"], rows["pic.jpg"]])
    return rows, members


def _files_get(c, params: list[tuple[str, str]], headers=None, drive: str = TEST_DRIVE):
    return c.get(f"/api/drives/{drive}/files", params=params, headers=headers or {})


def _files_post(c, params: list[tuple[str, str]], body, headers=None, drive: str = TEST_DRIVE):
    return c.post(
        f"/api/drives/{drive}/files/query", params=params, json=body, headers=headers or {}
    )


def _shelves_get(c, params: list[tuple[str, str]], headers=None, drive: str = TEST_DRIVE):
    return c.get(f"/api/drives/{drive}/shelves", params=params, headers=headers or {})


def _shelves_post(c, params: list[tuple[str, str]], body, headers=None, drive: str = TEST_DRIVE):
    return c.post(
        f"/api/drives/{drive}/shelves/query", params=params, json=body, headers=headers or {}
    )


def _ok(res) -> dict:
    assert res.status_code == 200, res.text
    return res.json()


def _passing(collections: list[str], members: dict[str, list[str]], file_ids: list[str]) -> set[str]:
    """The ids that pass the `in:` condition under the `file_ids` semantics."""
    allowed = set(file_ids)
    for name in collections:
        allowed |= set(members.get(name, []))
    return allowed


def _rows(rows: dict[str, File], *names: str) -> list[str]:
    return [rows[n].id for n in names]


# Each case: (label, listing params other than collection, collections, file id names).
LISTING_CASES = [
    ("ids only", [("sort", "title"), ("order", "asc")], [], ["a1.mp4", "b1.mp4"]),
    ("ids only, default sort", [], [], ["a1.mp4", "b1.mp4", "x.mp4"]),
    ("empty ids alone pass nothing", [("sort", "title"), ("order", "asc")], [], []),
    ("empty ids with a collection pass the collection", [("sort", "title"), ("order", "asc")], ["Picks"], []),
    ("collection or ids", [("sort", "title"), ("order", "asc")], ["Picks"], ["a1.mp4", "x.mp4"]),
    ("two collections or ids", [("sort", "title"), ("order", "asc")], ["Picks", "Other"], ["x.mp4"]),
    ("a collection name matching nothing still lets ids pass", [("sort", "title"), ("order", "asc")], ["nowhere"], ["b1.mp4"]),
    ("other conditions still apply to listed ids", [("type", "video"), ("folder", "Shows"), ("sort", "title"), ("order", "asc")], [], ["a1.mp4", "b1.mp4", "b2.mp4", "pic.jpg"]),
    ("other conditions still apply to collection members", [("type", "image"), ("sort", "title"), ("order", "asc")], ["Other"], ["a1.mp4"]),
    ("a tag condition", [("tag", "Trip"), ("sort", "title"), ("order", "asc")], [], ["a1.mp4", "b1.mp4"]),
    ("favorite", [("favorite", "true")], ["Picks"], ["a1.mp4"]),
    ("free text", [("search", "a")], [], ["a1.mp4", "b1.mp4"]),
    ("duplicates change nothing", [("sort", "title"), ("order", "asc")], [], ["a1.mp4", "a1.mp4", "b1.mp4", "b1.mp4"]),
    ("another drive, trashed and missing ids select nothing", [("sort", "title"), ("order", "asc")], [], ["foreign.mp4", "bin.mp4", "gone.mp4", "x.mp4"]),
]


class TestListingEqualsTheGetRestrictedByFileIds:
    """SPEC-CORE-115 step 1, I1."""

    @pytest.mark.parametrize(
        ("params", "collections", "names"),
        [case[1:] for case in LISTING_CASES],
        ids=[case[0] for case in LISTING_CASES],
    )
    def test_ids_order_and_total(self, client, params, collections, names):
        c, db, *_ = client
        rows, members = _seed_all(db)
        file_ids = _rows(rows, *names)
        allowed = _passing(collections, members, file_ids)

        unrestricted = _ok(_files_get(c, [*params, ("limit", "100")]))
        expected = [item["id"] for item in unrestricted["data"] if item["id"] in allowed]

        body = _ok(
            _files_post(
                c,
                [*params, *(("collection", n) for n in collections), ("limit", "100")],
                {"file_ids": file_ids},
            )
        )

        assert [item["id"] for item in body["data"]] == expected
        assert body["meta"]["total"] == len(expected)

    def test_items_are_the_gets_items(self, client):
        c, db, *_ = client
        rows, _members = _seed_all(db)
        file_ids = _rows(rows, "a1.mp4", "b1.mp4")

        unrestricted = _ok(_files_get(c, [("sort", "title"), ("order", "asc"), ("limit", "100")]))
        body = _ok(
            _files_post(c, [("sort", "title"), ("order", "asc"), ("limit", "100")], {"file_ids": file_ids})
        )

        assert body["data"] == [i for i in unrestricted["data"] if i["id"] in set(file_ids)]

    def test_paging_slices_the_restricted_list(self, client):
        c, db, *_ = client
        rows, members = _seed_all(db)
        file_ids = _rows(rows, "a1.mp4", "b1.mp4", "x.mp4", "zero.mp4")
        allowed = _passing(["Picks"], members, file_ids)
        base = [("sort", "title"), ("order", "asc")]
        full = [
            i["id"]
            for i in _ok(_files_get(c, [*base, ("limit", "100")]))["data"]
            if i["id"] in allowed
        ]

        second = _ok(
            _files_post(
                c,
                [*base, ("collection", "Picks"), ("limit", "2"), ("page", "2")],
                {"file_ids": file_ids},
            )
        )

        assert len(full) > 4
        assert [i["id"] for i in second["data"]] == full[2:4]
        assert second["meta"]["total"] == len(full)

    def test_ten_thousand_ids_are_accepted(self, client):
        c, db, *_ = client
        rows, _members = _seed_all(db)
        file_ids = [rows["a1.mp4"].id] + [f"none{i:08d}" for i in range(MAX_IDS - 1)]

        body = _ok(_files_post(c, [("limit", "100")], {"file_ids": file_ids}))

        assert [i["id"] for i in body["data"]] == [rows["a1.mp4"].id]
        assert body["meta"]["total"] == 1

    def test_ten_thousand_ids_with_a_collection_are_accepted(self, client):
        c, db, *_ = client
        rows, members = _seed_all(db)
        file_ids = [rows["a1.mp4"].id] + [f"none{i:08d}" for i in range(MAX_IDS - 1)]

        body = _ok(
            _files_post(
                c,
                [("collection", "Picks"), ("sort", "title"), ("order", "asc"), ("limit", "100")],
                {"file_ids": file_ids},
            )
        )

        assert sorted(i["id"] for i in body["data"]) == sorted(
            _rows(rows, "a1.mp4", "a2.mp4", "b2.mp4")
        )


def _shelf_ids(answer: dict) -> list[tuple[str, int, list[str]]]:
    return [(s["key"], s["count"], [i["id"] for i in s["items"]]) for s in answer["shelves"]]


GROUPINGS = [
    ("folder", [("type", "video"), ("per_shelf", "20")], None),
    ("tag", [("type", "video"), ("per_shelf", "20")], None),
    ("month", [("type", "video"), ("per_shelf", "20")], None),
    ("duration", [("type", "video"), ("per_shelf", "20")], None),
    ("watch", [("type", "video"), ("per_shelf", "20")], ALICE),
    ("all", [("key", "all"), ("type", "video"), ("per_shelf", "60")], None),
]


def _shelf_oracle(c, by, params, headers, allowed: set[str], ids_on_top: list[str] | None):
    """The GET shelves restricted to `allowed` (and `ids` on top) through the GET's own `ids`."""
    narrowed = sorted(allowed if ids_on_top is None else allowed & set(ids_on_top))
    ids = narrowed or [NO_FILE]
    return _ok(
        _shelves_get(c, [("by", by), *params, ("sort", "title"), ("order", "asc"), *(("ids", i) for i in ids)], headers)
    )


class TestShelvesEqualTheGetRestrictedByFileIds:
    """SPEC-CORE-115 step 2, I1: every grouping, keyed or not, with `ids` on top."""

    @pytest.mark.parametrize(("by", "params", "headers"), GROUPINGS, ids=[g[0] for g in GROUPINGS])
    @pytest.mark.parametrize(
        ("collections", "names"),
        [
            ([], ["a1.mp4", "b1.mp4", "x.mp4"]),
            (["Picks"], ["a1.mp4"]),
            (["Picks"], []),
            ([], []),
            ([], ["foreign.mp4", "bin.mp4", "gone.mp4", "root.mp4"]),
        ],
        ids=["ids-only", "collection-or-ids", "collection-empty-ids", "empty-ids", "inactive-and-foreign"],
    )
    def test_unkeyed(self, client, by, params, headers, collections, names):
        c, db, *_ = client
        rows, members = _seed_all(db)
        file_ids = _rows(rows, *names)
        allowed = _passing(collections, members, file_ids)

        expected = _shelf_oracle(c, by, params, headers, allowed, None)
        answer = _ok(
            _shelves_post(
                c,
                [("by", by), *params, ("sort", "title"), ("order", "asc"), *(("collection", n) for n in collections)],
                {"file_ids": file_ids},
                headers,
            )
        )

        assert _shelf_ids(answer) == _shelf_ids(expected)
        assert answer.get("total_shelves") == expected.get("total_shelves")

    @pytest.mark.parametrize(("by", "params", "headers"), GROUPINGS[:-1], ids=[g[0] for g in GROUPINGS[:-1]])
    def test_keyed_shelf_of_every_grouping(self, client, by, params, headers):
        c, db, *_ = client
        rows, members = _seed_all(db)
        file_ids = _rows(rows, "a1.mp4", "b1.mp4", "x.mp4", "zero.mp4")
        allowed = _passing(["Picks"], members, file_ids)
        keys = [s["key"] for s in _ok(_shelves_get(c, [("by", by), *params], headers))["shelves"]]
        assert keys

        for key in keys:
            expected = _shelf_oracle(c, by, [("key", key), *params], headers, allowed, None)
            answer = _ok(
                _shelves_post(
                    c,
                    [("by", by), ("key", key), *params, ("sort", "title"), ("order", "asc"), ("collection", "Picks")],
                    {"file_ids": file_ids},
                    headers,
                )
            )
            assert _shelf_ids(answer) == _shelf_ids(expected), key

    @pytest.mark.parametrize(("by", "params", "headers"), GROUPINGS, ids=[g[0] for g in GROUPINGS])
    def test_ids_still_narrow_on_top(self, client, by, params, headers):
        c, db, *_ = client
        rows, members = _seed_all(db)
        file_ids = _rows(rows, "a1.mp4", "b1.mp4", "x.mp4")
        on_top = _rows(rows, "a1.mp4", "a2.mp4", "root.mp4")
        allowed = _passing(["Picks"], members, file_ids)

        expected = _shelf_oracle(c, by, params, headers, allowed, on_top)
        answer = _ok(
            _shelves_post(
                c,
                [("by", by), *params, ("sort", "title"), ("order", "asc"), ("collection", "Picks"), *(("ids", i) for i in on_top)],
                {"file_ids": file_ids},
                headers,
            )
        )

        assert _shelf_ids(answer) == _shelf_ids(expected)

    @pytest.mark.parametrize(("by", "params", "headers"), GROUPINGS, ids=[g[0] for g in GROUPINGS])
    def test_ten_thousand_ids_with_ids_on_top_are_accepted(self, client, by, params, headers):
        c, db, *_ = client
        rows, members = _seed_all(db)
        file_ids = _rows(rows, "a1.mp4", "b1.mp4") + [f"none{i:08d}" for i in range(MAX_IDS - 2)]
        on_top = _rows(rows, "a1.mp4", "a2.mp4") + [f"top{i:08d}" for i in range(58)]

        answer = _ok(
            _shelves_post(
                c,
                [("by", by), *params, ("collection", "Picks"), *(("ids", i) for i in on_top)],
                {"file_ids": file_ids},
                headers,
            )
        )

        allowed = _passing(["Picks"], members, file_ids)
        expected = _shelf_oracle(c, by, params, headers, allowed, on_top)
        assert {i for _k, _n, items in _shelf_ids(answer) for i in items} == {
            i for _k, _n, items in _shelf_ids(expected) for i in items
        }

    @pytest.mark.parametrize(("by", "params", "headers"), GROUPINGS[:-1], ids=[g[0] for g in GROUPINGS[:-1]])
    def test_ten_thousand_ids_on_a_keyed_shelf_are_accepted(self, client, by, params, headers):
        c, db, *_ = client
        rows, _members = _seed_all(db)
        file_ids = _rows(rows, "a1.mp4", "b1.mp4") + [f"none{i:08d}" for i in range(MAX_IDS - 2)]
        key = _ok(_shelves_get(c, [("by", by), *params], headers))["shelves"][0]["key"]

        res = _shelves_post(
            c,
            [("by", by), ("key", key), *params, ("collection", "Picks"), ("ids", rows["a1.mp4"].id)],
            {"file_ids": file_ids},
            headers,
        )

        assert res.status_code == 200, res.text


INVALID_BODIES = [
    ("missing body", None),
    ("missing key", {}),
    ("not a list", {"file_ids": "abc"}),
    ("null", {"file_ids": None}),
    ("an empty string", {"file_ids": ["x", ""]}),
    ("only an empty string", {"file_ids": [""]}),
    ("more than ten thousand", {"file_ids": [f"none{i:08d}" for i in range(MAX_IDS + 1)]}),
    ("ten thousand and one duplicates", {"file_ids": ["dup"] * (MAX_IDS + 1)}),
]


class TestRejectedRequests:
    """SPEC-CORE-115 step 3 and failure cases."""

    @pytest.mark.parametrize("body", [b for _n, b in INVALID_BODIES], ids=[n for n, _b in INVALID_BODIES])
    @pytest.mark.parametrize("route", ["files", "shelves"])
    def test_a_bad_file_ids_body_is_422(self, client, route, body):
        c, db, *_ = client
        rows, _members = _seed_all(db)
        params = [] if route == "files" else [("by", "folder")]
        url = f"/api/drives/{TEST_DRIVE}/{route}/query"

        good = c.post(url, params=params, json={"file_ids": [rows["a1.mp4"].id]})
        res = c.post(url, params=params) if body is None else c.post(url, params=params, json=body)

        assert good.status_code == 200, good.text
        assert res.status_code == 422

    @pytest.mark.parametrize(
        "params",
        [[("limit", "0")], [("page", "0")], [("order", "sideways")], [("trust", "bogus")]],
        ids=["limit=0", "page=0", "order=sideways", "trust=bogus"],
    )
    def test_an_invalid_listing_parameter_answers_as_the_get(self, client, params):
        c, db, *_ = client
        rows, _members = _seed_all(db)

        get = _files_get(c, params)
        post = _files_post(c, params, {"file_ids": [rows["a1.mp4"].id]})

        assert get.status_code == 422
        assert post.status_code == get.status_code

    @pytest.mark.parametrize(
        "query",
        ["", "by=bogus", "by=folder&per_shelf=0", "by=folder&order=sideways", "by=tag&key=&type=video"],
        ids=lambda q: q or "no-by",
    )
    def test_an_invalid_shelves_parameter_answers_as_the_get(self, client, query):
        c, db, *_ = client
        rows, _members = _seed_all(db)

        get = c.get(f"/api/drives/{TEST_DRIVE}/shelves?{query}", headers=ALICE)
        post = c.post(
            f"/api/drives/{TEST_DRIVE}/shelves/query?{query}",
            json={"file_ids": [rows["a1.mp4"].id]},
            headers=ALICE,
        )

        assert get.status_code == 422
        assert post.status_code == get.status_code

    def test_more_than_sixty_ids_on_top_is_still_422(self, client):
        c, db, *_ = client
        rows, _members = _seed_all(db)
        ids = [("ids", f"none{i:08d}") for i in range(61)]

        good = _shelves_post(c, [("by", "folder")], {"file_ids": [rows["a1.mp4"].id]})
        res = _shelves_post(c, [("by", "folder"), *ids], {"file_ids": [rows["a1.mp4"].id]})

        assert good.status_code == 200, good.text
        assert res.status_code == 422

    @pytest.mark.parametrize("route", ["files", "shelves"])
    def test_an_unknown_drive_is_404(self, client, route):
        c, db, *_ = client
        rows, _members = _seed_all(db)
        params = "" if route == "files" else "?by=folder"
        body = {"file_ids": [rows["a1.mp4"].id]}

        known = c.post(f"/api/drives/{TEST_DRIVE}/{route}/query{params}", json=body)
        unknown = c.post(f"/api/drives/nowhere/{route}/query{params}", json=body)

        assert known.status_code == 200, known.text
        assert unknown.status_code == 404
        assert unknown.json() == c.get(f"/api/drives/nowhere/{route}{params}").json()


class TestDriveBoundary:
    """SPEC-CORE-115 authorization, I1: no other drive's file, no locked drive's file."""

    @pytest.mark.parametrize("route", ["files", "shelves"])
    def test_a_locked_drive_is_404_until_unlocked(self, tmp_path, route):
        drive_dir = tmp_path / "drives" / "secret"
        drive_dir.mkdir(parents=True)
        c, cleanup = _make_auth_client(
            tmp_path,
            passwords=[{"password": "pw", "groups": ["g"]}],
            drives=[{"name": "locked", "path": str(drive_dir), "access_group": "g"}],
        )
        params = "" if route == "files" else "?by=folder"
        body = {"file_ids": ["anything0000"]}
        try:
            locked = c.post(f"/api/drives/locked/{route}/query{params}", json=body)
            listing = c.get(f"/api/drives/locked/{route}{params}")
            c.post("/api/auth/unlock", json={"password": "pw"})
            unlocked = c.post(f"/api/drives/locked/{route}/query{params}", json=body)

            assert locked.status_code == 404
            assert locked.json() == listing.json()
            assert unlocked.status_code == 200, unlocked.text
        finally:
            cleanup()

    def test_a_locked_drives_file_id_selects_nothing_on_an_open_drive(self, tmp_path):
        open_dir = tmp_path / "drives" / "open"
        secret_dir = tmp_path / "drives" / "secret"
        open_dir.mkdir(parents=True)
        secret_dir.mkdir(parents=True)
        c, cleanup = _make_auth_client(
            tmp_path,
            passwords=[{"password": "pw", "groups": ["g"]}],
            drives=[
                {"name": "open", "path": str(open_dir)},
                {"name": "locked", "path": str(secret_dir), "access_group": "g"},
            ],
        )
        try:
            from app.main import app
            from app.database import get_db

            db = next(app.dependency_overrides[get_db]())
            hidden = File(
                filename="hidden.mp4", title="hidden.mp4", drive="locked", folder_path="",
                file_path="hidden.mp4", file_size=1, file_type="video", mime_type="video/mp4",
            )
            shown = File(
                filename="shown.mp4", title="shown.mp4", drive="open", folder_path="",
                file_path="shown.mp4", file_size=1, file_type="video", mime_type="video/mp4",
            )
            db.add_all([hidden, shown])
            db.commit()

            files = c.post(
                "/api/drives/open/files/query", json={"file_ids": [hidden.id, shown.id]}
            )
            shelves = c.post(
                "/api/drives/open/shelves/query?by=all&key=all&per_shelf=60",
                json={"file_ids": [hidden.id, shown.id]},
            )

            assert [i["id"] for i in _ok(files)["data"]] == [shown.id]
            assert [i["id"] for s in _ok(shelves)["shelves"] for i in s["items"]] == [shown.id]
            db.close()
        finally:
            cleanup()
