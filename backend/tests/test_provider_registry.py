"""Tests for app.services.provider_registry.

Phase 0 contract:
- ``register_provider`` accepts compiled or string patterns
- ``detect_provider`` returns the registered name on first match
- Unregistered URLs resolve to ``GENERIC_PROVIDER`` (literal "generic")
- ``register_core_providers`` registers youtube + vimeo
- Re-registering an existing name overwrites (last writer wins)
"""

from __future__ import annotations

import re

import pytest

from app.services import provider_registry
from app.services.provider_registry import (
    GENERIC_PROVIDER,
    detect_provider,
    get_metadata_extractor,
    register_core_providers,
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


def test_register_core_providers_registers_youtube_and_vimeo():
    register_core_providers()
    assert detect_provider("https://www.youtube.com/watch?v=abc") == "youtube"
    assert detect_provider("https://youtu.be/abc") == "youtube"
    assert detect_provider("https://vimeo.com/12345") == "vimeo"
    # SoundCloud is preserved from the legacy patterns for .loft
    # backward-compat; the frontend has no soundcloud player so it still
    # falls back to GenericLinkCard.
    assert detect_provider("https://soundcloud.com/x") == "soundcloud"
    # Unrelated hosts still resolve to generic.
    assert detect_provider("https://example.com/x") == GENERIC_PROVIDER


def test_register_core_providers_is_idempotent():
    register_core_providers()
    register_core_providers()
    names = registered_providers()
    assert names.count("youtube") == 1
    assert names.count("vimeo") == 1


def test_metadata_extractor_optional_and_round_trips():
    def fake_extractor(url: str) -> dict:
        return {"title": "x"}

    register_provider("custom", re.compile(r"custom\.test"), fake_extractor)
    assert get_metadata_extractor("custom") is fake_extractor
    assert get_metadata_extractor("youtube") is None  # not registered
