"""HTTP tests for Internal API: file_relations endpoints.

Endpoints (all at /api/internal):
- POST   /file_relations        create (201, 409, 400 for same-drive / self)
- GET    /file_relations?file_id=X[&kind=...]
- DELETE /file_relations/{id}   (204, 404)

Drive boundary (spec R4): the two files must live on the same drive.
Self-relation (file_id_a == file_id_b) is rejected at the application
layer with 400 (not swallowed as a 500 IntegrityError from the CHECK).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import app.config as config  # noqa: F401  (enforces module-reference style)
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
    """Extend the base client fixture with a second drive in drives.json."""
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


class TestCreateFileRelation:
    def test_201_on_new(self, client):
        c, db, _, _ = client
        a = _seed_file(db, TEST_DRIVE, "a.mp4")
        b = _seed_file(db, TEST_DRIVE, "b.mp4")

        res = c.post(
            "/api/internal/file_relations",
            json={"file_id_a": a.id, "file_id_b": b.id, "kind": "related"},
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["file_id_a"] == a.id
        assert body["file_id_b"] == b.id
        assert body["kind"] == "related"
        assert "id" in body
        assert "created_at" in body

    def test_stores_viewer_id_as_created_by(self, client):
        c, db, _, _ = client
        a = _seed_file(db, TEST_DRIVE, "a.mp4")
        b = _seed_file(db, TEST_DRIVE, "b.mp4")

        res = c.post(
            "/api/internal/file_relations",
            json={
                "file_id_a": a.id,
                "file_id_b": b.id,
                "kind": "related",
                "viewer_id": "a1b2c3d4e5f60718",
            },
        )
        assert res.status_code == 201
        assert res.json()["created_by"] == "a1b2c3d4e5f60718"

    def test_409_on_duplicate(self, client):
        c, db, _, _ = client
        a = _seed_file(db, TEST_DRIVE, "a.mp4")
        b = _seed_file(db, TEST_DRIVE, "b.mp4")

        res = c.post(
            "/api/internal/file_relations",
            json={"file_id_a": a.id, "file_id_b": b.id, "kind": "related"},
        )
        assert res.status_code == 201

        res = c.post(
            "/api/internal/file_relations",
            json={"file_id_a": a.id, "file_id_b": b.id, "kind": "related"},
        )
        assert res.status_code == 409

    def test_400_on_self_relation(self, client):
        c, db, _, _ = client
        a = _seed_file(db, TEST_DRIVE, "a.mp4")

        res = c.post(
            "/api/internal/file_relations",
            json={"file_id_a": a.id, "file_id_b": a.id, "kind": "related"},
        )
        assert res.status_code == 400

    def test_400_on_cross_drive(self, two_drive_client):
        c, db, _, _, _ = two_drive_client
        a = _seed_file(db, TEST_DRIVE, "a.mp4", file_path="test/a.mp4")
        b = _seed_file(db, SECOND_DRIVE, "b.mp4", file_path="second/b.mp4")

        res = c.post(
            "/api/internal/file_relations",
            json={"file_id_a": a.id, "file_id_b": b.id, "kind": "related"},
        )
        assert res.status_code == 400

    def test_404_when_file_missing_from_db(self, client):
        c, db, _, _ = client
        a = _seed_file(db, TEST_DRIVE, "a.mp4")

        res = c.post(
            "/api/internal/file_relations",
            json={
                "file_id_a": a.id,
                "file_id_b": "does-not-xx",
                "kind": "related",
            },
        )
        assert res.status_code == 404


class TestListFileRelations:
    def test_returns_relations_from_a_side(self, client):
        c, db, _, _ = client
        a = _seed_file(db, TEST_DRIVE, "a.mp4")
        b = _seed_file(db, TEST_DRIVE, "b.mp4")
        c.post(
            "/api/internal/file_relations",
            json={"file_id_a": a.id, "file_id_b": b.id, "kind": "related"},
        )

        res = c.get("/api/internal/file_relations", params={"file_id": a.id})
        assert res.status_code == 200
        items = res.json()
        assert isinstance(items, list)
        assert len(items) == 1
        assert items[0]["file_id_a"] == a.id
        assert items[0]["file_id_b"] == b.id
        assert items[0]["kind"] == "related"

    def test_returns_relations_from_b_side(self, client):
        """Query by file_id must match rows where X == file_id_a OR X == file_id_b."""
        c, db, _, _ = client
        a = _seed_file(db, TEST_DRIVE, "a.mp4")
        b = _seed_file(db, TEST_DRIVE, "b.mp4")
        c.post(
            "/api/internal/file_relations",
            json={"file_id_a": a.id, "file_id_b": b.id, "kind": "related"},
        )

        res = c.get("/api/internal/file_relations", params={"file_id": b.id})
        assert res.status_code == 200
        items = res.json()
        assert len(items) == 1
        # The row is returned regardless of orientation
        assert {items[0]["file_id_a"], items[0]["file_id_b"]} == {a.id, b.id}

    def test_kind_filter(self, client):
        c, db, _, _ = client
        a = _seed_file(db, TEST_DRIVE, "a.mp4")
        b = _seed_file(db, TEST_DRIVE, "b.mp4")
        c.post(
            "/api/internal/file_relations",
            json={"file_id_a": a.id, "file_id_b": b.id, "kind": "related"},
        )
        c.post(
            "/api/internal/file_relations",
            json={"file_id_a": a.id, "file_id_b": b.id, "kind": "derived_from"},
        )

        res = c.get(
            "/api/internal/file_relations",
            params={"file_id": a.id, "kind": "related"},
        )
        assert res.status_code == 200
        items = res.json()
        assert len(items) == 1
        assert items[0]["kind"] == "related"

    def test_empty_result(self, client):
        c, db, _, _ = client
        a = _seed_file(db, TEST_DRIVE, "a.mp4")

        res = c.get("/api/internal/file_relations", params={"file_id": a.id})
        assert res.status_code == 200
        assert res.json() == []


class TestDeleteFileRelation:
    def test_204_happy(self, client):
        c, db, _, _ = client
        a = _seed_file(db, TEST_DRIVE, "a.mp4")
        b = _seed_file(db, TEST_DRIVE, "b.mp4")
        created = c.post(
            "/api/internal/file_relations",
            json={"file_id_a": a.id, "file_id_b": b.id, "kind": "related"},
        ).json()

        res = c.delete(f"/api/internal/file_relations/{created['id']}")
        assert res.status_code == 204

        # Now gone.
        listing = c.get(
            "/api/internal/file_relations", params={"file_id": a.id}
        ).json()
        assert listing == []

    def test_404_on_missing_id(self, client):
        c, _, _, _ = client
        res = c.delete("/api/internal/file_relations/999999")
        assert res.status_code == 404
