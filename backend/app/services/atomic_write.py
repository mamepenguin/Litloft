"""Replacing a file's contents, with no second way to do it wrong.

`backend-conventions.md` states the discipline — write to a temporary, then
`os.replace()` — and ten call sites implemented it separately, in four
different spellings, with seven of them losing the destination's mode.

**Two functions, because there are two meanings.** The mode policy is chosen by
which one you call, not by an argument: a caller that can pass a policy is a
caller that can pass the wrong one.

- `replace_file_contents` / `replacing_file` — a file in a **drive**. The
  destination belongs to the user, who may have chmod'ed it on purpose, so an
  existing mode is preserved.
- `write_generated_file` / `generating_file` — a file under **`DATA_DIR`**.
  Thumbnails, caches and job records are regenerated from something else and
  nobody chmods them, so the mode is what a plain `open()` would have produced.
  Fixed, not preserved: preserving it here would pin whatever the destination
  happens to carry, including a mode left behind by an earlier bug, and
  regeneration is the path by which such a file heals.

Beyond the mode, a caller cannot:

- **name the temporary file, or any part of it.** It is created in the
  destination's own directory — which is what makes `rename(2)` atomic; a
  caller that picks the path can pick one on another filesystem, where
  `os.replace` raises `EXDEV` — with a **leading dot**, which is what keeps the
  scanner from indexing it, and carrying the destination's own extension,
  because ffmpeg infers its output format from the name it is handed.
- **leave a temporary file behind.** Removal is in a `finally`. A `return` out
  of the block cannot leak one — `contextlib` resumes the generator and the
  write is published — so what `finally` buys over `except Exception` is
  `BaseException`: a `KeyboardInterrupt` mid-assembly cleans up too.
- **publish a half-written file.** The rename happens on clean exit from the
  block and nowhere else. To give up, raise `AbandonWrite`.

Every call site passes a destination and the contents. There is nothing else to
pass, which is what lets `test_atomic_write.py` ask the opposite question —
which writes in the tree do *not* come through here.

What this does **not** promise is durability. `os.replace` is atomic with
respect to what a reader can see; surviving a power cut needs `fsync` on the
temporary file and on its directory, which nothing in this tree does. A separate
guarantee, deliberately not made here.
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

    The temporary file is removed and the destination is untouched, and this
    propagates for the caller to catch. It is not swallowed, because a caller
    that cannot tell "abandoned" from "published" reports success for a file it
    never wrote — which is the bug `write_thumbnail_atomically` returns `False`
    to avoid.
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
