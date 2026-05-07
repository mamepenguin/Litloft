from pathlib import Path
from unittest.mock import patch

from app.services.filetype import (
    classify,
    is_hidden,
    refine_classification_with_probe,
)


class TestClassify:
    def test_video_mp4(self):
        assert classify("video.mp4") == ("video", "video/mp4")

    def test_video_mkv(self):
        file_type, mime_type = classify("movie.mkv")
        assert file_type == "video"

    def test_video_avi(self):
        file_type, mime_type = classify("clip.avi")
        assert file_type == "video"

    def test_image_jpg(self):
        assert classify("photo.jpg") == ("image", "image/jpeg")

    def test_image_png(self):
        assert classify("icon.png") == ("image", "image/png")

    def test_audio_mp3(self):
        file_type, mime_type = classify("song.mp3")
        assert file_type == "audio"

    def test_audio_flac(self):
        file_type, mime_type = classify("track.flac")
        assert file_type == "audio"

    def test_audio_m4a_uses_iana_mp4_mime(self):
        """Phase 2F: Linux Docker's mimetypes DB lacks .m4a; the
        extension fallback must register it as the IANA-standard
        ``audio/mp4`` so the intelligence transcriber recognises it
        (hako A-gF1mK3kDjRjS_dfuq1B + BDffxf4IyuwzRiZDnZuBZ)."""
        file_type, mime_type = classify("podcast.m4a")
        assert file_type == "audio"
        assert mime_type == "audio/mp4"

    def test_audio_opus_uses_iana_mime(self):
        """Phase 2F: same fix for Opus, which Linux Docker also
        misses in its mimetypes DB."""
        file_type, mime_type = classify("call.opus")
        assert file_type == "audio"
        assert mime_type == "audio/opus"

    def test_document_pdf(self):
        assert classify("doc.pdf") == ("document", "application/pdf")

    def test_document_txt(self):
        file_type, mime_type = classify("readme.txt")
        assert file_type == "document"

    def test_other_unknown(self):
        file_type, mime_type = classify("data.xyz123")
        assert file_type == "other"

    def test_document_docx(self):
        file_type, mime_type = classify("report.docx")
        assert file_type == "document"

    def test_loft_classified_as_video(self):
        """``.loft`` (media_import wrapper for non-downloadable media)
        is treated as ``video`` for file_type filtering — every
        currently-registered provider (youtube / vimeo / soundcloud)
        wraps a video, and search-time queries like "料理に関する動画"
        would otherwise exclude .loft hits via file_type=video filter.
        """
        assert classify("recipe.loft") == (
            "video", "application/vnd.litloft.loft+json"
        )


class TestRefineClassificationWithProbe:
    """Audio-only ``.mp4`` / ``.mov`` containers (e.g. iTunes ALAC/AAC-LC
    saved with a ``.mp4`` extension, hako 4t5FWrH4IpLUlGDXxh7cO) get
    downgraded to ``audio/mp4`` so the UI shows them as audio and cloud
    STT providers don't reject them as malformed video."""

    _MP4_FORMAT = "mov,mp4,m4a,3gp,3g2,mj2"

    def test_mp4_with_video_stream_unchanged(self):
        with patch(
            "app.services.thumbnail.probe_stream_kinds",
            return_value={"video": True, "audio": True, "format": self._MP4_FORMAT},
        ):
            result = refine_classification_with_probe(
                Path("/tmp/movie.mp4"), "video", "video/mp4"
            )
        assert result == ("video", "video/mp4")

    def test_mp4_audio_only_downgraded(self):
        with patch(
            "app.services.thumbnail.probe_stream_kinds",
            return_value={"video": False, "audio": True, "format": self._MP4_FORMAT},
        ):
            result = refine_classification_with_probe(
                Path("/tmp/podcast.mp4"), "video", "video/mp4"
            )
        assert result == ("audio", "audio/mp4")

    def test_mov_audio_only_downgraded(self):
        with patch(
            "app.services.thumbnail.probe_stream_kinds",
            return_value={"video": False, "audio": True, "format": self._MP4_FORMAT},
        ):
            result = refine_classification_with_probe(
                Path("/tmp/voice.mov"), "video", "video/quicktime"
            )
        assert result == ("audio", "audio/mp4")

    def test_probe_failure_keeps_original(self):
        """ffprobe failures are inconclusive — never downgrade on None."""
        with patch(
            "app.services.thumbnail.probe_stream_kinds", return_value=None
        ):
            result = refine_classification_with_probe(
                Path("/tmp/broken.mp4"), "video", "video/mp4"
            )
        assert result == ("video", "video/mp4")

    def test_zero_streams_keeps_original(self):
        """Garbage binary written with a ``.mp4`` extension may parse
        without errors but report zero streams. Keep original
        classification rather than incorrectly downgrading."""
        with patch(
            "app.services.thumbnail.probe_stream_kinds",
            return_value={"video": False, "audio": False, "format": self._MP4_FORMAT},
        ):
            result = refine_classification_with_probe(
                Path("/tmp/garbage.mp4"), "video", "video/mp4"
            )
        assert result == ("video", "video/mp4")

    def test_unrecognized_format_keeps_original(self):
        """Random bytes with a ``.mp4`` extension may yield spurious
        audio-stream hits in ffprobe. Without a recognized MP4-family
        ``format_name`` we refuse to downgrade."""
        with patch(
            "app.services.thumbnail.probe_stream_kinds",
            return_value={"video": False, "audio": True, "format": "data"},
        ):
            result = refine_classification_with_probe(
                Path("/tmp/junk.mp4"), "video", "video/mp4"
            )
        assert result == ("video", "video/mp4")

    def test_non_candidate_mime_skipped(self):
        """Other mimes (e.g. webm, mkv, real audio) bypass the sniff."""
        with patch(
            "app.services.thumbnail.probe_stream_kinds"
        ) as mock_probe:
            result = refine_classification_with_probe(
                Path("/tmp/song.mp3"), "audio", "audio/mpeg"
            )
        assert result == ("audio", "audio/mpeg")
        mock_probe.assert_not_called()


class TestIsHidden:
    def test_hidden_file(self):
        base = Path("/drive")
        assert is_hidden(Path("/drive/.hidden"), base) is True

    def test_hidden_directory(self):
        base = Path("/drive")
        assert is_hidden(Path("/drive/.thumbs/file.jpg"), base) is True

    def test_normal_file(self):
        base = Path("/drive")
        assert is_hidden(Path("/drive/video.mp4"), base) is False

    def test_nested_normal(self):
        base = Path("/drive")
        assert is_hidden(Path("/drive/folder/video.mp4"), base) is False

    def test_nested_hidden(self):
        base = Path("/drive")
        assert is_hidden(Path("/drive/folder/.DS_Store"), base) is True
