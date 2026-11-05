"""SPEC-CORE-042 I3: a component that exists byte for byte wins at every depth."""
from __future__ import annotations

import os

from tests.nfd_helpers import FOLDER, LEAF, nfc, nfd, require_sensitive_fs


def test_i3_an_exact_folder_wins_over_its_nfd_twin_when_only_the_leaf_differs(tmp_path):
    from app.services.diskpath import resolve_on_disk

    root = tmp_path / "root"
    root.mkdir()
    require_sensitive_fs(root)
    (root / nfc(FOLDER)).mkdir()
    (root / nfc(FOLDER) / nfd(LEAF)).write_bytes(b"in the exact folder")
    (root / nfd(FOLDER)).mkdir()
    (root / nfd(FOLDER) / nfd(LEAF)).write_bytes(b"in the twin")
    got = os.fspath(resolve_on_disk(root, f"{nfc(FOLDER)}/{nfc(LEAF)}"))
    assert got == os.fspath(root / nfc(FOLDER) / nfd(LEAF))
