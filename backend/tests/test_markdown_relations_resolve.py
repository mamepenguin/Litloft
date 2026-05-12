"""Unit tests for ``app.services.markdown_relations.resolve_wiki_targets``.

Spec: docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md §3.3.

Resolver precedence (first matching rule wins per target):

1. ``X`` matches ``^\\d{12,17}$`` → look up ``File.md_id == X`` in drive.
2. ``X`` starts with ``./`` or ``../`` → relative-path resolve against
   ``self_dir`` (basename with optional ``.md`` extension).
3. ``X`` contains ``/`` (but not rule 2) → try relative-from-self_dir
   first, then absolute-from-drive-root.
4. Basename match: ``Path(filename).stem == X`` among the drive's
   active ``.md`` files (case-sensitive).
5. Alias match: ``X`` is in ``File.md_aliases`` (JSON-encoded list)
   among active ``.md`` files.
6. 0 hits → ``ResolveDiagnostic(kind='unresolved')``.
7. 2+ hits in steps 4/5 → ``ResolveDiagnostic(kind='ambiguous',
   candidates=[paths])``.

All resolution is **drive-scoped** (security boundary) and applies
``active_file_filter`` (trashed / missing files are not resolution
targets).

RED at the moment because the module does not exist yet.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

from app.models import File

# Module under test — does not exist yet.
from app.services.markdown_relations import (
    ResolveDiagnostic,
    resolve_wiki_targets,
)
from tests.conftest import TEST_DRIVE

SECOND_DRIVE = "second-drive"


def _seed_md(
    db,
    drive: str,
    file_path: str,
    md_id: str | None = None,
    md_aliases: list[str] | None = None,
    deleted_at: datetime | None = None,
    missing_since: datetime | None = None,
) -> File:
    """Seed a single .md File row.

    ``md_aliases`` is JSON-encoded the same way the production
    projection writes it.
    """
    parts = file_path.split("/")
    filename = parts[-1]
    folder = "/".join(parts[:-1])
    f = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path=folder,
        file_path=file_path,
        file_size=10,
        file_type="document",
        mime_type="text/markdown",
        md_id=md_id,
        md_aliases=json.dumps(md_aliases) if md_aliases is not None else None,
        deleted_at=deleted_at,
        missing_since=missing_since,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


# ---------------------------------------------------------------------------
# Rule 1: numeric id → File.md_id lookup
# ---------------------------------------------------------------------------

class TestResolveNumericId:
    def test_14_digit_id_resolves_to_file_with_matching_md_id(self, db_session):
        target = _seed_md(
            db_session, TEST_DRIVE, "notes/note.md", md_id="20260512143028"
        )
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["20260512143028"]
        )
        assert resolved == {target.id}
        assert diagnostics == []

    def test_17_digit_id_with_ms_suffix_resolves(self, db_session):
        target = _seed_md(
            db_session, TEST_DRIVE, "n.md", md_id="20260512143028123"
        )
        resolved, _ = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["20260512143028123"]
        )
        assert resolved == {target.id}

    def test_numeric_target_with_no_matching_md_id_is_unresolved(
        self, db_session
    ):
        # CRITICAL: rule 1 must NOT fall through to rule 4 (basename)
        # even if a `.md` is literally named ``20260512143028.md``.
        # The numeric form is a strict id namespace.
        _seed_md(
            db_session,
            TEST_DRIVE,
            "20260512143028.md",
            md_id=None,  # no frontmatter id
        )
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["20260512143028"]
        )
        assert resolved == set()
        assert len(diagnostics) == 1
        assert diagnostics[0].target == "20260512143028"
        assert diagnostics[0].kind == "unresolved"

    def test_numeric_too_short_falls_through(self, db_session):
        # 11-digit string is NOT a valid id form (``^\d{12,17}$``).
        # It must be evaluated against rule 4 (basename).
        target = _seed_md(db_session, TEST_DRIVE, "12345678901.md")
        resolved, _ = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["12345678901"]
        )
        assert resolved == {target.id}

    def test_numeric_too_long_falls_through(self, db_session):
        # 18-digit string is NOT a valid id form. Treat as basename.
        target = _seed_md(db_session, TEST_DRIVE, "123456789012345678.md")
        resolved, _ = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["123456789012345678"]
        )
        assert resolved == {target.id}


# ---------------------------------------------------------------------------
# Rule 2: ``./`` and ``../`` relative paths
# ---------------------------------------------------------------------------

class TestResolveRelativePath:
    def test_dot_slash_resolves_sibling(self, db_session):
        # ``self_dir = notes/2026`` and target ``./sibling`` should
        # resolve to ``notes/2026/sibling.md``.
        target = _seed_md(db_session, TEST_DRIVE, "notes/2026/sibling.md")
        resolved, _ = resolve_wiki_targets(
            db_session, TEST_DRIVE, "notes/2026", ["./sibling"]
        )
        assert resolved == {target.id}

    def test_dotdot_slash_resolves_parent(self, db_session):
        # ``self_dir = notes/2026`` and target ``../neighbor`` should
        # resolve to ``notes/neighbor.md``.
        target = _seed_md(db_session, TEST_DRIVE, "notes/neighbor.md")
        resolved, _ = resolve_wiki_targets(
            db_session, TEST_DRIVE, "notes/2026", ["../neighbor"]
        )
        assert resolved == {target.id}

    def test_dot_slash_with_extension_explicit(self, db_session):
        # ``./sibling.md`` (with extension) should also resolve.
        target = _seed_md(db_session, TEST_DRIVE, "notes/sibling.md")
        resolved, _ = resolve_wiki_targets(
            db_session, TEST_DRIVE, "notes", ["./sibling.md"]
        )
        assert resolved == {target.id}

    def test_relative_target_not_found_is_unresolved(self, db_session):
        # ``./missing`` with no matching file → unresolved.
        # Rule 2 does NOT fall through to basename / alias.
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "notes", ["./missing"]
        )
        assert resolved == set()
        assert len(diagnostics) == 1
        assert diagnostics[0].kind == "unresolved"


# ---------------------------------------------------------------------------
# Rule 3: targets containing ``/`` (but not rule 2)
# ---------------------------------------------------------------------------

class TestResolveSlashPath:
    def test_relative_first_then_absolute(self, db_session):
        # When the same path exists both relative-from-self_dir AND
        # absolute-from-drive-root, the RELATIVE one wins.
        # Setup: self_dir = ``a``; target ``foo/note``;
        #   relative resolution: ``a/foo/note.md`` (exists)
        #   absolute resolution: ``foo/note.md`` (also exists)
        relative_target = _seed_md(db_session, TEST_DRIVE, "a/foo/note.md")
        _absolute_target = _seed_md(db_session, TEST_DRIVE, "foo/note.md")
        resolved, _ = resolve_wiki_targets(
            db_session, TEST_DRIVE, "a", ["foo/note"]
        )
        assert resolved == {relative_target.id}

    def test_absolute_fallback_when_relative_misses(self, db_session):
        # Only the absolute form exists → use it.
        target = _seed_md(db_session, TEST_DRIVE, "foo/note.md")
        resolved, _ = resolve_wiki_targets(
            db_session, TEST_DRIVE, "a", ["foo/note"]
        )
        assert resolved == {target.id}

    def test_neither_relative_nor_absolute_exists_is_unresolved(
        self, db_session
    ):
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "a", ["foo/missing"]
        )
        assert resolved == set()
        assert diagnostics[0].kind == "unresolved"


# ---------------------------------------------------------------------------
# Rule 4: basename match
# ---------------------------------------------------------------------------

class TestResolveBasename:
    def test_basename_unique_match(self, db_session):
        target = _seed_md(db_session, TEST_DRIVE, "notes/year-recap.md")
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["year-recap"]
        )
        assert resolved == {target.id}
        assert diagnostics == []

    def test_basename_case_sensitive(self, db_session):
        # Spec §3.3 note: basename comparison is case-sensitive
        # (Linux-Docker convention).
        _seed_md(db_session, TEST_DRIVE, "Year-Recap.md")
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["year-recap"]
        )
        assert resolved == set()
        # ``year-recap`` (lowercase) does not match ``Year-Recap``.
        assert diagnostics[0].kind == "unresolved"

    def test_unicode_basename(self, db_session):
        # CJK / non-ASCII basenames work the same way.
        target = _seed_md(db_session, TEST_DRIVE, "年次振り返り.md")
        resolved, _ = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["年次振り返り"]
        )
        assert resolved == {target.id}


# ---------------------------------------------------------------------------
# Rule 5: alias match
# ---------------------------------------------------------------------------

class TestResolveAlias:
    def test_alias_resolves_when_no_basename_match(self, db_session):
        target = _seed_md(
            db_session,
            TEST_DRIVE,
            "notes/recap.md",
            md_aliases=["year-summary", "annual-review"],
        )
        resolved, _ = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["year-summary"]
        )
        assert resolved == {target.id}

    def test_alias_case_sensitive(self, db_session):
        _seed_md(db_session, TEST_DRIVE, "n.md", md_aliases=["YearSummary"])
        resolved, _ = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["yearsummary"]
        )
        assert resolved == set()

    def test_basename_wins_over_alias_when_both_match(self, db_session):
        # ``X = "shared"``: basename of file A is "shared"; alias of
        # file B is also "shared".  Rule 4 fires first → unique hit on
        # basename → resolved.
        basename_match = _seed_md(db_session, TEST_DRIVE, "shared.md")
        _alias_match = _seed_md(
            db_session, TEST_DRIVE, "other.md", md_aliases=["shared"]
        )
        # Spec §3.3 — strict precedence: rule 4 is evaluated first and
        # stops on >=1 hit. A 1-basename + 1-alias collision is NOT
        # cross-rule ambiguity; rule 4 wins with the basename match.
        # (Earlier test draft asserted ambiguous; corrected per the
        # Phase B prompt's spec re-reading.)
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["shared"]
        )
        assert resolved == {basename_match.id}
        assert diagnostics == []


# ---------------------------------------------------------------------------
# Rule 6: unresolved
# ---------------------------------------------------------------------------

class TestResolveUnresolved:
    def test_no_match_anywhere(self, db_session):
        _seed_md(db_session, TEST_DRIVE, "existing.md")
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["does-not-exist"]
        )
        assert resolved == set()
        assert len(diagnostics) == 1
        assert diagnostics[0].target == "does-not-exist"
        assert diagnostics[0].kind == "unresolved"
        # ``candidates`` for unresolved is empty (only populated for
        # ambiguous).
        assert diagnostics[0].candidates == []


# ---------------------------------------------------------------------------
# Rule 7: ambiguous
# ---------------------------------------------------------------------------

class TestResolveAmbiguous:
    def test_two_basenames_collide(self, db_session):
        _seed_md(db_session, TEST_DRIVE, "notes/a/year.md")
        _seed_md(db_session, TEST_DRIVE, "notes/b/year.md")
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["year"]
        )
        assert resolved == set()
        assert len(diagnostics) == 1
        d = diagnostics[0]
        assert d.target == "year"
        assert d.kind == "ambiguous"
        candidates = set(d.candidates)
        assert "notes/a/year.md" in candidates
        assert "notes/b/year.md" in candidates

    def test_two_aliases_collide(self, db_session):
        # Within rule 5: two different files both list the same alias.
        # Rule 4 returns 0 hits → rule 5 evaluates → 2 hits → ambiguous.
        # (This replaces the previous "basename + alias = ambiguous"
        # test, which contradicted the spec's strict precedence; see
        # ``test_basename_wins_over_alias_when_both_match``.)
        _seed_md(db_session, TEST_DRIVE, "alpha.md", md_aliases=["thing"])
        _seed_md(db_session, TEST_DRIVE, "beta.md", md_aliases=["thing"])
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["thing"]
        )
        assert resolved == set()
        assert diagnostics[0].kind == "ambiguous"
        candidates = set(diagnostics[0].candidates)
        assert "alpha.md" in candidates
        assert "beta.md" in candidates


# ---------------------------------------------------------------------------
# Drive boundary + active filter
# ---------------------------------------------------------------------------

class TestResolveDriveBoundary:
    def test_cross_drive_target_is_unresolved(self, db_session):
        # The .md exists on a different drive (security boundary —
        # cross-drive resolution forbidden).
        _seed_md(db_session, SECOND_DRIVE, "year-recap.md")
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["year-recap"]
        )
        assert resolved == set()
        assert diagnostics[0].kind == "unresolved"

    def test_trashed_target_is_unresolved(self, db_session):
        _seed_md(
            db_session,
            TEST_DRIVE,
            "year-recap.md",
            deleted_at=datetime.now(UTC).replace(tzinfo=None),
        )
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["year-recap"]
        )
        assert resolved == set()
        assert diagnostics[0].kind == "unresolved"

    def test_missing_target_is_unresolved(self, db_session):
        _seed_md(
            db_session,
            TEST_DRIVE,
            "year-recap.md",
            missing_since=datetime.now(UTC).replace(tzinfo=None),
        )
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["year-recap"]
        )
        assert resolved == set()
        assert diagnostics[0].kind == "unresolved"

    def test_trashed_md_id_target_is_unresolved(self, db_session):
        # Rule 1 also applies the active filter.
        _seed_md(
            db_session,
            TEST_DRIVE,
            "x.md",
            md_id="20260512143028",
            deleted_at=datetime.now(UTC).replace(tzinfo=None),
        )
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["20260512143028"]
        )
        assert resolved == set()
        assert diagnostics[0].kind == "unresolved"


# ---------------------------------------------------------------------------
# Multiple targets in one call
# ---------------------------------------------------------------------------

class TestResolveMultipleTargets:
    def test_mixed_resolved_and_unresolved(self, db_session):
        a = _seed_md(db_session, TEST_DRIVE, "alpha.md")
        b = _seed_md(
            db_session, TEST_DRIVE, "n.md", md_id="20260512143028"
        )
        resolved, diagnostics = resolve_wiki_targets(
            db_session,
            TEST_DRIVE,
            "",
            ["alpha", "20260512143028", "missing"],
        )
        assert resolved == {a.id, b.id}
        assert len(diagnostics) == 1
        assert diagnostics[0].target == "missing"
        assert diagnostics[0].kind == "unresolved"

    def test_dedup_in_resolved_set(self, db_session):
        # Same target appearing twice (different inputs that point to
        # the same file) collapses to a single file_id in the result.
        target = _seed_md(
            db_session,
            TEST_DRIVE,
            "alpha.md",
            md_id="20260512143028",
            md_aliases=["a-alias"],
        )
        resolved, _ = resolve_wiki_targets(
            db_session,
            TEST_DRIVE,
            "",
            ["alpha", "20260512143028", "a-alias"],
        )
        assert resolved == {target.id}


# ---------------------------------------------------------------------------
# ResolveDiagnostic dataclass contract
# ---------------------------------------------------------------------------

class TestResolveDiagnosticDataclass:
    def test_diagnostic_fields(self, db_session):
        resolved, diagnostics = resolve_wiki_targets(
            db_session, TEST_DRIVE, "", ["nowhere"]
        )
        assert isinstance(diagnostics[0], ResolveDiagnostic)
        assert diagnostics[0].target == "nowhere"
        assert diagnostics[0].kind == "unresolved"
        assert diagnostics[0].candidates == []
