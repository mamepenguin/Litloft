import json
import shutil
from pathlib import Path

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir, filename="test.mp4", folder="旅行"):
    d = drive_dir / folder
    d.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", d / filename)

    from app.models import File
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


def _seed_with_thumbnail(db, drive_dir, data_dir, filename="test.mp4", folder="旅行"):
    """Seed a file and create a fake thumbnail for it."""
    file = _seed(db, drive_dir, filename, folder)

    import app.config as config
    thumb_rel = f"{TEST_DRIVE}/{folder}/{Path(filename).stem}.jpg"
    thumb_path = config.THUMBNAILS_DIR / thumb_rel
    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    thumb_path.write_bytes(b"\xff\xd8\xff\xe0fake-jpeg")
    file.thumbnail_path = thumb_rel
    db.commit()
    db.refresh(file)
    return file



class TestCopyFileService:
    def test_basic_copy_same_folder(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["id"] != file.id
        assert data["filename"] == "test_copy.mp4"
        assert data["folder_path"] == "旅行"
        assert data["likes"] == 0
        assert data["is_favorite"] is False
        assert (drive_dir / "旅行" / "test_copy.mp4").exists()
        # Original still exists
        assert (drive_dir / "旅行" / "test.mp4").exists()

    def test_copy_to_different_folder(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        (drive_dir / "料理").mkdir(exist_ok=True)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "料理"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["filename"] == "test.mp4"  # No collision, original name kept
        assert data["folder_path"] == "料理"
        assert (drive_dir / "料理" / "test.mp4").exists()
        assert (drive_dir / "旅行" / "test.mp4").exists()

    def test_copy_to_root(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": ""},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["folder_path"] == ""
        assert data["filename"] == "test.mp4"
        assert (drive_dir / "test.mp4").exists()

    def test_filename_collision_copy_suffix(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        # First copy creates _copy
        res1 = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res1.status_code == 200
        assert res1.json()["filename"] == "test_copy.mp4"

        # Second copy creates _copy_2
        res2 = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res2.status_code == 200
        assert res2.json()["filename"] == "test_copy_2.mp4"

        # Third copy creates _copy_3
        res3 = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res3.status_code == 200
        assert res3.json()["filename"] == "test_copy_3.mp4"

    def test_copy_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.post(
            "/api/files/zzNOTFOUNDzz/copy",
            json={"target_folder_path": ""},
        )
        assert res.status_code == 404

    def test_copy_path_traversal(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "../../../tmp"},
        )
        assert res.status_code == 400

    def test_copy_preserves_metadata(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        # Set description on original
        file.description = "Original description"
        db.commit()

        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["description"] == "Original description"
        assert data["file_type"] == "video"
        assert data["mime_type"] == "video/mp4"

    def test_copy_resets_likes_and_favorite(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        file.likes = 5
        file.is_favorite = True
        db.commit()

        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["likes"] == 0
        assert data["is_favorite"] is False

    def test_copy_thumbnail(self, client):
        c, db, drive_dir, data_dir = client
        import app.config as config
        file = _seed_with_thumbnail(db, drive_dir, data_dir)

        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "旅行"},
        )
        assert res.status_code == 200
        new_id = res.json()["id"]
        # New thumbnail should exist for the copy
        new_thumb_rel = f"{TEST_DRIVE}/旅行/test_copy.jpg"
        assert (config.THUMBNAILS_DIR / new_thumb_rel).exists()
        # Original thumbnail still exists
        assert (config.THUMBNAILS_DIR / file.thumbnail_path).exists()


    def test_copy_creates_target_folder(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "新しいフォルダ"},
        )
        assert res.status_code == 200
        assert (drive_dir / "新しいフォルダ" / "test.mp4").exists()


class TestCopyFileCrossDrive:
    def test_cross_drive_copy(self, client):
        c, db, drive_dir, data_dir = client
        import app.config as config

        # Add a second writable drive
        drive2_dir = drive_dir.parent / "drive2"
        drive2_dir.mkdir(parents=True)
        drives_json = config.DRIVES_CONFIG
        drives_json.write_text(json.dumps([
            {"name": TEST_DRIVE, "path": str(drive_dir)},
            {"name": "drive2", "path": str(drive2_dir)},
        ]))
        config._drives_cache = None

        file = _seed(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/copy",
            json={"target_folder_path": "", "target_drive": "drive2"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["drive"] == "drive2"
        assert data["filename"] == "test.mp4"
        assert (drive2_dir / "test.mp4").exists()
        # Original still in place
        assert (drive_dir / "旅行" / "test.mp4").exists()


class TestBatchCopy:
    def test_batch_copy(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed(db, drive_dir, "a.mp4")
        f2 = _seed(db, drive_dir, "b.mp4")
        (drive_dir / "dest").mkdir(exist_ok=True)

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [f1.id, f2.id], "target_folder_path": "dest"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["copied"] == 2
        assert len(data["errors"]) == 0
        assert (drive_dir / "dest" / "a.mp4").exists()
        assert (drive_dir / "dest" / "b.mp4").exists()

    def test_batch_copy_partial_failure(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed(db, drive_dir, "a.mp4")

        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [f1.id, "zzNOTFOUNDzz"], "target_folder_path": "dest"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["copied"] == 1
        assert len(data["errors"]) == 1
        assert data["errors"][0]["id"] == "zzNOTFOUNDzz"

    def test_batch_copy_empty_ids(self, client):
        c, db, drive_dir, data_dir = client
        res = c.post(
            "/api/files/batch/copy",
            json={"ids": [], "target_folder_path": "dest"},
        )
        assert res.status_code == 422  # Validation error
