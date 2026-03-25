import shutil
from pathlib import Path

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_file(db, drive_dir):
    folder = drive_dir / "旅行"
    folder.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "long_video.mp4", folder / "test.mp4")

    from app.models import File

    file = File(
        filename="test.mp4",
        title="Test Video",
        drive=TEST_DRIVE,
        folder_path="旅行",
        file_path="旅行/test.mp4",
        file_size=folder.joinpath("test.mp4").stat().st_size,
        file_type="video",
        mime_type="video/mp4",
        duration=10.0,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestFavoriteToggle:
    def test_toggle_on(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.post(f"/api/files/{file.id}/favorite")
        assert res.status_code == 200
        assert res.json()["is_favorite"] is True

    def test_toggle_off(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(f"/api/files/{file.id}/favorite")
        res = c.post(f"/api/files/{file.id}/favorite")
        assert res.status_code == 200
        assert res.json()["is_favorite"] is False

    def test_toggle_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.post("/api/files/zzNOTFOUNDzz/favorite")
        assert res.status_code == 404


class TestFavoriteFilter:
    def test_filter_favorites(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.post(f"/api/files/{file.id}/favorite")

        drive = TEST_DRIVE
        res = c.get(f"/api/drives/{drive}/files?favorite=true")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 1

        res = c.get(f"/api/drives/{drive}/files?favorite=false")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 0

    def test_no_filter(self, client):
        c, db, drive_dir, data_dir = client
        _seed_file(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files")
        assert len(res.json()["data"]) == 1

    def test_response_includes_is_favorite(self, client):
        c, db, drive_dir, data_dir = client
        _seed_file(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files")
        assert "is_favorite" in res.json()["data"][0]
        assert res.json()["data"][0]["is_favorite"] is False
