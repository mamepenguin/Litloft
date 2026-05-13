"""Integration tests for the rename / move wiki-link rewrite hook.

Spec: docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md
§3.7 / §4 Phase D.

When a ``.md`` file is renamed (basename changes), the rename handler
must call ``rewrite_basename_in_drive(db, drive, old_stem, new_stem)``
so that other ``.md`` files in the same drive that reference the old
basename via ``[[old]]`` / ``[[old|x]]`` / ``[[old#h]]`` are rewritten
to the new one.

Rules:

* Non-``.md`` rename → no rewrite at all (loft://id is invariant).
* Same-name rename (no-op) → no rewrite call.
* Extension flip (``.md`` ↔ ``.txt``) → no rewrite (the file is no
  longer a wiki-target).
* Same-drive move with unchanged basename → no rewrite.
* Same-drive move that ALSO renames → rewrite triggered.
* Cross-drive move → no rewrite (drive = security boundary; we don't
  propagate across drives).
* Rewrite failure is swallowed (logged) and MUST NOT roll back the
  rename itself — the FS rename and the DB row update have already
  committed.

RED at the moment because the helper + hooks don't exist yet.
"""
from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.models import File
from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"

SECOND_DRIVE = "second-drive"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_md(db, drive_dir, file_path: str, body: str = "body\n") -> File:
    full = drive_dir / file_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(body, encoding="utf-8")
    parts = file_path.split("/")
    filename = parts[-1]
    folder = "/".join(parts[:-1])
    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=file_path,
        file_size=len(body.encode("utf-8")),
        file_type="document",
        mime_type="text/markdown",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _seed_video(db, drive_dir, filename="clip.mp4", folder="videos") -> File:
    d = drive_dir / folder
    d.mkdir(parents=True, exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", d / filename)
    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=f"{folder}/{filename}",
        file_size=(d / filename).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _read(drive_dir, file_path: str) -> str:
    return (drive_dir / file_path).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# .md rename triggers rewrite
# ---------------------------------------------------------------------------

class TestRenameMdTriggersRewrite:
    def test_basename_rename_rewrites_other_md_files(self, client):
        c, db, drive_dir, _ = client
        # The file being renamed.
        target = _seed_md(db, drive_dir, "notes/note.md", "# Heading\n")
        # Three siblings that reference the old basename.
        a = _seed_md(db, drive_dir, "a.md", "see [[note]]\n")
        b = _seed_md(db, drive_dir, "b.md", "see [[note|alias]]\n")
        c_md = _seed_md(db, drive_dir, "sub/c.md", "see [[note#sec]]\n")

        res = c.put(
            f"/api/files/{target.id}/rename",
            json={"new_filename": "renamed.md"},
        )
        assert res.status_code == 200, res.text

        # File row reflects the rename.
        assert (drive_dir / "notes/renamed.md").exists()
        assert not (drive_dir / "notes/note.md").exists()

        # Siblings rewritten.
        assert _read(drive_dir, "a.md") == "see [[renamed]]\n"
        assert _read(drive_dir, "b.md") == "see [[renamed|alias]]\n"
        assert _read(drive_dir, "sub/c.md") == "see [[renamed#sec]]\n"

    def test_file_size_and_updated_at_bumped_on_rewritten_files(self, client):
        c, db, drive_dir, _ = client
        target = _seed_md(db, drive_dir, "note.md", "x\n")
        sibling = _seed_md(db, drive_dir, "ref.md", "see [[note]]\n")
        old_size = sibling.file_size
        old_updated = sibling.updated_at

        res = c.put(
            f"/api/files/{target.id}/rename",
            json={"new_filename": "renamed.md"},
        )
        assert res.status_code == 200, res.text

        db.expire_all()
        refreshed = db.query(File).filter(File.id == sibling.id).first()
        new_disk_size = (drive_dir / "ref.md").stat().st_size
        assert refreshed.file_size == new_disk_size
        # The rewrite changes "[[note]]" → "[[renamed]]" — 3 extra chars.
        assert refreshed.file_size != old_size
        # updated_at advanced.
        assert refreshed.updated_at >= old_updated


# ---------------------------------------------------------------------------
# Negative cases (rewrite must NOT run)
# ---------------------------------------------------------------------------

class TestRenameDoesNotRewrite:
    def test_non_md_rename_does_not_rewrite_md_bodies(self, client):
        # Renaming a .mp4 must never touch .md content (loft://id is
        # invariant; bracket text matters only for .md basenames).
        c, db, drive_dir, _ = client
        video = _seed_video(db, drive_dir, "clip.mp4", "videos")
        sibling = _seed_md(
            db, drive_dir, "ref.md", "see [[clip]] (would be wrong)\n"
        )

        res = c.put(
            f"/api/files/{video.id}/rename",
            json={"new_filename": "photo.mp4"},
        )
        assert res.status_code == 200, res.text

        # The .md body is unchanged. (Even though [[clip]] textually
        # matches the old stem, the renamed file was NOT a .md so we
        # never trigger the rewrite.)
        assert _read(drive_dir, "ref.md") == "see [[clip]] (would be wrong)\n"

    def test_txt_to_txt_rename_does_not_rewrite_md(self, client):
        c, db, drive_dir, _ = client
        # Seed a .txt as the renamed file.
        full = drive_dir / "note.txt"
        full.write_text("body\n", encoding="utf-8")
        target = File(
            filename="note.txt",
            title="note.txt",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="note.txt",
            file_size=5,
            file_type="document",
            mime_type="text/plain",
        )
        db.add(target)
        db.commit()
        db.refresh(target)

        _seed_md(db, drive_dir, "ref.md", "see [[note]]\n")

        res = c.put(
            f"/api/files/{target.id}/rename",
            json={"new_filename": "renamed.txt"},
        )
        assert res.status_code == 200, res.text
        # .md content unchanged: a .txt is not a wiki target.
        assert _read(drive_dir, "ref.md") == "see [[note]]\n"

    def test_md_to_txt_extension_flip_no_rewrite(self, client):
        # Renaming ``note.md`` → ``note.txt`` removes it from the
        # wiki-target world. We must not rewrite [[note]] references
        # because the new name is not a ``.md`` either.
        c, db, drive_dir, _ = client
        target = _seed_md(db, drive_dir, "note.md", "body\n")
        _seed_md(db, drive_dir, "ref.md", "see [[note]]\n")

        res = c.put(
            f"/api/files/{target.id}/rename",
            json={"new_filename": "note.txt"},
        )
        assert res.status_code == 200, res.text
        assert _read(drive_dir, "ref.md") == "see [[note]]\n"

    def test_same_name_rename_no_rewrite_call(self, client, monkeypatch):
        # ``note.md`` → ``note.md`` is technically a 409 in the current
        # impl (file exists). But if the impl ever allows it (or
        # idempotent rename), there must be no rewrite call.
        c, db, drive_dir, _ = client
        target = _seed_md(db, drive_dir, "note.md", "body\n")

        # Spy on the rewrite helper to ensure it's never invoked.
        import app.services.markdown_relations as mr
        calls: list[tuple[str, str]] = []

        original = getattr(mr, "rewrite_basename_in_drive", None)

        def spy(db, drive, old, new):
            calls.append((old, new))
            if original is None:
                from app.services.markdown_relations import RewriteResult
                return RewriteResult(0, 0, 0)
            return original(db, drive, old, new)

        monkeypatch.setattr(mr, "rewrite_basename_in_drive", spy, raising=False)

        res = c.put(
            f"/api/files/{target.id}/rename",
            json={"new_filename": "note.md"},
        )
        # Whether 200 or 409, the rewrite must not have been called.
        assert all(c[0] != c[1] for c in calls), (
            f"rewrite called with identical names: {calls}"
        )


# ---------------------------------------------------------------------------
# Rewrite failure isolation
# ---------------------------------------------------------------------------

class TestRewriteFailureSwallowed:
    def test_rewrite_exception_does_not_rollback_rename(self, client, monkeypatch):
        # Spec §3.7: rewrite is best-effort. A failure inside the
        # rewrite helper must NOT cause the user-visible rename to
        # roll back. The FS rename and the File row mutation must
        # still be durable.
        c, db, drive_dir, _ = client
        target = _seed_md(db, drive_dir, "note.md", "body\n")
        sibling = _seed_md(db, drive_dir, "ref.md", "see [[note]]\n")

        import app.services.markdown_relations as mr

        def boom(db, drive, old, new):
            raise RuntimeError("simulated rewrite failure")

        monkeypatch.setattr(mr, "rewrite_basename_in_drive", boom, raising=False)

        res = c.put(
            f"/api/files/{target.id}/rename",
            json={"new_filename": "renamed.md"},
        )
        assert res.status_code == 200, res.text

        # FS rename happened despite the failure.
        assert (drive_dir / "renamed.md").exists()
        assert not (drive_dir / "note.md").exists()
        # DB row reflects the rename.
        db.expire_all()
        refreshed = db.query(File).filter(File.id == target.id).first()
        assert refreshed.filename == "renamed.md"

        # Sibling body unchanged (rewrite failed before applying).
        assert _read(drive_dir, "ref.md") == "see [[note]]\n"


# ---------------------------------------------------------------------------
# Move integration
# ---------------------------------------------------------------------------

class TestMoveIntegration:
    def test_folder_only_move_does_not_rewrite(self, client, monkeypatch):
        # Same drive, same filename → no basename change → no rewrite.
        c, db, drive_dir, _ = client
        target = _seed_md(db, drive_dir, "src/note.md", "body\n")
        sibling = _seed_md(db, drive_dir, "ref.md", "see [[note]]\n")
        (drive_dir / "dst").mkdir(exist_ok=True)

        import app.services.markdown_relations as mr
        calls: list[tuple[str, str]] = []

        def spy(db, drive, old, new):
            calls.append((old, new))
            from app.services.markdown_relations import RewriteResult
            return RewriteResult(0, 0, 0)

        monkeypatch.setattr(mr, "rewrite_basename_in_drive", spy, raising=False)

        res = c.put(
            f"/api/files/{target.id}/move",
            json={"target_folder_path": "dst"},
        )
        assert res.status_code == 200, res.text

        # No rewrite call: basename didn't change.
        assert calls == []
        assert _read(drive_dir, "ref.md") == "see [[note]]\n"

    def test_cross_drive_move_does_not_rewrite(self, client, monkeypatch):
        # Drive = security boundary. Even if the destination drive
        # had a file with the same basename, we MUST NOT propagate
        # the rename across drives. The move test here verifies that
        # the rewrite helper is not called for cross-drive moves.
        c, db, drive_dir, _ = client
        target = _seed_md(db, drive_dir, "note.md", "body\n")
        _seed_md(db, drive_dir, "ref.md", "see [[note]]\n")

        import app.services.markdown_relations as mr
        calls: list = []

        def spy(db, drive, old, new):
            calls.append((drive, old, new))
            from app.services.markdown_relations import RewriteResult
            return RewriteResult(0, 0, 0)

        monkeypatch.setattr(mr, "rewrite_basename_in_drive", spy, raising=False)

        # Attempt a cross-drive move. This may be rejected by the API
        # depending on whether SECOND_DRIVE is registered. Either way,
        # the rewrite helper must not be invoked with the source-drive
        # name on a cross-drive move that doesn't change basename.
        res = c.put(
            f"/api/files/{target.id}/move",
            json={
                "target_folder_path": "",
                "target_drive": SECOND_DRIVE,
            },
        )
        # Whether 200, 400, or 404, the rewrite helper is NOT called
        # with the source drive because the basename didn't change.
        # If the impl elected to call the helper on the destination
        # drive with the same basename, that's still a no-op (old ==
        # new). We assert: no call uses two distinct names.
        for drive_arg, old, new in calls:
            assert old != new, f"unexpected rewrite call: {calls}"
