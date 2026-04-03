"""Tests for comment/notes feature: CRUD endpoints + authorization + cascade delete."""

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

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


def _seed_anonymous_comment(db, file_id, body="Anonymous comment"):
    """Seed an anonymous comment directly in the DB (API requires profile)."""
    from app.models import Comment

    now = datetime.now(UTC)
    comment = Comment(
        file_id=file_id,
        viewer_id=None,
        nickname=None,
        body=body,
        created_at=now,
        updated_at=now,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def _clear_rate_limits():
    """Clear in-memory rate limit state between tests."""
    from app.routers.comments import _comment_timestamps
    _comment_timestamps.clear()


class TestSharedViewerIdUtilities:
    """Verify that viewer_id utilities moved to auth.py work correctly."""

    def test_nickname_to_viewer_id_from_auth(self):
        from app.auth import nickname_to_viewer_id
        vid = nickname_to_viewer_id("alice")
        assert len(vid) == 16
        assert all(c in "0123456789abcdef" for c in vid)

    def test_get_viewer_id_from_auth(self):
        from app.auth import get_viewer_id
        assert get_viewer_id(None) is None
        assert get_viewer_id("") is None
        assert get_viewer_id("   ") is None

    def test_get_viewer_id_valid(self):
        from app.auth import get_viewer_id, nickname_to_viewer_id
        result = get_viewer_id("alice")
        assert result == nickname_to_viewer_id("alice")

    def test_get_nickname_from_auth(self):
        from app.auth import get_nickname
        assert get_nickname(None) is None
        assert get_nickname("") is None
        assert get_nickname("   ") is None
        assert get_nickname("alice") == "alice"

    def test_get_nickname_strips_whitespace(self):
        from app.auth import get_nickname
        assert get_nickname("  alice  ") == "alice"

    def test_get_nickname_too_long(self):
        from app.auth import get_nickname
        assert get_nickname("x" * 51) is None

    def test_backward_compat_progress_imports(self):
        """Ensure progress.py still exports these for backward compatibility."""
        from app.routers.progress import nickname_to_viewer_id, get_viewer_id
        assert nickname_to_viewer_id("test") is not None
        assert get_viewer_id(None) is None


class TestCreateComment:
    def test_create_with_profile(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "Great video!"},
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["nickname"] == "alice"
        assert data["body"] == "Great video!"
        assert data["is_mine"] is True
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_create_anonymous_rejected(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "Anonymous comment"},
        )
        assert res.status_code == 401

    def test_create_file_not_found(self, client):
        c, db, drive_dir, data_dir = client
        _clear_rate_limits()
        res = c.post(
            "/api/files/zzNOTFOUNDzz/comments",
            json={"body": "Hello"},
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 404

    def test_create_empty_body(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": ""},
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 422

    def test_create_body_too_long(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "x" * 1001},
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 422

    def test_create_body_max_length(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "x" * 1000},
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 201

    def test_create_body_whitespace_only(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "   "},
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 422


class TestListComments:
    def test_empty_list(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/comments")
        assert res.status_code == 200
        data = res.json()
        assert data["comments"] == []
        assert data["total"] == 0

    def test_list_with_items(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "First"},
            cookies={"hv_viewer": "alice"},
        )
        c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "Second"},
            cookies={"hv_viewer": "bob"},
        )
        res = c.get(
            f"/api/files/{file.id}/comments",
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 2
        assert len(data["comments"]) == 2
        # Ordered by created_at asc
        assert data["comments"][0]["body"] == "First"
        assert data["comments"][1]["body"] == "Second"

    def test_is_mine_flag(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "Alice's comment"},
            cookies={"hv_viewer": "alice"},
        )
        c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "Bob's comment"},
            cookies={"hv_viewer": "bob"},
        )
        res = c.get(
            f"/api/files/{file.id}/comments",
            cookies={"hv_viewer": "alice"},
        )
        comments = res.json()["comments"]
        assert comments[0]["is_mine"] is True
        assert comments[1]["is_mine"] is False

    def test_is_mine_anonymous_always_false(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        # Seed anonymous comment directly (API requires profile)
        _seed_anonymous_comment(db, file.id, "Anon comment")
        # Even without viewer, anonymous comments are not "mine"
        res = c.get(f"/api/files/{file.id}/comments")
        comments = res.json()["comments"]
        assert comments[0]["is_mine"] is False

    def test_list_file_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/files/zzNOTFOUNDzz/comments")
        assert res.status_code == 404

    def test_viewer_id_not_exposed(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "Test"},
            cookies={"hv_viewer": "alice"},
        )
        res = c.get(f"/api/files/{file.id}/comments")
        comment = res.json()["comments"][0]
        assert "viewer_id" not in comment


class TestUpdateComment:
    def test_update_own_comment(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        create_res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "Original"},
            cookies={"hv_viewer": "alice"},
        )
        comment_id = create_res.json()["id"]

        res = c.put(
            f"/api/files/{file.id}/comments/{comment_id}",
            json={"body": "Updated"},
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 200
        assert res.json()["body"] == "Updated"

    def test_update_others_comment_403(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        create_res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "Alice's comment"},
            cookies={"hv_viewer": "alice"},
        )
        comment_id = create_res.json()["id"]

        res = c.put(
            f"/api/files/{file.id}/comments/{comment_id}",
            json={"body": "Bob tries to edit"},
            cookies={"hv_viewer": "bob"},
        )
        assert res.status_code == 403

    def test_update_anonymous_comment_403(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        # Seed anonymous comment directly (API requires profile)
        comment = _seed_anonymous_comment(db, file.id, "Anonymous")

        # Even without viewer cookie, cannot edit anonymous comment
        res = c.put(
            f"/api/files/{file.id}/comments/{comment.id}",
            json={"body": "Try to edit"},
        )
        assert res.status_code == 403

    def test_update_anonymous_comment_with_viewer_403(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        # Seed anonymous comment directly (API requires profile)
        comment = _seed_anonymous_comment(db, file.id, "Anonymous")

        res = c.put(
            f"/api/files/{file.id}/comments/{comment.id}",
            json={"body": "Try to edit"},
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 403

    def test_update_comment_not_found(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(
            f"/api/files/{file.id}/comments/zzNOTFOUNDzz",
            json={"body": "Updated"},
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 404

    def test_update_empty_body(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        create_res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "Original"},
            cookies={"hv_viewer": "alice"},
        )
        comment_id = create_res.json()["id"]

        res = c.put(
            f"/api/files/{file.id}/comments/{comment_id}",
            json={"body": ""},
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 422

    def test_update_body_too_long(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        create_res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "Original"},
            cookies={"hv_viewer": "alice"},
        )
        comment_id = create_res.json()["id"]

        res = c.put(
            f"/api/files/{file.id}/comments/{comment_id}",
            json={"body": "x" * 1001},
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 422


class TestDeleteComment:
    def test_delete_own_comment(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        create_res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "To be deleted"},
            cookies={"hv_viewer": "alice"},
        )
        comment_id = create_res.json()["id"]

        res = c.delete(
            f"/api/files/{file.id}/comments/{comment_id}",
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 204

        # Verify it's gone
        res = c.get(
            f"/api/files/{file.id}/comments",
            cookies={"hv_viewer": "alice"},
        )
        assert res.json()["total"] == 0

    def test_delete_others_comment_403(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        _clear_rate_limits()
        create_res = c.post(
            f"/api/files/{file.id}/comments",
            json={"body": "Alice's comment"},
            cookies={"hv_viewer": "alice"},
        )
        comment_id = create_res.json()["id"]

        res = c.delete(
            f"/api/files/{file.id}/comments/{comment_id}",
            cookies={"hv_viewer": "bob"},
        )
        assert res.status_code == 403

    def test_delete_anonymous_comment_403(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        # Seed anonymous comment directly (API requires profile)
        comment = _seed_anonymous_comment(db, file.id, "Anonymous")

        res = c.delete(
            f"/api/files/{file.id}/comments/{comment.id}",
        )
        assert res.status_code == 403

    def test_delete_anonymous_comment_with_viewer_403(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        # Seed anonymous comment directly (API requires profile)
        comment = _seed_anonymous_comment(db, file.id, "Anonymous")

        res = c.delete(
            f"/api/files/{file.id}/comments/{comment.id}",
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 403

    def test_delete_comment_not_found(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.delete(
            f"/api/files/{file.id}/comments/zzNOTFOUNDzz",
            cookies={"hv_viewer": "alice"},
        )
        assert res.status_code == 404


class TestCascadeDelete:
    def test_file_deletion_removes_comments(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        file_id = file.id
        _clear_rate_limits()

        c.post(
            f"/api/files/{file_id}/comments",
            json={"body": "Comment 1"},
            cookies={"hv_viewer": "alice"},
        )
        c.post(
            f"/api/files/{file_id}/comments",
            json={"body": "Comment 2"},
            cookies={"hv_viewer": "bob"},
        )

        # Verify comments exist
        res = c.get(f"/api/files/{file_id}/comments")
        assert res.json()["total"] == 2

        # Delete the file (soft delete)
        res = c.delete(f"/api/files/{file_id}")
        assert res.status_code == 200

        # File is soft-deleted so comments endpoint returns 404
        res = c.get(f"/api/files/{file_id}/comments")
        assert res.status_code == 404


class TestAccessControl:
    def _setup_protected(self, tmp_path, drive_dir):
        """Set up a protected drive config."""
        import app.config as config
        import app.auth as auth_module

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
        auth_module._passwords_cache = None
        orig_pw_config = auth_module.PASSWORDS_CONFIG
        auth_module.PASSWORDS_CONFIG = pw_file
        auth_module.load_passwords()

        return orig_pw_config

    def test_comments_blocked_without_auth(self, client, tmp_path):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        orig_pw_config = self._setup_protected(tmp_path, drive_dir)
        _clear_rate_limits()

        import app.auth as auth_module
        try:
            res = c.get(f"/api/files/{file.id}/comments")
            assert res.status_code == 404

            res = c.post(
                f"/api/files/{file.id}/comments",
                json={"body": "Hello"},
                cookies={"hv_viewer": "alice"},
            )
            assert res.status_code == 404
        finally:
            auth_module.PASSWORDS_CONFIG = orig_pw_config
            auth_module._passwords_cache = None
