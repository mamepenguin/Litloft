import shutil
from pathlib import Path

import pytest

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_files(db, drive_dir, folder="photos", count=5):
    """Seed multiple files in a folder with distinct titles and sizes."""
    folder_dir = drive_dir / folder
    folder_dir.mkdir(exist_ok=True)

    from app.models import File

    files = []
    for i in range(count):
        fname = f"file_{i:02d}.mp4"
        shutil.copy(FIXTURES_DIR / "long_video.mp4", folder_dir / fname)
        f = File(
            filename=fname,
            title=f"Title {chr(65 + i)}",
            drive=TEST_DRIVE,
            folder_path=folder,
            file_path=f"{folder}/{fname}",
            file_size=1000 + i * 100,
            file_type="video",
            mime_type="video/mp4",
        )
        db.add(f)
        db.commit()
        db.refresh(f)
        files.append(f)
    return files


class TestNeighborsDefault:
    """Test neighbors with default sort (created_at desc)."""

    def test_middle_file(self, client):
        c, db, drive_dir, _ = client
        files = _seed_files(db, drive_dir)
        # Default: created_at desc → order is [4,3,2,1,0]
        mid = files[2]
        res = c.get(f"/api/files/{mid.id}/neighbors")
        assert res.status_code == 200
        data = res.json()
        assert data["prev_id"] == files[3].id
        assert data["next_id"] == files[1].id

    def test_first_file(self, client):
        c, db, drive_dir, _ = client
        files = _seed_files(db, drive_dir)
        # created_at desc → files[4] is first in list
        first = files[4]
        res = c.get(f"/api/files/{first.id}/neighbors")
        assert res.status_code == 200
        data = res.json()
        assert data["prev_id"] is None
        assert data["next_id"] == files[3].id

    def test_last_file(self, client):
        c, db, drive_dir, _ = client
        files = _seed_files(db, drive_dir)
        # created_at desc → files[0] is last in list
        last = files[0]
        res = c.get(f"/api/files/{last.id}/neighbors")
        assert res.status_code == 200
        data = res.json()
        assert data["prev_id"] == files[1].id
        assert data["next_id"] is None


class TestNeighborsSortTitle:
    """Test neighbors with title sort."""

    def test_title_asc(self, client):
        c, db, drive_dir, _ = client
        files = _seed_files(db, drive_dir)
        # title asc → A,B,C,D,E → [0,1,2,3,4]
        mid = files[2]  # Title C
        res = c.get(f"/api/files/{mid.id}/neighbors?sort=title&order=asc")
        assert res.status_code == 200
        data = res.json()
        assert data["prev_id"] == files[1].id  # Title B
        assert data["next_id"] == files[3].id  # Title D

    def test_title_desc(self, client):
        c, db, drive_dir, _ = client
        files = _seed_files(db, drive_dir)
        # title desc → E,D,C,B,A → [4,3,2,1,0]
        mid = files[2]  # Title C
        res = c.get(f"/api/files/{mid.id}/neighbors?sort=title&order=desc")
        assert res.status_code == 200
        data = res.json()
        assert data["prev_id"] == files[3].id  # Title D
        assert data["next_id"] == files[1].id  # Title B


class TestNeighborsSortFileSize:
    """Test neighbors with file_size sort."""

    def test_file_size_asc(self, client):
        c, db, drive_dir, _ = client
        files = _seed_files(db, drive_dir)
        # file_size asc → 1000,1100,1200,1300,1400 → [0,1,2,3,4]
        mid = files[2]
        res = c.get(f"/api/files/{mid.id}/neighbors?sort=file_size&order=asc")
        assert res.status_code == 200
        data = res.json()
        assert data["prev_id"] == files[1].id
        assert data["next_id"] == files[3].id


class TestNeighborsEdgeCases:
    """Edge cases."""

    def test_single_file(self, client):
        c, db, drive_dir, _ = client
        files = _seed_files(db, drive_dir, count=1)
        res = c.get(f"/api/files/{files[0].id}/neighbors")
        assert res.status_code == 200
        data = res.json()
        assert data["prev_id"] is None
        assert data["next_id"] is None

    def test_not_found(self, client):
        c, _, _, _ = client
        res = c.get("/api/files/zzNOTFOUNDzz/neighbors")
        assert res.status_code == 404

    def test_random_sort_rejected(self, client):
        c, db, drive_dir, _ = client
        files = _seed_files(db, drive_dir, count=1)
        res = c.get(f"/api/files/{files[0].id}/neighbors?sort=random")
        assert res.status_code == 422

    def test_different_folder_isolated(self, client):
        c, db, drive_dir, _ = client
        files_a = _seed_files(db, drive_dir, folder="folderA", count=3)
        _seed_files(db, drive_dir, folder="folderB", count=3)
        # Middle file in folderA should only see folderA neighbors
        mid = files_a[1]
        res = c.get(f"/api/files/{mid.id}/neighbors?sort=title&order=asc")
        assert res.status_code == 200
        data = res.json()
        assert data["prev_id"] == files_a[0].id
        assert data["next_id"] == files_a[2].id
