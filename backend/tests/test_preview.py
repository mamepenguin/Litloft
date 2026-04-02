import shutil

import pytest
from PIL import Image

from app.models import File
from app.services.preview import (
    FRAME_COUNT,
    FRAME_HEIGHT,
    FRAME_WIDTH,
    _compute_timestamps,
    generate_preview_sprite,
)

from .conftest import TEST_DRIVE


class TestComputeTimestamps:
    def test_with_duration(self):
        timestamps = _compute_timestamps(80.0)
        assert len(timestamps) == 8
        assert timestamps[0] == 0.0
        assert timestamps[1] == 10.0
        assert timestamps[7] == 70.0

    def test_with_zero_duration(self):
        timestamps = _compute_timestamps(0.0)
        assert timestamps == [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0]

    def test_with_none_duration(self):
        timestamps = _compute_timestamps(None)
        assert timestamps == [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0]


class TestGeneratePreviewSprite:
    def test_generates_sprite_sheet(self, sample_video, tmp_path):
        output = str(tmp_path / "sprite.jpg")
        result = generate_preview_sprite(str(sample_video), output)
        assert result is True
        assert (tmp_path / "sprite.jpg").exists()

        with Image.open(output) as img:
            assert img.size == (FRAME_WIDTH * FRAME_COUNT, FRAME_HEIGHT)

    def test_short_video_fallback(self, short_video, tmp_path):
        output = str(tmp_path / "sprite.jpg")
        result = generate_preview_sprite(str(short_video), output)
        assert result is True
        assert (tmp_path / "sprite.jpg").exists()

        with Image.open(output) as img:
            assert img.size == (FRAME_WIDTH * FRAME_COUNT, FRAME_HEIGHT)

    def test_nonexistent_file(self, tmp_path):
        output = str(tmp_path / "sprite.jpg")
        result = generate_preview_sprite("/nonexistent/video.mp4", output)
        assert result is False

    def test_invalid_file(self, tmp_path):
        invalid = tmp_path / "invalid.mp4"
        invalid.write_text("not a video")
        output = str(tmp_path / "sprite.jpg")
        result = generate_preview_sprite(str(invalid), output)
        assert result is False

    def test_creates_parent_dirs(self, sample_video, tmp_path):
        output = str(tmp_path / "a" / "b" / "sprite.jpg")
        result = generate_preview_sprite(str(sample_video), output)
        assert result is True
        assert (tmp_path / "a" / "b" / "sprite.jpg").exists()


class TestPreviewEndpoint:
    def _add_video_file(self, db, drive_dir, sample_video):
        dest = drive_dir / "test_video.mp4"
        shutil.copy2(str(sample_video), str(dest))
        file = File(
            id="prevVid00001",
            filename="test_video.mp4",
            title="Test Video",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="test_video.mp4",
            file_size=dest.stat().st_size,
            file_type="video",
            mime_type="video/mp4",
        )
        db.add(file)
        db.commit()
        return file

    def _add_image_file(self, db, drive_dir):
        img_path = drive_dir / "test_image.jpg"
        img = Image.new("RGB", (100, 100), (255, 0, 0))
        img.save(str(img_path))
        file = File(
            id="prevImg00001",
            filename="test_image.jpg",
            title="Test Image",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="test_image.jpg",
            file_size=img_path.stat().st_size,
            file_type="image",
            mime_type="image/jpeg",
        )
        db.add(file)
        db.commit()
        return file

    def test_preview_video(self, client, sample_video):
        c, db, drive_dir, data_dir = client
        previews_dir = data_dir / "previews"
        previews_dir.mkdir(exist_ok=True)
        self._add_video_file(db, drive_dir, sample_video)

        resp = c.get("/api/files/prevVid00001/preview")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/jpeg"
        assert "max-age=86400" in resp.headers.get("cache-control", "")

    def test_preview_non_video(self, client):
        c, db, drive_dir, data_dir = client
        previews_dir = data_dir / "previews"
        previews_dir.mkdir(exist_ok=True)
        self._add_image_file(db, drive_dir)

        resp = c.get("/api/files/prevImg00001/preview")
        assert resp.status_code == 404

    def test_preview_not_found(self, client):
        c, db, drive_dir, data_dir = client
        resp = c.get("/api/files/nonExist0001/preview")
        assert resp.status_code == 404

    def test_preview_caching(self, client, sample_video):
        c, db, drive_dir, data_dir = client
        previews_dir = data_dir / "previews"
        previews_dir.mkdir(exist_ok=True)
        self._add_video_file(db, drive_dir, sample_video)

        resp1 = c.get("/api/files/prevVid00001/preview")
        assert resp1.status_code == 200

        # Cached file should exist now
        assert (previews_dir / "prevVid00001.jpg").exists()

        resp2 = c.get("/api/files/prevVid00001/preview")
        assert resp2.status_code == 200
        assert resp2.headers["content-type"] == "image/jpeg"
