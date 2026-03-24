import shutil
from pathlib import Path

import pytest

from app.services.scanner import _filename_to_title, _get_folder_path


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
