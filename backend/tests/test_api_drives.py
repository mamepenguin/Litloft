import shutil
from pathlib import Path

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir):
    from app.models import File

    for folder_name in ["旅行", "料理"]:
        d = drive_dir / folder_name
        d.mkdir(exist_ok=True)
        shutil.copy(FIXTURES_DIR / "short_video.mp4", d / "v.mp4")
        db.add(
            File(
                filename="v.mp4",
                title="V",
                drive=TEST_DRIVE,
                folder_path=folder_name,
                file_path=f"{folder_name}/v.mp4",
                file_size=d.joinpath("v.mp4").stat().st_size,
                file_type="video",
                mime_type="video/mp4",
            )
        )
    db.commit()


def _seed_nested(db, drive_dir):
    from app.models import File

    folders = ["アクション", "アクション/SF", "アクション/コメディ"]
    for folder in folders:
        d = drive_dir / folder
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(FIXTURES_DIR / "short_video.mp4", d / "v.mp4")
        db.add(
            File(
                filename="v.mp4",
                title=f"V in {folder}",
                drive=TEST_DRIVE,
                folder_path=folder,
                file_path=f"{folder}/v.mp4",
                file_size=d.joinpath("v.mp4").stat().st_size,
                file_type="video",
                mime_type="video/mp4",
            )
        )
    db.commit()


class TestListDrives:
    def test_drives(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/drives")
        assert res.status_code == 200
        drives = res.json()
        assert len(drives) == 1
        assert drives[0]["name"] == TEST_DRIVE

    def test_invalid_drive(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/drives/nonexistent/files")
        assert res.status_code == 404


class TestListFolders:
    def test_root_folders(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        assert res.status_code == 200
        folders = res.json()
        assert len(folders) == 2
        names = {f["name"] for f in folders}
        assert "旅行" in names
        assert "料理" in names
        assert all(f["file_count"] == 1 for f in folders)

    def test_nested_folders(self, client):
        c, db, drive_dir, data_dir = client
        _seed_nested(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/folders?path=アクション")
        assert res.status_code == 200
        folders = res.json()
        assert len(folders) == 2
        names = {f["name"] for f in folders}
        assert "SF" in names
        assert "コメディ" in names

    def test_empty(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        assert res.status_code == 200
        assert res.json() == []


class TestListDriveFiles:
    def test_all_files(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 2

    def test_filter_by_path(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=旅行")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 1

    def test_filter_by_path_no_match(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=音楽")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 0

    def test_filter_by_type(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?type=video")
        assert len(res.json()["data"]) == 2

        res = c.get(f"/api/drives/{TEST_DRIVE}/files?type=image")
        assert len(res.json()["data"]) == 0

    def test_search(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=V")
        assert len(res.json()["data"]) == 2

        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=nonexistent")
        assert len(res.json()["data"]) == 0

    def test_sort(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?sort=title&order=asc")
        assert res.status_code == 200

    def test_pagination(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?page=1&limit=1")
        assert res.status_code == 200
        body = res.json()
        assert body["meta"]["page"] == 1
        assert body["meta"]["limit"] == 1
        assert len(body["data"]) == 1
        assert body["meta"]["total"] == 2
