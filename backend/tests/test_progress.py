"""Tests for watch history / resume playback: progress endpoints + watch-history list."""

import json
import shutil
from pathlib import Path
from unittest.mock import patch

import pytest

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_file(db, drive_dir, filename="test.mp4", folder="旅行", file_type="video",
               mime_type="video/mp4", duration=120.0):
    folder_dir = drive_dir / folder
    folder_dir.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "long_video.mp4", folder_dir / filename)

    from app.models import File

    file = File(
        filename=filename,
        title=filename.rsplit(".", 1)[0],
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=f"{folder}/{filename}",
        file_size=folder_dir.joinpath(filename).stat().st_size,
        file_type=file_type,
        mime_type=mime_type,
        duration=duration,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestNicknameToViewerId:
    def test_deterministic(self):
        from app.routers.progress import nickname_to_viewer_id
        vid1 = nickname_to_viewer_id("alice")
        vid2 = nickname_to_viewer_id("alice")
        assert vid1 == vid2

    def test_length_is_16(self):
        from app.routers.progress import nickname_to_viewer_id
        vid = nickname_to_viewer_id("bob")
        assert len(vid) == 16

    def test_different_names_different_ids(self):
        from app.routers.progress import nickname_to_viewer_id
        assert nickname_to_viewer_id("alice") != nickname_to_viewer_id("bob")

    def test_strips_whitespace(self):
        from app.routers.progress import nickname_to_viewer_id
        assert nickname_to_viewer_id("  alice  ") == nickname_to_viewer_id("alice")

    def test_hex_characters(self):
        from app.routers.progress import nickname_to_viewer_id
        vid = nickname_to_viewer_id("test")
        assert all(c in "0123456789abcdef" for c in vid)


class TestGetViewerId:
    def test_none_cookie(self):
        from app.auth import _viewer_id_from_nickname
        assert _viewer_id_from_nickname(None) is None

    def test_empty_string(self):
        from app.auth import _viewer_id_from_nickname
        assert _viewer_id_from_nickname("") is None

    def test_whitespace_only(self):
        from app.auth import _viewer_id_from_nickname
        assert _viewer_id_from_nickname("   ") is None

    def test_valid_nickname(self):
        from app.auth import _viewer_id_from_nickname
        from app.routers.progress import nickname_to_viewer_id
        result = _viewer_id_from_nickname("alice")
        assert result == nickname_to_viewer_id("alice")


class TestUpdateProgress:
    def test_save_position(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 30.5, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

    def test_upsert_updates_existing(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 10.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 60.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/files/{file.id}/progress",
            cookies={"lit_viewer": "alice"},
        )
        assert res.json()["position"] == 60.0

    def test_no_viewer_returns_204(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 30.0, "duration": 120.0},
        )
        assert res.status_code == 204

    def test_file_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.post(
            "/api/files/zzNOTFOUNDzz/progress",
            json={"position": 30.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 404

    def test_invalid_position(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/progress",
            json={"position": -1.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 422

    def test_invalid_duration_zero(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 10.0, "duration": 0},
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 422

    def test_invalid_duration_negative(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 10.0, "duration": -5.0},
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 422

    def test_view_only_records_last_played(self, client):
        # Empty body POST = "page-opened" record for non-media files. Must
        # insert a WatchHistory row with playback_position=0/duration=0 and
        # last_played_at = now so personal_history's Stage B can surface
        # the file. Spec: 2026-04-26-intelligence-ask-personal-history-query.md.
        c, db, drive_dir, data_dir = client
        file = _seed_file(
            db, drive_dir, filename="note.md", file_type="text",
            mime_type="text/markdown", duration=0.0,
        )
        res = c.post(
            f"/api/files/{file.id}/progress",
            json={},
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 200

        from app.models import WatchHistory
        from app.routers.progress import nickname_to_viewer_id
        row = (
            db.query(WatchHistory)
            .filter(
                WatchHistory.viewer_id == nickname_to_viewer_id("alice"),
                WatchHistory.file_id == file.id,
            )
            .one()
        )
        assert row.playback_position == 0.0
        assert row.duration == 0.0
        assert row.last_played_at is not None

    def test_partial_body_rejected(self, client):
        # Sending only one of {position, duration} leaves the row in an
        # ambiguous state (e.g. position w/o duration cannot be checked
        # against the 90% completion gate). Reject with 422.
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 30.0},
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 422

        res = c.post(
            f"/api/files/{file.id}/progress",
            json={"duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 422

    def test_view_only_then_media_preserves_last_played(self, client):
        # media → view-only → media sequence on the same file must:
        # - never roll back position/duration on the view-only POST
        # - always advance last_played_at on every POST
        # This protects the case where a video has been partially watched,
        # then the user opens the detail page (without restarting playback),
        # then watches more. The view-only ping in the middle should bump
        # last_played_at without corrupting the resume position.
        import time
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        viewer_cookie = {"lit_viewer": "alice"}

        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 45.0, "duration": 120.0},
            cookies=viewer_cookie,
        )

        from app.models import WatchHistory
        from app.routers.progress import nickname_to_viewer_id
        viewer_id = nickname_to_viewer_id("alice")
        first = (
            db.query(WatchHistory)
            .filter(WatchHistory.viewer_id == viewer_id, WatchHistory.file_id == file.id)
            .one()
        )
        first_played_at = first.last_played_at

        time.sleep(0.05)
        c.post(
            f"/api/files/{file.id}/progress",
            json={},
            cookies=viewer_cookie,
        )
        db.expire_all()
        mid = (
            db.query(WatchHistory)
            .filter(WatchHistory.viewer_id == viewer_id, WatchHistory.file_id == file.id)
            .one()
        )
        # Snapshot the timestamp before the next POST refreshes the
        # ORM instance (identity map returns the same object).
        mid_played_at = mid.last_played_at
        # View-only ping must NOT clobber position/duration.
        assert mid.playback_position == 45.0
        assert mid.duration == 120.0
        assert mid_played_at > first_played_at

        time.sleep(0.05)
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 75.0, "duration": 120.0},
            cookies=viewer_cookie,
        )
        db.expire_all()
        final = (
            db.query(WatchHistory)
            .filter(WatchHistory.viewer_id == viewer_id, WatchHistory.file_id == file.id)
            .one()
        )
        assert final.playback_position == 75.0
        assert final.last_played_at > mid_played_at


class TestGetProgress:
    def test_saved_position(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 45.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/files/{file.id}/progress",
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 200
        assert res.json() == {"position": 45.0, "duration": 120.0}

    def test_no_viewer_returns_zero(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/progress")
        assert res.status_code == 200
        assert res.json() == {"position": 0, "duration": 0}

    def test_no_history_returns_zero(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.get(
            f"/api/files/{file.id}/progress",
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 200
        assert res.json() == {"position": 0, "duration": 0}

    def test_different_viewers_independent(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 30.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 90.0, "duration": 120.0},
            cookies={"lit_viewer": "bob"},
        )
        res_alice = c.get(
            f"/api/files/{file.id}/progress",
            cookies={"lit_viewer": "alice"},
        )
        res_bob = c.get(
            f"/api/files/{file.id}/progress",
            cookies={"lit_viewer": "bob"},
        )
        assert res_alice.json()["position"] == 30.0
        assert res_bob.json()["position"] == 90.0

    def test_file_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(
            "/api/files/zzNOTFOUNDzz/progress",
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 404


class TestDeleteProgress:
    def test_delete_existing(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 30.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.delete(
            f"/api/files/{file.id}/progress",
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 204

        # Verify it's gone
        res = c.get(
            f"/api/files/{file.id}/progress",
            cookies={"lit_viewer": "alice"},
        )
        assert res.json() == {"position": 0, "duration": 0}

    def test_delete_nonexistent_is_ok(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.delete(
            f"/api/files/{file.id}/progress",
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 204

    def test_no_viewer_returns_204(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.delete(f"/api/files/{file.id}/progress")
        assert res.status_code == 204

    def test_file_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.delete(
            "/api/files/zzNOTFOUNDzz/progress",
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 404


class TestCascadeDelete:
    def test_file_deletion_removes_watch_history(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        file_id = file.id
        c.post(
            f"/api/files/{file_id}/progress",
            json={"position": 50.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )

        # Verify progress was saved
        res = c.get(
            f"/api/files/{file_id}/progress",
            cookies={"lit_viewer": "alice"},
        )
        assert res.json()["position"] == 50.0

        # Delete the file via API
        res = c.delete(f"/api/files/{file_id}")
        assert res.status_code == 200

        # File no longer exists, so progress endpoint should 404
        res = c.get(
            f"/api/files/{file_id}/progress",
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 404


class TestWatchHistoryList:
    def test_empty_when_no_viewer(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/watch-history")
        assert res.status_code == 200
        assert res.json() == {"data": []}

    def test_returns_in_progress_items(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir, filename="video1.mp4")
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 30.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history",
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 200
        data = res.json()["data"]
        assert len(data) == 1
        assert data[0]["id"] == file.id
        assert data[0]["watch_progress"]["position"] == 30.0
        assert data[0]["watch_progress"]["duration"] == 120.0

    def test_excludes_completed_items(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir, filename="video1.mp4")
        # position >= 90% of duration should be excluded
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 108.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history",
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 200
        assert len(res.json()["data"]) == 0

    def test_exactly_90_percent_excluded(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir, filename="video1.mp4")
        # position == 90% of duration (108/120 = 0.9) should be excluded
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 108.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history",
            cookies={"lit_viewer": "alice"},
        )
        assert len(res.json()["data"]) == 0

    def test_just_under_90_percent_included(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir, filename="video1.mp4")
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 107.9, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history",
            cookies={"lit_viewer": "alice"},
        )
        assert len(res.json()["data"]) == 1

    def test_sorted_by_last_played_desc(self, client):
        c, db, drive_dir, data_dir = client
        file1 = _seed_file(db, drive_dir, filename="video1.mp4")
        file2 = _seed_file(db, drive_dir, filename="video2.mp4")
        # Save file1 first, then file2 - file2 should appear first
        c.post(
            f"/api/files/{file1.id}/progress",
            json={"position": 10.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        c.post(
            f"/api/files/{file2.id}/progress",
            json={"position": 20.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history",
            cookies={"lit_viewer": "alice"},
        )
        data = res.json()["data"]
        assert len(data) == 2
        assert data[0]["id"] == file2.id
        assert data[1]["id"] == file1.id

    def test_limit_parameter(self, client):
        c, db, drive_dir, data_dir = client
        files = []
        for i in range(5):
            f = _seed_file(db, drive_dir, filename=f"video{i}.mp4")
            files.append(f)
            c.post(
                f"/api/files/{f.id}/progress",
                json={"position": 10.0, "duration": 120.0},
                cookies={"lit_viewer": "alice"},
            )
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history?limit=3",
            cookies={"lit_viewer": "alice"},
        )
        assert len(res.json()["data"]) == 3

    def test_limit_max_50(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history?limit=100",
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 422

    def test_drive_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(
            "/api/drives/nonexistent/watch-history",
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code == 404

    def test_only_returns_files_from_specified_drive(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir, filename="video1.mp4")

        # Save progress while file is still on TEST_DRIVE
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 30.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )

        # Now move the file to a different drive in DB directly
        # (simulating it belonging to another drive)
        from app.models import File
        file_obj = db.query(File).filter(File.id == file.id).first()
        file_obj.drive = "other-drive"
        db.commit()

        # Watch history for TEST_DRIVE should not include the file
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history",
            cookies={"lit_viewer": "alice"},
        )
        assert len(res.json()["data"]) == 0

    def test_different_viewers_see_own_history(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir, filename="video1.mp4")
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 30.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history",
            cookies={"lit_viewer": "bob"},
        )
        assert len(res.json()["data"]) == 0


class TestCompletionIsPreserved:
    """Spec 2026-08-10-media-import-watch-surface.md §4.2.

    Players stopped deleting the history row at the end of playback and
    now write the final position instead. These lock in the two halves
    of that contract: the record survives, and it still does not come
    back as unfinished work.
    """

    def test_completed_record_is_retained(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir, filename="video1.mp4")
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 120.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/files/{file.id}/progress",
            cookies={"lit_viewer": "alice"},
        )
        assert res.json() == {"position": 120.0, "duration": 120.0}

    def test_completed_record_stays_out_of_continue_watching(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir, filename="video1.mp4")
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 120.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history",
            cookies={"lit_viewer": "alice"},
        )
        assert res.json()["data"] == []

    def test_completed_record_is_visible_under_filter_all(self, client):
        # The point of keeping the row: "watched to the end" has to stay
        # distinguishable from "never opened".
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir, filename="video1.mp4")
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 120.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history?filter=all",
            cookies={"lit_viewer": "alice"},
        )
        data = res.json()["data"]
        assert [row["id"] for row in data] == [file.id]

    def test_view_only_record_is_not_continue_watching(self, client):
        # A 0/0 row means "the detail page was opened", never "partially
        # watched". The gate already filters it (0 < 0 is false); this
        # pins that down so a future rewrite of the filter cannot
        # silently start advertising unopened files as in progress.
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir, filename="video1.mp4")
        c.post(
            f"/api/files/{file.id}/progress",
            json={},
            cookies={"lit_viewer": "alice"},
        )
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history",
            cookies={"lit_viewer": "alice"},
        )
        assert res.json()["data"] == []

    def test_explicit_delete_still_removes_the_record(self, client):
        # Completion no longer deletes, so the only remaining caller of
        # the delete path is the user's own "remove from history".
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir, filename="video1.mp4")
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 120.0, "duration": 120.0},
            cookies={"lit_viewer": "alice"},
        )
        assert c.delete(
            f"/api/files/{file.id}/progress",
            cookies={"lit_viewer": "alice"},
        ).status_code == 204
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/watch-history?filter=all",
            cookies={"lit_viewer": "alice"},
        )
        assert res.json()["data"] == []


class TestAccessControl:
    def _setup_protected(self, tmp_path, drive_dir):
        """Set up a protected drive config."""
        import app.config as config
        import app.auth as auth

        drives_json = tmp_path / "drives_protected.json"
        drives_json.write_text(json.dumps([
            {"name": TEST_DRIVE, "path": str(drive_dir), "access_group": "private"}
        ]))
        config._drives_cache = None
        config.DRIVES_CONFIG = drives_json

        pw_file = tmp_path / "passwords.json"
        pw_file.write_text(json.dumps([
            {"password": "secret123", "groups": ["private"]}
        ]))
        auth._passwords_cache = None
        orig_pw_config = auth.PASSWORDS_CONFIG
        auth.PASSWORDS_CONFIG = pw_file
        auth.load_passwords()

        return orig_pw_config

    def test_progress_blocked_without_auth(self, client, tmp_path):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        orig_pw_config = self._setup_protected(tmp_path, drive_dir)

        import app.auth as auth
        try:
            res = c.post(
                f"/api/files/{file.id}/progress",
                json={"position": 30.0, "duration": 120.0},
                cookies={"lit_viewer": "alice"},
            )
            assert res.status_code == 404
        finally:
            auth.PASSWORDS_CONFIG = orig_pw_config
            auth._passwords_cache = None

    def test_watch_history_blocked_without_auth(self, client, tmp_path):
        c, db, drive_dir, data_dir = client
        orig_pw_config = self._setup_protected(tmp_path, drive_dir)

        import app.auth as auth
        try:
            res = c.get(
                f"/api/drives/{TEST_DRIVE}/watch-history",
                cookies={"lit_viewer": "alice"},
            )
            assert res.status_code == 404
        finally:
            auth.PASSWORDS_CONFIG = orig_pw_config
            auth._passwords_cache = None
