"""Addon `navigation` metadata through both registration paths to /api/addons/status."""

import json

import pytest

from app.services import addon_registry

VALID_NAV = {
    "label": "Notes",
    "i18n_key": "navaddon.nav.label",
    "icon": "notebook-pen",
    "placement": "primary",
    "priority": 20,
}

INVALID_NAVS = [
    pytest.param({**VALID_NAV, "placement": "views"}, id="placement-out-of-range"),
    pytest.param({k: v for k, v in VALID_NAV.items() if k != "placement"}, id="placement-missing"),
    pytest.param({k: v for k, v in VALID_NAV.items() if k != "label"}, id="label-missing"),
    pytest.param({**VALID_NAV, "label": ""}, id="label-empty"),
    pytest.param({**VALID_NAV, "label": "   "}, id="label-blank"),
    pytest.param({**VALID_NAV, "label": 5}, id="label-not-string"),
    pytest.param({k: v for k, v in VALID_NAV.items() if k != "priority"}, id="priority-missing"),
    pytest.param({**VALID_NAV, "priority": True}, id="priority-bool"),
    pytest.param({**VALID_NAV, "priority": 1.5}, id="priority-float"),
    pytest.param({**VALID_NAV, "priority": "10"}, id="priority-string"),
    pytest.param({**VALID_NAV, "i18n_key": 3}, id="i18n-key-not-string"),
    pytest.param({**VALID_NAV, "icon": ["rss"]}, id="icon-not-string"),
    pytest.param(["primary"], id="not-an-object-list"),
    pytest.param("primary", id="not-an-object-string"),
    pytest.param(None, id="not-an-object-null"),
]


def _meta(name: str, **extra):
    return {
        "label": f"{name} product",
        "icon": "package",
        "scope": "drive",
        "href": f"/drive/{{drive}}/addons/{name}",
        "slots": {
            "file-detail-sections": [{"id": f"{name}-section", "label": "S", "priority": 10}],
        },
        **extra,
    }


@pytest.fixture
def registry():
    snap = dict(addon_registry._registry)
    addon_registry._registry.clear()
    yield addon_registry._registry
    addon_registry._registry.clear()
    addon_registry._registry.update(snap)


@pytest.fixture
def manifests(tmp_path, monkeypatch):
    """Write manifest.json files and load them through load_external_manifests."""
    root = tmp_path / "manifests"

    def load(**metas):
        paths = []
        for name, meta in metas.items():
            path = root / name / "manifest.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(meta))
            paths.append(path)
        monkeypatch.setattr(addon_registry, "_iter_manifest_files", lambda: paths)
        addon_registry.load_external_manifests()

    return load


def _register(path: str, manifests, **metas):
    if path == "manifest":
        manifests(**metas)
    else:
        for name, meta in metas.items():
            assert addon_registry.register_in_process(name, meta) is True


PATHS = ["manifest", "in_process"]


@pytest.mark.parametrize("path", PATHS)
def test_valid_navigation_reaches_the_catalogue_unchanged(client, registry, manifests, path):
    c, _, _, _ = client
    _register(path, manifests, navaddon=_meta("navaddon", navigation=VALID_NAV))

    body = c.get("/api/addons/status").json()

    assert body["addons"]["navaddon"]["navigation"] == VALID_NAV


@pytest.mark.parametrize("path", PATHS)
def test_navigation_keeps_keys_the_host_does_not_validate(client, registry, manifests, path):
    c, _, _, _ = client
    nav = {**VALID_NAV, "future_field": {"anything": 1}}
    _register(path, manifests, navaddon=_meta("navaddon", navigation=nav))

    body = c.get("/api/addons/status").json()

    assert body["addons"]["navaddon"]["navigation"] == nav


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("nav", INVALID_NAVS)
def test_invalid_navigation_drops_only_the_navigation(client, registry, manifests, path, nav):
    c, _, _, _ = client
    _register(
        path,
        manifests,
        badnav=_meta("badnav", navigation=nav),
        goodnav=_meta("goodnav", navigation=VALID_NAV),
    )

    body = c.get("/api/addons/status").json()

    bad = body["addons"]["badnav"]
    assert "navigation" not in bad
    assert bad["label"] == "badnav product"
    assert bad["href"] == "/drive/{drive}/addons/badnav"
    section_owners = [e["addonName"] for e in body["slots"]["file-detail-sections"]]
    assert sorted(section_owners) == ["badnav", "goodnav"]
    assert body["addons"]["goodnav"]["navigation"] == VALID_NAV


@pytest.mark.parametrize("nav", INVALID_NAVS)
def test_invalid_navigation_keeps_the_external_proxy(registry, manifests, nav):
    proxy = {"target_env": "BADNAV_URL", "target_default": "http://badnav:1", "routes": []}
    manifests(badnav=_meta("badnav", navigation=nav, proxy=proxy))

    assert addon_registry.get_external_addons()["badnav"]["proxy"] == proxy


@pytest.mark.parametrize("path", PATHS)
def test_absent_navigation_adds_no_key(client, registry, manifests, path):
    c, _, _, _ = client
    _register(path, manifests, plain=_meta("plain"))

    body = c.get("/api/addons/status").json()

    assert "navigation" not in body["addons"]["plain"]


def test_invalid_navigation_does_not_alter_the_callers_meta(registry):
    meta = _meta("badnav", navigation={**VALID_NAV, "placement": "views"})
    snapshot = json.loads(json.dumps(meta))

    addon_registry.register_in_process("badnav", meta)

    assert meta == snapshot


@pytest.mark.parametrize("path", PATHS)
def test_drive_policy_still_governs_navigation(client, registry, manifests, path):
    import app.config as config

    c, _, _, _ = client
    drives = json.loads(config.DRIVES_CONFIG.read_text())
    base = drives[0]["path"]
    config.DRIVES_CONFIG.write_text(json.dumps([
        {"name": "on", "path": base, "addons": {"navaddon": True}},
        {"name": "off", "path": base, "addons": {"navaddon": False}},
    ]))
    config._drives_cache = None
    _register(path, manifests, navaddon=_meta("navaddon", navigation=VALID_NAV))

    on = c.get("/api/addons/status", params={"drive": "on"}).json()
    off = c.get("/api/addons/status", params={"drive": "off"}).json()
    unknown = c.get("/api/addons/status", params={"drive": "nowhere"}).json()

    assert on["addons"]["navaddon"]["navigation"] == VALID_NAV
    assert "navaddon" not in off["addons"]
    assert unknown == {"addons": {}, "slots": {}}


def test_internal_fields_stay_out_alongside_navigation(client, registry, manifests, monkeypatch):
    c, _, _, _ = client
    monkeypatch.setenv("NAVSVC_URL", "http://navsvc:1")
    proxy = {"target_env": "NAVSVC_URL", "target_default": "http://navsvc:1", "routes": []}
    manifests(navsvc=_meta("navsvc", navigation=VALID_NAV, proxy=proxy, health_check="/health"))

    entry = c.get("/api/addons/status").json()["addons"]["navsvc"]

    assert sorted(entry) == ["href", "icon", "label", "navigation", "scope", "slots", "type"]
