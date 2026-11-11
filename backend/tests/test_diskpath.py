"""SPEC-CORE-042: the resolver turns a stored NFC path into the path on disk."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from tests.nfd_helpers import FOLDER, LEAF, nfc, nfd, require_sensitive_fs, tree



def _mod():
    from app.services import diskpath as m

    return m


@pytest.fixture()
def root(tmp_path):
    r = tmp_path / "root"
    r.mkdir()
    require_sensitive_fs(r)
    return r


def _touch(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x")
    return path


def _resolve(root, rel):
    return os.fspath(_mod().resolve_on_disk(root, rel))


class TestResolveOnDisk:
    def test_i3_exact_path_is_returned_unchanged(self, root):
        _touch(root / nfc(FOLDER) / nfc(LEAF))
        assert _resolve(root, f"{nfc(FOLDER)}/{nfc(LEAF)}") == os.fspath(
            root / nfc(FOLDER) / nfc(LEAF))

    def test_i2_nfd_leaf_resolves_to_the_disk_name(self, root):
        _touch(root / nfc(FOLDER) / nfd(LEAF))
        assert _resolve(root, f"{nfc(FOLDER)}/{nfc(LEAF)}") == os.fspath(
            root / nfc(FOLDER) / nfd(LEAF))

    def test_i2_nfd_ancestor_resolves_to_the_disk_name(self, root):
        _touch(root / nfd(FOLDER) / nfc(LEAF))
        assert _resolve(root, f"{nfc(FOLDER)}/{nfc(LEAF)}") == os.fspath(
            root / nfd(FOLDER) / nfc(LEAF))

    def test_i2_nfd_ancestor_and_leaf_resolve_together(self, root):
        _touch(root / nfd(FOLDER) / nfd(LEAF))
        assert _resolve(root, f"{nfc(FOLDER)}/{nfc(LEAF)}") == os.fspath(
            root / nfd(FOLDER) / nfd(LEAF))

    def test_i3_exact_spelling_wins_when_both_spellings_exist(self, root):
        _touch(root / nfc(LEAF))
        _touch(root / nfd(LEAF))
        assert _resolve(root, nfc(LEAF)) == os.fspath(root / nfc(LEAF))
        assert _resolve(root, nfd(LEAF)) == os.fspath(root / nfd(LEAF))

    def test_i3_exact_folder_wins_over_nfd_twin_for_deeper_path(self, root):
        _touch(root / nfd(FOLDER) / "other.txt")
        _touch(root / nfc(FOLDER) / "a.txt")
        assert _resolve(root, f"{nfc(FOLDER)}/a.txt") == os.fspath(
            root / nfc(FOLDER) / "a.txt")

    def test_i4_nothing_matches_returns_the_stored_path(self, root):
        _touch(root / "unrelated.txt")
        assert _resolve(root, f"{nfc(FOLDER)}/{nfc(LEAF)}") == os.fspath(
            root / nfc(FOLDER) / nfc(LEAF))

    def test_i4_real_ancestors_with_the_stored_leaf(self, root):
        (root / nfd(FOLDER)).mkdir()
        assert _resolve(root, f"{nfc(FOLDER)}/{nfc(LEAF)}") == os.fspath(
            root / nfd(FOLDER) / nfc(LEAF))

    def test_i4_components_after_the_first_miss_are_kept_as_given(self, root):
        (root / nfd(FOLDER)).mkdir()
        rel = f"{nfc(FOLDER)}/{nfc('ぎ')}/{nfc(LEAF)}"
        assert _resolve(root, rel) == os.fspath(
            root / nfd(FOLDER) / nfc("ぎ") / nfc(LEAF))

    def test_i4_unreadable_directory_counts_as_matching_nothing(self, root, monkeypatch):
        _touch(root / nfd(FOLDER) / nfc(LEAF))

        def refuse(*a, **k):
            raise PermissionError("denied")

        monkeypatch.setattr(os, "scandir", refuse)
        monkeypatch.setattr(os, "listdir", refuse)
        monkeypatch.setattr(Path, "iterdir", refuse)
        assert _resolve(root, f"{nfc(FOLDER)}/{nfc(LEAF)}") == os.fspath(
            root / nfc(FOLDER) / nfc(LEAF))

    def test_i4_missing_root_does_not_raise(self, tmp_path):
        gone = tmp_path / "gone"
        assert _resolve(gone, f"{nfc(FOLDER)}/{nfc(LEAF)}") == os.fspath(
            gone / nfc(FOLDER) / nfc(LEAF))

    @pytest.mark.parametrize("rel", ["../" + nfc(LEAF), "./" + nfc(LEAF),
                                     nfc(FOLDER) + "/../" + nfc(LEAF),
                                     nfc(FOLDER) + "//" + nfc(LEAF)])
    def test_i10_dot_and_empty_components_match_nothing(self, tmp_path, rel):
        outer = tmp_path / "outer"
        root = outer / "root"
        root.mkdir(parents=True)
        require_sensitive_fs(root)
        _touch(outer / nfd(LEAF))
        _touch(root / nfd(FOLDER) / nfd(LEAF))
        got = _resolve(root, rel)
        assert got == os.fspath(root / rel)
        assert os.path.realpath(got) != os.path.realpath(outer / nfd(LEAF))

    def test_i10_a_parent_directory_is_never_listed(self, tmp_path, monkeypatch):
        outer = tmp_path / "outer"
        root = outer / "root"
        root.mkdir(parents=True)
        require_sensitive_fs(root)
        _touch(outer / nfd(LEAF))
        listed: list[str] = []
        real = os.scandir

        def spy(path=".", *a, **k):
            listed.append(os.path.realpath(path))
            return real(path, *a, **k)

        monkeypatch.setattr(os, "scandir", spy)
        _resolve(root, "../" + nfc(LEAF))
        assert os.path.realpath(outer) not in listed

    def test_i10_a_matching_symlink_is_returned_as_is(self, root, tmp_path):
        target = _touch(tmp_path / "elsewhere.txt")
        link = root / nfd(LEAF)
        link.symlink_to(target)
        got = _resolve(root, nfc(LEAF))
        assert got == os.fspath(link)
        assert os.path.islink(got)

    def test_i12_ambiguous_read_uses_the_first_by_sorted_utf8_bytes(self, root):
        stored = nfc("がぱ")
        full = nfd(stored)
        mixed = nfd("が") + "ぱ"
        assert len({stored, full, mixed}) == 3
        _touch(root / full)
        _touch(root / mixed)
        first = min(full, mixed, key=lambda s: s.encode("utf-8"))
        assert _resolve(root, stored) == os.fspath(root / first)

    def test_i12_resolving_changes_nothing_on_disk(self, root):
        _touch(root / nfd(FOLDER) / nfd(LEAF))
        before = tree(root)
        _resolve(root, f"{nfc(FOLDER)}/{nfc(LEAF)}")
        _resolve(root, f"{nfc(FOLDER)}/missing.txt")
        assert tree(root) == before


class TestResolveParent:
    def test_i5_parent_is_resolved_and_the_leaf_is_left_alone(self, root):
        (root / nfd(FOLDER)).mkdir()
        got = os.fspath(_mod().resolve_parent(root, f"{nfc(FOLDER)}/{nfc(LEAF)}"))
        assert got == os.fspath(root / nfd(FOLDER) / nfc(LEAF))

    def test_i5_an_existing_nfd_leaf_is_not_substituted(self, root):
        _touch(root / nfd(FOLDER) / nfd(LEAF))
        got = os.fspath(_mod().resolve_parent(root, f"{nfc(FOLDER)}/{nfc(LEAF)}"))
        assert got == os.fspath(root / nfd(FOLDER) / nfc(LEAF))

    def test_i4_a_missing_parent_stays_as_stored(self, root):
        got = os.fspath(_mod().resolve_parent(root, f"{nfc(FOLDER)}/{nfc(LEAF)}"))
        assert got == os.fspath(root / nfc(FOLDER) / nfc(LEAF))

    def test_i5_a_leaf_without_a_parent_is_joined_to_the_root(self, root):
        got = os.fspath(_mod().resolve_parent(root, nfc(LEAF)))
        assert got == os.fspath(root / nfc(LEAF))

    def test_i12_resolving_a_parent_creates_nothing(self, root):
        (root / nfd(FOLDER)).mkdir()
        before = tree(root)
        _mod().resolve_parent(root, f"{nfc(FOLDER)}/{nfc(LEAF)}")
        _mod().resolve_parent(root, f"{nfc('ぎ')}/{nfc(LEAF)}")
        assert tree(root) == before


def test_i12_ambiguous_path_is_an_exception_type():
    assert issubclass(_mod().AmbiguousPath, Exception)
