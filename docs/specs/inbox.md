# Inbox: what arrived in a drive and has not been dealt with

SPEC-ID: SPEC-CORE-032
SPEC-ID: SPEC-ADDON-059
SPEC-ID: SPEC-CORE-041

Approval: sha256:f45f9a5d405e187b7402a6b9812c0af748e56ba4c749f8220f9fb72f9ed8cd0f Yuichi Senga 2026-11-04

## Summary

Files reach a drive in several ways, and nothing shows the viewer which of them are new
and still waiting for attention. The inbox is a per-drive view of the files that arrived
on purpose (an upload, a web clip, later a share from a phone) and that the viewer has
not yet marked done, filed, tagged or thrown away. The files stay where they landed; the
inbox is a list beside them, not a folder.

- **SPEC-CORE-032**: the `inbox_items` table, the core upload path recording an arrival
  when the upload says so, the rules that close a row (an explicit **済み**, or moving,
  trashing or retagging the file), the drive's inbox page under the sidebar's **ホーム**
  row with the open count, prev/next through the inbox from a file opened there, the
  `inbox.updated` event, and retention of done rows.
- **SPEC-ADDON-059**: an optional `arrival` field on the public
  `POST /api/drives/{drive}/files`, recorded with the file in one transaction, and the
  knowledge addon sending it for every web clip. No Internal API endpoint is added.
- **SPEC-CORE-041**: a read-only MCP tool that lists a drive's open inbox.

Out of scope: the phone share menu (C4, which will record through the core upload path
with its own source), scanner finds, media_import (subscriptions and single imports),
quick notes, new notes, attachments uploaded from inside an editor, and MCP
`upload_file` (the user decided it does not arrive).

The user chose the per-drive table, the sources, the leaving rules, the sidebar placement
and the row design on 2026-11-04 (design artifact "C3 受信箱",
https://claude.ai/artifact/GLpzGcgSrj9sVjCRftYsiT). hako 2026-08-10 and 2026-10-02: media
import items are not an unprocessed inbox, and that stays true here.

## Required items

### 1. Normal flow

Formats used throughout: a timestamp on the wire is ISO 8601 UTC with microseconds,
`YYYY-MM-DDTHH:MM:SS.ffffffZ`, and the stored value has the same microsecond precision,
so a `done_at` returned by one call matches the stored value exactly when sent back. A
cursor is the base64url (unpadded) encoding of `<arrived_at>|<file_id>`.

SPEC-CORE-032, recording from an upload:

1. `POST /api/drives/{drive}/upload/init` accepts an optional `inbox_source`. The only
   value this unit accepts is `"upload"`; any other value is 422. The session keeps it.
2. The frontend upload store (`useUpload.ts`) sends `inbox_source: "upload"` from every
   entry point it serves: the upload zone, drag and drop, Add → Upload files, folder
   uploads with `relative_path` (one arrival per file), and the upload zone of the inbox
   page itself, which lands files in the drive root like the other drive-wide views. Every other caller of the upload
   path sends nothing: the knowledge editor's attachment upload and MCP `upload_file`.
3. `complete_upload`, for a session with `inbox_source` that produced a file row (not a
   subtitle sidecar, which produces no file row and no arrival), writes the arrival
   inside the existing `try` that ends with the commit and the thumbnail cleanup on
   failure, before the same `db.commit()` that commits the file row, so both commit or
   neither does. Its three branches:
   - a new row: insert `(drive, file_id, arrived_at=now, source="upload",
     source_i18n_key="inbox.sourceUpload", done_at=NULL)`;
   - a reused row (a missing or vanished active row, id kept): if an inbox row exists,
     set `arrived_at=now`, replace `source` and `source_i18n_key`, clear `done_at`;
     otherwise insert as above;
   - a trashed ghost at the path: the upload deletes the ghost as today, its inbox row
     goes with it through the foreign key cascade, and the new file gets a new row.
4. After the commit the core broadcasts `inbox.updated` `{ "drive": <drive> }`, scoped to
   that drive.

SPEC-ADDON-059, recording from a created file:

1. `TextFileCreateRequest` (`POST /api/drives/{drive}/files`) gains an optional
   `arrival: { "source": <str>, "i18n_key": <str> }`, with `source` matching
   `^[a-z][a-z0-9_.]{0,63}$` and `i18n_key` matching `^[A-Za-z][A-Za-z0-9_.]{0,127}$`,
   no other keys inside `arrival` (422 otherwise; the request model itself keeps
   accepting what older callers send). When present, the handler writes the arrival as in
   step 3 above with the given values, in the same commit as the file (a new file, a
   suffix-renamed one, or a missing row recovered with its id), then broadcasts
   `inbox.updated`. The core does not interpret `source`. Quick Note, New file and
   knowledge's new-note and unresolved-link paths send no `arrival`.
2. Knowledge's `InternalClient.create_text_file` gains an optional `arrival` argument;
   `_create_placeholder` (`app/routers/clips.py`), which every clip entry point goes
   through (`POST /clips`, `POST /clips/pasted`, and MCP `clip_url` / `clip_pasted`,
   which call those), passes `{ "source": "web_clip", "i18n_key":
   "knowledge.inbox.sourceWebClip" }` on both its first create and its 409 retry.
3. The clip's later rename-on-ready (`PUT /api/files/{id}/rename`) keeps the file id, so
   the row follows the file and stays open.

SPEC-CORE-032, the drive endpoints (all `check_drive_access`):

1. `GET /api/drives/{drive}/inbox?before=<cursor>&limit=<n>`: `limit` 1 to 100, default
   100, anything else 422; a cursor that does not decode to a timestamp and a file id is
   422. Answers `{ "items": [ { "file": FileResponse, "arrived_at", "source",
   "source_i18n_key" } … ], "next": <cursor|null>, "open_count": <int> }`: open rows
   (`done_at` NULL) of that drive whose file passes `active_file_filter()`, ordered
   `arrived_at` desc then `file_id` desc, starting strictly after the cursor. `next` is
   the last item's cursor when more rows follow, else null.
2. `GET /api/drives/{drive}/inbox/count` answers `{ "open": <int> }` under the same
   filter.
3. `POST /api/drives/{drive}/inbox/done` takes exactly one of `{ "file_ids": [ … ] }` (1
   to 1000 well-formed file ids) or `{ "all": true, "up_to": <timestamp> }`; both, neither,
   `all: false`, or an unparsable `up_to` is 422. It sets one `done_at` (now) on every
   open row of that drive whose file is active and that is named, or for `all` whose
   `arrived_at <= up_to`. Rows of other drives, unknown ids, done rows and rows of
   inactive files are left alone and not counted. Answers `{ "done": <count>, "done_at":
   <timestamp> }`; broadcasts `inbox.updated` once when `done > 0`.
4. `POST /api/drives/{drive}/inbox/undo` takes `{ "done_at": <timestamp> }` (422 if
   unparsable) and clears `done_at` on that drive's rows whose `done_at` equals it and
   whose file is still active (a row whose file was trashed or went missing since stays
   done);
   `arrived_at` and `source` are untouched. Answers `{ "reopened": <count> }`; broadcasts
   `inbox.updated` once when `reopened > 0`.
5. `GET /api/drives/{drive}/inbox/{file_id}/neighbors` answers `{ "prev_id", "next_id",
   "position", "total" }` over the same list and order as 1. A file whose row is no
   longer open (closed while being viewed) is placed by its row's `arrived_at` and id
   among the open rows, with `position` null; a file with no row in that drive answers
   all four null.

SPEC-CORE-032, file actions that close a row:

1. A close sets `done_at=now` on an open row and leaves a done row's `done_at` as it was.
   It is written in the same transaction as the action, so a rolled-back action closes
   nothing; batch endpoints that commit per file close per file.
2. The actions:
   - a move within the drive (`fileops.move_file` with the same drive, from
     `PUT /api/files/{id}/move` and `PUT /api/files/batch/move`);
   - a move to another drive deletes the row instead, by `file_id`, before
     `file.drive` is rewritten (the drive boundary: a row never travels with its file);
   - a trash: `fileops.delete_file` (from `DELETE /api/files/{id}` and
     `POST /api/files/batch/delete`) and `fileops.delete_folder` (from
     `DELETE /api/drives/{drive}/folders`) for every file it soft-deletes, as one
     UPDATE in the folder's commit;
   - a tag write that changes the file's tag set, compared as a set of the stored tag
     strings with order ignored: `PUT /api/files/{id}/tags`, `PUT /api/files/batch/tags`,
     and `PUT /api/files/{id}/content` when the tags projected from the new frontmatter
     differ from the tags before the write (how chip edits of a `.md` reach the core
     through `saveFileTags`). For every `.md` tag write (content PUT and the `.md` branch
     of the two tag endpoints) the tag set before is read before the content is written,
     and the close rides in the tag projection's commit: if the projection fails the close is skipped, and a failure to close
     never rolls back or fails the content write, which commits first as today. A tag
     write that leaves the set as it was closes nothing.
3. Each of these requests broadcasts `inbox.updated` at most once per drive it changed
   rows in (the source drive for a cross-drive move), after its commits, scoped to that
   drive.
4. Nothing else closes a row: opening the file, the view-only progress POST, playback,
   rename, folder rename or folder move, a copy, comments, likes, favorites, the internal
   tags endpoint, and an upload's or create's own frontmatter projection.
5. Restoring a trashed file leaves its row done. A file that goes missing keeps its row
   as it was (hidden by the filter), and the row reappears unchanged when the file
   recovers, including a missing row that `resolve_db_path_conflict` retires to a
   placeholder path. Purging a file, including a trashed ghost that
   `resolve_db_path_conflict` deletes, deletes its row through the cascade.
6. Once every 24 hours, in the existing trash auto-purge task and after its purge step,
   rows whose `done_at` is more than 30 days old are deleted in their own transaction. An
   error there is logged at WARNING and skipped; it neither aborts the trash purge nor
   stops the loop. No event.

SPEC-CORE-032, the page:

1. The sidebar shows **受信箱** / **Inbox** (lucide `Inbox`) directly under **ホーム**,
   above **ライブラリ**, when a drive is current, linking to `/drive/{drive}?view=inbox`.
   Its trailing count is the current drive's open count, omitted at 0, `99+` above 99.
   No other drive's count is shown. `isLibraryRowActive` is false on `?view=inbox` (it
   already is for every `?view=`), so only the inbox row is lit.
2. The count is fetched on drive change and refetched on `inbox.updated` or
   `drive.structure_changed` for the current drive.
3. `?view=inbox` is a standalone view (no folder tree). Page header: title **受信箱**,
   under it `<drive> · N 件` / `<drive> · N items` (`open_count`), and a secondary button
   **すべて済みにする** / **Mark all done**, hidden when the list is empty.
4. Rows grouped by the viewer's local date of `arrived_at`: **今日** / **Today**,
   **昨日** / **Yesterday**, **それ以前** / **Earlier**. Each row: thumbnail (the existing
   file thumbnail or type icon), name, and a meta line with the source label (translated
   by `source_i18n_key`; a missing key shows `source`), the arrival time (`HH:mm` today,
   `昨日 HH:mm` / `Yesterday HH:mm` yesterday, the locale date earlier), the folder path
   with a trailing `/` or **ルート** / **Root** for the drive root, and the ingest stage.
   The next 100 load when the end of the list scrolls into view.
5. Reload: on `inbox.updated` or `drive.structure_changed` for the current drive, the
   page refetches from the top through as many items as it has loaded (in pages of 100)
   and replaces its list with the answer. Rows removed optimistically by a done request
   still in flight stay hidden from every reload until that request answers; on success
   they stay out, on failure they are shown again with the existing error toast. Undo
   calls `/inbox/undo` and then reloads, so the rows come back in their order.
6. Ingest stage: the page asks `POST /api/files/processing` for its loaded rows (batches
   of 100), on load, on a `processing.updated` event naming a loaded row, and every 30 s
   while the page is visible and a loaded row is neither ready nor unavailable. Only
   required stages decide what the row shows, in this order: an `unavailable` stage shows
   **確認できません** without a spinner, and that row is no longer polled (an event still
   refreshes it); else the label of the first required stage that is `running` or
   `pending`, with a spinner; else, when `ready`, **使えます** / **Ready** with a lucide
   `Check` in `accent-teal`. A `failed` stage (required or not) adds the `AlertCircle`
   mark in `danger` beside whichever of these shows, **Ready** included. Labels, icons
   and colours are the C2 drawer's stage rendering, reused. A file the endpoint leaves
   out shows no stage.
7. Clicking a row opens `/files/{id}?nav=inbox`; the row stays open. Every navigation
   URL the detail builds (the canonical URL, prev/next in the right pane and in full
   screen) keeps `nav=inbox`. With `nav=inbox` the detail's prev/next and position come
   from the inbox neighbors endpoint, so the viewer walks the arrivals in list order;
   the detail shows a **済み** / **Done** button that closes the row (same endpoint and
   undo toast) and moves to the next arrival, or back to the inbox when there is none;
   closing the detail returns to `/drive/{drive}?view=inbox`.
8. Controls by pointer type, at any width:
   - fine pointer: a trailing **済み** / **Done** button (Row Actions: revealed on hover
     or focus, 32 px) and a selection checkbox on every row; right-click opens the usual
     file context menu;
   - coarse pointer: a swipe left marks the row done when released past a third of the
     row's width, with the same undo toast; released short of it, the row springs back
     over 200 ms `ease-out`; a gesture that is mostly vertical is a scroll and moves no
     row; a 500 ms long-press selects the row and enters selection mode, where taps
     toggle selection, and opens no context menu; selection mode ends when the selection
     becomes empty or through the selection bar's cancel control; rows set `-webkit-touch-callout: none` so the iOS app shows no link preview;
     the **済み** button is also shown, always visible at 44 px, when the viewport is at
     least 768 px wide.
   Under reduced motion the swipe still marks done, without the slide or spring
   animation.
9. With rows selected, the selection bar shows `N 件を選択` and **済み**, **移動**,
   **タグ**. **移動** opens the existing move dialog and **タグ** the selection bar's
   existing inline tag input; both send the existing batch endpoints in requests of at
   most 100 ids each, and the rows close through the file action.
10. **済み** on a row, on a selection, or **すべて済みにする** (`up_to` the newest loaded
    `arrived_at`) removes the rows (carried per DESIGN.md §7) and shows a toast
    **N 件を済みにしました** / **Marked N done** with **元に戻す** / **Undo** for the toast's
    5 s, N being the sum of `done` in the responses; no toast when it is 0. A selection
    over 1000 is sent in requests of 1000, and Undo sends one undo per returned
    `done_at`. The toast gains an optional action; a toast without one renders and times
    out as today.
12. Page jump (`lib/pageJump.ts`) gains a fixed **受信箱** / **Inbox** entry to
    `/drive/{drive}?view=inbox`.
11. Empty: **受信箱は空です** / **Inbox is empty**, and under it
    **新しく届いたものがここに並びます** / **New arrivals appear here**.

SPEC-CORE-041:

1. MCP gains `list_inbox(drive, limit?, before?)`, calling `GET /api/drives/{drive}/inbox`
   and returning per item `file_id`, `filename`, `folder_path`, `source`, `arrived_at`,
   and `next`. There is no MCP tool to mark done or undo.
2. The descriptions of the tools that can close rows say so: in
   `mcp-server/src/tools/write.ts` `move_file`, `trash_file`, `update_tags`,
   `edit_file_content` and `update_file_content` (they can change frontmatter tags); in
   `batch.ts` `move_files`, `trash_files`, `add_tags`; in `folders.ts` `trash_folder`.

### 2. Failure cases

- Upload with an invalid `inbox_source`, or create with an invalid `arrival`: 422,
  nothing created.
- Upload or create that fails before its commit: no file row and no inbox row.
- Upload to a path that already holds a file: 409 at init as today; no arrival.
- Knowledge: its create call, with `arrival`, keeps its 30 s timeout and its handling: a
  409 retries once with a timestamped name (with `arrival` again), any other failure is
  the clip's 502. A clip that is created answers 202 / 201 as today; the trust-tier
  failure path (502, placeholder left in place) is unchanged, and that placeholder is in
  the inbox.
- Done or undo with rows that do not qualify: skipped, not counted; nothing broadcast
  when the count is 0.
- Undo with a `done_at` no row carries: `reopened: 0`.
- A move whose filesystem or DB step fails: rolled back as today, the row unchanged.
- A failed list, done or undo request: the page keeps what it shows (a failed done shows
  its rows again) and shows the existing error toast.
- WebSocket down or an event lost: the count and list are refetched on the next drive
  change, page load or event.
- Retention error: logged at WARNING, retried on the next pass.

### 3. States

A file's inbox row:

| From | To | When |
|---|---|---|
| none | open | an arrival (upload with `inbox_source`, or create with `arrival`) |
| open | done | **済み** (row, selection, all), same-drive move, trash, tag-set change |
| done | open | undo with its `done_at`; a new arrival for the same file |
| open | open, `arrived_at` renewed | a new arrival for the same file |
| open, done | none | move to another drive; the file purged (cascade) |
| done | none | 30 days after `done_at` |

Not allowed: done → done with a new `done_at` (a close of a done row changes nothing);
done → open by restore from trash, by recovery from missing, or by opening the file;
open → done by opening, rename, folder move, copy or a tag write that leaves the set
unchanged; any row moving to another drive; none → open by a scan, copy, quick note, new
note, editor attachment, MCP `upload_file` or media_import.

Visibility is separate: an open row is listed and counted only while its file is active.

### 4. Data read and written

- New table `inbox_items`: `id` integer PK, `drive` text not null, `file_id` VARCHAR(12)
  not null `REFERENCES files(id) ON DELETE CASCADE`, `arrived_at` datetime not null,
  `source` VARCHAR(64) not null, `source_i18n_key` VARCHAR(128) not null, `done_at`
  datetime null; `UniqueConstraint("drive", "file_id")`; index on
  `(drive, done_at, arrived_at)`. Created by `create_all`; no data migration (the inbox
  starts empty). Written by upload complete, text-file create, done/undo, `move_file`,
  `delete_file`, `delete_folder`, the tag endpoints, the content PUT, retention. Read by
  the list, count and neighbors.
- `files`: read (drive, active state, tags before a write).
- In-memory upload session: gains `inbox_source`.
- Knowledge DB: unchanged.
- Browser: loaded rows, selection, optimistic hides and stages, in memory.

### 5. External services

None outside the Docker network.

### 6. Authorization

- Every `/api/drives/{drive}/inbox*` endpoint calls `check_drive_access`; a locked drive
  answers 404 as every drive route does. Done, undo and neighbors act only on rows of
  that drive.
- `inbox_source` and `arrival` ride on requests the caller may already make
  (`check_drive_access` on the upload and create routes). Knowledge sends `arrival` on
  the create it already makes with the viewer's forwarded credential, so no secret is
  involved and no Internal API endpoint is added (`internal-api-policy.md` does not
  apply; its two-layer contract-test pattern is still used).
- `inbox.updated` is broadcast with `drive`, so a viewer who cannot open that drive never
  receives it. The payload is `{ "drive" }` only.
- Done is per drive, not per viewer.

### 7. Effect on existing features

- Upload: one optional init field; the upload store sends it. The at-most-two limit, the
  drawer and C2's processing view are unchanged.
- Text-file create: one optional field; callers that omit it are unchanged.
- `move_file`, `delete_file`, `delete_folder`, the tag endpoints and the content PUT each
  write one more table in their own transaction; responses and existing events
  unchanged.
- File detail: `nav=inbox` selects the inbox neighbors; other `nav` values unchanged.
- The trash auto-purge task gains the retention step after its own.
- Toast: optional action; selection bar: an inbox action set; sidebar: one row.
- Knowledge clips: one more field on an existing call; responses unchanged.
- MCP: one new tool; move, trash, tag and content tools now also close inbox rows.
- Home, Recently Added, media_import's Watch surface: unchanged.

### 8. Error behavior

As in 2. Nothing new is logged on success; retention failures at WARNING. The page shows
the existing error toast on a failed list, done or undo request.

### 9. User-visible behavior

As in 1. Docs: `docs/user-guide/inbox.md` (new: what arrives, what closes a row, prev/next
from the inbox), linked from `docs/user-guide/overview.md`;
`docs/user-guide/keyboard-shortcuts.md` (swipe left for done, long-press to select);
`docs/reference/file-states.md` (inbox rows across trash, restore, missing, recovery,
purge and cross-drive move); `docs/reference/api.md` (the five inbox endpoints,
`inbox_source`, `arrival`); `docs/reference/websocket-events.md` (`inbox.updated`);
`docs/ADDON-DEVELOPMENT.md` (`arrival` on create); `docs/addons/knowledge.md` (clips
arrive in the inbox); `mcp-server/README.md` (`list_inbox`).

### 10. Non-functional

- List, count and neighbors are indexed queries; 100 items per page.
- Done takes at most 1000 ids; **すべて済みにする** is one UPDATE.
- Each write that touches the table adds row writes to a transaction that already exists;
  upload, create and clip gain no extra round trip.
- At most one `inbox.updated` per request per drive.

## Touch points

Core backend:
- `backend/app/models.py`: `InboxItem`, with no ORM relationship to `File` (one with
  a default cascade would null `file_id` instead of letting the database cascade).
- `backend/app/database.py` (HIGH): the table through `create_all`; no data migration.
- `backend/app/schemas.py`: `UploadInitRequest.inbox_source`,
  `TextFileCreateRequest.arrival` (`extra="forbid"` on the nested model only), inbox request/response models, cursor and timestamp
  parsing.
- `backend/app/services/upload.py`: session field; the arrival in all three
  `complete_upload` branches, inside the `try` that ends with the commit and the
  thumbnail cleanup on failure.
- `backend/app/routers/uploads.py`: pass the field; broadcast after complete.
- `backend/app/routers/drives.py`: `POST /{drive}/files` (`arrival`, every create
  branch including missing recovery) and `DELETE /{drive}/folders` (broadcast).
- `backend/app/services/inbox.py` (new): record, close, undo, remove, retention, list,
  count, neighbors.
- `backend/app/routers/inbox.py` (new, registered in `backend/app/main.py`).
- `backend/app/services/fileops.py` (HIGH): `move_file` (close inside the try so the
  rollback reverts it; cross-drive delete before `file.drive` is rewritten),
  `delete_file`, `delete_folder`; `resolve_db_path_conflict` relies on the cascade for
  a deleted ghost and keeps the row of a retired missing one.
- `backend/app/routers/files.py`: `PUT /{id}/tags`, `PUT /batch/tags`,
  `PUT /{id}/content` (close in the projection transaction), `PUT /{id}/move`,
  `PUT /batch/move` (per-file commits), `DELETE /{id}`, `POST /batch/delete`: broadcasts.
- `backend/app/main.py`: retention after the trash purge, isolated.
- `backend/app/services/ws.py`: drive-scoped `inbox.updated` through the existing
  manager.
- `backend/tests/`.

Core frontend:
- `frontend/src/components/sidebar/SidebarLibrarySection.tsx`: the row and count;
  `libraryRowActive.ts` unchanged and tested for `?view=inbox`.
- `frontend/src/lib/driveViews.ts`: `inbox` as a standalone view.
- `frontend/src/app/drive/[name]/page.tsx` and a new `frontend/src/components/inbox/`
  (Container / Presenter, rows, swipe, long-press, reload reconciliation).
- `frontend/src/hooks/useFileNav.ts`, `frontend/src/lib/fileNavOrdering.ts`,
  `frontend/src/lib/fileNavContext.tsx`, `frontend/src/components/FileDetail/FileNavControls.tsx`,
  `frontend/src/components/folder/RightPaneFile.tsx`,
  `frontend/src/components/FileDetailFullScreen.tsx` (`buildNavUrl`),
  `frontend/src/lib/canonicalFileUrl.ts` (already carries `nav`): `nav=inbox`, the
  detail's **済み** button, return to the inbox on close.
- `frontend/src/lib/pageJump.ts`: the inbox entry.
- The inbox page's upload zone: the existing drive-wide upload zone, root destination.
- `frontend/src/lib/driveViews.ts`: `isLibraryRowActive` and `routeHidesTree` keep their
  answers for `trash` and `missing`.
- `frontend/src/components/SelectionBar.tsx`: inbox action set, 100-id request split.
- `frontend/src/components/ToastProvider.tsx`: optional action, default unchanged.
- `frontend/src/hooks/useUpload.ts`, `frontend/src/lib/api.ts`: `inbox_source`; inbox
  calls.
- `frontend/src/messages-core/ja.json`, `en.json`: `inbox.*`.
- Frontend tests; `frontend/e2e-layout/` for rows under fine and coarse pointers.

MCP: `mcp-server/src/tools/read.ts` (`list_inbox`), descriptions in `write.ts`,
`batch.ts`, `folders.ts`, tests, `mcp-server/README.md`.

Knowledge addon (its own repository, `mamepenguin/Litloft-knowledge-addon`, own PR
merged first, then the core gitlink bump):
- `app/internal_client.py`: `create_text_file(..., arrival=None)`.
- `app/routers/clips.py`: `arrival` on both creates in `_create_placeholder`; 202 / 201
  and the trust-tier 502 path unchanged.
- `frontend/messages/ja.json`, `en.json`: `knowledge.inbox.sourceWebClip`
  (「Web クリップ」 / "Web clip").
- `tests/`: Layer 1 wire shape (`httpx.MockTransport`: URL, method, body with `arrival`,
  422 propagation), Layer 2 validator parity (the addon's `source` and `i18n_key` against
  the core schema), and both clip entry points sending it.

Docs: as listed in 9.

Rules passed through: `.claude/rules/design-decisions.md` (drive boundary and per-drive
unique keys; `active_file_filter()`; file states; no core-to-addon dependency; locked
drives answer 404; WS drive scoping), `.claude/rules/backend-conventions.md`,
`.claude/rules/frontend-conventions.md`, `DESIGN.md` §2.2, §6 Sidebar and Row Actions,
§7. HIGH zones named above; no protected path is edited.

## Invariants

I1. An inbox row is created or renewed only by an upload whose init carried `inbox_source` or a text-file create carrying `arrival`; a scan, a copy, a quick note, a new note, an upload without `inbox_source`, MCP `upload_file` and media_import never create or renew one.
I2. Every upload-store entry point (upload zone, the inbox page's upload zone, drag and drop, Add → Upload files, folder upload) leaves one open row per uploaded file that produced a file row (not a subtitle sidecar) with source `upload`, and every clip entry point (`POST /clips`, `POST /clips/pasted`, MCP `clip_url`, `clip_pasted`) leaves one open row with source `web_clip`.
I3. The file row and its inbox row commit in the same transaction: no committed arrival lacks its file, and no committed upload or create that carried a source and produced a file row lacks its row; an upload or create's own frontmatter projection closes nothing.
I4. A row's `drive` always equals its file's drive: a move to another drive deletes the row in the move's transaction, and a drive has at most one row per file.
I5. The list, count and neighbors include only rows with `done_at` NULL whose file passes `active_file_filter()`, in that drive; a trashed or missing file's row is never listed or counted.
I6. The list is ordered by `arrived_at` desc then file id desc, and following `next` from the first page visits every listed row exactly once.
I7. **済み** sets `done_at` only on open rows of active files in the requested drive, and **すべて済みにする** only on those with `arrived_at` at or before `up_to`; closing a done row leaves its `done_at`; undo with the returned `done_at` reopens exactly those rows whose file is still active, with `arrived_at` and `source` unchanged.
I8. A same-drive move, a trash (file, batch or folder), or a tag write that changes the file's tag set as a set closes the row; opening, playback, rename, folder rename or move, copy, comment, like, favorite, a no-op tag write and the internal tags endpoint leave it as it was; a failed close never fails or rolls back a content write.
I9. A new arrival for a file that already has a row, open or done, sets `arrived_at` to now, replaces the source and clears `done_at`; restoring from trash leaves the row done; a file that goes missing and recovers keeps its row unchanged.
I10. For a drive the viewer cannot open, every inbox endpoint answers 404, and no `inbox.updated` for that drive reaches the viewer.
I11. A done row is deleted 30 days after `done_at`, and a retention failure leaves the trash purge's result unchanged; an open row is deleted only by its file's purge or a move to another drive.
I12. The sidebar shows the open count of the current drive only, nothing at 0 and `99+` above 99.
I13. Rows hidden by a done request that fails are shown again; rows reopened by undo appear again in list order.
I14. No MCP tool sets or clears `done_at` directly; `list_inbox` returns the same items as the list endpoint.
I15. The neighbors endpoint uses the list's order and filter; a closed row is placed by its `arrived_at` and id with `position` null; a file with no row in the drive answers all four null; with `nav=inbox`, prev/next, and every URL the detail builds keeps `nav=inbox`.
I16. `inbox.updated` is broadcast at most once per request per drive, only after the commit that changed rows, and never when no row changed.
I17. A toast without an action renders and times out exactly as before this change.
I18. A row's stage shows `unavailable` over any pending or running stage, counts only required stages for pending, running and ready, keeps the failure mark beside **Ready**, and an unavailable row is not polled.

## Checked, no action

- **A folder named Inbox.** Rejected by the user: files stay where they land.
- **Per-viewer done.** Rejected by the user: the inbox is the drive's.
- **A cross-drive count or inbox.** The drive is a security boundary.
- **Scanner finds, media_import, quick notes, new notes.** Not arrivals by decision; a
  scan cannot tell an upload from a copy made outside Litloft, and media_import has its
  own Watch surface (hako 2026-08-10, 2026-10-02).
- **Editor attachment uploads.** They send no `inbox_source`: an attachment is part of
  the note being written.
- **Re-uploading a file that exists on disk.** Already 409 at init; nothing arrives.
- **Restore reopening a row.** Trash is a decision about the file; restore undoes the
  trash, not the triage. A "why done" column was not worth it.
- **An Internal API arrival endpoint.** Fails R3 (knowledge is the only addon producer);
  the `arrival` field on the create knowledge already calls is atomic and adds no
  endpoint.
- **Renaming closing the row.** Knowledge renames every clip when it is ready.
- **Folder move closing rows.** Moving a folder files nothing in particular; trashing a
  folder throws its files away, so that one closes.
- **Quick Note's default folder is called `Inbox`.** In English the folder and this view
  share a name. Left as is: the folder is a user-editable default, and renaming it would
  change existing installs' destination.
- **An `open_count` in the event.** Clients refetch, so a lost or reordered event cannot
  leave a wrong number.
- **Undo for auto-closes.** Move, trash and tag have their own feedback; only **済み**
  gets an undo toast.

## Pending human confirmation

Each is written into the spec as recommended above; approval of the spec confirms them.

1. Arrival is recorded through an optional `arrival` field on the public
   `POST /api/drives/{drive}/files` that knowledge already calls, atomic with creating
   the file; no new Internal API endpoint. (Recommended: R3 fails for an Internal API
   endpoint, and the field needs no secret and no second call.)
2. A tag write closes the row only when the file's tag set changes, compared as a set of
   the stored tag strings with order ignored; a no-op tag write leaves it open.
   (Recommended: re-saving the same tags is not filing.)
3. Controls are keyed to pointer type at any width: a fine pointer gets the **済み**
   button and the checkbox on every row; a coarse pointer gets swipe-left for **済み** and
   long-press to select, plus the **済み** button visible at 768 px and wider.
   (Recommended: a tablet has no hover and room for the button.)
4. An inbox row has the usual file context menu on right-click with a fine pointer; on
   touch, long-press selects and opens no context menu, and rows set
   `-webkit-touch-callout: none` so the iOS app shows no link preview. (Recommended: one
   meaning per gesture.)
5. A file opened from the inbox walks prev/next in inbox order (`nav=inbox`), so the
   viewer can work through arrivals one by one. (Recommended: triage is sequential.)
6. Closing the detail opened from the inbox returns to the inbox. (Recommended: the
   viewer came to triage, not to browse the folder.)
7. A swipe-done shows the same 5 s undo toast; under reduced motion the swipe still marks
   done, without the slide animation. (Recommended: a swipe is easy to make by mistake.)
8. `?view=inbox` hosts an upload zone; files land in the drive root, like the other
   drive-wide views, and arrive in the inbox. (Recommended: dropping onto the inbox
   should work.)
9. Page jump gets an inbox entry. (Recommended: every sidebar destination is jumpable.)
10. The detail opened from the inbox (`nav=inbox`) shows a **済み** button that closes the
    row and moves to the next arrival. (Recommended: triage one by one without going
    back.)
