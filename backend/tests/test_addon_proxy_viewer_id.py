"""Generic addon proxy — X-Lit-Viewer-Id header injection.

When a request arrives with the ``lit_viewer`` cookie (the host's
nickname-as-cookie identity carrier), the proxy must:

* hash the nickname to a 16-char SHA-256 prefix server-side,
* set ``X-Lit-Viewer-Id`` on the upstream request to that hash,
* drop any client-supplied ``X-Lit-Viewer-Id`` header so a malicious
  page cannot impersonate another viewer by spoofing the header.

Without the cookie the header must be absent (the addon will then
treat the caller as "no profile" and run the legacy viewer-agnostic
path).
"""
from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.auth import nickname_to_viewer_id
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
        return None


class _CapturingClient:
    """Same shape as the helper in test_addon_proxy_drive_scope.py."""

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
def global_scope_addon(monkeypatch):
    """Minimal scope=global addon so we don't have to fight drive checks."""
    meta = {
        "label": "Test Global",
        "icon": "notebook-pen",
        "type": "external_service",
        "scope": "global",
        "href": "/addons/_vid",
        "proxy": {
            "target_env": "_NONEXISTENT_ENV",
            "target_default": "http://_vid:9999",
            "routes": [{"path": "/ping", "methods": ["GET"]}],
        },
    }
    prev = addon_registry._registry.get("_vid")
    addon_registry._registry["_vid"] = meta

    import app.routers.addon_proxy as proxy_module
    monkeypatch.setattr(proxy_module.httpx, "AsyncClient", _CapturingClient)
    _CapturingClient.last_request = {}

    yield meta

    if prev is None:
        addon_registry._registry.pop("_vid", None)
    else:
        addon_registry._registry["_vid"] = prev


def _forwarded_header(name: str) -> str | None:
    """Read a header from the last captured upstream request."""
    headers = _CapturingClient.last_request.get("headers") or {}
    lowered = {k.lower(): v for k, v in headers.items()}
    return lowered.get(name.lower())


def test_viewer_id_header_set_from_cookie(client, global_scope_addon):
    c, _s, _d, _dat = client
    nickname = "alice"
    c.cookies.set("lit_viewer", nickname)
    r = c.get("/api/addons/_vid/ping")
    assert r.status_code == 200
    forwarded = _forwarded_header("x-lit-viewer-id")
    assert forwarded == nickname_to_viewer_id(nickname)


def test_viewer_id_header_set_from_inbound_viewer_header(
    client, global_scope_addon
):
    c, _s, _d, _dat = client
    r = c.get("/api/addons/_vid/ping", headers={"X-Lit-Viewer": "alice"})
    assert r.status_code == 200
    forwarded = _forwarded_header("x-lit-viewer-id")
    assert forwarded == nickname_to_viewer_id("alice")
    assert _forwarded_header("x-lit-viewer") is None


def test_cookie_takes_priority_over_inbound_viewer_header(
    client, global_scope_addon
):
    c, _s, _d, _dat = client
    c.cookies.set("lit_viewer", "alice")
    r = c.get("/api/addons/_vid/ping", headers={"X-Lit-Viewer": "bob"})
    assert r.status_code == 200
    forwarded = _forwarded_header("x-lit-viewer-id")
    assert forwarded == nickname_to_viewer_id("alice")
    assert _forwarded_header("x-lit-viewer") is None


def test_viewer_id_header_absent_without_cookie(client, global_scope_addon):
    c, _s, _d, _dat = client
    r = c.get("/api/addons/_vid/ping")
    assert r.status_code == 200
    assert _forwarded_header("x-lit-viewer-id") is None


def test_client_supplied_header_is_overridden(client, global_scope_addon):
    """A malicious client setting X-Lit-Viewer-Id directly must be ignored.

    Without the override the cookie path would still set the right
    header, but the spoofed value would also reach the addon — at best
    confusing it, at worst letting the attacker pin another viewer's
    history. The proxy strips the inbound header before injecting the
    cookie-derived one.
    """
    c, _s, _d, _dat = client
    c.cookies.set("lit_viewer", "alice")
    r = c.get(
        "/api/addons/_vid/ping",
        headers={"X-Lit-Viewer-Id": "0000000000000000"},
    )
    assert r.status_code == 200
    forwarded = _forwarded_header("x-lit-viewer-id")
    assert forwarded == nickname_to_viewer_id("alice")


def test_client_supplied_header_dropped_without_cookie(
    client, global_scope_addon
):
    """No cookie + client-supplied header → header dropped entirely."""
    c, _s, _d, _dat = client
    r = c.get(
        "/api/addons/_vid/ping",
        headers={"X-Lit-Viewer-Id": "deadbeefdeadbeef"},
    )
    assert r.status_code == 200
    assert _forwarded_header("x-lit-viewer-id") is None


def test_overlong_nickname_drops_header(client, global_scope_addon):
    """Cookie longer than the auth helper's 50-char cap is treated as
    no viewer (mirrors ``app.auth.get_viewer_id``)."""
    c, _s, _d, _dat = client
    c.cookies.set("lit_viewer", "x" * 100)
    r = c.get("/api/addons/_vid/ping")
    assert r.status_code == 200
    assert _forwarded_header("x-lit-viewer-id") is None


def test_blank_nickname_drops_header(client, global_scope_addon):
    c, _s, _d, _dat = client
    c.cookies.set("lit_viewer", "   ")
    r = c.get("/api/addons/_vid/ping")
    assert r.status_code == 200
    assert _forwarded_header("x-lit-viewer-id") is None
