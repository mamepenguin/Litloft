"""SPEC-CORE-042: files whose on-disk name is NFD are opened and changed through
their stored NFC path. Runs only on a filesystem that distinguishes the spellings."""
from __future__ import annotations

import hashlib
import io
import os
import shutil
import zipfile

import pytest

from tests.conftest import FIXTURES_DIR, TEST_DRIVE
from tests.nfd_helpers import (
    FOLDER, LAYOUTS, LEAF, REL, disk_rel, names, nfc, nfd, require_sensitive_fs, seed, tree, wire,
)

AMBIG = "がぱ.mp4"
AMBIG_FULL = nfd(AMBIG)
AMBIG_MIXED = nfd("が") + "ぱ.mp4"


@pytest.fixture()
def env(client):
    c, db, drive_dir, data_dir = client
    require_sensitive_fs(drive_dir)
    return c, db, drive_dir, data_dir


def _ambiguous(db, drive_dir, folder=FOLDER):
    stored = f"{folder}/{AMBIG}"
    rec = seed(db, drive_dir, stored=stored, on_disk=f"{folder}/{AMBIG_FULL}", data=b"full" * 64)
    (drive_dir / folder / AMBIG_MIXED).write_bytes(b"mixed" * 64)
    return rec


# ---------------------------------------------------------------- I1, I2

@pytest.mark.parametrize("layout", LAYOUTS)
class TestReadsMatchTheNfcControl:
    def _pair(self, db, drive_dir, layout):
        f_nfd, l_nfd = LAYOUTS[layout]
        nfd_rec = seed(db, drive_dir, on_disk=disk_rel(f_nfd, l_nfd))
        ctl = seed(db, drive_dir, stored=f"control/{LEAF}")
        return nfd_rec, ctl

    def test_i1_full_stream(self, env, layout):
        c, db, drive_dir, _ = env
        a, ctl = self._pair(db, drive_dir, layout)
        got, want = c.get(f"/api/files/{a.id}/stream"), c.get(f"/api/files/{ctl.id}/stream")
        assert want.status_code == 200
        assert wire(got) == wire(want)

    @pytest.mark.parametrize("rng", ["bytes=0-1023", "bytes=100-"])
    def test_i1_range_stream(self, env, layout, rng):
        c, db, drive_dir, _ = env
        a, ctl = self._pair(db, drive_dir, layout)
        got = c.get(f"/api/files/{a.id}/stream", headers={"Range": rng})
        want = c.get(f"/api/files/{ctl.id}/stream", headers={"Range": rng})
        assert want.status_code == 206
        assert wire(got) == wire(want)

    def test_i2_download(self, env, layout):
        c, db, drive_dir, _ = env
        a, ctl = self._pair(db, drive_dir, layout)
        got = c.get(f"/api/files/{a.id}/stream?download=true")
        want = c.get(f"/api/files/{ctl.id}/stream?download=true")
        assert want.status_code == 200
        assert got.status_code == 200
        assert got.content == want.content


class TestEachOperationOpensAnNfdFile:
    def test_i2_archive_listing_and_entry(self, env):
        c, db, drive_dir, _ = env
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("hello.txt", "Hello")
        stored = f"{FOLDER}/アーカイブ.zip"
        rec = seed(db, drive_dir, stored=stored, on_disk=nfd(stored), data=buf.getvalue(),
                   mime="application/zip", ftype="archive")
        listing = c.get(f"/api/files/{rec.id}/archive")
        assert listing.status_code == 200
        assert [e["path"] for e in listing.json()["entries"]] == ["hello.txt"]
        entry = c.get(f"/api/files/{rec.id}/archive/entry", params={"path": "hello.txt"})
        assert entry.status_code == 200
        assert entry.content == b"Hello"

    def test_i2_subtitle_detection_and_serving(self, env):
        c, db, drive_dir, _ = env
        rec = seed(db, drive_dir, on_disk=disk_rel(True, True))
        (drive_dir / nfd(FOLDER) / nfd("がっこう.srt")).write_text(
            "1\n00:00:01,000 --> 00:00:02,000\nHello\n", encoding="utf-8")
        detail = c.get(f"/api/files/{rec.id}")
        assert detail.status_code == 200
        assert len(detail.json()["subtitles"]) == 1
        sub = c.get(f"/api/files/{rec.id}/subtitles/0")
        assert sub.status_code == 200
        assert "Hello" in sub.text

    def test_i2_content_read_put_and_internal_read(self, env):
        c, db, drive_dir, _ = env
        stored = f"{FOLDER}/ぼめも.md"
        rec = seed(db, drive_dir, stored=stored, on_disk=nfd(stored), data=b"initial\n",
                   mime="text/markdown", ftype="document")
        read = c.get(f"/api/files/{rec.id}/stream")
        assert read.status_code == 200
        assert read.content == b"initial\n"
        internal = c.get(f"/api/internal/files/{rec.id}/content")
        assert internal.status_code == 200
        assert internal.text == "initial\n"
        put = c.put(
            f"/api/files/{rec.id}/content",
            content=b"updated\n",
            headers={"Content-Type": "text/plain; charset=utf-8",
                     "If-Match": f'"{hashlib.sha256(b"initial\n").hexdigest()}"'},
        )
        assert put.status_code == 200, put.text
        assert (drive_dir / nfd(FOLDER) / nfd("ぼめも.md")).read_bytes() == b"updated\n"
        assert names(drive_dir) == [nfd(FOLDER)]
        assert names(drive_dir / nfd(FOLDER)) == [nfd("ぼめも.md")]


# ---------------------------------------------------------------- I5

class TestWritesLandInsideTheNfdFolder:
    def test_i5_create_folder(self, env):
        c, db, drive_dir, _ = env
        (drive_dir / nfd(FOLDER)).mkdir()
        res = c.post(f"/api/drives/{TEST_DRIVE}/folders", json={"path": FOLDER, "name": "子"})
        assert res.status_code in (200, 201), res.text
        assert names(drive_dir) == [nfd(FOLDER)]
        assert names(drive_dir / nfd(FOLDER)) == ["子"]

    def test_i5_create_text_file(self, env):
        c, db, drive_dir, _ = env
        (drive_dir / nfd(FOLDER)).mkdir()
        res = c.post(f"/api/drives/{TEST_DRIVE}/files", json={"path": f"{FOLDER}/n.md", "content": "x"})
        assert res.status_code == 201, res.text
        assert names(drive_dir) == [nfd(FOLDER)]
        assert names(drive_dir / nfd(FOLDER)) == ["n.md"]

    def test_i5_upload(self, env):
        c, db, drive_dir, _ = env
        (drive_dir / nfd(FOLDER)).mkdir()
        data = b"hello"
        init = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": "u.txt", "file_size": len(data), "folder_path": FOLDER, "chunk_size": len(data)})
        assert init.status_code == 200, init.text
        uid = init.json()["upload_id"]
        c.post(f"/api/drives/{TEST_DRIVE}/upload/{uid}/chunk", data={"chunk_index": "0"},
               files={"chunk": ("chunk", io.BytesIO(data), "application/octet-stream")})
        done = c.post(f"/api/drives/{TEST_DRIVE}/upload/{uid}/complete")
        assert done.status_code == 200, done.text
        assert names(drive_dir) == [nfd(FOLDER)]
        assert names(drive_dir / nfd(FOLDER)) == ["u.txt"]

    def test_i5_copy_into(self, env):
        c, db, drive_dir, _ = env
        src = seed(db, drive_dir, stored="src/a.mp4")
        (drive_dir / nfd(FOLDER)).mkdir()
        res = c.post(f"/api/files/{src.id}/copy", json={"target_folder_path": FOLDER})
        assert res.status_code == 200, res.text
        assert names(drive_dir) == ["src", nfd(FOLDER)]
        assert names(drive_dir / nfd(FOLDER)) == ["a.mp4"]
        assert (drive_dir / "src" / "a.mp4").exists()

    def test_i5_move_into(self, env):
        c, db, drive_dir, _ = env
        src = seed(db, drive_dir, stored="src/a.mp4")
        (drive_dir / nfd(FOLDER)).mkdir()
        res = c.put(f"/api/files/{src.id}/move", json={"target_folder_path": FOLDER})
        assert res.status_code == 200, res.text
        assert names(drive_dir) == ["src", nfd(FOLDER)]
        assert names(drive_dir / nfd(FOLDER)) == ["a.mp4"]
        assert not (drive_dir / "src" / "a.mp4").exists()

    def test_i5_move_folder_into(self, env):
        c, db, drive_dir, _ = env
        seed(db, drive_dir, stored="src/a.mp4")
        (drive_dir / nfd(FOLDER)).mkdir()
        res = c.put(f"/api/drives/{TEST_DRIVE}/folders/move", json={"path": "src", "target_path": FOLDER})
        assert res.status_code == 200, res.text
        assert names(drive_dir) == [nfd(FOLDER)]
        assert names(drive_dir / nfd(FOLDER)) == ["src"]

    def test_i5_restore_into_nfd_parent(self, env):
        c, db, drive_dir, _ = env
        rec = seed(db, drive_dir, on_disk=disk_rel(True, True))
        before = tree(drive_dir)
        assert c.delete(f"/api/files/{rec.id}").status_code == 200
        res = c.post(f"/api/files/{rec.id}/restore")
        assert res.status_code == 200, res.text
        assert tree(drive_dir) == before


# ---------------------------------------------------------------- I6, I8

class TestOperationsActOnTheNfdEntry:
    @pytest.mark.parametrize("layout", LAYOUTS)
    def test_i6_rename(self, env, layout):
        c, db, drive_dir, _ = env
        f_nfd, l_nfd = LAYOUTS[layout]
        rec = seed(db, drive_dir, on_disk=disk_rel(f_nfd, l_nfd), data=b"payload")
        res = c.put(f"/api/files/{rec.id}/rename", json={"new_filename": "新しい.mp4"})
        assert res.status_code == 200, res.text
        folder = drive_dir / (nfd(FOLDER) if f_nfd else nfc(FOLDER))
        assert names(folder) == ["新しい.mp4"]
        assert (folder / "新しい.mp4").read_bytes() == b"payload"
        assert names(drive_dir) == [folder.name]

    def test_i8_rename_gets_the_typed_nfc_name(self, env):
        c, db, drive_dir, _ = env
        rec = seed(db, drive_dir, on_disk=disk_rel(False, True))
        typed = nfc("ばなな.mp4")
        res = c.put(f"/api/files/{rec.id}/rename", json={"new_filename": typed})
        assert res.status_code == 200, res.text
        assert names(drive_dir / FOLDER) == [typed]
        db.expire_all()
        assert db.get(type(rec), rec.id).file_path == f"{FOLDER}/{typed}"

    @pytest.mark.parametrize("layout", LAYOUTS)
    def test_i6_move(self, env, layout):
        c, db, drive_dir, _ = env
        f_nfd, l_nfd = LAYOUTS[layout]
        rec = seed(db, drive_dir, on_disk=disk_rel(f_nfd, l_nfd), data=b"payload")
        (drive_dir / "dest").mkdir()
        res = c.put(f"/api/files/{rec.id}/move", json={"target_folder_path": "dest"})
        assert res.status_code == 200, res.text
        assert names(drive_dir / "dest") == [LEAF]
        assert (drive_dir / "dest" / LEAF).read_bytes() == b"payload"
        assert names(drive_dir / (nfd(FOLDER) if f_nfd else nfc(FOLDER))) == []

    @pytest.mark.parametrize("layout", LAYOUTS)
    def test_i6_copy_leaves_the_original_and_adds_one(self, env, layout):
        c, db, drive_dir, _ = env
        f_nfd, l_nfd = LAYOUTS[layout]
        rec = seed(db, drive_dir, on_disk=disk_rel(f_nfd, l_nfd), data=b"payload")
        folder = drive_dir / (nfd(FOLDER) if f_nfd else nfc(FOLDER))
        original = names(folder)
        res = c.post(f"/api/files/{rec.id}/copy", json={"target_folder_path": FOLDER})
        assert res.status_code == 200, res.text
        after = names(folder)
        assert set(original) <= set(after)
        assert len(after) == 2
        assert names(drive_dir) == [folder.name]

    @pytest.mark.parametrize("layout", LAYOUTS)
    def test_i6_purge(self, env, layout):
        c, db, drive_dir, _ = env
        f_nfd, l_nfd = LAYOUTS[layout]
        rec = seed(db, drive_dir, on_disk=disk_rel(f_nfd, l_nfd))
        assert c.delete(f"/api/files/{rec.id}").status_code == 200
        res = c.delete(f"/api/files/{rec.id}/purge")
        assert res.status_code == 200, res.text
        assert names(drive_dir / (nfd(FOLDER) if f_nfd else nfc(FOLDER))) == []

    def test_i6_restore_finds_an_nfd_file(self, env):
        c, db, drive_dir, _ = env
        rec = seed(db, drive_dir, on_disk=disk_rel(False, True))
        c.delete(f"/api/files/{rec.id}")
        res = c.post(f"/api/files/{rec.id}/restore")
        assert res.status_code == 200, res.text

    def test_i6_rename_folder(self, env):
        c, db, drive_dir, _ = env
        seed(db, drive_dir, on_disk=disk_rel(True, True), data=b"payload")
        res = c.put(f"/api/drives/{TEST_DRIVE}/folders", json={"path": FOLDER, "new_name": "新"})
        assert res.status_code == 200, res.text
        assert names(drive_dir) == ["新"]
        assert names(drive_dir / "新") == [nfd(LEAF)]

    def test_i8_sidecars_follow_a_rename(self, env):
        c, db, drive_dir, _ = env
        rec = seed(db, drive_dir, on_disk=disk_rel(True, True))
        folder = drive_dir / nfd(FOLDER)
        (folder / nfd("がっこう.srt")).write_text("sub", encoding="utf-8")
        res = c.put(f"/api/files/{rec.id}/rename", json={"new_filename": "新しい.mp4"})
        assert res.status_code == 200, res.text
        assert names(folder) == ["新しい.mp4", "新しい.srt"]

    def test_i8_sidecars_follow_a_move(self, env):
        c, db, drive_dir, _ = env
        rec = seed(db, drive_dir, on_disk=disk_rel(True, True))
        folder = drive_dir / nfd(FOLDER)
        (folder / nfd("がっこう.srt")).write_text("sub", encoding="utf-8")
        (drive_dir / "dest").mkdir()
        res = c.put(f"/api/files/{rec.id}/move", json={"target_folder_path": "dest"})
        assert res.status_code == 200, res.text
        assert names(folder) == []
        assert names(drive_dir / "dest") == [LEAF, "がっこう.srt"]

    def test_i8_failed_batch_rename_restores_the_original_on_disk_names(self, env):
        c, db, drive_dir, _ = env
        first = seed(db, drive_dir, stored=f"{FOLDER}/{nfc('がい.mp4')}",
                     on_disk=f"{nfd(FOLDER)}/{nfd('がい.mp4')}")
        second = seed(db, drive_dir, stored=f"{FOLDER}/{nfc('ぎい.mp4')}",
                      on_disk=f"{nfd(FOLDER)}/{nfd('ぎい.mp4')}")
        (drive_dir / nfd(FOLDER) / nfd("ぎい.mp4")).unlink()
        before = tree(drive_dir)
        res = c.put("/api/files/batch/rename", json={
            "ids": [first.id, second.id], "mode": "template", "template": "renamed_{n}"})
        assert res.status_code == 404
        assert tree(drive_dir) == before
        ok = c.put("/api/files/batch/rename", json={
            "ids": [first.id], "mode": "template", "template": "renamed_{n}"})
        assert ok.status_code == 200, ok.text
        assert names(drive_dir / nfd(FOLDER)) == ["renamed_1.mp4"]


# ---------------------------------------------------------------- I7

class TestDestinationExistingInTheOtherSpelling:
    def _folder_with_nfd_file(self, drive_dir, data=b"old"):
        d = drive_dir / "dest"
        d.mkdir()
        (d / nfd(LEAF)).write_bytes(data)
        return d

    def test_i7_rename_to_an_existing_name_is_409(self, env):
        c, db, drive_dir, _ = env
        d = self._folder_with_nfd_file(drive_dir)
        rec = seed(db, drive_dir, stored="dest/other.mp4")
        before = tree(drive_dir)
        res = c.put(f"/api/files/{rec.id}/rename", json={"new_filename": LEAF})
        assert res.status_code == 409
        assert tree(drive_dir) == before

    def test_i7_move_onto_an_existing_name_is_409(self, env):
        c, db, drive_dir, _ = env
        self._folder_with_nfd_file(drive_dir)
        rec = seed(db, drive_dir, stored=f"src/{LEAF}")
        before = tree(drive_dir)
        res = c.put(f"/api/files/{rec.id}/move", json={"target_folder_path": "dest"})
        assert res.status_code == 409
        assert tree(drive_dir) == before

    def test_i7_upload_init_onto_an_existing_name_is_409(self, env):
        c, db, drive_dir, _ = env
        self._folder_with_nfd_file(drive_dir)
        res = c.post(f"/api/drives/{TEST_DRIVE}/upload/init", json={
            "filename": LEAF, "file_size": 10, "folder_path": "dest", "chunk_size": 10})
        assert res.status_code == 409

    def test_i7_text_file_in_error_mode_is_409(self, env):
        c, db, drive_dir, _ = env
        d = drive_dir / "dest"
        d.mkdir()
        (d / nfd("ぼめも.md")).write_text("old")
        res = c.post(f"/api/drives/{TEST_DRIVE}/files", json={
            "path": "dest/ぼめも.md", "content": "new", "conflict_mode": "error"})
        assert res.status_code == 409
        assert names(d) == [nfd("ぼめも.md")]
        assert (d / nfd("ぼめも.md")).read_text() == "old"

    def test_i7_text_file_in_rename_mode_gets_a_suffix_and_keeps_the_original(self, env):
        c, db, drive_dir, _ = env
        d = drive_dir / "dest"
        d.mkdir()
        (d / nfd("ぼめも.md")).write_text("old")
        res = c.post(f"/api/drives/{TEST_DRIVE}/files", json={"path": "dest/ぼめも.md", "content": "new"})
        assert res.status_code == 201, res.text
        assert (d / nfd("ぼめも.md")).read_text() == "old"
        assert len(names(d)) == 2
        assert nfc("ぼめも.md") not in names(d)

    def test_i7_copy_onto_an_existing_name_answers_as_the_same_spelling_does(self, env):
        c, db, drive_dir, _ = env
        d = self._folder_with_nfd_file(drive_dir, data=b"old")
        control = drive_dir / "control"
        control.mkdir()
        (control / LEAF).write_bytes(b"old")
        src = seed(db, drive_dir, stored=f"src/{LEAF}", data=b"new")
        want = c.post(f"/api/files/{src.id}/copy", json={"target_folder_path": "control"})
        got = c.post(f"/api/files/{src.id}/copy", json={"target_folder_path": "dest"})
        assert got.status_code == want.status_code
        assert len(names(d)) == len(names(control))
        assert nfc(LEAF) not in names(d)
        assert (d / nfd(LEAF)).read_bytes() == (control / LEAF).read_bytes()


# ---------------------------------------------------------------- I9

class TestScannerSeesNothingNew:
    def _scan(self, db):
        from app.services.scanner import _scan_and_register

        return _scan_and_register(db, TEST_DRIVE)

    def _rows(self, db):
        from app.models import File

        db.expire_all()
        return {f.id: (f.file_path, f.folder_path, f.deleted_at, f.missing_since)
                for f in db.query(File).all()}

    def test_i9_reads_leave_the_scan_unchanged(self, env):
        c, db, drive_dir, _ = env
        seed(db, drive_dir, on_disk=disk_rel(True, True), row=False)
        self._scan(db)
        rows = self._rows(db)
        assert len(rows) == 1
        (fid, (path, folder, _, _)), = rows.items()
        assert (path, folder) == (REL, FOLDER)
        assert c.get(f"/api/files/{fid}/stream").status_code == 200
        assert c.get(f"/api/files/{fid}/stream?download=true").status_code == 200
        c.get(f"/api/files/{fid}/thumbnail")
        result = self._scan(db)
        assert (result["added"], result["missing"], result["moved"]) == (0, 0, 0)
        assert self._rows(db) == rows

    def test_i9_create_and_upload_leave_the_scan_unchanged(self, env):
        c, db, drive_dir, _ = env
        (drive_dir / nfd(FOLDER)).mkdir()
        assert c.post(f"/api/drives/{TEST_DRIVE}/files",
                      json={"path": f"{FOLDER}/n.md", "content": "x"}).status_code == 201
        rows = self._rows(db)
        assert names(drive_dir) == [nfd(FOLDER)]
        result = self._scan(db)
        assert (result["added"], result["missing"], result["moved"]) == (0, 0, 0)
        assert self._rows(db) == rows
        assert {v[1] for v in rows.values()} == {FOLDER}


# ---------------------------------------------------------------- I10

class TestContainmentAndSymlinksStayAsToday:
    def test_i10_symlink_below_an_nfd_folder_is_rejected_like_below_an_nfc_folder(self, client, tmp_path):
        c, db, drive_dir, _ = client
        require_sensitive_fs(drive_dir)
        outside = tmp_path / "outside.mp4"
        shutil.copy(FIXTURES_DIR / "short_video.mp4", outside)
        from app.models import File

        def stream(folder_on_disk):
            d = drive_dir / folder_on_disk
            d.mkdir()
            (d / "link.mp4").symlink_to(outside)
            row = File(filename="link.mp4", title="link", drive=TEST_DRIVE, folder_path=FOLDER,
                       file_path=f"{FOLDER}/link.mp4", file_size=1, file_type="video",
                       mime_type="video/mp4")
            db.add(row)
            db.commit()
            db.refresh(row)
            res = c.get(f"/api/files/{row.id}/stream")
            db.delete(row)
            db.commit()
            shutil.rmtree(d)
            return res

        control = stream(nfc(FOLDER))
        assert control.status_code != 200
        assert stream(nfd(FOLDER)).status_code == control.status_code

    def test_i10_nfd_folder_that_is_a_symlink_out_of_the_drive_is_rejected_like_nfc(self, client, tmp_path):
        c, db, drive_dir, _ = client
        require_sensitive_fs(drive_dir)
        outside = tmp_path / "outside_dir"
        outside.mkdir()
        shutil.copy(FIXTURES_DIR / "short_video.mp4", outside / "x.mp4")
        from app.models import File

        def stream(folder_on_disk):
            (drive_dir / folder_on_disk).symlink_to(outside, target_is_directory=True)
            row = File(filename="x.mp4", title="x", drive=TEST_DRIVE, folder_path=FOLDER,
                       file_path=f"{FOLDER}/x.mp4", file_size=1, file_type="video", mime_type="video/mp4")
            db.add(row)
            db.commit()
            db.refresh(row)
            res = c.get(f"/api/files/{row.id}/stream")
            db.delete(row)
            db.commit()
            (drive_dir / folder_on_disk).unlink()
            return res

        control = stream(nfc(FOLDER))
        assert control.status_code != 200
        assert stream(nfd(FOLDER)).status_code == control.status_code


# ---------------------------------------------------------------- I11

class TestReadsAfterTheDiskChanges:
    def test_i11_old_path_is_not_found_after_the_file_is_removed(self, env):
        c, db, drive_dir, _ = env
        rec = seed(db, drive_dir, on_disk=disk_rel(True, True))
        assert c.get(f"/api/files/{rec.id}/stream").status_code == 200
        (drive_dir / nfd(FOLDER) / nfd(LEAF)).unlink()
        assert c.get(f"/api/files/{rec.id}/stream").status_code in (404, 410)

    def test_i11_a_replacement_under_the_exact_name_is_read_not_the_stale_entry(self, env):
        c, db, drive_dir, _ = env
        rec = seed(db, drive_dir, on_disk=disk_rel(True, True), data=b"old" * 100)
        assert c.get(f"/api/files/{rec.id}/stream").content == b"old" * 100
        shutil.rmtree(drive_dir / nfd(FOLDER))
        (drive_dir / FOLDER).mkdir()
        (drive_dir / FOLDER / LEAF).write_bytes(b"new" * 100)
        assert c.get(f"/api/files/{rec.id}/stream").content == b"new" * 100

    def test_i11_a_file_renamed_in_litloft_is_found_at_its_new_path_after_prior_reads(self, env):
        c, db, drive_dir, _ = env
        rec = seed(db, drive_dir, on_disk=disk_rel(True, True), data=b"data" * 100)
        assert c.get(f"/api/files/{rec.id}/stream").status_code == 200
        assert c.put(f"/api/files/{rec.id}/rename", json={"new_filename": "新.mp4"}).status_code == 200
        got = c.get(f"/api/files/{rec.id}/stream")
        assert got.status_code == 200
        assert got.content == b"data" * 100


# ---------------------------------------------------------------- I12

class TestAmbiguousNamesRefuseToChangeAnything:
    def _refuses(self, res, drive_dir, before):
        assert res.status_code == 409, res.text
        assert res.json()["detail"] == "Ambiguous file name on disk"
        assert tree(drive_dir) == before

    def test_i12_read_uses_the_first_by_sorted_bytes(self, env):
        c, db, drive_dir, _ = env
        rec = _ambiguous(db, drive_dir)
        first = min([AMBIG_FULL, AMBIG_MIXED], key=lambda s: s.encode("utf-8"))
        want = (drive_dir / FOLDER / first).read_bytes()
        got = c.get(f"/api/files/{rec.id}/stream")
        assert got.status_code == 200
        assert got.content == want

    def test_i12_rename(self, env):
        c, db, drive_dir, _ = env
        rec = _ambiguous(db, drive_dir)
        before = tree(drive_dir)
        self._refuses(c.put(f"/api/files/{rec.id}/rename", json={"new_filename": "x.mp4"}), drive_dir, before)

    def test_i12_move(self, env):
        c, db, drive_dir, _ = env
        rec = _ambiguous(db, drive_dir)
        (drive_dir / "dest").mkdir()
        before = tree(drive_dir)
        self._refuses(c.put(f"/api/files/{rec.id}/move", json={"target_folder_path": "dest"}), drive_dir, before)

    def test_i12_purge(self, env):
        c, db, drive_dir, _ = env
        rec = _ambiguous(db, drive_dir)
        assert c.delete(f"/api/files/{rec.id}").status_code == 200
        before = tree(drive_dir)
        self._refuses(c.delete(f"/api/files/{rec.id}/purge"), drive_dir, before)

    def test_i12_restore(self, env):
        c, db, drive_dir, _ = env
        rec = _ambiguous(db, drive_dir)
        assert c.delete(f"/api/files/{rec.id}").status_code == 200
        before = tree(drive_dir)
        self._refuses(c.post(f"/api/files/{rec.id}/restore"), drive_dir, before)

    def test_i12_ambiguous_ancestor_blocks_rename(self, env):
        c, db, drive_dir, _ = env
        stored_folder = nfc("ばば")
        full, mixed = nfd(stored_folder), nfd("ば") + "ば"
        assert len({stored_folder, full, mixed}) == 3
        rec = seed(db, drive_dir, stored=f"{stored_folder}/a.mp4", on_disk=f"{full}/a.mp4")
        (drive_dir / mixed).mkdir()
        before = tree(drive_dir)
        self._refuses(c.put(f"/api/files/{rec.id}/rename", json={"new_filename": "b.mp4"}), drive_dir, before)

    def test_i12_delete_folder(self, env):
        c, db, drive_dir, _ = env
        stored_folder = nfc("ばば")
        (drive_dir / nfd(stored_folder)).mkdir()
        (drive_dir / (nfd("ば") + "ば")).mkdir()
        before = tree(drive_dir)
        self._refuses(c.delete(f"/api/drives/{TEST_DRIVE}/folders", params={"path": stored_folder}),
                      drive_dir, before)


# ---------------------------------------------------------------- I12 (read-only resolve)

def test_i12_reads_create_and_rename_nothing_on_disk(env):
    c, db, drive_dir, _ = env
    rec = seed(db, drive_dir, on_disk=disk_rel(True, True))
    before = tree(drive_dir)
    assert c.get(f"/api/files/{rec.id}/stream").status_code == 200
    c.get(f"/api/files/{rec.id}/thumbnail")
    c.get(f"/api/files/{rec.id}")
    assert tree(drive_dir) == before
