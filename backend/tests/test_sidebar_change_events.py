"""SPEC-CORE-189: collection, pin and internal tag writes announce the change.

``broadcast_from_thread`` is patched because TestClient runs no event loop for
it; the real one would log and send nothing, so a test that did not patch it
would pass because nothing was sent.
"""

from __future__ import annotations

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Callable
from unittest.mock import patch

import pytest

import app.config as config
import app.database as database
import app.services.event_hooks as event_hooks
import app.services.ws as ws
from app.models import Collection, CollectionItem, File, PinnedFolder
from tests.conftest import TEST_DRIVE

COLLECTIONS = "drive.collections_changed"
PINS = "drive.pins_changed"
TAGS = "drive.tags_changed"
BASE = f"/api/drives/{TEST_DRIVE}"


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture(autouse=True)
def _clear_secret_env():
    prev = os.environ.pop("CORE_INTERNAL_SECRET", None)
    try:
        yield
    finally:
        if prev is not None:
            os.environ["CORE_INTERNAL_SECRET"] = prev
        else:
            os.environ.pop("CORE_INTERNAL_SECRET", None)


@dataclass
class Capture:
    """Everything the request sent outward, and what the DB held at broadcast time."""

    broadcasts: list[tuple[str, dict, str | None]]
    direct: list[tuple[str, dict, str | None]]
    webhooks: list[tuple[str, Any]]
    seen_at_broadcast: list[Any]
    probe: Callable[[], Any] | None = None
    raise_on_broadcast: BaseException | None = None

    def reset(self) -> None:
        self.broadcasts.clear()
        self.direct.clear()
        self.webhooks.clear()
        self.seen_at_broadcast.clear()

    def everything(self) -> list[tuple]:
        return (
            [("broadcast_from_thread", *c) for c in self.broadcasts]
            + [("manager.broadcast", *c) for c in self.direct]
            + [("webhook", *c) for c in self.webhooks]
        )


@pytest.fixture()
def capture(monkeypatch):
    cap = Capture([], [], [], [])

    def fake_broadcast_from_thread(event, data, drive=None):
        cap.broadcasts.append((event, data, drive))
        if cap.probe is not None:
            cap.seen_at_broadcast.append(cap.probe())
        if cap.raise_on_broadcast is not None:
            raise cap.raise_on_broadcast

    async def fake_manager_broadcast(event, data, drive=None):
        cap.direct.append((event, data, drive))

    def record_webhook(name):
        def _record(event, *args, **kwargs):
            cap.webhooks.append((event, name))

        return _record

    async def record_webhook_async(event, *args, **kwargs):
        cap.webhooks.append((event, "emit"))

    monkeypatch.setattr(ws, "broadcast_from_thread", fake_broadcast_from_thread)
    monkeypatch.setattr(ws.manager, "broadcast", fake_manager_broadcast)
    monkeypatch.setattr(event_hooks, "emit", record_webhook_async)
    monkeypatch.setattr(event_hooks, "emit_sync", record_webhook("emit_sync"))
    monkeypatch.setattr(event_hooks, "emit_from_thread", record_webhook("emit_from_thread"))
    return cap


def _fresh(query: Callable[[Any], Any]) -> Any:
    """Run ``query`` in a session of its own, so only committed rows are visible."""
    session = database.SessionLocal()
    try:
        return query(session)
    finally:
        session.close()


def _seed_file(db, filename: str, drive_dir=None) -> File:
    if drive_dir is not None:
        (drive_dir / filename).write_text("body\n", encoding="utf-8")
    f = File(
        filename=filename,
        title=filename.rsplit(".", 1)[0],
        drive=TEST_DRIVE,
        folder_path="",
        file_path=filename,
        file_size=5,
        file_type="document" if filename.endswith(".md") else "audio",
        mime_type="text/markdown" if filename.endswith(".md") else "audio/mpeg",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _create_collection(c, name: str) -> str:
    res = c.post(f"{BASE}/collections", json={"name": name})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _add_items(c, cid: str, file_ids: list[str]) -> list[dict]:
    res = c.post(f"{BASE}/collections/{cid}/items", json={"file_ids": file_ids})
    assert res.status_code == 200, res.text
    return res.json()["items"]


@dataclass
class Case:
    """One successful write: how to set it up, send it, and see it committed."""

    event: str
    status: int
    arrange: Callable[[Any, Any, Any], dict]
    act: Callable[[Any, dict], Any]
    committed: Callable[[dict], Callable[[Any], Any]]
    body: Callable[[Any, dict], None]


def _no_body(res, ctx):
    assert res.content in (b"", b"null")


def _arrange_nothing(c, db, drive_dir):
    return {}


def _arrange_collection(c, db, drive_dir):
    return {"cid": _create_collection(c, "Old")}


def _arrange_collection_with_file(c, db, drive_dir):
    f = _seed_file(db, "song.mp3")
    return {"cid": _create_collection(c, "Songs"), "file_id": f.id}


def _arrange_collection_with_item(c, db, drive_dir):
    ctx = _arrange_collection_with_file(c, db, drive_dir)
    items = _add_items(c, ctx["cid"], [ctx["file_id"]])
    return {**ctx, "item_id": items[0]["id"]}


def _arrange_collection_with_two_items(c, db, drive_dir):
    f1 = _seed_file(db, "a.mp3")
    f2 = _seed_file(db, "b.mp3")
    cid = _create_collection(c, "Order")
    items = _add_items(c, cid, [f1.id, f2.id])
    return {"cid": cid, "item_ids": [items[1]["id"], items[0]["id"]], "f1": f1.id, "f2": f2.id}


def _arrange_pin(c, db, drive_dir):
    res = c.post(f"{BASE}/pins", json={"path": "Movies"})
    assert res.status_code == 201, res.text
    return {}


def _arrange_note(c, db, drive_dir):
    return {"file_id": _seed_file(db, "note.md", drive_dir).id}


def _collection_names(session):
    return sorted(n for (n,) in session.query(Collection.name).filter(Collection.drive == TEST_DRIVE))


def _item_files(cid):
    def q(session):
        rows = (
            session.query(CollectionItem.file_id)
            .filter(CollectionItem.collection_id == cid)
            .order_by(CollectionItem.position)
            .all()
        )
        return [r[0] for r in rows]

    return q


def _pins(session):
    return sorted(p for (p,) in session.query(PinnedFolder.path).filter(PinnedFolder.drive == TEST_DRIVE))


def _tags_of(file_id):
    def q(session):
        f = session.query(File).filter(File.id == file_id).one()
        return sorted(t.name for t in f.tags)

    return q


def _body_create(res, ctx):
    assert (res.json()["name"], res.json()["drive"]) == ("Fresh", TEST_DRIVE), res.text


def _body_update(res, ctx):
    assert (res.json()["id"], res.json()["name"]) == (ctx["cid"], "New"), res.text


def _body_added(res, ctx):
    assert [i["file"]["id"] for i in res.json()["items"]] == [ctx["file_id"]], res.text


def _body_reordered(res, ctx):
    assert [i["file"]["id"] for i in res.json()["items"]] == [ctx["f2"], ctx["f1"]], res.text


def _body_pin(res, ctx):
    assert res.json() == {"path": "Movies/Action", "on_home": False}, res.text


CASES: dict[str, Case] = {
    "create_collection": Case(
        COLLECTIONS,
        201,
        _arrange_nothing,
        lambda c, ctx: c.post(f"{BASE}/collections", json={"name": "Fresh"}),
        lambda ctx: _collection_names,
        _body_create,
    ),
    "update_collection": Case(
        COLLECTIONS,
        200,
        _arrange_collection,
        lambda c, ctx: c.put(f"{BASE}/collections/{ctx['cid']}", json={"name": "New"}),
        lambda ctx: _collection_names,
        _body_update,
    ),
    "delete_collection": Case(
        COLLECTIONS,
        204,
        _arrange_collection,
        lambda c, ctx: c.delete(f"{BASE}/collections/{ctx['cid']}"),
        lambda ctx: _collection_names,
        _no_body,
    ),
    "add_collection_items": Case(
        COLLECTIONS,
        200,
        _arrange_collection_with_file,
        lambda c, ctx: c.post(f"{BASE}/collections/{ctx['cid']}/items", json={"file_ids": [ctx["file_id"]]}),
        lambda ctx: _item_files(ctx["cid"]),
        _body_added,
    ),
    "remove_collection_item": Case(
        COLLECTIONS,
        204,
        _arrange_collection_with_item,
        lambda c, ctx: c.delete(f"{BASE}/collections/{ctx['cid']}/items/{ctx['item_id']}"),
        lambda ctx: _item_files(ctx["cid"]),
        _no_body,
    ),
    "reorder_collection_items": Case(
        COLLECTIONS,
        200,
        _arrange_collection_with_two_items,
        lambda c, ctx: c.put(f"{BASE}/collections/{ctx['cid']}/items/reorder", json={"item_ids": ctx["item_ids"]}),
        lambda ctx: _item_files(ctx["cid"]),
        _body_reordered,
    ),
    "pin_folder": Case(
        PINS,
        201,
        _arrange_nothing,
        lambda c, ctx: c.post(f"{BASE}/pins", json={"path": "Movies/Action"}),
        lambda ctx: _pins,
        _body_pin,
    ),
    "unpin_folder": Case(
        PINS,
        204,
        _arrange_pin,
        lambda c, ctx: c.delete(f"{BASE}/pins?path=Movies"),
        lambda ctx: _pins,
        _no_body,
    ),
    "internal_file_tags": Case(
        TAGS,
        204,
        _arrange_note,
        lambda c, ctx: c.post(f"/api/internal/files/{ctx['file_id']}/tags", json={"tags": ["cooking", "japanese"]}),
        lambda ctx: _tags_of(ctx["file_id"]),
        _no_body,
    ),
}

COMMITTED_STATE = {
    "create_collection": lambda ctx: ["Fresh"],
    "update_collection": lambda ctx: ["New"],
    "delete_collection": lambda ctx: [],
    "add_collection_items": lambda ctx: [ctx["file_id"]],
    "remove_collection_item": lambda ctx: [],
    "reorder_collection_items": lambda ctx: [ctx["f2"], ctx["f1"]],
    "pin_folder": lambda ctx: ["Movies/Action"],
    "unpin_folder": lambda ctx: [],
    "internal_file_tags": lambda ctx: ["cooking", "japanese"],
}


class TestSuccessfulWriteAnnounces:
    """SPEC-CORE-189 I6."""

    @pytest.mark.parametrize("name", list(CASES))
    def test_spec_core_189_i6_one_scoped_broadcast_after_commit_and_nothing_else(self, client, capture, name):
        c, db, drive_dir, _ = client
        case = CASES[name]
        ctx = case.arrange(c, db, drive_dir)
        capture.reset()
        capture.probe = lambda: _fresh(case.committed(ctx))

        res = case.act(c, ctx)

        assert res.status_code == case.status, res.text
        assert capture.everything() == [
            ("broadcast_from_thread", case.event, {"drive": TEST_DRIVE}, TEST_DRIVE)
        ]
        assert capture.seen_at_broadcast == [COMMITTED_STATE[name](ctx)]


@dataclass
class Failure:
    """A write that answers 4xx, then a valid write of the same kind that does announce."""

    status: int
    arrange: Callable[[Any, Any, Any], dict]
    bad: Callable[[Any, dict], Any]
    good: Callable[[Any, dict], Any]
    event: str


class TestOncePerRequest:
    """SPEC-CORE-189 I6: one broadcast per successful request, whatever it changed."""

    def test_spec_core_189_i6_adding_two_files_in_one_request_broadcasts_once(self, client, capture):
        c, db, drive_dir, _ = client
        f1 = _seed_file(db, "a.mp3")
        f2 = _seed_file(db, "b.mp3")
        cid = _create_collection(c, "Pair")
        capture.reset()

        res = c.post(f"{BASE}/collections/{cid}/items", json={"file_ids": [f1.id, f2.id]})

        assert res.status_code == 200, res.text
        assert len(res.json()["items"]) == 2
        assert capture.everything() == [("broadcast_from_thread", COLLECTIONS, {"drive": TEST_DRIVE}, TEST_DRIVE)]

    def test_spec_core_189_i6_an_add_whose_files_are_all_present_still_broadcasts_once(self, client, capture):
        c, db, drive_dir, _ = client
        ctx = _arrange_collection_with_item(c, db, drive_dir)
        capture.reset()

        res = c.post(f"{BASE}/collections/{ctx['cid']}/items", json={"file_ids": [ctx["file_id"]]})

        assert res.status_code == 200, res.text
        assert capture.everything() == [("broadcast_from_thread", COLLECTIONS, {"drive": TEST_DRIVE}, TEST_DRIVE)]

    def test_spec_core_189_i6_a_description_only_update_broadcasts_once(self, client, capture):
        c, db, drive_dir, _ = client
        cid = _create_collection(c, "Desc")
        capture.reset()

        res = c.put(f"{BASE}/collections/{cid}", json={"description": "Added later"})

        assert res.status_code == 200, res.text
        assert capture.everything() == [("broadcast_from_thread", COLLECTIONS, {"drive": TEST_DRIVE}, TEST_DRIVE)]


def _arrange_dup(c, db, drive_dir):
    _create_collection(c, "Dup")
    return {}


def _arrange_two_collections(c, db, drive_dir):
    _create_collection(c, "A")
    return {"cid": _create_collection(c, "B")}


FAILURES: dict[str, Failure] = {
    "create_duplicate": Failure(
        409,
        _arrange_dup,
        lambda c, ctx: c.post(f"{BASE}/collections", json={"name": "Dup"}),
        lambda c, ctx: c.post(f"{BASE}/collections", json={"name": "Other"}),
        COLLECTIONS,
    ),
    "create_empty_name": Failure(
        422,
        _arrange_nothing,
        lambda c, ctx: c.post(f"{BASE}/collections", json={"name": "  "}),
        lambda c, ctx: c.post(f"{BASE}/collections", json={"name": "Other"}),
        COLLECTIONS,
    ),
    "update_duplicate": Failure(
        409,
        _arrange_two_collections,
        lambda c, ctx: c.put(f"{BASE}/collections/{ctx['cid']}", json={"name": "A"}),
        lambda c, ctx: c.put(f"{BASE}/collections/{ctx['cid']}", json={"name": "C"}),
        COLLECTIONS,
    ),
    "update_unknown": Failure(
        404,
        _arrange_collection,
        lambda c, ctx: c.put(f"{BASE}/collections/abcdefghijkl", json={"name": "X"}),
        lambda c, ctx: c.put(f"{BASE}/collections/{ctx['cid']}", json={"name": "X"}),
        COLLECTIONS,
    ),
    "delete_unknown": Failure(
        404,
        _arrange_collection,
        lambda c, ctx: c.delete(f"{BASE}/collections/abcdefghijkl"),
        lambda c, ctx: c.delete(f"{BASE}/collections/{ctx['cid']}"),
        COLLECTIONS,
    ),
    "add_unknown_file": Failure(
        404,
        _arrange_collection_with_file,
        lambda c, ctx: c.post(f"{BASE}/collections/{ctx['cid']}/items", json={"file_ids": ["abcdefghijkl"]}),
        lambda c, ctx: c.post(f"{BASE}/collections/{ctx['cid']}/items", json={"file_ids": [ctx["file_id"]]}),
        COLLECTIONS,
    ),
    "remove_unknown_item": Failure(
        404,
        _arrange_collection_with_item,
        lambda c, ctx: c.delete(f"{BASE}/collections/{ctx['cid']}/items/99999"),
        lambda c, ctx: c.delete(f"{BASE}/collections/{ctx['cid']}/items/{ctx['item_id']}"),
        COLLECTIONS,
    ),
    "reorder_mismatch": Failure(
        409,
        _arrange_collection_with_two_items,
        lambda c, ctx: c.put(f"{BASE}/collections/{ctx['cid']}/items/reorder", json={"item_ids": [99999]}),
        lambda c, ctx: c.put(f"{BASE}/collections/{ctx['cid']}/items/reorder", json={"item_ids": ctx["item_ids"]}),
        COLLECTIONS,
    ),
    "pin_duplicate": Failure(
        409,
        _arrange_pin,
        lambda c, ctx: c.post(f"{BASE}/pins", json={"path": "Movies"}),
        lambda c, ctx: c.post(f"{BASE}/pins", json={"path": "Other"}),
        PINS,
    ),
    "unpin_unknown": Failure(
        404,
        _arrange_pin,
        lambda c, ctx: c.delete(f"{BASE}/pins?path=NoSuch"),
        lambda c, ctx: c.delete(f"{BASE}/pins?path=Movies"),
        PINS,
    ),
    "internal_tags_unknown_file": Failure(
        404,
        _arrange_note,
        lambda c, ctx: c.post("/api/internal/files/abcdefghijkl/tags", json={"tags": ["x"]}),
        lambda c, ctx: c.post(f"/api/internal/files/{ctx['file_id']}/tags", json={"tags": ["x"]}),
        TAGS,
    ),
}


class TestFailedWriteIsSilent:
    """SPEC-CORE-189 I6: a request that answers 4xx broadcasts nothing."""

    @pytest.mark.parametrize("name", list(FAILURES))
    def test_spec_core_189_i6_4xx_broadcasts_nothing_and_the_next_valid_write_does(self, client, capture, name):
        c, db, drive_dir, _ = client
        failure = FAILURES[name]
        ctx = failure.arrange(c, db, drive_dir)
        capture.reset()

        res = failure.bad(c, ctx)
        assert res.status_code == failure.status, res.text
        assert capture.everything() == []

        res = failure.good(c, ctx)
        assert res.status_code < 300, res.text
        assert capture.everything() == [
            ("broadcast_from_thread", failure.event, {"drive": TEST_DRIVE}, TEST_DRIVE)
        ]

    def test_spec_core_189_i6_internal_tags_rejected_by_secret_broadcasts_nothing(self, client, capture):
        c, db, drive_dir, _ = client
        os.environ["CORE_INTERNAL_SECRET"] = "topsecret"
        f = _seed_file(db, "note.md", drive_dir)
        capture.reset()

        res = c.post(f"/api/internal/files/{f.id}/tags", json={"tags": ["x"]})

        assert res.status_code == 403
        assert capture.everything() == []

        res = c.post(
            f"/api/internal/files/{f.id}/tags",
            headers={"X-Internal-Secret": "topsecret"},
            json={"tags": ["x"]},
        )
        assert res.status_code == 204, res.text
        assert capture.everything() == [("broadcast_from_thread", TAGS, {"drive": TEST_DRIVE}, TEST_DRIVE)]


def _mentions(record: logging.LogRecord, text: str) -> bool:
    if text in record.getMessage():
        return True
    return bool(record.exc_info) and text in str(record.exc_info[1])


class TestBroadcastFailureDoesNotTouchTheWrite:
    """SPEC-CORE-189 I7."""

    @pytest.mark.parametrize("name", list(CASES))
    def test_spec_core_189_i7_raising_broadcast_leaves_a_committed_successful_write(
        self, client, capture, caplog, name
    ):
        c, db, drive_dir, _ = client
        case = CASES[name]
        ctx = case.arrange(c, db, drive_dir)
        capture.reset()
        capture.raise_on_broadcast = RuntimeError("socket gone")

        with caplog.at_level(logging.DEBUG):
            res = case.act(c, ctx)

        assert res.status_code == case.status, res.text
        case.body(res, ctx)
        assert _fresh(case.committed(ctx)) == COMMITTED_STATE[name](ctx)
        assert [b[0] for b in capture.broadcasts] == [case.event]
        assert any(_mentions(r, "socket gone") for r in caplog.records)


class _FakeSocket:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def send_json(self, message: dict) -> None:
        self.sent.append(message)


class TestBroadcastReachesOnlyTheDrivesGroup:
    """SPEC-CORE-189 I8, through the endpoint and the real ConnectionManager."""

    @pytest.mark.parametrize("name", ["create_collection", "pin_folder", "internal_file_tags"])
    def test_spec_core_189_i8_only_connections_holding_the_group_receive_it(self, client, monkeypatch, name):
        c, db, drive_dir, _ = client
        case = CASES[name]
        ctx = case.arrange(c, db, drive_dir)

        member, outsider = _FakeSocket(), _FakeSocket()
        monkeypatch.setattr(ws.manager, "_connections", {member: ["private"], outsider: ["other"]})
        real_lookup = config.get_drive_access_group

        def deliver(event, data, drive=None):
            def lookup(d):
                return "private" if d == TEST_DRIVE else real_lookup(d)

            # A thread of its own, because the handler may itself be running on an event loop.
            with patch.object(config, "get_drive_access_group", side_effect=lookup):
                with ThreadPoolExecutor(max_workers=1) as pool:
                    pool.submit(_run, ws.manager.broadcast(event, data, drive=drive)).result()

        monkeypatch.setattr(ws, "broadcast_from_thread", deliver)

        res = case.act(c, ctx)

        assert res.status_code == case.status, res.text
        assert member.sent == [{"event": case.event, "data": {"drive": TEST_DRIVE}}]
        assert outsider.sent == []
