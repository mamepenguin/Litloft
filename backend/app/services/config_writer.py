"""Atomic JSON config writer with single-generation backup.

Bind-mounted single-file fallback:
    On Linux, ``rename(2)`` over a path that is itself a bind-mount target
    returns ``EBUSY`` because the kernel cannot swap the inode while the
    mount holds it. This is the case for ``./drives.json:/app/drives.json``
    in our docker-compose.yml. When ``os.replace`` raises ``EBUSY`` we fall
    back to in-place truncate+write of the destination. Atomicity is
    weakened (a crash mid-write leaves a half-written file), but the
    pre-write ``.bak`` copy remains the safety net for recovery.
"""
from __future__ import annotations

import errno
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
        the destination already exists. The previous ``.bak`` is overwritten.
      - Touches ``DATA_DIR/restart_pending`` unless caller opts out.

    Failure modes:
      - Any IO error during write or replace propagates after we clean up
        the temporary file. The destination is left unchanged, except on the
        in-place EBUSY path, where ``<path>.bak`` is the recovery point.
    """
    path = Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    bak = path.with_suffix(path.suffix + ".bak")

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
        try:
            os.replace(tmp, path)
        except OSError as exc:
            if exc.errno != errno.EBUSY:
                raise
            # Bind-mounted single-file destination: rename(2) fails with
            # EBUSY. Fall back to in-place truncate+write. The .bak copy
            # taken above is the recovery point if the in-place write is
            # interrupted.
            logger.warning(
                "%s appears to be a bind-mounted file (rename returned EBUSY); "
                "falling back to in-place write",
                path,
            )
            with path.open("w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
            try:
                tmp.unlink()
            except OSError:
                logger.debug("Could not remove %s after fallback write", tmp)
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
