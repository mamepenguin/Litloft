from unittest.mock import patch, MagicMock

import pytest
from PIL import Image, ImageDraw

from app.services import thumbnail as thumbnail_service

from app.services.thumbnail import (
    generate_image_thumbnail,
    generate_thumbnail,
    get_media_chapters,
    get_video_duration,
    has_video_stream,
    probe_stream_kinds,
    _calculate_seek_time,
)


class TestGetMediaChapters:
    """Extraction only. The shared rules are ``normalise_chapters``'s."""

    def test_reads_chapters_from_real_mkv(self, chaptered_mkv):
        assert get_media_chapters(str(chaptered_mkv)) == [
            {"start_time": "0.000000", "end_time": "1.000000", "title": "Opening"},
            {"start_time": "1.000000", "end_time": "2.000000", "title": "Closing"},
        ]

    @patch("app.services.thumbnail.subprocess.run")
    def test_lifts_the_title_out_of_tags_without_judging_it(self, mock_run):
        # Where each part lives is ffprobe-shape knowledge and belongs
        # here; whether a blank title earns a row is not, because both
        # producers have to answer that the same way.
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"chapters": ['
            '{"start_time": "0", "end_time": "5", "tags": {"title": "One"}},'
            '{"start_time": "5", "end_time": "8", "tags": {"title": "  "}},'
            '{"start_time": "8", "tags": {}}'
            "]}",
        )

        assert get_media_chapters("/media/example.mkv") == [
            {"start_time": "0", "end_time": "5", "title": "One"},
            {"start_time": "5", "end_time": "8", "title": "  "},
            {"start_time": "8", "end_time": None, "title": None},
        ]
        assert mock_run.call_args.args[0] == [
            "ffprobe",
            "-v",
            "quiet",
            "-show_chapters",
            "-print_format",
            "json",
            "/media/example.mkv",
        ]

    @patch("app.services.thumbnail.subprocess.run")
    def test_failure_returns_none(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stderr="probe error")
        assert get_media_chapters("/media/broken.mkv") is None

    @patch("app.services.thumbnail.subprocess.run")
    def test_timeout_returns_none(self, mock_run):
        import subprocess

        mock_run.side_effect = subprocess.TimeoutExpired("ffprobe", 30)
        assert get_media_chapters("/media/slow.mkv") is None


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


class TestUniformFrameAvoidance:
    def test_noisy_solid_background_with_central_logo_is_rejected(self, tmp_path):
        candidate = tmp_path / "logo.png"
        image = Image.new("RGB", (320, 180))
        image.putdata(
            [
                ((x + y) % 13, (x * 3 + y) % 13, (x + y * 5) % 13)
                for y in range(180)
                for x in range(320)
            ]
        )
        ImageDraw.Draw(image).rectangle((120, 65, 200, 115), fill=(240, 240, 240))
        image.save(candidate)

        ratio = thumbnail_service._dominant_color_ratio(candidate)

        assert ratio is not None
        assert ratio >= thumbnail_service.DOMINANT_COLOR_THRESHOLD

    def test_multicolor_frame_is_accepted(self, tmp_path):
        candidate = tmp_path / "multicolor.png"
        image = Image.new("RGB", (320, 180))
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, 159, 89), fill=(220, 30, 30))
        draw.rectangle((160, 0, 319, 89), fill=(30, 220, 30))
        draw.rectangle((0, 90, 159, 179), fill=(30, 30, 220))
        draw.rectangle((160, 90, 319, 179), fill=(220, 220, 30))
        image.save(candidate)

        ratio = thumbnail_service._dominant_color_ratio(candidate)

        assert ratio is not None
        assert ratio < thumbnail_service.DOMINANT_COLOR_THRESHOLD

    def test_exactly_half_nearly_one_color_is_rejected(self, tmp_path):
        candidate = tmp_path / "half.png"
        image = Image.new("RGB", (320, 180), (230, 30, 30))
        ImageDraw.Draw(image).rectangle((160, 0, 319, 179), fill=(30, 30, 230))
        image.save(candidate)

        assert thumbnail_service._dominant_color_ratio(candidate) == pytest.approx(0.5)

    @patch("app.services.thumbnail._finalize_video_thumbnail", return_value=True)
    @patch(
        "app.services.thumbnail._dominant_color_ratio",
        side_effect=[0.5, 0.3],
    )
    @patch("app.services.thumbnail._run_ffmpeg_thumbnail", return_value=True)
    @patch("app.services.thumbnail.get_video_duration", return_value=30.0)
    def test_retries_later_until_candidate_is_not_uniform(
        self,
        mock_duration,
        mock_run,
        mock_ratio,
        mock_finalize,
        tmp_path,
    ):
        output = str(tmp_path / "thumb.jpg")

        assert generate_thumbnail("/fake/video.mp4", output) is True

        assert mock_run.call_count == 2
        assert [call.args[2] for call in mock_run.call_args_list] == ["3.0", "8.0"]
        for call in mock_run.call_args_list:
            vf_filter = call.args[3]
            assert "thumbnail=300" in vf_filter
            assert "pad=320:180" not in vf_filter
        assert mock_ratio.call_count == 2
        mock_finalize.assert_called_once()

    def test_unknown_duration_still_has_a_bounded_search(self):
        assert thumbnail_service._candidate_seek_times(None, 0.0) == [
            0.0,
            10.0,
            20.0,
            30.0,
            40.0,
            50.0,
        ]

    @patch("app.services.thumbnail._finalize_video_thumbnail", return_value=True)
    @patch(
        "app.services.thumbnail._dominant_color_ratio",
        side_effect=[0.9, 0.6, 0.8],
    )
    @patch("app.services.thumbnail._run_ffmpeg_thumbnail", return_value=True)
    @patch("app.services.thumbnail.get_video_duration", return_value=3.0)
    def test_all_uniform_candidates_keep_the_least_uniform_one(
        self,
        mock_duration,
        mock_run,
        mock_ratio,
        mock_finalize,
        tmp_path,
    ):
        output = str(tmp_path / "thumb.jpg")

        assert generate_thumbnail("/fake/video.mp4", output) is True

        assert mock_run.call_count == 3
        least_uniform_path = mock_ratio.call_args_list[1].args[0]
        assert mock_finalize.call_args.args == (least_uniform_path, output)

    @patch("app.services.thumbnail._finalize_video_thumbnail", return_value=True)
    @patch("app.services.thumbnail._dominant_color_ratio", return_value=None)
    @patch("app.services.thumbnail._run_ffmpeg_thumbnail", return_value=True)
    @patch("app.services.thumbnail.get_video_duration", return_value=30.0)
    def test_analysis_failure_accepts_the_first_candidate(
        self,
        mock_duration,
        mock_run,
        mock_ratio,
        mock_finalize,
        tmp_path,
    ):
        output = str(tmp_path / "thumb.jpg")

        assert generate_thumbnail("/fake/video.mp4", output) is True

        assert mock_run.call_count == 1
        mock_finalize.assert_called_once()

    def test_final_padding_does_not_affect_candidate_analysis(self, tmp_path):
        candidate = tmp_path / "portrait.png"
        output = tmp_path / "thumb.jpg"
        image = Image.new("RGB", (80, 180), (220, 30, 30))
        ImageDraw.Draw(image).rectangle((0, 90, 79, 179), fill=(30, 30, 220))
        image.save(candidate)

        ratio = thumbnail_service._dominant_color_ratio(candidate)
        assert ratio == pytest.approx(0.5)
        assert thumbnail_service._finalize_video_thumbnail(candidate, str(output))

        with Image.open(output) as thumbnail:
            assert thumbnail.size == (320, 180)


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


class TestNonUtf8SubprocessOutput:
    """Regression: ffmpeg/ffprobe can echo raw bytes straight from a
    file's legacy-encoded (e.g. Shift_JIS) chapter/title metadata, which
    aren't valid UTF-8. ``subprocess.run(text=True)`` decodes internally
    with ``errors="strict"`` by default, so a file like that used to raise
    an uncaught ``UnicodeDecodeError`` from inside ``subprocess.run``
    itself — none of these functions' ``except`` clauses catch it before
    it reaches the caller. Because the startup scan (``scan_all_drives``)
    runs drives sequentially with no per-drive isolation, this crashed
    the whole background scan task the moment the scanner reached such a
    file, silently stranding every drive scheduled after it — and since
    the file's content never changes, every restart hit the exact same
    file and crashed the exact same way. ``errors="replace"`` prevents
    the raise instead of merely surviving it.
    """

    @patch("app.services.thumbnail.subprocess.run")
    def test_get_video_duration_passes_errors_replace(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"format": {"duration": "1.0"}}'
        )
        get_video_duration("/media/x.mp4")
        assert mock_run.call_args.kwargs["errors"] == "replace"

    @patch("app.services.thumbnail.subprocess.run")
    def test_get_media_chapters_passes_errors_replace(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout='{"chapters": []}')
        get_media_chapters("/media/x.mkv")
        assert mock_run.call_args.kwargs["errors"] == "replace"

    @patch("app.services.thumbnail.subprocess.run")
    def test_probe_stream_kinds_passes_errors_replace(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"format": {}, "streams": []}'
        )
        probe_stream_kinds("/media/x.mp4")
        assert mock_run.call_args.kwargs["errors"] == "replace"

    @patch("app.services.thumbnail.subprocess.run")
    @patch("app.services.thumbnail.get_video_duration", return_value=30.0)
    def test_run_ffmpeg_thumbnail_passes_errors_replace(
        self, mock_duration, mock_run, tmp_path
    ):
        output = str(tmp_path / "thumb.jpg")
        (tmp_path / "thumb.jpg").touch()
        mock_run.return_value = MagicMock(returncode=0)

        generate_thumbnail("/fake/video.mp4", output)

        assert mock_run.call_args_list[0].kwargs["errors"] == "replace"

    @patch("app.services.thumbnail.subprocess.run")
    def test_generate_image_thumbnail_passes_errors_replace(self, mock_run, tmp_path):
        output = str(tmp_path / "thumb.jpg")
        (tmp_path / "thumb.jpg").touch()
        mock_run.return_value = MagicMock(returncode=0)

        generate_image_thumbnail("/fake/image.jpg", output)

        assert mock_run.call_args.kwargs["errors"] == "replace"
