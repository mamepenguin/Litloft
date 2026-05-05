"""Safe path resolution helper.

Provides validation utilities to ensure user-supplied paths remain inside
a given drive root and don't contain dangerous characters or structures.

Usage:
    from app.services.safepath import resolve_safe_path, validate_filename

    # Resolve a drive-relative path, raising HTTPException on unsafe input
    path = resolve_safe_path("my-drive", "notes/memo.md")

    # Validate a single filename component
    validate_filename("memo.md")

Design notes:
- Symbolic links are rejected wholesale (defense in depth against TOCTOU).
- Windows reserved names are rejected (cross-platform compatibility).
- NUL and control characters are rejected unconditionally.
- Length limits follow POSIX filename (255) and path (~4096) conventions.
"""
import os
import unicodedata
from pathlib import Path

from fastapi import HTTPException

import app.config as config

_MAX_PATH_LENGTH = 4000
_MAX_FILENAME_LENGTH = 255

_WINDOWS_RESERVED_NAMES = frozenset({
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
})


def _has_forbidden_chars(value: str) -> bool:
    """True if the string contains NUL or ASCII control characters."""
    for ch in value:
        if ch == "\x00" or (ord(ch) < 0x20):
            return True
    return False


def _is_reserved_name(name: str) -> bool:
    """True if name matches a Windows reserved device name (case-insensitive).

    Matches both bare names (CON) and names with extensions (CON.md).
    """
    if not name:
        return False
    stem = name.split(".", 1)[0].upper()
    return stem in _WINDOWS_RESERVED_NAMES


def validate_filename(name: str) -> str:
    """Validate a single filename component (no slashes allowed).

    Returns the NFC-normalized name.

    Raises HTTPException(400) on any of:
    - empty string
    - "." or ".."
    - forward/back slash
    - NUL or control character
    - length over 255
    - Windows reserved name (CON, NUL, COM1, etc.)
    """
    if not name:
        raise HTTPException(status_code=400, detail="Filename is empty")
    name = unicodedata.normalize("NFC", name)
    if name in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Filename cannot contain path separators")
    if _has_forbidden_chars(name):
        raise HTTPException(status_code=400, detail="Filename contains forbidden characters")
    if len(name) > _MAX_FILENAME_LENGTH:
        raise HTTPException(status_code=400, detail="Filename too long")
    if _is_reserved_name(name):
        raise HTTPException(status_code=400, detail="Filename uses a reserved name")
    return name


def _contains_symlink(path: Path, base: Path) -> bool:
    """Check if any component of path (between base and path) is a symlink."""
    try:
        rel = path.relative_to(base)
    except ValueError:
        return False
    cursor = base
    for part in rel.parts:
        cursor = cursor / part
        if cursor.is_symlink():
            return True
        if not cursor.exists():
            # Non-existent tail — nothing further to check
            return False
    return False


def resolve_safe_path(drive_name: str, rel_path: str) -> Path:
    """Resolve a drive-relative path to an absolute Path, safely.

    Validates:
    - drive exists in drives.json (404 if not)
    - path doesn't contain NUL/control chars (400)
    - path isn't absolute (400)
    - no component is a symlink (400)
    - each component is a valid filename (400 via validate_filename)
    - realpath doesn't escape drive root (400)
    - total length under limit (400)

    Returns: the resolved absolute Path (may not exist).
    """
    try:
        drive_path = config.get_drive_path(drive_name)
    except ValueError:
        raise HTTPException(status_code=404, detail="Drive not found")

    if rel_path is None:
        raise HTTPException(status_code=400, detail="Path is required")

    if len(rel_path) > _MAX_PATH_LENGTH:
        raise HTTPException(status_code=400, detail="Path too long")

    if _has_forbidden_chars(rel_path):
        raise HTTPException(status_code=400, detail="Path contains forbidden characters")

    # Reject absolute paths
    if rel_path.startswith("/") or rel_path.startswith("\\"):
        raise HTTPException(status_code=400, detail="Absolute paths not allowed")

    # Normalize separators (but don't allow backslash bypass), then validate each
    # component; validate_filename returns the NFC-normalized name.
    raw_parts = [p for p in rel_path.replace("\\", "/").split("/") if p and p != "."]
    parts = []
    for part in raw_parts:
        if part == "..":
            raise HTTPException(status_code=400, detail="Parent directory traversal not allowed")
        parts.append(validate_filename(part))

    drive_root = Path(drive_path).resolve()
    target = drive_root
    for part in parts:
        target = target / part

    # Check symlinks in existing components
    if _contains_symlink(target, drive_root):
        raise HTTPException(status_code=400, detail="Symbolic links in path not allowed")

    real_target = Path(os.path.realpath(target))
    # Ensure realpath is still inside the drive root
    try:
        real_target.relative_to(drive_root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Path escapes drive root")

    return real_target
