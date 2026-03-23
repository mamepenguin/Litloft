import shutil
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_video(db, videos_dir):
    cat_dir = videos_dir / "旅行"
    cat_dir.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "long_video.mp4", cat_dir / "test.mp4")

    from app.models import Video

    video = Video(
        filename="test.mp4",
        title="Test Video",
        category="旅行",
        file_path="旅行/test.mp4",
        file_size=cat_dir.joinpath("test.mp4").stat().st_size,
        duration=10.0,
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    return video


class TestFavoriteToggle:
    def test_toggle_on(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        res = c.post(f"/api/videos/{video.id}/favorite")
        assert res.status_code == 200
        assert res.json()["is_favorite"] is True

    def test_toggle_off(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        c.post(f"/api/videos/{video.id}/favorite")
        res = c.post(f"/api/videos/{video.id}/favorite")
        assert res.status_code == 200
        assert res.json()["is_favorite"] is False

    def test_toggle_not_found(self, client):
        c, db, videos_dir, data_dir = client
        res = c.post("/api/videos/999/favorite")
        assert res.status_code == 404


class TestFavoriteFilter:
    def test_filter_favorites(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        c.post(f"/api/videos/{video.id}/favorite")

        res = c.get("/api/videos?favorite=true")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 1

        res = c.get("/api/videos?favorite=false")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 0

    def test_no_filter(self, client):
        c, db, videos_dir, data_dir = client
        _seed_video(db, videos_dir)
        res = c.get("/api/videos")
        assert len(res.json()["data"]) == 1

    def test_response_includes_is_favorite(self, client):
        c, db, videos_dir, data_dir = client
        _seed_video(db, videos_dir)
        res = c.get("/api/videos")
        assert "is_favorite" in res.json()["data"][0]
        assert res.json()["data"][0]["is_favorite"] is False
