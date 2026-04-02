import pytest

from app.services.thumbnail import generate_image_thumbnail


class TestHeicThumbnail:
    def _create_heic_fixture(self, tmp_path):
        """Create a small HEIC file for testing."""
        try:
            import pillow_heif
            from PIL import Image

            pillow_heif.register_heif_opener()
        except ImportError:
            pytest.skip("pillow-heif not installed")

        source = tmp_path / "test.heic"
        img = Image.new("RGB", (640, 480), color=(0, 128, 255))
        img.save(str(source), format="HEIF", quality=80)
        return source

    def test_generates_thumbnail_for_heic(self, tmp_path):
        source = self._create_heic_fixture(tmp_path)
        output = str(tmp_path / "thumb.jpg")
        result = generate_image_thumbnail(str(source), output)
        assert result is True
        assert (tmp_path / "thumb.jpg").exists()
        assert (tmp_path / "thumb.jpg").stat().st_size > 0

    def test_thumbnail_dimensions(self, tmp_path):
        source = self._create_heic_fixture(tmp_path)
        output = str(tmp_path / "thumb.jpg")
        generate_image_thumbnail(str(source), output)

        from PIL import Image

        with Image.open(output) as img:
            assert img.size == (320, 180)

    def test_creates_parent_dirs(self, tmp_path):
        source = self._create_heic_fixture(tmp_path)
        output = str(tmp_path / "a" / "b" / "thumb.jpg")
        result = generate_image_thumbnail(str(source), output)
        assert result is True
        assert (tmp_path / "a" / "b" / "thumb.jpg").exists()

    def test_nonexistent_heic(self, tmp_path):
        output = str(tmp_path / "thumb.jpg")
        result = generate_image_thumbnail("/nonexistent/photo.heic", output)
        assert result is False

    def test_non_heic_not_routed_to_pillow(self, tmp_path):
        """Ensure non-HEIC images still use ffmpeg path (returns False for invalid file)."""
        bad_file = tmp_path / "test.jpg"
        bad_file.write_bytes(b"not a real jpeg")
        output = str(tmp_path / "thumb.jpg")
        result = generate_image_thumbnail(str(bad_file), output)
        assert result is False
