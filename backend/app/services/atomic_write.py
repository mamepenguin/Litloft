"""One way to replace a file's contents, so there is no second way to do it wrong.

`backend-conventions.md` states the discipline — write to `.tmp`, then
`os.replace()` — and eight call sites implemented it separately. Seven of them
were subtly wrong in the same way, which is what a convention costs when it is
a rule each caller re-applies rather than a thing each caller uses.

So the contract here is narrow on purpose. A caller cannot:

- **name the temporary file, or any part of it.** It is created in the
  destination's own directory — which is what makes `rename(2)` atomic in the
  first place; a caller that chooses the path can choose one on another
  filesystem, where `os.replace` raises `EXDEV` — and it carries the
  destination's own extension, because ffmpeg infers its output format from the
  name it is given and a thumbnail written to a suffixless temporary comes out
  as something else.

  Every caller passes a destination and the contents. There is nothing else to
  pass, which is the point: a knob a caller can set is a knob a caller can set
  wrongly, and this module exists because eight callers set the same one
  wrongly seven times.
- **leave a temporary file behind.** Removal is in a `finally`. A `return` out
  of the block cannot leak one — `contextlib` resumes the generator and the
  write is published — so what `finally` buys over `except Exception` is
  `BaseException`: a `KeyboardInterrupt` during assembly cleans up too.
- **publish a half-written file.** The rename happens on clean exit from the
  block and nowhere else. To give up, raise `AbandonWrite`.
- **forget the mode.** `tempfile.mkstemp` opens at `0600` and `os.replace`
  carries the source's mode to the destination, so every site that used it
  turned its destination private to the backend's uid, one file per write. The
  destination's own mode is preserved where it already exists; a new file gets
  what a plain `open()` would have given it.

What this does **not** promise is durability. `os.replace` is atomic with
respect to what a reader can see; surviving a power cut needs `fsync` on the
temporary file and on its directory, which nothing in this tree does. Separate
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
_DEFAULT_FILE_MODE = 0o666 & ~_process_umask()


class AbandonWrite(Exception):
    """Raise inside `atomic_replace` to discard the write without publishing it.

    The temporary file is removed and the destination is untouched, and this
    propagates for the caller to catch. It is not swallowed, because a caller
    that cannot tell "abandoned" from "published" is a caller that reports
    success for a file it never wrote — which is the bug
    `write_thumbnail_atomically` returns `False` to avoid.
    """


def _mode_for(destination: Path) -> int:
    try:
        return stat.S_IMODE(destination.stat().st_mode)
    except OSError:
        return _DEFAULT_FILE_MODE


@contextmanager
def atomic_replace(destination: Path | str) -> Iterator[Path]:
    """Yield a temporary path beside `destination`, then move it into place.

    The move happens only if the block completes. Every exception, including
    `AbandonWrite`, propagates after the temporary file is removed.
    """
    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    mode = _mode_for(target)
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


def atomic_write_bytes(destination: Path | str, body: bytes) -> None:
    with atomic_replace(destination) as temporary:
        temporary.write_bytes(body)


def atomic_write_text(destination: Path | str, body: str) -> None:
    """UTF-8, with no encoding to choose. Anything else goes through bytes."""
    with atomic_replace(destination) as temporary:
        temporary.write_text(body, encoding="utf-8")
