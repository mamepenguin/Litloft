# Inbox: what arrived in a drive and has not been dealt with

SPEC-ID: SPEC-CORE-032
SPEC-ID: SPEC-ADDON-059
SPEC-ID: SPEC-CORE-041

Approval:

## Summary

Files reach a drive in several ways, and nothing shows the viewer which of them are new
and still waiting for attention. The inbox is a per-drive view of the files that arrived
on purpose (an upload, a web clip, later a share from a phone) and that the viewer has
not yet marked done, filed, tagged or thrown away. The files stay where they landed; the
inbox is a list beside them, not a folder.

- **SPEC-CORE-032**: the `inbox_items` table, the core upload path recording an arrival
  when the upload says so, the rules that close a row (an explicit **済み**, or moving,
  trashing or tagging the file), the drive's inbox page under the sidebar's **ホーム**
  row with the open count, the `inbox.updated` event, and retention of done rows.
- **SPEC-ADDON-059**: a generic Internal API write by which an addon records an arrival,
  and the knowledge addon recording every web clip through it.
- **SPEC-CORE-041**: a read-only MCP tool that lists a drive's open inbox.

Out of scope: the phone share menu (C4, which will record through the core upload path
with its own source), scanner finds, media_import (subscriptions and single imports),
quick notes, new notes, and attachments uploaded from inside an editor.

The user chose the per-drive table, the sources, the leaving rules, the sidebar placement
and the row design on 2026-11-04 (design artifact "C3 受信箱",
https://claude.ai/artifact/GLpzGcgSrj9sVjCRftYsiT). hako 2026-08-10 and 2026-10-02: media
import items are not an unprocessed inbox, and that stays true here.

## Required items

### 1. Normal flow

SPEC-CORE-032, recording:

1. `POST /api/drives/{drive}/upload/init` accepts an optional `inbox_source`. The only
   value this unit accepts is `"upload"`; any other value is 422. The session keeps it.
2. The frontend upload store (`useUpload.ts`: the upload zone, drag and drop, Add →
   Upload files, folder uploads with `relative_path`) sends `inbox_source: "upload"`.
   Every other caller of the upload path sends nothing: the knowledge editor's attachment
   upload, and MCP `upload_file`.
3. `complete_upload`, for a session with `inbox_source` that produced a file row (not a
   subtitle sidecar), writes the arrival in the same transaction as the file row:
   - no row for the file: insert `(drive, file_id, arrived_at=now, source="upload",
     source_i18n_key="inbox.sourceUpload", done_at=NULL)`;
   - a row exists (the upload reused a missing or ghost row and kept its id): set
     `arrived_at=now`, replace `source` and `source_i18n_key`, clear `done_at`.
   A trashed ghost is deleted by the upload as today; its row goes with it through the
   foreign key cascade, and the new file gets a new row.
4. After the commit the core broadcasts `inbox.updated` `{ "drive": <drive> }` with
   `drive` scoping.

SPEC-ADDON-059, recording from an addon:

1. `PUT /api/internal/files/{file_id}/arrival`, gated by `verify_internal_write_secret`
   (fails closed), body `{ "source": <str>, "i18n_key": <str> }` and nothing else
   (`source` matches `^[a-z][a-z0-9_.]{0,63}$`, `i18n_key` matches
   `^[A-Za-z][A-Za-z0-9_.]{0,127}$`). For an active file it writes the arrival exactly as
   step 3 above, with the given source and key, in the file's drive; answers 204; then
   broadcasts `inbox.updated` for that drive. The core does not interpret `source`.
2. Knowledge's `_create_placeholder` (`app/routers/clips.py`), which every clip entry
   point goes through (`POST /clips`, `POST /clips/pasted`, and MCP `clip_url` /
   `clip_pasted`, which call those), calls it after the trust-tier declaration with
   `source: "web_clip"`, `i18n_key: "knowledge.inbox.sourceWebClip"`, through a new
   `InternalClient.record_arrival(file_id, source, i18n_key)`.
3. The clip's later rename-on-ready (`PUT /api/files/{id}/rename`) keeps the file id, so
   the row follows the file and stays open.

SPEC-CORE-032, reading and leaving:

1. `GET /api/drives/{drive}/inbox?before=<cursor>&limit=<n>` (limit 1 to 100, default
   100) answers `{ "items": [ { "file": FileResponse, "arrived_at", "source",
   "source_i18n_key" } … ], "next": <cursor|null>, "open_count": <int> }`: open rows
   (`done_at` NULL) of that drive whose file passes `active_file_filter()`, newest
   `arrived_at` first, ties by file id descending. The cursor is the last item's
   `(arrived_at, file_id)`.
2. `GET /api/drives/{drive}/inbox/count` answers `{ "open": <int> }` under the same
   filter.
3. `POST /api/drives/{drive}/inbox/done` takes either `{ "file_ids": [ … ] }` (1 to 1000)
   or `{ "all": true, "up_to": <arrived_at> }`. It sets one `done_at` timestamp on every
   open row of that drive that is named (ids of other drives, unknown ids and rows already
   done are skipped) or, for `all`, on every open row with `arrived_at <= up_to`. It
   answers `{ "done": <count>, "done_at": <timestamp> }` and broadcasts `inbox.updated`.
4. `POST /api/drives/{drive}/inbox/undo` takes `{ "done_at": <timestamp> }` and clears
   `done_at` on that drive's rows whose `done_at` equals it; `arrived_at` and `source`
   are untouched. It answers `{ "reopened": <count> }` and broadcasts `inbox.updated`.
5. A file action closes the row in the same transaction as the action, with
   `done_at=now`, and broadcasts `inbox.updated`:
   - a move within the drive (`fileops.move_file` with the same drive, from
     `PUT /api/files/{id}/move` and `PUT /api/files/batch/move`);
   - a move to another drive deletes the row instead (the drive boundary: a row never
     travels with its file), and `inbox.updated` goes to the source drive;
   - a trash: `fileops.delete_file` (single and batch) and `fileops.delete_folder` for
     every file it soft-deletes;
   - a viewer tag write: `PUT /api/files/{id}/tags` and `PUT /api/files/batch/tags` on
     success, and `PUT /api/files/{id}/content` when the tag set projected from the new
     frontmatter differs from the file's tags before the write (this is how chip edits
     of a `.md` reach the core through `saveFileTags`).
   Nothing else closes a row: opening the file, the view-only progress POST, playback,
   rename, folder rename or folder move, a copy, comments, likes, favorites, the internal
   tags endpoint and an upload's own frontmatter projection.
6. Restoring a trashed file leaves its row done. A file that goes missing keeps its row
   as it was (hidden by the filter), and the row reappears unchanged when the file
   recovers. Purging a file deletes its row through the cascade.
7. Once every 24 hours, in the existing trash auto-purge task, rows whose `done_at` is
   more than 30 days old are deleted. No event.

SPEC-CORE-032, the page:

1. The sidebar shows **受信箱** / **Inbox** (lucide `Inbox`) directly under **ホーム**,
   above **ライブラリ**, when a drive is current. It links to
   `/drive/{drive}?view=inbox`. Its trailing count is the current drive's open count,
   omitted at 0, `99+` above 99. No count is shown for any other drive.
2. The count is fetched on drive change and refetched on `inbox.updated` or
   `drive.structure_changed` for the current drive.
3. `?view=inbox` is a standalone view (no folder tree). Page header: title **受信箱**,
   under it `<drive> · N 件` / `<drive> · N items`, and a secondary button
   **すべて済みにする** / **Mark all done**, hidden when the list is empty.
4. Rows grouped by the viewer's local date of `arrived_at`: **今日** / **Today**,
   **昨日** / **Yesterday**, **それ以前** / **Earlier**. Each row: thumbnail (the existing
   file thumbnail or type icon), name, and a meta line with the source label (translated
   by `source_i18n_key`; a missing key shows `source`), the arrival time (`HH:mm` today,
   `昨日 HH:mm` / `Yesterday HH:mm` yesterday, the locale date earlier), the folder path
   with a trailing `/` or **ルート** / **Root** for the drive root, and the ingest stage.
   The next 100 load when the end of the list scrolls into view.
5. Ingest stage: the page asks `POST /api/files/processing` for its loaded rows (batches
   of 100), on load, on a `processing.updated` event naming a loaded row, and every 30 s
   while the page is visible and a loaded row is not ready. The row shows the label of
   the first stage in order that is `running` or `pending` with a spinner; else, if
   `ready`, **使えます** / **Ready** with a lucide `Check` in `accent-teal`; a `failed`
   stage adds the `AlertCircle` mark in `danger`; `unavailable` shows **確認できません**.
   A file the endpoint leaves out shows no stage.
6. Clicking a row opens the file detail page; the row stays open.
7. Each row has a trailing **済み** / **Done** button (Row Actions: revealed on hover or
   focus, always visible on a coarse pointer, 44 / 32 px targets). On a fine pointer each
   row also has a selection checkbox.
8. With one or more rows selected, the selection bar shows `N 件を選択` and **済み**,
   **移動**, **タグ**: **移動** opens the existing move dialog and **タグ** the existing
   tag dialog, so the row closes through the file action.
9. **済み** on a row, on a selection, or **すべて済みにする** (with `up_to` the newest
   loaded `arrived_at`) removes the rows from the list (carried per DESIGN.md §7) and
   shows a toast **N 件を済みにしました** / **Marked N done** with **元に戻す** / **Undo**
   for the toast's 5 s. Undo calls `/inbox/undo` with the returned `done_at` and the
   rows come back in place. The toast gains an optional action for this.
10. Below 768 px wide: no row button and no checkbox. Swiping a row left by more than
    a third of its width marks it done (same toast); a shorter swipe springs back over
    200 ms `ease-out`. A 500 ms long-press selects the row and enters selection mode,
    where taps toggle selection. Reduced motion moves nothing.
11. Empty: **受信箱は空です** / **Inbox is empty**, and under it
    **新しく届いたものがここに並びます** / **New arrivals appear here**.

SPEC-CORE-041:

1. MCP gains `list_inbox(drive, limit?, before?)`, calling `GET /api/drives/{drive}/inbox`
   and returning per item `file_id`, `filename`, `folder_path`, `source`, `arrived_at`,
   and `next`. There is no MCP tool to mark done or undo. MCP `move_file(s)`,
   `trash_file(s)`, `trash_folder`, `update_tags` and `add_tags` close rows as any caller
   of those endpoints does, and the tool description says so.

### 2. Failure cases

- Upload with an invalid `inbox_source`: 422 at init, nothing created.
- Upload that fails at complete: no file row, no inbox row (same transaction).
- Upload to a path that already holds a file: 409 at init as today; no arrival.
- Arrival call for a file that is trashed, missing or unknown: 404, nothing written.
- Arrival call without the write secret or with a wrong one: rejected as for
  `PUT /files/{id}/chapters`, nothing written. Knowledge logs a WARNING with the file id
  and status and still returns the clip (`202` / `201`): the clip exists, it is only
  absent from the inbox.
- Knowledge's trust-tier call fails: the clip already answers 502 today and the arrival
  call is not made.
- Done with ids from another drive, unknown ids or done rows: skipped, counted out.
- Undo with a `done_at` no row carries (already reopened, or a row closed since by
  another action has a different `done_at`): `reopened: 0`.
- A move whose filesystem step or DB step fails: rolled back as today, the row unchanged.
- A failed list or done request: the page keeps what it shows and shows the existing
  error toast; a failed done puts the rows back.
- WebSocket down or an event lost: the count and list are refetched on the next drive
  change, page load or event.

### 3. States

A file's inbox row:

| From | To | When |
|---|---|---|
| none | open | an arrival (upload with `inbox_source`, or the internal arrival call) |
| open | done | **済み** (row, selection, all), same-drive move, trash, viewer tag write |
| done | open | undo with its `done_at`; a new arrival for the same file |
| open | open, `arrived_at` renewed | a new arrival for the same file |
| open, done | none | move to another drive; the file purged (cascade) |
| done | none | 30 days after `done_at` |

Visibility is separate: an open row is listed and counted only while its file is active.
Trash closes the row; missing and recovery do not change it; restore does not reopen it.

### 4. Data read and written

- New table `inbox_items`: `id` integer PK, `drive` text not null, `file_id` VARCHAR(12)
  not null `REFERENCES files(id) ON DELETE CASCADE`, `arrived_at` datetime not null,
  `source` VARCHAR(64) not null, `source_i18n_key` VARCHAR(128) not null, `done_at`
  datetime null; `UniqueConstraint("drive", "file_id")`; index on
  `(drive, done_at, arrived_at)`. Created by `create_all`; no migration of existing rows
  (the inbox starts empty). Written by the upload complete, the internal arrival call,
  the done/undo endpoints, `move_file`, `delete_file`, `delete_folder`, the two tag
  endpoints, the content PUT, and the retention pass. Read by the list and count.
- `files`: read only (drive, active state, tags before the write).
- In-memory upload session: gains `inbox_source`.
- Knowledge DB: unchanged.
- Browser: the page's loaded rows, selection and stages, in memory.

### 5. External services

None outside the Docker network. Knowledge → core arrival call on the internal network.

### 6. Authorization

- Every `/api/drives/{drive}/inbox*` endpoint calls `check_drive_access`; a locked drive
  answers 404 as every drive route does. Done and undo act only on rows of that drive.
- `inbox_source` is accepted only on an upload the viewer may already make.
- The internal arrival call requires `CORE_INTERNAL_SECRET` and fails closed. Knowledge
  makes it only for a file it has just created through the core with the viewer's own
  credential, so the core has already checked drive access.
- `inbox.updated` is broadcast with `drive`, so a viewer who cannot open that drive never
  receives it. The payload is `{ "drive" }` only.
- Done is per drive, not per viewer: anyone who can open the drive sees and closes the
  same rows.

R1-R5 for `PUT /api/internal/files/{id}/arrival`:

| Rule | Result |
|---|---|
| R1 | The inbox is a core table rendered by a core page and the sidebar. Pass. |
| R2 | Path and body name no addon; `source` and `i18n_key` are opaque. Pass. |
| R3 | Knowledge is the only addon producer today; media_import is excluded by decision, and C4 records through the core upload path. Not met; see Checked, no action. |
| R4 | The core page, sidebar count and MCP read the rows the call writes. Pass. |
| R5 | An arrival is a fact about a core file, recorded into a core entity. Pass. |

### 7. Effect on existing features

- Upload: one optional init field; the upload store sends it. The at-most-two limit, the
  drawer and C2's processing view are unchanged.
- `move_file`, `delete_file`, `delete_folder`, the two tag endpoints and the content PUT
  each write one more table in their own transaction. Their responses and events are
  unchanged.
- The trash auto-purge task gains the done-row retention step.
- Toast: an optional action button; existing toasts unchanged.
- Selection bar: reused with an inbox action set.
- Sidebar: one row between **ホーム** and **ライブラリ**.
- Knowledge clips: one more internal call per clip; responses unchanged.
- MCP: one new tool; tag, move and trash tools now also close inbox rows.
- Home, Recently Added, media_import's Watch surface: unchanged.

### 8. Error behavior

As in 2. The core logs nothing new on success. Knowledge logs a failed arrival call at
WARNING. The page shows the existing error toast on a failed list, done or undo request.

### 9. User-visible behavior

As in 1. Docs: `docs/user-guide/inbox.md` (new: what arrives, what closes a row, swipe and
long-press), linked from `docs/user-guide/overview.md`; `docs/reference/api.md` (the four
endpoints and `inbox_source`); `docs/reference/websocket-events.md` (`inbox.updated`);
`docs/ADDON-DEVELOPMENT.md` (the arrival call); `docs/addons/knowledge.md` (clips arrive
in the inbox); `mcp-server/README.md` (`list_inbox`).

### 10. Non-functional

- The list and count are one indexed query per request; 100 items per page.
- Done takes at most 1000 ids; **すべて済みにする** is one UPDATE.
- Each write that touches the table adds one row write to a transaction that already
  exists; the upload and clip paths gain no extra round trip in the browser.
- One `inbox.updated` per committed write, per drive, not per row.

## Touch points

Core backend:
- `backend/app/models.py`: `InboxItem`.
- `backend/app/database.py` (HIGH): the table through `create_all`; no data migration.
- `backend/app/schemas.py`: `UploadInitRequest.inbox_source`; inbox request and response
  models; the arrival body.
- `backend/app/services/upload.py`: the session field; the arrival in `complete_upload`.
- `backend/app/routers/uploads.py`: pass the field; broadcast after complete.
- `backend/app/services/inbox.py` (new): record arrival, close, undo, remove, retention,
  list, count.
- `backend/app/routers/inbox.py` (new, registered in `backend/app/main.py`): the four
  drive endpoints.
- `backend/app/services/fileops.py` (HIGH): `move_file`, `delete_file`, `delete_folder`.
- `backend/app/routers/files.py`: `PUT /{id}/tags`, `PUT /batch/tags`,
  `PUT /{id}/content`, `PUT /{id}/move`, `PUT /batch/move` broadcasts.
- `backend/app/routers/internal.py` (HIGH): `PUT /files/{file_id}/arrival`.
- `backend/app/main.py`: retention in the trash auto-purge task.
- `backend/app/services/ws.py`: `inbox.updated` broadcast (existing manager).
- `backend/tests/`.

Core frontend:
- `frontend/src/components/sidebar/SidebarLibrarySection.tsx`: the row and count.
- `frontend/src/lib/driveViews.ts`: `inbox` as a standalone view.
- `frontend/src/app/drive/[name]/page.tsx` and a new `frontend/src/components/inbox/`
  (Container / Presenter, rows, swipe, long-press).
- `frontend/src/components/SelectionBar.tsx`: an inbox action set.
- `frontend/src/components/ToastProvider.tsx`: an optional action.
- `frontend/src/hooks/useUpload.ts`, `frontend/src/lib/api.ts`: `inbox_source`; inbox
  calls.
- `frontend/src/messages-core/ja.json`, `en.json`: `inbox.*` (title, sourceUpload,
  groups, done, mark all, toast, undo, empty, root).
- Frontend tests; `frontend/e2e-layout/` for the row at both widths.

MCP: `mcp-server/src/tools/read.ts` (`list_inbox`), its tests, `mcp-server/README.md`.

Knowledge addon (its own repository, `mamepenguin/Litloft-knowledge-addon`, own PR
merged first, then the core gitlink bump):
- `app/internal_client.py`: `record_arrival`.
- `app/routers/clips.py`: the call in `_create_placeholder`.
- `frontend/messages/ja.json`, `en.json`: `knowledge.inbox.sourceWebClip`
  (「Web クリップ」 / "Web clip").
- `tests/`: Layer 1 wire shape (`httpx.MockTransport`: URL, method, secret header, body,
  204 and error propagation) and Layer 2 validator parity (the addon's `source` and
  `i18n_key` against the core schema), and the clip test that a failed arrival call keeps
  the clip.

Docs: as listed in 9; `.claude/rules/internal-api-policy.md` audit table gains the row.

Rules passed through: `.claude/rules/design-decisions.md` (drive boundary and per-drive
unique keys; `active_file_filter()`; file states; no core-to-addon dependency; locked
drives answer 404; WS drive scoping), `.claude/rules/internal-api-policy.md` (R1-R5,
two-layer contract tests, strict write secret), `.claude/rules/backend-conventions.md`,
`.claude/rules/frontend-conventions.md`, `DESIGN.md` §2.2, §6 Sidebar and Row Actions,
§7. HIGH zones named above; no protected path is edited.

## Invariants

I1. An inbox row is created or renewed only by an upload whose init carried `inbox_source`, or by the internal arrival call; a scan, a copy, a quick note, a new note, an upload without `inbox_source`, and media_import never create or renew one.
I2. A row's `drive` always equals its file's drive: a move to another drive deletes the row in the move's transaction, and a drive has at most one row per file.
I3. The list and the count include only rows with `done_at` NULL whose file passes `active_file_filter()`, in that drive; a trashed or missing file's row is never listed or counted.
I4. **済み** sets `done_at` only on open rows of the requested drive, and **すべて済みにする** only on rows with `arrived_at` at or before `up_to`; undo with the returned `done_at` reopens exactly those rows with their `arrived_at` and `source` unchanged.
I5. A same-drive move, a trash (file, batch or folder), a successful `PUT` tags or batch tags, or a content write that changes the projected tag set closes the row; opening, playback, rename, folder rename or move, copy, comment, like, favorite and the internal tags endpoint leave it as it was.
I6. A new arrival for a file that already has a row, open or done, sets `arrived_at` to now, replaces the source and clears `done_at`; restoring from trash leaves the row done; a file that goes missing and recovers keeps its row unchanged.
I7. For a drive the viewer cannot open, every inbox endpoint answers 404, and no `inbox.updated` for that drive reaches the viewer.
I8. The internal arrival call writes nothing without the write secret or for a file that is not active; a failed arrival call leaves the clip created and its response unchanged.
I9. A done row is deleted 30 days after `done_at`; an open row is deleted only by its file's purge or a move to another drive.
I10. No MCP tool sets or clears `done_at` directly; `list_inbox` returns the same items as the list endpoint.

## Checked, no action

- **A folder named Inbox.** Rejected by the user: files stay where they land.
- **Per-viewer done.** Rejected by the user: the inbox is the drive's.
- **A cross-drive count or inbox.** The drive is a security boundary.
- **Scanner finds, media_import, quick notes, new notes.** Not arrivals by decision; a
  scan cannot tell an upload from a copy made outside Litloft, and media_import has its
  own Watch surface (hako 2026-08-10, 2026-10-02).
- **Editor attachment uploads and MCP `upload_file`.** They send no `inbox_source`: an
  attachment is part of the note being written, and an agent's upload is placed by the
  caller on purpose, like a quick note. MCP `clip_url` / `clip_pasted` do arrive, because
  the recording is in knowledge's clip path, which every clip takes.
- **Re-uploading a file that exists on disk.** Already 409 at init; nothing arrives.
- **Restore reopening a row.** Trash is a decision about the file; restore undoes the
  trash, not the triage. Keeping a "why done" column for this was not worth it.
- **R3 for the arrival call.** Only knowledge produces arrivals through it today. Kept as
  the user decided, with the shape left generic, and marked "watch closely" in the audit
  table like `GET /viewer-history`. The alternative, an optional `arrival` field on the
  public `POST /api/drives/{drive}/files` that knowledge already calls, needs no Internal
  API endpoint and is atomic with the file; it is the human's choice (question raised).
- **Renaming closing the row.** Knowledge renames every clip when it is ready, so a
  rename cannot count as filing.
- **Folder move closing rows.** Moving a folder files nothing in particular; trashing a
  folder does throw its files away, so that one closes.
- **Quick Note's default folder is called `Inbox`.** In English the folder and this view
  share a name. Left as is: the folder is a user-editable default and renaming it would
  change existing installs' destination.
- **An `open_count` in the event.** The event says which drive changed; clients refetch,
  so a lost or reordered event cannot leave a wrong number.
- **A done-reason column, undo for auto-closes.** Move, trash and tag have their own
  feedback; only **済み** gets an undo toast.
