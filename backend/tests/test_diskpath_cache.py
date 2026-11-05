"""SPEC-CORE-042: the read cache never serves a path that no longer exists and stays bounded."""
from __future__ import annotations

import os

import pytest

from tests.nfd_helpers import LEAF, nfc, nfd, require_sensitive_fs


@pytest.fixture()
def root(tmp_path):
    r = tmp_path / "root"
    r.mkdir()
    require_sensitive_fs(r)
    from app.services import diskpath

    diskpath._cache.clear()
    yield r
    diskpath._cache.clear()


def _read(root, rel):
    from app.services.diskpath import resolve_on_disk

    return os.fspath(resolve_on_disk(root, rel, cached=True))


def test_i11_a_cached_spelling_that_was_renamed_is_recomputed(root):
    stored = nfc("がぎ.txt")
    (root / nfd(stored)).write_bytes(b"x")
    assert _read(root, stored) == os.fspath(root / nfd(stored))
    other = nfd("が") + "ぎ.txt"
    assert other != nfd(stored)
    os.rename(root / nfd(stored), root / other)
    assert _read(root, stored) == os.fspath(root / other)


def test_i11_a_cached_entry_that_was_deleted_resolves_to_the_stored_path(root):
    (root / nfd(LEAF)).write_bytes(b"x")
    _read(root, nfc(LEAF))
    (root / nfd(LEAF)).unlink()
    assert _read(root, nfc(LEAF)) == os.fspath(root / nfc(LEAF))


def test_i10_the_cache_holds_at_most_its_bound(root, monkeypatch):
    from app.services import diskpath

    monkeypatch.setattr(diskpath, "_CACHE_MAX", 3)
    for i in range(6):
        (root / nfd(f"が{i}.txt")).write_bytes(b"x")
        _read(root, nfc(f"が{i}.txt"))
    assert len(diskpath._cache) == 3
