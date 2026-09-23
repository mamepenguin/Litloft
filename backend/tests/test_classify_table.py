"""The classifier answers from one table, and from nothing else."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from app.services.filetype import (
    DEFAULT_CLASSIFICATION,
    _EXTENSION_TABLE,
    classify,
)

GOLDEN = Path(__file__).parent / "fixtures" / "classify_golden.json"


def _golden() -> dict[str, tuple[str, str]]:
    """What the classifier answered before it was rewritten.

    Regenerate it with ``backend/scripts/record_classify_golden.py`` against
    the revision being compared with; it is the other side of a parity check,
    not a copy of the table under test.
    """
    return {e: tuple(v) for e, v in json.loads(GOLDEN.read_text()).items()}


# The parent asked `mimetypes.guess_type` for the whole filename, which peels
# one compression suffix and resolves the type inside. Litloft cannot open what
# is inside: a gzipped MP4 has no player, no duration and no thumbnail, and the
# parent handed it to all three. `.svgz` is the exception, measured — ffmpeg
# produces the same thumbnail from it as from the plain SVG.
COMPRESSED_SUFFIXES = (".gz", ".bz2", ".xz", ".Z", ".br")
# `mimetypes.suffix_map`: one extension standing for two, e.g. `.tgz` for
# `.tar.gz`. The parent expanded them, so they belong to the same dimension.
COMPRESSED_ALIASES = (".tgz", ".taz", ".tz", ".tbz2", ".txz")

COMPRESSED_NOW_OTHER = {
    name for name in _golden()
    if name.endswith(COMPRESSED_SUFFIXES + COMPRESSED_ALIASES)
    and not name.endswith(".svgz")
}


@pytest.mark.parametrize(
    "name", sorted(set(_golden()) - COMPRESSED_NOW_OTHER)
)
def test_every_other_answer_is_the_one_the_container_gave(name):
    assert classify(name) == _golden()[name]


@pytest.mark.parametrize("name", sorted(COMPRESSED_NOW_OTHER))
def test_a_compressed_name_is_other_whatever_it_wraps(name):
    """Declared, not inherited: these are the answers this change moves."""
    assert _golden()[name] != DEFAULT_CLASSIFICATION, (
        f"{name} was already other at the parent; it does not belong here"
    )
    assert classify(name) == DEFAULT_CLASSIFICATION


def test_the_one_compressed_form_the_image_path_can_read_is_kept():
    assert classify("page.svgz") == ("image", "image/svg+xml")
    assert classify("page.svgz") == _golden()["sample.svgz"]


def test_the_golden_covers_every_row_of_the_table():
    """A row nothing compares against is a row nothing holds."""
    named = {n[len("sample"):] for n in _golden() if n.startswith("sample")}
    assert set(_EXTENSION_TABLE) - named == set()


class TestTheHostCannotChangeTheAnswer:
    """The reason this table exists. Measured in one image with and without a
    mime table mounted, the old classifier moved 193 extensions between
    buckets."""

    _WRONG = ("video/mp2t", None)

    @pytest.mark.parametrize(
        "guess",
        [
            lambda name: (None, None),
            lambda name: ("video/mp2t", None),
            lambda name: ("application/x-invented", None),
        ],
    )
    def test_no_answer_moves(self, guess):
        before = {n: classify(n) for n in _golden()}
        with patch("mimetypes.guess_type", side_effect=guess):
            after = {n: classify(n) for n in _golden()}
        assert after == before

    def test_an_unnamed_extension_is_other_whatever_the_host_says(self):
        for guess in (lambda n: self._WRONG, lambda n: (None, None)):
            with patch("mimetypes.guess_type", side_effect=guess):
                assert classify("x.invented-ext") == DEFAULT_CLASSIFICATION


def test_the_extension_is_matched_without_regard_to_case():
    for extension in _EXTENSION_TABLE:
        assert classify("SAMPLE" + extension.upper()) == _EXTENSION_TABLE[extension]


def test_a_subtitle_is_decided_before_the_table():
    assert classify("movie.vtt") == ("subtitle", "text/vtt")
    assert classify("movie.srt") == ("subtitle", "application/x-subrip")
    assert ".srt" not in _EXTENSION_TABLE
    assert ".vtt" not in _EXTENSION_TABLE
