import json
from pathlib import Path

import pytest

from app.services.subtitle import (
    convert_srt_to_vtt,
    detect_subtitles,
    is_subtitle_file,
)
from app.services.filetype import classify


class TestIsSubtitleFile:
    def test_srt(self):
        assert is_subtitle_file("movie.srt") is True

    def test_vtt(self):
        assert is_subtitle_file("movie.vtt") is True

    def test_srt_uppercase(self):
        assert is_subtitle_file("movie.SRT") is True

    def test_mp4_not_subtitle(self):
        assert is_subtitle_file("movie.mp4") is False

    def test_txt_not_subtitle(self):
        assert is_subtitle_file("notes.txt") is False


class TestClassifySubtitle:
    def test_srt_classified_as_subtitle(self):
        file_type, mime_type = classify("movie.srt")
        assert file_type == "subtitle"
        assert mime_type == "application/x-subrip"

    def test_vtt_classified_as_subtitle(self):
        file_type, mime_type = classify("movie.vtt")
        assert file_type == "subtitle"
        assert mime_type == "text/vtt"


class TestDetectSubtitles:
    def test_no_subtitles(self, tmp_path):
        video = tmp_path / "movie.mp4"
        video.write_bytes(b"fake video")
        result = detect_subtitles("movie.mp4", tmp_path)
        assert result == []

    def test_single_srt(self, tmp_path):
        video = tmp_path / "movie.mp4"
        video.write_bytes(b"fake video")
        sub = tmp_path / "movie.srt"
        sub.write_text("1\n00:00:01,000 --> 00:00:02,000\nHello\n")

        result = detect_subtitles("movie.mp4", tmp_path)
        assert len(result) == 1
        assert result[0]["path"] == "movie.srt"
        assert result[0]["language"] == ""
        assert result[0]["format"] == "srt"

    def test_single_vtt(self, tmp_path):
        video = tmp_path / "movie.mp4"
        video.write_bytes(b"fake video")
        sub = tmp_path / "movie.vtt"
        sub.write_text("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n")

        result = detect_subtitles("movie.mp4", tmp_path)
        assert len(result) == 1
        assert result[0]["format"] == "vtt"

    def test_language_tagged(self, tmp_path):
        video = tmp_path / "movie.mp4"
        video.write_bytes(b"fake video")
        (tmp_path / "movie.en.srt").write_text("1\n00:00:01,000 --> 00:00:02,000\nHello\n")
        (tmp_path / "movie.ja.srt").write_text("1\n00:00:01,000 --> 00:00:02,000\nこんにちは\n")

        result = detect_subtitles("movie.mp4", tmp_path)
        assert len(result) == 2
        langs = {s["language"] for s in result}
        assert langs == {"en", "ja"}

    def test_language_label(self, tmp_path):
        video = tmp_path / "movie.mp4"
        video.write_bytes(b"fake video")
        (tmp_path / "movie.en.srt").write_text("sub")

        result = detect_subtitles("movie.mp4", tmp_path)
        assert result[0]["label"] == "English"

    def test_default_subtitle_first(self, tmp_path):
        video = tmp_path / "movie.mp4"
        video.write_bytes(b"fake video")
        (tmp_path / "movie.srt").write_text("default")
        (tmp_path / "movie.en.srt").write_text("english")

        result = detect_subtitles("movie.mp4", tmp_path)
        assert len(result) == 2
        assert result[0]["language"] == ""  # default first

    def test_subfolder(self, tmp_path):
        sub_dir = tmp_path / "season1"
        sub_dir.mkdir()
        video = sub_dir / "ep01.mp4"
        video.write_bytes(b"fake video")
        (sub_dir / "ep01.ja.vtt").write_text("WEBVTT\n\ntest\n")

        result = detect_subtitles("season1/ep01.mp4", tmp_path)
        assert len(result) == 1
        assert result[0]["path"] == "season1/ep01.ja.vtt"
        assert result[0]["language"] == "ja"

    def test_unrelated_files_ignored(self, tmp_path):
        video = tmp_path / "movie.mp4"
        video.write_bytes(b"fake video")
        (tmp_path / "other.srt").write_text("not related")
        (tmp_path / "movie.txt").write_text("not a subtitle")

        result = detect_subtitles("movie.mp4", tmp_path)
        assert result == []

    def test_nonexistent_video(self, tmp_path):
        result = detect_subtitles("nonexistent.mp4", tmp_path)
        assert result == []

    def test_dots_in_filename(self, tmp_path):
        """File stem containing dots (e.g. 'Ver.3.0.2') must still match."""
        video = tmp_path / "title Ver.3.0.2 extra.hvlink"
        video.write_text("{}")
        sub = tmp_path / "title Ver.3.0.2 extra.vtt"
        sub.write_text("WEBVTT\n")

        result = detect_subtitles("title Ver.3.0.2 extra.hvlink", tmp_path)
        assert len(result) == 1
        assert result[0]["path"] == "title Ver.3.0.2 extra.vtt"
        assert result[0]["language"] == ""

    def test_cjk_nfc_nfd_match(self, tmp_path):
        """DB NFC stem must match an FS entry returned in NFD form.

        Simulates the APFS/Docker scenario: scanner stored NFC in DB but
        iterdir() yields NFD. Only the subtitle side is written NFD here
        because the caller already normalizes the video side before
        calling (via `drive_path / video_file_path`).
        """
        import unicodedata

        nfc_stem = "動画が濁点"
        # Video itself must exist at the NFC path, because detect_subtitles
        # does a .exists() check on the caller-supplied NFC path.
        (tmp_path / f"{nfc_stem}.mp4").write_bytes(b"fake video")
        # Subtitle written in NFD: what pathlib returns from iterdir()
        # on APFS-style filesystems.
        nfd_sub = unicodedata.normalize("NFD", f"{nfc_stem}.vtt")
        assert nfd_sub != f"{nfc_stem}.vtt"  # sanity: forms differ
        (tmp_path / nfd_sub).write_text("WEBVTT\n")

        result = detect_subtitles(f"{nfc_stem}.mp4", tmp_path)
        assert len(result) == 1
        assert result[0]["language"] == ""


class TestConvertSrtToVtt:
    def test_basic_conversion(self):
        srt = "1\n00:00:01,000 --> 00:00:02,500\nHello World\n\n2\n00:00:03,000 --> 00:00:04,000\nGoodbye\n"
        vtt = convert_srt_to_vtt(srt)
        assert vtt.startswith("WEBVTT\n")
        assert "00:00:01.000 --> 00:00:02.500" in vtt
        assert "00:00:03.000 --> 00:00:04.000" in vtt
        assert "Hello World" in vtt
        assert "Goodbye" in vtt

    def test_comma_to_dot(self):
        srt = "1\n00:01:23,456 --> 00:02:34,567\nText\n"
        vtt = convert_srt_to_vtt(srt)
        assert "00:01:23.456 --> 00:02:34.567" in vtt
        assert "," not in vtt.split("\n")[2]  # timestamp line

    def test_crlf_handling(self):
        srt = "1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n"
        vtt = convert_srt_to_vtt(srt)
        assert "WEBVTT" in vtt
        assert "Hello" in vtt

    def test_empty_input(self):
        vtt = convert_srt_to_vtt("")
        assert vtt.startswith("WEBVTT")


class TestSubtitleAPI:
    def test_get_file_with_subtitles(self, client):
        c, db, drive_dir, _ = client
        from app.models import File

        video = drive_dir / "movie.mp4"
        video.write_bytes(b"fake video")
        (drive_dir / "movie.en.srt").write_text("1\n00:00:01,000 --> 00:00:02,000\nHello\n")

        f = File(
            filename="movie.mp4",
            title="Movie",
            drive="test-drive",
            folder_path="",
            file_path="movie.mp4",
            file_size=10,
            file_type="video",
            mime_type="video/mp4",
        )
        db.add(f)
        db.commit()
        db.refresh(f)

        resp = c.get(f"/api/files/{f.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["subtitles"]) == 1
        assert data["subtitles"][0]["language"] == "en"
        assert data["subtitles"][0]["format"] == "srt"
        assert data["subtitles"][0]["label"] == "English"
        assert data["subtitles"][0]["index"] == 0

    def test_get_file_no_subtitles(self, client):
        c, db, drive_dir, _ = client
        from app.models import File

        video = drive_dir / "movie.mp4"
        video.write_bytes(b"fake video")

        f = File(
            filename="movie.mp4",
            title="Movie",
            drive="test-drive",
            folder_path="",
            file_path="movie.mp4",
            file_size=10,
            file_type="video",
            mime_type="video/mp4",
        )
        db.add(f)
        db.commit()
        db.refresh(f)

        resp = c.get(f"/api/files/{f.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["subtitles"] == []

    def test_get_subtitle_stream_srt_converted_to_vtt(self, client):
        c, db, drive_dir, _ = client
        from app.models import File

        video = drive_dir / "movie.mp4"
        video.write_bytes(b"fake video")
        (drive_dir / "movie.srt").write_text(
            "1\n00:00:01,000 --> 00:00:02,000\nHello\n",
            encoding="utf-8",
        )

        f = File(
            filename="movie.mp4",
            title="Movie",
            drive="test-drive",
            folder_path="",
            file_path="movie.mp4",
            file_size=10,
            file_type="video",
            mime_type="video/mp4",
        )
        db.add(f)
        db.commit()
        db.refresh(f)

        resp = c.get(f"/api/files/{f.id}/subtitles/0")
        assert resp.status_code == 200
        assert "text/vtt" in resp.headers["content-type"]
        assert resp.text.startswith("WEBVTT")
        assert "00:00:01.000 --> 00:00:02.000" in resp.text
        assert "Hello" in resp.text

    def test_get_subtitle_stream_vtt_passthrough(self, client):
        c, db, drive_dir, _ = client
        from app.models import File

        video = drive_dir / "movie.mp4"
        video.write_bytes(b"fake video")
        vtt_content = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n"
        (drive_dir / "movie.vtt").write_text(vtt_content, encoding="utf-8")

        f = File(
            filename="movie.mp4",
            title="Movie",
            drive="test-drive",
            folder_path="",
            file_path="movie.mp4",
            file_size=10,
            file_type="video",
            mime_type="video/mp4",
        )
        db.add(f)
        db.commit()
        db.refresh(f)

        resp = c.get(f"/api/files/{f.id}/subtitles/0")
        assert resp.status_code == 200
        assert resp.text == vtt_content

    def test_get_subtitle_invalid_index(self, client):
        c, db, drive_dir, _ = client
        from app.models import File

        video = drive_dir / "movie.mp4"
        video.write_bytes(b"fake video")

        f = File(
            filename="movie.mp4",
            title="Movie",
            drive="test-drive",
            folder_path="",
            file_path="movie.mp4",
            file_size=10,
            file_type="video",
            mime_type="video/mp4",
        )
        db.add(f)
        db.commit()
        db.refresh(f)

        resp = c.get(f"/api/files/{f.id}/subtitles/0")
        assert resp.status_code == 404

    def test_get_subtitle_non_video(self, client):
        c, db, drive_dir, _ = client
        from app.models import File

        img = drive_dir / "photo.jpg"
        img.write_bytes(b"fake image")

        f = File(
            filename="photo.jpg",
            title="Photo",
            drive="test-drive",
            folder_path="",
            file_path="photo.jpg",
            file_size=10,
            file_type="image",
            mime_type="image/jpeg",
        )
        db.add(f)
        db.commit()
        db.refresh(f)

        resp = c.get(f"/api/files/{f.id}/subtitles/0")
        assert resp.status_code == 404
