import json
import shutil

import pytest
from datetime import UTC, datetime
from pathlib import Path

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

    def test_a_failed_thumbnail_copy_leaves_no_file_behind(self, client, monkeypatch):
        """The body lands before the thumbnail is copied, so a thumbnail that
        fails strands a *complete* file with no row pointing at it.

        Worse than the empty shell: it is byte-identical to a legitimate copy,
        so the next scan indexes it as a genuine second file and the one that
        did copy has already been suffixed around it.
        """
        c, db, drive_dir, data_dir = client
        first = _seed_with_thumbnail(db, drive_dir, data_dir, "a.mp4", folder="one")
        second = _seed(db, drive_dir, "a.mp4", folder="two")

        real_copy2 = shutil.copy2
        calls = {"n": 0}

        def fail_second(src, dst, *args, **kwargs):
            calls["n"] += 1
            # The first call is the file body; the second is its thumbnail.
            if calls["n"] == 2:
                raise OSError(28, "No space left on device")
            return real_copy2(src, dst, *args, **kwargs)

        monkeypatch.setattr("app.services.fileops.shutil.copy2", fail_second)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [first.id, second.id], "target_folder_path": "dest"},
        )

        assert res.status_code == 200
        assert res.json()["copied"] == 1
        assert sorted(p.name for p in (drive_dir / "dest").iterdir()) == ["a.mp4"]

    def test_a_copy_onto_a_missing_record_keeps_that_record(self, client):
        """The other side of the ghost case, and the one that needs no error.

        ``resolve_db_path_conflict`` retires a Missing record's path so the
        copy can take the name. Retiring is not deleting: the row holds watch
        history, tags and comments that cannot be rebuilt from the filesystem,
        and it is kept until the user says otherwise.
        """
        from app.models import File, WatchHistory

        c, db, drive_dir, data_dir = client
        source = _seed(db, drive_dir, "a.mp4", folder="one")
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

    def test_batch_copy_empty_ids(self, client):
        c, db, drive_dir, data_dir = client
        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [], "target_folder_path": "dest"},
        )
        assert res.status_code == 422  # Validation error
