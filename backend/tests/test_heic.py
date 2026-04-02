import hashlib
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.heic import (
    HEIC_MIME_TYPES,
    _cache_path_for,
    cleanup_heic_cache,
    convert_heic_to_jpeg,
    is_heic_file,
    is_heic_mime,
)


class TestIsHeicFile:
    def test_heic_extension(self):
        assert is_heic_file("photo.heic") is True

    def test_heif_extension(self):
        assert is_heic_file("photo.heif") is True

    def test_heic_uppercase(self):
        assert is_heic_file("photo.HEIC") is True

    def test_non_heic(self):
        assert is_heic_file("photo.jpg") is False

    def test_no_extension(self):
        assert is_heic_file("photo") is False


class TestIsHeicMime:
    def test_heic_mime(self):
        assert is_heic_mime("image/heic") is True

    def test_heif_mime(self):
        assert is_heic_mime("image/heif") is True

    def test_heic_sequence(self):
        assert is_heic_mime("image/heic-sequence") is True

    def test_heif_sequence(self):
        assert is_heic_mime("image/heif-sequence") is True

    def test_jpeg_mime(self):
        assert is_heic_mime("image/jpeg") is False

    def test_none(self):
        assert is_heic_mime(None) is False


class TestCachePathFor:
    def test_deterministic(self):
        path1 = _cache_path_for("/some/file.heic", Path("/cache"))
        path2 = _cache_path_for("/some/file.heic", Path("/cache"))
        assert path1 == path2

    def test_different_paths_different_hashes(self):
        path1 = _cache_path_for("/a/file.heic", Path("/cache"))
        path2 = _cache_path_for("/b/file.heic", Path("/cache"))
        assert path1 != path2

    def test_uses_sha256_prefix(self):
        source = "/some/file.heic"
        expected_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
        result = _cache_path_for(source, Path("/cache"))
        assert result == Path(f"/cache/{expected_hash}.jpg")


class TestConvertHeicToJpeg:
    def test_returns_cached_if_exists(self, tmp_path):
        cache_dir = tmp_path / "converted"
        source = "/some/photo.heic"
        cached = _cache_path_for(source, cache_dir)
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(b"\xff\xd8\xff\xe0fake-jpeg")

        result = convert_heic_to_jpeg(source, cache_dir)
        assert result == cached

    def test_converts_heic_to_jpeg(self, tmp_path):
        """Test conversion using a real Pillow-generated HEIC file."""
        try:
            import pillow_heif
            from PIL import Image
        except ImportError:
            pytest.skip("pillow-heif not installed")

        pillow_heif.register_heif_opener()

        # Create a small test image and save as HEIC
        source_path = tmp_path / "test.heic"
        img = Image.new("RGB", (100, 100), color=(255, 0, 0))
        img.save(str(source_path), format="HEIF", quality=80)

        cache_dir = tmp_path / "converted"
        result = convert_heic_to_jpeg(str(source_path), cache_dir)

        assert result is not None
        assert result.exists()
        assert result.suffix == ".jpg"
        assert result.stat().st_size > 0

    def test_returns_none_on_nonexistent_file(self, tmp_path):
        cache_dir = tmp_path / "converted"
        result = convert_heic_to_jpeg("/nonexistent/photo.heic", cache_dir)
        assert result is None

    def test_cleans_up_partial_cache_on_failure(self, tmp_path):
        cache_dir = tmp_path / "converted"
        cache_dir.mkdir(parents=True, exist_ok=True)

        # Create a file that is not a valid HEIC
        bad_file = tmp_path / "bad.heic"
        bad_file.write_bytes(b"not a heic file")

        result = convert_heic_to_jpeg(str(bad_file), cache_dir)
        assert result is None

        # Ensure no partial cache file remains
        cached = _cache_path_for(str(bad_file), cache_dir)
        assert not cached.exists()


class TestCleanupHeicCache:
    def test_removes_existing_cache(self, tmp_path):
        cache_dir = tmp_path / "converted"
        cache_dir.mkdir()
        source = "/some/photo.heic"
        cached = _cache_path_for(source, cache_dir)
        cached.write_bytes(b"fake-jpeg")

        cleanup_heic_cache(source, cache_dir)
        assert not cached.exists()

    def test_noop_if_no_cache(self, tmp_path):
        cache_dir = tmp_path / "converted"
        cache_dir.mkdir()
        cleanup_heic_cache("/no/such/file.heic", cache_dir)
        # Should not raise

    def test_noop_if_dir_missing(self, tmp_path):
        cache_dir = tmp_path / "nonexistent"
        cleanup_heic_cache("/some/file.heic", cache_dir)
        # Should not raise


class TestHeicMimeTypes:
    def test_contains_expected_types(self):
        assert "image/heic" in HEIC_MIME_TYPES
        assert "image/heif" in HEIC_MIME_TYPES
        assert "image/heic-sequence" in HEIC_MIME_TYPES
        assert "image/heif-sequence" in HEIC_MIME_TYPES

    def test_does_not_contain_jpeg(self):
        assert "image/jpeg" not in HEIC_MIME_TYPES
