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

    def test_thumbnail_file_id_with_video(self, client):
        """Folder with video files returns thumbnail_file_id (first by filename)."""
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        assert res.status_code == 200
        folders = res.json()
        for f in folders:
            assert f["thumbnail_file_id"] is not None

    def test_thumbnail_file_id_selects_first_by_filename(self, client):
        """thumbnail_file_id picks the first image/video file by filename ASC."""
        from app.models import File

        c, db, drive_dir, data_dir = client
        d = drive_dir / "gallery"
        d.mkdir()
        shutil.copy(FIXTURES_DIR / "short_video.mp4", d / "b_second.mp4")
        shutil.copy(FIXTURES_DIR / "short_video.mp4", d / "a_first.mp4")
        size = d.joinpath("a_first.mp4").stat().st_size
        file_a = File(
            filename="a_first.mp4",
            title="A",
            drive=TEST_DRIVE,
            folder_path="gallery",
            file_path="gallery/a_first.mp4",
            file_size=size,
            file_type="video",
            mime_type="video/mp4",
        )
        file_b = File(
            filename="b_second.mp4",
            title="B",
            drive=TEST_DRIVE,
            folder_path="gallery",
            file_path="gallery/b_second.mp4",
            file_size=size,
            file_type="video",
            mime_type="video/mp4",
        )
        db.add(file_b)
        db.add(file_a)
        db.commit()
        db.refresh(file_a)

        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        folders = res.json()
        assert len(folders) == 1
        assert folders[0]["thumbnail_file_id"] == file_a.id

    def test_thumbnail_file_id_null_for_non_media_files(self, client):
        """Folder with only non-image/non-video files returns null thumbnail."""
        from app.models import File

        c, db, drive_dir, data_dir = client
        d = drive_dir / "docs"
        d.mkdir()
        (d / "readme.txt").write_text("hello")
        db.add(
            File(
                filename="readme.txt",
                title="Readme",
                drive=TEST_DRIVE,
                folder_path="docs",
                file_path="docs/readme.txt",
                file_size=5,
                file_type="document",
                mime_type="text/plain",
            )
        )
        db.commit()

        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        folders = res.json()
        assert len(folders) == 1
        assert folders[0]["name"] == "docs"
        assert folders[0]["thumbnail_file_id"] is None

    def test_thumbnail_file_id_null_for_empty_folder(self, client):
        """Empty folder returns null thumbnail."""
        from app.models import EmptyFolder

        c, db, drive_dir, data_dir = client
        (drive_dir / "empty").mkdir()
        db.add(EmptyFolder(drive=TEST_DRIVE, path="empty"))
        db.commit()

        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        folders = res.json()
        assert len(folders) == 1
        assert folders[0]["name"] == "empty"
        assert folders[0]["thumbnail_file_id"] is None

    def test_thumbnail_from_subfolder(self, client):
        """Parent folder uses image/video from subfolder as thumbnail."""
        from app.models import File

        c, db, drive_dir, data_dir = client
        d = drive_dir / "parent" / "child"
        d.mkdir(parents=True)
        shutil.copy(FIXTURES_DIR / "short_video.mp4", d / "clip.mp4")
        size = d.joinpath("clip.mp4").stat().st_size
        child_file = File(
            filename="clip.mp4",
            title="Clip",
            drive=TEST_DRIVE,
            folder_path="parent/child",
            file_path="parent/child/clip.mp4",
            file_size=size,
            file_type="video",
            mime_type="video/mp4",
        )
        db.add(child_file)
        db.commit()
        db.refresh(child_file)

        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        folders = res.json()
        assert len(folders) == 1
        assert folders[0]["name"] == "parent"
        assert folders[0]["thumbnail_file_id"] == child_file.id


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
