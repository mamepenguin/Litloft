# WebSocket events

Litloft uses a single WebSocket endpoint for live updates. The frontend Custom Server proxies it; the backend serves the actual connection.

## Connection

`ws://<host>:<port>/api/ws`

- Authentication: cookie-based. Connections from unauthenticated viewers are accepted (so a fully-public mode works); only events scoped to protected drives are filtered out for them.
- The connection is multiplexed: every event carries a `type` and a payload. Clients filter client-side.

## Events

### Lifecycle

`files.added`
- When: a scanner pass discovered a new file, or an upload completed.
- Payload: `{ "drive": "...", "file_ids": [<id>, ...] }`.

`files.removed`
- When: user-initiated soft delete (move to trash). (Older docs use `files.deleted` — same event.)
- Payload: `{ "drive": "...", "file_ids": [...] }`.

`files.restored`
- When: a trashed file was restored.
- Payload: `{ "drive": "...", "file_ids": [...] }`.

`files.missing`
- When: the scanner observed that a file disappeared from disk while still being in the DB as Active.
- Payload: `{ "drive": "...", "file_ids": [...] }`.

`files.recovered`
- When: a missing file reappeared on disk.
- Payload: `{ "drive": "...", "file_ids": [...] }`.

`files.purged`
- When: explicit user-initiated hard delete or auto-purge (trash older than 30 days). The scanner never emits this — it emits `files.missing` instead.
- Payload: `{ "drive": "...", "file_ids": [...] }`.
- Auto-purge events are batched in groups of 200.

`scan.complete`
- When: a drive scan finished.
- Payload: `{ "drive": "...", "added": N, "removed": M }`.

### addon-emitted events

Addons can publish their own events through `POST /api/internal/addon-events`. The bridge re-broadcasts them on the same WS so the frontend can subscribe uniformly. Naming convention: `<addon_name>:<event>` (e.g. `sync:progress` from cloud-sync).

Examples (cloud-sync):

- `sync:started` — `{ drive, started_at }`
- `sync:progress` — `{ drive, transferred, total, speed, eta }`
- `sync:complete` — `{ drive, transferred, duration_s, errors }`
- `sync:error` — `{ drive, message, retryable }`

Examples (intelligence):

- `intelligence:index-progress` — `{ drive, queued, in_progress, completed }`
- `intelligence:transcription-started` — `{ file_id }`
- `intelligence:transcription-completed` — `{ file_id, duration_s }`

The exact event names and payloads are addon-versioned; check each addon's docs.

## Filtering

The backend applies access-group filtering before sending. A viewer with no unlocked groups never receives events for protected drives — including `files.added`, etc.

For unauthenticated connections (no `lit_viewer` cookie), public-drive events still arrive.

## Reconnection

The frontend reconnects on disconnect with exponential backoff. The server has no resume-from-event-id mechanism; on reconnect, the client refetches state for any visible page rather than replaying missed events.

## Custom Server proxy

The proxy lives in `frontend/server.js` and forwards `/api/ws` upgrades to `backend:8000/api/ws` with cookies preserved. This is the only externally-reachable path to the backend; direct backend access is not exposed.

## Threading note

The backend runs the scanner in a background thread. WebSocket emits from the scanner are bridged to the asyncio loop with `loop.run_in_executor` → `loop.call_soon_threadsafe`, so events are ordered consistently with HTTP responses.

## Use in scripts

A minimal listener:

```python
import asyncio, websockets, json

async def main():
    async with websockets.connect("ws://localhost:3000/api/ws") as ws:
        async for raw in ws:
            event = json.loads(raw)
            print(event["type"], event.get("payload"))

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
