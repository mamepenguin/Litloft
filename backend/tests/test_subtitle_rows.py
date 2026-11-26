"""Leftover subtitle rows and reserved subtitle names (SPEC-CORE-186).

I9, I10 and SPEC-CORE-185 I13.
"""
from datetime import UTC, datetime

import pytest

import app.services.event_hooks as event_hooks
from app.models import File
from app.services.scanner import _scan_and_register
from tests.conftest import TEST_DRIVE
from tests.subtitle_sidecar_helpers import (
    detail,
    names,
    rows,
    seed,
    sidecar,
    snapshot,
    upload,
)


@pytest.fixture()
def emits(monkeypatch):
    calls = []

    async def fake_emit(event, data, drives=None):
        calls.append((event, data, drives))

    def fake_emit_sync(event, data, drives=None):
        calls.append((event, data, drives))

    monkeypatch.setattr(event_hooks, "emit", fake_emit)
    monkeypatch.setattr(event_hooks, "emit_sync", fake_emit_sync)
    return calls


def _purged(calls):
    return [(data, drives) for event, data, drives in calls if event == "files.purged"]


class TestReservedNames:
    """SPEC-CORE-186 I9 (186.1): no rename or create may produce a subtitle name."""

    @pytest.mark.parametrize("name", ["x.srt", "x.vtt"])
    def test_a_video_cannot_be_renamed_to_a_subtitle_name(self, client, name):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.srt", b"mine")
        before = snapshot(drive_dir / "a")
        before_rows = rows(db)

        res = c.put(f"/api/files/{movie.id}/rename", json={"new_filename": name})

        assert res.status_code == 400
        assert detail(res)["code"] == "subtitle_extension_reserved"
        assert snapshot(drive_dir / "a") == before
        assert rows(db) == before_rows

    @pytest.mark.parametrize("legacy_name", ["legacy.srt", "legacy.vtt"])
    def test_a_batch_cannot_rename_a_row_into_a_subtitle_name(
        self, client, legacy_name
    ):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir, "movie.mp4")
        legacy = seed(db, drive_dir, legacy_name, file_type="subtitle",
                      mime="application/x-subrip")
        before = snapshot(drive_dir / "a")
        before_rows = rows(db)

        res = c.put(
            "/api/files/batch/rename",
            json={
                "ids": [movie.id, legacy.id],
                "mode": "template",
                "template": "clip_{n}",
            },
        )

        assert res.status_code == 400
        assert detail(res)["code"] == "subtitle_extension_reserved"
        assert snapshot(drive_dir / "a") == before
        assert rows(db) == before_rows

    @pytest.mark.parametrize("name", ["x.srt", "x.vtt"])
    def test_a_file_cannot_be_created_with_a_subtitle_name(self, client, name):
        c, _, drive_dir, _ = client

        res = c.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": name, "content": "not really a subtitle"},
        )

        assert res.status_code == 400
        assert detail(res)["code"] == "subtitle_extension_reserved"
        assert not (drive_dir / name).exists()

    def test_a_subtitle_upload_still_succeeds(self, client):
        c, _, drive_dir, _ = client

        done = upload(c, TEST_DRIVE, "a", "x.srt")

        assert done.json()["status"] == "sidecar"
        assert (drive_dir / "a" / "x.srt").exists()


class TestPurgingSubtitleRows:
    """SPEC-CORE-186 I9 (186.3): the row goes, the file at its path stays."""

    @pytest.mark.parametrize("state", ["trashed", "missing"])
    def test_purging_an_old_subtitle_row_leaves_the_file(self, client, state):
        c, db, drive_dir, _ = client
        extra = (
            {"deleted_at": datetime.now(UTC)}
            if state == "trashed"
            else {"missing_since": datetime.now(UTC)}
        )
        row = seed(
            db, drive_dir, "one.srt", file_type="subtitle",
            mime="application/x-subrip", **extra,
        )
        row_id = row.id

        res = c.delete(f"/api/files/{row_id}/purge")

        assert res.status_code == 200, res.text
        assert (drive_dir / "a" / "one.srt").exists()
        db.expire_all()
        assert db.get(File, row_id) is None


class TestPurgedAnnouncements:
    """SPEC-CORE-186 I10: one files.purged per scan, upload or purge request."""

    def test_a_scan_announces_the_subtitle_rows_it_drops(self, client, emits):
        c, db, drive_dir, _ = client
        dropped = [
            seed(db, drive_dir, "one.srt", file_type="subtitle",
                 mime="application/x-subrip"),
            seed(db, drive_dir, "two.vtt", file_type="subtitle", mime="text/vtt"),
        ]
        ids = {row.id for row in dropped}
        files = {p.name for p in (drive_dir / "a").iterdir()}

        _scan_and_register(db, TEST_DRIVE)

        purged = _purged(emits)
        assert len(purged) == 1
        data, drives = purged[0]
        assert set(data["file_ids"]) == ids
        assert list(data) == ["file_ids"]
        assert drives == [TEST_DRIVE]
        assert {p.name for p in (drive_dir / "a").iterdir()} == files

    def test_a_subtitle_upload_over_a_row_announces_the_deleted_row(
        self, client, emits
    ):
        c, db, drive_dir, _ = client
        (drive_dir / "a").mkdir()
        row = seed(db, drive_dir, "movie.srt", file_type="document",
                   mime="text/plain", write=False)

        upload(c, TEST_DRIVE, "a", "movie.srt", b"replacement")

        purged = _purged(emits)
        assert len(purged) == 1
        data, drives = purged[0]
        assert data == {"file_ids": [row.id]}
        assert drives == [TEST_DRIVE]

    def test_a_purge_announces_the_subtitle_rows_once(self, client, emits):
        c, db, drive_dir, _ = client
        (drive_dir / "a").mkdir()
        doomed = [
            seed(db, drive_dir, "one.srt", file_type="subtitle",
                 mime="application/x-subrip", write=False,
                 deleted_at=datetime.now(UTC)),
            seed(db, drive_dir, "two.vtt", file_type="subtitle", mime="text/vtt",
                 write=False, deleted_at=datetime.now(UTC)),
        ]

        res = c.post(
            "/api/files/batch/purge", json={"ids": [row.id for row in doomed]}
        )

        assert res.status_code == 200, res.text
        purged = _purged(emits)
        assert len(purged) == 1
        data, drives = purged[0]
        assert set(data["file_ids"]) == {row.id for row in doomed}
        assert drives == [TEST_DRIVE]


class TestSubtitleOnlyFolder:
    """SPEC-CORE-185 I13 (185.7): the new folder is listed without a scan."""

    def test_a_folder_created_by_a_subtitle_upload_appears_at_once(self, client):
        c, _, drive_dir, _ = client

        upload(c, TEST_DRIVE, "n", "movie.srt")

        folders = c.get(f"/api/drives/{TEST_DRIVE}/folders").json()
        assert [(f["path"], f["file_count"]) for f in folders if f["path"] == "n"] == [
            ("n", 0)
        ]
        assert names(drive_dir, "n") == ["movie.srt"]
