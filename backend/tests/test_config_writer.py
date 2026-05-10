"""Tests for app.services.config_writer.atomic_write_json."""
from __future__ import annotations

import errno
import json
import os
from pathlib import Path

import pytest

import app.config as config
from app.services.config_writer import atomic_write_json


@pytest.fixture()
def isolated_data_dir(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    return data_dir


def test_writes_new_file_and_touches_restart_pending(tmp_path, isolated_data_dir):
    target = tmp_path / "drives.json"
    atomic_write_json(target, [{"name": "default", "path": "/x"}])

    assert json.loads(target.read_text()) == [{"name": "default", "path": "/x"}]
    assert (isolated_data_dir / "restart_pending").exists()


def test_creates_single_generation_backup(tmp_path, isolated_data_dir):
    target = tmp_path / "drives.json"
    target.write_text('[{"name":"old","path":"/a"}]\n')

    atomic_write_json(target, [{"name": "new", "path": "/b"}])

    bak = tmp_path / "drives.json.bak"
    assert bak.exists()
    assert json.loads(bak.read_text()) == [{"name": "old", "path": "/a"}]
    assert json.loads(target.read_text()) == [{"name": "new", "path": "/b"}]


def test_falls_back_to_in_place_write_when_replace_returns_ebusy(
    tmp_path, isolated_data_dir, monkeypatch
):
    """Simulate a bind-mounted single-file destination.

    On Linux ``rename(2)`` over a bind-mount target raises EBUSY. The writer
    must catch that and rewrite the destination in place, preserving the
    .bak safety net.
    """
    target = tmp_path / "drives.json"
    target.write_text('[{"name":"old","path":"/a"}]\n')

    real_replace = os.replace
    calls = {"replace": 0}

    def fake_replace(src, dst):
        calls["replace"] += 1
        # Only the first call (config_writer's main attempt) raises EBUSY.
        # Any subsequent rename (e.g. inside json.dump) goes through.
        raise OSError(errno.EBUSY, "Device or resource busy", str(dst))

    monkeypatch.setattr("app.services.config_writer.os.replace", fake_replace)

    atomic_write_json(target, [{"name": "new", "path": "/b"}])

    assert calls["replace"] == 1
    assert json.loads(target.read_text()) == [{"name": "new", "path": "/b"}]
    # .tmp must be cleaned up after fallback
    assert not (tmp_path / "drives.json.tmp").exists()
    # .bak preserved as recovery point
    bak = tmp_path / "drives.json.bak"
    assert bak.exists()
    assert json.loads(bak.read_text()) == [{"name": "old", "path": "/a"}]


def test_non_ebusy_oserror_is_not_swallowed(tmp_path, isolated_data_dir, monkeypatch):
    """EACCES and other OSErrors must still propagate (not be silently retried)."""
    target = tmp_path / "drives.json"
    target.write_text('[{"name":"old","path":"/a"}]\n')

    def fake_replace(src, dst):
        raise OSError(errno.EACCES, "Permission denied", str(dst))

    monkeypatch.setattr("app.services.config_writer.os.replace", fake_replace)

    with pytest.raises(OSError) as exc_info:
        atomic_write_json(target, [{"name": "new", "path": "/b"}])

    assert exc_info.value.errno == errno.EACCES
    # Original file untouched, .tmp cleaned up
    assert json.loads(target.read_text()) == [{"name": "old", "path": "/a"}]
    assert not (tmp_path / "drives.json.tmp").exists()


def test_skips_restart_pending_flag_when_opted_out(tmp_path, isolated_data_dir):
    target = tmp_path / "drives.json"
    atomic_write_json(target, [{"name": "x", "path": "/x"}], touch_restart_pending=False)
    assert not (isolated_data_dir / "restart_pending").exists()
