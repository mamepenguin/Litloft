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

    def test_drives_includes_file_count(self, client):
        # spec 2026-05-19-root-home-enrichment §3.1: list_drives returns a
        # per-drive active file_count via a single grouped query.
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)  # 2 active files (旅行/v.mp4, 料理/v.mp4)
        res = c.get("/api/drives")
        assert res.status_code == 200
        drives = res.json()
        assert drives[0]["name"] == TEST_DRIVE
        assert drives[0]["file_count"] == 2

    def test_file_count_zero_when_empty(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/drives")
        assert res.status_code == 200
        assert res.json()[0]["file_count"] == 0

    def test_file_count_excludes_trash_and_missing(self, client):
        # spec §3.1: counts must go through active_file_filter()
        # (design-decisions.md "File state": trash/missing excluded).
        from datetime import datetime, timezone

        from app.models import File

        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)  # 2 active
        now = datetime.now(timezone.utc)
        db.add(
            File(
                filename="trashed.mp4",
                title="Trashed",
                drive=TEST_DRIVE,
                folder_path="旅行",
                file_path="旅行/trashed.mp4",
                file_size=1,
                file_type="video",
                mime_type="video/mp4",
                deleted_at=now,
            )
        )
        db.add(
            File(
                filename="gone.mp4",
                title="Gone",
                drive=TEST_DRIVE,
                folder_path="料理",
                file_path="料理/gone.mp4",
                file_size=1,
                file_type="video",
                mime_type="video/mp4",
                missing_since=now,
            )
        )
        db.commit()
        res = c.get("/api/drives")
        assert res.status_code == 200
        # Only the 2 active files count; trash + missing excluded.
        assert res.json()[0]["file_count"] == 2

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

    def test_search_matches_folder_path_only(self, client):
        # spec 2026-05-02-search-path-match: "旅行" は folder_path のみに含まれ
        # title "V" には含まれない。filename match SQL の WHERE が title OR
        # folder_path に拡張されたことで初めてヒットする。
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=旅行")
        assert res.status_code == 200
        body = res.json()["data"]
        assert len(body) == 1
        assert body[0]["folder_path"] == "旅行"
        assert body[0]["match_source"] == "path"

    def test_search_match_source_filename(self, client):
        # title "V" にヒットし folder_path には無いケース。
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=V")
        assert res.status_code == 200
        for item in res.json()["data"]:
            assert item["match_source"] == "filename"

    def test_search_match_source_both(self, client):
        # title と folder_path の両方にクエリ語が含まれる場合は "both"。
        from app.models import File
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        d = drive_dir / "旅行"
        (d / "kyoto.mp4").write_bytes(b"x")
        db.add(File(
            filename="kyoto.mp4",
            title="旅行のメモ",
            drive=TEST_DRIVE,
            folder_path="旅行",
            file_path="旅行/kyoto.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
        ))
        db.commit()
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=旅行")
        assert res.status_code == 200
        items = res.json()["data"]
        sources = {item["title"]: item["match_source"] for item in items}
        assert sources["旅行のメモ"] == "both"
        assert sources["V"] == "path"

    def test_search_no_match_source_when_unsearched(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files")
        for item in res.json()["data"]:
            assert item["match_source"] is None

    def test_search_escapes_like_special_chars(self, client):
        # "%" / "_" がリテラル扱いされ、無関係なファイルがヒットしないこと。
        from app.models import File
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        d = drive_dir / "discounts"
        d.mkdir()
        (d / "literal.mp4").write_bytes(b"x")
        db.add(File(
            filename="literal.mp4",
            title="50% off sale",
            drive=TEST_DRIVE,
            folder_path="discounts",
            file_path="discounts/literal.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
        ))
        db.commit()
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=50%25")  # URL-encoded %
        assert res.status_code == 200
        items = res.json()["data"]
        assert len(items) == 1
        assert items[0]["title"] == "50% off sale"

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
