"""Tests for app.services.drive_seed and the lifespan seed/migration ordering."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

import app.config as config
from app.services import drive_seed


@pytest.fixture()
def seed_env(tmp_path):
    """Isolate config paths against tmp_path, restore on teardown."""
    drives_json = tmp_path / "drives.json"
    data_dir = tmp_path / "data"
    mount_root = tmp_path / "drives"
    data_dir.mkdir()
    mount_root.mkdir()

    orig_drives_config = config.DRIVES_CONFIG
    orig_data = config.DATA_DIR
    orig_mount_root = config.DRIVES_MOUNT_ROOT
    orig_cache = config._drives_cache

    config.DRIVES_CONFIG = drives_json
    config.DATA_DIR = data_dir
    config.DRIVES_MOUNT_ROOT = mount_root
    config._drives_cache = None

    try:
        yield drives_json, data_dir, mount_root
    finally:
        config.DRIVES_CONFIG = orig_drives_config
        config.DATA_DIR = orig_data
        config.DRIVES_MOUNT_ROOT = orig_mount_root
        config._drives_cache = orig_cache


def _mkmounts(mount_root: Path, slugs: list[str]) -> None:
    for slug in slugs:
        (mount_root / slug).mkdir()


def test_entry_count_missing_file_returns_none(seed_env):
    drives_json, _data, _mount = seed_env
    assert not drives_json.exists()
    assert drive_seed.drives_json_entry_count() is None


def test_entry_count_directory_footgun_returns_none(seed_env):
    drives_json, _data, _mount = seed_env
    # Docker single-file bind-mount footgun: host path absent -> Docker
    # makes /app/drives.json a *directory*.
    drives_json.mkdir()
    assert drive_seed.drives_json_entry_count() is None


def test_entry_count_empty_array_returns_zero(seed_env):
    drives_json, _data, _mount = seed_env
    drives_json.write_text("[]\n")
    assert drive_seed.drives_json_entry_count() == 0


def test_entry_count_n_entries_returns_n(seed_env):
    drives_json, _data, _mount = seed_env
    drives_json.write_text(
        json.dumps([
            {"name": "a", "path": "/app/drives/a"},
            {"name": "b", "path": "/app/drives/b"},
            {"name": "c", "path": "/app/drives/c"},
        ])
    )
    assert drive_seed.drives_json_entry_count() == 3


def test_entry_count_invalid_json_returns_none(seed_env):
    drives_json, _data, _mount = seed_env
    drives_json.write_text("{ not json")
    assert drive_seed.drives_json_entry_count() is None


def test_seed_writes_entries_from_mount_dirs(seed_env):
    drives_json, _data, mount_root = seed_env
    _mkmounts(mount_root, ["photos", "videos", "docs"])

    result = drive_seed.seed_drives_from_mounts()

    written = json.loads(drives_json.read_text())
    assert [d["name"] for d in written] == ["docs", "photos", "videos"]
    assert written == [
        {"name": "docs", "path": f"{mount_root}/docs"},
        {"name": "photos", "path": f"{mount_root}/photos"},
        {"name": "videos", "path": f"{mount_root}/videos"},
    ]
    assert result == written


def test_seed_uses_slug_as_both_name_and_path_segment(seed_env):
    drives_json, _data, mount_root = seed_env
    _mkmounts(mount_root, ["my_drive"])

    drive_seed.seed_drives_from_mounts()

    written = json.loads(drives_json.read_text())
    assert written == [{"name": "my_drive", "path": f"{mount_root}/my_drive"}]


def test_seed_ignores_non_directory_entries(seed_env):
    drives_json, _data, mount_root = seed_env
    _mkmounts(mount_root, ["realdrive"])
    (mount_root / "stray-file.txt").write_text("x")

    drive_seed.seed_drives_from_mounts()

    written = json.loads(drives_json.read_text())
    assert [d["name"] for d in written] == ["realdrive"]


def test_seed_with_no_mount_dirs_writes_nothing_and_returns_empty(seed_env):
    drives_json, _data, _mount = seed_env
    result = drive_seed.seed_drives_from_mounts()

    assert result == []
    assert not drives_json.exists()


def test_seed_invalidates_drives_cache(seed_env):
    _drives_json, _data, mount_root = seed_env
    _mkmounts(mount_root, ["alpha"])
    config._drives_cache = [{"name": "stale", "path": "/old"}]

    drive_seed.seed_drives_from_mounts()

    assert config._drives_cache is None


def test_seed_does_not_touch_restart_pending(seed_env):
    _drives_json, data_dir, mount_root = seed_env
    _mkmounts(mount_root, ["alpha"])

    drive_seed.seed_drives_from_mounts()

    assert not (data_dir / "restart_pending").exists()


def test_seed_writes_auto_seeded_marker(seed_env):
    """A successful seed records the auto-seeded marker.

    The marker is the discriminator that lets a later boot's migration tell
    "this non-empty drives.json was produced by our own seed" apart from
    "a pre-GUI user hand-configured it".
    """
    _drives_json, _data, mount_root = seed_env
    _mkmounts(mount_root, ["alpha"])
    assert not config._auto_seeded_marker().exists()

    drive_seed.seed_drives_from_mounts()

    assert config._auto_seeded_marker().exists()


def test_seed_with_no_mount_dirs_does_not_write_marker(seed_env):
    """No directories -> nothing seeded -> no marker.

    drives.json stays [] so the "non-empty" migration condition never fires;
    writing the marker here would be meaningless (and misleading).
    """
    _drives_json, _data, _mount = seed_env
    drive_seed.seed_drives_from_mounts()

    assert not config._auto_seeded_marker().exists()


def test_partial_delete_does_not_reseed(seed_env):
    drives_json, _data, mount_root = seed_env
    _mkmounts(mount_root, ["a", "b", "c"])
    # GUI deleted 2 of 3 drives, leaving 1 entry.
    drives_json.write_text(json.dumps([{"name": "a", "path": f"{mount_root}/a"}]))

    # count >= 1 -> seed must be skipped by the caller. The count function
    # is the discriminator.
    assert drive_seed.drives_json_entry_count() == 1


def test_full_delete_allows_reseed(seed_env):
    drives_json, _data, mount_root = seed_env
    _mkmounts(mount_root, ["a", "b"])
    # GUI deleted all drives -> [].
    drives_json.write_text("[]\n")

    assert drive_seed.drives_json_entry_count() == 0
    drive_seed.seed_drives_from_mounts()
    written = json.loads(drives_json.read_text())
    assert [d["name"] for d in written] == ["a", "b"]


def _run_lifespan_seed_sequence():
    """Replicate the spec-mandated startup sequence (pure helper)."""
    return drive_seed.run_startup_drive_bootstrap()


def test_ordering_new_user_empty_array_does_not_touch_sentinel(seed_env):
    """pre-seed [] + sentinel absent -> seed fills it, sentinel NOT touched.

    A brand-new user must reach /setup, so the sentinel must remain absent
    even though the seed populated drives.json afterward.
    """
    drives_json, data_dir, mount_root = seed_env
    drives_json.write_text("[]\n")
    _mkmounts(mount_root, ["fresh"])
    sentinel = config._setup_completed_sentinel()
    assert not sentinel.exists()

    _run_lifespan_seed_sequence()

    written = json.loads(drives_json.read_text())
    assert [d["name"] for d in written] == ["fresh"]
    assert not sentinel.exists()


def test_ordering_existing_user_non_empty_touches_sentinel(seed_env):
    """pre-seed non-empty + sentinel absent + NO auto-seed marker ->
    sentinel touched (genuine pre-GUI upgrade user skips /setup)."""
    drives_json, _data, mount_root = seed_env
    drives_json.write_text(
        json.dumps([{"name": "legacy", "path": f"{mount_root}/legacy"}])
    )
    sentinel = config._setup_completed_sentinel()
    assert not sentinel.exists()
    # Genuine upgrade user predates the seed regime: no marker on disk.
    assert not config._auto_seeded_marker().exists()

    _run_lifespan_seed_sequence()

    assert sentinel.exists()
    # Non-empty -> seed must be a no-op (entry preserved, not overwritten).
    written = json.loads(drives_json.read_text())
    assert written == [{"name": "legacy", "path": f"{mount_root}/legacy"}]


def test_ordering_new_user_restart_after_seed_does_not_touch_sentinel(seed_env):
    """Regression: new user restarts backend BEFORE completing /setup.

    Boot 1 seeds drives.json (now non-empty) and records the marker. On boot
    2 the pre-seed count is >= 1, but because the marker shows the file is our
    own seed product (not a pre-GUI hand-config), the migration must NOT touch
    the sentinel -> the user still reaches /setup.
    """
    drives_json, _data, mount_root = seed_env
    _mkmounts(mount_root, ["fresh"])
    sentinel = config._setup_completed_sentinel()

    # Boot 1: empty -> seed populates drives.json + marker, sentinel absent.
    drives_json.write_text("[]\n")
    _run_lifespan_seed_sequence()
    assert config._auto_seeded_marker().exists()
    assert not sentinel.exists()
    assert [d["name"] for d in json.loads(drives_json.read_text())] == ["fresh"]

    # Boot 2: drives.json now non-empty, marker present, sentinel still absent.
    _run_lifespan_seed_sequence()

    assert not sentinel.exists()  # /setup still reachable
    assert [d["name"] for d in json.loads(drives_json.read_text())] == ["fresh"]


def test_ordering_footgun_count_none_touches_nothing(seed_env):
    """count == None (directory footgun) -> neither touch nor seed."""
    drives_json, _data, mount_root = seed_env
    drives_json.mkdir()  # footgun: /app/drives.json is a directory
    _mkmounts(mount_root, ["x"])
    sentinel = config._setup_completed_sentinel()

    _run_lifespan_seed_sequence()

    assert not sentinel.exists()
    assert drives_json.is_dir()
    assert list(drives_json.iterdir()) == []


def test_ordering_sentinel_already_present_is_noop(seed_env):
    """sentinel already exists (wizard completed) -> migration no-op, seed no-op."""
    drives_json, _data, mount_root = seed_env
    drives_json.write_text(
        json.dumps([{"name": "kept", "path": f"{mount_root}/kept"}])
    )
    sentinel = config._setup_completed_sentinel()
    sentinel.touch()
    before_mtime = sentinel.stat().st_mtime

    _run_lifespan_seed_sequence()

    assert sentinel.exists()
    assert sentinel.stat().st_mtime == before_mtime
    written = json.loads(drives_json.read_text())
    assert written == [{"name": "kept", "path": f"{mount_root}/kept"}]


def test_ordering_empty_array_no_mounts_stays_empty_no_sentinel(seed_env):
    """pre-seed [] + sentinel absent + no mount dirs -> stays [], no sentinel."""
    drives_json, _data, _mount = seed_env
    drives_json.write_text("[]\n")
    sentinel = config._setup_completed_sentinel()

    _run_lifespan_seed_sequence()

    assert not sentinel.exists()
    assert json.loads(drives_json.read_text()) == []


def test_lifespan_client_fixture_still_works(client):
    """The conftest ``client`` fixture drives the real lifespan."""
    c, _session, _drive_dir, data_dir = client
    resp = c.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    assert (data_dir / "setup_completed").exists()
