"""Unit tests for ``app.services.frontmatter``."""
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
    content = "---\ntags: [unterminated\n---\n\nbody\n"
    result = parse(content)
    assert result.metadata == {}
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
    content = "---foo\nbar\n"
    result = parse(content)
    assert result.metadata == {}
    assert result.body == content


def test_parse_deeply_nested_flow_does_not_raise() -> None:
    # Pathological flow-style nesting can surface as a non-YAMLError (e.g.
    # RecursionError).
    #
    # The recursion budget is pinned to the depth this test starts from, so
    # "safe_load overflows" does not depend on the interpreter's default limit
    # or PyYAML's frames per nesting level. `depth` only has to be comfortably
    # past the budget.
    #
    # The body is asserted whole: the except arm is the only one that returns
    # the original `content` as the body.
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

    assert result.metadata == {}
    assert result.body == content


def test_strip_returns_body_only() -> None:
    content = "---\ntags: [a]\n---\n\nhello\n"
    assert strip(content) == "hello\n"


def test_strip_preserves_content_without_frontmatter() -> None:
    assert strip("plain text\n") == "plain text\n"
