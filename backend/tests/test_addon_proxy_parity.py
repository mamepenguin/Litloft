"""Two rules the addon proxy applies without the dependency that owns them.

``addon_proxy`` runs from a plain handler rather than a FastAPI dependency, so
it reaches two decisions that ``app.auth`` also makes: who counts as an admin,
and what a viewer nickname resolves to. **The two are not the same shape, and
the tests below are not the same kind.**

*The nickname rule is genuinely duplicated.* ``_resolve_viewer_id`` re-does the
trim-and-cap that ``auth._nickname_from_raw`` does, because the proxy runs
outside the dependency that would have called it. Duplicated rules drift, and
this project already keeps two ``frontmatter.py`` parsers and two
``credentials.py`` in step by review alone. So **each implementation is checked
against a declared table, not against the other one**: comparing them directly
goes green when both are wrong the same way, which is the likely failure since
the second copy is written by reading the first. The value the rule turns on —
the cap — is written here rather than imported from either side, so moving
either copy fails instead of agreeing with the test.

*The admin rule is called, not copied.* ``addon_proxy`` imports ``is_admin``
from ``app.auth``; there is one implementation and nothing to drift. What
``TestAdminRule`` holds is therefore two other things, both real: that the proxy
still calls it, with the caller's groups, at that route (the call site can break
on its own), and that ``ADMIN_CASES`` pins what ``is_admin`` means. Breaking
``is_admin`` fails both halves at once, which is the signature of one
implementation read twice — and is why this half is not described as parity.
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from app.services import addon_registry

ADDON = "_parity"
OPEN_DRIVE = "open-drive"
SECRET_DRIVE = "secret-drive"

#: The cap both implementations apply to a nickname before hashing it. Declared
#: here rather than imported from either, so that changing one of them is a
#: failure rather than a silent agreement with the test.
NICKNAME_MAX_LENGTH = 50

#: raw cookie/header value -> is it a viewer, and under what nickname.
#: ``None`` means "no viewer"; a string is the nickname that must be hashed.
#: ASCII only: header values are ISO-8859-1, which is why this codebase
#: percent-encodes ``X-Lit-Drive``. A non-ASCII nickname would be testing the
#: transport rather than the rule.
NICKNAME_CASES: list[tuple[str | None, str | None]] = [
    (None, None),
    ("", None),
    ("   ", None),
    ("\t\n", None),
    ("ren", "ren"),
    ("  ren  ", "ren"),
    ("Ren Amamiya", "Ren Amamiya"),
    ("a" * NICKNAME_MAX_LENGTH, "a" * NICKNAME_MAX_LENGTH),
    ("a" * (NICKNAME_MAX_LENGTH + 1), None),
    (" " + "a" * NICKNAME_MAX_LENGTH + " ", "a" * NICKNAME_MAX_LENGTH),
    ("a" * 200, None),
]


def _expected_viewer_id(nickname: str | None) -> str | None:
    """The id a nickname must produce, derived from the declaration above.

    Hashing is not the rule under test — which inputs count as a viewer, and
    what they are trimmed to, is. So this reuses the one hash function both
    sides call and varies only its input.
    """
    from app.auth import nickname_to_viewer_id

    return None if nickname is None else nickname_to_viewer_id(nickname)


class _SpyClient:
    calls: list[dict] = []

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    async def request(self, **kwargs):
        _SpyClient.calls.append(kwargs)

        class _R:
            status_code = 200
            headers = httpx.Headers({"content-type": "application/json"})
            text = ""

            def json(self_inner):
                return {"ok": True}

            def raise_for_status(self_inner):
                return None

        return _R()


@pytest.fixture()
def parity_client(client, tmp_path: Path, monkeypatch):
    """A proxied addon, one public drive, one protected group."""
    import app.auth as auth
    import app.config as config
    import app.routers.addon_proxy as proxy_module

    c, _session, drive_dir, _data = client

    secret_dir = tmp_path / "drives" / "secret"
    secret_dir.mkdir(parents=True, exist_ok=True)
    drives_path = tmp_path / "drives.json"
    drives_path.write_text(json.dumps([
        {"name": OPEN_DRIVE, "path": str(drive_dir)},
        {"name": SECRET_DRIVE, "path": str(secret_dir), "access_group": "vip"},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_path)
    monkeypatch.setattr(config, "_drives_cache", None)

    passwords_path = tmp_path / "passwords.json"
    passwords_path.write_text(json.dumps([
        {"password": "vippass", "groups": ["vip"]},
    ]))
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_path)
    monkeypatch.setattr(auth, "_passwords_cache", None)
    monkeypatch.setattr(auth, "_jwt_secret", "test-jwt-secret")

    addon_registry._registry[ADDON] = {
        "label": "Parity", "icon": "x", "type": "external_service",
        "scope": "global",
        "href": "/addons/_parity",
        "proxy": {
            "target_default": "http://_parity:9999",
            "routes": [
                {"path": "/echo", "methods": ["GET"]},
                {"path": "/admin-only", "methods": ["GET"],
                 "pre_check": {"type": "admin"}},
            ],
        },
    }
    monkeypatch.setattr(proxy_module.httpx, "AsyncClient", _SpyClient)
    _SpyClient.calls = []
    yield c
    addon_registry._registry.pop(ADDON, None)


class TestNicknameRule:
    """Which nicknames become a viewer, on both sides of the Docker boundary."""

    @pytest.mark.parametrize("raw,nickname", NICKNAME_CASES)
    def test_the_host_helper_follows_the_declaration(self, raw, nickname):
        from starlette.datastructures import Headers
        from starlette.requests import Request

        from app.auth import get_viewer_id

        headers = [] if raw is None else [(b"x-lit-viewer", raw.encode("utf-8"))]
        request = Request({"type": "http", "headers": headers, "method": "GET",
                           "path": "/", "query_string": b""})
        assert get_viewer_id(request) == _expected_viewer_id(nickname)

    @pytest.mark.parametrize("raw,nickname", NICKNAME_CASES)
    def test_the_proxy_forwards_what_the_declaration_says(
        self, parity_client, raw, nickname
    ):
        """The proxy's copy, exercised through a real request.

        ``X-Lit-Viewer-Id`` is present upstream exactly when the declaration
        says the raw value is a viewer, and carries the same id.
        """
        headers = {} if raw is None else {"X-Lit-Viewer": raw}
        _SpyClient.calls = []

        response = parity_client.get(f"/api/addons/{ADDON}/echo", headers=headers)

        assert response.status_code == 200
        forwarded = _SpyClient.calls[0]["headers"]
        sent = {k.lower(): v for k, v in forwarded.items()}.get("x-lit-viewer-id")
        assert sent == _expected_viewer_id(nickname)


#: unlocked groups -> is this caller an admin. ``vip`` is the only protected
#: group in the fixture, so holding it is holding all of them.
ADMIN_CASES: list[tuple[list[str], bool]] = [
    ([], False),
    (["other"], False),
    (["vip"], True),
    (["vip", "other"], True),
]


class TestAdminRule:
    """The admin gate: what it means, and that the proxy still asks it."""

    @pytest.mark.parametrize("groups,is_admin_expected", ADMIN_CASES)
    def test_the_host_predicate_follows_the_declaration(
        self, parity_client, groups, is_admin_expected
    ):
        from app.auth import is_admin

        assert is_admin(groups) is is_admin_expected

    @pytest.mark.parametrize("groups,is_admin_expected", ADMIN_CASES)
    def test_the_proxy_gate_agrees_through_a_real_request(
        self, parity_client, groups, is_admin_expected
    ):
        """The proxy's call site, not a second implementation.

        ``is_admin`` is imported, so this cannot disagree with the host over
        the predicate. What it can catch is the proxy ceasing to call it,
        calling it with the wrong groups, or refusing with the wrong status.
        """
        from app.auth import get_unlocked_groups
        from app.main import app

        # ``get_unlocked_groups`` reaches the handler through ``Depends``,
        # which FastAPI resolved when the route was registered — patching the
        # module attribute is a no-op here and the gate would look closed for
        # every case.
        app.dependency_overrides[get_unlocked_groups] = lambda: groups
        try:
            response = parity_client.get(f"/api/addons/{ADDON}/admin-only")
        finally:
            app.dependency_overrides.pop(get_unlocked_groups, None)

        assert (response.status_code == 200) is is_admin_expected
        if not is_admin_expected:
            assert response.status_code == 403
