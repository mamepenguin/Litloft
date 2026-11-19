"""Acceptance tests for SPEC-CORE-138: the listing's ``modified`` parameter and
``POST /api/internal/files/matching``'s ``modified`` field.

Every comparison is applied to ``files.modified_at`` as whole epoch seconds
(I4, I7), both surfaces and the routes built on ``FileFiltersQuery`` answer
the same ids (I5, I17), and the listing (400) and ``/files/matching`` (422)
accept and reject the same wire forms (I9).
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

import pytest

from app.models import File, Tag
from tests.conftest import TEST_DRIVE

URL = "/api/internal/files/matching"
OTHER_DRIVE = "elsewhere"
MAX_WIRE = 253402300799
TOKYO_2024 = 1704034800
NOW = 1795489200
YEAR = 365 * 86400


def _naive(epoch: int) -> datetime:
    return datetime.fromtimestamp(epoch, UTC).replace(tzinfo=None)


def _file(
    db,
    name: str,
    *,
    modified: int | None,
    folder_path: str = "",
    tags: list[Tag] | None = None,
    favorite: bool = False,
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
        file_size=10,
        duration=60.0,
        file_type="video",
        mime_type="video/mp4",
        is_favorite=favorite,
        created_at=datetime(2026, 1, day, tzinfo=UTC),
        deleted_at=datetime(2026, 1, day, tzinfo=UTC) if deleted else None,
        missing_since=datetime(2026, 1, day, tzinfo=UTC) if missing else None,
        modified_at=None if modified is None else _naive(modified),
    )
    file.tags.extend(tags or [])
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _listing(c, params: list[tuple[str, str]] | None = None):
    return c.get(
        f"/api/drives/{TEST_DRIVE}/files",
        params=[("limit", "100"), *(params or [])],
    )


def _query(c, params: list[tuple[str, str]], file_ids: list[str]):
    return c.post(
        f"/api/drives/{TEST_DRIVE}/files/query",
        params=[("limit", "100"), *params],
        json={"file_ids": file_ids},
    )


def _match(c, *, drive: str = TEST_DRIVE, **conditions):
    return c.post(URL, json={"drive": drive, **conditions})


def _ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["data"]]


def _matched(response) -> list[str]:
    assert response.status_code == 200, response.text
    return sorted(response.json()["file_ids"])


def _want(corpus, *names: str) -> list[str]:
    return sorted(corpus[name].id for name in names)


def _params(wires: list[str]) -> list[tuple[str, str]]:
    return [("modified", wire) for wire in wires]


DATED = ("epoch", "before_2024", "at_2024", "mid_2024", "year_366", "year_364", "max")
ACTIVE = (*DATED, "never")


@pytest.fixture()
def corpus(client):
    _c, db, _drive_dir, _data_dir = client
    meeting = Tag(name="会議", drive=TEST_DRIVE)
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    return {
        "epoch": _file(db, "epoch.mp4", modified=0, day=1),
        "before_2024": _file(db, "before.mp4", modified=TOKYO_2024 - 1, folder_path="Downloads", day=2),
        "at_2024": _file(db, "at.mp4", modified=TOKYO_2024, folder_path="Downloads", day=3),
        "mid_2024": _file(
            db, "mid.mp4", modified=1718409600, folder_path="Work", tags=[meeting], favorite=True, day=4
        ),
        "year_366": _file(db, "y366.mp4", modified=NOW - 366 * 86400, folder_path="Downloads", day=5),
        "year_364": _file(db, "y364.mp4", modified=NOW - 364 * 86400, folder_path="Downloads", day=6),
        "max": _file(db, "max.mp4", modified=MAX_WIRE, day=7),
        "never": _file(db, "never.mp4", modified=None, folder_path="Downloads", day=8),
        "trashed": _file(db, "trashed.mp4", modified=TOKYO_2024, deleted=True, day=9),
        "gone": _file(db, "gone.mp4", modified=TOKYO_2024, missing=True, day=10),
        "other_drive": _file(db, "other.mp4", modified=TOKYO_2024, drive=OTHER_DRIVE, day=11),
    }


COMPARISONS = [
    (f"lt:{TOKYO_2024}", ("epoch", "before_2024")),
    (f"lte:{TOKYO_2024}", ("epoch", "before_2024", "at_2024")),
    (f"gt:{TOKYO_2024}", ("mid_2024", "year_366", "year_364", "max")),
    (f"gte:{TOKYO_2024}", ("at_2024", "mid_2024", "year_366", "year_364", "max")),
    ("gte:0", DATED),
    (f"lte:{MAX_WIRE}", DATED),
    ("gt:0", tuple(n for n in DATED if n != "epoch")),
    (f"lt:{MAX_WIRE}", tuple(n for n in DATED if n != "max")),
    ("lt:0", ()),
]


class TestModifiedComparisons:
    """SPEC-CORE-138 sending 3: each comparison holds against files.modified_at."""

    @pytest.mark.parametrize(
        ("wire", "expected"), COMPARISONS, ids=[row[0] for row in COMPARISONS]
    )
    def test_spec_core_138_the_listing_and_matching_apply_the_operator_to_epoch_seconds(
        self, client, corpus, wire, expected
    ):
        c, _db, _drive_dir, _data_dir = client

        listed = _listing(c, [("modified", wire)])
        matched = _match(c, modified=[wire])

        assert sorted(_ids(listed)) == _want(corpus, *expected)
        assert _matched(matched) == _want(corpus, *expected)
        assert listed.json()["meta"]["total"] == len(expected)

    @pytest.mark.parametrize(
        ("wire", "before", "at"),
        [
            (f"lt:{TOKYO_2024}", True, False),
            (f"lte:{TOKYO_2024}", True, True),
            (f"gt:{TOKYO_2024 - 1}", False, True),
            (f"gte:{TOKYO_2024}", False, True),
            (f"gte:{TOKYO_2024 - 1}", True, True),
            (f"lt:{TOKYO_2024 - 1}", False, False),
        ],
        ids=["below", "at-most", "above-the-second-before", "at-least", "at-least-the-second-before", "below-the-second-before"],
    )
    def test_spec_core_138_one_second_either_side_of_a_boundary(self, client, corpus, wire, before, at):
        c, _db, _drive_dir, _data_dir = client

        listed = set(_ids(_listing(c, [("modified", wire)])))
        matched = set(_matched(_match(c, modified=[wire])))

        for name, kept in (("before_2024", before), ("at_2024", at)):
            assert (corpus[name].id in listed) is kept, name
            assert (corpus[name].id in matched) is kept, name

    def test_spec_core_138_i7_a_year_back_keeps_366_days_and_not_364(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client
        older_than_a_year = f"lt:{NOW - YEAR}"
        within_30_days = f"gte:{NOW - 30 * 86400}"

        listed = set(_ids(_listing(c, [("modified", older_than_a_year)])))
        matched = set(_matched(_match(c, modified=[older_than_a_year])))
        recent = set(_ids(_listing(c, [("modified", within_30_days)])))

        assert corpus["year_366"].id in listed and corpus["year_366"].id in matched
        assert corpus["year_364"].id not in listed and corpus["year_364"].id not in matched
        assert corpus["year_364"].id not in recent
        assert corpus["max"].id in recent

    def test_spec_core_138_comparisons_are_and(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client
        june_2024 = [f"gte:{1717167600}", f"lt:{1719759600}"]

        listed = _listing(c, _params(june_2024))
        matched = _match(c, modified=june_2024)

        assert sorted(_ids(listed)) == _want(corpus, "mid_2024")
        assert _matched(matched) == _want(corpus, "mid_2024")

    def test_spec_core_138_trashed_missing_and_other_drives_files_are_not_kept(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        kept = _ids(_listing(c, [("modified", f"gte:{TOKYO_2024}")]))

        assert corpus["at_2024"].id in kept
        for name in ("trashed", "gone", "other_drive"):
            assert corpus[name].id not in kept, name


class TestNullNeverPasses:
    """SPEC-CORE-138 I4: a row whose modified_at is NULL passes no comparison."""

    @pytest.mark.parametrize("wire", ["gte:0", "gt:0", f"lte:{MAX_WIRE}", f"lt:{MAX_WIRE}"])
    def test_spec_core_138_i4_null_is_kept_by_no_comparison(self, client, corpus, wire):
        c, _db, _drive_dir, _data_dir = client

        listed = _ids(_listing(c, [("modified", wire)]))
        matched = _matched(_match(c, modified=[wire]))

        assert corpus["never"].id not in listed
        assert corpus["never"].id not in matched
        assert corpus["mid_2024"].id in listed
        assert corpus["mid_2024"].id in matched

    def test_spec_core_138_i4_null_is_listed_when_there_is_no_comparison(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        assert corpus["never"].id in _ids(_listing(c))
        assert corpus["never"].id not in _ids(_listing(c, [("modified", "gte:0")]))


PARITY_ROWS = [
    ("one comparison", {"modified": [f"lt:{TOKYO_2024}"]}, [("modified", f"lt:{TOKYO_2024}")]),
    (
        "a range",
        {"modified": [f"gte:{TOKYO_2024}", f"lt:{NOW}"]},
        [("modified", f"gte:{TOKYO_2024}"), ("modified", f"lt:{NOW}")],
    ),
    (
        "with a tag, a kind and a favourite",
        {"tags": ["会議"], "kinds": ["video"], "favorite": True, "modified": ["gte:0"]},
        [("tag", "会議"), ("type", "video"), ("favorite", "true"), ("modified", "gte:0")],
    ),
    (
        "with a folder",
        {"folders": ["Downloads"], "modified": [f"lt:{NOW - YEAR}"]},
        [("folder", "Downloads"), ("modified", f"lt:{NOW - YEAR}")],
    ),
    (
        "with a size and a duration",
        {"sizes": ["gte:1"], "durations": ["lte:60"], "modified": [f"gt:{TOKYO_2024}"]},
        [("size", "gte:1"), ("duration", "lte:60"), ("modified", f"gt:{TOKYO_2024}")],
    ),
    (
        "an impossible range",
        {"modified": [f"gt:{TOKYO_2024}", f"lt:{TOKYO_2024 - 1}"]},
        [("modified", f"gt:{TOKYO_2024}"), ("modified", f"lt:{TOKYO_2024 - 1}")],
    ),
    ("below zero", {"modified": ["lt:0"]}, [("modified", "lt:0")]),
]


class TestSurfaceParity:
    """SPEC-CORE-138 I5: /files/matching answers the ids GET /files and POST /files/query answer."""

    @pytest.mark.parametrize(
        ("body", "params"),
        [(row[1], row[2]) for row in PARITY_ROWS],
        ids=[row[0] for row in PARITY_ROWS],
    )
    def test_spec_core_138_i5_matching_listing_and_query_answer_the_same_ids(
        self, client, corpus, body, params
    ):
        c, _db, _drive_dir, _data_dir = client
        everyone = [corpus[name].id for name in ACTIVE]

        matched = _matched(_match(c, **body))
        listed = sorted(_ids(_listing(c, params)))
        queried = sorted(_ids(_query(c, params, everyone)))

        assert matched == listed == queried

    def test_spec_core_138_i5_the_folder_row_picks_the_old_downloads(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        listed = _ids(_listing(c, [("folder", "Downloads"), ("modified", f"lt:{NOW - YEAR}")]))

        assert sorted(listed) == _want(corpus, "before_2024", "at_2024", "year_366")


class TestFolderCountsAndShelves:
    """SPEC-CORE-138 I17: the routes built on FileFiltersQuery keep what GET /files keeps."""

    WIRE = [("modified", f"lt:{NOW - YEAR}")]

    def test_spec_core_138_i17_folder_counts_count_only_listed_files(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client
        params = [("type", "video"), *self.WIRE]
        everyone = [corpus[name].id for name in ACTIVE]

        listed = Counter(row["folder_path"] for row in c.get(
            f"/api/drives/{TEST_DRIVE}/files", params=[*params, ("limit", "500")]
        ).json()["data"])
        got = c.get(f"/api/drives/{TEST_DRIVE}/folder-counts", params=params)
        posted = c.post(
            f"/api/drives/{TEST_DRIVE}/folder-counts/query", params=params, json={"file_ids": everyone}
        )

        assert got.status_code == 200, got.text
        assert posted.status_code == 200, posted.text
        expected = [{"path": p, "count": n} for p, n in sorted(listed.items())]
        assert got.json() == expected
        assert posted.json() == expected
        assert {e["path"]: e["count"] for e in got.json()} == {"": 1, "Downloads": 3, "Work": 1}

    def test_spec_core_138_i17_shelves_list_only_listed_files(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client
        params = [("by", "folder"), ("type", "video"), ("per_shelf", "60"), *self.WIRE]
        everyone = [corpus[name].id for name in ACTIVE]
        kept = {
            item["id"]
            for item in c.get(
                f"/api/drives/{TEST_DRIVE}/files", params=[("type", "video"), *self.WIRE, ("limit", "500")]
            ).json()["data"]
        }

        for res in (
            c.get(f"/api/drives/{TEST_DRIVE}/shelves", params=params),
            c.post(f"/api/drives/{TEST_DRIVE}/shelves/query", params=params, json={"file_ids": everyone}),
        ):
            assert res.status_code == 200, res.text
            shelved = {item["id"] for shelf in res.json()["shelves"] for item in shelf["items"]}
            assert shelved == kept
            assert corpus["year_364"].id not in shelved

    @pytest.mark.parametrize(
        "path",
        ["/folder-counts", "/shelves"],
    )
    def test_spec_core_138_i17_a_malformed_comparison_is_400_there_too(self, client, corpus, path):
        c, _db, _drive_dir, _data_dir = client
        params = [("by", "folder"), ("type", "video"), ("modified", "lt:-1")]

        assert c.get(f"/api/drives/{TEST_DRIVE}{path}", params=params).status_code == 400
        assert c.get(
            f"/api/drives/{TEST_DRIVE}{path}", params=[*params[:2], ("modified", "lt:1")]
        ).status_code == 200


class TestWireFormValidation:
    """SPEC-CORE-138 I9: 400 on the listing where matching answers 422, and the same accepts."""

    REJECTED = [
        ("lt:-1", "negative"),
        (f"lt:{MAX_WIRE + 1}", "above-9999-12-31T23-59-59Z"),
        ("lt:1.5", "a-fraction"),
        ("lt:1e3", "an-exponent"),
        ("lt:", "an-empty-amount"),
        ("lt", "no-amount"),
        ("1704034800", "no-comparison"),
        ("eq:1704034800", "equal-is-not-a-comparison"),
        ("LT:1704034800", "operator-case"),
        (" lt:1704034800", "a-leading-space"),
        ("lt:1704034800 ", "a-trailing-space"),
        ("lt:2024-01-01", "a-date-on-the-wire"),
        ("lt:1y", "a-relative-amount-on-the-wire"),
        ("<2024", "the-typed-form"),
        ("", "empty"),
    ]

    @pytest.mark.parametrize(("wire", "name"), REJECTED, ids=[row[1] for row in REJECTED])
    def test_spec_core_138_i9_a_malformed_item_is_400_on_the_listing_and_422_on_matching(
        self, client, corpus, wire, name
    ):
        c, _db, _drive_dir, _data_dir = client

        listed = _listing(c, [("modified", wire)])
        matched = _match(c, modified=[wire])
        well_formed = _match(c, modified=["gte:0"])

        assert listed.status_code == 400, listed.text
        assert matched.status_code == 422, matched.text
        assert well_formed.status_code == 200, well_formed.text

    ACCEPTED = [
        (["gte:0"], "zero"),
        ([f"lte:{MAX_WIRE}"], "the-largest"),
        ([f"lt:{TOKYO_2024}"], "a-boundary"),
        ([f"lt:{TOKYO_2024}", f"lt:{TOKYO_2024}"], "a-duplicate"),
        (["gte:1", "gte:2", "gte:3", "gte:4"], "four-distinct"),
        (["gte:1", "gte:2", "gte:3", "gte:4", "gte:1"], "five-raw-four-distinct"),
    ]

    @pytest.mark.parametrize(("values", "name"), ACCEPTED, ids=[row[1] for row in ACCEPTED])
    def test_spec_core_138_i9_an_item_in_the_wire_form_is_accepted(self, client, corpus, values, name):
        c, _db, _drive_dir, _data_dir = client

        listed = _listing(c, _params(values))
        matched = _match(c, modified=values)

        assert listed.status_code == 200, listed.text
        assert matched.status_code == 200, matched.text
        assert sorted(_ids(listed)) == _matched(matched)
        assert corpus["never"].id not in _ids(listed)

    def test_spec_core_138_i9_the_fifth_distinct_item_is_400_and_422(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client
        values = [f"gte:{i}" for i in range(5)]

        assert _listing(c, _params(values)).status_code == 400
        assert _match(c, modified=values).status_code == 422
        assert _listing(c, _params(values[:4])).status_code == 200
        assert _match(c, modified=values[:4]).status_code == 200

    def test_spec_core_138_i9_a_non_list_or_non_string_is_422_on_matching(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        assert _match(c, modified=f"lt:{TOKYO_2024}").status_code == 422
        assert _match(c, modified=[1704034800]).status_code == 422
        assert _match(c, modified=[]).status_code == 200


class TestUnchangedWithoutModified:
    """SPEC-CORE-138 I10 on the core: no modified leaves the answers as they were."""

    def test_spec_core_138_matching_defaults_modified_to_empty(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        default = _match(c)
        explicit = _match(c, modified=[])

        assert _matched(default) == _want(corpus, *ACTIVE)
        assert _matched(explicit) == _matched(default)


class TestFileResponseCarriesModifiedAt:
    """SPEC-CORE-138 list rows: FileResponse gains modified_at, nullable."""

    def test_spec_core_138_the_listing_row_carries_the_stored_value(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        rows = {row["id"]: row for row in _listing(c).json()["data"]}

        mid = rows[corpus["mid_2024"].id]["modified_at"]
        parsed = datetime.fromisoformat(mid)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(UTC).replace(tzinfo=None)
        assert parsed == _naive(1718409600)
        assert rows[corpus["never"].id]["modified_at"] is None
