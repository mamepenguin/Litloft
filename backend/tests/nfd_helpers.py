"""Shared setup for the NFD path-resolution tests (SPEC-CORE-042)."""
from __future__ import annotations

import os
import shutil
import unicodedata
from pathlib import Path

import pytest

from tests.conftest import FIXTURES_DIR, TEST_DRIVE

FOLDER = "ばなな"
LEAF = "がっこう.mp4"
REL = f"{FOLDER}/{LEAF}"

# disk spelling of (folder, leaf) -> which components are decomposed on disk
LAYOUTS = {
    "leaf": (False, True),
    "ancestor": (True, False),
    "both": (True, True),
}


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def nfd(s: str) -> str:
    return unicodedata.normalize("NFD", s)


def require_sensitive_fs(path: Path) -> None:
    probe = path / nfd("がぎ")
    probe.mkdir(parents=True, exist_ok=True)
    try:
        if (path / nfc("がぎ")).exists():
            pytest.skip("filesystem folds Unicode normalization")
    finally:
        probe.rmdir()


def disk_rel(folder_nfd: bool, leaf_nfd: bool, folder: str = FOLDER, leaf: str = LEAF) -> str:
    f = nfd(folder) if folder_nfd else nfc(folder)
    l = nfd(leaf) if leaf_nfd else nfc(leaf)
    return f"{f}/{l}"


def seed(db, drive_dir: Path, *, stored: str = REL, on_disk: str | None = None,
         data: bytes | None = None, mime: str = "video/mp4", ftype: str = "video",
         row: bool = True):
    """Write `on_disk` (default: the stored path, as NFC) and register `stored`."""
    on_disk = on_disk if on_disk is not None else stored
    target = drive_dir / on_disk
    target.parent.mkdir(parents=True, exist_ok=True)
    if data is None:
        shutil.copy(FIXTURES_DIR / "short_video.mp4", target)
    else:
        target.write_bytes(data)
    if not row:
        return None
    from app.models import File

    folder, _, name = stored.rpartition("/")
    rec = File(
        filename=name,
        title=Path(name).stem,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=stored,
        file_size=target.stat().st_size,
        file_type=ftype,
        mime_type=mime,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def tree(root: Path) -> dict[str, bytes | None]:
    """Exact on-disk names (no normalization) mapped to bytes; None for dirs."""
    out: dict[str, bytes | None] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        for d in dirnames:
            out[os.path.relpath(os.path.join(dirpath, d), root)] = None
        for f in filenames:
            p = os.path.join(dirpath, f)
            out[os.path.relpath(p, root)] = Path(p).read_bytes()
    return out


def names(directory: Path) -> list[str]:
    return sorted(os.listdir(directory))


def wire(res) -> tuple:
    keep = ("content-type", "content-length", "accept-ranges", "content-range",
            "content-disposition")
    return (res.status_code, {k: res.headers.get(k) for k in keep}, res.content)
