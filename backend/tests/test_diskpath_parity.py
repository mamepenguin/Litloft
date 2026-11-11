"""SPEC-CORE-042: the resolver agrees with the shared parity table (I16 table, core copy)."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from tests.nfd_helpers import nfc, nfd, require_sensitive_fs

TABLE = json.loads((Path(__file__).parent / "fixtures" / "diskpath_parity.json").read_text("utf-8"))


def _decode(path: str) -> str:
    def part(component: str) -> str:
        if component.startswith("nfc:"):
            return nfc(component[4:])
        if component.startswith("nfd:"):
            return nfd(component[4:])
        return component

    return "/".join(part(c) for c in path.split("/"))


@pytest.mark.parametrize("case", TABLE["cases"], ids=lambda c: c["id"])
def test_resolver_matches_the_parity_table(tmp_path, case):
    from app.services.diskpath import resolve_on_disk

    root = tmp_path / "root"
    root.mkdir()
    require_sensitive_fs(root)
    for entry in case["disk"]:
        target = root / _decode(entry)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"x")

    resolved = os.fspath(resolve_on_disk(root, case["rel"]))

    assert resolved == os.fspath(root) + "/" + _decode(case["expect"])
