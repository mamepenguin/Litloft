"""Acceptance tests for SPEC-CORE-137: ``files.modified_at`` holds the file's
``st_mtime`` in whole seconds.

Every insert and every byte rewrite sets it from the file's own stat (I2), the
scan fills and corrects it for every row it walks (I1), a write of it alone
moves neither ``updated_at`` nor the scan's ``updated`` count (I3), the core's
``.md`` id stamp keeps a note's time (I14), and the migration only adds the
column (I19).
"""

from __future__ import annotations

import hashlib
import io
import os
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

from app.models import File
from app.services.scanner import _scan_and_register, register_single_file
from tests.conftest import TEST_DRIVE

OLD = 1500000000
OLD_FRACTION = 1500000000.75
LATER = 1600000000


def _epoch(value: datetime | None) -> int | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    assert value.microsecond == 0, value
    return int(value.timestamp())


def _naive(epoch: int) -> datetime:
    return datetime.fromtimestamp(epoch, UTC).replace(tzinfo=None)


def _whole(path: Path) -> int:
    return int(path.stat().st_mtime)


def _row(db, file_id: str) -> File:
    db.expire_all()
    return db.query(File).filter(File.id == file_id).one()


def _row_at(db, file_path: str) -> File:
    db.expire_all()
    return db.query(File).filter(File.drive == TEST_DRIVE, File.file_path == file_path).one()


def _touch(path: Path, mtime: float) -> None:
    os.utime(path, (mtime, mtime))


def _seed_row(db, drive_dir: Path, rel: str, body: bytes, *, mime: str = "text/markdown", **extra) -> File:
    full = drive_dir / rel
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_bytes(body)
    folder, _, name = rel.rpartition("/")
    row = File(
        filename=name,
        title=name,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=rel,
        file_size=len(body),
        file_type="document" if mime.startswith("text/") else "other",
        mime_type=mime,
        **extra,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _set_modified(db, file_id: str, value: datetime | None) -> None:
    db.execute(text("UPDATE files SET modified_at = :v WHERE id = :id"), {"v": value, "id": file_id})
    db.commit()


def _upload(c, name: str, data: bytes, folder: str = ""):
    init = c.post(
        f"/api/drives/{TEST_DRIVE}/upload/init",
        json={"filename": name, "file_size": len(data), "folder_path": folder, "chunk_size": len(data)},
    )
    assert init.status_code == 200, init.text
    upload_id = init.json()["upload_id"]
    chunk = c.post(
        f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
        data={"chunk_index": "0"},
        files={"chunk": ("chunk", io.BytesIO(data), "application/octet-stream")},
    )
    assert chunk.status_code == 200, chunk.text
    done = c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
    assert done.status_code == 200, done.text
    return done.json()


class TestInsertPaths:
    """SPEC-CORE-137 step 2, I2: an inserted row holds the new file's whole-second mtime."""

    def test_spec_core_137_i2_the_scan_inserts_with_the_files_mtime(self, client):
        _c, db, drive_dir, _ = client
        path = drive_dir / "clip.bin"
        path.write_bytes(b"x" * 100)
        _touch(path, OLD_FRACTION)

        _scan_and_register(db, TEST_DRIVE)
        db.commit()

        assert _epoch(_row_at(db, "clip.bin").modified_at) == OLD

    def test_spec_core_137_2_a_future_mtime_is_stored_as_the_filesystem_says(self, client):
        _c, db, drive_dir, _ = client
        path = drive_dir / "camera.bin"
        path.write_bytes(b"c" * 10)
        _touch(path, 4102444800.9)

        _scan_and_register(db, TEST_DRIVE)
        db.commit()

        assert _epoch(_row_at(db, "camera.bin").modified_at) == 4102444800

    def test_spec_core_137_i2_register_single_file_inserts_with_the_files_mtime(self, client):
        _c, db, drive_dir, _ = client
        path = drive_dir / "clip.bin"
        path.write_bytes(b"x" * 100)
        _touch(path, OLD_FRACTION)

        file_id = register_single_file(db, TEST_DRIVE, path)
        db.commit()

        assert _epoch(_row(db, file_id).modified_at) == OLD

    def test_spec_core_137_i2_the_upload_finaliser_sets_the_landed_files_mtime(self, client):
        c, db, drive_dir, _ = client

        body = _upload(c, "uploaded.bin", b"y" * 300)

        row = _row(db, body["id"])
        assert _epoch(row.modified_at) == _whole(drive_dir / "uploaded.bin")

    def test_spec_core_137_i2_the_create_file_endpoint_sets_the_new_files_mtime(self, client):
        c, db, drive_dir, _ = client

        res = c.post(f"/api/drives/{TEST_DRIVE}/files", json={"path": "notes/new.md", "content": "hello\n"})
        assert res.status_code in (200, 201), res.text

        row = _row(db, res.json()["id"])
        assert _epoch(row.modified_at) == _whole(drive_dir / "notes/new.md")

    def test_spec_core_137_i2_a_copy_takes_its_own_stat_not_the_source_rows_value(self, client):
        c, db, drive_dir, _ = client
        source = _seed_row(db, drive_dir, "src/a.bin", b"z" * 64, mime="application/octet-stream")
        _touch(drive_dir / "src/a.bin", OLD_FRACTION)
        _set_modified(db, source.id, _naive(LATER))
        (drive_dir / "dst").mkdir()

        res = c.post(f"/api/files/{source.id}/copy", json={"target_folder_path": "dst"})
        assert res.status_code == 200, res.text

        copied = _row(db, res.json()["id"])
        assert _epoch(copied.modified_at) == _whole(drive_dir / "dst/a.bin")
        assert _epoch(copied.modified_at) == OLD
        assert _epoch(_row(db, source.id).modified_at) == LATER


class TestRewritePaths:
    """SPEC-CORE-137 step 3, I2: a byte rewrite stores the new whole-second mtime."""

    def test_spec_core_137_i2_a_content_put_stores_the_new_mtime(self, client):
        c, db, drive_dir, _ = client
        row = _seed_row(db, drive_dir, "notes/memo.md", b"initial\n")
        _touch(drive_dir / "notes/memo.md", OLD)
        _set_modified(db, row.id, _naive(OLD))

        res = c.put(
            f"/api/files/{row.id}/content",
            content=b"updated content\n",
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{hashlib.sha256(b"initial\n").hexdigest()}"',
            },
        )
        assert res.status_code == 200, res.text

        stored = _epoch(_row(db, row.id).modified_at)
        assert stored == _whole(drive_dir / "notes/memo.md")
        assert stored != OLD

    def test_spec_core_137_i2_an_upload_reviving_a_missing_row_stores_the_new_mtime(self, client):
        c, db, drive_dir, _ = client
        missing = File(
            filename="talk.bin", title="talk", drive=TEST_DRIVE, folder_path="", file_path="talk.bin",
            file_size=10, file_type="other", mime_type="application/octet-stream",
            missing_since=datetime.now(UTC), modified_at=_naive(OLD),
        )
        db.add(missing)
        db.commit()

        body = _upload(c, "talk.bin", b"w" * 200)

        assert body["id"] == missing.id
        stored = _epoch(_row(db, missing.id).modified_at)
        assert stored == _whole(drive_dir / "talk.bin")
        assert stored != OLD

    def test_spec_core_137_i2_an_upload_over_an_active_row_whose_file_vanished_stores_the_new_mtime(self, client):
        c, db, drive_dir, _ = client
        row = _seed_row(db, drive_dir, "gone.bin", b"v" * 10, mime="application/octet-stream")
        _set_modified(db, row.id, _naive(OLD))
        (drive_dir / "gone.bin").unlink()

        body = _upload(c, "gone.bin", b"u" * 50)

        stored = _epoch(_row(db, body["id"]).modified_at)
        assert stored == _whole(drive_dir / "gone.bin")
        assert stored != OLD

    def test_spec_core_137_i2_create_file_reviving_a_missing_row_stores_the_new_mtime(self, client):
        c, db, drive_dir, _ = client
        missing = File(
            filename="back.md", title="back", drive=TEST_DRIVE, folder_path="notes", file_path="notes/back.md",
            file_size=3, file_type="document", mime_type="text/markdown",
            missing_since=datetime.now(UTC), modified_at=_naive(OLD),
        )
        db.add(missing)
        db.commit()
        (drive_dir / "notes").mkdir()

        res = c.post(f"/api/drives/{TEST_DRIVE}/files", json={"path": "notes/back.md", "content": "again\n"})
        assert res.status_code in (200, 201), res.text

        stored = _epoch(_row(db, missing.id).modified_at)
        assert stored == _whole(drive_dir / "notes/back.md")
        assert stored != OLD

    def test_spec_core_137_i14_a_link_rewrite_on_rename_stores_each_rewritten_notes_mtime(self, client):
        c, db, drive_dir, _ = client
        target = _seed_row(db, drive_dir, "note.md", b"# Note\n")
        linking = _seed_row(db, drive_dir, "ref.md", b"see [[note]]\n")
        _touch(drive_dir / "ref.md", OLD)
        _set_modified(db, linking.id, _naive(OLD))

        res = c.put(f"/api/files/{target.id}/rename", json={"new_filename": "renamed.md"})
        assert res.status_code == 200, res.text

        assert (drive_dir / "ref.md").read_text() == "see [[renamed]]\n"
        stored = _epoch(_row(db, linking.id).modified_at)
        assert stored == _whole(drive_dir / "ref.md")
        assert stored != OLD


class TestMdIdStampKeepsTheTime:
    """SPEC-CORE-137 step 3a, I14: the core's id stamp is not a modification."""

    def test_spec_core_137_i14_the_scan_keeps_an_old_notes_mtime(self, client):
        _c, db, drive_dir, _ = client
        note = drive_dir / "old.md"
        note.write_text("---\ntags:\n  - x\n---\n\nbody\n")
        before = note.read_bytes()
        _touch(note, OLD)

        _scan_and_register(db, TEST_DRIVE)
        db.commit()

        assert note.read_bytes() != before
        assert int(note.stat().st_mtime) == OLD
        assert _epoch(_row_at(db, "old.md").modified_at) == OLD

    def test_spec_core_137_i14_register_single_file_keeps_an_old_notes_mtime(self, client):
        _c, db, drive_dir, _ = client
        note = drive_dir / "old.md"
        note.write_text("---\ntags:\n  - x\n---\n\nbody\n")
        before = note.read_bytes()
        _touch(note, OLD)

        file_id = register_single_file(db, TEST_DRIVE, note)
        db.commit()

        assert note.read_bytes() != before
        assert int(note.stat().st_mtime) == OLD
        assert _epoch(_row(db, file_id).modified_at) == OLD


    def test_spec_core_137_3a_when_the_times_cannot_be_put_back_the_next_scan_records_the_new_mtime(
        self, client, monkeypatch
    ):
        _c, db, drive_dir, _ = client
        note = drive_dir / "old.md"
        note.write_text("---\ntags:\n  - x\n---\n\nbody\n")
        before = note.read_bytes()
        _touch(note, OLD)

        def refuse(*_args, **_kwargs):
            raise PermissionError("utime refused")

        with monkeypatch.context() as patch:
            patch.setattr(os, "utime", refuse)
            _scan_and_register(db, TEST_DRIVE)
            db.commit()
        assert note.read_bytes() != before
        _scan_and_register(db, TEST_DRIVE)
        db.commit()

        stored = _epoch(_row_at(db, "old.md").modified_at)
        assert stored == _whole(note)
        assert stored != OLD


class TestScanFillsAndCorrects:
    """SPEC-CORE-137 step 4, I1: every walked row with a file ends at its stat."""

    def _scanned(self, db, drive_dir: Path, name: str, body: bytes = b"a" * 100) -> File:
        path = drive_dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        _touch(path, OLD)
        _scan_and_register(db, TEST_DRIVE)
        db.commit()
        return _row_at(db, name)

    def test_spec_core_137_i1_a_null_value_is_filled(self, client):
        _c, db, drive_dir, _ = client
        row = self._scanned(db, drive_dir, "a.bin")
        _set_modified(db, row.id, None)

        _scan_and_register(db, TEST_DRIVE)
        db.commit()

        assert _epoch(_row(db, row.id).modified_at) == OLD

    def test_spec_core_137_i1_an_outside_edit_of_the_same_size_is_picked_up(self, client):
        _c, db, drive_dir, _ = client
        row = self._scanned(db, drive_dir, "a.bin", b"a" * 100)
        (drive_dir / "a.bin").write_bytes(b"b" * 100)
        _touch(drive_dir / "a.bin", LATER + 0.4)

        _scan_and_register(db, TEST_DRIVE)
        db.commit()

        assert _epoch(_row(db, row.id).modified_at) == LATER

    def test_spec_core_137_i1_a_trashed_row_is_corrected(self, client):
        c, db, drive_dir, _ = client
        row = self._scanned(db, drive_dir, "a.bin")
        assert c.delete(f"/api/files/{row.id}").status_code in (200, 204)
        _set_modified(db, row.id, None)
        _touch(drive_dir / "a.bin", LATER)

        _scan_and_register(db, TEST_DRIVE)
        db.commit()

        trashed = _row(db, row.id)
        assert trashed.deleted_at is not None
        assert _epoch(trashed.modified_at) == LATER

    def test_spec_core_137_i1_a_missing_row_that_reappears_is_set(self, client):
        _c, db, drive_dir, _ = client
        row = self._scanned(db, drive_dir, "a.bin")
        hidden = drive_dir.parent / "a.bin.away"
        (drive_dir / "a.bin").rename(hidden)
        _scan_and_register(db, TEST_DRIVE)
        db.commit()
        assert _row(db, row.id).missing_since is not None

        hidden.rename(drive_dir / "a.bin")
        _touch(drive_dir / "a.bin", LATER)
        _scan_and_register(db, TEST_DRIVE)
        db.commit()

        back = _row(db, row.id)
        assert back.missing_since is None
        assert _epoch(back.modified_at) == LATER

    def test_spec_core_137_i1_a_row_matched_as_a_move_is_set(self, client):
        _c, db, drive_dir, _ = client
        from app.services.hash import HASH_CHUNK_SIZE

        body = b"H" * HASH_CHUNK_SIZE + b"m" * 400 + b"T" * HASH_CHUNK_SIZE
        row = self._scanned(db, drive_dir, "from/big.bin", body)
        _set_modified(db, row.id, None)
        (drive_dir / "to").mkdir()
        (drive_dir / "from/big.bin").rename(drive_dir / "to/big.bin")
        _touch(drive_dir / "to/big.bin", LATER)

        result = _scan_and_register(db, TEST_DRIVE)
        db.commit()

        moved = _row(db, row.id)
        assert result["moved"] == 1
        assert moved.file_path == "to/big.bin"
        assert _epoch(moved.modified_at) == LATER


class TestModifiedOnlyWrite:
    """SPEC-CORE-137 step 5, I3: a write of modified_at alone is silent."""

    def test_spec_core_137_i3_updated_at_and_the_updated_count_stay(self, client):
        _c, db, drive_dir, _ = client
        path = drive_dir / "a.bin"
        path.write_bytes(b"a" * 100)
        _touch(path, OLD)
        _scan_and_register(db, TEST_DRIVE)
        db.commit()
        row = _row_at(db, "a.bin")
        updated_before = row.updated_at
        _touch(path, LATER)

        result = _scan_and_register(db, TEST_DRIVE)
        db.commit()

        after = _row(db, row.id)
        assert _epoch(after.modified_at) == LATER
        assert after.updated_at == updated_before
        assert result.get("updated", 0) == 0

    def test_spec_core_137_i3_the_upgrade_backfill_moves_no_updated_at(self, client):
        _c, db, drive_dir, _ = client
        path = drive_dir / "a.bin"
        path.write_bytes(b"a" * 100)
        _touch(path, OLD)
        _scan_and_register(db, TEST_DRIVE)
        db.commit()
        row = _row_at(db, "a.bin")
        _set_modified(db, row.id, None)
        updated_before = _row(db, row.id).updated_at

        result = _scan_and_register(db, TEST_DRIVE)
        db.commit()

        after = _row(db, row.id)
        assert _epoch(after.modified_at) == OLD
        assert after.updated_at == updated_before
        assert result.get("updated", 0) == 0


class TestLifecycleKeepsTheValue:
    """SPEC-CORE-137 step 6, I2: rename, move, trash and restore leave modified_at."""

    def test_spec_core_137_i2_rename_trash_and_restore_keep_the_stored_value(self, client):
        c, db, drive_dir, _ = client
        row = _seed_row(db, drive_dir, "keep.bin", b"k" * 20, mime="application/octet-stream")
        _touch(drive_dir / "keep.bin", OLD)
        _set_modified(db, row.id, _naive(LATER))

        assert c.put(f"/api/files/{row.id}/rename", json={"new_filename": "kept.bin"}).status_code == 200
        assert _epoch(_row(db, row.id).modified_at) == LATER

        assert c.delete(f"/api/files/{row.id}").status_code in (200, 204)
        assert _epoch(_row(db, row.id).modified_at) == LATER

        assert c.post(f"/api/files/{row.id}/restore").status_code == 200
        assert _epoch(_row(db, row.id).modified_at) == LATER




def _engine(tmp_path: Path):
    return create_engine(
        f"sqlite:///{tmp_path / 'migration.db'}",
        connect_args={"check_same_thread": False},
    )


def _columns(engine) -> dict[str, dict]:
    return {c["name"]: c for c in inspect(engine).get_columns("files")}


def _db_without_the_column(tmp_path: Path):
    from sqlalchemy.orm import Session

    from app.database import Base

    engine = _engine(tmp_path)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        session.add_all([
            File(
                id="aaaaaaaaaaaa", filename="a.mp4", title="A", drive="d", folder_path="",
                file_path="a.mp4", file_size=10, file_type="video", mime_type="video/mp4",
                created_at=datetime(2020, 1, 1), updated_at=datetime(2021, 1, 1),
            ),
            File(
                id="bbbbbbbbbbbb", filename="b.md", title="B", drive="d", folder_path="notes",
                file_path="notes/b.md", file_size=3, file_type="document", mime_type="text/markdown",
                created_at=datetime(2022, 1, 1),
            ),
        ])
        session.commit()
    with engine.begin() as conn:
        if "modified_at" in _columns(engine):
            conn.execute(text("ALTER TABLE files DROP COLUMN modified_at"))
    assert "modified_at" not in _columns(engine)
    return engine


def _rows(engine) -> list[dict]:
    with engine.connect() as conn:
        return [dict(r._mapping) for r in conn.execute(text("SELECT * FROM files ORDER BY id"))]


@pytest.mark.usefixtures("private_data_dir")
class TestMigration:
    """SPEC-CORE-137 step 1, I19: the migration only adds files.modified_at."""

    def test_spec_core_137_i19_adds_a_nullable_column_and_keeps_every_other_value(self, tmp_path):
        from app.database import _migrate

        engine = _db_without_the_column(tmp_path)
        before = _rows(engine)

        _migrate(engine)

        cols = _columns(engine)
        assert "modified_at" in cols
        assert cols["modified_at"]["nullable"] is True
        after = _rows(engine)
        assert [row["modified_at"] for row in after] == [None, None]
        assert [{k: v for k, v in row.items() if k != "modified_at"} for row in after] == before

    def test_spec_core_137_i19_running_it_again_changes_nothing(self, tmp_path):
        from app.database import _migrate

        engine = _db_without_the_column(tmp_path)
        _migrate(engine)
        once = _rows(engine)

        _migrate(engine)

        assert _rows(engine) == once
        assert "modified_at" in _columns(engine)
