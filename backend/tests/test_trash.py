import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from app.models import File
from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir, filename="test.mp4", folder="旅行"):
    d = drive_dir / folder
    d.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", d / filename)

    file = File(
        filename=filename,
        title="Test",
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=f"{folder}/{filename}",
        file_size=d.joinpath(filename).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _seed_at_root(db, drive_dir, filename="root.mp4"):
    shutil.copy(FIXTURES_DIR / "short_video.mp4", drive_dir / filename)

    file = File(
        filename=filename,
        title="Root",
        drive=TEST_DRIVE,
        folder_path="",
        file_path=filename,
        file_size=(drive_dir / filename).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestSoftDelete:
    def test_soft_delete_sets_deleted_at(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)

        res = c.delete(f"/api/files/{file.id}")
        assert res.status_code == 200

        # File still on disk
        assert (drive_dir / "旅行" / "test.mp4").exists()

        # File not accessible via normal API
        assert c.get(f"/api/files/{file.id}").status_code == 404

        # DB record has deleted_at set
        db.expire_all()
        record = db.query(File).filter(File.id == file.id).first()
        assert record is not None
        assert record.deleted_at is not None

    def test_soft_deleted_excluded_from_listing(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        c.delete(f"/api/files/{file.id}")

        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=旅行")
        assert res.status_code == 200
        data = res.json()["data"]
        ids = [f["id"] for f in data]
        assert file.id not in ids

    def test_soft_deleted_excluded_from_folder_count(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        c.delete(f"/api/files/{file.id}")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        assert res.status_code == 200
        # Folder may show as empty or not at all (depending on EmptyFolder tracking)
        for folder in res.json():
            if folder["path"] == "旅行":
                assert folder["file_count"] == 0
                break

    def test_soft_deleted_excluded_from_search(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        c.delete(f"/api/files/{file.id}")

        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=Test")
        assert res.status_code == 200
        ids = [f["id"] for f in res.json()["data"]]
        assert file.id not in ids

    def test_soft_deleted_excluded_from_batch_get(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        c.delete(f"/api/files/{file.id}")

        res = c.post("/api/files/batch/get", json={"ids": [file.id]})
        assert res.status_code == 200
        assert len(res.json()) == 0

    def test_soft_deleted_excluded_from_neighbors(self, client):
        c, db, drive_dir, _ = client
        # Wait for background scan to finish before seeding
        import time
        time.sleep(0.5)

        f1 = _seed(db, drive_dir, "na.mp4")
        f2 = _seed(db, drive_dir, "nb.mp4")
        f3 = _seed(db, drive_dir, "nc.mp4")
        c.delete(f"/api/files/{f2.id}")

        res = c.get(f"/api/files/{f1.id}/neighbors?sort=created_at&order=asc")
        assert res.status_code == 200
        body = res.json()
        # f2 is trashed, so next neighbor of f1 should be f3
        assert body["next_id"] == f3.id


class TestTrashList:
    def test_trash_list(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        c.delete(f"/api/files/{file.id}")

        res = c.get(f"/api/drives/{TEST_DRIVE}/trash")
        assert res.status_code == 200
        data = res.json()["data"]
        assert len(data) == 1
        assert data[0]["id"] == file.id
        assert data[0]["deleted_at"] is not None

    def test_trash_list_empty(self, client):
        c, db, drive_dir, _ = client

        res = c.get(f"/api/drives/{TEST_DRIVE}/trash")
        assert res.status_code == 200
        assert res.json()["data"] == []

    def test_trash_list_pagination(self, client):
        c, db, drive_dir, _ = client
        files = []
        for i in range(5):
            files.append(_seed(db, drive_dir, f"file_{i}.mp4"))
        for f in files:
            c.delete(f"/api/files/{f.id}")

        res = c.get(f"/api/drives/{TEST_DRIVE}/trash?limit=2&page=1")
        assert res.status_code == 200
        body = res.json()
        assert len(body["data"]) == 2
        assert body["meta"]["total"] == 5


class TestRestore:
    def test_restore(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        c.delete(f"/api/files/{file.id}")

        res = c.post(f"/api/files/{file.id}/restore")
        assert res.status_code == 200
        assert res.json()["deleted_at"] is None

        # File accessible again
        assert c.get(f"/api/files/{file.id}").status_code == 200

    def test_restore_missing_disk_file(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        c.delete(f"/api/files/{file.id}")

        # Remove file from disk
        (drive_dir / "旅行" / "test.mp4").unlink()

        res = c.post(f"/api/files/{file.id}/restore")
        assert res.status_code == 404
        assert "no longer exists" in res.json()["detail"]

    def test_restore_non_trashed_file(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)

        res = c.post(f"/api/files/{file.id}/restore")
        assert res.status_code == 404

    def test_restore_not_found(self, client):
        c, _, _, _ = client
        res = c.post("/api/files/zzNOTFOUNDzz/restore")
        assert res.status_code == 404


class TestPurge:
    def test_purge(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        file_id = file.id
        c.delete(f"/api/files/{file_id}")

        res = c.delete(f"/api/files/{file_id}/purge")
        assert res.status_code == 200

        # File removed from disk
        assert not (drive_dir / "旅行" / "test.mp4").exists()

        # DB record gone
        db.expire_all()
        assert db.query(File).filter(File.id == file_id).first() is None

    def test_purge_non_trashed_file(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)

        res = c.delete(f"/api/files/{file.id}/purge")
        assert res.status_code == 404

    def test_purge_not_found(self, client):
        c, _, _, _ = client
        res = c.delete("/api/files/zzNOTFOUNDzz/purge")
        assert res.status_code == 404


class TestEmptyTrash:
    def test_empty_trash(self, client):
        c, db, drive_dir, _ = client
        f1 = _seed(db, drive_dir, "a.mp4")
        f2 = _seed(db, drive_dir, "b.mp4")
        c.delete(f"/api/files/{f1.id}")
        c.delete(f"/api/files/{f2.id}")

        res = c.post(f"/api/drives/{TEST_DRIVE}/trash/empty")
        assert res.status_code == 200
        assert res.json()["purged"] == 2

        # Files removed from disk
        assert not (drive_dir / "旅行" / "a.mp4").exists()
        assert not (drive_dir / "旅行" / "b.mp4").exists()

        # Trash is empty
        res = c.get(f"/api/drives/{TEST_DRIVE}/trash")
        assert res.json()["data"] == []

    def test_empty_trash_no_items(self, client):
        c, db, drive_dir, _ = client

        res = c.post(f"/api/drives/{TEST_DRIVE}/trash/empty")
        assert res.status_code == 200
        assert res.json()["purged"] == 0


class TestBatchRestorePurge:
    def test_batch_restore(self, client):
        c, db, drive_dir, _ = client
        f1 = _seed(db, drive_dir, "a.mp4")
        f2 = _seed(db, drive_dir, "b.mp4")
        c.delete(f"/api/files/{f1.id}")
        c.delete(f"/api/files/{f2.id}")

        res = c.post("/api/files/batch/restore", json={"ids": [f1.id, f2.id]})
        assert res.status_code == 200
        assert res.json()["restored"] == 2

        # Both accessible again
        assert c.get(f"/api/files/{f1.id}").status_code == 200
        assert c.get(f"/api/files/{f2.id}").status_code == 200

    def test_batch_purge(self, client):
        c, db, drive_dir, _ = client
        f1 = _seed(db, drive_dir, "a.mp4")
        f2 = _seed(db, drive_dir, "b.mp4")
        c.delete(f"/api/files/{f1.id}")
        c.delete(f"/api/files/{f2.id}")

        res = c.post("/api/files/batch/purge", json={"ids": [f1.id, f2.id]})
        assert res.status_code == 200
        assert res.json()["purged"] == 2

        # Files gone from disk
        assert not (drive_dir / "旅行" / "a.mp4").exists()
        assert not (drive_dir / "旅行" / "b.mp4").exists()

    def test_batch_restore_partial_failure(self, client):
        c, db, drive_dir, _ = client
        f1 = _seed(db, drive_dir, "a.mp4")
        c.delete(f"/api/files/{f1.id}")

        res = c.post("/api/files/batch/restore", json={"ids": [f1.id, "zzNOTFOUNDzz"]})
        assert res.status_code == 200
        assert res.json()["restored"] == 1
        assert len(res.json()["errors"]) == 1


class TestScannerSkipsTrashed:
    def test_scanner_skips_soft_deleted(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        c.delete(f"/api/files/{file.id}")

        # Remove file from disk (simulating user deletion outside app)
        (drive_dir / "旅行" / "test.mp4").unlink()

        # Trigger scan
        res = c.post(f"/api/drives/{TEST_DRIVE}/scan")
        assert res.status_code == 200

        # Soft-deleted record should still exist in DB (not removed by scan)
        db.expire_all()
        record = db.query(File).filter(File.id == file.id).first()
        assert record is not None
        assert record.deleted_at is not None


class TestAutoPurge:
    def test_purge_expired_files(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        c.delete(f"/api/files/{file.id}")

        # Manually set deleted_at to 31 days ago
        db.expire_all()
        record = db.query(File).filter(File.id == file.id).first()
        record.deleted_at = datetime.now(UTC) - timedelta(days=31)
        db.commit()

        # Run purge logic directly
        from app.main import TRASH_RETENTION_DAYS
        from app.services.fileops import physical_delete

        cutoff = datetime.now(UTC) - timedelta(days=TRASH_RETENTION_DAYS)
        expired = (
            db.query(File)
            .filter(File.deleted_at.isnot(None), File.deleted_at < cutoff)
            .all()
        )
        assert len(expired) == 1
        for f in expired:
            physical_delete(db, f)
        db.commit()

        # File gone from disk and DB
        assert not (drive_dir / "旅行" / "test.mp4").exists()
        db.expire_all()
        assert db.query(File).filter(File.id == file.id).first() is None

    def test_non_expired_files_not_purged(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        c.delete(f"/api/files/{file.id}")

        from app.main import TRASH_RETENTION_DAYS

        cutoff = datetime.now(UTC) - timedelta(days=TRASH_RETENTION_DAYS)
        expired = (
            db.query(File)
            .filter(File.deleted_at.isnot(None), File.deleted_at < cutoff)
            .all()
        )
        assert len(expired) == 0


class TestTagListExcludesTrashed:
    def test_tag_count_excludes_trashed(self, client):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)

        # Add tag
        c.put(f"/api/files/{file.id}/tags", json={"tags": ["travel"]})

        # Verify tag has count 1
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags")
        tags = {t["name"]: t["count"] for t in res.json()}
        assert tags.get("travel") == 1

        # Soft delete
        c.delete(f"/api/files/{file.id}")

        # Tag count should be 0
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags")
        tags = {t["name"]: t["count"] for t in res.json()}
        assert tags.get("travel", 0) == 0
