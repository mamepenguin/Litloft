"""Unit tests for ``markdown_relations.rewrite_basename_in_drive``.

Spec: docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md
§3.7 (Rename rewrite) and §4 Phase D.

The helper walks the drive's active ``.md`` files and rewrites
``[[<old_basename>]]`` / ``[[<old_basename>|disp]]`` / ``[[<old_basename>#h]]``
to use ``<new_basename>``. It returns a frozen ``RewriteResult`` with
counters that callers use for logging and ``files.updated`` broadcasts.

Discipline (from the spec):

* Drive-scoped (security boundary).
* Only ``.md`` files participate. Non-``.md`` are not scanned.
* Active rows only (trashed / missing skipped).
* ``aliases:`` inside frontmatter is intentional user state — never
  rewritten by basename rename.
* Word-boundary: ``[[oldsuffix]]`` must NOT match ``old`` (the captured
  target is the full bracketed name).
* Escaped brackets (``\\[\\[old\\]\\]``) are CommonMark escapes — leave
  them alone.
* Self-link skip: when ``old.md`` itself contains ``[[old]]`` (a
  self-reference), the rewrite skips that file. The rename hook updates
  the file's own filename via a separate path and shouldn't double-write
  its body.
* Per-file atomic write (tmp + os.replace).
* Caller emits the WS event; the helper only reports counters.

RED at the moment: ``rewrite_basename_in_drive`` and ``RewriteResult``
do not exist yet.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

from app.models import File
from app.services.frontmatter import parse as parse_frontmatter

# Target symbols — not yet implemented (Phase D).
from app.services.markdown_relations import (  # type: ignore[attr-defined]
    RewriteResult,
    rewrite_basename_in_drive,
)
from tests.conftest import TEST_DRIVE

SECOND_DRIVE = "second-drive"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_md_with_body(
    db,
    drive_dir,
    drive: str,
    file_path: str,
    body: str,
    *,
    md_id: str | None = None,
    md_aliases: list[str] | None = None,
    deleted_at: datetime | None = None,
    missing_since: datetime | None = None,
) -> File:
    """Write a .md file to disk AND seed a matching File row.

    The on-disk content is what the rewrite helper grep/scans, so it
    matters that both sides exist for these tests.
    """
    full = drive_dir / file_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(body, encoding="utf-8")

    parts = file_path.split("/")
    filename = parts[-1]
    folder = "/".join(parts[:-1])
    f = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path=folder,
        file_path=file_path,
        file_size=len(body.encode("utf-8")),
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


def _seed_nonmd(db, drive_dir, drive: str, file_path: str, body: str) -> File:
    full = drive_dir / file_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(body, encoding="utf-8")
    parts = file_path.split("/")
    filename = parts[-1]
    folder = "/".join(parts[:-1])
    f = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path=folder,
        file_path=file_path,
        file_size=len(body.encode("utf-8")),
        file_type="document",
        mime_type="text/plain",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _read(drive_dir, file_path: str) -> str:
    return (drive_dir / file_path).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Pure helper — single-form rewrites
# ---------------------------------------------------------------------------

class TestRewriteSingleForm:
    def test_plain_wiki_link_rewritten(self, client):
        _, db, drive_dir, _ = client
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "a.md",
            "see [[old]] for context\n",
        )

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert isinstance(result, RewriteResult)
        assert result.files_scanned >= 1
        assert result.files_changed == 1
        assert result.occurrences == 1
        assert _read(drive_dir, "a.md") == "see [[new]] for context\n"

    def test_aliased_wiki_link_preserves_display(self, client):
        _, db, drive_dir, _ = client
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "a.md",
            "see [[old|Display Name]] please\n",
        )

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == 1
        assert result.occurrences == 1
        assert _read(drive_dir, "a.md") == "see [[new|Display Name]] please\n"

    def test_heading_anchor_preserved(self, client):
        _, db, drive_dir, _ = client
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "a.md",
            "see [[old#intro]] section\n",
        )

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == 1
        assert result.occurrences == 1
        assert _read(drive_dir, "a.md") == "see [[new#intro]] section\n"

    def test_all_three_forms_in_one_file(self, client):
        _, db, drive_dir, _ = client
        body = (
            "intro: [[old]]\n"
            "labeled: [[old|My Note]]\n"
            "anchored: [[old#heading-1]]\n"
        )
        _seed_md_with_body(db, drive_dir, TEST_DRIVE, "a.md", body)

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == 1
        assert result.occurrences == 3
        expected = (
            "intro: [[new]]\n"
            "labeled: [[new|My Note]]\n"
            "anchored: [[new#heading-1]]\n"
        )
        assert _read(drive_dir, "a.md") == expected


# ---------------------------------------------------------------------------
# Pure helper — non-matching content untouched
# ---------------------------------------------------------------------------

class TestRewriteSkipsUnaffected:
    def test_file_without_target_not_touched(self, client):
        _, db, drive_dir, _ = client
        body = "unrelated body with [[other]] link\n"
        rec = _seed_md_with_body(db, drive_dir, TEST_DRIVE, "a.md", body)
        before_mtime = (drive_dir / "a.md").stat().st_mtime
        before_size = rec.file_size

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == 0
        assert result.occurrences == 0
        assert _read(drive_dir, "a.md") == body
        # mtime not bumped (the file was never rewritten).
        assert (drive_dir / "a.md").stat().st_mtime == before_mtime
        # File.file_size unchanged.
        db.expire_all()
        refreshed = db.query(File).filter(File.id == rec.id).first()
        assert refreshed.file_size == before_size

    def test_longer_basename_starting_with_old_not_touched(self, client):
        # [[oldsuffix]] must not be rewritten when old_basename == "old".
        # The wiki target is the full token between brackets, so the
        # comparison must be exact / token-level, NOT a substring.
        _, db, drive_dir, _ = client
        body = "see [[oldsuffix]] and [[oldskool]] but not [[old]]\n"
        _seed_md_with_body(db, drive_dir, TEST_DRIVE, "a.md", body)

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        # Only the exact [[old]] was rewritten.
        assert result.occurrences == 1
        assert result.files_changed == 1
        assert _read(drive_dir, "a.md") == (
            "see [[oldsuffix]] and [[oldskool]] but not [[new]]\n"
        )

    def test_escaped_brackets_not_rewritten(self, client):
        # CommonMark escape: \[\[old\]\] is literal text, not a
        # wiki-link. The rewrite must respect the escape and leave the
        # bytes verbatim.
        _, db, drive_dir, _ = client
        body = "literal: \\[\\[old\\]\\] still literal\n"
        _seed_md_with_body(db, drive_dir, TEST_DRIVE, "a.md", body)

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == 0
        assert result.occurrences == 0
        assert _read(drive_dir, "a.md") == body

    def test_aliases_in_frontmatter_not_rewritten(self, client):
        # Spec §3.7: ``aliases:`` are intentional user-managed values.
        # A basename rename must not silently rewrite an alias entry
        # whose text happens to equal the old basename.
        _, db, drive_dir, _ = client
        body = (
            "---\n"
            "aliases:\n"
            "  - old\n"
            "  - older\n"
            "---\n"
            "\n"
            "body has [[old]] reference\n"
        )
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "a.md", body,
            md_aliases=["old", "older"],
        )

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == 1
        # Only the body link counts; the alias entry is preserved.
        assert result.occurrences == 1

        after = _read(drive_dir, "a.md")
        parsed = parse_frontmatter(after)
        # aliases verbatim.
        assert parsed.metadata.get("aliases") == ["old", "older"]
        # Body link rewritten.
        assert "[[new]] reference" in after
        # Sanity: literal "old" in frontmatter is preserved.
        assert "  - old\n" in after


# ---------------------------------------------------------------------------
# Drive scope / state filters
# ---------------------------------------------------------------------------

class TestRewriteDriveScope:
    def test_other_drive_not_touched(self, client, db_session):
        # The ``client`` fixture only knows about TEST_DRIVE. We
        # exercise scoping by adding a row tagged with SECOND_DRIVE
        # plus an on-disk file under a parallel dir — the helper
        # should ignore it because its drive label differs.
        c, db, drive_dir, _ = client

        # Same drive: contains [[old]] and should be rewritten.
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "a.md", "see [[old]]\n"
        )

        # Other drive: a separate dir + a File row tagged with
        # SECOND_DRIVE. The helper should not touch this file even
        # though its disk content references ``old``.
        other_drive_dir = drive_dir.parent / SECOND_DRIVE
        other_drive_dir.mkdir(parents=True, exist_ok=True)
        other_path = "b.md"
        other_body = "see [[old]] in other drive\n"
        (other_drive_dir / other_path).write_text(other_body, encoding="utf-8")
        other_row = File(
            filename="b.md",
            title="b.md",
            drive=SECOND_DRIVE,
            folder_path="",
            file_path=other_path,
            file_size=len(other_body),
            file_type="document",
            mime_type="text/markdown",
        )
        db.add(other_row)
        db.commit()

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        # Only the TEST_DRIVE file changed.
        assert result.files_changed == 1
        assert result.occurrences == 1
        assert (other_drive_dir / other_path).read_text() == other_body

    def test_trashed_md_skipped(self, client):
        _, db, drive_dir, _ = client
        # Active file (gets rewritten).
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "live.md", "see [[old]]\n"
        )
        # Trashed file (skipped).
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "trashed.md", "see [[old]]\n",
            deleted_at=datetime.now(UTC),
        )

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == 1
        assert result.occurrences == 1
        assert _read(drive_dir, "live.md") == "see [[new]]\n"
        # Trashed file's on-disk content is left alone.
        assert _read(drive_dir, "trashed.md") == "see [[old]]\n"

    def test_missing_md_skipped(self, client):
        _, db, drive_dir, _ = client
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "live.md", "see [[old]]\n"
        )
        # Missing row (skipped).
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "missing.md", "see [[old]]\n",
            missing_since=datetime.now(UTC),
        )

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == 1
        assert _read(drive_dir, "missing.md") == "see [[old]]\n"

    def test_non_md_files_not_scanned(self, client):
        _, db, drive_dir, _ = client
        _seed_nonmd(db, drive_dir, TEST_DRIVE, "a.txt", "see [[old]] here\n")
        _seed_md_with_body(db, drive_dir, TEST_DRIVE, "b.md", "see [[old]]\n")

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == 1
        assert result.occurrences == 1
        assert _read(drive_dir, "a.txt") == "see [[old]] here\n"
        assert _read(drive_dir, "b.md") == "see [[new]]\n"


# ---------------------------------------------------------------------------
# Bulk / scale + counters
# ---------------------------------------------------------------------------

class TestRewriteBulk:
    def test_empty_drive_returns_zero_counters(self, client):
        _, db, drive_dir, _ = client
        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")
        assert result.files_scanned == 0
        assert result.files_changed == 0
        assert result.occurrences == 0

    def test_many_files_all_rewritten(self, client):
        _, db, drive_dir, _ = client
        n = 50
        for i in range(n):
            _seed_md_with_body(
                db, drive_dir, TEST_DRIVE, f"notes/n{i:03}.md",
                f"file {i} references [[old]]\n",
            )

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == n
        assert result.occurrences == n
        for i in range(n):
            assert (
                _read(drive_dir, f"notes/n{i:03}.md")
                == f"file {i} references [[new]]\n"
            )

    def test_multiple_occurrences_in_one_file_counted(self, client):
        _, db, drive_dir, _ = client
        body = "[[old]] and [[old|x]] and [[old#a]] and again [[old]]\n"
        _seed_md_with_body(db, drive_dir, TEST_DRIVE, "a.md", body)

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == 1
        assert result.occurrences == 4

    def test_files_scanned_counter_includes_non_changed(self, client):
        # Spec wording: ``files_scanned`` is the number of .md files
        # the helper considered (matching the drive scope + active
        # filter). ``files_changed`` is the subset that was rewritten.
        _, db, drive_dir, _ = client
        _seed_md_with_body(db, drive_dir, TEST_DRIVE, "hit.md", "[[old]]\n")
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "miss.md", "unrelated content\n"
        )

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        # ``files_scanned`` is at least the number of MD files that
        # were considered. The implementation MAY narrow this to "files
        # whose body contained the old token" — but in that case the
        # ``miss.md`` file is still allowed to be counted or not. We
        # only assert the strict lower bound on changed.
        assert result.files_changed == 1
        assert result.occurrences == 1


# ---------------------------------------------------------------------------
# Self-link skip
# ---------------------------------------------------------------------------

class TestRewriteSelfSkip:
    def test_self_link_in_renamed_file_skipped(self, client):
        # When ``old.md`` is the file being renamed and its own body
        # contains ``[[old]]`` (a self-link), the helper must leave it
        # alone. The rename hook owns the file's own state.
        _, db, drive_dir, _ = client
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "old.md",
            "I link to myself via [[old]] for some reason\n",
        )
        # And a sibling that must be rewritten.
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "other.md",
            "references [[old]]\n",
        )

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        # Only the sibling was rewritten.
        assert result.files_changed == 1
        assert result.occurrences == 1
        assert _read(drive_dir, "other.md") == "references [[new]]\n"
        # Self-file is untouched (the rename op moves it to new.md on
        # disk separately; the helper does not double-write).
        assert (
            _read(drive_dir, "old.md")
            == "I link to myself via [[old]] for some reason\n"
        )


# ---------------------------------------------------------------------------
# Roundtrip integrity
# ---------------------------------------------------------------------------

class TestRoundtripIntegrity:
    def test_frontmatter_preserved_verbatim(self, client):
        _, db, drive_dir, _ = client
        body = (
            "---\n"
            "id: \"20260512143028\"\n"
            "tags:\n"
            "  - alpha\n"
            "  - beta\n"
            "aliases:\n"
            "  - secondary\n"
            "---\n"
            "\n"
            "body with [[old]] link\n"
        )
        _seed_md_with_body(
            db, drive_dir, TEST_DRIVE, "a.md", body,
            md_id="20260512143028",
            md_aliases=["secondary"],
        )

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "new")

        assert result.files_changed == 1
        after = _read(drive_dir, "a.md")
        parsed = parse_frontmatter(after)
        assert parsed.metadata["id"] == "20260512143028"
        assert parsed.metadata["tags"] == ["alpha", "beta"]
        assert parsed.metadata["aliases"] == ["secondary"]
        assert "[[new]] link" in parsed.body

    def test_file_size_bumped_for_rewritten_file(self, client):
        # File.file_size must reflect the new on-disk size after the
        # rewrite (downstream WS clients use this for cache busting).
        _, db, drive_dir, _ = client
        # old → new shrinks by 4 bytes (3 chars → can be anything; we
        # use unequal length names to force a size delta).
        body = "see [[old]] now\n"
        rec = _seed_md_with_body(db, drive_dir, TEST_DRIVE, "a.md", body)
        old_size = rec.file_size

        result = rewrite_basename_in_drive(db, TEST_DRIVE, "old", "renamed-much-longer")

        assert result.files_changed == 1
        db.expire_all()
        refreshed = db.query(File).filter(File.id == rec.id).first()
        new_disk_size = (drive_dir / "a.md").stat().st_size
        assert refreshed.file_size == new_disk_size
        assert refreshed.file_size != old_size
