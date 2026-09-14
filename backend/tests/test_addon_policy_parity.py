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


@pytest.fixture
def knowledge_registered():
    from app.services import addon_registry

    snap = dict(addon_registry._registry)
    addon_registry._registry.clear()
    assert addon_registry.register_in_process(
        "knowledge",
        {"label": "Knowledge", "icon": "package", "scope": "drive", "href": "/k"},
    )
    yield
    addon_registry._registry.clear()
    addon_registry._registry.update(snap)


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_the_catalogue_lists_the_addon_exactly_when_the_table_says_on(
    case, client, knowledge_registered
):
    c, _, _, _ = client
    base = json.loads(config.DRIVES_CONFIG.read_text())[0]["path"]
    drive = {"name": "d", "path": base}
    if case["addons"] is not None:
        drive["addons"] = case["addons"]
    config.DRIVES_CONFIG.write_text(json.dumps([drive]))
    config._drives_cache = None

    listed = c.get("/api/addons/status", params={"drive": "d"}).json()["addons"]

    assert ("knowledge" in listed) is case["on"]
