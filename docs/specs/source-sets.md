# Collections as source sets for AI handoff

SPEC-ID: SPEC-CORE-034
SPEC-ID: SPEC-ADDON-058
SPEC-ID: SPEC-CORE-038

Approval:

## Summary

A viewer who wants an AI to work from "these twenty files" has no way to hand them over.
Ask searches the whole drive, and an agent using Litloft through the MCP server can
browse folders and search but cannot see the lists the viewer has already built. Litloft
already has such lists: a collection (`Collection` / `CollectionItem`; playlists are
collections) is an ordered set of files from one drive, created from the sidebar and from
**Add to collection** on a file's page. This unit makes a collection the source set an AI
works from, for both kinds of AI that use Litloft: the intelligence addon's Ask, and AI
agents through `mcp-server/`.

- **SPEC-CORE-034**: a collection holds files of its own drive only. Today a cross-drive
  move keeps the file's id and its collection items, so the file stays in collections of
  the drive it left. The move removes those items, and rows already left behind are
  removed at startup.
- **SPEC-ADDON-058**: one read-only Internal API endpoint,
  `GET /api/internal/collections/{collection_id}/file-ids?drive=`, giving an addon the
  active file ids of a collection in its order, and an intelligence client for it with
  the two-layer contract tests the Internal API policy requires. Nothing in intelligence
  calls the client yet.
- **SPEC-CORE-038**: two read-only MCP tools, `list_collections` and `get_collection`, so
  an agent can find a drive's collections and read the files of one.

Out of scope: asking scoped to a set (D3, SPEC-ADDON-054, the next unit; it belongs to D4,
narrowing Ask's scope); any new entity, column or screen for sets; greying out trashed and
missing items on the collection page (see Checked, no action).

The user decided on 2026-11-04: "AI handoff" means both Ask and MCP agents, and a set must
be reachable from both; the existing collection is the source set, with no new entity, no
`purpose` column and no new UI to create sets; one read-only Internal API endpoint returns
active ids only and rejects a collection of another drive; a cross-drive move removes the
file from collections of the old drive, on every path that changes `File.drive`; MCP
agents get listing and reading, and asking scoped to a set waits for D3; the read
endpoint returns active files only and the collection page stays as it is.

## Required items

### 1. Normal flow

SPEC-CORE-034:

1. A viewer moves a file to another drive: `PUT /api/files/{file_id}/move` or
   `PUT /api/files/batch/move` with a `target_drive` other than the file's drive (the web
   UI, the knowledge addon's frontend, and the MCP tools `move_file` and `move_files` all
   reach these two endpoints).
2. Both endpoints call `fileops.move_file`, the only code that assigns `File.drive`
   (`fileops.py`, beside `retarget_file_tags`). `move_folder` and `rename_folder` take one
   drive and never change it; the scanner, uploads and copies create or revive rows in a
   drive and never move one.
3. In the same transaction that sets `file.drive = dst_drive`, `move_file` deletes every
   `CollectionItem` of that file whose collection's `drive` is not `dst_drive`. The other
   items of those collections keep their positions; the gap left in `position` is not
   renumbered, as `DELETE .../items/{item_id}` does not renumber either.
4. A move within one drive (`target_drive` absent or equal to the file's drive) touches no
   collection item.
5. At startup, in `database.py`'s migrations, every `collection_items` row whose file's
   `drive` differs from its collection's `drive` is deleted, with one INFO log line giving
   the count when it is non-zero. On a database with no such row it deletes nothing and
   logs nothing; it runs on every start.

SPEC-ADDON-058:

1. An addon calls `GET /api/internal/collections/{collection_id}/file-ids?drive=<drive>`
   with `X-Internal-Secret` when it has one.
2. The core checks the secret with `verify_internal_secret` (the optional gate
   `/viewer-history` uses), then:
   - `collection_id` not matching `^[A-Za-z0-9_-]{12}$` (the core's nanoid shape,
     `schemas._NANOID_RE`) → 400 `"Invalid collection_id"`;
   - `drive` not a configured drive → 404 `"Drive not found"`;
   - no collection with that id, or a collection whose `drive` is not `drive` → 404
     `"Collection not found"`. The two cases answer the same.
3. Otherwise `200 {"file_ids": [...]}`: the ids of the collection's items whose file is
   active (`active_file_filter()`) and whose `File.drive` equals `drive`, ordered by
   `position`, then by item id. An empty collection, or one whose files are all trashed or
   missing, answers `{"file_ids": []}`.
4. Intelligence gets `app/rag/collection_client.py` with
   `async fetch_collection_file_ids(*, collection_id: str, drive: str) -> list[str]`:
   - it checks `collection_id` against the same pattern before sending and raises
     `CollectionNotFound` without a request when it does not match;
   - it sends `GET {HOMEVAULT_INTERNAL_API_URL}/collections/{collection_id}/file-ids`
     with `drive` as a query parameter and `x-internal-secret` only when
     `CORE_INTERNAL_SECRET` is set, with a 5 s timeout, as `history_client.py` does;
   - 200 with `{"file_ids": [str, ...]}` → that list, in order;
   - 400 or 404 → raises `CollectionNotFound`;
   - any other status, a network error, a body that is not JSON, or a body without a list
     `file_ids` of strings → raises `CollectionLookupFailed`.
   It never returns `[]` for a failure: `[]` means an empty set.
5. Nothing in intelligence calls the client in this unit. D3 is expected to resolve a scope
   value such as `{"kind": "collection", "id": "..."}` into a list of file ids and pass it
   to the retriever's existing `file_id_scope` allow-list (`app/search.py`,
   `app/rag/service.py`), where a folder or a tag scope would resolve to the same list
   shape from its own source. Which scope kinds exist, how they combine with the
   personal-history scope, and what Ask says when a lookup fails are D3's to decide.

SPEC-CORE-038:

1. `list_collections { drive }` sends `GET /api/drives/{drive}/collections` with the
   server's credentials and returns the core's list unchanged: `id`, `name`,
   `description`, `drive`, `item_count`, `first_file_id`, `created_at`, `updated_at`,
   most recently updated first. `item_count` counts every item, trashed and missing ones
   included, as the sidebar does.
2. `get_collection { drive, collection_id, fields? }` sends
   `GET /api/drives/{drive}/collections/{collection_id}` and returns
   `{ id, name, description, drive, created_at, updated_at, items, inactive_count }`:
   - `items`: the items whose file has `deleted_at` and `missing_since` both null, in the
     order the core returned them, each `{ item_id, position, file }`, where `file` is the
     summary `search_files` returns (its `SUMMARY_FIELDS`), or the whole file object with
     `fields: "full"`;
   - `inactive_count`: how many items were left out because their file is trashed or
     missing.
3. Both tools carry `readOnlyAnnotations`. Their descriptions say a collection is also
   called a playlist, that it holds files of one drive, and that the ids in `items` can be
   passed to the other file tools. The server instructions gain one line saying an agent
   can read the files a viewer gathered with `list_collections` and `get_collection`.
4. `create_playlist` and `add_to_playlist` keep their names and behaviour.

### 2. Failure cases

- SPEC-CORE-034: the move fails after the file is moved on disk (a database error) →
  `move_file` rolls back, which restores the deleted items with the rest of the
  transaction, and moves the file back as today. A move that fails before the
  transaction (409 target exists, 404 not on disk, 404 target drive locked) touches no
  item. In a batch move each file commits on its own, so the files that moved lose their
  old-drive items and the ones that failed keep them.
- The startup cleanup fails (a database error) → the error propagates as the other
  migrations' errors do; nothing is half-applied because it is one statement.
- SPEC-ADDON-058: as in 1, step 2. A file that left the drive before the startup cleanup
  ran is still never returned, because the endpoint also checks `File.drive`.
- The client: as in 1, step 4. A slow core ends at the 5 s timeout as
  `CollectionLookupFailed`.
- SPEC-CORE-038: a locked or unknown drive, or a collection of another drive, is the
  core's 404, returned as the usual `Litloft API error (404): ...` result with
  `isError: true` (`runTool`). An item whose `file` lacks a field is summarised with the
  fields it has.

### 3. States

- A collection item exists only while its file and its collection share a drive. The
  transitions that end it: removal by the viewer, deletion of the collection, a purge of
  the file (`ON DELETE CASCADE`, unchanged), and now a move of the file to another drive.
  Trashing or a file going missing does not end it, and restoring or recovering the file
  makes it active again.
- For the endpoint and `get_collection`, an item is either included (file active) or left
  out (file trashed or missing); nothing else.
- The client has no state.

### 4. Data read and written

- Written: `collection_items` (rows deleted on a cross-drive move and by the startup
  cleanup). Nothing else is written; `collections.updated_at` does not change, as it does
  not when a viewer removes an item.
- Read: `collections`, `collection_items`, `files` (`drive`, `deleted_at`,
  `missing_since`), `drives.json` through `config` for the drive check.
- MCP: reads the two public collection endpoints; stores nothing.
- Intelligence: the client reads the Internal API and stores nothing.

### 5. External services

None. The Internal API is a call inside the Docker network; its failure modes are in 2.

### 6. Authorization

- The moves keep their checks: access to the source file (`_get_file_or_404`) and to the
  target drive (`_check_target_drive_access`).
- The Internal API endpoint does no viewer check, as `/viewer-history` does not: it is
  reachable only inside the Docker network, behind the optional `CORE_INTERNAL_SECRET`.
  The addon must pass a drive it has already validated; through the addon proxy that is
  the `X-Lit-Drive` the proxy checked against `accessible_drives`. The endpoint refuses to
  answer for a collection outside `drive`, so a caller holding a collection id cannot use
  it to read across the drive boundary.
- MCP: the public endpoints with the server's credentials; a locked drive is a 404, so its
  collections are neither listed nor readable.

#### Internal API policy (R1–R5)

- **R1 First-class core entity.** Collections are a core entity drawn in the core UI (the
  sidebar section, `CollectionDetail`, `CollectionPicker`, the player's queue).
- **R2 Generic shape.** The path and response name a collection and file ids only; no
  addon, feature or "source set" appears.
- **R3 Multi-addon viability.** Ask's set-scoped question (D3) is the first consumer, and
  the D4 scope field (`/find` and Ask narrowed to a set) the second use, both in
  intelligence. A second addon is not planned; the knowledge addon making a note from a
  set is the nearest named one. This is the same standing as `GET /viewer-history`: keep,
  watch closely, and re-check when D3 lands.
- **R4 Write asymmetry.** Not engaged: the endpoint only reads.
- **R5 Promotion target.** Not engaged: no addon output is promoted.

### 7. Effect on existing features

- The collection page, the sidebar count and the player's queue of the old drive stop
  showing a file after it moves to another drive. Today they keep showing it, with the
  other drive's title and thumbnail, and opening it leaves the collection's drive.
- `retarget_file_tags` and the `files.moved` event of a move are unchanged.
- `create_playlist`, `add_to_playlist` and the public collection endpoints are unchanged.
- `GET /viewer-history` and the other Internal API endpoints are unchanged.
- Intelligence behaves as before: the client is not called.

### 8. Error behavior

- Moves: as today; no new message.
- Startup cleanup: `Removed N collection item(s) whose file is in another drive` at INFO
  when N > 0.
- Endpoint: the 400 and 404 details in 1. Nothing is logged.
- Client: `collection-client: ...` at WARNING with the drive and the status or the error
  type, never the file ids, on `CollectionLookupFailed`; nothing on `CollectionNotFound`.
- MCP: the core's error detail, as every other tool.

### 9. User-visible behavior

- A file moved to another drive disappears from the old drive's collections, and is in
  none of the new drive's collections. A file moved within its drive stays in its
  collections.
- After the first start with this change, collections that held a file from another drive
  no longer list it.
- An MCP agent sees two more tools. `get_collection` lists the active files of a
  collection in the viewer's order and says how many trashed or missing ones it left out.
- Docs, in the same PR: `docs/user-guide/playlists-favorites.md` (Collections) gets one
  sentence: moving a file to another drive takes it out of this drive's collections;
  `docs/user-guide/upload-and-fileops.md`, after "Pasting in a different drive copies or
  moves the files to that drive", the same fact; `docs/ADDON-DEVELOPMENT.md` (Internal API,
  secret-gated table) the new endpoint; `mcp-server/README.md` the two tools;
  `.claude/rules/internal-api-policy.md` a row in its audit table for the endpoint;
  `docs/addons/intelligence.md` nothing yet (no behaviour changes).

### 10. Non-functional

- The endpoint is one indexed query on `collection_items.collection_id` joined to `files`;
  it has no cap, because collections are lists a person builds (hundreds of items at
  most), and answers within 100 ms for 1,000 items.
- The move adds one delete keyed by the file id to the move's transaction.
- The startup cleanup is one `DELETE ... WHERE` over `collection_items` joined to
  `collections` and `files`.
- Privacy: file ids only; no file content crosses the Internal API.

## Touch points

Core:
- `backend/app/services/fileops.py` (`move_file`): delete the moved file's items in
  collections of other drives. HIGH zone, with the persistence modifier.
- `backend/app/database.py`: the startup cleanup of cross-drive items. HIGH zone.
- `backend/app/routers/internal.py`: `GET /collections/{collection_id}/file-ids`. HIGH
  zone (the addon trust boundary).
- `backend/tests/`: moves (single and batch, cross-drive and within a drive, failed
  moves), the cleanup, the endpoint (Layer 1 on the core side: each status and the
  ordering and filtering).
- `mcp-server/src/tools/read.ts` (or a new `collections.ts` registered in
  `src/tools/index.ts`), `mcp-server/src/server.ts` (instructions),
  `mcp-server/src/__tests__/toolMetadata.test.ts` (the expected tool list, a named edit),
  `mcp-server/src/__tests__/` for the two tools, `mcp-server/README.md`.
- `docs/ADDON-DEVELOPMENT.md`, `docs/user-guide/playlists-favorites.md`,
  `docs/user-guide/upload-and-fileops.md`, `.claude/rules/internal-api-policy.md` (audit
  table).

Intelligence (its own PR, then the gitlink bump in core):
- `addons/intelligence/app/rag/collection_client.py`.
- `addons/intelligence/tests/`: Layer 1 wire-shape tests with `httpx.MockTransport` (URL,
  method, `drive` parameter, secret header present and absent, response parse, each
  failure raising the right exception) and the Layer 2 parity table (collection ids the
  client sends against those the core accepts, and the response keys).

Rules passed through: `.claude/rules/design-decisions.md` (a drive is a security
boundary; drive-partitioned tables; file states through `active_file_filter()`; Internal
API secret gating), `.claude/rules/internal-api-policy.md` (R1–R5 and the two-layer
contract tests), `.claude/rules/backend-conventions.md` (`import app.config as config`).
No protected path is edited.

## Invariants

I1. After a successful move of a file to another drive, no collection of any drive other than the destination holds an item for that file; a move within one drive leaves every item of that file in place with its position.
I2. A move that fails, before or after the file is moved on disk, leaves every collection item of that file as it was.
I3. After startup, no `collection_items` row references a file whose `drive` differs from its collection's `drive`, and every other row is unchanged.
I4. `GET /api/internal/collections/{id}/file-ids?drive=` returns exactly the ids of that collection's items whose file is active and in `drive`, in `position` order; a trashed, missing or other-drive file never appears.
I5. The endpoint answers 404 for a collection that exists in another drive, the same as for one that does not exist, and 404 for an unknown drive, so it never returns a file id of a drive other than `drive`.
I6. The client returns a list only for a 200 with a list of string ids, and raises on every failure; it never turns a failure into an empty list.
I7. `get_collection` lists exactly the items whose file is neither trashed nor missing, in the core's order, and `inactive_count` plus the number of listed items equals the collection's item count.
I8. Neither MCP tool lists or reads a collection of a drive the server's credentials cannot open.
I9. Collection endpoints, `create_playlist`, `add_to_playlist`, `retarget_file_tags` and the other Internal API endpoints return the same responses for the same requests as before.

## Checked, no action

- **Greying out trashed and missing items.** `docs/user-guide/playlists-favorites.md`
  ("greyed out and not playable"), `docs/user-guide/trash-and-missing.md` ("dimmed and not
  playable") and the comment in `collections.py` `_to_detail` ("so the UI can grey them
  out") promise it. The code does not do it: `CollectionDetail.tsx`,
  `CollectionItemsPane.tsx`, `CollectionPanel.tsx` (the queue) and the file grid and list
  they use never read `deleted_at` or `missing_since`, so a trashed or missing item looks
  like any other. Left for its own fix; this unit only keeps such items out of what an AI
  reads.
- **A new entity, a `purpose` column, or a screen for sets.** The user chose the existing
  collection.
- **Intelligence reading the core DB directly.** It mounts `data/` read-only and the
  Pickup profile queries `watch_history` that way, so it could read `collection_items`
  without an endpoint. The user chose the endpoint, and Ask's personal-history scope
  already goes through the Internal API: the active-file rule and the drive check stay in
  core code instead of being repeated in SQL inside the addon.
- **Asking scoped to a set, and the scope field.** D3 (SPEC-ADDON-054) and D4. This unit
  only notes the consumption path in 1 (058 step 5).
- **An MCP tool to ask within a set.** Waits for D3; the `ask` tool is unchanged.
- **Renaming `create_playlist` / `add_to_playlist` to collection names.** It would break
  agents that already use them; the new tools' descriptions say the two words mean the same
  thing.
- **Tools to remove items, reorder or delete a collection.** Not needed to use a set.
- **Renumbering positions after a move removes an item.** Order is kept by `position`
  with gaps, as after a viewer removes an item.
- **`collections.updated_at` on removal.** Not touched, as with a viewer's removal; the
  sidebar order does not change because a file moved away.
- **`file_relations` across drives after a move.** The same move also leaves relations
  whose two ends are in different drives, which the relation rules forbid. A separate gap,
  not part of source sets.
- **A WebSocket event for collection changes.** None exists; an open collection page of
  the old drive shows the moved file until it is reloaded, as today after any change made
  elsewhere.
- **A cap on the endpoint's answer.** Collections are hand-built lists; see 10.
- **Copying a file to another drive.** The copy is a new row in no collection; the original
  keeps its items.
