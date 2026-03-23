import shutil
from pathlib import Path

import pytest

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


class TestListVideos:
    def test_empty(self, client):
        c, db, videos_dir, data_dir = client
        res = c.get("/api/videos")
        assert res.status_code == 200
        body = res.json()
        assert body["data"] == []
        assert body["meta"]["total"] == 0

    def test_with_videos(self, client):
        c, db, videos_dir, data_dir = client
        _seed_video(db, videos_dir)
        res = c.get("/api/videos")
        assert res.status_code == 200
        body = res.json()
        assert len(body["data"]) == 1
        assert body["data"][0]["title"] == "Test Video"
        assert body["meta"]["total"] == 1

    def test_filter_category(self, client):
        c, db, videos_dir, data_dir = client
        _seed_video(db, videos_dir)
        res = c.get("/api/videos?category=旅行")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 1

        res = c.get("/api/videos?category=料理")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 0

    def test_search(self, client):
        c, db, videos_dir, data_dir = client
        _seed_video(db, videos_dir)
        res = c.get("/api/videos?search=Test")
        assert len(res.json()["data"]) == 1

        res = c.get("/api/videos?search=nonexistent")
        assert len(res.json()["data"]) == 0

    def test_sort(self, client):
        c, db, videos_dir, data_dir = client
        _seed_video(db, videos_dir)
        res = c.get("/api/videos?sort=title&order=asc")
        assert res.status_code == 200

    def test_pagination(self, client):
        c, db, videos_dir, data_dir = client
        _seed_video(db, videos_dir)
        res = c.get("/api/videos?page=1&limit=1")
        assert res.status_code == 200
        body = res.json()
        assert body["meta"]["page"] == 1
        assert body["meta"]["limit"] == 1


class TestGetVideo:
    def test_existing(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        res = c.get(f"/api/videos/{video.id}")
        assert res.status_code == 200
        assert res.json()["title"] == "Test Video"

    def test_not_found(self, client):
        c, db, videos_dir, data_dir = client
        res = c.get("/api/videos/999")
        assert res.status_code == 404


class TestUpdateVideo:
    def test_update_title(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        res = c.put(
            f"/api/videos/{video.id}",
            json={"title": "New Title"},
        )
        assert res.status_code == 200
        assert res.json()["title"] == "New Title"

    def test_update_description(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        res = c.put(
            f"/api/videos/{video.id}",
            json={"description": "New desc"},
        )
        assert res.status_code == 200
        assert res.json()["description"] == "New desc"

    def test_not_found(self, client):
        c, db, videos_dir, data_dir = client
        res = c.put("/api/videos/999", json={"title": "x"})
        assert res.status_code == 404
