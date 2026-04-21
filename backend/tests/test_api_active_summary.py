"""HTTP tests for public endpoint: GET /api/files/{file_id}/active_summary

Response schema:
  - No active summary:
      {"has_active_summary": false}
  - Has active summary:
      {"has_active_summary": true,
       "summary_note": {"file_id": ..., "drive": ..., "path": ..., "title": ...}}

Access control:
  - File in a protected drive the caller cannot unlock → 404 (not 403)
  - File soft-deleted / missing → 404 (active_file_filter)
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

import app.config as config  # noqa: F401  (module-reference style)
from app.models import File
from tests.conftest import TEST_DRIVE


def _seed_file(db, *, drive: str, filename: str, file_path: str,
               folder_path: str = "", file_type: str = "video",
               title: str | None = None) -> File:
    f = File(
        filename=filename,
        title=title or filename,
        drive=drive,
        folder_path=folder_path,
        file_path=file_path,
        file_size=10,
        file_type=file_type,
        mime_type="video/mp4" if file_type == "video" else "text/markdown",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _set_active_summary(c, file_id: str, summary_file_id: str):
    res = c.post(
        "/api/internal/file_active_summary",
        json={"file_id": file_id, "summary_file_id": summary_file_id},
    )
    assert res.status_code == 200, res.text


class TestActiveSummaryPublicGet:
    def test_no_active_summary_returns_false_flag(self, client):
        c, db, _, _ = client
        f = _seed_file(db, drive=TEST_DRIVE, filename="vid.mp4",
                       file_path="vid.mp4")

        res = c.get(f"/api/files/{f.id}/active_summary")
        assert res.status_code == 200
        body = res.json()
        assert body["has_active_summary"] is False
        assert "summary_note" not in body or body.get("summary_note") is None

    def test_active_summary_returns_note_metadata(self, client):
        c, db, _, _ = client
        f = _seed_file(db, drive=TEST_DRIVE, filename="vid.mp4",
                       file_path="vid.mp4")
        note = _seed_file(
            db,
            drive=TEST_DRIVE,
            filename="vid-summary.md",
            file_path="AI-Drafts/vid-summary.md",
            folder_path="AI-Drafts",
            file_type="text",
            title="vid.mp4 の詳細要約",
        )
        _set_active_summary(c, f.id, note.id)

        res = c.get(f"/api/files/{f.id}/active_summary")
        assert res.status_code == 200
        body = res.json()
        assert body["has_active_summary"] is True
        sn = body["summary_note"]
        assert sn["file_id"] == note.id
        assert sn["drive"] == TEST_DRIVE
        assert sn["path"] == "AI-Drafts/vid-summary.md"
        assert sn["title"] == "vid.mp4 の詳細要約"

    def test_missing_file_returns_404(self, client):
        c, db, _, _ = client
        f = _seed_file(db, drive=TEST_DRIVE, filename="vid.mp4",
                       file_path="vid.mp4")
        f.missing_since = datetime.now(UTC)
        db.commit()

        res = c.get(f"/api/files/{f.id}/active_summary")
        assert res.status_code == 404

    def test_trashed_file_returns_404(self, client):
        c, db, _, _ = client
        f = _seed_file(db, drive=TEST_DRIVE, filename="vid.mp4",
                       file_path="vid.mp4")
        f.deleted_at = datetime.now(UTC)
        db.commit()

        res = c.get(f"/api/files/{f.id}/active_summary")
        assert res.status_code == 404

    def test_unknown_file_id_returns_404(self, client):
        c, _, _, _ = client
        res = c.get("/api/files/does-not-xx/active_summary")
        assert res.status_code == 404


class TestActiveSummaryAccessControl:
    """Drive access control: protected drive is invisible when locked.

    The pattern mirrors test_comments.TestAccessControl — expect 404 (not 403)
    so the drive's existence is not leaked.
    """

    def _setup_protected(self, tmp_path, drive_dir):
        import app.auth as auth_module

        drives_json = tmp_path / "drives_protected.json"
        drives_json.write_text(
            json.dumps(
                [
                    {
                        "name": TEST_DRIVE,
                        "path": str(drive_dir),
                        "access_group": "private",
                    }
                ]
            )
        )
        config._drives_cache = None
        orig_drives_config = config.DRIVES_CONFIG
        config.DRIVES_CONFIG = drives_json

        pw_file = tmp_path / "passwords.json"
        pw_file.write_text(
            json.dumps([{"password": "secret123", "groups": ["private"]}])
        )
        auth_module._passwords_cache = None
        orig_pw_config = auth_module.PASSWORDS_CONFIG
        auth_module.PASSWORDS_CONFIG = pw_file
        auth_module.load_passwords()
        return orig_drives_config, orig_pw_config

    def test_protected_drive_locked_returns_404(self, client, tmp_path):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive=TEST_DRIVE, filename="secret.mp4",
                       file_path="secret.mp4")
        note = _seed_file(
            db,
            drive=TEST_DRIVE,
            filename="secret-summary.md",
            file_path="AI-Drafts/secret-summary.md",
            folder_path="AI-Drafts",
            file_type="text",
        )
        _set_active_summary(c, f.id, note.id)

        import app.auth as auth_module

        orig_drives, orig_pw = self._setup_protected(tmp_path, drive_dir)
        try:
            # Without unlock, the protected drive is invisible → 404.
            res = c.get(f"/api/files/{f.id}/active_summary")
            assert res.status_code == 404
        finally:
            config.DRIVES_CONFIG = orig_drives
            config._drives_cache = None
            auth_module.PASSWORDS_CONFIG = orig_pw
            auth_module._passwords_cache = None
