"""Scanner move-detection hook → wiki-link rewrite.

Spec: docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md
§3.7 / §4 Phase D.

The scanner detects out-of-band renames via the hash-based move
detection (head256KB + tail256KB + size). When that detection fires
on a ``.md`` file and the basename changes, the scanner must invoke
``rewrite_basename_in_drive`` so that other ``.md`` files referencing
the old basename get rewritten.

Discipline:

* Trigger condition is **basename change**, not just file_path change.
  A pure folder move (basename unchanged) MUST NOT call the helper.
* Non-``.md`` moves never call the helper.
* The rewrite happens after ``moved_ids.append(candidate.id)`` in
  ``_scan_and_register`` so the failure-isolation rule from §3.7
  applies (a rewrite exception does not undo the move).
* Bulk scans with multiple .md renames invoke the helper per rename.

RED at the moment: the hook does not exist.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.models import File
from app.services.hash import HASH_CHUNK_SIZE
from app.services.scanner import _scan_and_register
from tests.conftest import TEST_DRIVE


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_md(path: Path, body: str) -> None:
    """Write a .md whose head + tail bytes are large enough that the
    hash-based mover engages.

    The hash function reads up to ``HASH_CHUNK_SIZE`` from each end of
    the file. We embed the body in BOTH the head and tail windows so
    distinct bodies produce distinct hashes; mere padding around the
    body would leave head/tail bytes identical across files.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    pad = b"P" * HASH_CHUNK_SIZE
    body_bytes = body.encode("utf-8")
    full = body_bytes + pad + body_bytes + pad + body_bytes
    path.write_bytes(full)


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def _initial_scan(db, drive_dir) -> dict[str, str]:
    """Run the first scan and return {file_path → file_id}."""
    _scan_and_register(db, TEST_DRIVE)
    db.expire_all()
    return {f.file_path: f.id for f in db.query(File).all()}


# ---------------------------------------------------------------------------
# Move detection + basename change → rewrite fires
# ---------------------------------------------------------------------------

class TestScannerMoveRewritesMd:
    def test_simple_rename_md_triggers_rewrite(self, client, monkeypatch):
        c, db, drive_dir, _ = client
        # Seed: note.md + a sibling ref.md that points to it.
        _write_md(drive_dir / "note.md", "self body uniqueAAA\n")
        # ref.md has small body but with a distinct hash from note.md.
        _write_md(drive_dir / "ref.md", "ref body uniqueBBB see [[note]]\n")

        ids = _initial_scan(db, drive_dir)
        original_id = ids["note.md"]

        # OOB rename on disk.
        (drive_dir / "note.md").rename(drive_dir / "renamed.md")

        # Spy on the rewrite helper.
        import app.services.markdown_relations as mr
        calls: list[tuple[str, str, str]] = []

        def spy(db, drive, old, new):
            calls.append((drive, old, new))
            from app.services.markdown_relations import RewriteResult
            return RewriteResult(0, 0, 0)

        monkeypatch.setattr(mr, "rewrite_basename_in_drive", spy, raising=False)

        result = _scan_and_register(db, TEST_DRIVE)

        # Move detected.
        assert result["moved"] == 1
        db.expire_all()
        moved_row = db.query(File).filter(File.id == original_id).first()
        assert moved_row.file_path == "renamed.md"
        # Helper called with old / new stems.
        assert calls == [(TEST_DRIVE, "note", "renamed")]

    def test_folder_only_move_does_not_call_rewrite(self, client, monkeypatch):
        # Move from src/note.md → dst/note.md (basename unchanged):
        # rewrite must not run.
        c, db, drive_dir, _ = client
        _write_md(drive_dir / "src" / "note.md", "uniqueAAA self body\n")

        _initial_scan(db, drive_dir)

        # OOB move (preserves basename).
        (drive_dir / "dst").mkdir(parents=True, exist_ok=True)
        (drive_dir / "src" / "note.md").rename(drive_dir / "dst" / "note.md")

        import app.services.markdown_relations as mr
        calls: list = []

        def spy(db, drive, old, new):
            calls.append((drive, old, new))
            from app.services.markdown_relations import RewriteResult
            return RewriteResult(0, 0, 0)

        monkeypatch.setattr(mr, "rewrite_basename_in_drive", spy, raising=False)

        result = _scan_and_register(db, TEST_DRIVE)
        assert result["moved"] == 1
        # No call: basename unchanged.
        assert calls == []

    def test_rename_combined_with_folder_move_triggers_rewrite(self, client, monkeypatch):
        c, db, drive_dir, _ = client
        _write_md(drive_dir / "src" / "old.md", "uniqueXYZ body\n")
        _initial_scan(db, drive_dir)

        (drive_dir / "dst").mkdir(parents=True, exist_ok=True)
        (drive_dir / "src" / "old.md").rename(drive_dir / "dst" / "new.md")

        import app.services.markdown_relations as mr
        calls: list = []

        def spy(db, drive, old, new):
            calls.append((drive, old, new))
            from app.services.markdown_relations import RewriteResult
            return RewriteResult(0, 0, 0)

        monkeypatch.setattr(mr, "rewrite_basename_in_drive", spy, raising=False)

        result = _scan_and_register(db, TEST_DRIVE)
        assert result["moved"] == 1
        assert calls == [(TEST_DRIVE, "old", "new")]


# ---------------------------------------------------------------------------
# Non-MD moves: rewrite must not fire
# ---------------------------------------------------------------------------

class TestScannerNonMdMoves:
    def test_non_md_rename_does_not_call_rewrite(self, client, monkeypatch):
        c, db, drive_dir, _ = client
        # Use a fixture-free path so the file is portable.
        pad = b"Z" * HASH_CHUNK_SIZE
        (drive_dir / "video.bin").write_bytes(pad + b"unique-video-data" + pad)
        _initial_scan(db, drive_dir)

        (drive_dir / "video.bin").rename(drive_dir / "clip.bin")

        import app.services.markdown_relations as mr
        calls: list = []

        def spy(db, drive, old, new):
            calls.append((drive, old, new))
            from app.services.markdown_relations import RewriteResult
            return RewriteResult(0, 0, 0)

        monkeypatch.setattr(mr, "rewrite_basename_in_drive", spy, raising=False)

        result = _scan_and_register(db, TEST_DRIVE)
        assert result["moved"] == 1
        # No call: non-.md.
        assert calls == []


# ---------------------------------------------------------------------------
# Bulk pass: multiple .md renames in one scan
# ---------------------------------------------------------------------------

class TestScannerBulkMdRenames:
    def test_multiple_md_renames_each_call_rewrite(self, client, monkeypatch):
        c, db, drive_dir, _ = client
        # Three .md files with distinct contents so move detection
        # matches each one unambiguously.
        _write_md(drive_dir / "a.md", "AAA distinct body\n")
        _write_md(drive_dir / "b.md", "BBB distinct body\n")
        _write_md(drive_dir / "c.md", "CCC distinct body\n")
        _initial_scan(db, drive_dir)

        (drive_dir / "a.md").rename(drive_dir / "a_renamed.md")
        (drive_dir / "b.md").rename(drive_dir / "b_renamed.md")
        (drive_dir / "c.md").rename(drive_dir / "c_renamed.md")

        import app.services.markdown_relations as mr
        calls: list = []

        def spy(db, drive, old, new):
            calls.append((old, new))
            from app.services.markdown_relations import RewriteResult
            return RewriteResult(0, 0, 0)

        monkeypatch.setattr(mr, "rewrite_basename_in_drive", spy, raising=False)

        result = _scan_and_register(db, TEST_DRIVE)
        assert result["moved"] == 3
        # Each rename produces a call with its own stem pair.
        assert sorted(calls) == [
            ("a", "a_renamed"),
            ("b", "b_renamed"),
            ("c", "c_renamed"),
        ]


# ---------------------------------------------------------------------------
# End-to-end: scanner runs the rewrite and the sibling file is updated
# ---------------------------------------------------------------------------

class TestScannerEndToEndRewrite:
    def test_sibling_md_actually_rewritten_via_scanner_path(self, client):
        # No monkeypatch: exercise the full code path.
        c, db, drive_dir, _ = client
        _write_md(drive_dir / "note.md", "AAA uniqueself body\n")
        # Sibling is small / does not need to match move detection.
        sibling_body = "see [[note]] for context\n"
        (drive_dir / "ref.md").write_text(sibling_body, encoding="utf-8")
        _initial_scan(db, drive_dir)

        (drive_dir / "note.md").rename(drive_dir / "renamed.md")
        result = _scan_and_register(db, TEST_DRIVE)

        assert result["moved"] == 1
        # Sibling rewritten on disk.
        assert _read(drive_dir / "ref.md") == "see [[renamed]] for context\n"
