"""SPEC-CORE-120 I12: batch delete and purge keep the 100-id cap.

The chunking in the frontend relies on the server refusing a larger request
rather than processing part of it.
"""

from datetime import UTC, datetime

from app.models import File
from tests.conftest import TEST_DRIVE


def _rows(db, n, trashed):
    now = datetime.now(UTC).replace(tzinfo=None)
    files = [
        File(
            filename=f"batch{i:03d}.mp4",
            title=f"Batch {i}",
            drive=TEST_DRIVE,
            folder_path="",
            file_path=f"batch{i:03d}.mp4",
            file_size=0,
            file_type="video",
            mime_type="video/mp4",
            deleted_at=now if trashed else None,
        )
        for i in range(n)
    ]
    db.add_all(files)
    db.commit()
    return [f.id for f in files]


def _state(db, ids):
    db.expire_all()
    rows = db.query(File).filter(File.id.in_(ids)).all()
    return sorted((f.id, f.deleted_at is None) for f in rows)


class TestBatchIdCapSpecCore120:
    def test_batch_delete_with_101_ids_is_422_and_changes_nothing(self, client):
        c, db, _, _ = client
        ids = _rows(db, 101, trashed=False)
        before = _state(db, ids)

        res = c.post("/api/files/batch/delete", json={"ids": ids})

        assert res.status_code == 422
        assert _state(db, ids) == before
        assert all(active for _, active in before)

    def test_batch_purge_with_101_ids_is_422_and_changes_nothing(self, client):
        c, db, _, _ = client
        ids = _rows(db, 101, trashed=True)
        before = _state(db, ids)

        res = c.post("/api/files/batch/purge", json={"ids": ids})

        assert res.status_code == 422
        assert _state(db, ids) == before
        assert all(not active for _, active in before)

    def test_batch_delete_with_100_ids_is_accepted(self, client):
        # Boundary: the cap is 100 inclusive, so one chunk of 100 is one request.
        c, db, _, _ = client
        ids = _rows(db, 100, trashed=False)

        res = c.post("/api/files/batch/delete", json={"ids": ids})

        assert res.status_code == 200
        assert set(res.json()) == {"deleted", "errors"}
