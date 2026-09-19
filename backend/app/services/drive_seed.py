"""Startup drive bootstrap: drives.json [] detection -> auto-seed.

Ordering is the load-bearing invariant: the pre-seed entry count is read
**once**, the setup-completed sentinel migration runs **before** the seed (so
a brand-new user whose drives.json is ``[]`` is NOT mistaken for an existing
user once the seed populates it), and the seed runs only when the pre-seed
count is exactly 0. ``None`` (the directory footgun) does nothing but log.
"""
from __future__ import annotations

import json
import logging

import app.config as config
from app.services.config_writer import atomic_write_json

logger = logging.getLogger(__name__)


def drives_json_entry_count() -> int | None:
    """Return the number of entries in drives.json.

    Returns:
      - ``None`` if the file is unreadable: absent, a directory (the Docker
        single-file bind-mount footgun), or not a JSON array. This state is
        a discriminator for "do nothing" — never seed, never migrate.
      - ``0`` for an empty array ``[]``.
      - ``N`` for an array with ``N`` elements.
    """
    path = config.DRIVES_CONFIG
    try:
        if not path.exists() or path.is_dir():
            return None
        raw = json.loads(path.read_text())
    except (OSError, ValueError):
        return None
    if not isinstance(raw, list):
        return None
    return len(raw)


def seed_drives_from_mounts() -> list[dict]:
    """Seed drives.json from directories under ``config.DRIVES_MOUNT_ROOT``.

    Each ``<slug>`` directory becomes ``{"name": <slug>, "path":
    f"{root}/{slug}"}``. Writes with ``touch_restart_pending=False``
    (startup seed is not a user config change).

    If the mount root has no subdirectories, nothing is written and ``[]``
    is returned (the caller leaves drives.json as the empty array).
    """
    root = config.DRIVES_MOUNT_ROOT
    try:
        slugs = sorted(
            entry.name for entry in root.iterdir() if entry.is_dir()
        )
    except OSError:
        logger.exception("Failed to enumerate drive mount root %s", root)
        slugs = []

    if not slugs:
        logger.info(
            "drives.json is empty but no directories under %s — leaving []",
            root,
        )
        return []

    entries = [
        {"name": slug, "path": f"{root}/{slug}"}
        for slug in slugs
    ]
    atomic_write_json(
        config.DRIVES_CONFIG, entries, touch_restart_pending=False
    )
    # Record that this install's non-empty drives.json is our own seed
    # product. A later boot (before /setup completes) will read pre_seed_count
    # >= 1 and must NOT mistake it for a pre-GUI hand-config — the migration
    # checks this marker.
    try:
        marker = config._auto_seeded_marker()
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        marker.touch()
    except OSError:
        logger.exception("Failed to write auto-seed marker")
    # Invalidate the persistent cache so the next load_drives() sees the
    # freshly seeded file; must happen before scan_all_drives.
    config._drives_cache = None
    logger.info(
        "Seeded drives.json with %d drive(s) from %s: %s",
        len(entries),
        root,
        ", ".join(slug for slug in slugs),
    )
    return entries


def run_startup_drive_bootstrap() -> None:
    """Startup sequence: pre-seed count -> migration -> seed."""
    pre_seed_count = drives_json_entry_count()

    if pre_seed_count is None:
        logger.warning(
            "drives.json is unreadable (absent / directory footgun / invalid "
            "JSON) — skipping setup-sentinel migration and drive seed"
        )
        return

    _migrate_setup_sentinel(pre_seed_count)

    if pre_seed_count == 0:
        seed_drives_from_mounts()


def _migrate_setup_sentinel(pre_seed_count: int) -> None:
    """Touch the setup-completed sentinel for pre-existing users only.

    configure.py writes ``[]`` for new installs too, so the file existing
    proves nothing; a **non-empty** pre-seed drives.json is what marks a user
    who configured drives by hand and must skip /setup.
    """
    if pre_seed_count < 1:
        return
    # Our own seed also leaves drives.json non-empty; the marker keeps a new
    # user who restarts before finishing /setup on the wizard.
    if config._auto_seeded_marker().exists():
        logger.info(
            "Skipping setup-sentinel migration: drives.json is auto-seeded"
        )
        return
    try:
        sentinel = config._setup_completed_sentinel()
        if not sentinel.exists():
            config.DATA_DIR.mkdir(parents=True, exist_ok=True)
            sentinel.touch()
            logger.info("Setup sentinel auto-created for existing user")
    except OSError:
        logger.exception("Failed to evaluate setup sentinel migration")
