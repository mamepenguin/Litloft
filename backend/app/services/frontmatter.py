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
from datetime import datetime, timezone
from typing import Any

import yaml

# Mirror ``TagUpdate`` (app/schemas.py) so extraction here yields names
# that ``replace_file_tags`` will accept without a 422 round-trip. Keep
# the regex and caps in sync with that validator.
_TAG_RE = re.compile(r"^[\w\-]+$", re.UNICODE)
_MAX_TAGS = 10
_MAX_TAG_LEN = 30

# Phase B (spec 2026-05-12-markdown-link-three-forms §3.6): aliases are
# user-facing labels with weaker character constraints than tags (e.g.
# CJK and spaces are common). The caps are advisory — alias storage is
# a Text column, not a per-drive Tag namespace.
_MAX_ALIASES = 20
_MAX_ALIAS_LEN = 100


@dataclass(frozen=True)
class ParsedMarkdown:
    metadata: dict[str, Any]
    body: str


_DELIM = "---"

_ID_RE = re.compile(r"^\d{12,17}$")


def _coerce_valid_id(value: Any) -> str | None:
    if isinstance(value, str):
        candidate = value
    elif isinstance(value, int) and not isinstance(value, bool):
        candidate = str(value)
    else:
        return None
    return candidate if _ID_RE.match(candidate) else None


def ensure_id(
    metadata: dict[str, Any],
    existing_id: str | None = None,
    now: datetime | None = None,
) -> tuple[dict[str, Any], str]:
    """Return ``(new_metadata, id_value)`` with a valid ``id:`` key.

    Pure / immutable: ``metadata`` is never mutated; a new dict is
    returned with ``id`` as the first key. Validation regex is
    ``^\\d{12,17}$``. Order of precedence:

    1. ``metadata['id']`` if already valid.
    2. ``existing_id`` (e.g. ``File.md_id`` from the DB) if valid.
    3. A fresh ``YYYYMMDDhhmmss`` timestamp from ``now`` (UTC).

    Collision disambiguation (3-digit ms suffix → 17 chars) is the
    caller's job — this function is pure.
    """
    preserved = _coerce_valid_id(metadata.get("id"))
    if preserved is not None:
        new_id = preserved
    elif (reused := _coerce_valid_id(existing_id)) is not None:
        new_id = reused
    else:
        moment = now if now is not None else datetime.now(timezone.utc)
        new_id = moment.strftime("%Y%m%d%H%M%S")

    rest = {k: v for k, v in metadata.items() if k != "id"}
    new_metadata = {"id": new_id, **rest}
    return new_metadata, new_id


def compose(metadata: dict[str, Any], body: str) -> str:
    """Join frontmatter and body. Mirrors the knowledge-addon helper.

    Uses ``yaml.safe_dump`` with ``sort_keys=False`` so the caller
    controls ordering (humans scan frontmatter top-down; the ``id``
    key should appear first when present).
    """
    if not metadata:
        return body
    dumped = yaml.safe_dump(
        metadata,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    ).rstrip()
    return f"{_DELIM}\n{dumped}\n{_DELIM}\n\n{body}"


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


def extract_valid_aliases(metadata: dict[str, Any]) -> list[str]:
    """Sanitize frontmatter ``aliases:`` for projection to ``File.md_aliases``.

    Spec 2026-05-12-markdown-link-three-forms §3.6.

    Differences from :func:`extract_valid_tags`:

    * **Case-sensitive dedup** — aliases are user-facing display
      strings, not the per-drive Tag namespace, so preserving case
      matters for renderer output.
    * **No character regex** — aliases may contain spaces, punctuation,
      CJK, etc. We only enforce non-empty and length cap.
    * **Bool coercion is dropped** — YAML ``true``/``false`` would
      otherwise become the strings ``"True"``/``"False"`` (Python
      ``bool`` is a subclass of ``int``); aliases come from human
      typing, so silently drop non-strings.

    Returns an empty list when the key is missing, not a list, or every
    entry is invalid. The caller decides whether to store ``None`` or
    a JSON-encoded empty list — current production policy is ``None``.
    """
    raw = metadata.get("aliases")
    if not isinstance(raw, list):
        return []
    raw = raw[: _MAX_ALIASES * 10]
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        # Strip C0/C1 control chars + bidi overrides + zero-width chars.
        # Prevents homograph / RTL-spoofing aliases from ambushing the
        # resolver into matching a target that visually equals a benign one.
        cleaned = "".join(
            ch for ch in item
            if not (
                ord(ch) < 0x20
                or 0x7F <= ord(ch) <= 0x9F
                or ch in ("​", "‌", "‍", "⁠", "﻿")
                or ch in ("‪", "‫", "‬", "‭", "‮")
                or ch in ("⁦", "⁧", "⁨", "⁩")
            )
        )
        alias = cleaned.strip()
        if not alias or len(alias) > _MAX_ALIAS_LEN:
            continue
        if alias in seen:
            continue
        seen.add(alias)
        out.append(alias)
        if len(out) >= _MAX_ALIASES:
            break
    return out
