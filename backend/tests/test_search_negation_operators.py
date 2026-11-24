"""Acceptance tests for SPEC-CORE-172: excluding with `-` and the `has:` operator.

The listing's ``exclude_tag`` / ``exclude_type`` / ``exclude_folder`` /
``exclude_collection`` / ``has_tag`` / ``has_collection`` parameters and the
Internal API's ``exclude_tags`` / ``exclude_kinds`` / ``exclude_folders`` /
``exclude_collections`` / ``has_tag`` / ``has_collection`` keys must resolve
through the same predicates on every listing route (I2), keep what the spec
states for each condition (I3-I6, I13), and accept and reject the same values
(sending step 7, I10).
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

import pytest

from app.models import Collection, CollectionItem, File, Tag
from tests.conftest import TEST_DRIVE

URL = "/api/internal/files/matching"
OTHER_DRIVE = "elsewhere"
EPUB_MIME = "application/epub+zip"


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
        file_path=f"{folder_path}/{name}" if folder_path else name,
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
        db.add(CollectionItem(collection_id=collection.id, file_id=file.id, position=position))
    db.commit()
    return collection


def _listing(c, params: list[tuple[str, str]] | None = None):
    return c.get(
        f"/api/drives/{TEST_DRIVE}/files",
        params=[("limit", "100"), *(params or [])],
    )


def _listing_post(c, params: list[tuple[str, str]], file_ids: list[str]):
    return c.post(
        f"/api/drives/{TEST_DRIVE}/files/query",
        params=[("limit", "100"), *params],
        json={"file_ids": file_ids},
    )


def _match(c, *, drive: str = TEST_DRIVE, **conditions):
    return c.post(URL, json={"drive": drive, **conditions})


def _ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def _ids(response) -> list[str]:
    return [item["id"] for item in _ok(response)["data"]]


def _matched(response) -> list[str]:
    return sorted(_ok(response)["file_ids"])


def _want(corpus, *names: str) -> list[str]:
    return sorted(corpus[name].id for name in names)


ACTIVE = ("vid_a", "img_ab", "pdf_big_ab", "txt_lower_a", "epub_root", "md_notes", "folded")


@pytest.fixture()
def corpus(client):
    """Files in `A`, under `A`, in the sibling `AB` and the case variant `a`."""
    _c, db, _drive_dir, _data_dir = client
    trip = _tag(db, "Trip")
    year = _tag(db, "2023")
    shared = _tag(db, "Shared", drive=OTHER_DRIVE)

    rows = {
        "vid_a": _file(db, "a.mp4", folder_path="A", tags=[trip], liked=True, day=1),
        "img_ab": _file(
            db, "b.jpg", folder_path="A/b", file_type="image", mime_type="image/jpeg",
            favorite=True, day=2,
        ),
        "pdf_big_ab": _file(
            db, "c.pdf", folder_path="AB", file_type="document",
            mime_type="application/pdf", tags=[year], favorite=True, day=3,
        ),
        "txt_lower_a": _file(
            db, "d.txt", folder_path="a", file_type="document", mime_type="text/plain",
            tags=[trip, year], day=4,
        ),
        "epub_root": _file(
            db, "e.epub", file_type="document", mime_type=EPUB_MIME, tags=[trip], liked=True,
            day=5,
        ),
        "md_notes": _file(
            db, "f.md", folder_path="Notes", file_type="document",
            mime_type="text/markdown", day=6,
        ),
        "folded": _file(db, "g.mp4", tags=[shared], day=7),
        "trashed": _file(db, "trashed.mp4", folder_path="A", deleted=True, day=8),
        "gone": _file(db, "gone.mp4", missing=True, day=9),
        "other_drive": _file(db, "other.mp4", drive=OTHER_DRIVE, day=10),
    }
    _collection(db, "Picks", [rows["vid_a"], rows["pdf_big_ab"], rows["trashed"]])
    _collection(db, "Also", [rows["md_notes"]])
    _collection(db, "Picks", [rows["other_drive"], rows["epub_root"]], drive=OTHER_DRIVE)
    return rows


# (label, /files/matching body, listing parameters, the files kept)
CONDITIONS = [
    (
        "exclude a tag, any letter case",
        {"exclude_tags": ["trip"]},
        [("exclude_tag", "trip")],
        ("img_ab", "pdf_big_ab", "md_notes", "folded"),
    ),
    (
        "exclude two tags",
        {"exclude_tags": ["TRIP", "2023"]},
        [("exclude_tag", "TRIP"), ("exclude_tag", "2023")],
        ("img_ab", "md_notes", "folded"),
    ),
    (
        "a tag folded across drives is excluded as tags matches it",
        {"exclude_tags": ["shared"]},
        [("exclude_tag", "shared")],
        ("vid_a", "img_ab", "pdf_big_ab", "txt_lower_a", "epub_root", "md_notes"),
    ),
    (
        "keep one tag and exclude another",
        {"tags": ["trip"], "exclude_tags": ["2023"]},
        [("tag", "trip"), ("exclude_tag", "2023")],
        ("vid_a", "epub_root"),
    ),
    (
        "exclude document drops text, pdf and epub",
        {"exclude_kinds": ["document"]},
        [("exclude_type", "document")],
        ("vid_a", "img_ab", "folded"),
    ),
    (
        "document without pdf keeps text and epub",
        {"kinds": ["document"], "exclude_kinds": ["pdf"]},
        [("type", "document"), ("exclude_type", "pdf")],
        ("txt_lower_a", "epub_root", "md_notes"),
    ),
    (
        "exclude epub",
        {"exclude_kinds": ["epub"]},
        [("exclude_type", "epub")],
        ("vid_a", "img_ab", "pdf_big_ab", "txt_lower_a", "md_notes", "folded"),
    ),
    (
        "exclude markdown as text",
        {"exclude_kinds": ["markdown"]},
        [("exclude_type", "text")],
        ("vid_a", "img_ab", "pdf_big_ab", "epub_root", "folded"),
    ),
    (
        "exclude a folder and its subtree, not a sibling or a case variant",
        {"exclude_folders": ["A"]},
        [("exclude_folder", "A")],
        ("pdf_big_ab", "txt_lower_a", "epub_root", "md_notes", "folded"),
    ),
    (
        "a folder without one of its subfolders",
        {"folders": ["A"], "exclude_folders": ["A/b"]},
        [("folder", "A"), ("exclude_folder", "A/b")],
        ("vid_a",),
    ),
    (
        "exclude a collection by name, any letter case",
        {"exclude_collections": ["picks"]},
        [("exclude_collection", "picks")],
        ("img_ab", "txt_lower_a", "epub_root", "md_notes", "folded"),
    ),
    (
        "a collection name with no collection excludes nothing",
        {"exclude_collections": ["Nowhere"]},
        [("exclude_collection", "Nowhere")],
        ACTIVE,
    ),
    (
        "has a tag",
        {"has_tag": True},
        [("has_tag", "true")],
        ("vid_a", "pdf_big_ab", "txt_lower_a", "epub_root", "folded"),
    ),
    (
        "has no tag",
        {"has_tag": False},
        [("has_tag", "false")],
        ("img_ab", "md_notes"),
    ),
    (
        "in a collection of this drive",
        {"has_collection": True},
        [("has_collection", "true")],
        ("vid_a", "pdf_big_ab", "md_notes"),
    ),
    (
        "in no collection of this drive",
        {"has_collection": False},
        [("has_collection", "false")],
        ("img_ab", "txt_lower_a", "epub_root", "folded"),
    ),
    (
        "every new condition is ANDed",
        {
            "exclude_tags": ["2023"],
            "exclude_kinds": ["image"],
            "exclude_folders": ["Notes"],
            "exclude_collections": ["Picks"],
            "has_tag": True,
            "has_collection": False,
            "liked": True,
        },
        [
            ("exclude_tag", "2023"),
            ("exclude_type", "image"),
            ("exclude_folder", "Notes"),
            ("exclude_collection", "Picks"),
            ("has_tag", "true"),
            ("has_collection", "false"),
            ("liked", "true"),
        ],
        ("epub_root",),
    ),
    (
        "a tag kept and excluded keeps nothing",
        {"tags": ["trip"], "exclude_tags": ["Trip"]},
        [("tag", "trip"), ("exclude_tag", "Trip")],
        (),
    ),
]


class TestEachCondition:
    """SPEC-CORE-172 sending 6, I3-I6: what each new condition keeps."""

    @pytest.mark.parametrize(
        ("body", "params", "expected"),
        [row[1:] for row in CONDITIONS],
        ids=[row[0] for row in CONDITIONS],
    )
    def test_spec_core_172_the_listing_and_matching_keep_the_same_files(
        self, client, corpus, body, params, expected
    ):
        c, _db, _drive_dir, _data_dir = client

        listed = _listing(c, params)
        matched = _match(c, **body)

        assert sorted(_ids(listed)) == _want(corpus, *expected)
        assert _matched(matched) == _want(corpus, *expected)
        assert listed.json()["meta"]["total"] == len(expected)

    def test_spec_core_172_i3_untagged_files_survive_an_excluded_tag(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        kept = set(_ids(_listing(c, [("exclude_tag", "TRIP")])))

        assert corpus["img_ab"].id in kept
        assert corpus["md_notes"].id in kept
        for name in ("vid_a", "txt_lower_a", "epub_root"):
            assert corpus[name].id not in kept

    def test_spec_core_172_i5_a_sibling_and_a_case_variant_survive(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        kept = set(_matched(_match(c, exclude_folders=["A"])))

        assert corpus["pdf_big_ab"].id in kept
        assert corpus["txt_lower_a"].id in kept
        assert corpus["vid_a"].id not in kept
        assert corpus["img_ab"].id not in kept

    def test_spec_core_172_i6_a_smart_collection_is_not_a_collection(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client
        made = c.post(
            f"/api/drives/{TEST_DRIVE}/smart-folders",
            json={"name": "Smarty", "query": "tag:Trip"},
        )
        assert made.status_code in (200, 201), made.text

        in_one = set(_matched(_match(c, has_collection=True)))
        in_none = set(_ids(_listing(c, [("has_collection", "false")])))
        not_smart = set(_ids(_listing(c, [("exclude_collection", "Smarty")])))

        assert corpus["epub_root"].id not in in_one
        assert corpus["epub_root"].id in in_none
        assert sorted(not_smart) == _want(corpus, *ACTIVE)

    def test_spec_core_172_another_drives_collection_counts_for_nothing(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        in_one = set(_ids(_listing(c, [("has_collection", "true")])))
        not_picks = set(_matched(_match(c, exclude_collections=["Picks"])))

        assert corpus["epub_root"].id not in in_one
        assert corpus["epub_root"].id in not_picks

    def test_spec_core_172_trashed_missing_and_other_drive_files_stay_out(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        kept = set(_ids(_listing(c, [("has_tag", "false"), ("exclude_folder", "Notes")])))

        assert kept == {corpus["img_ab"].id}


class TestFileIdsAreNarrowedToo:
    """SPEC-CORE-172 sending 6 last item, I13: exclusions narrow the widened set."""

    def test_spec_core_172_i13_an_excluded_member_of_file_ids_is_not_listed(
        self, client, corpus
    ):
        c, _db, _drive_dir, _data_dir = client
        file_ids = [corpus["epub_root"].id, corpus["md_notes"].id, corpus["img_ab"].id]

        res = _listing_post(
            c,
            [("collection", "Picks"), ("exclude_tag", "trip"), ("exclude_type", "image")],
            file_ids,
        )

        assert sorted(_ids(res)) == _want(corpus, "pdf_big_ab", "md_notes")

    def test_spec_core_172_i13_no_collection_still_narrows_file_ids(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client
        file_ids = [corpus["epub_root"].id, corpus["md_notes"].id, corpus["vid_a"].id]

        res = _listing_post(c, [("has_collection", "false")], file_ids)

        assert _ids(res) == [corpus["epub_root"].id]


PARITY = [row for row in CONDITIONS if row[3] and row[3] != ACTIVE]

TAG_COUNT_ROWS = [
    row
    for row in PARITY
    if row[0]
    not in {
        "has a tag",
        "a tag folded across drives is excluded as tags matches it",
        "a folder without one of its subfolders",
    }
]


def _listing_rows(c, params, file_ids=None) -> list[dict]:
    base = [*params, ("limit", "500")]
    if file_ids is None:
        res = c.get(f"/api/drives/{TEST_DRIVE}/files", params=base)
    else:
        res = c.post(f"/api/drives/{TEST_DRIVE}/files/query", params=base, json={"file_ids": file_ids})
    return _ok(res)["data"]


class TestEveryRouteAgrees:
    """SPEC-CORE-172 I2: every listing route forwards the new parameters."""

    @pytest.mark.parametrize(
        ("params", "expected"),
        [(row[2], row[3]) for row in PARITY],
        ids=[row[0] for row in PARITY],
    )
    def test_spec_core_172_i2_files_query_lists_what_files_lists(
        self, client, corpus, params, expected
    ):
        c, _db, _drive_dir, _data_dir = client
        every = [corpus[name].id for name in ACTIVE]

        listed = sorted(row["id"] for row in _listing_rows(c, params))
        queried = sorted(row["id"] for row in _listing_rows(c, params, every))

        assert listed == _want(corpus, *expected)
        assert queried == listed

    @pytest.mark.parametrize(
        ("params", "expected"),
        [(row[2], row[3]) for row in PARITY],
        ids=[row[0] for row in PARITY],
    )
    def test_spec_core_172_i2_folder_counts_count_only_listed_files(
        self, client, corpus, params, expected
    ):
        c, _db, _drive_dir, _data_dir = client
        every = [corpus[name].id for name in ACTIVE]

        got = _ok(c.get(f"/api/drives/{TEST_DRIVE}/folder-counts", params=params))
        posted = _ok(
            c.post(
                f"/api/drives/{TEST_DRIVE}/folder-counts/query",
                params=params,
                json={"file_ids": every},
            )
        )

        want = Counter(corpus[name].folder_path for name in expected)
        pinned = [{"path": p, "count": n} for p, n in sorted(want.items())]
        assert got == pinned
        assert posted == pinned

    @pytest.mark.parametrize(
        ("params", "expected"),
        [(row[2], row[3]) for row in PARITY],
        ids=[row[0] for row in PARITY],
    )
    def test_spec_core_172_i2_shelves_count_only_listed_files(
        self, client, corpus, params, expected
    ):
        c, _db, _drive_dir, _data_dir = client
        every = [corpus[name].id for name in ACTIVE]
        query = [("by", "all"), ("key", "all"), ("per_shelf", "60"), *params]

        got = _ok(c.get(f"/api/drives/{TEST_DRIVE}/shelves", params=query))["shelves"]
        posted = _ok(
            c.post(f"/api/drives/{TEST_DRIVE}/shelves/query", params=query, json={"file_ids": every})
        )["shelves"]

        for shelves in (got, posted):
            count = shelves[0]["count"] if shelves else 0
            assert count == len(expected)

    @pytest.mark.parametrize(
        ("params", "expected"),
        [(row[2], row[3]) for row in TAG_COUNT_ROWS],
        ids=[row[0] for row in TAG_COUNT_ROWS],
    )
    def test_spec_core_172_i2_tag_counts_count_only_listed_files(
        self, client, corpus, params, expected
    ):
        c, _db, _drive_dir, _data_dir = client
        every = [corpus[name].id for name in ACTIVE]

        got = _ok(c.get(f"/api/drives/{TEST_DRIVE}/tag-counts", params=params))
        posted = _ok(
            c.post(
                f"/api/drives/{TEST_DRIVE}/tag-counts/query",
                params=params,
                json={"file_ids": every},
            )
        )

        own = ("Trip", "2023")
        pinned = {
            name: count
            for name in own
            if (count := sum(1 for f in expected if name in {t.name for t in corpus[f].tags}))
        }
        for answer in (got, posted):
            counted = {entry["name"]: entry["count"] for entry in answer if entry["name"] in own}
            assert counted == pinned


class TestFolderCountsArePinned:
    """SPEC-CORE-172 I2: a folder count drifting with the listing still fails."""

    def test_spec_core_172_i2_exclude_folder_drops_the_subtree_from_counts(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        answer = _ok(
            c.get(f"/api/drives/{TEST_DRIVE}/folder-counts", params=[("exclude_folder", "A")])
        )

        paths = {entry["path"] for entry in answer}
        assert "A" not in paths
        assert "A/b" not in paths
        assert "AB" in paths
        assert "a" in paths


def _strings(n: int, prefix: str) -> list[str]:
    return [f"{prefix}{i}" for i in range(n)]


# (label, listing parameters, listing status, matching body, matching status)
VALIDATION = [
    ("an unknown kind", [("exclude_type", "movie")], 422, {"exclude_kinds": ["movie"]}, 422),
    ("has_tag not a boolean", [("has_tag", "maybe")], 422, {"has_tag": "maybe"}, 422),
    ("has_collection not a boolean", [("has_collection", "maybe")], 422, {"has_collection": "maybe"}, 422),
    ("a dot-dot folder", [("exclude_folder", "..")], 400, {"exclude_folders": [".."]}, 422),
    ("an empty segment", [("exclude_folder", "a//b")], 400, {"exclude_folders": ["a//b"]}, 422),
    ("the root folder", [("exclude_folder", "/")], 400, {"exclude_folders": ["/"]}, 422),
    ("a dot segment", [("exclude_folder", "a/./b")], 400, {"exclude_folders": ["a/./b"]}, 422),
    ("a dot-dot segment", [("exclude_folder", "a/../b")], 400, {"exclude_folders": ["a/../b"]}, 422),
    ("a nul", [("exclude_folder", "a\x00b")], 400, {"exclude_folders": ["a\x00b"]}, 422),
    ("a folder of 1025", [("exclude_folder", "x" * 1025)], 400, {"exclude_folders": ["x" * 1025]}, 422),
    (
        "eleven excluded folders",
        [("exclude_folder", f) for f in _strings(11, "f")],
        400,
        {"exclude_folders": _strings(11, "f")},
        422,
    ),
    (
        "a collection of 101",
        [("exclude_collection", "x" * 101)],
        400,
        {"exclude_collections": ["x" * 101]},
        422,
    ),
    (
        "eleven excluded collections",
        [("exclude_collection", n) for n in _strings(11, "c")],
        400,
        {"exclude_collections": _strings(11, "c")},
        422,
    ),
]


class TestValidation:
    """SPEC-CORE-172 sending 7, I10: each new key answers what its positive one does."""

    @pytest.mark.parametrize(
        ("params", "listing_status", "body", "matching_status"),
        [row[1:] for row in VALIDATION],
        ids=[row[0] for row in VALIDATION],
    )
    def test_spec_core_172_a_bad_value_is_rejected_on_both_surfaces(
        self, client, corpus, params, listing_status, body, matching_status
    ):
        c, _db, _drive_dir, _data_dir = client

        assert _listing(c, [("exclude_folder", "Notes")]).status_code == 200
        assert _match(c, exclude_folders=["Notes"]).status_code == 200

        assert _listing(c, params).status_code == listing_status
        assert _match(c, **body).status_code == matching_status

    @pytest.mark.parametrize(
        "body",
        [
            {"exclude_tags": _strings(21, "t")},
            {"exclude_tags": ["x" * 201]},
            {"exclude_kinds": ["video", "image", "audio", "document", "archive", "other", "text", "pdf", "epub"]},
            {"has_tag": "true"},
            {"has_tag": 1},
            {"has_collection": "false"},
            {"has_collection": 0},
            {"exclude_tags": "trip"},
            {"exclude_folders": "A"},
            {"exclude_tags": [1]},
            {"exclude_kinds": "pdf"},
            {"exclude_collections": [None]},
            {"exclude_folders": [""]},
        ],
        ids=[
            "twenty-one-excluded-tags",
            "an-excluded-tag-of-201",
            "nine-distinct-excluded-kinds",
            "has-tag-a-string",
            "has-tag-a-number",
            "has-collection-a-string",
            "has-collection-a-number",
            "exclude-tags-not-a-list",
            "exclude-folders-not-a-list",
            "an-excluded-tag-not-a-string",
            "exclude-kinds-not-a-list",
            "an-excluded-collection-not-a-string",
            "an-empty-excluded-folder",
        ],
    )
    def test_spec_core_172_matching_rejects_what_the_addon_rejects(self, client, corpus, body):
        c, _db, _drive_dir, _data_dir = client

        assert _match(c, has_tag=False).status_code == 200
        assert _match(c, **body).status_code == 422

    @pytest.mark.parametrize(
        ("body", "params"),
        [
            (
                {"tags": _strings(20, "t"), "exclude_tags": _strings(20, "u")},
                [*[("tag", t) for t in _strings(20, "t")], *[("exclude_tag", t) for t in _strings(20, "u")]],
            ),
            (
                {"exclude_tags": [*_strings(20, "t"), "T0"]},
                [("exclude_tag", t) for t in [*_strings(20, "t"), "T0"]],
            ),
            (
                {"exclude_tags": ["x" * 200]},
                [("exclude_tag", "x" * 200)],
            ),
            (
                {"exclude_kinds": ["video", "image", "audio", "document", "archive", "other", "text", "pdf"]},
                [("exclude_type", k) for k in ["video", "image", "audio", "document", "archive", "other", "text", "pdf"]],
            ),
            (
                {"exclude_kinds": ["markdown", "text"]},
                [("exclude_type", "text")],
            ),
            (
                {"folders": _strings(10, "f"), "exclude_folders": _strings(10, "g")},
                [*[("folder", f) for f in _strings(10, "f")], *[("exclude_folder", f) for f in _strings(10, "g")]],
            ),
            (
                {"exclude_folders": [*_strings(10, "f"), "/f0/"]},
                [("exclude_folder", f) for f in [*_strings(10, "f"), "/f0/"]],
            ),
            (
                {"collections": _strings(10, "c"), "exclude_collections": _strings(10, "d")},
                [*[("collection", n) for n in _strings(10, "c")], *[("exclude_collection", n) for n in _strings(10, "d")]],
            ),
            (
                {"exclude_collections": [*_strings(10, "c"), "C0"]},
                [("exclude_collection", n) for n in [*_strings(10, "c"), "C0"]],
            ),
            (
                {"exclude_folders": ["x" * 1024], "exclude_collections": ["y" * 100]},
                [("exclude_folder", "x" * 1024), ("exclude_collection", "y" * 100)],
            ),
            (
                {"has_tag": None, "has_collection": None, "exclude_tags": [], "exclude_kinds": [], "exclude_folders": [], "exclude_collections": []},
                [],
            ),
        ],
        ids=[
            "twenty-tags-and-twenty-excluded-tags-counted-apart",
            "twenty-one-raw-twenty-distinct-excluded-tags",
            "an-excluded-tag-of-200",
            "eight-distinct-excluded-kinds",
            "markdown-is-text",
            "ten-folders-and-ten-excluded-folders-counted-apart",
            "eleven-raw-ten-distinct-excluded-folders",
            "ten-collections-and-ten-excluded-collections-counted-apart",
            "eleven-raw-ten-distinct-excluded-collections",
            "the-longest-folder-and-collection",
            "every-new-key-at-its-default",
        ],
    )
    def test_spec_core_172_a_value_within_the_caps_is_accepted(self, client, corpus, body, params):
        c, _db, _drive_dir, _data_dir = client

        matched = _match(c, **body)
        listed = _listing(c, params)

        assert matched.status_code == 200, matched.text
        assert listed.status_code == 200, listed.text
        assert _matched(matched) == sorted(_ids(listed))

    def test_spec_core_172_a_folder_is_normalised_before_it_is_compared(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        wrapped = _ids(_listing(c, [("exclude_folder", "/A/")]))
        matched = _matched(_match(c, exclude_folders=["/A/"]))

        assert sorted(wrapped) == matched == _want(
            corpus, "pdf_big_ab", "txt_lower_a", "epub_root", "md_notes", "folded"
        )

    def test_spec_core_172_a_collection_name_is_trimmed(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        listed = _ids(_listing(c, [("exclude_collection", "  Picks  ")]))

        assert sorted(listed) == _want(corpus, "img_ab", "txt_lower_a", "epub_root", "md_notes", "folded")


class TestUnchangedWithoutTheNewKeys:
    """SPEC-CORE-172 I1: matching still answers only `file_ids` with the defaults."""

    def test_spec_core_172_i1_defaults_keep_every_active_file(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _match(
            c,
            exclude_tags=[],
            exclude_kinds=[],
            exclude_folders=[],
            exclude_collections=[],
            has_tag=None,
            has_collection=None,
        )

        assert _matched(res) == _want(corpus, *ACTIVE)
        assert list(res.json()) == ["file_ids"]
