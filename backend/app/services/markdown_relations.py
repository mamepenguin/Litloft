"""Markdown link extraction and resolution.

Spec: ``docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md``
§3.3–3.5 (Phase B), §3.7 (Phase D).

This service is the single source of truth for parsing the 3 link forms
inside ``.md`` bodies:

* ``loft://<file_id>`` — direct id reference (extracted only).
* ``[[<text>]]`` — wiki-link target (extracted *and* resolved against
  drive-local ``.md`` files).

The resolver runs entirely inside the same drive (security boundary,
``.claude/rules/design-decisions.md``). It is **pure read** against the
ORM session — callers commit on their own boundary.

Phase D additionally exposes :func:`rewrite_basename_in_drive`, used by
the rename / scanner-move hooks to keep ``[[old_basename]]`` references
in other ``.md`` files in sync when a ``.md`` is renamed.
"""
from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Iterable, Literal

from sqlalchemy.orm import Session

import app.config as config
from app.models import File, active_file_filter

logger = logging.getLogger(__name__)

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


# ---------------------------------------------------------------------------
# Rewrite (Phase D)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RewriteResult:
    """Counters returned by :func:`rewrite_basename_in_drive`.

    * ``files_scanned`` — number of active ``.md`` files considered (i.e.
      the drive-scoped working set after the active filter).
    * ``files_changed`` — subset of scanned files whose body was rewritten.
    * ``occurrences`` — total number of ``[[old]]`` / ``[[old|...]]`` /
      ``[[old#...]]`` tokens replaced across all changed files.
    """

    files_scanned: int
    files_changed: int
    occurrences: int


def _rewrite_body(body: str, old: str, new: str) -> tuple[str, int]:
    """Apply escape-aware ``[[old…]] → [[new…]]`` rewrite to a body.

    Returns ``(new_body, occurrences)``. Pure / immutable — never mutates
    the input string.

    Discipline:

    * ``\\[`` / ``\\]`` (CommonMark escapes) are masked with sentinels so
      they cannot be captured as wiki-link delimiters.
    * The wiki target is the full text between ``[[`` and the next
      ``]``, ``|`` or ``#``. The trailing delimiter is preserved verbatim,
      so ``[[old|disp]]`` → ``[[new|disp]]`` and ``[[old#h]]`` →
      ``[[new#h]]`` keep their suffix.
    * Word-boundary: ``[[oldsuffix]]`` must not match — the lookahead-style
      capture of the delimiter character enforces this.
    """
    if not body:
        return body, 0

    masked = body.replace("\\[", _ESCAPED_OPEN).replace("\\]", _ESCAPED_CLOSE)
    pattern = re.compile(
        rf"\[\[{re.escape(old)}(?P<suffix>[\]\|#])"
    )

    occurrences = 0

    def _replace(match: re.Match[str]) -> str:
        nonlocal occurrences
        occurrences += 1
        return f"[[{new}{match.group('suffix')}"

    rewritten = pattern.sub(_replace, masked)
    if occurrences == 0:
        # Fast path: no changes, return the original body so the caller
        # can detect "no rewrite needed" without comparing strings.
        return body, 0

    final = rewritten.replace(_ESCAPED_OPEN, "\\[").replace(_ESCAPED_CLOSE, "\\]")
    return final, occurrences


_FM_DELIM = "---"


def _split_frontmatter_prefix(content: str) -> tuple[str, str]:
    """Split a ``.md`` document into ``(prefix, body)`` *without reformatting*.

    Unlike :func:`app.services.frontmatter.parse`, this preserves the
    on-disk byte-for-byte layout of the frontmatter block (indentation,
    blank lines, comments). The body half is everything after the
    closing ``---`` line.

    When the document has no frontmatter (or it's malformed / unclosed),
    ``prefix`` is an empty string and ``body`` is the full content. The
    rewrite then proceeds on the whole document, which is safe because
    any wiki-link tokens would only appear in the body anyway.
    """
    stripped = content.lstrip("﻿")
    bom_len = len(content) - len(stripped)
    if not stripped.startswith(_FM_DELIM):
        return "", content
    after_open = stripped[len(_FM_DELIM):]
    if not after_open.startswith("\n"):
        return "", content
    rest = after_open[1:]
    lines = rest.split("\n")
    close_idx: int | None = None
    for i, line in enumerate(lines):
        if line.strip() == _FM_DELIM:
            close_idx = i
            break
    if close_idx is None:
        return "", content
    # Reconstruct the prefix verbatim: BOM (if any) + opening delim +
    # raw YAML lines + closing delim line. No re-serialization.
    prefix_lines = [_FM_DELIM] + lines[: close_idx + 1]
    raw_prefix = "\n".join(prefix_lines) + "\n"
    body = "\n".join(lines[close_idx + 1:])
    if body.startswith("\n"):
        body = body[1:]
        raw_prefix += "\n"
    prefix = content[:bom_len] + raw_prefix
    return prefix, body


def _resolve_md_file_path(file_record: File) -> Path | None:
    """Resolve a ``File`` row to its on-disk absolute path, or ``None``.

    Returns ``None`` for unregistered drives so the caller can skip
    cleanly (rather than blowing up with ``KeyError`` mid-rewrite). A
    realpath-based defense-in-depth check ensures the resolved target
    is contained under ``drive_path`` — protects against a poisoned
    ``file_path`` ever slipping into the DB.
    """
    try:
        drive_path = config.get_drive_path(file_record.drive)
    except (KeyError, FileNotFoundError, ValueError):
        return None
    candidate = drive_path / file_record.file_path
    real_base = Path(os.path.realpath(drive_path))
    real_target = Path(os.path.realpath(candidate))
    base_str = str(real_base)
    target_str = str(real_target)
    if target_str != base_str and not target_str.startswith(base_str + os.sep):
        logger.warning(
            "rewrite: refusing to write outside drive: %s (%s)",
            file_record.file_path, file_record.drive,
        )
        return None
    return candidate


def _write_atomically(target: Path, content: str) -> int:
    """Write ``content`` to ``target`` via ``tmp + os.replace``.

    Returns the new on-disk size in bytes. Raises on failure; callers
    isolate via try / except so one bad file cannot abort the batch.
    The tmp sibling is removed on any exception so failed rewrites
    don't leak ``.tmp`` artefacts into the user's drive.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    try:
        tmp.write_text(content, encoding="utf-8")
        tmp.replace(target)
    except Exception:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    return target.stat().st_size


def rewrite_basename_in_drive(
    db: Session,
    drive: str,
    old_basename: str,
    new_basename: str,
    *,
    exclude_file_id: str | None = None,
) -> RewriteResult:
    """Rewrite ``[[old_basename]]`` references across a drive's ``.md``.

    Spec §3.7 (Rename rewrite). For every active ``.md`` file in
    ``drive`` other than ``exclude_file_id``, parse the frontmatter to
    isolate the body, rewrite ``[[old_basename]]`` / ``[[old_basename|x]]`` /
    ``[[old_basename#h]]`` to ``[[new_basename…]]`` in the body only,
    then write the file back atomically.

    Frontmatter (including ``aliases:`` entries that happen to match
    ``old_basename``) is preserved verbatim — spec §7.6.

    No-op when ``old_basename == new_basename`` (returns zero counters).

    Per-file failures are logged and skipped — the function never
    raises for a single bad file. Callers may still see exceptions if
    the ORM query itself fails.
    """
    if old_basename == new_basename:
        return RewriteResult(files_scanned=0, files_changed=0, occurrences=0)

    rows = (
        db.query(File)
        .filter(
            active_file_filter(),
            File.drive == drive,
            _md_predicate(),
        )
        .all()
    )

    files_scanned = 0
    files_changed = 0
    total_occurrences = 0

    for row in rows:
        if exclude_file_id is not None and row.id == exclude_file_id:
            continue
        # Intrinsic self-skip: any file whose basename equals
        # ``old_basename`` is the file being renamed (or a future
        # rename that will collide). The rename hook owns its own
        # state; the rewrite must not double-write the body. This is
        # the safety net for callers that don't pass
        # ``exclude_file_id`` (e.g. the scanner code path where the
        # File row's filename has already advanced to ``new``).
        if Path(row.filename).stem == old_basename:
            continue
        files_scanned += 1

        on_disk = _resolve_md_file_path(row)
        if on_disk is None or not on_disk.exists():
            continue

        try:
            content = on_disk.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            logger.warning(
                "rewrite: failed to read %s (%s): %s",
                row.file_path, row.drive, exc,
            )
            continue

        prefix, body = _split_frontmatter_prefix(content)
        new_body, count = _rewrite_body(body, old_basename, new_basename)
        if count == 0:
            continue

        new_content = prefix + new_body

        try:
            new_size = _write_atomically(on_disk, new_content)
        except OSError as exc:
            logger.warning(
                "rewrite: failed to write %s (%s): %s",
                row.file_path, row.drive, exc,
            )
            continue

        row.file_size = new_size
        db.flush()
        files_changed += 1
        total_occurrences += count

    return RewriteResult(
        files_scanned=files_scanned,
        files_changed=files_changed,
        occurrences=total_occurrences,
    )


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
