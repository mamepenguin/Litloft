"""Generic addon proxy — drive-scope enforcement.

Covers the scope=drive behaviour added for drive-scoped addons
(originally motivated by the knowledge addon).

What we guard:
- scope=drive addons require ``X-Lit-Drive`` → 400 otherwise
- scope=drive addons reject inaccessible drives → 403
- scope=global addons ignore the header (back-compat)
- When allowed, ``X-Lit-Drive`` is forwarded to the upstream addon

We stub httpx.AsyncClient so no real network calls happen.
"""
from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from app.services import addon_registry


class _StubResponse:
    def __init__(self, status_code: int = 200, json_body: dict | None = None):
        self.status_code = status_code
        self._json = json_body or {"ok": True}
        self.headers = httpx.Headers({"content-type": "application/json"})
        self.text = ""

    def json(self) -> dict:
        return self._json

    def raise_for_status(self) -> None:
        if self.status_code >= 500:
            raise httpx.HTTPStatusError(
                "upstream", request=None, response=None  # type: ignore[arg-type]
            )


class _CapturingClient:
    """Captures outbound requests so tests can assert on forwarded headers."""

    last_request: dict[str, Any] = {}

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    async def request(
        self,
        *,
        method: str,
        url: str,
        params: dict,
        content: Any,
        headers: dict,
    ) -> _StubResponse:
        _CapturingClient.last_request = {
            "method": method,
            "url": url,
            "params": params,
            "headers": headers,
        }
        return _StubResponse()


@pytest.fixture()
def drive_scope_addon(monkeypatch):
    """Register a minimal scope=drive addon manifest and swap the HTTP
    client so proxy calls don't touch the network."""
    meta = {
        "label": "Test",
        "icon": "notebook-pen",
        "type": "external_service",
        "scope": "drive",
        "href": "/drive/{drive}/addons/_test",
        "proxy": {
            "target_env": "_NONEXISTENT_ENV",
            "target_default": "http://_test:9999",
            "routes": [{"path": "/ping", "methods": ["GET"]}],
        },
    }
    prev = addon_registry._registry.get("_test")
    addon_registry._registry["_test"] = meta

    import app.routers.addon_proxy as proxy_module
    monkeypatch.setattr(proxy_module.httpx, "AsyncClient", _CapturingClient)
    _CapturingClient.last_request = {}

    yield meta

    if prev is None:
        addon_registry._registry.pop("_test", None)
    else:
        addon_registry._registry["_test"] = prev


@pytest.fixture()
def global_scope_addon(monkeypatch):
    meta = {
        "label": "Test Global",
        "icon": "notebook-pen",
        "type": "external_service",
        "scope": "global",
        "href": "/addons/_testg",
        "proxy": {
            "target_env": "_NONEXISTENT_ENV",
            "target_default": "http://_testg:9999",
            "routes": [{"path": "/ping", "methods": ["GET"]}],
        },
    }
    prev = addon_registry._registry.get("_testg")
    addon_registry._registry["_testg"] = meta

    import app.routers.addon_proxy as proxy_module
    monkeypatch.setattr(proxy_module.httpx, "AsyncClient", _CapturingClient)
    _CapturingClient.last_request = {}

    yield meta

    if prev is None:
        addon_registry._registry.pop("_testg", None)
    else:
        addon_registry._registry["_testg"] = prev


def test_drive_scope_requires_header(client, drive_scope_addon):
    c, _s, _d, _dat = client
    r = c.get("/api/addons/_test/ping")
    assert r.status_code == 400


def test_drive_scope_rejects_inaccessible_drive(client, drive_scope_addon):
    c, _s, _d, _dat = client
    r = c.get(
        "/api/addons/_test/ping",
        headers={"X-Lit-Drive": "does-not-exist"},
    )
    assert r.status_code == 403


def test_drive_scope_forwards_header_on_accessible_drive(
    client, drive_scope_addon
):
    c, _s, _d, _dat = client
    r = c.get(
        "/api/addons/_test/ping",
        headers={"X-Lit-Drive": "test-drive"},
    )
    assert r.status_code == 200
    forwarded = _CapturingClient.last_request["headers"]
    # Header names are lowercased by httpx/starlette depending on source;
    # compare case-insensitively.
    lowered = {k.lower(): v for k, v in forwarded.items()}
    assert lowered.get("x-lit-drive") == "test-drive"


def test_global_scope_does_not_require_header(client, global_scope_addon):
    c, _s, _d, _dat = client
    r = c.get("/api/addons/_testg/ping")
    assert r.status_code == 200


def test_global_scope_still_validates_drive_if_provided(
    client, global_scope_addon
):
    """Even for scope=global addons, an explicit (bogus) drive header
    must be rejected — otherwise a global addon becomes a drive-access
    bypass."""
    c, _s, _d, _dat = client
    r = c.get(
        "/api/addons/_testg/ping",
        headers={"X-Lit-Drive": "does-not-exist"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# current_drive_only response filter
# ---------------------------------------------------------------------------


class _JsonClient:
    """Captures requests and returns a configurable JSON body."""

    last_request: dict[str, Any] = {}
    next_body: dict[str, Any] = {}

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    async def request(self, *, method, url, params, content, headers):
        _JsonClient.last_request = {
            "method": method, "url": url, "headers": headers,
        }

        class _R:
            status_code = 200
            text = ""
            headers = httpx.Headers({"content-type": "application/json"})
            def json(self_inner):
                return _JsonClient.next_body
            def raise_for_status(self_inner):
                pass

        return _R()


@pytest.fixture()
def filter_addon(monkeypatch):
    meta = {
        "label": "Filter",
        "icon": "search",
        "type": "external_service",
        "scope": "drive",
        "href": "/drive/{drive}/addons/_filter",
        "proxy": {
            "target_default": "http://_filter:9999",
            "routes": [
                {
                    "path": "/search",
                    "methods": ["GET"],
                    "response_filter": {
                        "type": "current_drive_only",
                        "array_path": "results",
                        "drive_field": "drive",
                    },
                },
                {
                    "path": "/ask",
                    "methods": ["POST"],
                    "response_filter": {
                        "type": "current_drive_only_nested",
                        "paths": {"citations": "drive"},
                    },
                },
                {
                    "path": "/heavy",
                    "methods": ["GET"],
                    "pre_check": {
                        "type": "addon_feature",
                        "feature": "rag",
                    },
                },
                {
                    "path": "/files/{file_id}/candidate",
                    "methods": ["GET"],
                    "pre_check": {
                        "type": "file_access",
                        "param": "file_id",
                    },
                    "addon_feature": "candidate_generation",
                },
            ],
        },
    }
    prev = addon_registry._registry.get("_filter")
    addon_registry._registry["_filter"] = meta
    import app.routers.addon_proxy as proxy_module
    monkeypatch.setattr(proxy_module.httpx, "AsyncClient", _JsonClient)
    yield meta
    if prev is None:
        addon_registry._registry.pop("_filter", None)
    else:
        addon_registry._registry["_filter"] = prev


def test_current_drive_only_strips_other_drives(client, filter_addon):
    c, _s, _d, _dat = client
    _JsonClient.next_body = {
        "results": [
            {"id": "a", "drive": "test-drive"},
            {"id": "b", "drive": "other-drive"},
        ],
        "total": 2,
    }
    r = c.get(
        "/api/addons/_filter/search",
        headers={"X-Lit-Drive": "test-drive"},
    )
    assert r.status_code == 200
    body = r.json()
    assert [item["id"] for item in body["results"]] == ["a"]
    assert body["total"] == 1


def test_current_drive_only_nested_strips_other_drives(client, filter_addon):
    c, _s, _d, _dat = client
    _JsonClient.next_body = {
        "answer": "...",
        "citations": [
            {"id": "1", "drive": "test-drive"},
            {"id": "2", "drive": "other-drive"},
        ],
    }
    r = c.post(
        "/api/addons/_filter/ask",
        headers={"X-Lit-Drive": "test-drive"},
        json={"q": "hi"},
    )
    assert r.status_code == 200
    cits = r.json()["citations"]
    assert len(cits) == 1
    assert cits[0]["drive"] == "test-drive"


def test_addon_feature_pre_check_404_when_disabled(
    client, filter_addon, monkeypatch
):
    """When the per-drive policy disables a feature, the route 404s without
    revealing whether it exists."""
    import app.config as config

    def fake(drive, addon, feature):
        return not (addon == "_filter" and feature == "rag")

    monkeypatch.setattr(config, "is_addon_feature_enabled", fake)
    c, _s, _d, _dat = client
    r = c.get(
        "/api/addons/_filter/heavy",
        headers={"X-Lit-Drive": "test-drive"},
    )
    assert r.status_code == 404


def test_addon_feature_pre_check_passes_when_enabled(client, filter_addon):
    c, _s, _d, _dat = client
    _JsonClient.next_body = {"ok": True}
    r = c.get(
        "/api/addons/_filter/heavy",
        headers={"X-Lit-Drive": "test-drive"},
    )
    assert r.status_code == 200


def test_route_addon_feature_composes_with_file_access(
    client, filter_addon, monkeypatch
):
    """A file route can require both file access and a feature policy gate."""
    import app.config as config
    from app.models import File

    c, session, _drive_dir, _data_dir = client
    _JsonClient.last_request = {}
    session.add(File(
        id="file00000001",
        filename="talk.mp4",
        title="talk.mp4",
        drive="test-drive",
        file_path="talk.mp4",
        file_size=1,
        file_type="video",
        mime_type="video/mp4",
    ))
    session.commit()

    monkeypatch.setattr(
        config,
        "is_addon_feature_enabled",
        lambda drive, addon, feature: feature != "candidate_generation",
    )
    denied = c.get(
        "/api/addons/_filter/files/file00000001/candidate",
        headers={"X-Lit-Drive": "test-drive"},
    )
    assert denied.status_code == 404
    assert _JsonClient.last_request == {}

    monkeypatch.setattr(
        config,
        "is_addon_feature_enabled",
        lambda _drive, _addon, _feature: True,
    )
    allowed = c.get(
        "/api/addons/_filter/files/file00000001/candidate",
        headers={"X-Lit-Drive": "test-drive"},
    )
    assert allowed.status_code == 200


def test_file_feature_policy_cannot_use_a_different_drive_header(
    client, filter_addon, monkeypatch
):
    import app.config as config
    from app.models import File

    c, session, drive_dir, _data_dir = client
    other_dir = drive_dir.parent / "other"
    other_dir.mkdir()
    config.DRIVES_CONFIG.write_text(json.dumps([
        {"name": "test-drive", "path": str(drive_dir)},
        {"name": "other-drive", "path": str(other_dir)},
    ]))
    config._drives_cache = None
    session.add(File(
        id="file00000002",
        filename="private.mp4",
        title="private.mp4",
        drive="other-drive",
        file_path="private.mp4",
        file_size=1,
        file_type="video",
        mime_type="video/mp4",
    ))
    session.commit()
    monkeypatch.setattr(
        config,
        "is_addon_feature_enabled",
        lambda drive, _addon, _feature: drive == "test-drive",
    )

    response = c.get(
        "/api/addons/_filter/files/file00000002/candidate",
        headers={"X-Lit-Drive": "test-drive"},
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Per-route timeout override
# ---------------------------------------------------------------------------


class _TimeoutCapturingClient:
    """Records the ``timeout`` kwarg AsyncClient was constructed with."""

    last_timeout: float | None = None

    def __init__(self, *a, **kw):
        _TimeoutCapturingClient.last_timeout = kw.get("timeout")

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    async def request(self, *, method, url, params, content, headers):
        class _R:
            status_code = 200
            text = ""
            headers = httpx.Headers({"content-type": "application/json"})
            def json(self_inner):
                return {"ok": True}
            def raise_for_status(self_inner):
                pass

        return _R()


@pytest.fixture()
def timeout_addon(monkeypatch):
    meta = {
        "label": "Timeout",
        "icon": "clock",
        "type": "external_service",
        "scope": "drive",
        "href": "/drive/{drive}/addons/_timeout",
        "proxy": {
            "target_default": "http://_timeout:9999",
            "routes": [
                {"path": "/quick", "methods": ["GET"]},
                {"path": "/slow", "methods": ["GET"], "timeout": 90},
            ],
        },
    }
    prev = addon_registry._registry.get("_timeout")
    addon_registry._registry["_timeout"] = meta
    import app.routers.addon_proxy as proxy_module
    monkeypatch.setattr(
        proxy_module.httpx, "AsyncClient", _TimeoutCapturingClient
    )
    _TimeoutCapturingClient.last_timeout = None
    yield meta
    if prev is None:
        addon_registry._registry.pop("_timeout", None)
    else:
        addon_registry._registry["_timeout"] = prev


def test_route_without_timeout_uses_default_15s(client, timeout_addon):
    c, _s, _d, _dat = client
    r = c.get(
        "/api/addons/_timeout/quick",
        headers={"X-Lit-Drive": "test-drive"},
    )
    assert r.status_code == 200
    assert _TimeoutCapturingClient.last_timeout == 15.0


def test_route_with_timeout_overrides_default(client, timeout_addon):
    c, _s, _d, _dat = client
    r = c.get(
        "/api/addons/_timeout/slow",
        headers={"X-Lit-Drive": "test-drive"},
    )
    assert r.status_code == 200
    assert _TimeoutCapturingClient.last_timeout == 90.0
