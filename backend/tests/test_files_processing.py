"""SPEC-CORE-031 — ``POST /api/files/processing`` and the ``processing_status``
contract it asks addons to answer.

The addon side is a real HTTP server on loopback: the core is expected to call
each addon's proxy target directly, so a stubbed ``httpx`` client would decide
for the test how the target is reached and what a timeout is.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import unquote

import pytest

from app.models import File
from app.services import addon_registry
from tests.conftest import TEST_DRIVE

SAVED_STAGE = {
    "addon": None,
    "key": "saved",
    "i18n_key": "upload.stageSaved",
    "state": "done",
    "required": True,
}


def _raw_stage(
    key: str,
    *,
    state: str = "done",
    required: bool = True,
    i18n_key: str | None = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "i18n_key": i18n_key if i18n_key is not None else f"fake.{key}",
        "state": state,
        "required": required,
    }


def _expected(addon: str, raw: dict[str, Any]) -> dict[str, Any]:
    return {"addon": addon, **raw}


def _unavailable(addon: str) -> dict[str, Any]:
    return {
        "addon": addon,
        "key": "unavailable",
        "i18n_key": "upload.stageUnavailable",
        "state": "pending",
        "required": True,
    }


def _files(**per_file: list[dict[str, Any]]) -> dict[str, Any]:
    return {"files": {fid: {"stages": stages} for fid, stages in per_file.items()}}


class AddonStub:
    """A loopback stand-in for one external addon's service."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self._responses: dict[str, dict[str, Any]] = {}
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802 - http.server's spelling
                stub._handle(self)

            def do_POST(self) -> None:  # noqa: N802 - http.server's spelling
                stub._handle(self)

            def log_message(self, *_args: Any) -> None:
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_port
        self.thread = threading.Thread(
            target=self.server.serve_forever, daemon=True
        )
        self.thread.start()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def respond(
        self,
        path: str,
        *,
        body: Any = None,
        status: int = 200,
        raw: str | None = None,
        delay: float = 0.0,
    ) -> None:
        self._responses[path] = {
            "body": body,
            "status": status,
            "raw": raw,
            "delay": delay,
        }

    def _handle(self, handler: BaseHTTPRequestHandler) -> None:
        length = int(handler.headers.get("content-length") or 0)
        payload = handler.rfile.read(length) if length else b""
        try:
            parsed = json.loads(payload) if payload else None
        except json.JSONDecodeError:
            parsed = None
        self.calls.append(
            {
                "method": handler.command,
                "path": handler.path,
                "drive": handler.headers.get("x-lit-drive"),
                "body": parsed,
                "port": self.port,
            }
        )
        spec = self._responses.get(
            handler.path,
            {"body": {"detail": "not found"}, "status": 404, "raw": None, "delay": 0.0},
        )
        if spec["delay"]:
            time.sleep(spec["delay"])
        data = (
            spec["raw"].encode()
            if spec["raw"] is not None
            else json.dumps(spec["body"]).encode()
        )
        try:
            handler.send_response(spec["status"])
            handler.send_header("content-type", "application/json")
            handler.send_header("content-length", str(len(data)))
            handler.end_headers()
            handler.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def inbound_ids(self) -> set[str]:
        ids: set[str] = set()
        for call in self.calls:
            body = call["body"]
            if isinstance(body, dict):
                ids.update(body.get("file_ids") or [])
        return ids

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture()
def stub():
    created: list[AddonStub] = []

    def make() -> AddonStub:
        server = AddonStub()
        created.append(server)
        return server

    yield make
    for server in created:
        server.close()


@pytest.fixture()
def register_addon(monkeypatch):
    """Put manifests in the registry for one test, with every feature enabled."""
    import app.config as config

    monkeypatch.setattr(config, "is_addon_feature_enabled", lambda *a, **k: True)
    previous: dict[str, dict[str, Any] | None] = {}

    def register(
        name: str,
        *,
        target: str = "",
        env: str = "",
        path: str = "/files/processing",
        addon_type: str = "external_service",
        scope: str = "drive",
        routes: list[dict[str, Any]] | None = None,
    ) -> str:
        previous[name] = addon_registry._registry.get(name)
        addon_registry._registry[name] = {
            "label": name,
            "type": addon_type,
            "scope": scope,
            "proxy": {
                "target_env": env,
                "target_default": target,
                "routes": list(routes or []),
            },
            "processing_status": {"path": path},
        }
        return name

    yield register

    for name, meta in previous.items():
        if meta is None:
            addon_registry._registry.pop(name, None)
        else:
            addon_registry._registry[name] = meta


def _add_file(
    session,
    file_id: str,
    *,
    drive: str = TEST_DRIVE,
    **fields: Any,
) -> str:
    session.add(
        File(
            id=file_id,
            filename=f"{file_id}.txt",
            title=file_id,
            drive=drive,
            file_path=f"{file_id}.txt",
            file_size=1,
            file_type="text",
            mime_type="text/plain",
            **fields,
        )
    )
    session.commit()
    return file_id


def _add_drive(monkeypatch, tmp_path, name: str, *, access_group: str | None = None):
    import app.config as config

    drives = json.loads(config.DRIVES_CONFIG.read_text())
    drive_dir = tmp_path / "drives" / name
    drive_dir.mkdir(parents=True, exist_ok=True)
    entry: dict[str, Any] = {"name": name, "path": str(drive_dir)}
    if access_group:
        entry["access_group"] = access_group
    drives.append(entry)
    config.DRIVES_CONFIG.write_text(json.dumps(drives))
    monkeypatch.setattr(config, "_drives_cache", None)
    return entry


def _require_group(monkeypatch, tmp_path, *, password: str, group: str) -> None:
    import app.auth as auth

    path = tmp_path / "passwords.json"
    path.write_text(json.dumps([{"password": password, "groups": [group]}]))
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", path)
    monkeypatch.setattr(auth, "_passwords_cache", None)
    monkeypatch.setattr(auth, "_jwt_secret", "test-jwt-secret")


def _post(client, file_ids: list[str]):
    return client.post("/api/files/processing", json={"file_ids": file_ids})


# --- I2: saved first, then every eligible addon in name order ----------------


def test_spec_core_031_i2_saved_first_then_addons_in_name_and_declared_order(
    client, stub, register_addon
):
    c, session, _drive_dir, _data_dir = client
    file_id = _add_file(session, "file00000001")

    alpha, mid, zeta = stub(), stub(), stub()
    alpha.respond(
        "/files/processing",
        body=_files(**{file_id: [_raw_stage("search"), _raw_stage("text")]}),
    )
    mid.respond(
        "/files/processing", body=_files(**{file_id: [_raw_stage("index")]})
    )
    zeta.respond(
        "/files/processing",
        body=_files(**{file_id: [_raw_stage("transcript")]}),
    )
    register_addon("zeta", target=zeta.url)
    register_addon("alpha", target=alpha.url)
    register_addon("mid", target=mid.url)

    response = _post(c, [file_id])

    assert response.status_code == 200
    assert response.json()["files"][file_id]["stages"] == [
        SAVED_STAGE,
        _expected("alpha", _raw_stage("search")),
        _expected("alpha", _raw_stage("text")),
        _expected("mid", _raw_stage("index")),
        _expected("zeta", _raw_stage("transcript")),
    ]


def test_spec_core_031_i2_each_call_carries_one_drives_ids_and_its_name(
    client, stub, register_addon, monkeypatch, tmp_path
):
    c, session, _drive_dir, _data_dir = client
    _add_drive(monkeypatch, tmp_path, "other-drive")
    _add_drive(monkeypatch, tmp_path, "写真 2026")
    first = _add_file(session, "file00000001")
    second = _add_file(session, "file00000002")
    elsewhere = _add_file(session, "file00000003", drive="other-drive")
    japanese = _add_file(session, "file00000004", drive="写真 2026")

    addon = stub()
    addon.respond("/files/processing", body={"files": {}})
    register_addon("sorter", target=addon.url)

    response = _post(c, [first, second, elsewhere, japanese])

    assert response.status_code == 200
    assert len(addon.calls) == 3
    by_drive = {
        unquote(call["drive"]): set(call["body"]["file_ids"])
        for call in addon.calls
    }
    assert by_drive == {
        TEST_DRIVE: {first, second},
        "other-drive": {elsewhere},
        "写真 2026": {japanese},
    }


def test_spec_core_031_i2_an_in_process_addon_is_never_called(
    client, stub, register_addon
):
    c, session, _drive_dir, _data_dir = client
    file_id = _add_file(session, "file00000001")

    external = stub()
    external.respond(
        "/files/processing", body=_files(**{file_id: [_raw_stage("search")]})
    )
    in_process = stub()
    in_process.respond(
        "/files/processing", body=_files(**{file_id: [_raw_stage("thread")]})
    )
    register_addon("alpha", target=external.url)
    register_addon("inproc", target=in_process.url, addon_type="in_process")

    body = _post(c, [file_id]).json()

    assert in_process.calls == []
    addons = [stage["addon"] for stage in body["files"][file_id]["stages"]]
    assert addons == [None, "alpha"]


def test_spec_core_031_i2_an_addon_whose_index_feature_is_off_is_not_called(
    client, stub, register_addon, monkeypatch
):
    import app.config as config

    c, session, _drive_dir, _data_dir = client
    file_id = _add_file(session, "file00000001")

    off = stub()
    off.respond(
        "/files/processing", body=_files(**{file_id: [_raw_stage("search")]})
    )
    register_addon("indexed", target=off.url)
    monkeypatch.setattr(
        config,
        "is_addon_feature_enabled",
        lambda drive, addon, feature: not (
            addon == "indexed" and feature == "index"
        ),
    )

    body = _post(c, [file_id]).json()

    assert off.calls == []
    assert body["files"][file_id] == {"stages": [SAVED_STAGE], "ready": True}


# --- I1: inaccessible, missing and trashed files ----------------------------


def test_spec_core_031_i1_dropped_files_are_absent_and_never_sent(
    client, stub, register_addon, monkeypatch, tmp_path
):
    c, session, _drive_dir, _data_dir = client
    _require_group(monkeypatch, tmp_path, password="vippass", group="vip")
    _add_drive(monkeypatch, tmp_path, "secret-drive", access_group="vip")
    visible = _add_file(session, "file00000001")
    locked = _add_file(session, "file00000002", drive="secret-drive")
    trashed = _add_file(
        session, "file00000003", deleted_at=datetime.now(UTC)
    )
    missing = _add_file(
        session, "file00000004", missing_since=datetime.now(UTC)
    )
    unknown = "filenothere1"

    addon = stub()
    addon.respond(
        "/files/processing",
        body=_files(
            **{
                visible: [_raw_stage("search")],
                locked: [_raw_stage("search")],
                trashed: [_raw_stage("search")],
                missing: [_raw_stage("search")],
            }
        ),
    )
    register_addon("intel", target=addon.url)

    body = _post(c, [visible, locked, trashed, missing, unknown]).json()

    assert set(body["files"]) == {visible}
    assert addon.inbound_ids() == {visible}
    assert [call["drive"] for call in addon.calls] == [TEST_DRIVE]


# --- I3: a broken addon costs one unavailable stage -------------------------


BROKEN_RESPONSES = {
    "status_500": {"status": 500, "body": {"detail": "boom"}},
    "not_json": {"raw": "<html>not json</html>"},
    "wrong_shape": {"body": {"files": "not-an-object"}},
    "leaves_every_file_out": {"body": {"files": {}}},
}


@pytest.mark.parametrize("failure", sorted(BROKEN_RESPONSES))
def test_spec_core_031_i3_a_broken_addon_costs_one_unavailable_stage(
    client, stub, register_addon, failure
):
    c, session, _drive_dir, _data_dir = client
    file_id = _add_file(session, "file00000001")

    broken = stub()
    broken.respond("/files/processing", **BROKEN_RESPONSES[failure])
    healthy = stub()
    healthy.respond(
        "/files/processing", body=_files(**{file_id: [_raw_stage("search")]})
    )
    register_addon("aaa_broken", target=broken.url)
    register_addon("zzz_ok", target=healthy.url)

    body = _post(c, [file_id]).json()

    assert body["files"][file_id]["stages"] == [
        SAVED_STAGE,
        _unavailable("aaa_broken"),
        _expected("zzz_ok", _raw_stage("search")),
    ]
    assert body["files"][file_id]["ready"] is False


def test_spec_core_031_i3_an_addon_over_three_seconds_is_unavailable(
    client, stub, register_addon
):
    c, session, _drive_dir, _data_dir = client
    file_id = _add_file(session, "file00000001")

    slow = stub()
    slow.respond(
        "/files/processing",
        body=_files(**{file_id: [_raw_stage("search")]}),
        delay=3.6,
    )
    healthy = stub()
    healthy.respond(
        "/files/processing", body=_files(**{file_id: [_raw_stage("text")]})
    )
    register_addon("aaa_slow", target=slow.url)
    register_addon("zzz_ok", target=healthy.url)

    started = time.monotonic()
    body = _post(c, [file_id]).json()
    elapsed = time.monotonic() - started

    assert body["files"][file_id]["stages"] == [
        SAVED_STAGE,
        _unavailable("aaa_slow"),
        _expected("zzz_ok", _raw_stage("text")),
    ]
    assert elapsed < 3.5


def test_spec_core_031_i3_slow_pairs_on_two_drives_do_not_wait_for_each_other(
    client, stub, register_addon, monkeypatch, tmp_path
):
    c, session, _drive_dir, _data_dir = client
    _add_drive(monkeypatch, tmp_path, "other-drive")
    first = _add_file(session, "file00000001")
    second = _add_file(session, "file00000002", drive="other-drive")

    first_slow, second_slow = stub(), stub()
    for server in (first_slow, second_slow):
        server.respond(
            "/files/processing",
            body={"files": {}},
            delay=3.6,
        )
    fast = stub()
    fast.respond(
        "/files/processing",
        body=_files(
            **{
                first: [_raw_stage("search")],
                second: [_raw_stage("search")],
            }
        ),
    )
    register_addon("aaa_slow", target=first_slow.url)
    register_addon("mmm_fast", target=fast.url)
    register_addon("zzz_slow", target=second_slow.url)

    started = time.monotonic()
    body = _post(c, [first, second]).json()
    elapsed = time.monotonic() - started

    for file_id in (first, second):
        stages = body["files"][file_id]["stages"]
        assert stages == [
            SAVED_STAGE,
            _unavailable("aaa_slow"),
            _expected("mmm_fast", _raw_stage("search")),
            _unavailable("zzz_slow"),
        ]
    assert elapsed < 5.5


# --- I4: ready rests on the required stages only ----------------------------


@pytest.mark.parametrize(
    ("stages", "ready"),
    [
        ([_raw_stage("search", state="done")], True),
        ([_raw_stage("search", state="pending")], False),
        ([_raw_stage("search", state="running")], False),
        ([_raw_stage("search", state="failed")], False),
        (
            [
                _raw_stage("search", state="done", required=True),
                _raw_stage("text", state="pending", required=False),
            ],
            True,
        ),
        (
            [
                _raw_stage("search", state="done", required=True),
                _raw_stage("transcript", state="failed", required=False),
            ],
            True,
        ),
    ],
    ids=[
        "required_done",
        "required_pending",
        "required_running",
        "required_failed",
        "optional_pending",
        "optional_failed",
    ],
)
def test_spec_core_031_i4_ready_follows_the_required_stages(
    client, stub, register_addon, stages, ready
):
    c, session, _drive_dir, _data_dir = client
    file_id = _add_file(session, "file00000001")

    addon = stub()
    addon.respond("/files/processing", body=_files(**{file_id: stages}))
    register_addon("intel", target=addon.url)

    body = _post(c, [file_id]).json()

    assert body["files"][file_id]["ready"] is ready


def test_spec_core_031_i4_no_addon_declaring_it_leaves_the_file_saved_and_ready(
    client,
):
    c, session, _drive_dir, _data_dir = client
    file_id = _add_file(session, "file00000001")

    body = _post(c, [file_id]).json()

    assert body["files"][file_id] == {"stages": [SAVED_STAGE], "ready": True}


# --- I11: the proxy and the processing call resolve one target --------------


@pytest.mark.parametrize("case", ["env_unset", "env_empty", "env_set"])
def test_spec_core_031_i11_both_calls_resolve_the_target_the_same_way(
    client, stub, register_addon, monkeypatch, case
):
    c, session, _drive_dir, _data_dir = client
    file_id = _add_file(session, "file00000001")

    default = stub()
    configured = stub()
    for server in (default, configured):
        server.respond(
            "/files/processing", body=_files(**{file_id: [_raw_stage("search")]})
        )
        server.respond("/ping", body={"ok": True})

    env_name = "LIT_TEST_ADDON_TARGET"
    if case == "env_unset":
        monkeypatch.delenv(env_name, raising=False)
    elif case == "env_empty":
        monkeypatch.setenv(env_name, "")
    else:
        monkeypatch.setenv(env_name, configured.url)

    register_addon(
        "_target",
        target=default.url,
        env=env_name,
        scope="global",
        routes=[{"path": "/ping", "methods": ["GET"]}],
    )

    proxied = c.get("/api/addons/_target/ping")
    processed = _post(c, [file_id])

    assert proxied.status_code == 200
    assert processed.status_code == 200
    expected = configured if case == "env_set" else default
    other = default if case == "env_set" else configured
    assert len(expected.calls) == 2
    assert other.calls == []


# --- I13: per-file validation and empty stage lists -------------------------


def test_spec_core_031_i13_an_empty_stage_list_contributes_nothing(
    client, stub, register_addon
):
    c, session, _drive_dir, _data_dir = client
    silent = _add_file(session, "file00000001")
    speaking = _add_file(session, "file00000002")

    addon = stub()
    addon.respond(
        "/files/processing",
        body=_files(
            **{
                silent: [],
                speaking: [_raw_stage("search")],
            }
        ),
    )
    register_addon("intel", target=addon.url)

    body = _post(c, [silent, speaking]).json()

    assert body["files"][silent] == {"stages": [SAVED_STAGE], "ready": True}
    assert body["files"][speaking]["stages"] == [
        SAVED_STAGE,
        _expected("intel", _raw_stage("search")),
    ]


INVALID_STAGE_LISTS = {
    "uppercase_key": [_raw_stage("Search")],
    "leading_digit_key": [_raw_stage("1search")],
    "unknown_state": [_raw_stage("search", state="skipped")],
    "required_not_bool": [
        {
            "key": "search",
            "i18n_key": "fake.search",
            "state": "done",
            "required": "yes",
        }
    ],
    "missing_i18n_key": [{"key": "search", "state": "done", "required": True}],
    "missing_key": [{"i18n_key": "fake.search", "state": "done", "required": True}],
    "stage_not_an_object": ["search"],
    "stages_not_a_list": {"search": "done"},
}


@pytest.mark.parametrize("case", sorted(INVALID_STAGE_LISTS))
def test_spec_core_031_i13_an_invalid_stage_list_only_costs_that_file(
    client, stub, register_addon, case
):
    c, session, _drive_dir, _data_dir = client
    good = _add_file(session, "file00000001")
    bad = _add_file(session, "file00000002")
    empty = _add_file(session, "file00000003")

    addon = stub()
    addon.respond(
        "/files/processing",
        body=_files(
            **{
                good: [_raw_stage("search")],
                bad: INVALID_STAGE_LISTS[case],
                empty: [],
            }
        ),
    )
    register_addon("intel", target=addon.url)

    body = _post(c, [good, bad, empty]).json()

    assert body["files"][good]["stages"] == [
        SAVED_STAGE,
        _expected("intel", _raw_stage("search")),
    ]
    assert body["files"][bad]["stages"] == [
        SAVED_STAGE,
        _unavailable("intel"),
    ]
    assert body["files"][empty]["stages"] == [SAVED_STAGE]


BAD_BODIES = {
    "list": [],
    "object_without_files": {},
    "files_is_a_list": {"files": []},
    "files_is_a_string": {"files": "x"},
}


@pytest.mark.parametrize("case", sorted(BAD_BODIES))
def test_spec_core_031_i13_a_body_off_the_contract_leaves_every_file_out(
    client, stub, register_addon, case
):
    c, session, _drive_dir, _data_dir = client
    first = _add_file(session, "file00000001")
    second = _add_file(session, "file00000002")

    addon = stub()
    addon.respond("/files/processing", body=BAD_BODIES[case])
    register_addon("intel", target=addon.url)

    body = _post(c, [first, second]).json()

    for file_id in (first, second):
        assert body["files"][file_id] == {
            "stages": [SAVED_STAGE, _unavailable("intel")],
            "ready": False,
        }


def test_spec_core_031_i13_ids_that_were_not_requested_are_dropped(
    client, stub, register_addon
):
    c, session, _drive_dir, _data_dir = client
    file_id = _add_file(session, "file00000001")
    intruder = "file00000099"
    _add_file(session, intruder)

    addon = stub()
    addon.respond(
        "/files/processing",
        body=_files(
            **{
                file_id: [_raw_stage("search")],
                intruder: [_raw_stage("search")],
            }
        ),
    )
    register_addon("intel", target=addon.url)

    body = _post(c, [file_id]).json()

    assert set(body["files"]) == {file_id}


# --- The 100-id request bound ----------------------------------------------


def _file_ids(count: int) -> list[str]:
    return [f"id{index:010d}" for index in range(count)]


@pytest.mark.parametrize("count", [0, 101], ids=["none", "one_over"])
def test_spec_core_031_rejects_a_file_id_count_outside_one_to_one_hundred(
    client, stub, register_addon, count
):
    c, _session, _drive_dir, _data_dir = client
    addon = stub()
    addon.respond("/files/processing", body={"files": {}})
    register_addon("intel", target=addon.url)

    response = _post(c, _file_ids(count))

    assert response.status_code == 422
    assert addon.calls == []


def test_spec_core_031_accepts_one_hundred_ids_in_a_single_addon_call(
    client, stub, register_addon
):
    c, session, _drive_dir, _data_dir = client
    ids = [_add_file(session, f"batched{index:05d}") for index in range(100)]

    addon = stub()
    addon.respond("/files/processing", body={"files": {}})
    register_addon("intel", target=addon.url)

    response = _post(c, ids)

    assert response.status_code == 200
    assert set(response.json()["files"]) == set(ids)
    assert len(addon.calls) == 1
    assert len(addon.calls[0]["body"]["file_ids"]) == 100
