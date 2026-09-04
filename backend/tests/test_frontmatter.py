"""Unit tests for ``app.services.frontmatter``.

The parser backs ``PUT /api/files/{id}/content``'s synchronous tag
projection (Phase 11) and must treat broken frontmatter as "skip the
projection, keep the write". These tests lock in the behaviours that
``put_file_content`` relies on:

- well-formed frontmatter yields a ``dict`` for ``metadata``
- missing / malformed frontmatter yields ``metadata={}`` (not an
  exception) so the write path can fall back to no-op projection
- body content is preserved byte-for-byte after the closing ``---``

Kept in sync with the parallel knowledge parser at
``addons/knowledge/app/services/frontmatter.py``; drift between the two
breaks the β canonical rule.
"""
from __future__ import annotations

import sys
from typing import Any

from app.services.frontmatter import parse, strip


def test_parse_returns_empty_metadata_when_no_frontmatter() -> None:
    result = parse("# Hello\n\nno frontmatter here\n")
    assert result.metadata == {}
    assert result.body == "# Hello\n\nno frontmatter here\n"


def test_parse_extracts_tags_list() -> None:
    content = (
        "---\n"
        "tags:\n"
        "  - cooking\n"
        "  - weeknight\n"
        "---\n"
        "\n"
        "# Dinner\n"
    )
    result = parse(content)
    assert result.metadata == {"tags": ["cooking", "weeknight"]}
    assert result.body == "# Dinner\n"


def test_parse_handles_inline_tag_list() -> None:
    # Obsidian frequently writes inline flow lists; both forms must work.
    content = "---\ntags: [a, b, c]\n---\n\nbody\n"
    result = parse(content)
    assert result.metadata == {"tags": ["a", "b", "c"]}


def test_parse_unclosed_frontmatter_returns_body_unchanged() -> None:
    # An opened but never-closed block is surprisingly common when a
    # user pastes a ``---`` separator elsewhere. We preserve the
    # original bytes so the write still succeeds.
    content = "---\ntags:\n  - x\n\n# Title\n"
    result = parse(content)
    assert result.metadata == {}
    assert result.body == content


def test_parse_invalid_yaml_falls_back_to_no_metadata() -> None:
    # Hostile or corrupted YAML must not raise — the write path needs
    # to succeed even if the frontmatter is broken.
    content = "---\ntags: [unterminated\n---\n\nbody\n"
    result = parse(content)
    assert result.metadata == {}
    # Body includes the whole original content on malformed YAML so
    # nothing is lost.
    assert result.body == content


def test_parse_scalar_yaml_discards_metadata() -> None:
    # YAML that parses to a non-dict (string, list, number) is not
    # valid frontmatter for our purposes.
    content = "---\njust a string\n---\n\nbody\n"
    result = parse(content)
    assert result.metadata == {}
    assert result.body == "body\n"


def test_parse_strips_bom_prefix() -> None:
    # Windows editors sometimes prepend a UTF-8 BOM. It must not defeat
    # frontmatter detection.
    content = "﻿---\ntags: [a]\n---\n\nbody\n"
    result = parse(content)
    assert result.metadata == {"tags": ["a"]}


def test_parse_requires_newline_after_opening_delim() -> None:
    # ``---foo`` is not a frontmatter opener, it's part of the body.
    content = "---foo\nbar\n"
    result = parse(content)
    assert result.metadata == {}
    assert result.body == content


def test_parse_deeply_nested_flow_does_not_raise() -> None:
    # Defence-in-depth: pathological flow-style nesting can surface as
    # a non-YAMLError (e.g. RecursionError). The PUT /content handler
    # relies on parse() never raising — the broad except at the
    # safe_load call keeps that contract.
    #
    # Two things make that contract testable rather than merely stated.
    #
    # The recursion budget is pinned to the depth this test starts from,
    # so "safe_load overflows" is guaranteed by this test rather than
    # inferred from the interpreter's default limit and PyYAML's frames
    # per nesting level. Either can change — CPython altered its frame
    # accounting in 3.12 — and the test would then pass without ever
    # reaching the except. `depth` only has to be comfortably past the
    # budget; its exact value carries no meaning.
    #
    # And the body is asserted whole: the except arm is the only one that
    # returns the original `content` as the body, so this distinguishes
    # it. Asserting `metadata` is a dict cannot fail — every arm of
    # parse() returns one.
    depth = 500
    frontmatter = "[" * depth + "1" + "]" * depth
    content = f"---\nvalue: {frontmatter}\n---\n\nbody\n"

    here = 0
    frame: Any = sys._getframe()
    while frame is not None:
        here += 1
        frame = frame.f_back

    previous = sys.getrecursionlimit()
    sys.setrecursionlimit(here + 100)
    try:
        result = parse(content)
    finally:
        sys.setrecursionlimit(previous)

    # Rejected and fallen back to empty — the payload cannot fit in the
    # budget above. The critical assertion is that we didn't crash.
    assert result.metadata == {}
    assert result.body == content


def test_strip_returns_body_only() -> None:
    content = "---\ntags: [a]\n---\n\nhello\n"
    assert strip(content) == "hello\n"


def test_strip_preserves_content_without_frontmatter() -> None:
    assert strip("plain text\n") == "plain text\n"
