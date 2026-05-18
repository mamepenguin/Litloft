# WebSocket events

Litloft has a single WebSocket endpoint for live browser updates. The frontend Custom Server proxies it; the backend serves the actual connection.

## Connection

`ws://<host>:<port>/api/ws`

- Authentication: cookie-based. Connections from unauthenticated viewers are accepted (so a fully-public mode works); only events scoped to protected drives are filtered out for them.
- Connection cap: the backend accepts at most 100 concurrent WebSocket connections. Beyond that the socket is closed immediately with close code `1008` ("Too many connections"). This is a global cap, not per-viewer.
- Message envelope: every message is `{ "event": "<name>", "data": { ... } }`. Clients filter on `event` client-side.

## Two delivery systems (read this first)

Litloft dispatches notifications through **two independent systems**. Confusing them is the most common source of integration bugs.

| | WebSocket broadcast | Event-hook webhook |
|---|---|---|
| Target | The **browser** (this endpoint) | **Addon services** (HTTP POST) |
| Mechanism | `ws_manager.broadcast` | `event-hooks.json` → `httpx`/`urllib` POST |
| Naming | `name:subname` (**colon**) | `name.subname` (**dot**) |
| Configured by | Nothing — always on | `event-hooks.json` (no file → no-op) |

The two are **not** automatically bridged. An event-hook webhook does not reach the browser unless an addon explicitly relays it back via `POST /api/internal/addon-events`. The colon-vs-dot spelling is the quickest way to tell which system a given event name belongs to (the one documented exception is `files.moved`, see below).

## Browser WebSocket events

These are the events the core broadcasts directly to connected browsers.

`scan:progress`
- When: during a scan, every 50 files or at most once per second.
- Payload: `{ "drive": "...", "added": N, "total": M }` — `total` is items processed so far, not the final count.

`scan:complete`
- When: a drive scan finished.
- Payload: `{ "drive": "...", "added": N, "missing": N, "recovered": N, "moved": N, "updated": N, "total": N }` — `total` is the active file count for the drive after the pass.

`upload:complete`
- When: a chunked upload finalised (including when it revived a Missing-state file at the same path).
- Payload: `{ "drive": "...", "file_id": "...", "filename": "..." }`.

`files.moved`
- When: a rename, a single move, or a batch move completed. **This is the one event emitted on both systems** — the route handler broadcasts it on the WebSocket *and* fires the `files.moved` webhook, so the browser file list refreshes without an addon relay.
- Payload: `{ "file_ids": [...] }` (rename/move also pass `drive` for access-group scoping; batch move does not).
- Note: the scanner's out-of-band move detection (same `(file_hash, file_size)`, unambiguous single-candidate match) fires the `files.moved` **webhook only** — it does not WebSocket-broadcast.

Addon-relayed events (`<addon>:<event>`) — addons cannot reach the host broadcaster directly, so they `POST /api/internal/addon-events` and the core relays the payload to the browser. Examples:

- cloud-sync — `sync:started`, `sync:progress`, `sync:complete`, `sync:error`
- intelligence — `intelligence:index-progress`, `intelligence:transcription-started`, `intelligence:transcription-completed`

Exact addon event names and payloads are addon-versioned; check each addon's docs.

## Event-hook webhooks (addon-facing)

These fire as HTTP POSTs to URLs registered in `event-hooks.json`. They are the contract addons subscribe to, **not** browser WebSocket events. All payloads are `{ "file_ids": [...] }` unless noted — note there is **no `drive` key** in the lifecycle payloads.

| Event | When |
|---|---|
| `files.created` | A new file row was created (upload, copy, create). |
| `files.updated` | A file row's metadata changed. |
| `files.deleted` | Soft delete (move to trash). Payload adds `"type": "soft_delete"`. |
| `files.restored` | A trashed file was restored. |
| `files.missing` | Scanner found an Active file gone from disk (first pass, no grace period). |
| `files.recovered` | A Missing file reappeared at its path. |
| `files.moved` | Rename/move/batch-move, or scanner move-detection. (Also WebSocket-broadcast — see above.) |
| `files.purged` | Hard delete or 30-day trash auto-purge. Auto-purge batches in groups of 200. |
| `scan.complete` | A drive scan finished. Payload `{ "drive", "added", "missing", "recovered", "moved" }`. |

The shipped `event-hooks.json` routes these to the intelligence addon (`http://intelligence:8100/webhook/...`) for incremental re-indexing. Per-listener `addon`/`feature` keys apply per-drive policy filtering before dispatch. See [file states](file-states.md) for the lifecycle semantics behind these events.

## What the browser client subscribes to

The frontend file/folder views subscribe to a superset of dot-named lifecycle events (`files.created`, `files.updated`, `files.moved`, `files.deleted`, `files.restored`, `files.recovered`, `files.purged`, `scan.complete`); the admin dashboard and sidebar subscribe to `scan:complete`. Of these, the events the **core alone** delivers to the browser are `files.moved`, `scan:progress`, `scan:complete`, and `upload:complete`. The remaining dot-named subscriptions only fire when an addon relays the corresponding event back through `/api/internal/addon-events`. Independently of WebSocket events, the client also refetches visible state on reconnect and on tab refocus, so a missed event is not permanently stale.

## Filtering

The backend applies access-group filtering before sending. A viewer with no unlocked groups never receives events for protected drives. Drive scoping requires the broadcast to pass a `drive`; events broadcast without one (e.g. batch `files.moved`) are not access-filtered.

For unauthenticated connections (no `lit_viewer` cookie), public-drive events still arrive.

## Reconnection

The frontend reconnects on disconnect with exponential backoff (base 1 s, capped at 30 s) and closes the socket while the tab is hidden, reconnecting on refocus. There is no resume-from-event-id mechanism; on reconnect the client refetches state for the visible page rather than replaying missed events.

## Custom Server proxy

The proxy lives in `frontend/server.js` and forwards `/api/ws` upgrades to `backend:8000/api/ws` with cookies preserved. This is the only externally reachable path to the backend; direct backend access is not exposed.

## Threading note

The scanner runs in a background thread. Its WebSocket emits are bridged to the asyncio loop with `call_soon_threadsafe`, so they stay ordered consistently with HTTP responses.

## Use in scripts

A minimal listener:

```python
import asyncio, websockets, json

async def main():
    async with websockets.connect("ws://localhost:3000/api/ws") as ws:
        async for raw in ws:
            msg = json.loads(raw)
            print(msg["event"], msg.get("data"))

asyncio.run(main())
```

For protected drives, attach the `access_token` cookie:

```python
import http.cookies
cookies = http.cookies.SimpleCookie()
cookies["access_token"] = "<jwt>"
headers = [("Cookie", cookies.output(header="").strip())]
async with websockets.connect("ws://...", extra_headers=headers) as ws:
    ...
```
