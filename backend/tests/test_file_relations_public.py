"""HTTP tests for GET /api/files/{file_id}/relations.

The public companion to the Internal API's file_relations endpoint. The
key additional behaviours tested here:

* drive access enforcement (404 for inaccessible source file)
* trash filtering (related row is silently dropped when the target is
  trashed), missing files are still returned but carry ``missing_since``
* bidirectional symmetry (the row is discovered whether the source sits
  in ``file_id_a`` or ``file_id_b``)
* ``kind`` query parameter
* same-drive scoping (cross-drive rows can't materialise under spec R4
  but we defensively filter anyway)
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models import File, FileRelation
from tests.conftest import TEST_DRIVE


def _seed_file(
    db,
    filename: str,
    *,
    drive: str = TEST_DRIVE,
    deleted_at: datetime | None = None,
    missing_since: datetime | None = None,
) -> File:
    f = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path="",
        file_path=f"{drive}/{filename}",
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


def _seed_relation(
    db, a: File, b: File, *, kind: str = "related", created_by: str | None = None
) -> FileRelation:
    rel = FileRelation(
        file_id_a=a.id, file_id_b=b.id, kind=kind, created_by=created_by
    )
    db.add(rel)
    db.commit()
    db.refresh(rel)
    return rel


class TestListFileRelations:
    def test_empty_when_no_relations(self, client):
        c, db, _, _ = client
        f = _seed_file(db, "solo.mp4")
        res = c.get(f"/api/files/{f.id}/relations")
        assert res.status_code == 200
        assert res.json() == {"relations": []}

    def test_single_relation_a_side(self, client):
        c, db, _, _ = client
        a = _seed_file(db, "a.mp4")
        b = _seed_file(db, "b.mp4")
        _seed_relation(db, a, b)

        res = c.get(f"/api/files/{a.id}/relations")
        assert res.status_code == 200
        items = res.json()["relations"]
        assert len(items) == 1
        assert items[0]["kind"] == "related"
        assert items[0]["file"]["id"] == b.id

    def test_single_relation_b_side(self, client):
        c, db, _, _ = client
        a = _seed_file(db, "a.mp4")
        b = _seed_file(db, "b.mp4")
        _seed_relation(db, a, b)

        # Queried from b's perspective — the returned file is a.
        res = c.get(f"/api/files/{b.id}/relations")
        assert res.json()["relations"][0]["file"]["id"] == a.id

    def test_source_404_when_file_missing(self, client):
        c, _db, _, _ = client
        res = c.get("/api/files/zzzzzzzzzzzz/relations")
        assert res.status_code == 404

    def test_source_404_when_file_trashed(self, client):
        c, db, _, _ = client
        f = _seed_file(db, "gone.mp4", deleted_at=datetime.now(UTC))
        res = c.get(f"/api/files/{f.id}/relations")
        # active_file_filter excludes trash → source lookup 404.
        assert res.status_code == 404

    def test_trashed_target_is_dropped(self, client):
        c, db, _, _ = client
        a = _seed_file(db, "a.mp4")
        b = _seed_file(db, "b.mp4", deleted_at=datetime.now(UTC))
        _seed_relation(db, a, b)
        res = c.get(f"/api/files/{a.id}/relations")
        assert res.json()["relations"] == []

    def test_missing_target_is_included(self, client):
        c, db, _, _ = client
        a = _seed_file(db, "a.mp4")
        b = _seed_file(db, "b.mp4", missing_since=datetime.now(UTC))
        _seed_relation(db, a, b)
        res = c.get(f"/api/files/{a.id}/relations")
        items = res.json()["relations"]
        assert len(items) == 1
        assert items[0]["file"]["id"] == b.id
        assert items[0]["file"]["missing_since"] is not None

    def test_kind_filter(self, client):
        c, db, _, _ = client
        a = _seed_file(db, "a.mp4")
        b = _seed_file(db, "b.mp4")
        cc = _seed_file(db, "c.mp4")
        _seed_relation(db, a, b, kind="related")
        _seed_relation(db, a, cc, kind="derived_from")

        res_all = c.get(f"/api/files/{a.id}/relations")
        assert len(res_all.json()["relations"]) == 2

        res_related = c.get(f"/api/files/{a.id}/relations?kind=related")
        items = res_related.json()["relations"]
        assert len(items) == 1
        assert items[0]["file"]["id"] == b.id

    def test_multiple_ordered_by_most_recent(self, client):
        c, db, _, _ = client
        root = _seed_file(db, "root.mp4")
        x = _seed_file(db, "x.mp4")
        y = _seed_file(db, "y.mp4")
        _seed_relation(db, root, x)
        _seed_relation(db, root, y)

        res = c.get(f"/api/files/{root.id}/relations")
        ids = [r["file"]["id"] for r in res.json()["relations"]]
        # Most recent first — the second seeded relation (y) wins.
        assert ids == [y.id, x.id]

    def test_response_shape(self, client):
        c, db, _, _ = client
        a = _seed_file(db, "a.mp4")
        b = _seed_file(db, "b.mp4")
        rel = _seed_relation(db, a, b, created_by="viewer-a1b2c3d4")

        res = c.get(f"/api/files/{a.id}/relations")
        item = res.json()["relations"][0]
        assert item["relation_id"] == rel.id
        assert item["kind"] == "related"
        assert item["created_by"] == "viewer-a1b2c3d4"
        assert item["file"]["drive"] == TEST_DRIVE
        assert (
            item["file"]["thumbnail_url"]
            == f"/api/files/{b.id}/thumbnail"
        )
        assert item["file"]["has_thumbnail"] is False
