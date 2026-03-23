import shutil
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, videos_dir):
    from app.models import Video

    cat_dir = videos_dir / "旅行"
    cat_dir.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", cat_dir / "test.mp4")

    video = Video(
        filename="test.mp4",
        title="Test",
        category="旅行",
        file_path="旅行/test.mp4",
        file_size=cat_dir.joinpath("test.mp4").stat().st_size,
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    # Tamper with file_path to simulate path traversal
    video.file_path = "../../../etc/passwd"
    db.commit()
    return video


class TestPathTraversal:
    def test_stream_blocked(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed(db, videos_dir)
        res = c.get(f"/api/videos/{video.id}/stream")
        assert res.status_code in (403, 404)

    def test_thumbnail_blocked(self, client):
        c, db, videos_dir, data_dir = client
        video = _seed(db, videos_dir)
        video.thumbnail_path = "../../../etc/passwd"
        db.commit()
        res = c.get(f"/api/videos/{video.id}/thumbnail")
        # Should return placeholder or 403, not the file
        assert res.status_code in (200, 403, 404)
        if res.status_code == 200:
            assert res.headers["content-type"] == "image/jpeg"
