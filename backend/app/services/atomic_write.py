"""Atomic file replacement.

The mode policy is chosen by which function you call, not by an argument:

- `replace_file_contents` / `replacing_file` — a file in a **drive**. The user
  may have chmod'ed it on purpose, so an existing mode is preserved.
- `write_generated_file` / `generating_file` — a file under **`DATA_DIR`**. The
  mode is fixed, so regenerating a file also repairs a bad mode.

The temporary file sits in the destination's directory (so `rename(2)` stays on
one filesystem), starts with a dot (so the scanner skips it), and keeps the
destination's extension (ffmpeg infers the output format from it).

Not durable across a power cut: nothing here calls `fsync`.
"""
from __future__ import annotations

import os
import stat
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


def _process_umask() -> int:
    current = os.umask(0o022)
    os.umask(current)
    return current


# What a plain `open()` would have produced. `mkstemp` does not go through the
# umask, so the value is reconstructed rather than inherited.
_GENERATED_FILE_MODE = 0o666 & ~_process_umask()


class AbandonWrite(Exception):
    """Raise inside a write block to discard it without publishing.

    It propagates, so the caller can tell "abandoned" from "published".
    """


@contextmanager
def _atomic(destination: Path | str, *, preserve_mode: bool) -> Iterator[Path]:
    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    mode = _GENERATED_FILE_MODE
    if preserve_mode:
        try:
            mode = stat.S_IMODE(target.stat().st_mode)
        except OSError:
            pass
    fd, temporary = tempfile.mkstemp(
        prefix=f".{target.name}.", suffix=target.suffix or ".tmp", dir=target.parent
    )
    os.close(fd)
    try:
        yield Path(temporary)
        os.chmod(temporary, mode)
        os.replace(temporary, target)
    finally:
        try:
            os.unlink(temporary)
        except OSError:
            # Gone because the rename took it, or because the caller moved it.
            pass


@contextmanager
def replacing_file(destination: Path | str) -> Iterator[Path]:
    """A file in a drive, filled by the caller. An existing mode is preserved."""
    with _atomic(destination, preserve_mode=True) as temporary:
        yield temporary


@contextmanager
def generating_file(destination: Path | str) -> Iterator[Path]:
    """A file under `DATA_DIR`, filled by the caller. The mode is fixed."""
    with _atomic(destination, preserve_mode=False) as temporary:
        yield temporary


def replace_file_contents(destination: Path | str, body: bytes) -> None:
    with _atomic(destination, preserve_mode=True) as temporary:
        temporary.write_bytes(body)


def write_generated_file(destination: Path | str, body: bytes) -> None:
    with _atomic(destination, preserve_mode=False) as temporary:
        temporary.write_bytes(body)
