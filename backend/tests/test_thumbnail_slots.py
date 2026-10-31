"""A thumbnail slot belongs to one file (SPEC-CORE-022, 023, 024)."""

import asyncio
import io
import json
import logging
import os
import shutil
import time
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app.config as config
import app.main as main
from app.main import app
from app.models import File
from app.services.filetype import classify
from app.services.scanner import _scan_and_register, register_single_file
from tests.conftest import TEST_DRIVE

FAKE_JPEG = b"\xff\xd8\xff\xe0fake-jpeg"


def _slot_rel(file_id: str) -> str:
    return f".by-id/{file_id}.jpg"


def _thumbs() -> Path:
    return config.THUMBNAILS_DIR


def _put_thumb(rel: str, data: bytes = FAKE_JPEG) -> Path:
    path = _thumbs() / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def _png(path: Path, color) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (64, 64), color).save(path)


def _seed(
    db,
    drive_dir,
    rel_path,
    *,
    file_id=None,
    thumb=None,
    drive=TEST_DRIVE,
    state="active",
    body=b"x" * 64,
):
    full = drive_dir / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    if state != "missing":
        full.write_bytes(body)
    folder, _, name = rel_path.rpartition("/")
    file_type, mime = classify(name)
    row = File(
        filename=name,
        title=Path(name).stem,
        drive=drive,
        folder_path=folder,
        file_path=rel_path,
        file_size=len(body),
        file_type=file_type,
        mime_type=mime,
        thumbnail_path=thumb,
    )
    if file_id:
        row.id = file_id
    if state == "missing":
        row.missing_since = datetime.now(UTC)
    elif state == "trash":
        row.deleted_at = datetime.now(UTC)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _restart():
    with TestClient(app):
        pass


def _fresh(db, file_id):
    db.expire_all()
    return db.get(File, file_id)


def _served(c, file_id) -> bytes:
    res = c.get(f"/api/files/{file_id}/thumbnail")
    assert res.status_code == 200
    return res.content


def _dominant_red(data: bytes) -> bool:
    r, g, b = Image.open(io.BytesIO(data)).convert("RGB").getpixel((16, 16))
    return r > 150 and b < 100


class TestSlotForm:
    def test_slot_rel_is_by_id_jpg(self):
        """SPEC-CORE-022"""
        from app.services.thumbnail import thumbnail_slot_rel

        assert thumbnail_slot_rel("abc123def456") == ".by-id/abc123def456.jpg"


class TestEachFileOwnsItsSlot:
    def test_same_stem_images_each_get_their_own_picture(self, client):
        """SPEC-CORE-022 I1"""
        c, db, drive_dir, _ = client
        _png(drive_dir / "a.png", (255, 0, 0))
        Image.new("RGB", (64, 64), (0, 0, 255)).save(drive_dir / "a.jpg")

        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()
        red = db.query(File).filter(File.file_path == "a.png").one()
        blue = db.query(File).filter(File.file_path == "a.jpg").one()

        assert red.thumbnail_path == _slot_rel(red.id)
        assert blue.thumbnail_path == _slot_rel(blue.id)
        assert _dominant_red(_served(c, red.id))
        assert not _dominant_red(_served(c, blue.id))

    def test_scan_registers_new_file_with_its_slot(self, client):
        """SPEC-CORE-022 I2"""
        c, db, drive_dir, _ = client
        _png(drive_dir / "one.png", (10, 200, 10))

        _scan_and_register(db, TEST_DRIVE)
        db.expire_all()
        row = db.query(File).one()

        assert row.thumbnail_path == _slot_rel(row.id)
        assert (_thumbs() / row.thumbnail_path).is_file()

    def test_register_single_file_uses_the_slot(self, client):
        """SPEC-CORE-022 I2"""
        c, db, drive_dir, _ = client
        _png(drive_dir / "single.png", (10, 200, 10))

        file_id = register_single_file(db, TEST_DRIVE, drive_dir / "single.png")
        db.commit()

        row = _fresh(db, file_id)
        assert row.thumbnail_path == _slot_rel(file_id)
        assert (_thumbs() / row.thumbnail_path).is_file()

    def test_failed_register_single_file_leaves_no_slot(self, client, monkeypatch):
        """SPEC-CORE-022 I17"""
        c, db, drive_dir, _ = client
        _png(drive_dir / "single.png", (10, 200, 10))

        real_add = db.add

        def failing_add(instance, *args, **kwargs):
            if isinstance(instance, File):
                raise RuntimeError("row cannot be added")
            return real_add(instance, *args, **kwargs)

        monkeypatch.setattr(db, "add", failing_add)

        with pytest.raises(RuntimeError):
            register_single_file(db, TEST_DRIVE, drive_dir / "single.png")

        assert [p for p in _thumbs().rglob("*") if p.is_file()] == []

    def test_uploaded_image_gets_its_slot(self, client):
        """SPEC-CORE-022 I2"""
        c, db, drive_dir, _ = client
        row = _upload_png(c, db, "up.png", (255, 0, 0))

        assert row.thumbnail_path == _slot_rel(row.id)
        assert _dominant_red(_served(c, row.id))


def _upload_png(c, db, name, color):
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), color).save(buf, format="PNG")
    payload = buf.getvalue()
    res = c.post(
        f"/api/drives/{TEST_DRIVE}/upload/init",
        json={
            "filename": name,
            "file_size": len(payload),
            "folder_path": "",
            "chunk_size": len(payload),
        },
    )
    assert res.status_code == 200
    upload_id = res.json()["upload_id"]
    c.post(
        f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
        data={"chunk_index": "0"},
        files={"chunk": ("chunk", io.BytesIO(payload), "image/png")},
    )
    done = c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
    assert done.status_code == 200
    db.expire_all()
    return db.get(File, done.json()["id"])


class TestUploadOverReusedRow:
    def _missing_image_row(self, c, db, drive_dir):
        row = _seed(
            db, drive_dir, "p.png", file_id="reused000001", state="missing"
        )
        row.thumbnail_path = _slot_rel(row.id)
        db.commit()
        old_slot = _put_thumb(row.thumbnail_path, b"\xff\xd8previous-file")
        return row.id, old_slot

    def test_upload_over_missing_row_keeps_id_and_slot(self, client):
        """SPEC-CORE-022 I14"""
        c, db, drive_dir, _ = client
        file_id, _ = self._missing_image_row(c, db, drive_dir)

        row = _upload_png(c, db, "p.png", (255, 0, 0))

        assert row.id == file_id
        assert row.thumbnail_path == _slot_rel(file_id)
        assert _dominant_red(_served(c, file_id))

    def test_failed_generation_empties_pointer_and_removes_old_picture(
        self, client, monkeypatch
    ):
        """SPEC-CORE-022 I14"""
        from app.services import upload as upload_service

        c, db, drive_dir, _ = client
        file_id, old_slot = self._missing_image_row(c, db, drive_dir)
        monkeypatch.setattr(
            upload_service, "get_thumbnail_generator", lambda *_: lambda s, d: False
        )

        row = _upload_png(c, db, "p.png", (255, 0, 0))

        assert row.id == file_id
        assert row.thumbnail_path is None
        assert not old_slot.exists()

    def test_file_without_a_generator_empties_pointer_and_removes_old_picture(
        self, client, monkeypatch
    ):
        """SPEC-CORE-022 I14"""
        from app.services import upload as upload_service

        c, db, drive_dir, _ = client
        file_id, old_slot = self._missing_image_row(c, db, drive_dir)
        monkeypatch.setattr(upload_service, "get_thumbnail_generator", lambda *_: None)

        row = _upload_png(c, db, "p.png", (255, 0, 0))

        assert row.thumbnail_path is None
        assert not old_slot.exists()


class TestCopy:
    def test_copy_has_its_own_slot_with_the_sources_bytes(self, client):
        """SPEC-CORE-022 I12"""
        c, db, drive_dir, _ = client
        src = _seed(db, drive_dir, "one/a.mp4", file_id="srcsrcsrc001")
        src.thumbnail_path = _slot_rel(src.id)
        db.commit()
        _put_thumb(src.thumbnail_path, b"\xff\xd8source-bytes")
        (drive_dir / "two").mkdir()

        res = c.post(f"/api/files/{src.id}/copy", json={"target_folder_path": "two"})
        assert res.status_code == 200
        copy_id = res.json()["id"]

        copy = _fresh(db, copy_id)
        assert copy.thumbnail_path == _slot_rel(copy_id)
        assert (_thumbs() / copy.thumbnail_path).read_bytes() == b"\xff\xd8source-bytes"

        assert c.delete(f"/api/files/{copy_id}").status_code == 200
        assert c.delete(f"/api/files/{copy_id}/purge").status_code == 200
        assert _served(c, src.id) == b"\xff\xd8source-bytes"

    def test_copy_of_path_form_source_reads_through_its_pointer(self, client):
        """SPEC-CORE-022"""
        c, db, drive_dir, _ = client
        src = _seed(
            db, drive_dir, "one/a.mp4", thumb=f"{TEST_DRIVE}/one/a.jpg"
        )
        _put_thumb(src.thumbnail_path, b"\xff\xd8legacy")
        (drive_dir / "two").mkdir()

        res = c.post(f"/api/files/{src.id}/copy", json={"target_folder_path": "two"})
        copy_id = res.json()["id"]

        copy = _fresh(db, copy_id)
        assert copy.thumbnail_path == _slot_rel(copy_id)
        assert (_thumbs() / copy.thumbnail_path).read_bytes() == b"\xff\xd8legacy"

    def test_source_without_a_picture_file_leaves_the_copy_without_pointer(
        self, client
    ):
        """SPEC-CORE-022 I12"""
        c, db, drive_dir, _ = client
        src = _seed(db, drive_dir, "one/a.mp4", file_id="srcsrcsrc002")
        src.thumbnail_path = _slot_rel(src.id)
        db.commit()
        (drive_dir / "two").mkdir()

        res = c.post(f"/api/files/{src.id}/copy", json={"target_folder_path": "two"})
        assert res.status_code == 200

        copy = _fresh(db, res.json()["id"])
        assert copy.thumbnail_path is None
        assert (drive_dir / "two" / "a.mp4").exists()
        assert not (_thumbs() / ".by-id").exists() or list(
            (_thumbs() / ".by-id").iterdir()
        ) == []

    def test_a_picture_that_cannot_be_copied_leaves_copy_and_no_partial_slot(
        self, client
    ):
        """SPEC-CORE-022 I12"""
        c, db, drive_dir, _ = client
        src = _seed(db, drive_dir, "one/a.mp4", file_id="srcsrcsrc003")
        src.thumbnail_path = _slot_rel(src.id)
        db.commit()
        (_thumbs() / src.thumbnail_path).mkdir(parents=True)
        (drive_dir / "two").mkdir()

        res = c.post(f"/api/files/{src.id}/copy", json={"target_folder_path": "two"})
        assert res.status_code == 200

        copy = _fresh(db, res.json()["id"])
        assert copy.thumbnail_path is None
        assert (drive_dir / "two" / "a.mp4").exists()
        assert not (_thumbs() / _slot_rel(copy.id)).exists()


class TestPurge:
    @pytest.mark.parametrize("form", ["slot", "path"])
    def test_purge_removes_only_the_pointed_file(self, client, form):
        """SPEC-CORE-022 I5"""
        c, db, drive_dir, _ = client
        victim = _seed(db, drive_dir, "one/v.mp4", file_id="victim000001")
        other = _seed(db, drive_dir, "one/o.mp4", file_id="other0000001")
        victim.thumbnail_path = (
            _slot_rel(victim.id) if form == "slot" else f"{TEST_DRIVE}/one/v.jpg"
        )
        other.thumbnail_path = _slot_rel(other.id)
        db.commit()
        gone = _put_thumb(victim.thumbnail_path)
        kept = _put_thumb(other.thumbnail_path, b"\xff\xd8other")

        assert c.delete(f"/api/files/{victim.id}").status_code == 200
        assert c.delete(f"/api/files/{victim.id}/purge").status_code == 200

        assert not gone.exists()
        assert kept.read_bytes() == b"\xff\xd8other"
        assert _served(c, other.id) == b"\xff\xd8other"


class TestGhostPictures:
    def test_trashed_ghost_picture_is_removed_when_a_move_takes_its_path(
        self, client
    ):
        """SPEC-CORE-022 I13"""
        c, db, drive_dir, _ = client
        ghost = _seed(
            db, drive_dir, "dest/a.mp4", file_id="ghost0000001", state="missing"
        )
        ghost.missing_since = None
        ghost.deleted_at = datetime.now(UTC)
        ghost.thumbnail_path = _slot_rel(ghost.id)
        mover = _seed(db, drive_dir, "one/a.mp4", file_id="mover0000001")
        mover.thumbnail_path = _slot_rel(mover.id)
        db.commit()
        ghost_pic = _put_thumb(ghost.thumbnail_path, b"\xff\xd8ghost")
        mover_pic = _put_thumb(mover.thumbnail_path, b"\xff\xd8mover")
        ghost_id = ghost.id

        res = c.put(f"/api/files/{mover.id}/move", json={"target_folder_path": "dest"})
        assert res.status_code == 200

        assert _fresh(db, ghost_id) is None
        assert not ghost_pic.exists()
        assert mover_pic.read_bytes() == b"\xff\xd8mover"

    def test_moving_onto_a_missing_record_keeps_the_pictures_apart(self, client):
        """SPEC-CORE-022 I6"""
        c, db, drive_dir, _ = client
        ghost = _seed(
            db, drive_dir, "dest/a.mp4", file_id="ghost0000002", state="missing"
        )
        ghost.thumbnail_path = _slot_rel(ghost.id)
        mover = _seed(db, drive_dir, "one/a.mp4", file_id="mover0000002")
        mover.thumbnail_path = _slot_rel(mover.id)
        db.commit()
        _put_thumb(ghost.thumbnail_path, b"\xff\xd8ghost")
        _put_thumb(mover.thumbnail_path, b"\xff\xd8mover")

        res = c.put(f"/api/files/{mover.id}/move", json={"target_folder_path": "dest"})
        assert res.status_code == 200

        g, m = _fresh(db, ghost.id), _fresh(db, mover.id)
        assert g.thumbnail_path != m.thumbnail_path or g.thumbnail_path is None
        assert c.delete(f"/api/files/{ghost.id}/purge").status_code == 200
        assert _served(c, mover.id) == b"\xff\xd8mover"


    def test_a_move_that_fails_before_its_commit_leaves_the_ghost_and_its_picture(
        self, client, monkeypatch
    ):
        """SPEC-CORE-022 I13"""
        import app.services.fileops as fileops

        c, db, drive_dir, _ = client
        ghost = _seed(
            db, drive_dir, "dest/a.mp4", file_id="ghost0000003", state="missing"
        )
        ghost.missing_since = None
        ghost.deleted_at = datetime.now(UTC)
        ghost.thumbnail_path = _slot_rel(ghost.id)
        mover = _seed(db, drive_dir, "one/a.mp4", file_id="mover0000003")
        db.commit()
        ghost_pic = _put_thumb(ghost.thumbnail_path, b"\xff\xd8ghost")

        def refuse(*_a, **_kw):
            raise RuntimeError("cannot track the emptied folder")

        monkeypatch.setattr(fileops, "_ensure_empty_folder_tracked", refuse)
        res = c.put(f"/api/files/{mover.id}/move", json={"target_folder_path": "dest"})

        assert res.status_code == 500
        assert _fresh(db, "ghost0000003") is not None
        assert ghost_pic.read_bytes() == b"\xff\xd8ghost"
        assert (drive_dir / "one" / "a.mp4").exists()

    def test_upload_over_a_trashed_ghost_removes_the_ghosts_picture(self, client):
        """SPEC-CORE-022 I13"""
        c, db, drive_dir, _ = client
        ghost = _seed(
            db, drive_dir, "p.png", file_id="ghost0000004", state="missing"
        )
        ghost.missing_since = None
        ghost.deleted_at = datetime.now(UTC)
        ghost.thumbnail_path = _slot_rel(ghost.id)
        db.commit()
        ghost_pic = _put_thumb(ghost.thumbnail_path, b"\xff\xd8ghost")

        row = _upload_png(c, db, "p.png", (255, 0, 0))

        assert row.id != "ghost0000004"
        assert _fresh(db, "ghost0000004") is None
        assert not ghost_pic.exists()
        assert _dominant_red(_served(c, row.id))


def _second_drive(tmp_path, monkeypatch):
    other = tmp_path / "drives" / "other"
    other.mkdir(parents=True)
    drives_json = tmp_path / "drives.json"
    drives_json.write_text(
        json.dumps(
            [
                {"name": TEST_DRIVE, "path": str(tmp_path / "drives" / "default")},
                {"name": "other", "path": str(other)},
            ]
        )
    )
    monkeypatch.setattr(config, "_drives_cache", None)
    return other


KINDS = ["mp4", "png", "pdf", "epub", "loft"]


def _op_rename(c, row, drive_dir):
    r = c.put(f"/api/files/{row.id}/rename", json={"new_filename": "new." + row.filename.rsplit(".", 1)[1]})
    return r, "one/new." + row.filename.rsplit(".", 1)[1]


def _op_move(c, row, drive_dir):
    (drive_dir / "two").mkdir(exist_ok=True)
    r = c.put(f"/api/files/{row.id}/move", json={"target_folder_path": "two"})
    return r, "two/" + row.filename


def _op_batch_rename(c, row, drive_dir):
    ext = row.filename.rsplit(".", 1)[1]
    r = c.put(
        "/api/files/batch/rename",
        json={"ids": [row.id], "mode": "template", "template": "batch_{n}"},
    )
    return r, f"one/batch_1.{ext}"


def _op_batch_move(c, row, drive_dir):
    (drive_dir / "two").mkdir(exist_ok=True)
    r = c.put(
        "/api/files/batch/move",
        json={"ids": [row.id], "target_folder_path": "two"},
    )
    return r, "two/" + row.filename


def _op_folder_rename(c, row, drive_dir):
    r = c.put(
        f"/api/drives/{TEST_DRIVE}/folders", json={"path": "one", "new_name": "uno"}
    )
    return r, "uno/" + row.filename


def _op_folder_move(c, row, drive_dir):
    (drive_dir / "two").mkdir(exist_ok=True)
    r = c.put(
        f"/api/drives/{TEST_DRIVE}/folders/move",
        json={"path": "one", "target_path": "two"},
    )
    return r, "two/one/" + row.filename


OPS = {
    "rename": _op_rename,
    "move": _op_move,
    "batch_rename": _op_batch_rename,
    "batch_move": _op_batch_move,
    "folder_rename": _op_folder_rename,
    "folder_move": _op_folder_move,
}


class TestOperationsLeaveTheCacheAlone:
    @pytest.mark.parametrize("op", sorted(OPS))
    @pytest.mark.parametrize("kind", KINDS)
    def test_pointer_and_served_bytes_survive(self, client, op, kind):
        """SPEC-CORE-023 I3"""
        c, db, drive_dir, _ = client
        row = _seed(db, drive_dir, f"one/clip.{kind}", file_id="movable00001")
        row.thumbnail_path = _slot_rel(row.id)
        db.commit()
        _put_thumb(row.thumbnail_path, b"\xff\xd8own-picture")

        res, new_path = OPS[op](c, row, drive_dir)
        assert res.status_code == 200, res.text

        after = _fresh(db, row.id)
        assert after.file_path == new_path
        assert after.thumbnail_path == _slot_rel(row.id)
        assert _served(c, row.id) == b"\xff\xd8own-picture"

    @pytest.mark.parametrize("kind", KINDS)
    def test_cross_drive_move_survives(self, client, tmp_path, monkeypatch, kind):
        """SPEC-CORE-023 I3"""
        c, db, drive_dir, _ = client
        other = _second_drive(tmp_path, monkeypatch)
        row = _seed(db, drive_dir, f"one/clip.{kind}", file_id="movable00002")
        row.thumbnail_path = _slot_rel(row.id)
        db.commit()
        _put_thumb(row.thumbnail_path, b"\xff\xd8own-picture")

        res = c.put(
            "/api/files/batch/move",
            json={"ids": [row.id], "target_drive": "other", "target_folder_path": ""},
        )
        assert res.status_code == 200, res.text

        after = _fresh(db, row.id)
        assert after.drive == "other"
        assert (other / f"clip.{kind}").exists()
        assert after.thumbnail_path == _slot_rel(row.id)
        assert _served(c, row.id) == b"\xff\xd8own-picture"

    @pytest.mark.parametrize("op", sorted(OPS))
    def test_unavailable_cache_does_not_fail_the_operation(self, client, op):
        """SPEC-CORE-023 I4"""
        c, db, drive_dir, _ = client
        row = _seed(db, drive_dir, "one/clip.mp4", file_id="movable00003")
        row.thumbnail_path = _slot_rel(row.id)
        db.commit()
        shutil.rmtree(_thumbs(), ignore_errors=True)
        _thumbs().write_bytes(b"not a directory")

        res, new_path = OPS[op](c, row, drive_dir)

        assert res.status_code == 200, res.text
        assert (drive_dir / new_path).exists()
        assert _fresh(db, row.id).file_path == new_path


class TestScanDetectedMove:
    @pytest.mark.parametrize(
        ("old", "new"), [("a.mp4", "b.mp4"), ("a.loft", "b.loft"), ("a.png", "b.png")]
    )
    def test_pointer_is_left_as_it_is(self, client, old, new):
        """SPEC-CORE-023 I3"""
        from app.services.hash import HASH_CHUNK_SIZE

        c, db, drive_dir, _ = client
        payload = b"H" * HASH_CHUNK_SIZE + b"TT" * 200 + b"T" * HASH_CHUNK_SIZE + b"T"
        (drive_dir / old).write_bytes(payload)
        row = _seed(db, drive_dir, old, file_id="scanmoved001", body=payload)
        row.thumbnail_path = _slot_rel(row.id)
        db.commit()
        _put_thumb(row.thumbnail_path, b"\xff\xd8kept")
        from app.services.hash import compute_file_hash

        row.file_hash = compute_file_hash(drive_dir / old)
        db.commit()
        (drive_dir / old).rename(drive_dir / new)

        result = _scan_and_register(db, TEST_DRIVE)

        assert result["moved"] == 1
        after = _fresh(db, row.id)
        assert after.file_path == new
        assert after.thumbnail_path == _slot_rel(row.id)
        assert _served(c, row.id) == b"\xff\xd8kept"


class TestScanThumbnailBranch:
    def test_path_form_row_is_left_alone(self, client):
        """SPEC-CORE-022 I16"""
        c, db, drive_dir, _ = client
        _png(drive_dir / "p.png", (255, 0, 0))
        row = _seed(
            db, drive_dir, "p.png", thumb=f"{TEST_DRIVE}/legacy/p.jpg",
            body=(drive_dir / "p.png").read_bytes(),
        )
        old = _put_thumb(row.thumbnail_path, b"\xff\xd8legacy")

        _scan_and_register(db, TEST_DRIVE)

        after = _fresh(db, row.id)
        assert after.thumbnail_path == f"{TEST_DRIVE}/legacy/p.jpg"
        assert old.read_bytes() == b"\xff\xd8legacy"

    def test_slot_pointer_with_absent_file_is_regenerated(self, client):
        """SPEC-CORE-022 I16"""
        c, db, drive_dir, _ = client
        _png(drive_dir / "p.png", (255, 0, 0))
        row = _seed(
            db, drive_dir, "p.png", file_id="regen0000001",
            body=(drive_dir / "p.png").read_bytes(),
        )
        row.thumbnail_path = _slot_rel(row.id)
        db.commit()

        _scan_and_register(db, TEST_DRIVE)

        after = _fresh(db, row.id)
        assert after.thumbnail_path == _slot_rel(row.id)
        assert _dominant_red(_served(c, row.id))

    def test_loft_pointer_naming_an_absent_file_is_left_alone(self, client):
        """SPEC-CORE-022 I16"""
        c, db, drive_dir, _ = client
        row = _seed(db, drive_dir, "x.loft", file_id="loft00000001")
        row.thumbnail_path = _slot_rel(row.id)
        db.commit()

        _scan_and_register(db, TEST_DRIVE)

        after = _fresh(db, row.id)
        assert after.thumbnail_path == _slot_rel(row.id)
        assert not (_thumbs() / after.thumbnail_path).exists()


class TestStartupMigration:
    @pytest.mark.parametrize("state", ["active", "missing", "trash"])
    @pytest.mark.parametrize("drive", [TEST_DRIVE, "gone-drive"])
    @pytest.mark.parametrize("name", ["a.mp4", "a.loft"])
    def test_sole_owner_moves_with_same_bytes_and_mtime(
        self, client, state, drive, name
    ):
        """SPEC-CORE-024 I7 I15"""
        c, db, drive_dir, _ = client
        row = _seed(
            db, drive_dir, f"one/{name}", drive=drive, state=state,
            thumb=f"{drive}/one/{Path(name).stem}.jpg",
        )
        old = _put_thumb(row.thumbnail_path, b"\xff\xd8legacy-bytes")
        os.utime(old, ns=(1_600_000_000_000_000_000, 1_600_000_000_000_000_000))
        file_id = row.id

        _restart()

        after = _fresh(db, file_id)
        new = _thumbs() / _slot_rel(file_id)
        assert after.thumbnail_path == _slot_rel(file_id)
        assert new.read_bytes() == b"\xff\xd8legacy-bytes"
        assert new.stat().st_mtime_ns == 1_600_000_000_000_000_000
        assert not old.exists()
        assert not old.parent.exists()

    def test_etag_is_unchanged(self, client):
        """SPEC-CORE-024 I7"""
        c, db, drive_dir, _ = client
        row = _seed(db, drive_dir, "one/a.mp4", thumb=f"{TEST_DRIVE}/one/a.jpg")
        _put_thumb(row.thumbnail_path, b"\xff\xd8legacy-bytes")
        before = c.get(f"/api/files/{row.id}/thumbnail").headers.get("etag")
        assert before

        _restart()

        assert _fresh(db, row.id).thumbnail_path == _slot_rel(row.id)
        assert c.get(f"/api/files/{row.id}/thumbnail").headers.get("etag") == before

    def test_rows_sharing_one_file_lose_the_pointer_and_the_file(self, client):
        """SPEC-CORE-024 I8"""
        c, db, drive_dir, _ = client
        shared = f"{TEST_DRIVE}/one/book.jpg"
        a = _seed(db, drive_dir, "one/book.pdf", thumb=shared)
        b = _seed(db, drive_dir, "one/book.epub", thumb=shared)
        other_drive = _seed(
            db, drive_dir, "one/book.mp4", drive="gone-drive", thumb=shared
        )
        old = _put_thumb(shared)

        _restart()

        for row in (a, b, other_drive):
            assert _fresh(db, row.id).thumbnail_path is None
        assert not old.exists()

    def test_two_spellings_of_one_file_count_as_shared(self, client):
        """SPEC-CORE-024 I8"""
        c, db, drive_dir, _ = client
        a = _seed(db, drive_dir, "one/a.mp4", thumb=f"{TEST_DRIVE}/one/a.jpg")
        b = _seed(db, drive_dir, "one/b.mp4", thumb=f"{TEST_DRIVE}/one/alias.jpg")
        first = _put_thumb(a.thumbnail_path)
        os.link(first, _thumbs() / b.thumbnail_path)

        _restart()

        assert _fresh(db, a.id).thumbnail_path is None
        assert _fresh(db, b.id).thumbnail_path is None
        assert not (_thumbs() / ".by-id").exists() or list(
            (_thumbs() / ".by-id").iterdir()
        ) == []

    def test_failed_replace_keeps_pointer_and_next_startup_moves_it(
        self, client, monkeypatch
    ):
        """SPEC-CORE-024 I9"""
        c, db, drive_dir, _ = client
        stuck = _seed(db, drive_dir, "one/a.mp4", thumb=f"{TEST_DRIVE}/one/a.jpg")
        fine = _seed(db, drive_dir, "one/b.mp4", thumb=f"{TEST_DRIVE}/one/b.jpg")
        _put_thumb(stuck.thumbnail_path, b"\xff\xd8stuck")
        _put_thumb(fine.thumbnail_path, b"\xff\xd8fine")
        real_replace = os.replace

        def flaky(src, dst, *a, **kw):
            if str(src).endswith("one/a.jpg"):
                raise OSError("busy")
            return real_replace(src, dst, *a, **kw)

        monkeypatch.setattr(os, "replace", flaky)
        _restart()

        assert _fresh(db, stuck.id).thumbnail_path == f"{TEST_DRIVE}/one/a.jpg"
        assert _fresh(db, fine.id).thumbnail_path == _slot_rel(fine.id)

        monkeypatch.setattr(os, "replace", real_replace)
        _restart()

        assert _fresh(db, stuck.id).thumbnail_path == _slot_rel(stuck.id)
        assert (_thumbs() / _slot_rel(stuck.id)).read_bytes() == b"\xff\xd8stuck"

    def test_absent_file_with_existing_slot_is_repointed(self, client):
        """SPEC-CORE-024 I10"""
        c, db, drive_dir, _ = client
        row = _seed(
            db, drive_dir, "one/a.mp4", file_id="repoint00001",
            thumb=f"{TEST_DRIVE}/one/a.jpg",
        )
        slot = _put_thumb(_slot_rel(row.id), b"\xff\xd8slot")

        _restart()

        assert _fresh(db, row.id).thumbnail_path == _slot_rel(row.id)
        assert slot.read_bytes() == b"\xff\xd8slot"

    def test_absent_file_and_absent_slot_empties_the_pointer(self, client):
        """SPEC-CORE-024 I10"""
        c, db, drive_dir, _ = client
        row = _seed(db, drive_dir, "one/a.mp4", thumb=f"{TEST_DRIVE}/one/a.jpg")

        _restart()

        assert _fresh(db, row.id).thumbnail_path is None

    def test_markdown_projections_are_not_selected(self, client):
        """SPEC-CORE-024 I11"""
        c, db, drive_dir, _ = client
        in_drive = f"{TEST_DRIVE}/.markdown/note0000001-src000000001.jpg"
        elsewhere = "gone-drive/.markdown/note0000002-src000000002.jpg"
        a = _seed(db, drive_dir, "img1.png", thumb=in_drive)
        b = _seed(db, drive_dir, "img2.png", drive="gone-drive", thumb=elsewhere)
        pa = _put_thumb(in_drive, b"\xff\xd8proj-a")
        pb = _put_thumb(elsewhere, b"\xff\xd8proj-b")
        plain = _seed(db, drive_dir, "one/a.mp4", thumb=f"{TEST_DRIVE}/one/a.jpg")
        _put_thumb(plain.thumbnail_path)

        _restart()

        assert _fresh(db, plain.id).thumbnail_path == _slot_rel(plain.id)
        assert _fresh(db, a.id).thumbnail_path == in_drive
        assert _fresh(db, b.id).thumbnail_path == elsewhere
        assert pa.read_bytes() == b"\xff\xd8proj-a"
        assert pb.read_bytes() == b"\xff\xd8proj-b"

    def test_second_run_over_a_migrated_library_changes_nothing(self, client):
        """SPEC-CORE-024 I21"""
        c, db, drive_dir, _ = client
        row = _seed(db, drive_dir, "one/a.mp4", thumb=f"{TEST_DRIVE}/one/a.jpg")
        _put_thumb(row.thumbnail_path, b"\xff\xd8legacy")
        shared = f"{TEST_DRIVE}/one/s.jpg"
        s1 = _seed(db, drive_dir, "one/s.mp4", thumb=shared)
        s2 = _seed(db, drive_dir, "one/s.png", thumb=shared)
        _put_thumb(shared)
        _restart()
        slot = _thumbs() / _slot_rel(row.id)
        mtime = slot.stat().st_mtime_ns

        _restart()

        assert _fresh(db, row.id).thumbnail_path == _slot_rel(row.id)
        assert slot.read_bytes() == b"\xff\xd8legacy"
        assert slot.stat().st_mtime_ns == mtime
        assert _fresh(db, s1.id).thumbnail_path is None
        assert _fresh(db, s2.id).thumbnail_path is None

    def test_unexpected_failure_does_not_stop_startup_and_next_run_recovers(
        self, client, monkeypatch
    ):
        """SPEC-CORE-024 I20"""
        c, db, drive_dir, _ = client
        row = _seed(db, drive_dir, "one/a.mp4", thumb=f"{TEST_DRIVE}/one/a.jpg")
        _put_thumb(row.thumbnail_path, b"\xff\xd8intact")
        real_replace = os.replace

        def boom(*a, **kw):
            raise RuntimeError("unexpected")

        monkeypatch.setattr(os, "replace", boom)
        _restart()
        monkeypatch.setattr(os, "replace", real_replace)
        _restart()

        assert _fresh(db, row.id).thumbnail_path == _slot_rel(row.id)
        assert (_thumbs() / _slot_rel(row.id)).read_bytes() == b"\xff\xd8intact"

    def test_migration_finishes_before_the_startup_scan(self, client, monkeypatch):
        """SPEC-CORE-024 I19"""
        from sqlalchemy.orm import sessionmaker

        c, db, drive_dir, _ = client
        row = _seed(db, drive_dir, "one/a.mp4", thumb=f"{TEST_DRIVE}/one/a.jpg")
        _put_thumb(row.thumbnail_path)
        seen = {}

        async def spy_scan():
            probe = sessionmaker(bind=db.get_bind())()
            try:
                seen["pointer"] = probe.get(File, row.id).thumbnail_path
            finally:
                probe.close()
            return {}

        monkeypatch.setattr(main, "scan_all_drives", spy_scan)
        with TestClient(app):
            for _ in range(100):
                if seen:
                    break
                time.sleep(0.05)

        assert seen["pointer"] == _slot_rel(row.id)


    def test_commit_that_raises_stops_the_run_and_the_next_startup_repoints(
        self, client, monkeypatch
    ):
        """SPEC-CORE-024 I20"""
        c, db, drive_dir, _ = client
        row = _seed(db, drive_dir, "one/a.mp4", thumb=f"{TEST_DRIVE}/one/a.jpg")
        _put_thumb(row.thumbnail_path, b"\xff\xd8intact")
        real_factory = main.SessionLocal

        def failing_factory():
            session = real_factory()

            def refuse():
                raise RuntimeError("database is locked")

            session.commit = refuse
            return session

        monkeypatch.setattr(main, "SessionLocal", failing_factory)
        _restart()

        assert _fresh(db, row.id).thumbnail_path == f"{TEST_DRIVE}/one/a.jpg"
        assert (_thumbs() / _slot_rel(row.id)).read_bytes() == b"\xff\xd8intact"

        monkeypatch.setattr(main, "SessionLocal", real_factory)
        _restart()

        assert _fresh(db, row.id).thumbnail_path == _slot_rel(row.id)
        assert (_thumbs() / _slot_rel(row.id)).read_bytes() == b"\xff\xd8intact"

    def test_lifespan_does_not_yield_before_the_migration_has_finished(
        self, client, monkeypatch
    ):
        """SPEC-CORE-024 I19"""
        c, db, drive_dir, _ = client
        finished = []
        real_migrate = main.migrate_thumbnail_slots

        def slow_migrate(factory):
            time.sleep(0.3)
            result = real_migrate(factory)
            finished.append(True)
            return result

        monkeypatch.setattr(main, "migrate_thumbnail_slots", slow_migrate)
        seen = {}

        async def drive_lifespan():
            async with main.lifespan(app):
                seen["finished_when_serving"] = bool(finished)

        asyncio.run(drive_lifespan())

        assert seen["finished_when_serving"]

    def test_a_run_of_more_than_one_batch_moves_every_row(self, client):
        """SPEC-CORE-024"""
        c, db, drive_dir, _ = client
        ids = []
        for n in range(450):
            row = _seed(
                db, drive_dir, f"bulk/{n}.mp4", thumb=f"{TEST_DRIVE}/bulk/{n}.jpg",
                body=b"x",
            )
            _put_thumb(row.thumbnail_path, str(n).encode())
            ids.append(row.id)

        _restart()

        db.expire_all()
        by_id = {r.id: r.thumbnail_path for r in db.query(File).all()}
        assert all(by_id[i] == _slot_rel(i) for i in ids)
        assert len(list((_thumbs() / ".by-id").iterdir())) == 450

    def test_shared_file_that_cannot_be_removed_warns_and_pointers_stay_empty(
        self, client, monkeypatch, caplog
    ):
        """SPEC-CORE-024"""
        c, db, drive_dir, _ = client
        shared = f"{TEST_DRIVE}/one/book.jpg"
        a = _seed(db, drive_dir, "one/book.pdf", thumb=shared)
        b = _seed(db, drive_dir, "one/book.epub", thumb=shared)
        old = _put_thumb(shared)
        real_unlink = Path.unlink

        def stuck(self, *args, **kwargs):
            if self.name == "book.jpg":
                raise OSError("read-only file system")
            return real_unlink(self, *args, **kwargs)

        monkeypatch.setattr(Path, "unlink", stuck)
        with caplog.at_level(logging.WARNING, logger="app.services.thumbnail"):
            _restart()

        assert _fresh(db, a.id).thumbnail_path is None
        assert _fresh(db, b.id).thumbnail_path is None
        assert old.exists()
        assert any("book.jpg" in r.getMessage() for r in caplog.records)


class TestInternalApi:
    def test_internal_file_returns_the_stored_pointer(self, client):
        """SPEC-CORE-022 I18"""
        c, db, drive_dir, _ = client
        row = _seed(db, drive_dir, "one/a.mp4", file_id="internal0001")
        row.thumbnail_path = _slot_rel(row.id)
        db.commit()

        res = c.get(f"/api/internal/files/{row.id}")

        assert res.status_code == 200
        assert res.json()["thumbnail_path"] == _slot_rel(row.id)
