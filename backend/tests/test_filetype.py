from pathlib import Path

from app.services.filetype import classify, is_hidden


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
