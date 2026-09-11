"""What the proxy does when a manifest declares a gate it cannot apply.

A manifest is data, written in another repository, and the proxy is what turns
it into authorisation. Two of its declarations can be wrong in a way that
reads as correct: a ``file_access`` pre_check naming a path parameter the
route does not have, and a ``drive_optional`` route that waives the drive
requirement without putting anything in its place.

Both used to fall open. That is worse than an ungated route declared honestly,
because the manifest says the route is protected and a reader checking the
manifest agrees.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services import addon_registry
from tests.test_addon_proxy_file_access import (
    OPEN_DRIVE,
    SECRET_DRIVE,
    _SpyClient,
)

ADDON = "_decl"


def _manifest(route: dict) -> dict:
    return {
        "label": "Decl",
        "icon": "lock",
        "type": "external_service",
        "scope": "drive",
        "href": "/drive/{drive}/addons/_decl",
        "proxy": {
            "target_default": "http://_decl:9999",
            "routes": [route],
        },
    }


@pytest.fixture()
def declaring(client, tmp_path: Path, monkeypatch):
    """Registers whatever route a test asks for, with a file in a locked drive."""
    import app.config as config
    import app.routers.addon_proxy as proxy_module
    from app.models import File

    c, session, drive_dir, _data = client

    secret_dir = tmp_path / "drives" / "secret"
    secret_dir.mkdir(parents=True, exist_ok=True)
    drives_path = tmp_path / "drives.json"
    drives_path.write_text(json.dumps([
        {"name": OPEN_DRIVE, "path": str(drive_dir)},
        {"name": SECRET_DRIVE, "path": str(secret_dir), "access_group": "vip"},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_path)
    monkeypatch.setattr(config, "_drives_cache", None)

    import app.auth as auth

    passwords_path = tmp_path / "passwords.json"
    passwords_path.write_text(json.dumps([
        {"password": "vippass", "groups": ["vip"]},
    ]))
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_path)
    monkeypatch.setattr(auth, "_passwords_cache", None)
    monkeypatch.setattr(auth, "_jwt_secret", "test-jwt-secret")

    session.add(File(
        id="secret000001", filename="s.mp4", title="s", drive=SECRET_DRIVE,
        folder_path="", file_path="s.mp4", file_size=1,
        file_type="video", mime_type="video/mp4",
    ))
    session.commit()

    monkeypatch.setattr(proxy_module.httpx, "AsyncClient", _SpyClient)

    def register(route: dict):
        addon_registry._registry[ADDON] = _manifest(route)
        _SpyClient.calls = []
        return c

    yield register
    addon_registry._registry.pop(ADDON, None)


FILE_ROUTE = {
    "path": "/files/{file_id}/thing",
    "methods": ["GET"],
    "pre_check": {"type": "file_access", "param": "file_id"},
}


class TestMisdeclaredFileAccessParam:
    """A ``param`` the route pattern does not carry."""

    def test_a_matching_param_still_gates(self, declaring):
        """Positive control, and the reason this is not simply "refuse more".

        The declaration is correct here, so the gate has to run and refuse on
        its own terms — a file in a drive the caller cannot open.
        """
        c = declaring(FILE_ROUTE)

        response = c.get(
            f"/api/addons/{ADDON}/files/secret000001/thing",
            headers={"X-Lit-Drive": OPEN_DRIVE},
        )

        assert response.status_code == 404
        assert _SpyClient.calls == []

    def test_a_param_the_route_does_not_have_refuses(self, declaring, caplog):
        """The gate cannot run, so the route is refused rather than served.

        Nothing else would notice: the route resolves, the caller gets 200,
        and the id of a file in a drive they cannot open is handed to the
        addon. The manifest still reads as gated.

        The log line is asserted because it is the only part of this that the
        guard uniquely provides. Falling through would refuse too — a lookup
        of ``File.id == None`` matches nothing — so the status code alone
        cannot tell a deliberate refusal from an accidental one, and only the
        message tells an operator which declaration is wrong.
        """
        route = {**FILE_ROUTE, "pre_check": {"type": "file_access", "param": "fileId"}}
        c = declaring(route)

        with caplog.at_level("ERROR", logger="app.routers.addon_proxy"):
            response = c.get(
                f"/api/addons/{ADDON}/files/secret000001/thing",
                headers={"X-Lit-Drive": OPEN_DRIVE},
            )

        assert response.status_code == 404
        assert _SpyClient.calls == []
        assert any(
            "fileId" in record.getMessage()
            and "/files/{file_id}/thing" in record.getMessage()
            for record in caplog.records
        ), "the misdeclared parameter is not named in any ERROR log"

    def test_the_default_param_name_is_still_honoured(self, declaring):
        """``param`` is optional and defaults to ``file_id``; omitting it on a
        route that has ``{file_id}`` must keep working, not trip the guard."""
        route = {**FILE_ROUTE, "pre_check": {"type": "file_access"}}
        c = declaring(route)

        response = c.get(
            f"/api/addons/{ADDON}/files/secret000001/thing",
            headers={"X-Lit-Drive": OPEN_DRIVE},
        )

        assert response.status_code == 404
        assert _SpyClient.calls == []


class TestDriveOptionalWithoutAGate:
    """``drive_optional`` waives the drive requirement; something must replace it."""

    def test_a_drive_optional_route_with_no_gate_is_refused(self, declaring, caplog):
        """`design-decisions.md` §Addons: drive_optional is for inherently
        global paths whose "authorization is enforced through a separate
        route". A route that declares neither has no separate route, and
        serving it would make the header optional *and* unchecked.

        The log is asserted for the same reason as its sibling above: the
        refusal is a bare 404, so an addon author whose route stopped working
        has nothing to go on unless the message names the declaration.
        """
        c = declaring({
            "path": "/open", "methods": ["GET"], "drive_optional": True,
        })

        with caplog.at_level("ERROR", logger="app.routers.addon_proxy"):
            response = c.get(f"/api/addons/{ADDON}/open")

        assert response.status_code == 404
        assert _SpyClient.calls == []
        assert any(
            "drive_optional" in record.getMessage()
            and "/open" in record.getMessage()
            for record in caplog.records
        ), "the ungated drive_optional route is not named in any ERROR log"

    def test_the_same_route_with_a_gate_is_served(self, declaring):
        """Positive control: the guard must refuse the undeclared case only."""
        c = declaring({
            "path": "/open", "methods": ["GET"], "drive_optional": True,
            "pre_check": {"type": "file_access", "param": "file_id"},
        })

        # Declaring a ``file_access`` pre_check on a path with no ``{file_id}``
        # is the misdeclaration the guard above refuses, so this is the same
        # 404 from a different line rather than a contrast. It is here to show
        # the two guards do not shadow each other; the admin case below is
        # what demonstrates that a declared gate is served.
        response = c.get(f"/api/addons/{ADDON}/open")
        assert response.status_code == 404

        c = declaring({
            "path": "/open", "methods": ["GET"], "drive_optional": True,
            "pre_check": {"type": "admin"},
        })
        # ``vip`` is the only protected group, so unlocking it is what makes
        # this caller an admin — the gate then passes on its own terms.
        assert c.post("/api/auth/unlock", json={"password": "vippass"}).status_code == 200

        response = c.get(f"/api/addons/{ADDON}/open")
        assert response.status_code == 200
        assert len(_SpyClient.calls) == 1

    def test_a_route_that_is_not_drive_optional_still_asks_for_a_drive(self, declaring):
        """The 400 for an ordinary drive-scoped route is unchanged; the guard
        above must not turn it into a 404 and hide a client bug."""
        c = declaring({"path": "/open", "methods": ["GET"]})

        response = c.get(f"/api/addons/{ADDON}/open")

        assert response.status_code == 400


#: ``pre_check`` shapes the dispatch has no arm for, **and which are truthy**,
#: so each one also satisfies the ``drive_optional`` guard's "does this route
#: declare a gate" test and reaches the dispatch. That pairing is the point: a
#: falsy shape is refused earlier by a different guard and would pass this test
#: without the arm under test existing.
#:
#: A manifest is JSON from another repository, so the shapes are not all
#: objects. Declared rather than derived from the dispatch, so removing an arm
#: fails here instead of quietly joining this list.
UNRECOGNISED_PRE_CHECKS = [
    {"type": "file_acces", "param": "file_id"},   # one letter short
    {"type": "fileaccess"},                        # no underscore
    {"type": "admin "},                            # trailing space
    {"type": "Admin"},                             # wrong case
    {"param": "file_id"},                          # no "type" key at all
    {"type": None},                                # explicit null
    "file_access",                                 # a string, not an object
    ["file_access"],                               # an array
    42,                                            # a number
]

#: Falsy shapes never reach the dispatch: the ``drive_optional`` guard refuses
#: them first, for its own reason. Kept separate from the list above so the two
#: refusals are not confused for one, which is what an empty object did while
#: it sat there.
FALSY_PRE_CHECKS = [{}, None, "", 0]


class TestUnrecognisedPreCheckType:
    """A declared gate the proxy cannot dispatch to.

    This is the third way a manifest can be wrong and read as correct, and it
    reads as correct harder than the other two: ``"type": "file_acces"`` looks
    like a gate to a reader, to a reviewer, and — before this arm existed — to
    the ``drive_optional`` guard, which only asks whether a ``pre_check`` is
    present. A route that waives the drive requirement and declares a gate
    nothing runs is served to an unauthenticated caller with no drive context.
    """

    @pytest.mark.parametrize("pre_check", UNRECOGNISED_PRE_CHECKS)
    def test_it_is_refused_rather_than_skipped(self, declaring, caplog, pre_check):
        c = declaring({
            "path": "/open", "methods": ["GET"],
            "drive_optional": True, "pre_check": pre_check,
        })

        with caplog.at_level("ERROR", logger="app.routers.addon_proxy"):
            response = c.get(f"/api/addons/{ADDON}/open")

        assert response.status_code == 404
        assert _SpyClient.calls == []
        # "cannot dispatch" is emitted only by the arm under test. The
        # `drive_optional` guard's message also contains "pre_check", so a
        # looser match here is satisfied by the wrong guard — which is how an
        # empty object passed this test while never reaching the dispatch.
        assert any(
            "cannot dispatch" in record.getMessage() for record in caplog.records
        ), "the undispatchable pre_check is not named in any ERROR log"

    @pytest.mark.parametrize("check_type", ["file_access", "addon_feature", "admin"])
    def test_the_recognised_types_still_dispatch(self, declaring, check_type):
        """Positive control, one per arm.

        The refusal above must come from the type being unknown, not from the
        new arm swallowing every ``pre_check``. Each recognised type reaches
        its own gate, which refuses for its own reason — 403 for admin, 404
        for the other two — and none of them forwards.
        """
        c = declaring({
            "path": "/open", "methods": ["GET"],
            "drive_optional": True, "pre_check": {"type": check_type},
        })

        response = c.get(f"/api/addons/{ADDON}/open")

        assert response.status_code == (403 if check_type == "admin" else 404)
        assert _SpyClient.calls == []


    @pytest.mark.parametrize("pre_check", FALSY_PRE_CHECKS)
    def test_a_falsy_pre_check_is_refused_by_the_other_guard(
        self, declaring, caplog, pre_check
    ):
        """Same 404, different line, and the messages are what separate them.

        A falsy ``pre_check`` does not declare a gate at all, so the
        ``drive_optional`` guard refuses it before the dispatch is reached.
        Asserting which message appears is the only way to tell the two
        refusals apart from outside.
        """
        c = declaring({
            "path": "/open", "methods": ["GET"],
            "drive_optional": True, "pre_check": pre_check,
        })

        with caplog.at_level("ERROR", logger="app.routers.addon_proxy"):
            response = c.get(f"/api/addons/{ADDON}/open")

        assert response.status_code == 404
        assert _SpyClient.calls == []
        messages = [r.getMessage() for r in caplog.records]
        assert any("drive_optional" in m for m in messages)
        assert not any("cannot dispatch" in m for m in messages)
