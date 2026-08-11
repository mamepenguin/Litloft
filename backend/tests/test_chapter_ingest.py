from __future__ import annotations

import io
import shutil
from unittest.mock import patch

from app.models import File, FileChapter
from app.services.chapters import replace_chapters
from app.services.hash import compute_file_hash
from app.services.scanner import _scan_and_register, register_single_file
from tests.conftest import TEST_DRIVE


def _chapter(title: str, ordering: int = 0) -> dict[str, object]:
    return {
        "start_time": float(ordering),
        "end_time": float(ordering + 1),
        "title": title,
        "ordering": ordering,
    }


def _chapter_titles(db, file_id: str) -> list[str]:
    return [
        row.title
        for row in db.query(FileChapter)
        .filter(FileChapter.file_id == file_id)
        .order_by(FileChapter.ordering)
        .all()
    ]


def test_register_single_file_stores_mkv_chapters(client, chaptered_mkv):
    _, db, drive_dir, _ = client
    target = drive_dir / "single.mkv"
    shutil.copyfile(chaptered_mkv, target)

    file_id = register_single_file(db, TEST_DRIVE, target)
    db.commit()
    db.expire_all()

    record = db.get(File, file_id)
    assert record.chapters_probed_at is not None
    assert _chapter_titles(db, file_id) == ["Opening", "Closing"]


def test_bulk_scan_stores_mkv_chapters(client, chaptered_mkv):
    _, db, drive_dir, _ = client
    shutil.copyfile(chaptered_mkv, drive_dir / "bulk.mkv")

    _scan_and_register(db, TEST_DRIVE)
    db.expire_all()

    record = db.query(File).filter(File.file_path == "bulk.mkv").one()
    assert record.chapters_probed_at is not None
    assert _chapter_titles(db, record.id) == ["Opening", "Closing"]


def test_upload_stores_mkv_chapters(client, chaptered_mkv):
    http, db, _, _ = client
    payload = chaptered_mkv.read_bytes()
    response = http.post(
        f"/api/drives/{TEST_DRIVE}/upload/init",
        json={
            "filename": "uploaded.mkv",
            "file_size": len(payload),
            "chunk_size": len(payload),
        },
    )
    upload_id = response.json()["upload_id"]
    http.post(
        f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
        data={"chunk_index": "0"},
        files={"chunk": ("chunk", io.BytesIO(payload), "video/x-matroska")},
    )

    response = http.post(f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete")
    assert response.status_code == 200
    db.expire_all()

    record = db.query(File).filter(File.file_path == "uploaded.mkv").one()
    assert record.chapters_probed_at is not None
    assert _chapter_titles(db, record.id) == ["Opening", "Closing"]


def test_existing_media_with_null_stamp_is_backfilled(client):
    _, db, drive_dir, _ = client
    target = drive_dir / "existing.mkv"
    target.write_bytes(b"existing media")
    record = File(
        filename=target.name,
        title="Existing",
        drive=TEST_DRIVE,
        folder_path="",
        file_path=target.name,
        file_size=target.stat().st_size,
        file_type="video",
        mime_type="video/x-matroska",
        file_hash=compute_file_hash(target),
    )
    db.add(record)
    db.commit()

    with (
        patch("app.services.scanner.get_thumbnail_generator", return_value=None),
        patch(
            "app.services.chapters.get_media_chapters",
            return_value=[_chapter("Backfilled")],
        ) as probe,
    ):
        _scan_and_register(db, TEST_DRIVE)

    db.expire_all()
    assert probe.call_count == 1
    assert db.get(File, record.id).chapters_probed_at is not None
    assert _chapter_titles(db, record.id) == ["Backfilled"]


def test_chapterless_media_is_stamped_and_not_reprobed(client):
    _, db, drive_dir, _ = client
    target = drive_dir / "chapterless.mkv"
    target.write_bytes(b"chapterless media")

    with (
        patch("app.services.scanner.get_thumbnail_generator", return_value=None),
        patch("app.services.scanner.get_video_duration", return_value=None),
        patch("app.services.chapters.get_media_chapters", return_value=[]) as probe,
    ):
        _scan_and_register(db, TEST_DRIVE)
        _scan_and_register(db, TEST_DRIVE)

    db.expire_all()
    record = db.query(File).filter(File.file_path == target.name).one()
    assert probe.call_count == 1
    assert record.chapters_probed_at is not None
    assert _chapter_titles(db, record.id) == []


def test_probe_failure_does_not_block_ingest(client):
    _, db, drive_dir, _ = client
    target = drive_dir / "broken.mkv"
    target.write_bytes(b"not really an mkv")

    with (
        patch("app.services.scanner.get_thumbnail_generator", return_value=None),
        patch("app.services.scanner.get_video_duration", return_value=None),
        patch("app.services.chapters.get_media_chapters", return_value=None),
    ):
        result = _scan_and_register(db, TEST_DRIVE)

    db.expire_all()
    record = db.query(File).filter(File.file_path == target.name).one()
    assert result["added"] == 1
    assert record.chapters_probed_at is not None
    assert _chapter_titles(db, record.id) == []


def test_loft_is_never_handed_to_ffprobe_or_ffmpeg(client):
    _, db, drive_dir, _ = client
    (drive_dir / "remote.loft").write_text('{"provider":"youtube"}')

    with patch("app.services.thumbnail.subprocess.run") as subprocess_run:
        _scan_and_register(db, TEST_DRIVE)

    db.expire_all()
    record = db.query(File).filter(File.file_path == "remote.loft").one()
    assert subprocess_run.call_count == 0
    assert record.chapters_probed_at is not None


def test_content_change_clears_stamp_and_reprobes(client):
    _, db, drive_dir, _ = client
    target = drive_dir / "changing.mkv"
    target.write_bytes(b"first version")

    with (
        patch("app.services.scanner.get_thumbnail_generator", return_value=None),
        patch("app.services.scanner.get_video_duration", return_value=None),
        patch(
            "app.services.chapters.get_media_chapters",
            side_effect=[[_chapter("First")], [_chapter("Second")]],
        ) as probe,
    ):
        _scan_and_register(db, TEST_DRIVE)
        target.write_bytes(b"second version with different content")
        _scan_and_register(db, TEST_DRIVE)

    db.expire_all()
    record = db.query(File).filter(File.file_path == target.name).one()
    assert probe.call_count == 2
    assert record.chapters_probed_at is not None
    assert _chapter_titles(db, record.id) == ["Second"]


def test_second_scan_does_not_touch_existing_chapter_set(client):
    _, db, drive_dir, _ = client
    target = drive_dir / "stable.mkv"
    target.write_bytes(b"stable content")

    with (
        patch("app.services.scanner.get_thumbnail_generator", return_value=None),
        patch("app.services.scanner.get_video_duration", return_value=None),
        patch(
            "app.services.chapters.get_media_chapters",
            return_value=[_chapter("Stable")],
        ) as probe,
    ):
        _scan_and_register(db, TEST_DRIVE)
        _scan_and_register(db, TEST_DRIVE)

    db.expire_all()
    record = db.query(File).filter(File.file_path == target.name).one()
    assert probe.call_count == 1
    assert _chapter_titles(db, record.id) == ["Stable"]


def test_backfill_does_not_replace_curated_set(client):
    _, db, drive_dir, _ = client
    target = drive_dir / "curated.mkv"
    target.write_bytes(b"curated content")
    record = File(
        filename=target.name,
        title="Curated",
        drive=TEST_DRIVE,
        folder_path="",
        file_path=target.name,
        file_size=target.stat().st_size,
        file_type="video",
        mime_type="video/x-matroska",
        file_hash=compute_file_hash(target),
    )
    db.add(record)
    db.flush()
    replace_chapters(db, record.id, [_chapter("Approved")], "curated")
    db.commit()

    with (
        patch("app.services.scanner.get_thumbnail_generator", return_value=None),
        patch(
            "app.services.chapters.get_media_chapters",
            return_value=[_chapter("Extracted")],
        ),
    ):
        _scan_and_register(db, TEST_DRIVE)

    db.expire_all()
    assert db.get(File, record.id).chapters_probed_at is not None
    assert _chapter_titles(db, record.id) == ["Approved"]
