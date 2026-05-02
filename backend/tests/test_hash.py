import hashlib

import pytest

from app.services.hash import HASH_CHUNK_SIZE, compute_file_hash


def _expected_hash(head: bytes, tail: bytes) -> str:
    return hashlib.sha256(head + tail).hexdigest()


class TestComputeFileHash:
    def test_small_file_overlap(self, tmp_path):
        """For files <= HASH_CHUNK_SIZE the tail range collapses (size > chunk
        is False) so only head is hashed. This still produces a stable value."""
        path = tmp_path / "small.bin"
        content = b"abc" * 100
        path.write_bytes(content)
        result = compute_file_hash(path)
        assert result == _expected_hash(content, b"")

    def test_exactly_chunk_size(self, tmp_path):
        path = tmp_path / "exact.bin"
        content = b"x" * HASH_CHUNK_SIZE
        path.write_bytes(content)
        result = compute_file_hash(path)
        # size == HASH_CHUNK_SIZE: tail branch not taken
        assert result == _expected_hash(content, b"")

    def test_large_file_head_and_tail(self, tmp_path):
        path = tmp_path / "large.bin"
        head_content = b"H" * HASH_CHUNK_SIZE
        middle = b"M" * 1000
        tail_content = b"T" * HASH_CHUNK_SIZE
        path.write_bytes(head_content + middle + tail_content)
        result = compute_file_hash(path)
        assert result == _expected_hash(head_content, tail_content)

    def test_tail_change_detected(self, tmp_path):
        """Old algorithm (first 1MB only) would miss tail-only changes."""
        a = tmp_path / "a.bin"
        b = tmp_path / "b.bin"
        head = b"H" * HASH_CHUNK_SIZE
        middle = b"M" * 1000
        a.write_bytes(head + middle + b"T" * HASH_CHUNK_SIZE)
        b.write_bytes(head + middle + b"U" * HASH_CHUNK_SIZE)
        assert compute_file_hash(a) != compute_file_hash(b)

    def test_head_change_detected(self, tmp_path):
        a = tmp_path / "a.bin"
        b = tmp_path / "b.bin"
        tail = b"T" * HASH_CHUNK_SIZE
        a.write_bytes(b"H" * HASH_CHUNK_SIZE + b"M" * 1000 + tail)
        b.write_bytes(b"X" * HASH_CHUNK_SIZE + b"M" * 1000 + tail)
        assert compute_file_hash(a) != compute_file_hash(b)

    def test_middle_change_not_detected(self, tmp_path):
        """By design: middle differences are not detected. Caller must pair
        the hash with file_size to form a strong identity key."""
        a = tmp_path / "a.bin"
        b = tmp_path / "b.bin"
        head = b"H" * HASH_CHUNK_SIZE
        tail = b"T" * HASH_CHUNK_SIZE
        a.write_bytes(head + b"M" * 1000 + tail)
        b.write_bytes(head + b"N" * 1000 + tail)
        # Same head, same tail, but different size — file_size pairing
        # is what disambiguates these in callers.
        assert compute_file_hash(a) == compute_file_hash(b)
        assert a.stat().st_size == b.stat().st_size  # same here, contrived
        # Real safety net: callers compare (hash, size) and these have
        # the same size only because the test is constructed that way.

    def test_size_changes_when_tail_extended(self, tmp_path):
        """A real-world case: extend file by appending — tail and size both
        change."""
        a = tmp_path / "a.bin"
        b = tmp_path / "b.bin"
        body = b"A" * (HASH_CHUNK_SIZE * 2)
        a.write_bytes(body)
        b.write_bytes(body + b"EXTRA")
        assert compute_file_hash(a) != compute_file_hash(b)
        assert a.stat().st_size != b.stat().st_size

    def test_deterministic(self, tmp_path):
        path = tmp_path / "f.bin"
        path.write_bytes(b"deterministic" * 1000)
        assert compute_file_hash(path) == compute_file_hash(path)

    def test_missing_file_returns_none(self, tmp_path):
        path = tmp_path / "ghost.bin"
        assert compute_file_hash(path) is None

    def test_unreadable_returns_none(self, tmp_path, monkeypatch):
        path = tmp_path / "perm.bin"
        path.write_bytes(b"data")

        def boom(*args, **kwargs):
            raise OSError("permission denied")

        monkeypatch.setattr("builtins.open", boom)
        assert compute_file_hash(path) is None

    def test_empty_file(self, tmp_path):
        path = tmp_path / "empty.bin"
        path.write_bytes(b"")
        result = compute_file_hash(path)
        assert result == _expected_hash(b"", b"")
