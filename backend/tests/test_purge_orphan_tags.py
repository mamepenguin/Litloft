"""A hard delete takes the tags that only that file carried."""

import shutil
from datetime import UTC, datetime
from pathlib import Path

from app.models import File, Tag
from app.services import fileops
from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir, filename, tags, *, drive=TEST_DRIVE, state="active"):
    shutil.copy(FIXTURES_DIR / "short_video.mp4", drive_dir / filename)
    file = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="",
        file_path=filename,
        file_size=(drive_dir / filename).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
    )
    if state == "trash":
        file.deleted_at = datetime.now(UTC)
    elif state == "missing":
        file.missing_since = datetime.now(UTC)
    for name in tags:
        tag = (
            db.query(Tag).filter(Tag.drive == drive, Tag.name == name).first()
            or Tag(name=name, drive=drive)
        )
        file.tags.append(tag)
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _tag_names(db, drive=TEST_DRIVE):
    return sorted(t.name for t in db.query(Tag).filter(Tag.drive == drive).all())


def test_purging_a_trashed_file_takes_its_last_tag(client):
    _, db, drive_dir, _ = client
    file = _seed(db, drive_dir, "solo.mp4", ["holiday"], state="trash")

    fileops.purge_file(db, file.id)

    assert _tag_names(db) == []


def test_a_tag_another_file_still_carries_survives(client):
    _, db, drive_dir, _ = client
    kept = _seed(db, drive_dir, "kept.mp4", ["holiday"])
    doomed = _seed(db, drive_dir, "doomed.mp4", ["holiday", "beach"], state="trash")

    fileops.purge_file(db, doomed.id)

    assert _tag_names(db) == ["holiday"]
    db.refresh(kept)
    assert [t.name for t in kept.tags] == ["holiday"]


def test_trashing_a_file_keeps_its_tags(client):
    _, db, drive_dir, _ = client
    file = _seed(db, drive_dir, "later.mp4", ["holiday"])

    fileops.delete_file(db, file.id)

    assert _tag_names(db) == ["holiday"]


def test_purging_a_missing_file_takes_its_last_tag(client):
    _, db, drive_dir, _ = client
    file = _seed(db, drive_dir, "gone.mp4", ["holiday"], state="missing")
    (drive_dir / "gone.mp4").unlink()

    fileops.purge_missing_file(db, file.id)

    assert _tag_names(db) == []


def test_purge_all_trash_takes_every_orphan(client):
    _, db, drive_dir, _ = client
    _seed(db, drive_dir, "a.mp4", ["alpha"], state="trash")
    _seed(db, drive_dir, "b.mp4", ["beta"], state="trash")
    _seed(db, drive_dir, "c.mp4", ["gamma"])

    fileops.purge_all_trash(db, TEST_DRIVE)

    assert _tag_names(db) == ["gamma"]


def test_purge_all_missing_takes_every_orphan(client):
    _, db, drive_dir, _ = client
    for name in ("a.mp4", "b.mp4"):
        _seed(db, drive_dir, name, [f"tag-{name}"], state="missing")
        (drive_dir / name).unlink()

    fileops.purge_all_missing(db, TEST_DRIVE)

    assert _tag_names(db) == []


def test_a_purge_leaves_another_drive_alone(client):
    _, db, drive_dir, _ = client
    other = Tag(name="holiday", drive="other-drive")
    db.add(other)
    db.commit()
    file = _seed(db, drive_dir, "solo.mp4", ["holiday"], state="trash")

    fileops.purge_file(db, file.id)

    assert _tag_names(db) == []
    assert _tag_names(db, drive="other-drive") == ["holiday"]


def test_a_tag_held_only_by_a_trashed_file_survives_a_purge(client):
    _, db, drive_dir, _ = client
    _seed(db, drive_dir, "kept.mp4", ["holiday"], state="trash")
    doomed = _seed(db, drive_dir, "doomed.mp4", ["holiday"], state="trash")

    fileops.purge_file(db, doomed.id)

    assert _tag_names(db) == ["holiday"]


def test_a_tag_held_only_by_a_missing_file_survives_a_purge(client):
    _, db, drive_dir, _ = client
    _seed(db, drive_dir, "kept.mp4", ["holiday"], state="missing")
    doomed = _seed(db, drive_dir, "doomed.mp4", ["holiday"], state="trash")

    fileops.purge_file(db, doomed.id)

    assert _tag_names(db) == ["holiday"]


def test_a_ghost_purged_by_a_path_conflict_takes_its_tags(client):
    """Renaming or moving a file onto a path a trashed row still owns
    hard-deletes that row without going through physical_delete."""
    _, db, drive_dir, _ = client
    ghost = _seed(db, drive_dir, "solo.mp4", ["holiday"], state="trash")
    (drive_dir / "solo.mp4").unlink()

    assert fileops.resolve_db_path_conflict(db, "solo.mp4", TEST_DRIVE) is None
    db.commit()

    assert db.query(File).filter(File.id == ghost.id).first() is None
    assert _tag_names(db) == []


def test_a_ghost_purged_by_a_re_upload_takes_its_tags(client):
    c, db, drive_dir, _ = client
    ghost_id = _seed(db, drive_dir, "solo.mp4", ["holiday"], state="trash").id
    (drive_dir / "solo.mp4").unlink()

    body = b"hello world\n"
    init = c.post(
        f"/api/drives/{TEST_DRIVE}/upload/init",
        json={"filename": "solo.mp4", "folder_path": "", "file_size": len(body)},
    )
    assert init.status_code == 200, init.text
    upload_id = init.json()["upload_id"]
    chunk = c.post(
        f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
        files={"chunk": ("solo.mp4", body)},
        data={"chunk_index": "0"},
    )
    assert chunk.status_code == 200, chunk.text
    done = c.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
    assert done.status_code == 200, done.text

    db.expire_all()
    assert db.query(File).filter(File.id == ghost_id).first() is None
    assert _tag_names(db) == []
