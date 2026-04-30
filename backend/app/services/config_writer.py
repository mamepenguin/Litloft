"""Atomic JSON config writer with single-generation backup.

Used by `routers/admin_config.py` to durably rewrite drives.json /
passwords.json without leaving partial files behind. The pattern is:

1. If destination exists, copy it to ``<path>.bak`` (single generation).
2. Serialise to ``<path>.tmp``.
3. ``os.replace(tmp, path)`` for atomic rename within the same filesystem.
4. On any failure, clean up ``<path>.tmp`` and re-raise.
5. On success, touch the restart-pending flag in DATA_DIR so the GUI can
   surface the "config has been changed, please restart" banner. The flag
   is cleared on the next backend startup (lifespan in ``main.py``).
"""
from __future__ import annotations

import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any

import app.config as config

logger = logging.getLogger(__name__)


def atomic_write_json(
    path: Path,
    data: list[Any] | dict[str, Any],
    *,
    touch_restart_pending: bool = True,
) -> None:
    """Atomically rewrite ``path`` with ``data`` (list or dict) as JSON.

    Side effects:
      - Creates ``<path>.bak`` (preserving mtime via ``shutil.copy2``) when
        the destination already exists. The previous ``.bak`` is overwritten
        (single-generation backup, matches spec 2026-04-30-config-gui).
      - Touches ``DATA_DIR/restart_pending`` unless caller opts out.

    Failure modes:
      - Any IO error during write or replace propagates after we clean up
        the temporary file. The destination file is left unchanged so the
        running server continues using the previous valid config.
    """
    path = Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    bak = path.with_suffix(path.suffix + ".bak")

    # Ensure parent directory exists (matches behaviour of TestClient
    # fixtures that create tmp_path/data dynamically).
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.exists():
        try:
            shutil.copy2(path, bak)
        except OSError:
            logger.exception("Failed to create backup at %s", bak)
            raise

    try:
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)
    except Exception:
        # Atomicity: never leave a half-written .tmp behind, and keep the
        # original destination intact so callers can retry safely.
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                logger.exception("Failed to clean up %s after write failure", tmp)
        raise

    if touch_restart_pending:
        try:
            flag = config.DATA_DIR / "restart_pending"
            flag.parent.mkdir(parents=True, exist_ok=True)
            flag.touch()
        except OSError:
            # Flag is advisory. Don't roll back the actual write if we fail
            # to mark restart-pending — surface via logs only.
            logger.exception("Failed to touch restart_pending flag")
