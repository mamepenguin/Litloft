"""Startup drive bootstrap: drives.json [] detection -> auto-seed.

Spec: docs/superpowers/specs/2026-05-19-gui-first-setup-cli-bootstrap.md §3.1

The shrunk configure.py writes drives.json as an empty ``[]`` (a footgun
guard against the single-file bind-mount: a missing host file makes Docker
mount a *directory* at /app/drives.json, which is unreadable/unwritable).
On backend startup we detect that empty array and seed one stub entry per
directory under ``config.DRIVES_MOUNT_ROOT`` (``/app/drives/<slug>``), which
configure.py created as Docker mount targets.

Ordering is the load-bearing invariant (spec §3.1 "実行順", H5 grounding
fix): the pre-seed entry count is read **once**, the setup-completed
sentinel migration runs **before** the seed (so a brand-new user whose
drives.json is ``[]`` is NOT mistaken for an existing user once the seed
populates it), and the seed runs only when the pre-seed count is exactly 0.
``None`` (the directory footgun) does nothing but log.
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
    f"{root}/{slug}"}`` (the slug doubles as the display name; logical
    naming is the GUI's job per the spec). Entries are slug-sorted for a
    stable file. Writes via ``config_writer.atomic_write_json`` with
    ``touch_restart_pending=False`` (startup seed is not a user config
    change). After writing, ``config._drives_cache`` is invalidated so the
    next ``load_drives()`` re-reads (spec §3.1 H4).

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
    # Invalidate the persistent cache so the next load_drives() sees the
    # freshly seeded file (spec §3.1 H4 — must happen before scan_all_drives).
    config._drives_cache = None
    logger.info(
        "Seeded drives.json with %d drive(s) from %s: %s",
        len(entries),
        root,
        ", ".join(slug for slug in slugs),
    )
    return entries


def run_startup_drive_bootstrap() -> None:
    """Spec-mandated startup sequence: pre-seed count -> migration -> seed.

    Mirrors spec §3.1 "実行順" exactly:

      1. Read the pre-seed entry count **once**.
      2. Migration: a pre-seed count of >= 1 with the sentinel absent means
         an existing user who configured logical settings via the old
         configure.py — touch the sentinel so they skip /setup (unchanged
         behaviour). A count of 0 (new user) or None (footgun) does NOT
         touch it.
      3. Seed: only when the pre-seed count is exactly 0.

    Because the migration inspects the **pre-seed** count, a brand-new user
    (drives.json ``[]``) is not mistaken for an existing user even though
    the seed populates drives.json immediately afterward. All of this runs
    before ``scan_all_drives()``.
    """
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

    drives.json existing on disk no longer distinguishes a fresh install
    from an upgrade: the shrunk configure.py writes an empty ``[]`` for
    brand-new users too. The discriminator is therefore whether the
    **pre-seed** drives.json was *non-empty* — only then is this a user who
    already configured logical settings via the old configure.py and must
    keep skipping /setup. An empty ``[]`` (new user) must NOT touch the
    sentinel, so the seed can populate drives.json and /setup still runs.
    """
    if pre_seed_count < 1:
        return
    try:
        sentinel = config._setup_completed_sentinel()
        if not sentinel.exists():
            config.DATA_DIR.mkdir(parents=True, exist_ok=True)
            sentinel.touch()
            logger.info("Setup sentinel auto-created for existing user")
    except OSError:
        logger.exception("Failed to evaluate setup sentinel migration")
