"""SPEC-ADDON-002: the NFC-literal sibling matcher Media Import lists directories with."""
from __future__ import annotations

import os
import unicodedata
from pathlib import Path

import pytest


@pytest.fixture()
def match_siblings():
    from app.services.sidecar_match import match_siblings

    return match_siblings


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def nfd(s: str) -> str:
    return unicodedata.normalize("NFD", s)


CAFE = "Café ガイド"


def _touch(directory: Path, name: str) -> None:
    (directory / name).write_bytes(name.encode("utf-8"))


def _names(paths) -> list[str]:
    return [Path(p).name for p in paths]


# (on-disk names, stem, rest_pattern, expected on-disk names in order)
CASES = [
    pytest.param(
        [nfd(CAFE) + ".vtt"], nfc(CAFE), "*.vtt", [nfd(CAFE) + ".vtt"],
        id="nfd-on-disk-nfc-stem",
    ),
    pytest.param(
        [nfc(CAFE) + ".vtt"], nfd(CAFE), "*.vtt", [nfc(CAFE) + ".vtt"],
        id="nfc-on-disk-nfd-stem",
    ),
    pytest.param(
        ["Title[x].vtt", "Titlex.vtt"], "Title[x]", "*.vtt", ["Title[x].vtt"],
        id="brackets-are-literal",
    ),
    pytest.param(
        ["Who*.vtt", "Whoever.vtt"], "Who*", "*.vtt", ["Who*.vtt"],
        id="star-is-literal",
    ),
    pytest.param(
        ["Why?.vtt", "Whyx.vtt"], "Why?", "*.vtt", ["Why?.vtt"],
        id="question-mark-is-literal",
    ),
    pytest.param(
        ["Clip.VTT", "Clip.vtt"], "Clip", "*.vtt", ["Clip.vtt"],
        id="rest-is-case-sensitive",
    ),
    pytest.param(
        ["Clip.vtt", "Clip.en.vtt", "Clip (1).vtt", "Other.vtt"], "Clip", "*.vtt",
        ["Clip (1).vtt", "Clip.en.vtt", "Clip.vtt"],
        id="sorted-by-on-disk-name",
    ),
    pytest.param(
        ["Clip.vtt", "Clip.en.vtt"], "Clip", ".*.vtt", ["Clip.en.vtt"],
        id="lang-pattern-excludes-bare-vtt",
    ),
    pytest.param(
        ["V.stt_temp.m4a", "V.stt_temp.webm.part", "V.vtt"], "V", ".stt_temp.*",
        ["V.stt_temp.m4a", "V.stt_temp.webm.part"],
        id="stt-temp-includes-part",
    ),
    pytest.param(
        [nfd(CAFE) + ".stt_temp.webm.part", nfc(CAFE) + ".stt_temp.m4a"],
        nfc(CAFE), ".stt_temp.*.part", [nfd(CAFE) + ".stt_temp.webm.part"],
        id="part-pattern-mixed-forms",
    ),
    pytest.param(
        ["f.vtt", nfd("é") + "z.vtt"], "", "*.vtt", [nfd("é") + "z.vtt", "f.vtt"],
        id="sorted-by-on-disk-bytes-not-nfc",
    ),
    pytest.param([], "Clip", "*.vtt", [], id="empty-directory"),
    pytest.param(["a.vtt", "b.vtt"], "", "*.vtt", ["a.vtt", "b.vtt"], id="empty-stem"),
]


@pytest.mark.parametrize("on_disk, stem, rest, expected", CASES)
def test_spec_addon_002_matches_nfc_literal_stem(match_siblings, tmp_path, on_disk, stem, rest, expected):
    for name in on_disk:
        _touch(tmp_path, name)

    result = match_siblings(tmp_path, stem, rest)

    assert _names(result) == expected
    for p in result:
        assert Path(p).read_bytes() == Path(p).name.encode("utf-8")


def test_spec_addon_002_directory_named_like_a_match_is_excluded(match_siblings, tmp_path):
    (tmp_path / "Clip.vtt").mkdir()
    _touch(tmp_path, "Clip.en.vtt")

    assert _names(match_siblings(tmp_path, "Clip", "*.vtt")) == ["Clip.en.vtt"]


def test_spec_addon_002_symlinks_are_followed(match_siblings, tmp_path):
    target = tmp_path / "elsewhere"
    target.mkdir()
    _touch(target, "real.vtt")
    os.symlink(target / "real.vtt", tmp_path / "Clip.vtt")
    os.symlink(tmp_path / "nowhere.vtt", tmp_path / "Clip.en.vtt")

    assert _names(match_siblings(tmp_path, "Clip", "*.vtt")) == ["Clip.vtt"]


def test_spec_addon_002_unlistable_directory_raises_oserror_and_logs_nothing(
    match_siblings, tmp_path, caplog
):
    with caplog.at_level("DEBUG"):
        with pytest.raises(OSError):
            match_siblings(tmp_path / "absent", "Clip", "*.vtt")
    assert caplog.records == []
