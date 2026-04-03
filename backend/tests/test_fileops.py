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


class TestRenameFile:
    def test_rename(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.put(f"/api/files/{file.id}/rename", json={"new_filename": "renamed.mp4"})
        assert res.status_code == 200
        assert res.json()["filename"] == "renamed.mp4"
        assert (drive_dir / "旅行" / "renamed.mp4").exists()
        assert not (drive_dir / "旅行" / "test.mp4").exists()

    def test_rename_conflict(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir, "a.mp4")
        file = _seed(db, drive_dir, "b.mp4")
        res = c.put(f"/api/files/{file.id}/rename", json={"new_filename": "a.mp4"})
        assert res.status_code == 409

    def test_rename_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.put("/api/files/zzNOTFOUNDzz/rename", json={"new_filename": "x.mp4"})
        assert res.status_code == 404

    def test_rename_invalid_filename(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.put(f"/api/files/{file.id}/rename", json={"new_filename": "../hack.mp4"})
        assert res.status_code == 400


class TestMoveFile:
    def test_move(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        (drive_dir / "料理").mkdir(exist_ok=True)
        res = c.put(f"/api/files/{file.id}/move", json={"target_folder_path": "料理"})
        assert res.status_code == 200
        assert res.json()["folder_path"] == "料理"
        assert (drive_dir / "料理" / "test.mp4").exists()

    def test_move_conflict(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        (drive_dir / "料理").mkdir(exist_ok=True)
        shutil.copy(FIXTURES_DIR / "short_video.mp4", drive_dir / "料理" / "test.mp4")
        res = c.put(f"/api/files/{file.id}/move", json={"target_folder_path": "料理"})
        assert res.status_code == 409

    def test_move_path_traversal(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.put(f"/api/files/{file.id}/move", json={"target_folder_path": "../../../tmp"})
        assert res.status_code == 400


class TestDeleteFile:
    def test_delete(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.delete(f"/api/files/{file.id}")
        assert res.status_code == 200
        # Soft delete: file stays on disk but is not accessible via API
        assert (drive_dir / "旅行" / "test.mp4").exists()
        assert c.get(f"/api/files/{file.id}").status_code == 404

    def test_delete_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.delete("/api/files/zzNOTFOUNDzz")
        assert res.status_code == 404


class TestFolderCreate:
    def test_create(self, client):
        c, db, drive_dir, data_dir = client
        res = c.post(f"/api/drives/{TEST_DRIVE}/folders", json={"name": "新フォルダ"})
        assert res.status_code == 200
        assert res.json()["name"] == "新フォルダ"
        assert (drive_dir / "新フォルダ").is_dir()

    def test_create_nested(self, client):
        c, db, drive_dir, data_dir = client
        (drive_dir / "親").mkdir()
        res = c.post(f"/api/drives/{TEST_DRIVE}/folders", json={"path": "親", "name": "子"})
        assert res.status_code == 200
        assert (drive_dir / "親" / "子").is_dir()

    def test_create_conflict(self, client):
        c, db, drive_dir, data_dir = client
        (drive_dir / "既存").mkdir()
        res = c.post(f"/api/drives/{TEST_DRIVE}/folders", json={"name": "既存"})
        assert res.status_code == 409

    def test_create_shows_in_listing(self, client):
        c, db, drive_dir, data_dir = client
        c.post(f"/api/drives/{TEST_DRIVE}/folders", json={"name": "空フォルダ"})
        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        names = [f["name"] for f in res.json()]
        assert "空フォルダ" in names


class TestFolderRename:
    def test_rename(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders",
            json={"path": "旅行", "new_name": "旅行2024"},
        )
        assert res.status_code == 200
        assert (drive_dir / "旅行2024").is_dir()
        # Verify file paths updated
        file_res = c.get(f"/api/files/{file.id}")
        assert file_res.json()["folder_path"] == "旅行2024"

    def test_rename_conflict(self, client):
        c, db, drive_dir, data_dir = client
        (drive_dir / "aaa").mkdir()
        (drive_dir / "bbb").mkdir()
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders",
            json={"path": "aaa", "new_name": "bbb"},
        )
        assert res.status_code == 409


class TestFolderMove:
    def test_move_to_root(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)  # creates 旅行/test.mp4
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders/move",
            json={"path": "旅行", "target_path": ""},
        )
        # Already at root level, so this is a no-op
        assert res.status_code == 400

    def test_move_to_subfolder(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)  # creates 旅行/test.mp4
        (drive_dir / "アーカイブ").mkdir()
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders/move",
            json={"path": "旅行", "target_path": "アーカイブ"},
        )
        assert res.status_code == 200
        assert res.json()["path"] == "アーカイブ/旅行"
        assert (drive_dir / "アーカイブ" / "旅行" / "test.mp4").exists()
        # Verify file paths updated
        file_res = c.get(f"/api/files/{file.id}")
        assert file_res.json()["folder_path"] == "アーカイブ/旅行"

    def test_move_into_self(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        (drive_dir / "旅行" / "sub").mkdir()
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders/move",
            json={"path": "旅行", "target_path": "旅行/sub"},
        )
        assert res.status_code == 400

    def test_move_conflict(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        (drive_dir / "dest").mkdir()
        (drive_dir / "dest" / "旅行").mkdir()
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders/move",
            json={"path": "旅行", "target_path": "dest"},
        )
        assert res.status_code == 409

    def test_move_updates_pinned_folders(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        # Pin the folder
        c.post(f"/api/drives/{TEST_DRIVE}/pins", json={"path": "旅行"})
        (drive_dir / "dest").mkdir()
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders/move",
            json={"path": "旅行", "target_path": "dest"},
        )
        assert res.status_code == 200
        # Verify pin updated
        pins_res = c.get(f"/api/drives/{TEST_DRIVE}/pins")
        pin_paths = [p["path"] for p in pins_res.json()]
        assert "dest/旅行" in pin_paths
        assert "旅行" not in pin_paths

    def test_move_not_found(self, client):
        c, db, drive_dir, data_dir = client
        (drive_dir / "dest").mkdir()
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders/move",
            json={"path": "nonexistent", "target_path": "dest"},
        )
        assert res.status_code == 404

    def test_move_path_traversal(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders/move",
            json={"path": "旅行", "target_path": "../../../tmp"},
        )
        assert res.status_code == 400


class TestFolderDelete:
    def test_delete_empty(self, client):
        c, db, drive_dir, data_dir = client
        c.post(f"/api/drives/{TEST_DRIVE}/folders", json={"name": "空"})
        res = c.delete(f"/api/drives/{TEST_DRIVE}/folders?path=空")
        assert res.status_code == 200
        # Folder still exists on filesystem (soft-delete does not rmdir)
        assert (drive_dir / "空").exists()

    def test_delete_non_empty(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.delete(f"/api/drives/{TEST_DRIVE}/folders?path=旅行")
        assert res.status_code == 200
        # Files are soft-deleted, not physically removed
        from app.models import File
        db.expire_all()
        record = db.query(File).filter(File.id == file.id).first()
        assert record.deleted_at is not None

    def test_delete_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.delete(f"/api/drives/{TEST_DRIVE}/folders?path=nonexistent")
        assert res.status_code == 404


class TestDownload:
    def test_stream_download(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/stream?download=true")
        assert res.status_code == 200
        assert "attachment" in res.headers.get("content-disposition", "")

    def test_stream_no_download(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed(db, drive_dir)
        res = c.get(f"/api/files/{file.id}/stream")
        assert res.status_code == 200
        assert "content-disposition" not in res.headers
