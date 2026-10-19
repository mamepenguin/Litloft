"""Find the files beside a stored name without trusting the bytes of either.

A drive mounted from a host that folds Unicode normalization can hold an NFD
name while the DB stores the NFC one. Opening the stored path works there; a
`glob()` built from it does not, because the listing compares bytes and the
stem's `[ ] * ?` are read as pattern syntax.
"""

from __future__ import annotations

import fnmatch
import os
import unicodedata
from pathlib import Path


def match_siblings(directory: Path, stem: str, rest_pattern: str) -> list[Path]:
    """Return the files in `directory` named `stem` + something matching `rest_pattern`.

    `stem` is literal text and both sides are compared in NFC; `rest_pattern`
    is matched with `fnmatchcase`. The result is the on-disk paths sorted by
    on-disk name. Raises `OSError` when the directory cannot be listed.
    """
    prefix = unicodedata.normalize("NFC", stem)
    named = []
    with os.scandir(directory) as entries:
        for entry in entries:
            name = unicodedata.normalize("NFC", entry.name)
            if name.startswith(prefix) and fnmatch.fnmatchcase(name[len(prefix):], rest_pattern):
                named.append(Path(entry.path))
    return sorted((p for p in named if p.is_file()), key=lambda p: p.name)
