"""Tests for app.services.provider_registry.

The registry surface (registration / detection / fallback) is a contract any
addon can build against; these tests exercise only that contract.
"""

from __future__ import annotations

import re

import pytest

from app.services import provider_registry
from app.services.provider_registry import (
    GENERIC_PROVIDER,
    detect_provider,
    get_metadata_extractor,
    register_provider,
    registered_providers,
)


@pytest.fixture(autouse=True)
def _reset_registry():
    provider_registry._reset_for_tests()
    yield
    provider_registry._reset_for_tests()


def test_unknown_url_returns_generic():
    assert detect_provider("https://example.com/video/123") == GENERIC_PROVIDER


def test_register_and_detect_with_compiled_pattern():
    register_provider("youtube", re.compile(r"(?:youtube\.com|youtu\.be)"))
    assert detect_provider("https://www.youtube.com/watch?v=abc") == "youtube"
    assert detect_provider("https://youtu.be/abc") == "youtube"


def test_register_with_string_pattern_compiles():
    register_provider("vimeo", r"vimeo\.com")
    assert detect_provider("https://vimeo.com/12345") == "vimeo"


def test_first_registered_match_wins_when_patterns_overlap():
    register_provider("first", re.compile(r"example"))
    register_provider("second", re.compile(r"example\.com"))
    # detect_provider iterates in registration order; the first match is returned.
    assert detect_provider("https://example.com/x") == "first"


def test_re_register_same_name_overwrites():
    register_provider("youtube", re.compile(r"youtu\.be"))
    register_provider("youtube", re.compile(r"youtube\.com"))
    assert registered_providers().count("youtube") == 1
    assert detect_provider("https://www.youtube.com/watch?v=x") == "youtube"
    # The original ``youtu.be`` pattern was replaced.
    assert detect_provider("https://youtu.be/x") == GENERIC_PROVIDER


def test_register_provider_rejects_generic_name():
    with pytest.raises(ValueError):
        register_provider(GENERIC_PROVIDER, re.compile(r"x"))


def test_register_provider_rejects_empty_name():
    with pytest.raises(ValueError):
        register_provider("", re.compile(r"x"))


def test_metadata_extractor_optional_and_round_trips():
    def fake_extractor(url: str) -> dict:
        return {"title": "x"}

    register_provider("custom", re.compile(r"custom\.test"), fake_extractor)
    assert get_metadata_extractor("custom") is fake_extractor
    assert get_metadata_extractor("youtube") is None  # not registered


def test_register_core_providers_is_no_longer_exported():
    """Official provider registration belongs to the Media Import addon."""
    assert not hasattr(provider_registry, "register_core_providers")
