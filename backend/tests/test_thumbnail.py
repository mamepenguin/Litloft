import pytest

from app.services.thumbnail import generate_thumbnail, get_video_duration


class TestGetVideoDuration:
    def test_valid_video(self, sample_video):
        duration = get_video_duration(str(sample_video))
        assert duration is not None
        assert duration > 9.0

    def test_short_video(self, short_video):
        duration = get_video_duration(str(short_video))
        assert duration is not None
        assert duration < 5.0

    def test_nonexistent(self):
        duration = get_video_duration("/nonexistent/video.mp4")
        assert duration is None


class TestGenerateThumbnail:
    def test_generates_jpeg(self, sample_video, tmp_path):
        output = str(tmp_path / "thumb.jpg")
        result = generate_thumbnail(str(sample_video), output)
        assert result is True
        assert (tmp_path / "thumb.jpg").exists()
        assert (tmp_path / "thumb.jpg").stat().st_size > 0

    def test_short_video_uses_zero(self, short_video, tmp_path):
        output = str(tmp_path / "thumb.jpg")
        result = generate_thumbnail(str(short_video), output)
        assert result is True
        assert (tmp_path / "thumb.jpg").exists()

    def test_nonexistent_video(self, tmp_path):
        output = str(tmp_path / "thumb.jpg")
        result = generate_thumbnail("/nonexistent/video.mp4", output)
        assert result is False

    def test_creates_parent_dirs(self, sample_video, tmp_path):
        output = str(tmp_path / "a" / "b" / "thumb.jpg")
        result = generate_thumbnail(str(sample_video), output)
        assert result is True
        assert (tmp_path / "a" / "b" / "thumb.jpg").exists()
