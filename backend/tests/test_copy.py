import json
import shutil

import pytest
from datetime import UTC, datetime
from pathlib import Path

from app.services import fileops
from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir, filename="test.mp4", folder="旅行"):
    d = drive_dir / folder
    d.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", d / filename)

    from app.models import File
    file = File(
        filename=filename,
        title="Test",
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=f"{folder}/{filename}",
        file_size=d.joinpath(filename).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _seed_with_thumbnail(db, drive_dir, data_dir, filename="test.mp4", folder="旅行"):
    """Seed a file and create a fake thumbnail for it."""
    file = _seed(db, drive_dir, filename, folder)

    import app.config as config
    thumb_rel = f"{TEST_DRIVE}/{folder}/{Path(filename).stem}.jpg"
    thumb_path = config.THUMBNAILS_DIR / thumb_rel
    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    thumb_path.write_bytes(b"\xff\xd8\xff\xe0fake-jpeg")
    file.thumbnail_path = thumb_rel
    db.commit()
    db.refresh(file)
    return file



class TestCopyFileService:
    def test_basic_copy_same_folder(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["id"] != file.id
        assert data["filename"] == "test_copy.mp4"
        assert data["folder_path"] == "旅行"
        assert data["liked_at"] is None
        assert data["is_favorite"] is False
        assert (drive_dir / "旅行" / "test_copy.mp4").exists()
        assert (drive_dir / "旅行" / "test.mp4").exists()

    def test_copy_to_different_folder(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        (drive_dir / "料理").mkdir(exist_ok=True)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "料理"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["filename"] == "test.mp4"  # No collision, original name kept
        assert data["folder_path"] == "料理"
        assert (drive_dir / "料理" / "test.mp4").exists()
        assert (drive_dir / "旅行" / "test.mp4").exists()

    def test_copy_to_root(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": ""},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["folder_path"] == ""
        assert data["filename"] == "test.mp4"
        assert (drive_dir / "test.mp4").exists()

    def test_filename_collision_copy_suffix(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        # First copy creates _copy
        res1 = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res1.status_code == 200
        assert res1.json()["filename"] == "test_copy.mp4"

        # Second copy creates _copy_2
        res2 = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res2.status_code == 200
        assert res2.json()["filename"] == "test_copy_2.mp4"

        # Third copy creates _copy_3
        res3 = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res3.status_code == 200
        assert res3.json()["filename"] == "test_copy_3.mp4"

    def test_copy_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.post(
            "/api/files/zzNOTFOUNDzz/copy",
            json={"target_folder_path": ""},
        )
        assert res.status_code == 404

    def test_copy_path_traversal(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "../../../tmp"},
        )
        assert res.status_code == 400

    def test_copy_preserves_metadata(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        file.description = "Original description"
        db.commit()

        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["description"] == "Original description"
        assert data["file_type"] == "video"
        assert data["mime_type"] == "video/mp4"

    def test_copy_resets_like_and_favorite(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        file.liked_at = datetime(2026, 5, 1, tzinfo=UTC)
        file.is_favorite = True
        db.commit()

        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["liked_at"] is None
        assert data["is_favorite"] is False

    def test_copy_thumbnail(self, client):
        c, db, drive_dir, data_dir = client
        import app.config as config
        file = _seed_with_thumbnail(db, drive_dir, data_dir)

        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res.status_code == 200
        new_id = res.json()["id"]
        new_thumb_rel = f"{TEST_DRIVE}/旅行/test_copy.jpg"
        assert (config.THUMBNAILS_DIR / new_thumb_rel).exists()
        assert (config.THUMBNAILS_DIR / file.thumbnail_path).exists()


    def test_copy_creates_target_folder(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "新しいフォルダ"},
        )
        assert res.status_code == 200
        assert (drive_dir / "新しいフォルダ" / "test.mp4").exists()


class TestCopyFileCrossDrive:
    def test_cross_drive_copy(self, client):
        c, db, drive_dir, data_dir = client
        import app.config as config

        drive2_dir = drive_dir.parent / "drive2"
        drive2_dir.mkdir(parents=True)
        drives_json = config.DRIVES_CONFIG
        drives_json.write_text(json.dumps([
            {"name": TEST_DRIVE, "path": str(drive_dir)},
            {"name": "drive2", "path": str(drive2_dir)},
        ]))
        config._drives_cache = None

        file = _seed(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "", "target_drive": "drive2"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["drive"] == "drive2"
        assert data["filename"] == "test.mp4"
        assert (drive2_dir / "test.mp4").exists()
        assert (drive_dir / "旅行" / "test.mp4").exists()


class TestBatchCopy:
    def test_batch_copy(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed(db, drive_dir, "a.mp4")
        f2 = _seed(db, drive_dir, "b.mp4")
        (drive_dir / "dest").mkdir(exist_ok=True)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [f1.id, f2.id], "target_folder_path": "dest"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["copied"] == 2
        assert len(data["errors"]) == 0
        assert (drive_dir / "dest" / "a.mp4").exists()
        assert (drive_dir / "dest" / "b.mp4").exists()

    def test_batch_copy_partial_failure(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed(db, drive_dir, "a.mp4")

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [f1.id, "zzNOTFOUNDzz"], "target_folder_path": "dest"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["copied"] == 1
        assert len(data["errors"]) == 1
        assert data["errors"][0]["id"] == "zzNOTFOUNDzz"

    def test_a_failed_copy_leaves_no_file_behind(self, client, monkeypatch):
        """The destination is created before it is written, and a write that
        fails must not leave the empty shell holding the name.

        The batch continues past a failure, so the shell is met by the files
        after it: `_resolve_copy_filename` sees a name that is taken and
        suffixes around it, and the drive scan later indexes an empty file
        sitting beside the real one.
        """
        c, db, drive_dir, data_dir = client
        first = _seed(db, drive_dir, "a.mp4", folder="one")
        second = _seed(db, drive_dir, "a.mp4", folder="two")

        real_copy2 = shutil.copy2
        calls = {"n": 0}

        def fail_first(src, dst, *args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise OSError(28, "No space left on device")
            return real_copy2(src, dst, *args, **kwargs)

        monkeypatch.setattr("app.services.fileops.shutil.copy2", fail_first)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [first.id, second.id], "target_folder_path": "dest"},
        )

        assert res.status_code == 200
        assert res.json()["copied"] == 1
        # The one that copied keeps the name it asked for, because the one
        # that failed left nothing holding it.
        assert sorted(p.name for p in (drive_dir / "dest").iterdir()) == ["a.mp4"]

    def test_batch_copy_survives_a_filesystem_error_on_one_file(self, client, monkeypatch):
        """A copy that fails outside an HTTPException must not abort the batch.

        ``copy_file`` reaches ``shutil.copy2`` with no handler of its own, so a
        full or read-only destination arrives here as a bare OSError. Before
        this was caught, the whole request 500'd after earlier files had
        already been committed one at a time — the caller was told nothing
        about the ones that had landed, and repeating the paste duplicated
        them.
        """
        c, db, drive_dir, data_dir = client
        f1 = _seed(db, drive_dir, "a.mp4")
        f2 = _seed(db, drive_dir, "b.mp4")

        real_copy2 = shutil.copy2

        def fail_on_b(src, dst, *args, **kwargs):
            if Path(src).name == "b.mp4":
                raise OSError(28, "No space left on device")
            return real_copy2(src, dst, *args, **kwargs)

        monkeypatch.setattr("app.services.fileops.shutil.copy2", fail_on_b)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [f1.id, f2.id], "target_folder_path": "dest"},
        )

        assert res.status_code == 200
        data = res.json()
        assert data["copied"] == 1
        assert [e["id"] for e in data["errors"]] == [f2.id]
        assert (drive_dir / "dest" / "a.mp4").exists()

    def test_a_thumbnail_that_cannot_be_copied_does_not_fail_the_paste(
        self, client, monkeypatch
    ):
        """A thumbnail is a cache the next scan rebuilds. Reversing a file the
        user can see, because its picture did not follow, loses the only copy of
        something and keeps the copy of something replaceable."""
        import app.config as config
        from app.models import File

        c, db, drive_dir, data_dir = client
        first = _seed_with_thumbnail(db, drive_dir, data_dir, "a.mp4", folder="one")
        second = _seed(db, drive_dir, "b.mp4", folder="two")

        real_copy2 = shutil.copy2

        def fail_the_jpeg(src, dst, *args, **kwargs):
            if str(dst).endswith(".jpg") or ".jpg." in Path(dst).name:
                raise OSError(28, "No space left on device")
            return real_copy2(src, dst, *args, **kwargs)

        monkeypatch.setattr("app.services.fileops.shutil.copy2", fail_the_jpeg)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [first.id, second.id], "target_folder_path": "dest"},
        )

        assert res.status_code == 200
        assert res.json() == {"copied": 2, "errors": []}
        assert sorted(p.name for p in (drive_dir / "dest").iterdir()) == [
            "a.mp4",
            "b.mp4",
        ]
        landed = (
            db.query(File)
            .filter(File.drive == TEST_DRIVE, File.file_path == "dest/a.mp4")
            .one()
        )
        assert c.get(f"/api/files/{landed.id}/thumbnail").status_code == 200
        assert (
            sorted(p.name for p in (config.THUMBNAILS_DIR / TEST_DRIVE / "dest").glob("*"))
            == []
        )

    def test_a_copy_onto_a_missing_record_keeps_that_record(self, client):
        """The other side of the ghost case, and the one that needs no error.

        ``resolve_db_path_conflict`` retires a Missing record's path so the
        copy can take the name. Retiring is not deleting: the row holds watch
        history, tags and comments that cannot be rebuilt from the filesystem,
        and it is kept until the user says otherwise.
        """
        from app.models import File, WatchHistory

        c, db, drive_dir, data_dir = client
        # With a thumbnail on both sides, because the cache slot is derived
        # from the path: the copy takes the name and the slot together.
        source = _seed_with_thumbnail(db, drive_dir, data_dir, "a.mp4", folder="one")
        (drive_dir / "dest").mkdir(exist_ok=True)

        ghost = File(
            filename="a.mp4",
            title="Gone",
            drive=TEST_DRIVE,
            folder_path="dest",
            file_path="dest/a.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
            thumbnail_path=f"{TEST_DRIVE}/dest/a.jpg",
            missing_since=datetime.now(UTC),
        )
        db.add(ghost)
        db.commit()
        ghost_id = ghost.id
        db.add(
            WatchHistory(
                file_id=ghost_id,
                viewer_id="v" * 16,
                playback_position=5,
                duration=60,
                last_played_at=datetime.now(UTC),
            )
        )
        db.commit()

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [source.id], "target_folder_path": "dest"},
        )
        assert res.json()["copied"] == 1

        db.expire_all()
        kept = db.get(File, ghost_id)
        assert kept is not None, "the Missing record was destroyed by the copy"
        assert kept.file_path == f"__missing_{ghost_id}_dest/a.mp4"
        assert kept.missing_since is not None
        assert (
            db.query(WatchHistory).filter(WatchHistory.file_id == ghost_id).count() == 1
        )
        # And stops pointing at the thumbnail slot the copy has taken over.
        # Two rows naming one cache file means the Missing view shows the
        # other file's picture, and purging the ghost deletes a thumbnail
        # the live copy is using.
        copied_row = (
            db.query(File)
            .filter(File.drive == TEST_DRIVE, File.file_path == "dest/a.mp4")
            .one()
        )
        assert copied_row.thumbnail_path == f"{TEST_DRIVE}/dest/a.jpg"
        assert kept.thumbnail_path != copied_row.thumbnail_path

    def test_copying_a_moved_file_back_where_its_thumbnail_stayed(self, client):
        """No error injected: this is a file the reader can see, into a folder
        they can see.

        Only video thumbnails follow a move, so an image moved out of a folder
        still points at the thumbnail it left behind. Copying it back names
        that one file as both source and destination, which `copy2` refuses —
        and the copy did not happen, with nothing said.
        """
        c, db, drive_dir, data_dir = client
        f = _seed_with_thumbnail(db, drive_dir, data_dir, "photo.png", folder="dest")
        f.file_type = "image"
        f.mime_type = "image/png"
        db.commit()

        res = c.put(
            f"/api/files/{f.id}/move",
            json={"target_folder_path": "one"},
        )
        assert res.status_code == 200

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [f.id], "target_folder_path": "dest"},
        )

        assert res.status_code == 200
        data = res.json()
        assert data["errors"] == []
        assert data["copied"] == 1
        assert (drive_dir / "dest" / "photo.png").exists()

        from app.models import File

        copied_row = (
            db.query(File)
            .filter(File.drive == TEST_DRIVE, File.file_path == "dest/photo.png")
            .one()
        )
        # The slot holds the moved original's picture and the original still
        # names it. Handing the copy the same pointer means deleting either row
        # takes the other one's picture with it.
        assert copied_row.thumbnail_path is None
        assert c.delete(f"/api/files/{copied_row.id}").status_code == 200
        assert c.delete(f"/api/files/{copied_row.id}/purge").status_code == 200
        assert (
            c.get(f"/api/files/{f.id}/thumbnail").content
            == b"\xff\xd8\xff\xe0fake-jpeg"
        )

    def test_a_database_failure_leaves_no_file_behind(self, client, monkeypatch):
        """The third way out of the copy, and the one the two above cannot reach.

        The body is written and the thumbnail is copied before anything is
        committed, so a database error arrives with a complete file already at
        the destination. Both other failures are OSErrors; this one is not,
        and it is what a concurrent scan locking SQLite looks like.
        """
        c, db, drive_dir, data_dir = client
        first = _seed(db, drive_dir, "a.mp4", folder="one")
        second = _seed(db, drive_dir, "a.mp4", folder="two")

        from sqlalchemy.exc import SQLAlchemyError

        real = fileops.remove_empty_folder_if_has_files
        calls = {"n": 0}

        def fail_first(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise SQLAlchemyError("database is locked")
            return real(*args, **kwargs)

        monkeypatch.setattr(fileops, "remove_empty_folder_if_has_files", fail_first)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [first.id, second.id], "target_folder_path": "dest"},
        )

        assert res.status_code == 200
        data = res.json()
        assert data["copied"] == 1
        assert [e["id"] for e in data["errors"]] == [first.id]
        # The message the user is handed says the filesystem was reversed.
        assert "filesystem reversed" in data["errors"][0]["error"]
        assert sorted(p.name for p in (drive_dir / "dest").iterdir()) == ["a.mp4"]

    def test_losing_the_race_leaves_the_winner_s_file_alone(self, client, monkeypatch):
        """The 409 is raised outside the cleanup on purpose.

        Losing the exclusive create means another writer owns that path, so
        this request must not touch it. Patching `os.open` cannot show that —
        with no file on disk there is nothing for a stray unlink to remove —
        so the race is built instead: the name is free when it is chosen and
        taken by the time the create runs.
        """
        c, db, drive_dir, data_dir = client
        source = _seed(db, drive_dir, "a.mp4", folder="one")
        (drive_dir / "dest").mkdir(exist_ok=True)

        owned = drive_dir / "dest" / "a.mp4"

        def take_the_name(target_dir, original_filename):
            owned.write_bytes(b"OWNED-BY-THE-OTHER-REQUEST")
            return original_filename

        monkeypatch.setattr(fileops, "_resolve_copy_filename", take_the_name)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [source.id], "target_folder_path": "dest"},
        )

        assert res.json()["copied"] == 0
        assert owned.exists(), "the 409 deleted a file this request did not create"
        assert owned.read_bytes() == b"OWNED-BY-THE-OTHER-REQUEST"

    @pytest.mark.parametrize("failure", ["write", "exclusive-create"])
    def test_a_failure_does_not_carry_a_ghost_into_the_next_commit(
        self, client, monkeypatch, failure
    ):
        """A copy that fails after the path-conflict step must take its
        pending session state with it.

        ``resolve_db_path_conflict`` retires a Missing record's ``file_path``
        and flushes it before anything touches the filesystem. If the copy
        then fails and the loop carries on, the next file's commit writes that
        retirement out — so an unrelated file failing strands the Missing
        record's history under a placeholder nobody points at.

        The failing id is **first**: with it last, nothing commits afterwards
        and the rollback cannot be observed. The two parameters are the two
        ways ``copy_file`` fails after the flush — a refused write, and the
        exclusive create finding the path taken.
        """
        from app.models import File

        c, db, drive_dir, data_dir = client
        first = _seed(db, drive_dir, "a.mp4", folder="one")
        second = _seed(db, drive_dir, "b.mp4", folder="one")
        (drive_dir / "dest").mkdir(exist_ok=True)

        ghost = File(
            filename="a.mp4",
            title="Gone",
            drive=TEST_DRIVE,
            folder_path="dest",
            file_path="dest/a.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
            missing_since=datetime.now(UTC),
        )
        db.add(ghost)
        db.commit()
        ghost_id = ghost.id

        if failure == "write":
            real_copy2 = shutil.copy2
            calls = {"n": 0}

            def fail_first(src, dst, *args, **kwargs):
                calls["n"] += 1
                if calls["n"] == 1:
                    raise OSError(28, "No space left on device")
                return real_copy2(src, dst, *args, **kwargs)

            monkeypatch.setattr("app.services.fileops.shutil.copy2", fail_first)
        else:
            import os as _os

            real_open = _os.open
            calls = {"n": 0}

            def fail_first_open(path, *args, **kwargs):
                if str(path).endswith("dest/a.mp4"):
                    calls["n"] += 1
                    if calls["n"] == 1:
                        raise FileExistsError()
                return real_open(path, *args, **kwargs)

            monkeypatch.setattr("app.services.fileops.os.open", fail_first_open)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [first.id, second.id], "target_folder_path": "dest"},
        )

        assert res.status_code == 200
        data = res.json()
        # The population: the second file has to commit, or the rollback the
        # first one needed is never put to the test.
        assert data["copied"] == 1
        assert [e["id"] for e in data["errors"]] == [first.id]

        db.expire_all()
        assert db.get(File, ghost_id).file_path == "dest/a.mp4"

    def test_batch_copy_announces_the_copies_it_made(self, client, monkeypatch):
        """A partial batch says what it created, and says the new ids.

        Before the loop caught this failure the emit was skipped entirely,
        even though the earlier copies were already committed — every open
        tab learned of them only at the next scan.
        """
        c, db, drive_dir, data_dir = client
        first = _seed(db, drive_dir, "a.mp4", folder="one")
        second = _seed(db, drive_dir, "b.mp4", folder="one")

        real_copy2 = shutil.copy2
        calls = {"n": 0}

        def fail_first(src, dst, *args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise OSError(28, "No space left on device")
            return real_copy2(src, dst, *args, **kwargs)

        monkeypatch.setattr("app.services.fileops.shutil.copy2", fail_first)

        # `emit_from_thread` schedules onto a stored loop that the test
        # client does not run, so it is the call itself that is observed.
        emitted: list[tuple[str, dict]] = []
        from app.services import event_hooks

        monkeypatch.setattr(
            event_hooks,
            "emit_from_thread",
            lambda event, data, drives=None: emitted.append((event, data)),
        )

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [first.id, second.id], "target_folder_path": "dest"},
        )
        assert res.json()["copied"] == 1

        created = [e for e in emitted if e[0] == "files.created"]
        assert len(created) == 1
        # Read from the database rather than described by what it is not: an
        # id that is merely "neither source" still resolves to nothing, and
        # every consumer of this event resolves the id it is given.
        from app.models import File

        landed = (
            db.query(File)
            .filter(File.drive == TEST_DRIVE, File.file_path == "dest/b.mp4")
            .one()
        )
        assert created[0][1]["file_ids"] == [landed.id]

    def test_a_copy_onto_a_missing_note_keeps_its_picture(self, client):
        """A note's thumbnail is a projection keyed by its row id, so the copy
        taking the note's *path* takes no slot from it. Clearing the pointer
        there loses the Missing view's picture and strands the JPEG, which the
        purge unlinks through that same pointer."""
        import app.config as config
        from app.models import File

        c, db, drive_dir, data_dir = client
        (drive_dir / "one").mkdir(exist_ok=True)
        (drive_dir / "one" / "a.md").write_text("# note\n", encoding="utf-8")
        source = File(
            filename="a.md",
            title="Note",
            drive=TEST_DRIVE,
            folder_path="one",
            file_path="one/a.md",
            file_size=7,
            file_type="document",
            mime_type="text/markdown",
        )
        db.add(source)
        (drive_dir / "dest").mkdir(exist_ok=True)
        ghost = File(
            filename="a.md",
            title="Gone",
            drive=TEST_DRIVE,
            folder_path="dest",
            file_path="dest/a.md",
            file_size=1,
            file_type="document",
            mime_type="text/markdown",
            missing_since=datetime.now(UTC),
        )
        db.add(ghost)
        db.commit()
        ghost_id = ghost.id

        projection_rel = f"{TEST_DRIVE}/.markdown/{ghost_id}-abcdefghijkl.jpg"
        projection = config.THUMBNAILS_DIR / projection_rel
        projection.parent.mkdir(parents=True, exist_ok=True)
        projection.write_bytes(b"\xff\xd8\xff\xe0ghost-projection")
        ghost.thumbnail_path = projection_rel
        db.commit()

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [source.id], "target_folder_path": "dest"},
        )
        assert res.json()["copied"] == 1

        db.expire_all()
        kept = db.get(File, ghost_id)
        assert kept.thumbnail_path == projection_rel
        assert projection.exists()

        assert c.delete(f"/api/files/{ghost_id}/purge").status_code == 200
        assert not projection.exists(), "the purge could no longer reach the JPEG"

    def test_a_database_failure_leaves_the_slot_as_it_found_it(
        self, client, monkeypatch
    ):
        """The span writes more than the body, and the thumbnail lands on a slot
        the Missing record already owns. Writing onto it destroys that record's
        picture before the copy is known to have worked; deleting it afterwards
        does not give the picture back."""
        import app.config as config
        from app.models import File
        from sqlalchemy.exc import SQLAlchemyError

        c, db, drive_dir, data_dir = client
        source = _seed_with_thumbnail(db, drive_dir, data_dir, "a.mp4", folder="one")
        (config.THUMBNAILS_DIR / source.thumbnail_path).write_bytes(
            b"\xff\xd8\xff\xe0SOURCE-PICTURE"
        )
        (drive_dir / "dest").mkdir(exist_ok=True)

        ghost_thumb_rel = f"{TEST_DRIVE}/dest/a.jpg"
        ghost_thumb = config.THUMBNAILS_DIR / ghost_thumb_rel
        ghost_thumb.parent.mkdir(parents=True, exist_ok=True)
        ghost_thumb.write_bytes(b"\xff\xd8\xff\xe0GHOST-PICTURE")
        ghost = File(
            filename="a.mp4",
            title="Gone",
            drive=TEST_DRIVE,
            folder_path="dest",
            file_path="dest/a.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
            thumbnail_path=ghost_thumb_rel,
            missing_since=datetime.now(UTC),
        )
        db.add(ghost)
        db.commit()
        ghost_id = ghost.id

        def fail(*args, **kwargs):
            raise SQLAlchemyError("database is locked")

        monkeypatch.setattr(fileops, "remove_empty_folder_if_has_files", fail)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [source.id], "target_folder_path": "dest"},
        )
        assert res.json()["copied"] == 0

        db.expire_all()
        kept = db.get(File, ghost_id)
        assert kept.thumbnail_path == ghost_thumb_rel
        assert ghost_thumb.read_bytes() == b"\xff\xd8\xff\xe0GHOST-PICTURE"
        assert c.get(f"/api/files/{ghost_id}/thumbnail").content == (
            b"\xff\xd8\xff\xe0GHOST-PICTURE"
        )
        assert sorted(p.name for p in ghost_thumb.parent.iterdir()) == ["a.jpg"]

    def test_a_thumbnail_the_cache_no_longer_holds_does_not_fail_the_copy(
        self, client
    ):
        """A pointer outliving its JPEG — a cache cleared to reclaim disk, a
        restore that skipped it — is not a reason to refuse the copy."""
        import app.config as config
        from app.models import File

        c, db, drive_dir, data_dir = client
        source = _seed_with_thumbnail(db, drive_dir, data_dir, "a.mp4", folder="one")
        (config.THUMBNAILS_DIR / source.thumbnail_path).unlink()

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [source.id], "target_folder_path": "dest"},
        )
        assert res.status_code == 200
        assert res.json() == {"copied": 1, "errors": []}
        copied_row = (
            db.query(File)
            .filter(File.drive == TEST_DRIVE, File.file_path == "dest/a.mp4")
            .one()
        )
        assert copied_row.thumbnail_path is None

    def test_two_names_for_one_thumbnail_do_not_fail_the_copy(self, client):
        """Source and destination slots can be one JPEG under two names — the
        drive is read through a mount that folds case and Unicode
        normalisation. `copy2` refuses those as firmly as it refuses one name
        twice."""
        import os

        import app.config as config
        from app.models import File

        c, db, drive_dir, data_dir = client
        source = _seed_with_thumbnail(db, drive_dir, data_dir, "a.mp4", folder="one")
        (drive_dir / "dest").mkdir(exist_ok=True)
        linked = config.THUMBNAILS_DIR / f"{TEST_DRIVE}/dest/a.jpg"
        linked.parent.mkdir(parents=True, exist_ok=True)
        os.link(config.THUMBNAILS_DIR / source.thumbnail_path, linked)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [source.id], "target_folder_path": "dest"},
        )
        assert res.status_code == 200
        assert res.json() == {"copied": 1, "errors": []}
        assert (drive_dir / "dest" / "a.mp4").exists()
        copied_row = (
            db.query(File)
            .filter(File.drive == TEST_DRIVE, File.file_path == "dest/a.mp4")
            .one()
        )
        # One JPEG under two names is one JPEG: naming it from the copy as well
        # means purging the copy takes the source's picture with it.
        assert copied_row.thumbnail_path is None
        assert c.delete(f"/api/files/{copied_row.id}").status_code == 200
        assert c.delete(f"/api/files/{copied_row.id}/purge").status_code == 200
        assert (
            c.get(f"/api/files/{source.id}/thumbnail").content
            == b"\xff\xd8\xff\xe0fake-jpeg"
        )

    def test_a_thumbnail_that_fails_midway_leaves_nothing_in_the_cache(
        self, client, monkeypatch
    ):
        """A copy that dies partway has already written bytes at its
        destination."""
        import app.config as config

        c, db, drive_dir, data_dir = client
        source = _seed_with_thumbnail(db, drive_dir, data_dir, "a.mp4", folder="one")
        real_copy2 = shutil.copy2
        calls = {"n": 0}

        def die_midway(src, dst, *args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 2:
                Path(dst).write_bytes(b"\xff\xd8half")
                raise OSError(28, "No space left on device")
            return real_copy2(src, dst, *args, **kwargs)

        monkeypatch.setattr("app.services.fileops.shutil.copy2", die_midway)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [source.id], "target_folder_path": "dest"},
        )
        assert res.json() == {"copied": 1, "errors": []}
        assert (drive_dir / "dest" / "a.mp4").exists()
        assert (
            sorted(p.name for p in (config.THUMBNAILS_DIR / TEST_DRIVE / "dest").glob("*"))
            == []
        )

    def test_a_copy_onto_a_missing_record_at_the_drive_root(self, client):
        """The retirement reads the slot out of the destination path, and a file
        at the top of a drive has no folder segment in it."""
        import app.config as config
        from app.models import File

        c, db, drive_dir, data_dir = client
        source = _seed_with_thumbnail(db, drive_dir, data_dir, "a.mp4", folder="one")
        root_thumb_rel = f"{TEST_DRIVE}/a.jpg"
        root_thumb = config.THUMBNAILS_DIR / root_thumb_rel
        root_thumb.parent.mkdir(parents=True, exist_ok=True)
        root_thumb.write_bytes(b"\xff\xd8\xff\xe0GHOST-PICTURE")
        ghost = File(
            filename="a.mp4",
            title="Gone",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="a.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
            thumbnail_path=root_thumb_rel,
            missing_since=datetime.now(UTC),
        )
        db.add(ghost)
        db.commit()
        ghost_id = ghost.id

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [source.id], "target_folder_path": ""},
        )
        assert res.json()["copied"] == 1

        db.expire_all()
        landed = (
            db.query(File)
            .filter(File.drive == TEST_DRIVE, File.file_path == "a.mp4")
            .one()
        )
        assert landed.thumbnail_path == root_thumb_rel
        assert db.get(File, ghost_id).thumbnail_path is None

    def test_a_failed_copy_of_a_note_leaves_no_projection_behind(
        self, client, monkeypatch
    ):
        """A note's thumbnail is projected under the new row's id, so a rollback
        takes away the only name that could ever reclaim it."""
        import app.config as config
        from sqlalchemy.exc import SQLAlchemyError
        from app.models import File

        c, db, drive_dir, data_dir = client
        (drive_dir / "one").mkdir(exist_ok=True)
        from PIL import Image

        image = drive_dir / "one" / "pic.png"
        Image.new("RGB", (64, 48), (30, 90, 150)).save(image)
        picture = File(
            filename="pic.png",
            title="Pic",
            drive=TEST_DRIVE,
            folder_path="one",
            file_path="one/pic.png",
            file_size=image.stat().st_size,
            file_type="image",
            mime_type="image/png",
        )
        db.add(picture)
        db.commit()
        note = drive_dir / "one" / "n.md"
        note.write_text(f"![pic](loft://{picture.id})\n", encoding="utf-8")
        row = File(
            filename="n.md",
            title="Note",
            drive=TEST_DRIVE,
            folder_path="one",
            file_path="one/n.md",
            file_size=note.stat().st_size,
            file_type="document",
            mime_type="text/markdown",
        )
        db.add(row)
        db.commit()

        projections = config.THUMBNAILS_DIR / TEST_DRIVE / ".markdown"

        assert (
            c.post(
                "/api/files/batch/copy",
                json={"ids": [row.id], "target_folder_path": "dest"},
            ).json()["copied"]
            == 1
        )
        after_success = sorted(p.name for p in projections.iterdir())
        assert len(after_success) == 1

        def fail(*args, **kwargs):
            raise SQLAlchemyError("database is locked")

        monkeypatch.setattr(fileops, "remove_empty_folder_if_has_files", fail)
        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [row.id], "target_folder_path": "dest"},
        )
        assert res.json()["copied"] == 0
        assert sorted(p.name for p in projections.iterdir()) == after_success

    def test_a_thumbnail_that_cannot_be_published_leaves_the_copy_alone(
        self, client, monkeypatch
    ):
        """The publish happens after the row is durable, so it must not run
        inside the handler that reverses the filesystem: a copy that arrived and
        was then deleted leaves a row naming nothing, which no later paste can
        get past."""
        from app.models import File
        from app.services import atomic_write

        c, db, drive_dir, data_dir = client
        source = _seed_with_thumbnail(db, drive_dir, data_dir, "a.mp4", folder="one")
        real_replace = atomic_write.os.replace

        def refuse_the_jpeg(src, dst, *args, **kwargs):
            if str(dst).endswith(".jpg"):
                raise OSError(30, "Read-only file system")
            return real_replace(src, dst, *args, **kwargs)

        monkeypatch.setattr(atomic_write.os, "replace", refuse_the_jpeg)
        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [source.id], "target_folder_path": "dest"},
        )
        monkeypatch.setattr(atomic_write.os, "replace", real_replace)

        assert res.json() == {"copied": 1, "errors": []}
        assert (drive_dir / "dest" / "a.mp4").exists()
        landed = (
            db.query(File)
            .filter(File.drive == TEST_DRIVE, File.file_path == "dest/a.mp4")
            .one()
        )
        assert c.get(f"/api/files/{landed.id}/thumbnail").status_code == 200

        again = c.post(
            "/api/files/batch/copy",
            json={"ids": [source.id], "target_folder_path": "dest"},
        )
        assert again.json() == {"copied": 1, "errors": []}
        assert (drive_dir / "dest" / "a_copy.mp4").exists()

    def test_a_copy_that_writes_no_thumbnail_leaves_the_ghost_its_own(self, client):
        """The retirement frees the *path*. A source with no thumbnail takes no
        cache slot, and the record's picture is how the Missing view shows it —
        and the only handle the purge has on that JPEG."""
        import app.config as config
        from app.models import File

        c, db, drive_dir, data_dir = client
        source = _seed(db, drive_dir, "a.mp4", folder="one")
        (drive_dir / "dest").mkdir(exist_ok=True)
        ghost_thumb_rel = f"{TEST_DRIVE}/dest/a.jpg"
        ghost_thumb = config.THUMBNAILS_DIR / ghost_thumb_rel
        ghost_thumb.parent.mkdir(parents=True, exist_ok=True)
        ghost_thumb.write_bytes(b"\xff\xd8\xff\xe0GHOST-PICTURE")
        ghost = File(
            filename="a.mp4",
            title="Gone",
            drive=TEST_DRIVE,
            folder_path="dest",
            file_path="dest/a.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
            thumbnail_path=ghost_thumb_rel,
            missing_since=datetime.now(UTC),
        )
        db.add(ghost)
        db.commit()
        ghost_id = ghost.id

        assert (
            c.post(
                "/api/files/batch/copy",
                json={"ids": [source.id], "target_folder_path": "dest"},
            ).json()["copied"]
            == 1
        )

        db.expire_all()
        assert db.get(File, ghost_id).thumbnail_path == ghost_thumb_rel
        assert c.get(f"/api/files/{ghost_id}/thumbnail").content == (
            b"\xff\xd8\xff\xe0GHOST-PICTURE"
        )
        assert c.delete(f"/api/files/{ghost_id}/purge").status_code == 200
        assert not ghost_thumb.exists(), "the purge could no longer reach the JPEG"

    def test_a_publish_that_fails_leaves_the_picture_where_it_was(
        self, client, monkeypatch
    ):
        """Who names a JPEG follows the write, not the intention to write. The
        record retired out of this path is the only handle the purge has on its
        thumbnail, and the arriving row must not inherit a picture that is not
        of it."""
        import app.config as config
        from app.models import File
        from app.services import atomic_write

        c, db, drive_dir, data_dir = client
        source = _seed_with_thumbnail(db, drive_dir, data_dir, "a.mp4", folder="one")
        (drive_dir / "dest").mkdir(exist_ok=True)
        ghost_thumb_rel = f"{TEST_DRIVE}/dest/a.jpg"
        ghost_thumb = config.THUMBNAILS_DIR / ghost_thumb_rel
        ghost_thumb.parent.mkdir(parents=True, exist_ok=True)
        ghost_thumb.write_bytes(b"\xff\xd8\xff\xe0GHOST-PICTURE")
        ghost = File(
            filename="a.mp4",
            title="Gone",
            drive=TEST_DRIVE,
            folder_path="dest",
            file_path="dest/a.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
            thumbnail_path=ghost_thumb_rel,
            missing_since=datetime.now(UTC),
        )
        db.add(ghost)
        db.commit()
        ghost_id = ghost.id

        real_replace = atomic_write.os.replace

        def refuse_the_jpeg(src, dst, *args, **kwargs):
            if str(dst).endswith(".jpg"):
                raise OSError(30, "Read-only file system")
            return real_replace(src, dst, *args, **kwargs)

        monkeypatch.setattr(atomic_write.os, "replace", refuse_the_jpeg)
        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [source.id], "target_folder_path": "dest"},
        )
        monkeypatch.setattr(atomic_write.os, "replace", real_replace)

        assert res.json() == {"copied": 1, "errors": []}
        db.expire_all()
        landed = (
            db.query(File)
            .filter(File.drive == TEST_DRIVE, File.file_path == "dest/a.mp4")
            .one()
        )
        assert landed.thumbnail_path is None
        kept = db.get(File, ghost_id)
        assert kept.thumbnail_path == ghost_thumb_rel
        assert c.get(f"/api/files/{ghost_id}/thumbnail").content == (
            b"\xff\xd8\xff\xe0GHOST-PICTURE"
        )
        assert c.delete(f"/api/files/{ghost_id}/purge").status_code == 200
        assert not ghost_thumb.exists(), "the purge could no longer reach the JPEG"

    def test_a_copy_leaves_a_retired_record_pointing_elsewhere_alone(self, client):
        """Being retired out of the path is not the same as owning the slot the
        arriving file writes. A record whose picture lives somewhere else keeps
        it — the purge has no other way to reach that JPEG."""
        import app.config as config
        from app.models import File

        c, db, drive_dir, data_dir = client
        source = _seed_with_thumbnail(db, drive_dir, data_dir, "a.mp4", folder="one")
        (drive_dir / "dest").mkdir(exist_ok=True)
        elsewhere_rel = f"{TEST_DRIVE}/attic/a.jpg"
        elsewhere = config.THUMBNAILS_DIR / elsewhere_rel
        elsewhere.parent.mkdir(parents=True, exist_ok=True)
        elsewhere.write_bytes(b"\xff\xd8\xff\xe0GHOST-PICTURE")
        ghost = File(
            filename="a.mp4",
            title="Gone",
            drive=TEST_DRIVE,
            folder_path="dest",
            file_path="dest/a.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
            thumbnail_path=elsewhere_rel,
            missing_since=datetime.now(UTC),
        )
        db.add(ghost)
        db.commit()
        ghost_id = ghost.id

        assert (
            c.post(
                "/api/files/batch/copy",
                json={"ids": [source.id], "target_folder_path": "dest"},
            ).json()["copied"]
            == 1
        )

        db.expire_all()
        assert db.get(File, ghost_id).thumbnail_path == elsewhere_rel
        assert c.delete(f"/api/files/{ghost_id}/purge").status_code == 200
        assert not elsewhere.exists(), "the purge could no longer reach the JPEG"

    def test_a_copied_note_does_not_take_the_path_slot(self, client):
        """A note's picture is a projection keyed by its row id. Copying it into
        the generic slot would hand that slot to a row that does not own it."""
        import app.config as config
        from app.models import File

        c, db, drive_dir, data_dir = client
        (drive_dir / "one").mkdir(exist_ok=True)
        (drive_dir / "one" / "n.md").write_text("# note\n", encoding="utf-8")
        projection_rel = f"{TEST_DRIVE}/.markdown/source-image.jpg"
        projection = config.THUMBNAILS_DIR / projection_rel
        projection.parent.mkdir(parents=True, exist_ok=True)
        projection.write_bytes(b"\xff\xd8\xff\xe0NOTE-PROJECTION")
        note = File(
            filename="n.md",
            title="Note",
            drive=TEST_DRIVE,
            folder_path="one",
            file_path="one/n.md",
            file_size=7,
            file_type="document",
            mime_type="text/markdown",
            thumbnail_path=projection_rel,
        )
        db.add(note)
        db.commit()

        assert (
            c.post(
                "/api/files/batch/copy",
                json={"ids": [note.id], "target_folder_path": "dest"},
            ).json()["copied"]
            == 1
        )

        copied_row = (
            db.query(File)
            .filter(File.drive == TEST_DRIVE, File.file_path == "dest/n.md")
            .one()
        )
        assert copied_row.thumbnail_path != f"{TEST_DRIVE}/dest/n.jpg"
        assert not (config.THUMBNAILS_DIR / TEST_DRIVE / "dest" / "n.jpg").exists()

    def test_batch_copy_empty_ids(self, client):
        c, db, drive_dir, data_dir = client
        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [], "target_folder_path": "dest"},
        )
        assert res.status_code == 422  # Validation error
