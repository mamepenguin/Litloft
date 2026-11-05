"""Acceptance tests for SPEC-CORE-044: searching by file size and by length.

The listing's ``size`` / ``duration`` parameters and the Internal API's
``sizes`` / ``durations`` must resolve through the same predicates (I1), apply
the stated operator to exact bytes (I2) and to the whole displayed seconds
(I12), never keep a row whose duration is NULL (I3), answer no ids for a range
that admits no value (I7), and accept and reject the same wire forms as the
addon does (I8).
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models import File, Tag
from tests.conftest import TEST_DRIVE

URL = "/api/internal/files/matching"
OTHER_DRIVE = "elsewhere"
TWO_GIB = 2 * 1024**3
MAX_SIZE = 2**53 - 1


def _at(day: int) -> datetime:
    return datetime(2026, 1, day, tzinfo=UTC)


def _file(
    db,
    name: str,
    *,
    file_size: int = 1,
    duration: float | None = None,
    folder_path: str = "",
    file_type: str = "video",
    mime_type: str = "video/mp4",
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
        file_path=name,
        file_size=file_size,
        duration=duration,
        file_type=file_type,
        mime_type=mime_type,
        is_favorite=favorite,
        created_at=_at(day),
        deleted_at=_at(day) if deleted else None,
        missing_since=_at(day) if missing else None,
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


def _match(c, *, drive: str = TEST_DRIVE, **conditions):
    return c.post(URL, json={"drive": drive, **conditions})


def _ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["data"]]


def _want(corpus, *names: str) -> list[str]:
    return sorted(corpus[name].id for name in names)


ACTIVE = ("zero", "img", "doc", "b1023", "b1024", "b1025", "big", "tagged")

SIZE_CASES = [
    ("gt:1024", ("b1025", "big", "tagged")),
    ("gte:1024", ("b1024", "b1025", "big", "tagged")),
    ("lt:1024", ("zero", "img", "doc", "b1023")),
    ("lte:1024", ("zero", "img", "doc", "b1023", "b1024")),
    ("gte:0", ACTIVE),
    ("lt:0", ()),
]

DURATION_CASES = [
    ("lt:90", ("zero", "b1025")),
    ("lte:90", ("zero", "b1023", "b1024", "b1025")),
    ("gt:90", ("big", "tagged")),
    ("gte:90", ("b1023", "b1024", "big", "tagged")),
    ("lte:0", ("zero",)),
    ("gte:0", ("zero", "b1023", "b1024", "b1025", "big", "tagged")),
    ("lt:0", ()),
]

PARITY_ROWS = [
    ("a size", {"sizes": ["gte:1024"]}, [("size", "gte:1024")], ("b1024", "b1025", "big", "tagged")),
    ("a duration", {"durations": ["lt:90"]}, [("duration", "lt:90")], ("zero", "b1025")),
    (
        "a size range",
        {"sizes": ["gte:1024", "lt:2147483648"]},
        [("size", "gte:1024"), ("size", "lt:2147483648")],
        ("b1024", "b1025", "tagged"),
    ),
    (
        "a duration range",
        {"durations": ["gte:89", "lte:90"]},
        [("duration", "gte:89"), ("duration", "lte:90")],
        ("b1023", "b1024", "b1025"),
    ),
    (
        "size and duration together",
        {"sizes": ["gte:1024"], "durations": ["lte:90"]},
        [("size", "gte:1024"), ("duration", "lte:90")],
        ("b1024", "b1025"),
    ),
    (
        "with a tag and a kind",
        {
            "tags": ["会議"],
            "kinds": ["video"],
            "sizes": ["gte:1024"],
            "durations": ["lte:600"],
        },
        [
            ("tag", "会議"),
            ("type", "video"),
            ("size", "gte:1024"),
            ("duration", "lte:600"),
        ],
        ("tagged",),
    ),
    (
        "with a favourite",
        {"favorite": True, "sizes": ["gte:1"]},
        [("favorite", "true"), ("size", "gte:1")],
        ("tagged",),
    ),
    (
        "an impossible size range",
        {"sizes": ["gt:1073741824", "lt:524288000"]},
        [("size", "gt:1073741824"), ("size", "lt:524288000")],
        (),
    ),
    (
        "an impossible duration range",
        {"durations": ["gt:600", "lte:600"]},
        [("duration", "gt:600"), ("duration", "lte:600")],
        (),
    ),
]


@pytest.fixture()
def corpus(client):
    _c, db, _drive_dir, _data_dir = client
    meeting = Tag(name="会議", drive=TEST_DRIVE)
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    return {
        "zero": _file(db, "zero.mp4", file_size=0, duration=0.0, day=1),
        "img": _file(db, "img.jpg", file_size=1, file_type="image", mime_type="image/jpeg", day=2),
        "doc": _file(db, "doc.pdf", file_size=512, file_type="document", mime_type="application/pdf", day=3),
        "b1023": _file(db, "b1023.mp4", file_size=1023, duration=90.4, day=4),
        "b1024": _file(db, "b1024.mp4", file_size=1024, duration=90.0, day=5),
        "b1025": _file(db, "b1025.mp4", file_size=1025, duration=89.9, day=6),
        "big": _file(db, "big.mp4", file_size=TWO_GIB, duration=5400.0, day=7),
        "tagged": _file(db, "tagged.mp4", file_size=2048, duration=600.0, tags=[meeting], favorite=True, day=8),
        "trashed": _file(db, "trashed.mp4", file_size=1025, duration=90.0, deleted=True, day=9),
        "gone": _file(db, "gone.mp4", file_size=1025, duration=90.0, missing=True, day=10),
        "other_drive": _file(db, "other.mp4", file_size=1025, duration=90.0, drive=OTHER_DRIVE, day=11),
    }


class TestSizeComparisons:
    """SPEC-CORE-044 I2: a size comparison keeps a file exactly when it holds."""

    @pytest.mark.parametrize(
        ("wire", "expected"),
        SIZE_CASES,
        ids=[row[0] for row in SIZE_CASES],
    )
    def test_the_listing_and_matching_apply_the_operator_to_bytes(
        self, client, corpus, wire, expected
    ):
        c, _db, _drive_dir, _data_dir = client

        listed = _listing(c, [("size", wire)])
        matched = _match(c, sizes=[wire])

        assert sorted(_ids(listed)) == _want(corpus, *expected)
        assert sorted(matched.json()["file_ids"]) == _want(corpus, *expected)
        assert listed.json()["meta"]["total"] == len(expected)

    @pytest.mark.parametrize(
        ("wire", "b1023", "b1024", "b1025"),
        [
            ("gt:1024", False, False, True),
            ("gte:1024", False, True, True),
            ("lt:1024", True, False, False),
            ("lte:1024", True, True, False),
            ("gt:1023", False, True, True),
            ("lt:1025", True, True, False),
        ],
        ids=["above", "at-least", "below", "at-most", "above-1023", "below-1025"],
    )
    def test_the_1023_1024_1025_boundary(
        self, client, corpus, wire, b1023, b1024, b1025
    ):
        c, _db, _drive_dir, _data_dir = client

        listed = set(_ids(_listing(c, [("size", wire)])))
        matched = set(_match(c, sizes=[wire]).json()["file_ids"])

        for name, kept in (
            ("b1023", b1023),
            ("b1024", b1024),
            ("b1025", b1025),
        ):
            assert (corpus[name].id in listed) is kept
            assert (corpus[name].id in matched) is kept

    def test_a_trashed_missing_or_other_drives_file_is_not_kept(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        kept = _ids(_listing(c, [("size", "gte:1024")]))

        assert sorted(kept) == _want(corpus, "b1024", "b1025", "big", "tagged")
        assert corpus["trashed"].id not in kept
        assert corpus["gone"].id not in kept
        assert corpus["other_drive"].id not in kept


class TestDurationComparisons:
    """SPEC-CORE-044 I3/I12: whole displayed seconds, NULL never passes."""

    @pytest.mark.parametrize(
        ("wire", "expected"),
        DURATION_CASES,
        ids=[row[0] for row in DURATION_CASES],
    )
    def test_the_listing_and_matching_compare_whole_seconds(
        self, client, corpus, wire, expected
    ):
        c, _db, _drive_dir, _data_dir = client

        listed = _listing(c, [("duration", wire)])
        matched = _match(c, durations=[wire])

        assert sorted(_ids(listed)) == _want(corpus, *expected)
        assert sorted(matched.json()["file_ids"]) == _want(corpus, *expected)

    @pytest.mark.parametrize(
        ("wire", "kept"),
        [
            ("lte:90", True),
            ("gte:90", True),
            ("gt:90", False),
            ("lt:90", False),
            ("lte:90.4", True),
            ("lt:90.4", True),
            ("gt:90.4", False),
        ],
        ids=[
            "at-most-1-30",
            "at-least-90",
            "above-1-30",
            "below-90",
            "at-most-the-fraction",
            "below-the-fraction",
            "above-the-fraction",
        ],
    )
    def test_a_90_4_second_file_is_compared_as_90(
        self, client, corpus, wire, kept
    ):
        c, _db, _drive_dir, _data_dir = client

        listed = _ids(_listing(c, [("duration", wire)]))
        matched = _match(c, durations=[wire]).json()["file_ids"]

        assert (corpus["b1023"].id in listed) is kept
        assert (corpus["b1023"].id in matched) is kept

    @pytest.mark.parametrize(
        "wire",
        ["gt:0", "gte:0", "lt:10000000", "lte:10000000", "gte:0.001", "lte:10000000"],
    )
    def test_a_null_duration_never_passes(self, client, corpus, wire):
        c, _db, _drive_dir, _data_dir = client

        listed = _ids(_listing(c, [("duration", wire)]))
        matched = _match(c, durations=[wire]).json()["file_ids"]

        for name in ("doc", "img"):
            assert corpus[name].id not in listed
            assert corpus[name].id not in matched

    def test_a_drive_of_documents_matches_no_duration(self, client):
        c, db, _drive_dir, _data_dir = client
        _file(db, "notes.md", file_size=10, file_type="document", mime_type="text/markdown")

        assert _ids(_listing(c, [("duration", "gte:0")])) == []
        assert _match(c, durations=["gte:0"]).json()["file_ids"] == []


class TestParagraphParity:
    """SPEC-CORE-044 I1: the endpoint answers the listing's ids."""

    @pytest.mark.parametrize(
        ("body", "params", "expected"),
        [(row[1], row[2], row[3]) for row in PARITY_ROWS],
        ids=[row[0] for row in PARITY_ROWS],
    )
    def test_matching_answers_the_listing_ids(self, client, corpus, body, params, expected):
        c, _db, _drive_dir, _data_dir = client

        matched = _match(c, **body)
        listed = _listing(c, params)

        assert matched.status_code == 200, matched.text
        assert sorted(matched.json()["file_ids"]) == sorted(_ids(listed))
        assert sorted(_ids(listed)) == _want(corpus, *expected)
        assert listed.json()["meta"]["total"] == len(expected)


class TestImpossibleRanges:
    """SPEC-CORE-044 I7: an impossible range is not an error and answers no ids."""

    @pytest.mark.parametrize(
        ("field", "values"),
        [
            ("sizes", ["gt:1073741824", "lt:524288000"]),
            ("sizes", ["lt:0"]),
            ("sizes", ["gt:1024", "lt:1025"]),
            ("sizes", ["gte:1025", "lt:1025"]),
            ("sizes", ["gt:1024", "lte:1024"]),
            ("durations", ["gt:600", "lte:600"]),
            ("durations", ["lt:0"]),
        ],
        ids=[
            "size-above-one-gib-and-below-500-mib",
            "size-below-zero",
            "no-whole-byte-between-1024-and-1025",
            "at-least-1025-and-below-1025",
            "above-1024-and-at-most-1024",
            "above-ten-minutes-and-at-most-ten-minutes",
            "duration-below-zero",
        ],
    )
    def test_an_impossible_range_answers_empty_on_both_surfaces(
        self, client, corpus, field, values
    ):
        c, _db, _drive_dir, _data_dir = client
        query_field = "size" if field == "sizes" else "duration"

        listed = _listing(c, [(query_field, value) for value in values])
        matched = _match(c, **{field: values})

        assert listed.status_code == 200, listed.text
        assert matched.status_code == 200, matched.text
        assert _ids(listed) == []
        assert matched.json()["file_ids"] == []


class TestWireFormValidation:
    """SPEC-CORE-044 I8: 400 on the listing where matching answers 422."""

    REJECTED = [
        ("sizes", "gt:9007199254740992", "size-above-2-53-minus-1"),
        ("sizes", "gt:1024.5", "size-not-whole"),
        ("sizes", "gt:90.4", "size-fraction-not-whole"),
        ("sizes", "gt:-1", "size-negative"),
        ("sizes", "gt:1e3", "size-exponent"),
        ("sizes", "gt:1.0", "size-trailing-dot-zero"),
        ("sizes", "gt:", "size-empty-amount"),
        ("sizes", "gt", "size-no-amount"),
        ("sizes", "1GB", "size-no-comparison"),
        ("sizes", "eq:1024", "size-equal-is-not-a-comparison"),
        ("sizes", "GT:1024", "size-operator-case"),
        ("sizes", "gt:1024KB", "size-unit-on-the-wire"),
        ("sizes", " gt:1024", "size-leading-space"),
        ("sizes", "", "size-empty"),
        ("durations", "gt:10000001", "duration-above-ten-million"),
        ("durations", "gt:10000000.001", "duration-above-ten-million-fraction"),
        ("durations", "gt:90.0001", "duration-four-decimals"),
        ("durations", "gt:-1", "duration-negative"),
        ("durations", "gt:1e3", "duration-exponent"),
        ("durations", "gt:1.0", "duration-trailing-dot-zero"),
        ("durations", "gt:", "duration-empty-amount"),
        ("durations", "1m30s", "duration-unit-on-the-wire"),
        ("durations", "gt:1:30", "duration-clock-on-the-wire"),
        ("durations", "GTE:90", "duration-operator-case"),
        ("durations", "gt:90 ", "duration-trailing-space"),
    ]

    @pytest.mark.parametrize(
        ("field", "wire", "name"),
        REJECTED,
        ids=[row[2] for row in REJECTED],
    )
    def test_a_malformed_item_is_400_on_the_listing_and_422_on_matching(
        self, client, corpus, field, wire, name
    ):
        c, _db, _drive_dir, _data_dir = client
        query_field = "size" if field == "sizes" else "duration"

        listed = _listing(c, [(query_field, wire)])
        matched = _match(c, **{field: [wire]})

        assert listed.status_code == 400, listed.text
        assert matched.status_code == 422, matched.text

    ACCEPTED = [
        ("sizes", ["gte:0"], "size-zero"),
        ("sizes", [f"lte:{MAX_SIZE}"], "size-2-53-minus-1"),
        ("sizes", ["gt:1"], "size-one"),
        ("durations", ["gte:0"], "duration-zero"),
        ("durations", ["lte:10000000"], "duration-ten-million"),
        ("durations", ["lt:0.001"], "duration-three-decimals"),
        ("durations", ["gt:90.4"], "duration-fraction"),
        ("sizes", ["gte:1024", "gte:1024"], "duplicate-size"),
        ("durations", ["lt:90", "lt:90"], "duplicate-duration"),
        (
            "sizes",
            ["gte:1024", "gte:2048", "gte:4096", "gte:8192"],
            "four-distinct-sizes",
        ),
        (
            "durations",
            ["gte:1", "gte:2", "gte:3", "gte:4"],
            "four-distinct-durations",
        ),
        (
            "sizes",
            ["gte:1024", "gte:2048", "gte:4096", "gte:8192", "gte:1024"],
            "five-raw-values-four-distinct-sizes",
        ),
    ]

    @pytest.mark.parametrize(
        ("field", "values", "name"),
        ACCEPTED,
        ids=[row[2] for row in ACCEPTED],
    )
    def test_an_item_in_the_wire_form_is_accepted(self, client, corpus, field, values, name):
        c, _db, _drive_dir, _data_dir = client
        query_field = "size" if field == "sizes" else "duration"

        listed = _listing(c, [(query_field, value) for value in values])
        matched = _match(c, **{field: values})

        assert listed.status_code == 200, listed.text
        assert matched.status_code == 200, matched.text
        assert sorted(_ids(listed)) == sorted(matched.json()["file_ids"])

    @pytest.mark.parametrize(
        ("field", "values", "name"),
        [
            ("sizes", [f"gte:{i}" for i in range(5)], "five-distinct-sizes"),
            ("sizes", [f"gte:{1024 + i}" for i in range(6)], "six-distinct-sizes"),
            ("durations", [f"gte:{i}" for i in range(5)], "five-distinct-durations"),
        ],
        ids=["five-distinct-sizes", "six-distinct-sizes", "five-distinct-durations"],
    )
    def test_the_fifth_distinct_item_is_400_on_the_listing_and_422_on_matching(
        self, client, corpus, field, values, name
    ):
        c, _db, _drive_dir, _data_dir = client
        query_field = "size" if field == "sizes" else "duration"

        listed = _listing(c, [(query_field, value) for value in values])
        matched = _match(c, **{field: values})

        assert listed.status_code == 400, listed.text
        assert matched.status_code == 422, matched.text

    def test_duplicates_count_once_before_the_cap(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client
        values = ["gte:1024", "gte:1024", "gte:2048", "gte:4096", "gte:8192"]

        listed = _listing(c, [("size", value) for value in values])
        matched = _match(c, sizes=values)

        assert listed.status_code == 200, listed.text
        assert matched.status_code == 200, matched.text
        assert sorted(matched.json()["file_ids"]) == _want(
            corpus, "b1024", "b1025", "big", "tagged"
        )


class TestUnchangedWithoutTheNewParameters:
    """SPEC-CORE-044 I11: neither parameter changes an existing answer."""

    def test_the_listing_with_no_size_or_duration_keeps_its_ids_order_and_total(
        self, client, corpus
    ):
        c, _db, _drive_dir, _data_dir = client
        newest_first = [
            corpus[name].id
            for name in ("tagged", "big", "b1025", "b1024", "b1023", "doc", "img", "zero")
        ]

        res = _listing(c)

        assert _ids(res) == newest_first
        assert res.json()["meta"]["total"] == len(newest_first)

    def test_matching_defaults_to_every_active_file(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        res = _match(c)

        assert res.status_code == 200, res.text
        assert sorted(res.json()["file_ids"]) == _want(corpus, *ACTIVE)
        assert list(res.json()) == ["file_ids"]

    def test_the_existing_operators_keep_their_answers(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        assert _ids(_listing(c, [("type", "image")])) == [corpus["img"].id]
        assert _ids(_listing(c, [("tag", "会議")])) == [corpus["tagged"].id]
        assert _ids(_listing(c, [("favorite", "true")])) == [corpus["tagged"].id]


class TestCombinesWithTheExistingListingParameters:
    """SPEC-CORE-044 listing 3: every parameter combines as AND."""

    def test_size_and_duration_and_the_existing_filters_are_and(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        listed = _listing(
            c,
            [
                ("size", "gte:1024"),
                ("duration", "lte:600"),
                ("tag", "会議"),
                ("type", "video"),
                ("favorite", "true"),
            ],
        )
        matched = _match(
            c,
            sizes=["gte:1024"],
            durations=["lte:600"],
            tags=["会議"],
            kinds=["video"],
            favorite=True,
        )

        assert _ids(listed) == _want(corpus, "tagged")
        assert matched.json()["file_ids"] == _want(corpus, "tagged")

    def test_size_and_duration_that_never_meet_keep_nothing(self, client, corpus):
        c, _db, _drive_dir, _data_dir = client

        listed = _listing(c, [("size", "lt:1024"), ("duration", "gte:90")])
        matched = _match(c, sizes=["lt:1024"], durations=["gte:90"])

        assert _ids(listed) == _want(corpus, "b1023")
        assert matched.json()["file_ids"] == _want(corpus, "b1023")
