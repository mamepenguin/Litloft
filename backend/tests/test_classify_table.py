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
    if name.endswith(COMPRESSED_SUFFIXES + COMPRESSED_ALIASES + (".svgz",))
}


def _moved_since() -> set[str]:
    """Names the boundary change moved, each declared in
    `test_classify_boundary.py`. Everything else still answers as the parent
    did, which is what phase 1 bought."""
    from tests.test_classify_boundary import ADDED, MOVED_OUT_OF_DOCUMENT

    moved = set(MOVED_OUT_OF_DOCUMENT) | set(ADDED)
    return {"sample" + e for e in moved}


@pytest.mark.parametrize(
    "name", sorted(set(_golden()) - COMPRESSED_NOW_OTHER - _moved_since())
)
def test_every_other_answer_is_the_one_the_container_gave(name):
    assert classify(name) == _golden()[name]


@pytest.mark.parametrize("name", sorted(COMPRESSED_NOW_OTHER))
def test_a_compressed_name_is_other_whatever_it_wraps(name):
    assert classify(name) == DEFAULT_CLASSIFICATION


# What that rule costs, declared rather than derived. Each was something Litloft
# offered a player, a viewer or a duration for, and could open none of them.
MOVED_BY_THE_RULE = {
    "sample.mp4.gz": ("video", "video/mp4"),
    "sample.mp3.gz": ("audio", "audio/mpeg"),
    "sample.zip.gz": ("archive", "application/zip"),
    "sample.txt.gz": ("document", "text/plain"),
    "sample.svgz": ("image", "image/svg+xml"),
    "sample.tgz": ("other", "application/x-tar"),
}


@pytest.mark.parametrize("name", sorted(MOVED_BY_THE_RULE))
def test_what_the_rule_moved(name):
    assert _golden()[name] == MOVED_BY_THE_RULE[name]
    assert classify(name) == DEFAULT_CLASSIFICATION


def test_every_row_is_held_by_the_golden_or_by_a_declaration():
    """A row nothing compares against is a row nothing holds."""
    from tests.test_classify_boundary import ADDED, MOVED_OUT_OF_DOCUMENT

    named = {n[len("sample"):] for n in _golden() if n.startswith("sample")}
    declared = named | set(ADDED) | set(MOVED_OUT_OF_DOCUMENT)
    assert set(_EXTENSION_TABLE) - declared == set()


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
    for name, expected in _golden().items():
        if name in COMPRESSED_NOW_OTHER:
            expected = DEFAULT_CLASSIFICATION
        elif name in _moved_since():
            expected = classify(name)
        assert classify(name.upper()) == expected


def test_a_subtitle_is_decided_before_the_table():
    assert classify("movie.vtt") == ("subtitle", "text/vtt")
    assert classify("movie.srt") == ("subtitle", "application/x-subrip")
    assert ".srt" not in _EXTENSION_TABLE
    assert ".vtt" not in _EXTENSION_TABLE



def test_no_extension_is_written_twice():
    """A dict literal keeps the last of a repeated key and says nothing. Two
    of them went in while this table was being moved, one of them a family
    whose two meanings disagree."""
    import ast
    import collections
    from app.services import filetype

    tree = ast.parse(Path(filetype.__file__).read_text())
    for node in ast.walk(tree):
        target = getattr(node, "target", None)
        if getattr(target, "id", "") == "_EXTENSION_TABLE":
            keys = [k.value for k in node.value.keys]
            repeated = [k for k, n in collections.Counter(keys).items() if n > 1]
            assert repeated == []
            assert len(keys) == len(filetype._EXTENSION_TABLE)
            return
    raise AssertionError("_EXTENSION_TABLE is not a literal any more")
