"""Parse and compose Markdown files with YAML frontmatter.

The format we accept is the usual Jekyll / Hugo / Obsidian convention::

    ---
    tags:
      - cooking
      - weeknight
    ---

    # Title

    body…

Core uses this parser on ``PUT /api/files/{id}/content`` writes to project
``frontmatter.tags`` onto ``File.tags`` for ``.md`` files synchronously,
in the same transaction as the content write (spec
``docs/superpowers/specs/2026-04-24-knowledge-tag-unification.md``, Phase 11).
The knowledge addon has a parallel implementation at
``addons/knowledge/app/services/frontmatter.py`` used by its scanner for
externally-edited files (Obsidian writes that bypass the API). The two
copies must stay behaviour-compatible — they're independent because
knowledge runs as a separate container and cannot import from core.

The parser is deliberately small: PyYAML handles the frontmatter block,
everything after the closing ``---`` is body. Missing / malformed
frontmatter is not an error; ``metadata`` is ``{}`` and the caller
decides how to react. For ``PUT /content`` that means "skip tag
projection, succeed the write" — broken YAML should not block a save.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import yaml

# Mirror ``TagUpdate`` (app/schemas.py) so extraction here yields names
# that ``replace_file_tags`` will accept without a 422 round-trip. Keep
# the regex and caps in sync with that validator.
_TAG_RE = re.compile(r"^[\w\-]+$", re.UNICODE)
_MAX_TAGS = 10
_MAX_TAG_LEN = 30


@dataclass(frozen=True)
class ParsedMarkdown:
    metadata: dict[str, Any]
    body: str


_DELIM = "---"


def parse(content: str) -> ParsedMarkdown:
    """Split a ``.md`` string into frontmatter metadata and body.

    Returns ``ParsedMarkdown`` with ``metadata={}`` if the document has
    no frontmatter or the block is malformed (invalid YAML or an
    unclosed block). In the malformed case, the entire content is
    returned as ``body`` so downstream rendering still works.

    Callers must bound ``content`` size at their own boundary \u2014 this
    function performs no length check. The production call site
    (``PUT /api/files/{id}/content``) caps bodies at
    ``_TEXT_WRITE_MAX_BYTES`` (1 MB) before invoking ``parse``; an
    unbounded caller could trigger pathological ``split`` memory use
    or deep YAML recursion.
    """
    stripped = content.lstrip("\ufeff")
    if not stripped.startswith(_DELIM):
        return ParsedMarkdown(metadata={}, body=content)

    after_open = stripped[len(_DELIM):]
    if not after_open.startswith("\n"):
        return ParsedMarkdown(metadata={}, body=content)

    rest = after_open[1:]
    lines = rest.split("\n")
    close_idx = None
    for i, line in enumerate(lines):
        if line.strip() == _DELIM:
            close_idx = i
            break
    if close_idx is None:
        return ParsedMarkdown(metadata={}, body=content)

    raw_yaml = "\n".join(lines[:close_idx])
    body = "\n".join(lines[close_idx + 1 :])
    if body.startswith("\n"):
        body = body[1:]

    # Broad except: ``safe_load`` is known to raise ``YAMLError`` for
    # malformed input, but pathological nesting can surface as
    # ``RecursionError`` (not a YAMLError) and allocator pressure as
    # ``MemoryError``. The parse failure contract is "never crash the
    # caller" \u2014 the PUT handler relies on it to keep the write path
    # alive even when frontmatter is hostile.
    try:
        metadata = yaml.safe_load(raw_yaml) or {}
    except Exception:
        return ParsedMarkdown(metadata={}, body=content)

    if not isinstance(metadata, dict):
        return ParsedMarkdown(metadata={}, body=body)

    return ParsedMarkdown(metadata=metadata, body=body)


def strip(content: str) -> str:
    """Return the body of a Markdown document, discarding frontmatter."""
    return parse(content).body


def extract_valid_tags(metadata: dict[str, Any]) -> list[str]:
    """Pull a list of core-valid tag names from parsed frontmatter.

    Silently drops entries that would be rejected by ``TagUpdate``
    (non-string, empty, over-length, invalid chars) and caps at
    ``_MAX_TAGS``. Case-insensitive dedup keeps the first occurrence.

    Why silent-drop rather than raise: the caller is ``PUT /content``,
    and the write must succeed even if a user put an invalid tag in
    their frontmatter. Surfacing a 422 would block the save and
    surprise the editor. The scanner does the same (spec §D1).

    Returns an empty list when the ``tags`` key is absent or not a
    list — per the β canonical rule, absence of ``tags:`` in the
    frontmatter means ``File.tags`` should be cleared.

    Hostile ``.md`` with a pathologically large ``tags:`` list is
    capped to ``_MAX_TAGS * 10`` entries up front so the regex loop
    can't be weaponised into a stall. Legitimate usage never exceeds
    a handful.
    """
    raw = metadata.get("tags") or []
    if not isinstance(raw, list):
        return []
    raw = raw[: _MAX_TAGS * 10]
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, (str, int)):
            continue
        tag = str(item).strip()
        if not tag or len(tag) > _MAX_TAG_LEN:
            continue
        if not _TAG_RE.match(tag):
            continue
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(tag)
        if len(out) >= _MAX_TAGS:
            break
    return out
