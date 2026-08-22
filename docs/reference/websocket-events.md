# WebSocket events

Litloft has a single WebSocket endpoint for live browser updates. The frontend Custom Server proxies it; the backend serves the actual connection.

## Connection

`ws://<host>:<port>/api/ws`

- Authentication: cookie-based. The endpoint reads the `access_token` JWT cookie to derive the connection's unlocked access groups. Connections without it are accepted with an empty group list (so a fully-public mode works); only events scoped to protected drives are filtered out for them.
- Connection cap: the backend accepts at most 100 concurrent WebSocket connections. Beyond that the socket is closed immediately with close code `1008` ("Too many connections"). This is a global cap, not per-viewer.
- Message envelope: every message is `{ "event": "<name>", "data": { ... } }`. Clients filter on `event` client-side.
- The server never reads inbound frames for anything: it reads and discards them purely to detect disconnects. There is no subscribe/unsubscribe protocol — every eligible connection gets every eligible event.

## Two delivery systems (read this first)

Litloft dispatches notifications through **two independent systems**. Confusing them is the most common source of integration bugs.

| | WebSocket broadcast | Event-hook webhook |
|---|---|---|
| Target | The **browser** (this endpoint) | **Addon services** (HTTP POST) |
| Mechanism | `ws_manager.broadcast` | `event-hooks.json` → `httpx`/`urllib` POST |
| Configured by | Nothing — always on | `event-hooks.json` (no file → no-op) |

The two carry **different granularity on purpose**. Addon listeners receive the fine-grained lifecycle event with the ids it concerns (`files.created`, `folders.moved`, and so on). Browsers receive one of two coarse events saying only which drive changed, because every browser subscriber refetches its listing rather than patching it from the payload — the name is the whole signal, and leaving the ids out means a protected drive's item count and timing are not broadcast either.

An event-hook webhook still does not reach the browser as itself; an addon that wants its own event there relays it via `POST /api/internal/addon-events`.

Names are not a reliable way to tell the two apart. A colon means browser-only, but the reverse does not hold: most addon events reaching the browser use dots as well.

## Browser WebSocket events

These are the events the core broadcasts directly to connected browsers. This list is exhaustive for the core: no other core code path calls the broadcaster.

`scan:progress`
- When: during a scan, every 50 files or at most once per second.
- Payload: `{ "drive": "...", "added": N, "total": M }` — `total` is items processed so far, not the final count.
- Drive-scoped (access-filtered).

`scan:complete`
- When: a drive scan finished.
- Payload: `{ "drive": "...", "added": N, "missing": N, "recovered": N, "moved": N, "updated": N, "total": N }` — `missing` counts files that flipped to Missing *on this pass*, not the drive's total Missing count. `total` is the active file count for the drive after the pass.
- Drive-scoped (access-filtered).

`upload:complete`
- When: a chunked upload finalised (including when it revived a Missing-state file at the same path).
- Payload: `{ "drive": "...", "file_id": "...", "filename": "..." }`.
- Drive-scoped (access-filtered).

`drive.structure_changed`
- When: the set of files or folders in a drive changed — a create, soft delete, move, rename, restore, recovery, a file going missing, a purge, a folder created / moved / deleted, or a scan finishing. Emitted from the same place as the corresponding webhook, so every producer is covered: routes, the scanner, uploads, and the startup auto-purge.
- Payload: `{ "drive": "..." }`. No ids.
- Drive-scoped (access-filtered). One broadcast per affected drive, so a batch spanning drives produces one event each rather than a single unscoped one.

`drive.file_updated`
- When: a file's contents were written.
- Payload: `{ "drive": "..." }`.
- Drive-scoped (access-filtered).
- Separate from `drive.structure_changed` so a subscriber can ignore content writes. The folder tree does exactly that: the Markdown editor autosaves on a 2-second debounce, and refetching the tree on each one would make it flicker while the user types.

Both are best effort. When the drive behind an event cannot be determined, nothing is broadcast rather than something unscoped — the drive filter *is* the recipient set here, so failing open would mean sending to every connection.

Nothing in the core broadcasts for chapters or for file version history. Both are read back by ordinary HTTP requests; there is no live event for either.

### Addon events

Addons reach the browser two different ways, depending on how they are deployed.

**In-process addons** (`addons/<name>/backend/`, loaded into the core process) import `app.services.ws` and call the broadcaster directly. No bridge, no name constraints:

- cloud-sync — `sync:progress` (`{drive, bytes_transferred, total_bytes, speed, eta, percent, transfers, total_transfers}`), `sync:complete` (`{drive, transferred_files, transferred_bytes, errors, elapsed_seconds}`), `sync:error` (`{drive, message}`)
- media_import — `media_import.subscription.sync_started`, `media_import.subscription.sync_completed` (both `{subscription_id, drive, ...}`). It also broadcasts `files.updated` (`{file_id, drive}`) after an import, reusing a core webhook name on the browser channel; see the note under the webhook table.

**Independent-service addons** run in their own containers and cannot reach the broadcaster, so they `POST /api/internal/addon-events` with `{event, data, drive?}` and the core relays the payload verbatim. When `drive` is set the relay is access-filtered like any other broadcast; without it the event reaches every connection.

That endpoint validates `event` against `^[a-z][a-z0-9_.]*$`, max 128 characters — **colons and hyphens are rejected with 422**, which is why only in-process addons can use a colon name. Send the `X-Internal-Secret` header whenever `CORE_INTERNAL_SECRET` is configured.

Names in use today (the addons own these; check each addon's docs before relying on a payload shape):

- intelligence — `intelligence.transcription.completed`, `intelligence.transcription.failed`, `intelligence.refine.started` / `.progress` / `.completed` / `.failed`, `intelligence.vision_describe.started` / `.succeeded` / `.failed` / `.unsupported`, `intelligence.video_visual.started` / `.progress` / `.partial` / `.succeeded` / `.failed`, `intelligence.chapter_suggestions.ready` / `.failed`, `intelligence.detailed_summary.updated` / `.citations_ready`
- knowledge — `knowledge.active_summary.changed`, `knowledge.note.created`, `knowledge.distilled.created`, `knowledge.clip.ready` / `.failed`

## Event-hook webhooks (addon-facing)

These fire as HTTP POSTs to URLs registered in `event-hooks.json`. They are the contract addons subscribe to, **not** browser WebSocket events.

| Event | Payload | When |
|---|---|---|
| `files.created` | `{file_ids}` | A new file row was created (copy, text-file create, batch copy). |
| `files.updated` | `{file_ids}` | A file row's metadata or content changed (`PUT /api/files/{id}` field edit, favorite toggle, tag edit, batch tag edit, content `PUT`, markdown image import). |
| `files.deleted` | `{file_ids, type: "soft_delete"}` | Soft delete (move to trash). |
| `files.restored` | `{file_ids}` | A trashed file was restored. |
| `files.missing` | `{file_ids}` | Scanner found an Active file gone from disk (first pass, no grace period). |
| `files.recovered` | `{file_ids}` | A Missing file came back — scanner saw it again, an upload landed at its path, or a text-file create reused its row. |
| `files.moved` | `{file_ids}` | Rename / move / batch move / folder rename / folder move, or scanner move-detection. (Also WebSocket-broadcast for the file-level rename and move paths — see above.) |
| `files.purged` | `{file_ids}` | Hard delete, empty-trash, purge-all-missing, or the 30-day trash auto-purge. One event carrying every purged id, not one per DB batch. |
| `folders.created` | `{drive, path}` | A folder was created. |
| `folders.moved` | `{drive, old_path, new_path}` | A folder was renamed or moved. Emitted even when the folder held no files, so empty-folder renames stay observable. |
| `folders.deleted` | `{drive, path}` | A folder was deleted. |
| `scan.complete` | `{drive, added, missing, recovered, moved}` | A drive scan finished. Two other paths reuse this event with reduced payloads to nudge index subscribers without waiting for a scan: a chunked upload emits `{drive, added: 1, removed: 0}`, and media_import emits `{drive}` alone. Subscribers must not assume the counter keys are present. |

Note the asymmetry: `files.*` payloads carry no `drive` key, only ids. `folders.*` and `scan.complete` carry `drive` and no ids.

One divergence to watch: media_import's direct browser broadcast reuses the name `files.updated` but sends `{file_id, drive}` — singular `file_id`, plus a `drive` — where the core's webhook sends `{file_ids}`. Anything reading the payload of a `files.updated` has to handle both. The core's own subscribers sidestep this by ignoring payloads entirely and refetching.

`event-hooks.json` is not shipped. `configure.py` generates it from the `event_hooks` array in each enabled addon's `manifest.json` (deduplicated by URL) and mounts it read-only at `/app/event-hooks.json`. A hand-written template with the full option list lives at `backend/event-hooks.json.example`. If the file is absent, every `emit` is a silent no-op.

Per-listener `addon`/`feature` keys apply per-drive policy filtering before dispatch: an event whose payload names a `drive` is dropped when that addon feature is off for the drive, and an event carrying `file_ids` has its ids filtered per owning drive (dropped entirely if none remain). Listeners with no `addon` key pass through unfiltered.

See [file states](file-states.md) for the lifecycle semantics behind these events.

## What the browser client subscribes to

- The file list (`useFolderFiles`) and the folder tree (`FolderTreePane`) subscribe to the dot-named structure set — `files.created`, `files.moved`, `files.deleted`, `files.restored`, `files.recovered`, `files.purged`, `folders.created`, `folders.deleted`, `folders.moved`, `scan.complete` (the file list adds `files.updated`). They ignore the payload and refetch.
- The drive home folder grid subscribes to `folders.moved`, `folders.created`, `folders.deleted`, `files.moved`, `scan.complete`.
- The sidebar and the admin dashboard subscribe to `scan:complete`.
- The file-detail active-summary panel subscribes to `knowledge.active_summary.changed`.

Of these, the only ones the **core** itself broadcasts are `files.moved` and `scan:complete`. The rest of the dot-named structure set (`files.created`, `files.deleted`, `folders.*`, `scan.complete`, ...) are webhook names — the core never puts them on the WebSocket, so those subscriptions fire only if an addon publishes the same name to the browser. Today the one addon doing that is media_import, which broadcasts `files.updated` and is the reason that subscription exists.

`scan:progress` and `upload:complete` are broadcast by the core but currently have no subscriber.

Bursts arriving in the same microtask (a scan emitting missing, then recovered, then moved) are coalesced into a single refresh callback. Independently of WebSocket events, the client refetches visible state on reconnect and on tab refocus, so a missed event is not permanently stale.

## Filtering

The backend applies access-group filtering before sending. A viewer with no unlocked groups never receives events for protected drives. Drive scoping requires the broadcast to pass a `drive`; events broadcast without one (e.g. batch `files.moved`) are not access-filtered. A broadcast naming a drive that is not in `drives.json` is logged and dropped rather than sent unscoped.

For unauthenticated connections (no `access_token` cookie), public-drive events still arrive.

## Reconnection

The frontend reconnects on disconnect with exponential backoff (base 1 s, capped at 30 s) and closes the socket while the tab is hidden, reconnecting on refocus. There is no resume-from-event-id mechanism; on reconnect the client refetches state for the visible page rather than replaying missed events.

## Custom Server proxy

The proxy lives in `frontend/server.js`, the Docker production entry point (`pnpm dev` runs plain `next dev` with HTTP rewrites and no WebSocket proxy). It listens on the public port, starts Next.js on an internal port, and routes:

- `/api/ws` upgrades → `backend:8000/api/ws`, cookies preserved. Any other upgrade request has its socket destroyed.
- `/api/files/{id}/stream` → straight to the backend, bypassing Next.js (the two-hop chain stalls large downloads near completion).
- `/api/internal/*` → `404` at the edge, so the Internal API stays reachable only from the Docker network.
- everything else → Next.js.

The backend is not otherwise exposed; this proxy is the only path to it.

## Threading note

The scanner and the upload finaliser run in worker threads. Their broadcasts go through `broadcast_from_thread`, which schedules the coroutine on the stored event loop with `call_soon_threadsafe`. If no loop is available the broadcast is logged and dropped rather than raising into the worker.

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
