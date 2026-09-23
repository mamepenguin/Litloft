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

    Recorded by running the previous implementation — which derived its answer
    from `mimetypes` — in the shipped image. It is the other side of a parity
    check, not a copy of the table under test.
    """
    return {e: tuple(v) for e, v in json.loads(GOLDEN.read_text()).items()}


@pytest.mark.parametrize("extension", sorted(_golden()))
def test_every_answer_is_the_one_the_container_gave(extension):
    assert classify("sample" + extension) == _golden()[extension]


def test_the_golden_covers_every_row_of_the_table():
    """A row nothing compares against is a row nothing holds."""
    assert set(_EXTENSION_TABLE) - set(_golden()) == set()


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
        before = {e: classify("sample" + e) for e in _golden()}
        with patch("mimetypes.guess_type", side_effect=guess):
            after = {e: classify("sample" + e) for e in _golden()}
        assert after == before

    def test_an_unnamed_extension_is_other_whatever_the_host_says(self):
        for guess in (lambda n: self._WRONG, lambda n: (None, None)):
            with patch("mimetypes.guess_type", side_effect=guess):
                assert classify("x.invented-ext") == DEFAULT_CLASSIFICATION


def test_the_extension_is_matched_without_regard_to_case():
    for extension, expected in _golden().items():
        assert classify("SAMPLE" + extension.upper()) == expected


def test_a_subtitle_is_decided_before_the_table():
    assert classify("movie.vtt") == ("subtitle", "text/vtt")
    assert classify("movie.srt") == ("subtitle", "application/x-subrip")
    assert ".srt" not in _EXTENSION_TABLE
    assert ".vtt" not in _EXTENSION_TABLE
