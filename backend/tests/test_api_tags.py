import shutil
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_video(db, videos_dir, suffix=""):
    cat_dir = videos_dir / "旅行"
    cat_dir.mkdir(exist_ok=True)
    fname = f"test{suffix}.mp4"
    shutil.copy(FIXTURES_DIR / "long_video.mp4", cat_dir / fname)

    from app.models import Video

    video = Video(
        filename=fname,
        title=f"Test Video{suffix}",
        category="旅行",
        file_path=f"旅行/{fname}",
        file_size=cat_dir.joinpath(fname).stat().st_size,
        duration=10.0,
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    return video


class TestListTags:
    def test_empty(self, client):
        c, db, videos_dir, data_dir = client
        res = c.get("/api/tags")
        assert res.status_code == 200
        assert res.json() == []

    def test_with_tags(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        c.put(f"/api/videos/{video.id}/tags", json={"tags": ["night", "tokyo"]})
        res = c.get("/api/tags")
        assert res.status_code == 200
        tags = res.json()
        assert len(tags) == 2
        names = [t["name"] for t in tags]
        assert "night" in names
        assert "tokyo" in names

    def test_tag_count(self, client):
        c, db, videos_dir, data_dir = client
        v1 = _seed_video(db, videos_dir, "1")
        v2 = _seed_video(db, videos_dir, "2")
        c.put(f"/api/videos/{v1.id}/tags", json={"tags": ["night"]})
        c.put(f"/api/videos/{v2.id}/tags", json={"tags": ["night", "tokyo"]})
        res = c.get("/api/tags")
        tags = {t["name"]: t["count"] for t in res.json()}
        assert tags["night"] == 2
        assert tags["tokyo"] == 1


class TestUpdateVideoTags:
    def test_set_tags(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        res = c.put(f"/api/videos/{video.id}/tags", json={"tags": ["night", "tokyo"]})
        assert res.status_code == 200
        assert sorted(res.json()["tags"]) == ["night", "tokyo"]

    def test_replace_tags(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        c.put(f"/api/videos/{video.id}/tags", json={"tags": ["night"]})
        res = c.put(f"/api/videos/{video.id}/tags", json={"tags": ["tokyo"]})
        assert res.json()["tags"] == ["tokyo"]

    def test_clear_tags(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        c.put(f"/api/videos/{video.id}/tags", json={"tags": ["night"]})
        res = c.put(f"/api/videos/{video.id}/tags", json={"tags": []})
        assert res.json()["tags"] == []

    def test_lowercase_normalization(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        res = c.put(f"/api/videos/{video.id}/tags", json={"tags": ["Tokyo", "NIGHT"]})
        assert sorted(res.json()["tags"]) == ["night", "tokyo"]

    def test_duplicate_tags(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        res = c.put(f"/api/videos/{video.id}/tags", json={"tags": ["night", "night"]})
        assert res.json()["tags"] == ["night"]

    def test_too_many_tags(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        tags = [f"tag{i}" for i in range(11)]
        res = c.put(f"/api/videos/{video.id}/tags", json={"tags": tags})
        assert res.status_code == 422

    def test_tag_too_long(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        res = c.put(f"/api/videos/{video.id}/tags", json={"tags": ["a" * 31]})
        assert res.status_code == 422

    def test_invalid_characters(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        res = c.put(f"/api/videos/{video.id}/tags", json={"tags": ["hello world"]})
        assert res.status_code == 422

    def test_not_found(self, client):
        c, db, videos_dir, data_dir = client
        res = c.put("/api/videos/999/tags", json={"tags": ["night"]})
        assert res.status_code == 404


class TestOrphanTagCleanup:
    def test_orphan_deleted(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        c.put(f"/api/videos/{video.id}/tags", json={"tags": ["night", "tokyo"]})
        c.put(f"/api/videos/{video.id}/tags", json={"tags": ["tokyo"]})
        tags = c.get("/api/tags").json()
        names = [t["name"] for t in tags]
        assert "night" not in names
        assert "tokyo" in names

    def test_shared_tag_not_deleted(self, client):
        c, db, videos_dir, data_dir = client
        v1 = _seed_video(db, videos_dir, "1")
        v2 = _seed_video(db, videos_dir, "2")
        c.put(f"/api/videos/{v1.id}/tags", json={"tags": ["night"]})
        c.put(f"/api/videos/{v2.id}/tags", json={"tags": ["night"]})
        c.put(f"/api/videos/{v1.id}/tags", json={"tags": []})
        tags = c.get("/api/tags").json()
        names = [t["name"] for t in tags]
        assert "night" in names


class TestTagFilter:
    def test_filter_by_tag(self, client):
        c, db, videos_dir, data_dir = client
        v1 = _seed_video(db, videos_dir, "1")
        v2 = _seed_video(db, videos_dir, "2")
        c.put(f"/api/videos/{v1.id}/tags", json={"tags": ["night"]})
        c.put(f"/api/videos/{v2.id}/tags", json={"tags": ["tokyo"]})
        res = c.get("/api/videos?tag=night")
        assert len(res.json()["data"]) == 1
        assert res.json()["data"][0]["id"] == v1.id

    def test_filter_no_match(self, client):
        c, db, videos_dir, data_dir = client
        _seed_video(db, videos_dir)
        res = c.get("/api/videos?tag=nonexistent")
        assert len(res.json()["data"]) == 0

    def test_response_includes_tags(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed_video(db, videos_dir)
        c.put(f"/api/videos/{video.id}/tags", json={"tags": ["night"]})
        res = c.get("/api/videos")
        assert "tags" in res.json()["data"][0]
        assert res.json()["data"][0]["tags"] == ["night"]
