"""Core lifecycle changes reach the browser, not only addon webhooks.

`event_hooks.emit*` used to send HTTP to addon listeners and nothing else,
so a core-only install never learned about creates, deletes, restores,
purges or folder changes. These tests pin the coarse WebSocket events that
close that gap.

Spec: `docs/superpowers/specs/2026-08-22-core-lifecycle-events-over-websocket.md`
"""

import asyncio

import pytest

import app.services.event_hooks as event_hooks


STRUCTURE = "drive.structure_changed"
UPDATED = "drive.file_updated"


def _run(coro):
    """Drive a coroutine without disturbing the thread's current loop.

    Deliberately not ``asyncio.run``: that sets the new loop as current and
    resets the slot to ``None`` on exit, which makes the next
    ``asyncio.get_event_loop()`` in the suite raise "no current event loop".
    ``test_ws.py`` still uses that deprecated call, so ``asyncio.run`` here
    fails sixteen tests in another file.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture()
def captured(monkeypatch):
    """Collect (event, data, drive) instead of touching real connections."""
    calls: list[tuple[str, dict, str | None]] = []

    async def fake_broadcast(event, data, drive=None):
        calls.append((event, data, drive))

    def fake_broadcast_from_thread(event, data, drive=None):
        calls.append((event, data, drive))

    import app.services.ws as ws

    monkeypatch.setattr(ws.manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(ws, "broadcast_from_thread", fake_broadcast_from_thread)
    # No addon listeners: this is the configuration the feature exists for.
    monkeypatch.setattr(event_hooks, "_hooks", {})
    return calls


def _drives(calls):
    return sorted(d for _e, _p, d in calls)


class TestNoListenersStillBroadcasts:
    """The early return in emit/emit_sync must not swallow the broadcast.

    A core-only install has an empty `_hooks`. If the broadcast is placed
    after the `if not listeners: return` guard it silently does nothing —
    and every test that registers a listener would still pass.
    """

    def test_emit_broadcasts_with_no_listeners(self, captured, monkeypatch):
        monkeypatch.setattr(
            event_hooks, "_file_ids_to_drives", lambda ids: {"f1": "photos"}
        )

        _run(event_hooks.emit("files.created", {"file_ids": ["f1"]}))

        assert captured == [(STRUCTURE, {"drive": "photos"}, "photos")]

    def test_emit_sync_broadcasts_with_no_listeners(self, captured, monkeypatch):
        monkeypatch.setattr(
            event_hooks, "_file_ids_to_drives", lambda ids: {"f1": "photos"}
        )

        event_hooks.emit_sync("files.missing", {"file_ids": ["f1"]})

        assert captured == [(STRUCTURE, {"drive": "photos"}, "photos")]


class TestEventMapping:
    def test_content_update_uses_its_own_event(self, captured, monkeypatch):
        monkeypatch.setattr(
            event_hooks, "_file_ids_to_drives", lambda ids: {"f1": "notes"}
        )

        _run(event_hooks.emit("files.updated", {"file_ids": ["f1"]}))

        # Structure and content are separate so the folder tree can ignore
        # the Markdown editor's autosave.
        assert captured == [(UPDATED, {"drive": "notes"}, "notes")]

    @pytest.mark.parametrize(
        "event",
        [
            "files.created",
            "files.deleted",
            "files.moved",
            "files.restored",
            "files.recovered",
            "files.missing",
            "files.purged",
        ],
    )
    def test_file_lifecycle_events_are_structural(self, captured, monkeypatch, event):
        monkeypatch.setattr(
            event_hooks, "_file_ids_to_drives", lambda ids: {"f1": "d"}
        )

        _run(event_hooks.emit(event, {"file_ids": ["f1"]}))

        assert [e for e, _p, _d in captured] == [STRUCTURE]

    @pytest.mark.parametrize(
        "event,payload",
        [
            ("folders.created", {"drive": "d", "path": "a"}),
            ("folders.deleted", {"drive": "d", "path": "a"}),
            ("folders.moved", {"drive": "d", "old_path": "a", "new_path": "b"}),
            ("scan.complete", {"drive": "d", "added": 1}),
        ],
    )
    def test_drive_shaped_payloads_need_no_lookup(
        self, captured, monkeypatch, event, payload
    ):
        def explode(_ids):  # pragma: no cover - must not be called
            raise AssertionError("should not hit the DB when drive is in the payload")

        monkeypatch.setattr(event_hooks, "_file_ids_to_drives", explode)

        _run(event_hooks.emit(event, payload))

        assert captured == [(STRUCTURE, {"drive": "d"}, "d")]

    def test_unmapped_event_broadcasts_nothing(self, captured, monkeypatch):
        monkeypatch.setattr(
            event_hooks, "_file_ids_to_drives", lambda ids: {"f1": "d"}
        )

        _run(event_hooks.emit("something.else", {"file_ids": ["f1"]}))

        assert captured == []


class TestPerDriveFanOut:
    def test_cross_drive_batch_produces_one_broadcast_per_drive(
        self, captured, monkeypatch
    ):
        # The startup auto-purge (main.py) emits every purged id from every
        # drive in a single event. One broadcast cannot express that.
        monkeypatch.setattr(
            event_hooks,
            "_file_ids_to_drives",
            lambda ids: {"a1": "alpha", "a2": "alpha", "b1": "beta"},
        )

        _run(
            event_hooks.emit("files.purged", {"file_ids": ["a1", "a2", "b1"]})
        )

        assert len(captured) == 2
        assert _drives(captured) == ["alpha", "beta"]
        # Each broadcast is scoped, so the access filter can do its job.
        for event, data, drive in captured:
            assert event == STRUCTURE
            assert data == {"drive": drive}

    def test_large_batches_are_chunked(self, captured, monkeypatch):
        # One event can carry every expired id in the library (the startup
        # auto-purge), and the lookup expands ids into an IN clause.
        seen_sizes: list[int] = []

        def fake_lookup(ids):
            seen_sizes.append(len(ids))
            return {i: "alpha" for i in ids}

        monkeypatch.setattr(event_hooks, "_file_ids_to_drives", fake_lookup)

        ids = [f"id{n}" for n in range(1200)]
        _run(event_hooks.emit("files.purged", {"file_ids": ids}))

        assert max(seen_sizes) <= event_hooks._DRIVE_LOOKUP_CHUNK
        assert sum(seen_sizes) == 1200
        # Still one broadcast for the one drive they all belong to.
        assert captured == [(STRUCTURE, {"drive": "alpha"}, "alpha")]

    def test_ids_are_never_in_the_payload(self, captured, monkeypatch):
        monkeypatch.setattr(
            event_hooks, "_file_ids_to_drives", lambda ids: {"secret-id": "vault"}
        )

        _run(
            event_hooks.emit("files.created", {"file_ids": ["secret-id"]})
        )

        (_event, data, _drive) = captured[0]
        assert data == {"drive": "vault"}
        assert "file_ids" not in data


class TestFailClosed:
    """Broadcast filtering *is* the recipient set, so it must fail closed.

    The webhook path deliberately fails open — its recipient is one known
    addon. Reusing that default here would send a protected drive's change
    notification to every connection.
    """

    def test_unresolvable_ids_broadcast_nothing(self, captured, monkeypatch):
        monkeypatch.setattr(event_hooks, "_file_ids_to_drives", lambda ids: {})

        _run(event_hooks.emit("files.created", {"file_ids": ["f1"]}))

        assert captured == []

    def test_lookup_failure_broadcasts_nothing(self, captured, monkeypatch):
        def boom(_ids):
            raise RuntimeError("db is down")

        monkeypatch.setattr(event_hooks, "_file_ids_to_drives", boom)

        _run(event_hooks.emit("files.created", {"file_ids": ["f1"]}))

        assert captured == []

    def test_missing_drive_and_ids_broadcasts_nothing(self, captured):
        _run(event_hooks.emit("files.created", {}))

        assert captured == []

    def test_broadcast_failure_does_not_break_the_caller(
        self, captured, monkeypatch
    ):
        monkeypatch.setattr(
            event_hooks, "_file_ids_to_drives", lambda ids: {"f1": "d"}
        )

        async def boom(event, data, drive=None):
            raise RuntimeError("socket gone")

        import app.services.ws as ws

        monkeypatch.setattr(ws.manager, "broadcast", boom)

        # Notification is best effort; a write must never fail because a
        # browser could not be told about it.
        _run(event_hooks.emit("files.created", {"file_ids": ["f1"]}))


class TestWebhookPathUnchanged:
    def test_listeners_still_receive_the_original_event(self, monkeypatch):
        sent: list[tuple[str, dict]] = []

        monkeypatch.setattr(
            event_hooks,
            "_hooks",
            {"files.created": [{"url": "http://addon:1/hook"}]},
        )
        monkeypatch.setattr(
            event_hooks, "_file_ids_to_drives", lambda ids: {"f1": "d"}
        )
        monkeypatch.setattr(
            event_hooks,
            "_filter_payload_for_listener",
            lambda data, hook: data,
        )

        import app.services.ws as ws

        async def noop(event, data, drive=None):
            return None

        monkeypatch.setattr(ws.manager, "broadcast", noop)

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_a):
                return False

        def fake_urlopen(req, timeout=None):
            sent.append((req.full_url, req.data))
            return FakeResponse()

        monkeypatch.setattr(event_hooks.urllib.request, "urlopen", fake_urlopen)

        event_hooks.emit_sync("files.created", {"file_ids": ["f1"]})

        # The addon still gets the fine-grained event and its ids; only the
        # browser gets the coarse one.
        assert len(sent) == 1
        url, body = sent[0]
        assert url == "http://addon:1/hook"
        assert b"f1" in body
