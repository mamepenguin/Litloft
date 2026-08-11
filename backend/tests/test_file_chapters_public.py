from __future__ import annotations

from datetime import UTC, datetime

import app.config as config
from app.models import File
from app.services.chapters import replace_chapters
from tests.conftest import TEST_DRIVE


def _seed_file(
    db,
    filename: str,
    *,
    drive: str = TEST_DRIVE,
    deleted_at: datetime | None = None,
    missing_since: datetime | None = None,
) -> File:
    file = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="",
        file_path=filename,
        file_size=10,
        file_type="video",
        mime_type="video/mp4",
        deleted_at=deleted_at,
        missing_since=missing_since,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _seed_chapters(db, file_id: str, *, source: str = "extracted") -> None:
    replace_chapters(
        db,
        file_id,
        [
            {
                "start_time": 20.0,
                "end_time": None,
                "title": "Later",
                "ordering": 2,
            },
            {
                "start_time": 0.0,
                "end_time": 20.0,
                "title": "Opening",
                "ordering": 1,
            },
        ],
        source,  # type: ignore[arg-type]
    )
    db.commit()


class TestListFileChapters:
    def test_empty_list_and_null_source_when_file_has_no_chapters(self, client):
        http, db, _, _ = client
        file = _seed_file(db, "empty.mp4")

        response = http.get(f"/api/files/{file.id}/chapters")

        assert response.status_code == 200
        assert response.json() == {"chapters": [], "source": None}

    def test_returns_chapters_in_stored_order_with_source(self, client):
        http, db, _, _ = client
        file = _seed_file(db, "chaptered.mp4")
        _seed_chapters(db, file.id)

        response = http.get(f"/api/files/{file.id}/chapters")

        assert response.status_code == 200
        assert response.json() == {
            "chapters": [
                {
                    "start_time": 0.0,
                    "end_time": 20.0,
                    "title": "Opening",
                    "ordering": 1,
                },
                {
                    "start_time": 20.0,
                    "end_time": None,
                    "title": "Later",
                    "ordering": 2,
                },
            ],
            "source": "extracted",
        }

    def test_unknown_file_returns_404(self, client):
        http, _, _, _ = client
        response = http.get("/api/files/zzzzzzzzzzzz/chapters")
        assert response.status_code == 404

    def test_trashed_file_returns_404(self, client):
        http, db, _, _ = client
        file = _seed_file(
            db,
            "trashed.mp4",
            deleted_at=datetime.now(UTC),
        )
        _seed_chapters(db, file.id)

        response = http.get(f"/api/files/{file.id}/chapters")
        assert response.status_code == 404

    def test_missing_file_returns_404(self, client):
        http, db, _, _ = client
        file = _seed_file(
            db,
            "missing.mp4",
            missing_since=datetime.now(UTC),
        )
        _seed_chapters(db, file.id)

        response = http.get(f"/api/files/{file.id}/chapters")
        assert response.status_code == 404

    def test_locked_cross_drive_file_returns_404(self, client, monkeypatch):
        http, db, _, _ = client
        file = _seed_file(db, "private.mp4", drive="private-drive")
        _seed_chapters(db, file.id)
        monkeypatch.setattr(
            config,
            "get_drive_access_group",
            lambda drive: "private" if drive == "private-drive" else None,
        )

        response = http.get(f"/api/files/{file.id}/chapters")
        assert response.status_code == 404


class TestFileDetailHasChapters:
    def test_false_agrees_with_empty_chapters_endpoint(self, client):
        http, db, _, _ = client
        file = _seed_file(db, "no-chapters.mp4")

        detail = http.get(f"/api/files/{file.id}")
        chapters = http.get(f"/api/files/{file.id}/chapters")

        assert detail.status_code == 200
        assert detail.json()["has_chapters"] is False
        assert chapters.json()["chapters"] == []

    def test_true_agrees_with_non_empty_chapters_endpoint(self, client):
        http, db, _, _ = client
        file = _seed_file(db, "has-chapters.mp4")
        _seed_chapters(db, file.id, source="curated")

        detail = http.get(f"/api/files/{file.id}")
        chapters = http.get(f"/api/files/{file.id}/chapters")

        assert detail.status_code == 200
        assert detail.json()["has_chapters"] is True
        assert chapters.json()["source"] == "curated"
        assert len(chapters.json()["chapters"]) == 2
