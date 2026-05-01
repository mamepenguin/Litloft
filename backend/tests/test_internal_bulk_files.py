"""HTTP tests for Internal API: POST /api/internal/files/bulk.

Returns full FileResponse-shaped metadata for a list of file IDs. Used
by addons (e.g. intelligence) to enrich semantic search results into
the same shape as filename-match results without N+1 single-file
lookups.

Active filter is applied: missing/trash files go to ``not_found``.
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
    is_favorite: bool = False,
) -> File:
    f = File(
        filename=filename,
        title=filename,
        description="",
        drive=TEST_DRIVE,
        folder_path="",
        file_path=f"{TEST_DRIVE}/{filename}",
        file_size=10,
        file_type="video",
        mime_type="video/mp4",
        is_favorite=is_favorite,
        deleted_at=deleted_at,
        missing_since=missing_since,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


class TestBulkFiles:
    def test_empty_request(self, client):
        c, _db, _, _ = client
        res = c.post("/api/internal/files/bulk", json={"file_ids": []})
        assert res.status_code == 200
        assert res.json() == {"files": [], "not_found": []}

    def test_active_file_returns_full_shape(self, client):
        """The returned object MUST match FileResponse shape so addons
        that consume this can use it interchangeably with the regular
        file API responses (FileItem in TypeScript).
        """
        c, db, _, _ = client
        f = _seed_file(db, "a.mp4", is_favorite=True)
        res = c.post(
            "/api/internal/files/bulk", json={"file_ids": [f.id]}
        )
        assert res.status_code == 200
        body = res.json()
        assert body["not_found"] == []
        assert len(body["files"]) == 1

        item = body["files"][0]
        # Wire-shape: every key the frontend FileItem type expects must
        # be present. If FileResponse changes shape, this test fails
        # and addon contract tests break in lockstep.
        assert item["id"] == f.id
        assert item["filename"] == "a.mp4"
        assert item["title"] == "a.mp4"
        assert item["description"] == ""
        assert item["drive"] == TEST_DRIVE
        assert item["folder_path"] == ""
        assert item["file_type"] == "video"
        assert item["mime_type"] == "video/mp4"
        assert item["thumbnail_url"] == f"/api/files/{f.id}/thumbnail"
        assert item["has_thumbnail"] is False
        assert item["file_size"] == 10
        assert item["duration"] is None
        assert item["likes"] == 0
        assert item["is_favorite"] is True
        assert item["tags"] == []
        # Performance: subtitles is unconditionally [] to avoid ffprobe
        # per file. Frontend FileCard does not display subtitles.
        assert item["subtitles"] == []
        assert "created_at" in item
        assert "updated_at" in item
        assert item["deleted_at"] is None
        assert item["missing_since"] is None

    def test_missing_file_excluded(self, client):
        c, db, _, _ = client
        f = _seed_file(db, "m.mp4", missing_since=datetime.now(UTC))
        res = c.post(
            "/api/internal/files/bulk", json={"file_ids": [f.id]}
        )
        body = res.json()
        assert body["files"] == []
        assert body["not_found"] == [f.id]

    def test_trash_file_excluded(self, client):
        c, db, _, _ = client
        f = _seed_file(db, "t.mp4", deleted_at=datetime.now(UTC))
        res = c.post(
            "/api/internal/files/bulk", json={"file_ids": [f.id]}
        )
        body = res.json()
        assert body["files"] == []
        assert body["not_found"] == [f.id]

    def test_unknown_id_goes_to_not_found(self, client):
        c, _db, _, _ = client
        res = c.post(
            "/api/internal/files/bulk",
            json={"file_ids": ["no-such-id"]},
        )
        body = res.json()
        assert body["files"] == []
        assert body["not_found"] == ["no-such-id"]

    def test_mixed_bag_active_only(self, client):
        c, db, _, _ = client
        active = _seed_file(db, "a.mp4")
        missing = _seed_file(db, "m.mp4", missing_since=datetime.now(UTC))
        trashed = _seed_file(db, "t.mp4", deleted_at=datetime.now(UTC))

        res = c.post(
            "/api/internal/files/bulk",
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
        assert [f["id"] for f in body["files"]] == [active.id]
        assert set(body["not_found"]) == {missing.id, trashed.id, "ghost-id"}

    def test_preserves_input_order_in_files(self, client):
        """Output ``files`` follows input order (so callers can pair the
        intelligence search ranking with the bulk hydrate result without
        re-sorting).
        """
        c, db, _, _ = client
        first = _seed_file(db, "1.mp4")
        second = _seed_file(db, "2.mp4")
        third = _seed_file(db, "3.mp4")

        res = c.post(
            "/api/internal/files/bulk",
            json={"file_ids": [third.id, first.id, second.id]},
        )
        body = res.json()
        assert [f["id"] for f in body["files"]] == [third.id, first.id, second.id]

    def test_no_secret_required(self, client):
        """``/files/bulk`` is a read endpoint and does NOT require the
        ``X-Internal-Secret`` header. Mirrors ``/files/{id}`` and
        ``/files/bulk-state`` (per ``internal-api-policy.md``).
        """
        c, db, _, _ = client
        f = _seed_file(db, "n.mp4")
        # No header set — must still succeed.
        res = c.post(
            "/api/internal/files/bulk", json={"file_ids": [f.id]}
        )
        assert res.status_code == 200
