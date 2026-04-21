"""HTTP tests for Internal API: file_active_summary endpoints.

Endpoints (all at /api/internal):
- POST   /file_active_summary        body: {file_id, summary_file_id}  → 200 (UPSERT)
- GET    /file_active_summary/{file_id} → {file_id, summary_file_id, set_at} | 404
- DELETE /file_active_summary/{file_id} → 204 | 404
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

import app.config as config  # noqa: F401  (module-reference style)
from app.models import File
from tests.conftest import TEST_DRIVE


SECOND_DRIVE = "second-drive"


def _seed_file(db, drive: str, filename: str, file_path: str | None = None) -> File:
    f = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="",
        file_path=file_path or f"{drive}/{filename}",
        file_size=10,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


@pytest.fixture()
def two_drive_client(client, tmp_path):
    c, db, drive_dir, data_dir = client
    second_dir = tmp_path / "drives" / "second"
    second_dir.mkdir(parents=True, exist_ok=True)

    drives_json = Path(config.DRIVES_CONFIG)
    drives_json.write_text(
        json.dumps(
            [
                {"name": TEST_DRIVE, "path": str(drive_dir)},
                {"name": SECOND_DRIVE, "path": str(second_dir)},
            ]
        )
    )
    config._drives_cache = None

    yield c, db, drive_dir, second_dir, data_dir


class TestPostFileActiveSummary:
    def test_happy_path_creates(self, client):
        c, db, _, _ = client
        f = _seed_file(db, TEST_DRIVE, "f.mp4")
        s = _seed_file(db, TEST_DRIVE, "s.md")

        res = c.post(
            "/api/internal/file_active_summary",
            json={"file_id": f.id, "summary_file_id": s.id},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["file_id"] == f.id
        assert body["summary_file_id"] == s.id
        assert "set_at" in body

    def test_upsert_overwrites(self, client):
        c, db, _, _ = client
        f = _seed_file(db, TEST_DRIVE, "f.mp4")
        s1 = _seed_file(db, TEST_DRIVE, "s1.md")
        s2 = _seed_file(db, TEST_DRIVE, "s2.md")

        first = c.post(
            "/api/internal/file_active_summary",
            json={"file_id": f.id, "summary_file_id": s1.id},
        )
        assert first.status_code == 200
        first_set_at = first.json()["set_at"]

        # Sleep a hair so set_at can differ (DB timestamp resolution).
        time.sleep(0.01)

        second = c.post(
            "/api/internal/file_active_summary",
            json={"file_id": f.id, "summary_file_id": s2.id},
        )
        assert second.status_code == 200
        body2 = second.json()
        assert body2["summary_file_id"] == s2.id
        assert body2["set_at"] >= first_set_at

        # Only one row exists for f.id.
        got = c.get(f"/api/internal/file_active_summary/{f.id}")
        assert got.status_code == 200
        assert got.json()["summary_file_id"] == s2.id

    def test_400_on_cross_drive(self, two_drive_client):
        c, db, _, _, _ = two_drive_client
        f = _seed_file(db, TEST_DRIVE, "f.mp4", file_path="test/f.mp4")
        s = _seed_file(db, SECOND_DRIVE, "s.md", file_path="second/s.md")

        res = c.post(
            "/api/internal/file_active_summary",
            json={"file_id": f.id, "summary_file_id": s.id},
        )
        assert res.status_code == 400

    def test_400_on_same_id(self, client):
        c, db, _, _ = client
        f = _seed_file(db, TEST_DRIVE, "f.mp4")

        res = c.post(
            "/api/internal/file_active_summary",
            json={"file_id": f.id, "summary_file_id": f.id},
        )
        assert res.status_code == 400

    def test_404_when_file_missing_from_db(self, client):
        c, db, _, _ = client
        f = _seed_file(db, TEST_DRIVE, "f.mp4")

        res = c.post(
            "/api/internal/file_active_summary",
            json={"file_id": f.id, "summary_file_id": "does-not-xx"},
        )
        assert res.status_code == 404


class TestGetFileActiveSummary:
    def test_happy_path(self, client):
        c, db, _, _ = client
        f = _seed_file(db, TEST_DRIVE, "f.mp4")
        s = _seed_file(db, TEST_DRIVE, "s.md")
        c.post(
            "/api/internal/file_active_summary",
            json={"file_id": f.id, "summary_file_id": s.id},
        )

        res = c.get(f"/api/internal/file_active_summary/{f.id}")
        assert res.status_code == 200
        body = res.json()
        assert body["file_id"] == f.id
        assert body["summary_file_id"] == s.id
        assert body.get("set_at")

    def test_404_when_none(self, client):
        c, db, _, _ = client
        f = _seed_file(db, TEST_DRIVE, "f.mp4")

        res = c.get(f"/api/internal/file_active_summary/{f.id}")
        assert res.status_code == 404


class TestDeleteFileActiveSummary:
    def test_204_happy(self, client):
        c, db, _, _ = client
        f = _seed_file(db, TEST_DRIVE, "f.mp4")
        s = _seed_file(db, TEST_DRIVE, "s.md")
        c.post(
            "/api/internal/file_active_summary",
            json={"file_id": f.id, "summary_file_id": s.id},
        )

        res = c.delete(f"/api/internal/file_active_summary/{f.id}")
        assert res.status_code == 204

        # Gone.
        assert (
            c.get(f"/api/internal/file_active_summary/{f.id}").status_code == 404
        )

    def test_404_on_missing(self, client):
        c, db, _, _ = client
        f = _seed_file(db, TEST_DRIVE, "f.mp4")

        res = c.delete(f"/api/internal/file_active_summary/{f.id}")
        assert res.status_code == 404
