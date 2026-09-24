# WebSocket events

Litloft pushes live updates to browsers over one WebSocket. It also POSTs lifecycle events to addon services as webhooks. This page covers both.

## Connection

`ws://<host>:<port>/api/ws`

- Authentication: the `access_token` JWT cookie decides which protected drives' events the connection receives. A connection without it is accepted and receives events for public drives only. The socket does not read an `Authorization` header.
- The backend accepts at most 100 connections in total. Beyond that, the socket is closed with code `1008` ("Too many connections").
- Every message is `{ "event": "<name>", "data": { ... } }`.
- Every connection receives every event it is allowed to see. There is no subscribe protocol; the server ignores anything the client sends.

## Browser events

The core broadcasts these five events.

`drive.structure_changed`
- When: files or folders in a drive were created, trashed, moved, renamed, restored, recovered, found missing or purged, or a scan or upload finished.
- Payload: `{ "drive": "..." }`.

`drive.file_updated`
- When: a file's content, title, description, tags, favourite, like or trust tier changed.
- Payload: `{ "drive": "..." }`.

Both are derived from the [webhook events](#event-hook-webhooks) below: `files.updated` becomes `drive.file_updated`, and every other webhook event becomes `drive.structure_changed`. They are sent once per affected drive, with no file ids. When the drive cannot be determined, nothing is sent.

`scan:progress`
- When: during a scan, every 50 files or at least once per second.
- Payload: `{ "drive", "added", "total" }`. `total` is the number of files processed so far.

`scan:complete`
- When: a drive scan finished.
- Payload: `{ "drive", "added", "missing", "recovered", "moved", "updated", "total" }`. `missing` counts files that became Missing in this scan. `total` is the drive's active file count afterwards.

`upload:complete`
- When: a chunked upload finished, including one that revived a Missing file at the same path.
- Payload: `{ "drive", "file_id", "filename" }`.

The core sends no event for chapters or version history.

### Addon events

An in-process addon calls the core broadcaster directly. An external-service addon sends `POST /api/internal/addon-events` with `{ event, data, drive? }`, and the core broadcasts `data` unchanged. `event` must match `^[a-z][a-z0-9_.]*$` and be at most 128 characters, so colons and hyphens are rejected with `422`. Send `X-Internal-Secret` when `CORE_INTERNAL_SECRET` is set.

To tell browsers that core-owned data changed, an in-process addon emits the core's webhook event (for example `files.updated`) instead of broadcasting, so the core sends `drive.file_updated`.

Events in use (each addon's page describes its payloads):

- cloud-sync: `sync:progress` (`{ drive, bytes_transferred, total_bytes, speed, eta, percent, transfers, total_transfers }`), `sync:complete` (`{ drive, transferred_files, transferred_bytes, errors, elapsed_seconds }`), `sync:error` (`{ drive, message, kind }`, where `kind` is `"auth_expired"` or `null`). These are broadcast without a drive scope, so every connection receives them.
- media_import: `media_import.subscription.sync_started`, `media_import.subscription.sync_completed` (both `{ subscription_id, drive, ... }`).
- intelligence: `intelligence.transcription.completed` / `.failed`; `intelligence.refine.started` / `.progress` / `.completed` / `.failed`; `intelligence.vision_describe.started` / `.succeeded` / `.failed` / `.unsupported`; `intelligence.video_visual.started` / `.progress` / `.partial` / `.succeeded` / `.failed`; `intelligence.chapter_suggestions.ready` / `.failed`; `intelligence.detailed_summary.updated` / `.citations_ready`. `intelligence.vision_describe.failed` carries a `reason`: `load`, `decode`, `model_missing`, `image_rejected`, `vision_rejected`, `token_budget`, `malformed`, `empty` or `request_failed`. See [Vision describe](../addons/intelligence.md#vision-describe).
- knowledge: `knowledge.active_summary.changed`, `knowledge.note.created`, `knowledge.distilled.created`, `knowledge.clip.ready` / `.failed`.

## Event-hook webhooks

These are HTTP POSTs to addon services, not browser events. Listeners are registered in `event-hooks.json`.

| Event | Payload | When |
|---|---|---|
| `files.created` | `{file_ids}` | A file was copied (single or batch) or created with `POST /api/drives/{drive}/files`. |
| `files.updated` | `{file_ids}` | A file's title or description, like, favourite, tags (single or batch), trust tier or content changed, or the Markdown image import rewrote it. |
| `files.deleted` | `{file_ids, type: "soft_delete"}` | Files were moved to trash (single or batch). |
| `files.restored` | `{file_ids}` | Files were restored from trash. |
| `files.missing` | `{file_ids}` | A scan found active files gone from disk. |
| `files.recovered` | `{file_ids}` | A Missing file came back: a scan found it again, an upload landed at its path, or a text-file create reused its row. |
| `files.moved` | `{file_ids}` | Files were renamed or moved (single, batch or pattern rename), a folder was renamed or moved, or a scan detected a move. |
| `files.purged` | `{file_ids}` | Files were deleted permanently: purge, batch purge, empty trash, purge all Missing, or the 30-day trash auto-purge. One event per operation. |
| `folders.created` | `{drive, path}` | A folder was created. |
| `folders.moved` | `{drive, old_path, new_path}` | A folder was renamed or moved, including an empty one. |
| `folders.deleted` | `{drive, path}` | A folder was deleted. |
| `scan.complete` | `{drive, added, missing, recovered, moved}` | A drive scan finished. An upload also sends `{drive, added: 1, removed: 0}`, and media_import sends `{drive}` alone, so do not rely on the counter keys. |

`files.*` payloads carry ids and no `drive`. `folders.*` and `scan.complete` carry `drive` and no ids.

`event-hooks.json` is not shipped. `configure.py` builds it from the `event_hooks` array in each enabled addon's `manifest.json` (a URL is registered once) and mounts it read-only at `/app/event-hooks.json`; `EVENT_HOOKS_PATH` overrides the path. `backend/event-hooks.json.example` shows every option. Without the file, no webhook is sent.

A listener with a `secret_env` key receives the value of that environment variable in an `X-Webhook-Secret` header.

A listener with an `addon` key (and optional `feature`, default `index`) only receives events for drives where that addon feature is on. An event with a `drive` is dropped for a drive where it is off. An event with `file_ids` keeps only the ids on drives where it is on, and is dropped if none remain. Listeners without `addon` receive everything.

See [File states](file-states.md) for what Active, Missing and Trash mean.

## Filtering

An event broadcast with a drive reaches only connections that can access that drive. An event broadcast without a drive, such as the cloud-sync events or an `addon-events` call without `drive`, reaches every connection. An event naming a drive that is not in `drives.json` is dropped.

## Missed events

Delivery is not guaranteed, and nothing is replayed:

- The browser closes the socket while the tab is hidden and reconnects when it is shown again.
- After a disconnect, the browser reconnects with exponential backoff, starting at 1 s and capped at 30 s.

The web app's file listings and folder tree refetch after every reconnect. A client of your own should do the same.

## Custom Server proxy

`frontend/server.js` is the production entry point. It listens on the public port and:

- proxies WebSocket upgrades on `/api/ws` to the backend, with cookies, and drops any other upgrade;
- answers `/api/internal/*` with `404`;
- sends everything else to Next.js, which forwards `/api/*` to the backend.

`pnpm dev` runs plain `next dev`, which has no WebSocket proxy.

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

For protected drives, send the `access_token` cookie:

```python
import http.cookies
cookies = http.cookies.SimpleCookie()
cookies["access_token"] = "<jwt>"
headers = [("Cookie", cookies.output(header="").strip())]
async with websockets.connect("ws://...", extra_headers=headers) as ws:
    ...
```
