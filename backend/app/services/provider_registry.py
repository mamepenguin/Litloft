"""Provider registry for .loft URL providers.

Maps URLs to provider names (youtube, vimeo, etc.) so .loft files
record a stable dispatch key for the corresponding frontend player.

Phase 0 ships with youtube + vimeo registered by Core. The registry is
exposed so future addons (Import, third-party) can register additional
providers without touching Core code:

    register_provider("soundcloud", re.compile(r"soundcloud\\.com"))

Unknown URLs resolve to the literal string ``"generic"``, which the
frontend renders as a non-embedded link card. That fallback is part of
the contract and must remain stable across releases.
"""

from __future__ import annotations

import logging
import re
from typing import Callable, Pattern

logger = logging.getLogger(__name__)

# Optional metadata extractor: takes a URL, returns a dict of fields the
# .loft pipeline understands (title/description/channel/...). Phase 0
# uses a single yt-dlp-based extractor for all providers, so this slot
# stays None on every entry. Reserved for Phase 1+ provider-specific
# extractors (e.g. an Import addon may register a faster custom path).
MetadataExtractor = Callable[[str], dict]

GENERIC_PROVIDER = "generic"


class _ProviderEntry:
    __slots__ = ("name", "pattern", "metadata_extractor")

    def __init__(
        self,
        name: str,
        pattern: Pattern[str],
        metadata_extractor: MetadataExtractor | None,
    ) -> None:
        self.name = name
        self.pattern = pattern
        self.metadata_extractor = metadata_extractor


_providers: list[_ProviderEntry] = []


def register_provider(
    name: str,
    url_pattern: Pattern[str] | str,
    metadata_extractor: MetadataExtractor | None = None,
) -> None:
    """Register a provider for URL → name dispatch.

    Re-registration overwrites the previous entry (last writer wins) so
    addon hot-reload during development behaves predictably.
    """
    if not name or name == GENERIC_PROVIDER:
        raise ValueError(
            f"Provider name must be non-empty and not {GENERIC_PROVIDER!r}"
        )
    compiled = re.compile(url_pattern) if isinstance(url_pattern, str) else url_pattern
    entry = _ProviderEntry(name, compiled, metadata_extractor)

    for i, existing in enumerate(_providers):
        if existing.name == name:
            _providers[i] = entry
            logger.info("Provider re-registered: %s", name)
            return
    _providers.append(entry)
    logger.info("Provider registered: %s", name)


def detect_provider(url: str) -> str:
    """Resolve a URL to a registered provider name, or ``GENERIC_PROVIDER``."""
    for entry in _providers:
        if entry.pattern.search(url):
            return entry.name
    return GENERIC_PROVIDER


def get_metadata_extractor(name: str) -> MetadataExtractor | None:
    """Return the extractor a provider was registered with, if any."""
    for entry in _providers:
        if entry.name == name:
            return entry.metadata_extractor
    return None


def registered_providers() -> list[str]:
    """Return registered provider names in registration order. For tests/diagnostics."""
    return [entry.name for entry in _providers]


def _reset_for_tests() -> None:
    """Clear all registrations. Test-only helper."""
    _providers.clear()


def register_core_providers() -> None:
    """Register the providers Core ships with.

    Called from app startup. Idempotent: re-registering ``youtube``/``vimeo``
    overwrites the prior entries with the same compiled patterns, which is
    safe for tests that import this module multiple times.
    """
    register_provider("youtube", re.compile(r"(?:youtube\.com|youtu\.be)"))
    register_provider("vimeo", re.compile(r"vimeo\.com"))
    # Preserved from the prior Downloader-owned _PROVIDER_PATTERNS table:
    # existing .loft files written before Phase 0 may already carry
    # provider="soundcloud", and we don't ship a SoundCloud player yet,
    # so this entry only ensures URL→name dispatch stays stable. The
    # frontend has no soundcloud player registered, so dispatch falls
    # through to the GenericLinkCard fallback (same as before).
    register_provider("soundcloud", re.compile(r"soundcloud\.com"))
