"""Turn a stored (NFC) drive-relative path into the path that exists on disk.

Linux compares names byte for byte, so a file copied onto a drive with a
decomposed (NFD) name is not found by its stored NFC path. Nothing here writes,
renames or creates anything, which keeps it usable on read-only mounts.
"""
from __future__ import annotations

import logging
import os
import threading
import unicodedata
from collections import OrderedDict
from pathlib import Path

from fastapi import HTTPException

logger = logging.getLogger(__name__)

_CACHE_MAX = 4096
_WARNED_MAX = 1024

_cache: OrderedDict[tuple[str, str], str] = OrderedDict()
_cache_lock = threading.Lock()
_warned: set[tuple[str, str]] = set()


AMBIGUOUS_DETAIL = "Ambiguous file name on disk"


class AmbiguousPath(Exception):
    """More than one directory entry matches a component and none equals it byte for byte."""


def _warn_unreadable(directory: str, error: OSError) -> None:
    key = (directory, type(error).__name__)
    with _cache_lock:
        if key in _warned or len(_warned) >= _WARNED_MAX:
            return
        _warned.add(key)
    logger.warning("Cannot list %s while resolving a stored path: %s", directory, error)


def _matching_entries(directory: str, component: str) -> list[str]:
    """Entries of ``directory`` whose NFC form equals the NFC form of ``component``."""
    wanted = unicodedata.normalize("NFC", component)
    try:
        with os.scandir(directory) as it:
            found = [e.name for e in it if unicodedata.normalize("NFC", e.name) == wanted]
    except (FileNotFoundError, NotADirectoryError):
        return []
    except OSError as exc:
        _warn_unreadable(directory, exc)
        return []
    return sorted(found, key=lambda n: n.encode("utf-8", "surrogateescape"))


def _walk(root: Path, rel: str, strict: bool) -> Path:
    """Resolve ``rel`` component by component; the unmatched tail is kept as given."""
    parts = rel.split("/")
    if any(part in ("", ".", "..") for part in parts):
        return root / rel
    current = os.fspath(root)
    for index, part in enumerate(parts):
        exact = os.path.join(current, part)
        if os.path.lexists(exact):
            current = exact
            continue
        matches = _matching_entries(current, part)
        if not matches:
            return Path(current) / "/".join(parts[index:])
        if strict and len(matches) > 1:
            raise AmbiguousPath(rel)
        current = os.path.join(current, matches[0])
    return Path(current)


def _cached(key: tuple[str, str]) -> Path | None:
    with _cache_lock:
        hit = _cache.get(key)
        if hit is not None:
            _cache.move_to_end(key)
    if hit is None:
        return None
    if os.path.lexists(hit):
        return Path(hit)
    with _cache_lock:
        _cache.pop(key, None)
    return None


def _remember(key: tuple[str, str], resolved: Path) -> None:
    with _cache_lock:
        _cache[key] = os.fspath(resolved)
        _cache.move_to_end(key)
        while len(_cache) > _CACHE_MAX:
            _cache.popitem(last=False)


def resolve_on_disk(root: str | Path, rel: str, *, strict: bool = False, cached: bool = False) -> Path:
    """The path under ``root`` that exists for ``rel``, or ``root/rel`` when none does.

    ``strict`` raises AmbiguousPath instead of picking the first of several
    equally good matches; callers that rename, move, copy, delete, create or
    restore pass it. ``cached`` is for read paths only: a mutating site must see
    the disk as it is now.
    """
    root = Path(root)
    direct = root / rel
    if os.path.lexists(direct):
        return direct
    key = (os.fspath(root), rel)
    if cached and not strict:
        hit = _cached(key)
        if hit is not None:
            return hit
    resolved = _walk(root, rel, strict)
    if cached and not strict and resolved != direct and os.path.lexists(resolved):
        _remember(key, resolved)
    return resolved


def resolve_parent(root: str | Path, rel: str, *, strict: bool = False) -> Path:
    """``rel`` with its parent folder resolved and the leaf left as given."""
    parent, _, leaf = rel.rpartition("/")
    if not parent:
        return Path(root) / rel
    return _walk(Path(root), parent, strict) / leaf


def existing_or_409(root: str | Path, rel: str) -> Path:
    """Strict ``resolve_on_disk`` for sites that change or remove what it names."""
    try:
        return resolve_on_disk(root, rel, strict=True)
    except AmbiguousPath:
        raise HTTPException(status_code=409, detail=AMBIGUOUS_DETAIL) from None


def new_or_409(root: str | Path, rel: str) -> Path:
    """Strict ``resolve_parent`` for sites that create ``rel`` under its parent."""
    try:
        return resolve_parent(root, rel, strict=True)
    except AmbiguousPath:
        raise HTTPException(status_code=409, detail=AMBIGUOUS_DETAIL) from None


def name_taken(path: Path) -> bool:
    """True when ``path``'s directory already holds its name in either spelling."""
    return resolve_on_disk(path.parent, path.name).exists()
