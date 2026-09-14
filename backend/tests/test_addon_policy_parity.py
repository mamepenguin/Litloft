"""`is_addon_feature_enabled` against the table the settings screens read too.

`/setup` and `/admin/settings` draw a switch per drive and addon, and the
switch is only honest if it answers the question the backend answers. The two
cannot share code, so they share a table.
"""

import json
from pathlib import Path

import pytest

import app.config as config

FIXTURE = Path(__file__).parent / "fixtures" / "addon_policy.json"
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


def test_the_whole_table_is_read():
    assert len(CASES) == 9


@pytest.fixture
def drive_with(monkeypatch):
    def _set(addons):
        drive = {"name": "d", "path": "/tmp/d"}
        if addons is not None:
            drive["addons"] = addons
        monkeypatch.setattr(config, "load_drives", lambda: [drive])

    return _set


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_matches_the_shared_table(case, drive_with):
    drive_with(case["addons"])
    assert config.is_addon_feature_enabled("d", "knowledge", "index") is case["on"]
    for feature, expected in case["features"].items():
        assert config.is_addon_feature_enabled("d", "knowledge", feature) is expected
