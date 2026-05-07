from unittest.mock import patch, MagicMock

import pytest

from app.services.thumbnail import (
    generate_thumbnail,
    get_video_duration,
    has_video_stream,
    _calculate_seek_time,
)


class TestCalculateSeekTime:
    """Test intro-skip seek time calculation (10% of duration, min 2s, max 60s)."""

    def test_short_video_returns_zero(self):
        """Videos < 10s should seek to 0 (no intro skip)."""
        assert _calculate_seek_time(5.0) == 0.0
        assert _calculate_seek_time(9.9) == 0.0

    def test_ten_second_boundary_returns_two(self):
        """At exactly 10s, 10% = 1s but min is 2s."""
        assert _calculate_seek_time(10.0) == 2.0

    def test_normal_video_ten_percent(self):
        """30s video => 10% = 3s (above min, below max)."""
        assert _calculate_seek_time(30.0) == 3.0

    def test_minimum_clamp(self):
        """15s video => 10% = 1.5s, clamped to min 2s."""
        assert _calculate_seek_time(15.0) == 2.0

    def test_maximum_clamp(self):
        """700s video => 10% = 70s, clamped to max 60s."""
        assert _calculate_seek_time(700.0) == 60.0

    def test_none_duration_returns_zero(self):
        """If duration is None, seek to 0."""
        assert _calculate_seek_time(None) == 0.0

    def test_exactly_sixty_seconds(self):
        """600s video => 10% = 60s, exactly at max."""
        assert _calculate_seek_time(600.0) == 60.0


class TestThumbnailFilterCommand:
    """Test that generate_thumbnail uses the thumbnail=300 filter."""

    @patch("app.services.thumbnail.subprocess.run")
    @patch("app.services.thumbnail.get_video_duration", return_value=30.0)
    def test_uses_thumbnail_filter(self, mock_duration, mock_run, tmp_path):
        """Primary method should use thumbnail=300 in the -vf filter."""
        output = str(tmp_path / "thumb.jpg")
        # Simulate success: create output file
        (tmp_path / "thumb.jpg").touch()
        mock_run.return_value = MagicMock(returncode=0)

        generate_thumbnail("/fake/video.mp4", output)

        # First call should be the thumbnail filter approach
        first_call_args = mock_run.call_args_list[0][0][0]
        vf_index = first_call_args.index("-vf")
        vf_value = first_call_args[vf_index + 1]
        assert "thumbnail=300" in vf_value

    @patch("app.services.thumbnail.subprocess.run")
    @patch("app.services.thumbnail.get_video_duration", return_value=30.0)
    def test_seek_time_in_command(self, mock_duration, mock_run, tmp_path):
        """Seek time should be 10% of 30s = 3s."""
        output = str(tmp_path / "thumb.jpg")
        (tmp_path / "thumb.jpg").touch()
        mock_run.return_value = MagicMock(returncode=0)

        generate_thumbnail("/fake/video.mp4", output)

        first_call_args = mock_run.call_args_list[0][0][0]
        ss_index = first_call_args.index("-ss")
        assert first_call_args[ss_index + 1] == "3.0"

    @patch("app.services.thumbnail.subprocess.run")
    @patch("app.services.thumbnail.get_video_duration", return_value=5.0)
    def test_short_video_seek_zero(self, mock_duration, mock_run, tmp_path):
        """Short videos (<10s) should seek to 0."""
        output = str(tmp_path / "thumb.jpg")
        (tmp_path / "thumb.jpg").touch()
        mock_run.return_value = MagicMock(returncode=0)

        generate_thumbnail("/fake/video.mp4", output)

        first_call_args = mock_run.call_args_list[0][0][0]
        ss_index = first_call_args.index("-ss")
        assert first_call_args[ss_index + 1] == "0.0"

    @patch("app.services.thumbnail.subprocess.run")
    @patch("app.services.thumbnail.get_video_duration", return_value=30.0)
    def test_fallback_on_filter_failure(self, mock_duration, mock_run, tmp_path):
        """When thumbnail filter fails, fall back to simple seek method."""
        output = str(tmp_path / "thumb.jpg")

        # First call (thumbnail filter) fails, second (fallback) succeeds
        def side_effect(cmd, **kwargs):
            mock = MagicMock()
            if "thumbnail=300" in cmd[cmd.index("-vf") + 1]:
                mock.returncode = 1
                mock.stderr = "filter error"
            else:
                mock.returncode = 0
                (tmp_path / "thumb.jpg").touch()
            return mock

        mock_run.side_effect = side_effect

        result = generate_thumbnail("/fake/video.mp4", output)

        assert result is True
        assert mock_run.call_count == 2
        # Second call should NOT have thumbnail filter
        second_call_args = mock_run.call_args_list[1][0][0]
        vf_index = second_call_args.index("-vf")
        vf_value = second_call_args[vf_index + 1]
        assert "thumbnail=300" not in vf_value

    @patch("app.services.thumbnail.subprocess.run")
    @patch("app.services.thumbnail.get_video_duration", return_value=30.0)
    def test_fallback_preserves_scale_filter(self, mock_duration, mock_run, tmp_path):
        """Fallback method should still use scale and pad filters."""
        output = str(tmp_path / "thumb.jpg")

        def side_effect(cmd, **kwargs):
            mock = MagicMock()
            if "thumbnail=300" in cmd[cmd.index("-vf") + 1]:
                mock.returncode = 1
                mock.stderr = "error"
            else:
                mock.returncode = 0
                (tmp_path / "thumb.jpg").touch()
            return mock

        mock_run.side_effect = side_effect

        generate_thumbnail("/fake/video.mp4", output)

        second_call_args = mock_run.call_args_list[1][0][0]
        vf_index = second_call_args.index("-vf")
        vf_value = second_call_args[vf_index + 1]
        assert "scale=320:180" in vf_value
        assert "pad=320:180" in vf_value


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


class TestHasVideoStream:
    def test_real_video_fixture_returns_true(self, sample_video):
        """Sample fixture is a real video container with a video stream."""
        assert has_video_stream(str(sample_video)) is True

    def test_audio_only_mp4_returns_false(self, tmp_path):
        """A ``.mp4`` container holding only AAC audio (e.g. iTunes
        ALAC/AAC-LC saved with the wrong extension) must return False
        so the scanner can downgrade it to ``audio/mp4``."""
        import subprocess
        audio_only = tmp_path / "audio_only.mp4"
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-v", "quiet",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                "-c:a", "aac", str(audio_only),
            ],
            check=False,
        )
        assert result.returncode == 0, "ffmpeg fixture generation failed"
        assert has_video_stream(str(audio_only)) is False

    def test_nonexistent_returns_none(self):
        assert has_video_stream("/nonexistent/file.mp4") is None

    @patch("app.services.thumbnail.subprocess.run")
    def test_ffprobe_failure_returns_none(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stderr="probe error")
        assert has_video_stream("/fake/path.mp4") is None


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
