"""HTTP tests for Internal API: POST /api/internal/files/bulk-state.

Reports each file_id's lifecycle state (active / missing / trash) or lists
it in ``not_found`` when the row no longer exists (physical purge).
Used by knowledge addon webhooks to reconcile note_origins.health after
lifecycle events.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models import File
from tests.conftest import TEST_DRIVE


def _seed_file(
    db,
    filename: str,
    *,
    deleted_at: datetime | None = None,
    missing_since: datetime | None = None,
) -> File:
    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path="",
        file_path=f"{TEST_DRIVE}/{filename}",
        file_size=10,
        file_type="video",
        mime_type="video/mp4",
        deleted_at=deleted_at,
        missing_since=missing_since,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


class TestBulkState:
    def test_empty_request(self, client):
        c, _db, _, _ = client
        res = c.post("/api/internal/files/bulk-state", json={"file_ids": []})
        assert res.status_code == 200
        assert res.json() == {"statuses": [], "not_found": []}

    def test_active_file(self, client):
        c, db, _, _ = client
        f = _seed_file(db, "a.mp4")
        res = c.post(
            "/api/internal/files/bulk-state", json={"file_ids": [f.id]}
        )
        assert res.status_code == 200
        body = res.json()
        assert body["not_found"] == []
        assert body["statuses"] == [
            {"id": f.id, "drive": TEST_DRIVE, "state": "active"}
        ]

    def test_missing_file(self, client):
        c, db, _, _ = client
        f = _seed_file(db, "m.mp4", missing_since=datetime.now(UTC))
        res = c.post(
            "/api/internal/files/bulk-state", json={"file_ids": [f.id]}
        )
        body = res.json()
        assert body["statuses"][0]["state"] == "missing"
        assert body["not_found"] == []

    def test_trashed_file(self, client):
        c, db, _, _ = client
        f = _seed_file(db, "t.mp4", deleted_at=datetime.now(UTC))
        res = c.post(
            "/api/internal/files/bulk-state", json={"file_ids": [f.id]}
        )
        body = res.json()
        assert body["statuses"][0]["state"] == "trash"
        assert body["not_found"] == []

    def test_trash_wins_over_missing(self, client):
        """A file marked both deleted_at and missing_since (shouldn't happen
        in practice) is reported as trash — the explicit user action takes
        precedence over the scanner mark.
        """
        c, db, _, _ = client
        now = datetime.now(UTC)
        f = _seed_file(db, "x.mp4", deleted_at=now, missing_since=now)
        res = c.post(
            "/api/internal/files/bulk-state", json={"file_ids": [f.id]}
        )
        assert res.json()["statuses"][0]["state"] == "trash"

    def test_unknown_id_goes_to_not_found(self, client):
        c, _db, _, _ = client
        res = c.post(
            "/api/internal/files/bulk-state",
            json={"file_ids": ["no-such-id"]},
        )
        body = res.json()
        assert body["statuses"] == []
        assert body["not_found"] == ["no-such-id"]

    def test_mixed_bag(self, client):
        c, db, _, _ = client
        active = _seed_file(db, "a.mp4")
        missing = _seed_file(db, "m.mp4", missing_since=datetime.now(UTC))
        trashed = _seed_file(db, "t.mp4", deleted_at=datetime.now(UTC))

        res = c.post(
            "/api/internal/files/bulk-state",
            json={
                "file_ids": [
                    active.id,
                    missing.id,
                    trashed.id,
                    "ghost-id",
                ]
            },
        )
        body = res.json()
        by_id = {s["id"]: s["state"] for s in body["statuses"]}
        assert by_id[active.id] == "active"
        assert by_id[missing.id] == "missing"
        assert by_id[trashed.id] == "trash"
        assert body["not_found"] == ["ghost-id"]

    def test_preserves_input_duplicates_and_order_in_not_found(self, client):
        """Duplicate unknown IDs and preserved input order in not_found."""
        c, _db, _, _ = client
        res = c.post(
            "/api/internal/files/bulk-state",
            json={"file_ids": ["x", "y", "x"]},
        )
        body = res.json()
        assert body["not_found"] == ["x", "y", "x"]
