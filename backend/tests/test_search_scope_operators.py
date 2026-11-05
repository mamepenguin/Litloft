"""Acceptance tests for SPEC-CORE-043: searching within a folder or a collection.

The listing's ``folder`` / ``collection`` parameters and the Internal API's
``folders`` / ``collections`` must resolve through the same predicates (I1),
keep whole path segments case-sensitively (I2), stay inside the request drive
(I3), union within an operator and AND across operators (I4), reject an
unknown key (I7), and normalise, deduplicate and cap as the addon does (I10).
"""

from __future__ import annotations

import unicodedata
from datetime import UTC, datetime

import pytest

from app.models import Collection, CollectionItem, File, Tag
from tests.conftest import TEST_DRIVE

URL = "/api/internal/files/matching"
OTHER_DRIVE = "elsewhere"


def _at(day: int) -> datetime:
    return datetime(2026, 1, day, tzinfo=UTC)


def _file(
    db,
    name: str,
    *,
    folder_path: str = "",
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
        folder_path=folder_path,
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


def _collection(db, name: str, files: list[File], drive: str = TEST_DRIVE) -> Collection:
    collection = Collection(drive=drive, name=name)
    db.add(collection)
    db.commit()
    db.refresh(collection)
    for position, file in enumerate(files):
        db.add(
            CollectionItem(
                collection_id=collection.id, file_id=file.id, position=position
            )
        )
    db.commit()
    return collection


def _match(c, *, drive: str = TEST_DRIVE, **conditions):
    return c.post(URL, json={"drive": drive, **conditions})


def _listing(c, params: list[tuple[str, str]] | None = None):
    return c.get(
        f"/api/drives/{TEST_DRIVE}/files",
        params=[("limit", "100"), *(params or [])],
    )


def _ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["data"]]


@pytest.fixture()
def corpus(client):
    """Files in sibling, case-variant and nested folders, plus collections."""
    _c, db, _drive_dir, _data_dir = client

    meeting = Tag(name="会議", drive=TEST_DRIVE)
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    rows = {
        "root": _file(db, "root.mp4", day=1),
        "photo_a": _file(db, "photo-a.jpg", folder_path="Photos/2024", file_type="image", mime_type="image/jpeg", day=2),
        "photo_b": _file(db, "photo-b.jpg", folder_path="Photos/2024", file_type="image", mime_type="image/jpeg", day=3),
        "photo_x": _file(db, "photo-x.jpg", folder_path="Photos/2024x", file_type="image", mime_type="image/jpeg", day=4),
        "photo_lower": _file(db, "photo-lower.jpg", folder_path="photos/2024", file_type="image", mime_type="image/jpeg", day=5),
        "photo_e": _file(db, "photo-e.jpg", folder_path="Photos", file_type="image", mime_type="image/jpeg", day=6),
        "budget": _file(db, "budget.pdf", folder_path="Work/2024", file_type="document", mime_type="application/pdf", tags=[meeting], favorite=True, day=7),
        "minutes": _file(db, "minutes.txt", folder_path="Work/Other", file_type="document", mime_type="text/plain", day=8),
        "kyoto": _file(db, "kyoto.md", folder_path="Trips", file_type="document", mime_type="text/markdown", liked=True, day=9),
        "meeting": _file(db, "meeting.md", folder_path="Loose", file_type="document", mime_type="text/markdown", tags=[meeting], day=14),
        "cafe": _file(db, "cafe.jpg", folder_path="Café", file_type="image", mime_type="image/jpeg", day=10),
        "trashed": _file(db, "trashed.mp4", folder_path="Photos/2024", deleted=True, day=11),
        "gone": _file(db, "gone.mp4", folder_path="Photos/2024", missing=True, day=12),
        "other_drive": _file(db, "other.mp4", drive=OTHER_DRIVE, day=13),
    }
    _collection(db, "Trip", [rows["photo_a"], rows["budget"], rows["trashed"], rows["gone"]])
    _collection(db, "旅行 メモ", [rows["photo_b"]])
    _collection(db, "資料", [rows["budget"], rows["minutes"]])
    _collection(db, "Trip", [rows["other_drive"]], drive=OTHER_DRIVE)
    return rows


def _want(corpus, *names: str) -> list[str]:
    return sorted(corpus[name].id for name in names)


class TestFolderScope:
    """SPEC-CORE-043 I2: a folder keeps its whole subtree, case-sensitively."""

    ROWS = [
        ("exact folder", "Photos/2024", ["photo_a", "photo_b"]),
        ("a parent folder holds its descendants", "Photos", ["photo_a", "photo_b", "photo_e"]),
        ("a longer sibling name is not the folder", "Photos/2024", ["photo_a", "photo_b"]),
        ("a case-variant folder is a different folder", "photos/2024", ["photo_lower"]),
        ("the drive root is not a folder value", "Café", ["cafe"]),
    ]

    @pytest.mark.parametrize(
        ("folder", "expected"),
        [(row[1], row[2]) for row in ROWS],
        ids=[row[0] for row in ROWS],
    )
    def test_listing_keeps_the_subtree(self, client, corpus, folder, expected):
        c, _db, _drive_dir, _data_dir = client

        res = _listing(c, [("folder", folder)])

        assert sorted(_ids(res)) == _want(corpus, *expected)
        assert res.json()["meta"]["total"] == len(expected)

    def test_photos_2024_never_keeps_photos_2024x_or_lowercase(
        self, client, corpus
    ):
        c, _db, _drive_dir, _data_dir = client

        listed = set(_ids(_listing(c, [("folder", "Photos/2024")])))

        assert corpus["photo_x"].id not in listed
        assert corpus["photo_lower"].id not in listed


class TestCollectionScope:
    """SPEC-CORE-043 I3: a collection name is case-insensitive and drive-scoped."""

    def test_listing_keeps_the_collections_active_items(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _listing(c, [("collection", "Trip")])

        assert sorted(_ids(res)) == _want(corpus, "photo_a", "budget")

    @pytest.mark.parametrize("name", ["Trip", "trip", "TRIP"], ids=["as-stored", "lower", "upper"])
    def test_a_collection_name_is_case_insensitive(self, client, corpus, name):
        c, _db, _drive_dir, _data_dir = client

        assert sorted(_ids(_listing(c, [("collection", name)]))) == _want(
            corpus, "photo_a", "budget"
        )

    def test_only_the_request_drives_collection_is_considered(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _listing(c, [("collection", "Trip")])

        assert sorted(_ids(res)) == _want(corpus, "photo_a", "budget")
        assert corpus["other_drive"].id not in _ids(res)

    def test_a_collection_name_with_a_space(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        assert _ids(_listing(c, [("collection", "旅行 メモ")])) == _want(
            corpus, "photo_b"
        )

    def test_a_trashed_or_missing_collection_item_is_not_listed(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _listing(c, [("collection", "Trip")])

        assert sorted(_ids(res)) == _want(corpus, "photo_a", "budget")
        assert corpus["trashed"].id not in _ids(res)
        assert corpus["gone"].id not in _ids(res)

    def test_a_name_that_matches_no_collection_keeps_nothing(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        assert _ids(_listing(c, [("collection", "nowhere")])) == []


class TestUnionsAndAnd:
    """SPEC-CORE-043 I4: one operator unions, different operators intersect."""

    def test_several_folders_are_the_union_of_their_subtrees(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _listing(c, [("folder", "Photos"), ("folder", "Trips")])

        assert sorted(_ids(res)) == _want(
            corpus, "photo_a", "photo_b", "photo_e", "kyoto"
        )

    def test_several_collections_are_the_union_of_their_items(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _listing(
            c, [("collection", "旅行 メモ"), ("collection", "資料")]
        )

        assert sorted(_ids(res)) == _want(
            corpus, "photo_b", "budget", "minutes"
        )

    def test_folder_and_collection_and_tag_are_and(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _listing(
            c, [("folder", "Work"), ("collection", "資料"), ("tag", "会議")]
        )

        assert _ids(res) == _want(corpus, "budget")

    def test_a_folder_and_a_collection_that_never_meet(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _listing(c, [("folder", "Photos"), ("collection", "資料")])

        assert _ids(res) == []


class TestParagraphParity:
    """SPEC-CORE-043 I1: the endpoint returns exactly the listing's ids."""

    ROWS = [
        ("no conditions", {}, [], ("root", "photo_a", "photo_b", "photo_x", "photo_lower", "photo_e", "budget", "minutes", "kyoto", "cafe", "meeting")),
        ("a folder", {"folders": ["Photos/2024"]}, [("folder", "Photos/2024")], ("photo_a", "photo_b")),
        ("an outer folder", {"folders": ["Photos"]}, [("folder", "Photos")], ("photo_a", "photo_b", "photo_e")),
        ("two folders", {"folders": ["Photos", "Trips"]}, [("folder", "Photos"), ("folder", "Trips")], ("photo_a", "photo_b", "photo_e", "kyoto")),
        ("a collection", {"collections": ["Trip"]}, [("collection", "Trip")], ("photo_a", "budget")),
        ("a collection by another case", {"collections": ["trip"]}, [("collection", "trip")], ("photo_a", "budget")),
        ("two collections", {"collections": ["Trip", "資料"]}, [("collection", "Trip"), ("collection", "資料")], ("photo_a", "budget", "minutes")),
        (
            "folder and collection",
            {"folders": ["Work"], "collections": ["資料"]},
            [("folder", "Work"), ("collection", "資料")],
            ("budget", "minutes"),
        ),
        (
            "everything at once",
            {"tags": ["会議"], "kinds": ["document"], "favorite": True, "folders": ["Work/2024"], "collections": ["旅行 メモ"]},
            [("tag", "会議"), ("type", "document"), ("favorite", "true"), ("folder", "Work/2024"), ("collection", "旅行 メモ")],
            (),
        ),
    ]

    @pytest.mark.parametrize(
        ("body", "params", "expected"),
        [(row[1], row[2], row[3]) for row in ROWS],
        ids=[row[0] for row in ROWS],
    )
    def test_matching_answers_the_listing_ids(
        self, client, corpus, body, params, expected
    ):
        c, _db, _drive_dir, _data_dir = client

        matched = _match(c, **body)
        assert matched.status_code == 200, matched.text
        listed = _listing(c, params)

        assert sorted(_ids(listed)) == matched.json()["file_ids"] == _want(corpus, *expected)
        assert listed.json()["meta"]["total"] == len(matched.json()["file_ids"])

    @pytest.mark.parametrize(
        ("body", "params"),
        [
            ({"folders": ["Nowhere"]}, [("folder", "Nowhere")]),
            ({"collections": ["nowhere"]}, [("collection", "nowhere")]),
        ],
        ids=["a folder that names nothing", "a collection that names nothing"],
    )
    def test_a_scope_that_names_nothing_keeps_nothing(
        self, client, corpus, body, params
    ):
        c, _db, _drive_dir, _data_dir = client

        matched = _match(c, **body)
        listed = _listing(c, params)

        assert matched.status_code == 200, matched.text
        assert matched.json()["file_ids"] == []
        assert _ids(listed) == []


class TestUnknownKeys:
    """SPEC-CORE-043 I7: the request model fails closed on a field it does not know."""

    @pytest.mark.parametrize(
        "body",
        [
            {"drive": TEST_DRIVE, "folder": ["Photos"]},
            {"drive": TEST_DRIVE, "collection": ["Trip"]},
            {"drive": TEST_DRIVE, "unknown": 1},
        ],
        ids=["listing-spelling", "listing-spelling-collection", "unknown-field"],
    )
    def test_an_unknown_key_is_422(self, client, corpus, body):
        c, _db, _drive_dir, _data_dir = client

        res = c.post(URL, json=body)

        assert res.status_code == 422, res.text


class TestNormalisation:
    """SPEC-CORE-043 I10: both surfaces normalise the same way."""

    def test_a_folder_is_trimmed_of_slashes(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        wrapped = _ids(_listing(c, [("folder", "/Photos/2024/")]))
        bare = _ids(_listing(c, [("folder", "Photos/2024")]))

        assert sorted(wrapped) == sorted(bare) == _want(corpus, "photo_a", "photo_b")

    def test_a_folder_is_nfc_normalised(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client
        nfd = unicodedata.normalize("NFD", "Café")

        assert _ids(_listing(c, [("folder", nfd)])) == _want(corpus, "cafe")

    def test_a_collection_name_is_trimmed(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        assert sorted(_ids(_listing(c, [("collection", "  Trip  ")]))) == _want(
            corpus, "photo_a", "budget"
        )

    def test_a_blank_collection_name_is_dropped(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _listing(
            c, [("collection", ""), ("collection", "Trip"), ("collection", "   ")]
        )

        assert sorted(_ids(res)) == _want(corpus, "photo_a", "budget")

    def test_duplicate_folders_count_once(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _listing(c, [("folder", "Photos"), ("folder", "/Photos/")])

        assert sorted(_ids(res)) == _want(corpus, "photo_a", "photo_b", "photo_e")

    def test_duplicate_collections_count_once_case_insensitively(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client
        params = [("collection", "Trip")] + [("collection", "trip")] * 9

        res = _listing(c, params)

        assert sorted(_ids(res)) == _want(corpus, "photo_a", "budget")


class TestCaps:
    """SPEC-CORE-043 I10: 400 on the listing where the endpoint answers 422."""

    @pytest.mark.parametrize(
        ("field", "values", "listing_status", "matching_status", "expected"),
        [
            ("folders", ["Photos/2024", *[f"f{i}" for i in range(9)]], 200, 200, ("photo_a", "photo_b")),
            ("folders", [f"f{i}" for i in range(11)], 400, 422, ()),
            ("collections", ["Trip", *[f"c{i}" for i in range(9)]], 200, 200, ("photo_a", "budget")),
            ("collections", [f"c{i}" for i in range(11)], 400, 422, ()),
            (
                "folders",
                ["Photos/2024", *[f"f{i}" for i in range(8)], "/Photos/2024/"],
                200,
                200,
                ("photo_a", "photo_b"),
            ),
            (
                "collections",
                ["Trip", *[f"c{i}" for i in range(8)], "trip"],
                200,
                200,
                ("photo_a", "budget"),
            ),
            ("folders", ["Photos/2024", "x" * 1024], 200, 200, ("photo_a", "photo_b")),
            ("folders", ["Photos/2024", "x" * 1025], 400, 422, ()),
            ("collections", ["Trip", "x" * 100], 200, 200, ("photo_a", "budget")),
            ("collections", ["Trip", "x" * 101], 400, 422, ()),
        ],
        ids=[
            "ten-folders",
            "eleven-folders",
            "ten-collections",
            "eleven-collections",
            "folders-deduped-before-the-cap",
            "collections-deduped-before-the-cap",
            "folder-1024",
            "folder-1025",
            "collection-100",
            "collection-101",
        ],
    )
    def test_the_listing_answers_400_where_matching_answers_422(
        self, client, corpus, field, values, listing_status, matching_status, expected
    ):
        c, _db, _drive_dir, _data_dir = client
        query_field = "folder" if field == "folders" else "collection"

        listing = _listing(c, [(query_field, value) for value in values])
        matching = _match(c, **{field: values})

        assert listing.status_code == listing_status
        assert matching.status_code == matching_status, matching.text
        if listing_status == 200:
            assert sorted(_ids(listing)) == _want(corpus, *expected)
            assert matching.json()["file_ids"] == _want(corpus, *expected)

    @pytest.mark.parametrize(
        "folder",
        ["..", ".", "a//b", "a/./b", "a/../b", "/", "\x00"],
        ids=["dot-dot", "dot", "empty-segment", "dot-segment", "dot-dot-segment", "root", "nul"],
    )
    def test_a_malformed_folder_is_400_on_the_listing_and_422_on_matching(
        self, client, corpus, folder
    ):
        c, _db, _drive_dir, _data_dir = client

        listing = _listing(c, [("folder", folder)])
        matching = _match(c, folders=[folder])

        assert listing.status_code == 400
        assert matching.status_code == 422, matching.text


class TestUnchangedWithoutTheNewParameters:
    """SPEC-CORE-043 I8: neither parameter set changes an existing answer."""

    def test_the_listing_with_no_conditions_keeps_its_ids_order_and_total(
        self, client, corpus
    ):
        c, _db, _drive_dir, _data_dir = client
        newest_first = [
            corpus[name].id
            for name in (
                "meeting",
                "cafe",
                "kyoto",
                "minutes",
                "budget",
                "photo_e",
                "photo_lower",
                "photo_x",
                "photo_b",
                "photo_a",
                "root",
            )
        ]

        res = _listing(c)

        assert _ids(res) == newest_first
        assert res.json()["meta"]["total"] == len(newest_first)

    def test_the_existing_operators_keep_their_answers(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        assert sorted(_ids(_listing(c, [("tag", "会議")]))) == _want(corpus, "budget", "meeting")
        assert sorted(_ids(_listing(c, [("type", "image")]))) == _want(
            corpus, "photo_a", "photo_b", "photo_x", "photo_lower", "photo_e", "cafe"
        )
        assert sorted(_ids(_listing(c, [("favorite", "true")]))) == _want(corpus, "budget")
        assert sorted(_ids(_listing(c, [("liked", "true")]))) == _want(corpus, "kyoto")

    def test_matching_defaults_to_every_active_file(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _match(c)

        assert res.status_code == 200, res.text
        assert len(res.json()["file_ids"]) == 11
        assert list(res.json()) == ["file_ids"]
