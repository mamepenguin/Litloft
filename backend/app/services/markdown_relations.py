"""Markdown link extraction and resolution.

Spec: ``docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md``
§3.3–3.5 (Phase B).

This service is the single source of truth for parsing the 3 link forms
inside ``.md`` bodies:

* ``loft://<file_id>`` — direct id reference (extracted only).
* ``[[<text>]]`` — wiki-link target (extracted *and* resolved against
  drive-local ``.md`` files).

The resolver runs entirely inside the same drive (security boundary,
``.claude/rules/design-decisions.md``). It is **pure read** against the
ORM session — callers commit on their own boundary.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Iterable, Literal

from sqlalchemy.orm import Session

from app.models import File, active_file_filter

# ---------------------------------------------------------------------------
# Regex
# ---------------------------------------------------------------------------
#
# Wiki link: the target portion stops at ``]``, ``[``, ``|`` or ``#`` so
# that ``[[X|disp]]`` and ``[[X#head]]`` capture only ``X``. ``[`` is
# excluded so ``[[outer[[inner]]]]`` resolves to the inner pair only,
# matching Obsidian's "innermost wins" semantics.
_WIKI_LINK_RE = re.compile(r"\[\[([^\]\[\|#]+?)(?:#[^\]\|]+)?(?:\|[^\]]+)?\]\]")

# loft://<id> where id is exactly 12 of the file-id alphabet. Query /
# fragment is consumed but not captured.
_LOFT_LINK_RE = re.compile(r"loft://([A-Za-z0-9_-]{12})(?:[?#][^\s\)\"']*)?")

_ID_RE = re.compile(r"^\d{12,17}$")

# CommonMark allows ``\[`` to escape a bracket. We swap escaped pairs
# out with placeholders before regex-matching so ``\[\[X\]\]`` is not
# captured as a wiki-link.
_ESCAPED_OPEN = "\x00LB\x00"
_ESCAPED_CLOSE = "\x00RB\x00"


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ExtractedLinks:
    """Output of :func:`extract_links`. Frozen for safe sharing."""

    loft_ids: set[str]
    wiki_targets: list[str]


@dataclass
class ResolveDiagnostic:
    """One non-resolving wiki target. ``kind`` carries the reason.

    * ``unresolved`` — 0 matches in any rule. ``candidates`` is empty.
    * ``ambiguous`` — 2+ matches within a single rule (rule 4 or rule 5).
      ``candidates`` holds the ``file_path`` of each colliding row so the
      UI can offer disambiguation.
    """

    target: str
    kind: Literal["unresolved", "ambiguous"]
    candidates: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Extractor
# ---------------------------------------------------------------------------


def extract_links(content: str) -> ExtractedLinks:
    """Walk ``content`` and return all loft/wiki link tokens.

    Escaped bracket pairs (``\\[\\[X\\]\\]``) are honoured per CommonMark
    escape semantics — they are *not* captured. Wiki targets keep their
    raw text (no stripping of path separators) so the resolver can
    distinguish path-style from basename-style targets.
    """
    safe = content.replace("\\[", _ESCAPED_OPEN).replace("\\]", _ESCAPED_CLOSE)
    loft_ids: set[str] = set(_LOFT_LINK_RE.findall(safe))
    raw_targets = _WIKI_LINK_RE.findall(safe)
    wiki_targets = [t.strip() for t in raw_targets if t.strip()]
    return ExtractedLinks(loft_ids=loft_ids, wiki_targets=wiki_targets)


# ---------------------------------------------------------------------------
# Resolver
# ---------------------------------------------------------------------------


def _normalize_drive_path(self_dir: str, raw: str) -> str | None:
    """Resolve ``raw`` (relative or absolute) against ``self_dir``.

    Returns the resulting drive-relative POSIX path, or ``None`` when the
    path escapes the drive root (``..`` segments going past the top).
    Trailing slashes are not allowed inside wiki targets in practice but
    are normalised away if present.
    """
    base = PurePosixPath(self_dir) if self_dir else PurePosixPath("")
    raw_stripped = raw.lstrip("/")
    candidate = base / raw_stripped if raw_stripped else base

    parts: list[str] = []
    for segment in candidate.parts:
        if segment in ("", "."):
            continue
        if segment == "..":
            if not parts:
                return None
            parts.pop()
            continue
        parts.append(segment)
    return "/".join(parts)


def _lookup_by_file_path(
    db: Session, drive: str, file_path: str
) -> File | None:
    """Find the active ``.md`` row at ``drive/<file_path>``.

    Tries ``file_path`` as-is then with a ``.md`` suffix appended (so
    ``[[notes/year]]`` matches ``notes/year.md`` on disk).
    """
    if not file_path:
        return None
    candidates = [file_path]
    if not file_path.endswith(".md"):
        candidates.append(file_path + ".md")
    for candidate in candidates:
        row = (
            db.query(File)
            .filter(
                active_file_filter(),
                File.drive == drive,
                File.file_path == candidate,
                _md_predicate(),
            )
            .first()
        )
        if row is not None:
            return row
    return None


def _md_predicate():
    """Filter: ``.md`` files only (mime ``text/markdown`` OR ``.md`` name).

    Mirrors :func:`app.routers.files._is_markdown_file` to keep both
    sides aligned with ``.claude/rules/design-decisions.md`` — older
    rows may still carry ``text/plain`` for ``.md``.
    """
    from sqlalchemy import or_, func as sa_func

    return or_(
        File.mime_type == "text/markdown",
        sa_func.lower(File.filename).like("%.md"),
    )


def _resolve_numeric_id(
    db: Session, drive: str, target: str
) -> File | None:
    """Rule 1: ``^\\d{12,17}$`` exact match against ``File.md_id``."""
    return (
        db.query(File)
        .filter(
            active_file_filter(),
            File.drive == drive,
            File.md_id == target,
            _md_predicate(),
        )
        .first()
    )


def _resolve_relative(
    db: Session, drive: str, self_dir: str, target: str
) -> File | None:
    """Rule 2: ``./`` or ``../`` prefixed relative path."""
    normalized = _normalize_drive_path(self_dir, target)
    if normalized is None:
        return None
    return _lookup_by_file_path(db, drive, normalized)


def _resolve_path(
    db: Session, drive: str, self_dir: str, target: str
) -> File | None:
    """Rule 3: target contains ``/`` — try relative first, then absolute.

    Per spec §3.3 the relative form wins when both shapes resolve to a
    live file.
    """
    relative = _normalize_drive_path(self_dir, target)
    if relative is not None:
        hit = _lookup_by_file_path(db, drive, relative)
        if hit is not None:
            return hit
    absolute = _normalize_drive_path("", target)
    if absolute is None:
        return None
    return _lookup_by_file_path(db, drive, absolute)


def _basename_candidates(db: Session, drive: str, target: str) -> list[File]:
    """Rule 4: basename match (``Path(filename).stem``).

    Done in Python because the stem comparison is case-sensitive and
    SQLite cannot index the substring efficiently. The drive scope
    keeps the working set bounded.
    """
    expected = f"{target}.md"
    rows = (
        db.query(File)
        .filter(
            active_file_filter(),
            File.drive == drive,
            File.filename == expected,
            _md_predicate(),
        )
        .all()
    )
    return rows


def _alias_candidates(db: Session, drive: str, target: str) -> list[File]:
    """Rule 5: ``target`` appears in ``File.md_aliases`` (JSON list)."""
    rows = (
        db.query(File)
        .filter(
            active_file_filter(),
            File.drive == drive,
            File.md_aliases.isnot(None),
            _md_predicate(),
        )
        .all()
    )
    hits: list[File] = []
    for row in rows:
        try:
            aliases = json.loads(row.md_aliases) if row.md_aliases else []
        except (ValueError, TypeError):
            continue
        if isinstance(aliases, list) and target in aliases:
            hits.append(row)
    return hits


def _classify_hits(
    target: str, hits: list[File]
) -> tuple[str | None, ResolveDiagnostic | None]:
    """Convert a per-rule hit list into either an id or an ambiguous diag.

    * 0 hits → ``(None, None)`` (caller falls through to the next rule).
    * 1 hit  → ``(file_id, None)``.
    * 2+ hits → ``(None, ResolveDiagnostic(kind='ambiguous', ...))``.
    """
    if not hits:
        return None, None
    if len(hits) == 1:
        return hits[0].id, None
    candidates = sorted({h.file_path for h in hits})
    return None, ResolveDiagnostic(
        target=target, kind="ambiguous", candidates=candidates
    )


def _resolve_single_target(
    db: Session,
    drive: str,
    self_dir: str,
    target: str,
) -> tuple[str | None, ResolveDiagnostic | None]:
    """Apply the rule precedence to one target.

    The precedence stops at the first rule that matches at least one
    file (or signals ambiguity). 0-hit rules fall through.
    """
    # Rule 1: numeric id
    if _ID_RE.match(target):
        hit = _resolve_numeric_id(db, drive, target)
        if hit is not None:
            return hit.id, None
        return None, ResolveDiagnostic(target=target, kind="unresolved")

    # Rule 2: explicit relative
    if target.startswith("./") or target.startswith("../"):
        hit = _resolve_relative(db, drive, self_dir, target)
        if hit is not None:
            return hit.id, None
        return None, ResolveDiagnostic(target=target, kind="unresolved")

    # Rule 3: path with ``/`` (but not rule 2)
    if "/" in target:
        hit = _resolve_path(db, drive, self_dir, target)
        if hit is not None:
            return hit.id, None
        return None, ResolveDiagnostic(target=target, kind="unresolved")

    # Rule 4: basename match
    basename_hits = _basename_candidates(db, drive, target)
    resolved_id, diag = _classify_hits(target, basename_hits)
    if resolved_id is not None or diag is not None:
        return resolved_id, diag

    # Rule 5: alias match
    alias_hits = _alias_candidates(db, drive, target)
    resolved_id, diag = _classify_hits(target, alias_hits)
    if resolved_id is not None or diag is not None:
        return resolved_id, diag

    # Rule 6: unresolved
    return None, ResolveDiagnostic(target=target, kind="unresolved")


def resolve_wiki_targets(
    db: Session,
    drive: str,
    self_dir: str,
    targets: Iterable[str],
) -> tuple[set[str], list[ResolveDiagnostic]]:
    """Resolve a batch of wiki targets in one call.

    Precedence (spec §3.3, strict — first rule with hits stops the
    chain; ambiguity is intra-rule only):

    1. ``^\\d{12,17}$`` → ``File.md_id`` exact match.
    2. ``./`` / ``../`` prefix → relative-from-``self_dir``.
    3. Contains ``/`` → relative-from-``self_dir``, then absolute-from-root.
    4. ``Path(filename).stem`` match across the drive (case-sensitive).
    5. ``File.md_aliases`` (JSON list) contains the target.

    Returns ``(resolved_ids, diagnostics)``. ``resolved_ids`` dedupes
    automatically (set). Diagnostics preserve first-seen target order
    for stable UI rendering and exclude duplicate targets.
    """
    resolved: set[str] = set()
    diagnostics: list[ResolveDiagnostic] = []
    seen: set[str] = set()
    for target in targets:
        if target in seen:
            continue
        seen.add(target)
        file_id, diag = _resolve_single_target(db, drive, self_dir, target)
        if file_id is not None:
            resolved.add(file_id)
        elif diag is not None:
            diagnostics.append(diag)
    return resolved, diagnostics


def resolve_wiki_targets_with_map(
    db: Session,
    drive: str,
    self_dir: str,
    targets: Iterable[str],
) -> tuple[dict[str, str], list[ResolveDiagnostic]]:
    """Variant returning ``target → file_id`` so callers can map back.

    Used by ``GET /api/files/{id}/wiki-resolutions`` to populate the
    renderer's lookup table. Same precedence; same diagnostics list.
    """
    target_to_id: dict[str, str] = {}
    diagnostics: list[ResolveDiagnostic] = []
    seen: set[str] = set()
    for target in targets:
        if target in seen:
            continue
        seen.add(target)
        file_id, diag = _resolve_single_target(db, drive, self_dir, target)
        if file_id is not None:
            target_to_id[target] = file_id
        elif diag is not None:
            diagnostics.append(diag)
    return target_to_id, diagnostics
