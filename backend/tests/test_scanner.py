import json
import shutil
import subprocess
from pathlib import Path

import pytest

import app.config as config
from app.models import File
from app.services.scanner import (
    _filename_to_title,
    _get_folder_path,
    register_single_file,
)


class TestFilenameToTitle:
    def test_underscores(self):
        assert _filename_to_title("my_vacation_2024.mp4") == "My Vacation 2024"

    def test_hyphens(self):
        assert _filename_to_title("trip-to-tokyo.mp4") == "Trip To Tokyo"

    def test_mixed(self):
        assert _filename_to_title("summer_trip-2024.mp4") == "Summer Trip 2024"

    def test_no_separators(self):
        assert _filename_to_title("video.mp4") == "Video"

    def test_already_titled(self):
        assert _filename_to_title("My Video.mp4") == "My Video"


class TestGetFolderPath:
    def test_subfolder(self, tmp_path):
        base = tmp_path / "drive"
        base.mkdir()
        file_path = base / "旅行" / "video.mp4"
        assert _get_folder_path(file_path, base) == "旅行"

    def test_nested_subfolder(self, tmp_path):
        base = tmp_path / "drive"
        base.mkdir()
        file_path = base / "旅行" / "2024" / "summer.mp4"
        assert _get_folder_path(file_path, base) == "旅行/2024"

    def test_deeply_nested(self, tmp_path):
        base = tmp_path / "drive"
        base.mkdir()
        file_path = base / "a" / "b" / "c" / "video.mp4"
        assert _get_folder_path(file_path, base) == "a/b/c"

    def test_root_file(self, tmp_path):
        base = tmp_path / "drive"
        base.mkdir()
        file_path = base / "video.mp4"
        assert _get_folder_path(file_path, base) == ""


class TestAudioOnlyMp4Registration:
    """A ``.mp4`` file that contains only an audio stream must register
    as ``audio/mp4`` with ``file_type=audio`` so the UI shows the right
    icon and the cloud STT pipeline doesn't try to send it as video
    (hako 4t5FWrH4IpLUlGDXxh7cO)."""

    def test_audio_only_mp4_registers_as_audio(self, tmp_path, db_session, monkeypatch):
        drive_dir = tmp_path / "drive"
        drive_dir.mkdir()
        drives_json = tmp_path / "drives.json"
        drives_json.write_text(json.dumps([
            {"name": "test-drive", "path": str(drive_dir)}
        ]))
        monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
        monkeypatch.setattr(config, "_drives_cache", None)
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        monkeypatch.setattr(config, "DATA_DIR", data_dir)
        monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")

        audio_only = drive_dir / "podcast.mp4"
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-v", "quiet",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                "-c:a", "aac", str(audio_only),
            ],
            check=False,
        )
        assert result.returncode == 0, "ffmpeg fixture generation failed"

        file_id = register_single_file(db_session, "test-drive", audio_only)
        db_session.commit()

        record = db_session.query(File).filter(File.id == file_id).first()
        assert record is not None
        assert record.file_type == "audio"
        assert record.mime_type == "audio/mp4"
