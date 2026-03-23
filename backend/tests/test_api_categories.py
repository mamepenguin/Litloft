import shutil
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, videos_dir):
    from app.models import Video

    for cat in ["旅行", "料理"]:
        d = videos_dir / cat
        d.mkdir(exist_ok=True)
        shutil.copy(FIXTURES_DIR / "short_video.mp4", d / "v.mp4")
        db.add(
            Video(
                filename="v.mp4",
                title="V",
                category=cat,
                file_path=f"{cat}/v.mp4",
                file_size=d.joinpath("v.mp4").stat().st_size,
            )
        )
    db.commit()


class TestCategories:
    def test_empty(self, client):
        c, db, videos_dir, data_dir = client
        res = c.get("/api/categories")
        assert res.status_code == 200
        assert res.json() == []

    def test_with_categories(self, client):
        c, db, videos_dir, data_dir = client
        _seed(db, videos_dir)
        res = c.get("/api/categories")
        assert res.status_code == 200
        cats = res.json()
        assert len(cats) == 2
        names = {c["name"] for c in cats}
        assert "旅行" in names
        assert "料理" in names
        assert all(c["count"] == 1 for c in cats)
