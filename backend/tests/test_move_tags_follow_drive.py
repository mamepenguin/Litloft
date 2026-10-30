import shutil

from sqlalchemy import func

from app.models import File, Tag, file_tags
from tests.test_target_drive_access import (  # noqa: F401  (fixture)
    FIXTURES_DIR,
    LOCKED_DRIVE,
    LOCKED_PASSWORD,
    OPEN_DRIVE,
    two_drives,
)

SRC, DST = OPEN_DRIVE, LOCKED_DRIVE


def _unlock(c):
    assert c.post("/api/auth/unlock", json={"password": LOCKED_PASSWORD}).status_code == 200


def _seed(db, drive_dir, drive, filename, tags):
    shutil.copy(FIXTURES_DIR / "short_video.mp4", drive_dir / filename)
    row = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="",
        file_path=filename,
        file_size=(drive_dir / filename).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
    )
    for name in tags:
        tag = db.query(Tag).filter(Tag.drive == drive, Tag.name == name).first()
        row.tags.append(tag or Tag(name=name, drive=drive))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _tags(c, drive):
    res = c.get(f"/api/drives/{drive}/tags")
    assert res.status_code == 200
    return {t["name"]: t["count"] for t in res.json()}


def _move(c, file_id, drive):
    res = c.put(
        f"/api/files/{file_id}/move",
        json={"target_drive": drive, "target_folder_path": ""},
    )
    assert res.status_code == 200
    return res


def _rows_attached_to_nothing(db):
    return (
        db.query(Tag)
        .outerjoin(file_tags)
        .filter(file_tags.c.file_id.is_(None))
        .count()
    )


# UNSPEC: a file moved to another drive carries its tags into that drive's
# own tag list, and the drive it left no longer lists a tag only it used.
class TestMoveTagsFollowDrive:
    def test_tag_lists_of_both_drives_after_a_move(self, two_drives):
        c, db, open_dir, _ = two_drives
        _unlock(c)
        f = _seed(db, open_dir, SRC, "a.mp4", ["alpha", "beta"])

        _move(c, f.id, DST)

        assert _tags(c, SRC) == {}
        assert _tags(c, DST) == {"alpha": 1, "beta": 1}
        db.expire_all()
        assert {t.drive for t in db.get(File, f.id).tags} == {DST}

    def test_existing_destination_tag_is_reused_without_renaming(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        _unlock(c)
        _seed(db, locked_dir, DST, "other.mp4", ["Alpha"])
        f = _seed(db, open_dir, SRC, "a.mp4", ["alpha"])

        _move(c, f.id, DST)

        assert _tags(c, DST) == {"Alpha": 2}
        assert _tags(c, SRC) == {}

    def test_new_destination_tag_keeps_the_source_spelling(self, two_drives):
        c, db, open_dir, _ = two_drives
        _unlock(c)
        f = _seed(db, open_dir, SRC, "a.mp4", ["MixedCase"])

        _move(c, f.id, DST)

        assert _tags(c, DST) == {"MixedCase": 1}

    def test_source_tag_still_used_by_another_file_is_kept(self, two_drives):
        c, db, open_dir, _ = two_drives
        _unlock(c)
        f = _seed(db, open_dir, SRC, "a.mp4", ["shared", "solo"])
        _seed(db, open_dir, SRC, "b.mp4", ["shared"])

        _move(c, f.id, DST)

        assert _tags(c, SRC) == {"shared": 1}
        assert _tags(c, DST) == {"shared": 1, "solo": 1}

    def test_batch_move(self, two_drives):
        c, db, open_dir, _ = two_drives
        _unlock(c)
        f1 = _seed(db, open_dir, SRC, "a.mp4", ["alpha", "beta"])
        f2 = _seed(db, open_dir, SRC, "b.mp4", ["alpha"])

        res = c.put(
            "/api/files/batch/move",
            json={"ids": [f1.id, f2.id], "target_drive": DST, "target_folder_path": ""},
        )

        assert res.json()["moved"] == 2
        assert _tags(c, SRC) == {}
        assert _tags(c, DST) == {"alpha": 2, "beta": 1}

    def test_same_drive_move_leaves_tags_alone(self, two_drives):
        c, db, open_dir, _ = two_drives
        f = _seed(db, open_dir, SRC, "a.mp4", ["alpha"])
        (open_dir / "sub").mkdir()
        tag_id = f.tags[0].id

        res = c.put(f"/api/files/{f.id}/move", json={"target_folder_path": "sub"})

        assert res.status_code == 200
        assert _tags(c, SRC) == {"alpha": 1}
        db.expire_all()
        assert [t.id for t in db.get(File, f.id).tags] == [tag_id]

    def test_purge_after_a_move_leaves_no_row_behind(self, two_drives):
        c, db, open_dir, _ = two_drives
        _unlock(c)
        f = _seed(db, open_dir, SRC, "a.mp4", ["alpha"])

        _move(c, f.id, DST)
        assert c.delete(f"/api/files/{f.id}").status_code == 200
        assert c.delete(f"/api/files/{f.id}/purge").status_code == 200

        db.expire_all()
        assert db.query(func.count(Tag.id)).scalar() == 0

    def test_failed_move_keeps_the_file_and_its_source_tags(self, two_drives, monkeypatch):
        import app.services.fileops as fileops

        c, db, open_dir, locked_dir = two_drives
        _unlock(c)
        f = _seed(db, open_dir, SRC, "a.mp4", ["alpha"])

        def boom(*_a, **_k):
            raise RuntimeError("db step failed")

        monkeypatch.setattr(fileops, "_ensure_empty_folder_tracked", boom)
        res = c.put(
            f"/api/files/{f.id}/move",
            json={"target_drive": DST, "target_folder_path": ""},
        )

        assert res.status_code == 500
        assert (open_dir / "a.mp4").exists()
        assert not (locked_dir / "a.mp4").exists()
        db.expire_all()
        row = db.get(File, f.id)
        assert row.drive == SRC
        assert [(t.name, t.drive) for t in row.tags] == [("alpha", SRC)]
        assert _tags(c, SRC) == {"alpha": 1}
        assert _tags(c, DST) == {}
        assert _rows_attached_to_nothing(db) == 0


def _drive_names_of_tags(db, file_id):
    db.expire_all()
    return {t.drive for t in db.get(File, file_id).tags}


# UNSPEC: a tag name matches its own case variants on the destination drive
# whatever script it is written in, and a move never fails on a tag name.
class TestNonAsciiTagNames:
    def test_the_same_non_ascii_name_is_reused(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        _unlock(c)
        _seed(db, locked_dir, DST, "other.mp4", ["Übung"])
        f = _seed(db, open_dir, SRC, "a.mp4", ["Übung"])

        _move(c, f.id, DST)

        assert _tags(c, DST) == {"Übung": 2}

    def test_a_non_ascii_case_variant_is_reused_without_renaming(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        _unlock(c)
        _seed(db, locked_dir, DST, "other.mp4", ["Übung"])
        f = _seed(db, open_dir, SRC, "a.mp4", ["übung"])

        _move(c, f.id, DST)

        assert _tags(c, DST) == {"Übung": 2}

    def test_a_destination_holding_two_variants_resolves_to_the_older_row(self, two_drives):
        c, db, open_dir, locked_dir = two_drives
        _unlock(c)
        _seed(db, locked_dir, DST, "one.mp4", ["Alpha"])
        _seed(db, locked_dir, DST, "two.mp4", ["ALPHA"])
        f = _seed(db, open_dir, SRC, "a.mp4", ["alpha"])

        _move(c, f.id, DST)

        assert _tags(c, DST) == {"Alpha": 2, "ALPHA": 1}


# UNSPEC: a move onto a path held by a trashed record keeps the moved file's
# tags, even when that record was the only user of the tag on the destination.
class TestMoveOntoTrashedRecord:
    def test_the_tag_the_trashed_record_alone_used_survives(self, two_drives):
        from datetime import UTC, datetime

        c, db, open_dir, locked_dir = two_drives
        _unlock(c)
        ghost = File(
            filename="a.mp4",
            title="ghost",
            drive=DST,
            folder_path="",
            file_path="a.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
            deleted_at=datetime.now(UTC),
        )
        ghost.tags.append(Tag(name="alpha", drive=DST))
        db.add(ghost)
        db.commit()
        f = _seed(db, open_dir, SRC, "a.mp4", ["alpha"])

        _move(c, f.id, DST)

        assert _tags(c, DST) == {"alpha": 1}
        assert _drive_names_of_tags(db, f.id) == {DST}


# UNSPEC: moving a file whose tag links point at a drive other than the one it
# sits on leaves no tag behind on any drive it left.
class TestMoveSweepsEveryDriveTheTagsCameFrom:
    def test_stale_links_to_a_third_drive_are_swept(self, two_drives):
        import json

        import app.config as config

        c, db, open_dir, locked_dir = two_drives
        _unlock(c)
        third_dir = open_dir.parent / "third"
        third_dir.mkdir()
        drives = json.loads(config.DRIVES_CONFIG.read_text())
        drives.append({"name": "third", "path": str(third_dir)})
        config.DRIVES_CONFIG.write_text(json.dumps(drives))
        config._drives_cache = None

        f = _seed(db, locked_dir, DST, "a.mp4", [])
        f.tags.append(Tag(name="alpha", drive=SRC))
        db.commit()
        assert _tags(c, SRC) == {"alpha": 1}

        res = c.put(
            f"/api/files/{f.id}/move",
            json={"target_drive": "third", "target_folder_path": ""},
        )

        assert res.status_code == 200
        assert _tags(c, SRC) == {}
        assert _tags(c, "third") == {"alpha": 1}
        assert _rows_attached_to_nothing(db) == 0
