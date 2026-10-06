"""SPEC-CORE-003: a batch rename never overwrites a file."""
from __future__ import annotations

import os
import unicodedata
from pathlib import Path

from tests.conftest import TEST_DRIVE

FOLDER = "f"


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def nfd(s: str) -> str:
    return unicodedata.normalize("NFD", s)


def _content(name: str) -> bytes:
    return f"bytes of {name}".encode("utf-8")


def _seed(db, drive_dir: Path, filename: str, *, file_id: str, folder: str = FOLDER):
    from app.models import File

    d = drive_dir / folder if folder else drive_dir
    d.mkdir(parents=True, exist_ok=True)
    (d / filename).write_bytes(_content(f"{folder}/{filename}"))
    row = File(
        id=file_id,
        filename=filename,
        title=Path(filename).stem,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=f"{folder}/{filename}" if folder else filename,
        file_size=(d / filename).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _unrelated(drive_dir: Path, name: str, folder: str = FOLDER) -> Path:
    d = drive_dir / folder
    d.mkdir(parents=True, exist_ok=True)
    p = d / name
    p.write_bytes(_content(f"unrelated {folder}/{name}"))
    return p


def _disk(drive_dir: Path, folder: str = FOLDER) -> dict[str, bytes]:
    d = drive_dir / folder
    return {n: (d / n).read_bytes() for n in sorted(os.listdir(d))}


def _rows(db) -> dict[str, tuple[str, str]]:
    from app.models import File

    db.expire_all()
    return {f.id: (f.filename, f.file_path) for f in db.query(File).all()}


def _template(c, ids, template, start_number=1):
    return c.put("/api/files/batch/rename", json={
        "ids": ids,
        "mode": "template",
        "template": template,
        "start_number": start_number,
    })


def _assert_refused_unchanged(res, new_name, before_disk, before_rows, db, drive_dir,
                              folders=(FOLDER,)):
    assert res.status_code == 409, res.text
    assert res.json()["detail"] == f"File already exists: {new_name}"
    assert {f: _disk(drive_dir, f) for f in folders} == before_disk
    assert _rows(db) == before_rows


class TestRefused:
    def test_spec_core_003_target_held_by_nfd_named_sibling(self, client):
        c, db, drive_dir, _ = client
        f = _seed(db, drive_dir, "x.mp4", file_id="aaaaaaaaaaa1")
        _unrelated(drive_dir, nfd("Café.mp4"))
        before_disk, before_rows = {FOLDER: _disk(drive_dir)}, _rows(db)

        res = _template(c, [f.id], nfc("Café"))

        _assert_refused_unchanged(res, nfc("Café.mp4"), before_disk, before_rows, db, drive_dir)

    def test_spec_core_003_swap_is_refused(self, client):
        c, db, drive_dir, _ = client
        one = _seed(db, drive_dir, "1.mp4", file_id="aaaaaaaaaaa1")
        two = _seed(db, drive_dir, "2.mp4", file_id="aaaaaaaaaaa2")
        before_disk, before_rows = {FOLDER: _disk(drive_dir)}, _rows(db)

        # 2.mp4 -> 1.mp4 runs first, while 1.mp4 still holds its name.
        res = _template(c, [two.id, one.id], "{n}")

        _assert_refused_unchanged(res, "1.mp4", before_disk, before_rows, db, drive_dir)

    def test_spec_core_003_renumbering_up_is_refused(self, client):
        c, db, drive_dir, _ = client
        one = _seed(db, drive_dir, "1.mp4", file_id="aaaaaaaaaaa1")
        two = _seed(db, drive_dir, "2.mp4", file_id="aaaaaaaaaaa2")
        before_disk, before_rows = {FOLDER: _disk(drive_dir)}, _rows(db)

        res = _template(c, [one.id, two.id], "{n}", start_number=2)

        _assert_refused_unchanged(res, "2.mp4", before_disk, before_rows, db, drive_dir)

    def test_spec_core_003_batch_file_in_another_folder_does_not_free_the_name(self, client):
        c, db, drive_dir, _ = client
        elsewhere = _seed(db, drive_dir, "2.mp4", file_id="aaaaaaaaaaa1", folder="g")
        here = _seed(db, drive_dir, "a.mp4", file_id="aaaaaaaaaaa2")
        _unrelated(drive_dir, "2.mp4")
        before_disk = {FOLDER: _disk(drive_dir), "g": _disk(drive_dir, "g")}
        before_rows = _rows(db)

        # g/2.mp4 -> g/1.mp4, then f/a.mp4 -> f/2.mp4 onto the unrelated f/2.mp4.
        res = _template(c, [elsewhere.id, here.id], "{n}")

        _assert_refused_unchanged(res, "2.mp4", before_disk, before_rows, db, drive_dir,
                                  folders=(FOLDER, "g"))


class TestCarriedOut:
    def test_spec_core_003_renumbering_down_succeeds_whatever_the_key_order(self, client):
        c, db, drive_dir, _ = client
        # The row renamed second has the smaller primary key, so a flush that
        # follows key order rather than execution order meets 2.mp4 still held.
        two = _seed(db, drive_dir, "2.mp4", file_id="zzzzzzzzzzz2")
        three = _seed(db, drive_dir, "3.mp4", file_id="aaaaaaaaaaa3")
        bytes_two = _content(f"{FOLDER}/2.mp4")
        bytes_three = _content(f"{FOLDER}/3.mp4")

        res = _template(c, [two.id, three.id], "{n}")

        assert res.status_code == 200, res.text
        assert res.json()["renamed"] == 2
        assert _disk(drive_dir) == {"1.mp4": bytes_two, "2.mp4": bytes_three}
        assert _rows(db) == {
            two.id: ("1.mp4", f"{FOLDER}/1.mp4"),
            three.id: ("2.mp4", f"{FOLDER}/2.mp4"),
        }
