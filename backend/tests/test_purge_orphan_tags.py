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
