"""Unit tests for ``app.services.markdown_relations.extract_links``."""
from __future__ import annotations

import pytest

from app.services.markdown_relations import ExtractedLinks, extract_links


class TestExtractLoftLinks:
    """The ``loft://`` portion of extract_links."""

    def test_inline_markdown_link_with_loft_scheme(self):
        result = extract_links("See [video](loft://abc123def456)")
        assert "abc123def456" in result.loft_ids

    def test_inline_markdown_link_with_loft_scheme_and_query(self):
        result = extract_links("See [video](loft://abc123def456?t=120)")
        assert result.loft_ids == {"abc123def456"}

    def test_bare_loft_url_extracted(self):
        result = extract_links("loft://abc123def456 was here")
        assert "abc123def456" in result.loft_ids

    def test_multiple_loft_links_collected(self):
        result = extract_links(
            "[A](loft://aaaaaaaaaaaa) and [B](loft://bbbbbbbbbbbb?page=2)"
        )
        assert result.loft_ids == {"aaaaaaaaaaaa", "bbbbbbbbbbbb"}

    def test_duplicate_loft_links_dedup(self):
        result = extract_links(
            "[A](loft://aaaaaaaaaaaa) [B](loft://aaaaaaaaaaaa?t=5)"
        )
        assert result.loft_ids == {"aaaaaaaaaaaa"}

    def test_no_loft_links_yields_empty_set(self):
        result = extract_links("# Title\n\nSome text without links\n")
        assert result.loft_ids == set()


class TestExtractWikiLinks:
    """The ``[[X]]`` portion of extract_links."""

    def test_plain_wiki_target(self):
        result = extract_links("Refer to [[year-recap]] for context.")
        assert result.wiki_targets == ["year-recap"]

    def test_wiki_link_with_pipe_alias(self):
        result = extract_links("See [[year-recap|2025 in review]] above.")
        assert result.wiki_targets == ["year-recap"]

    def test_wiki_link_with_heading_anchor(self):
        result = extract_links("Jump [[year-recap#highlights]]")
        assert result.wiki_targets == ["year-recap"]

    def test_wiki_link_with_pipe_and_heading(self):
        result = extract_links("[[year-recap#highlights|Highlights]]")
        assert result.wiki_targets == ["year-recap"]

    def test_path_style_wiki_target_preserved(self):
        # The resolver will interpret ``/``; the extractor must not strip it.
        result = extract_links("Go to [[notes/2026/year]]")
        assert result.wiki_targets == ["notes/2026/year"]

    def test_numeric_id_target_preserved(self):
        result = extract_links("[[20260512143028]]")
        assert result.wiki_targets == ["20260512143028"]

    def test_multiple_wiki_links_preserve_order(self):
        # ``wiki_targets`` is a list — order matters for diagnostic
        # surfacing (UI banners cite the first ambiguous link).
        result = extract_links(
            "Top [[first]], middle [[second|alias]], end [[third#h]]"
        )
        assert result.wiki_targets == ["first", "second", "third"]

    def test_duplicate_wiki_targets_preserved(self):
        # The resolver dedups; the extractor does not. Two occurrences
        # of ``[[X]]`` mean the writer typed it twice — keep both for
        # diagnostic counting if needed.
        result = extract_links("[[same]] and again [[same]]")
        assert result.wiki_targets == ["same", "same"]

    def test_no_wiki_links_yields_empty_list(self):
        result = extract_links("Just prose, no double-brackets.")
        assert result.wiki_targets == []


class TestExtractEdgeCases:
    """Pathological / adversarial input the extractor should handle quietly."""

    def test_empty_wiki_link_not_captured(self):
        result = extract_links("[[ ]] and [[]]")
        # ``[[]]`` cannot match (empty group), and ``[[ ]]`` would
        # capture a whitespace target — also dropped.
        assert all(t.strip() for t in result.wiki_targets)

    def test_escaped_wiki_link_not_extracted(self):
        result = extract_links(r"\[\[escaped\]\]")
        assert result.wiki_targets == []

    def test_nested_wiki_link_outer_is_dropped(self):
        # ``[[outer[[inner]]]]`` — the non-greedy regex matches
        # ``[[inner]]`` first (innermost wins), and the outer brackets
        # are left as literal text.
        result = extract_links("[[outer[[inner]]]]")
        assert "inner" in result.wiki_targets
        assert "outer" not in result.wiki_targets

    def test_single_bracket_not_extracted(self):
        # ``[X]`` is normal markdown link reference syntax, not wiki.
        result = extract_links("[not-wiki]")
        assert result.wiki_targets == []

    def test_unclosed_wiki_link_not_extracted(self):
        result = extract_links("[[unclosed")
        assert result.wiki_targets == []

    def test_loft_id_shorter_than_12_chars_not_extracted(self):
        result = extract_links("loft://short")
        assert result.loft_ids == set()

    def test_loft_id_longer_than_12_chars_only_captures_first_12(self):
        result = extract_links("loft://abc123def456extra")
        # Implementation note: the regex pattern is ``[A-Za-z0-9_-]{12}``,
        # so ``abc123def456`` is captured and ``extra`` is left over.
        assert "abc123def456" in result.loft_ids


class TestExtractedLinksDataclass:
    """The container type contract."""

    def test_extracted_links_is_frozen_dataclass(self):
        result = extract_links("[[a]]")
        with pytest.raises((AttributeError, Exception)):
            result.loft_ids = set()  # type: ignore[misc]

    def test_returns_extracted_links_instance(self):
        result = extract_links("")
        assert isinstance(result, ExtractedLinks)
        assert isinstance(result.loft_ids, set)
        assert isinstance(result.wiki_targets, list)

    def test_mixed_loft_and_wiki(self):
        content = (
            "Look at [[note-a]] and the video "
            "[clip](loft://aaaaaaaaaaaa?t=10)."
        )
        result = extract_links(content)
        assert result.loft_ids == {"aaaaaaaaaaaa"}
        assert result.wiki_targets == ["note-a"]
