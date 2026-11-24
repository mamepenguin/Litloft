"""The whole-second modification time stored in ``files.modified_at``."""

import os
from datetime import UTC, datetime
from pathlib import Path


def modified_at_from_stat(st: os.stat_result) -> datetime:
    return datetime.fromtimestamp(int(st.st_mtime), UTC).replace(tzinfo=None)


def read_modified_at(path: str | Path) -> datetime | None:
    try:
        st = os.stat(path)
    except OSError:
        return None
    return modified_at_from_stat(st)
