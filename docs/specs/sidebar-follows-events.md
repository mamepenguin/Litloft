# The sidebar follows changes made elsewhere

SPEC-ID: SPEC-CORE-188
SPEC-ID: SPEC-CORE-189

Approval:

## Summary

The sidebar reads its drive-scoped lists (tags, pins, collections, the Missing Files
count) when it mounts, when the drive or folder changes, and when one of a few screens
asks it to. A change made anywhere else does not reach it: a collection created from
**Add to collection**, renamed or deleted on its own page, or given more files keeps its
old row; a renamed pinned folder keeps its old name and link; tags added by bulk tagging,
paste, upload or a quick note do not appear; the Missing Files count stays after the
missing files are purged. All of these were measured on develop `fc291c9d8` and last until
a reload or a drive switch.

SPEC-CORE-188: the sidebar re-reads those lists when the core announces, over the
WebSocket, that the drive it shows changed. SPEC-CORE-189: the writes that change those
lists and announce nothing today start announcing: every collection write and every pin
write sends a new browser event, and the internal tag write the Knowledge scanner uses
sends a new tags event that only the sidebar watches. The viewer is the owner; nothing
here is about an attacker.

## Required items

### 1. Normal flow

1. The viewer has a drive page open; the sidebar shows drive D.
2. Something changes D: in this tab (another screen), in another tab, or through the MCP
   server or an addon calling the core API.
3. The core broadcasts, with `{ "drive": "D" }`, one of the **watched events**:
   `drive.structure_changed`, `drive.file_updated`, `inbox.updated`, `upload:complete`,
   `scan:complete`, and the new `drive.collections_changed`, `drive.pins_changed` and
   `drive.tags_changed`.
4. The sidebar receives it. A watched event naming another drive is ignored; other events
   are ignored.
5. The sidebar gathers watched events: a round of reads starts 500 ms after the last
   watched event, or 2 s after the first watched event of the gathering, whichever comes
   first. The next watched event after a round starts opens a new gathering.
6. A round reads, in parallel, D's tags (with `folder_path` set to the folder current when
   the round starts), pins, collections and summary.
7. Each answer is applied by the sequence rule of §3.

For SPEC-CORE-189, after the commit succeeds:

- each of the six collection write endpoints (create, update, delete, add items, remove
  item, reorder items) broadcasts `drive.collections_changed` `{ "drive": "<drive>" }` once,
  scoped to that drive;
- the pin and unpin endpoints broadcast `drive.pins_changed` `{ "drive": "<drive>" }` once,
  scoped to that drive;
- `POST /api/internal/files/{id}/tags` broadcasts `drive.tags_changed`
  `{ "drive": "<file's drive>" }` once, scoped to that drive. Only the sidebar watches it, so
  a Knowledge scan over many notes does not make the folder listing or Drive Home refetch
  once per note. No webhook is added.

The broadcast is wrapped so that an exception from it is logged and swallowed: the write
and its response never depend on it.

### 2. Failure cases

Per read kind, on failure:

| Read | On failure |
|---|---|
| mount, drive change | the list is empty and the summary `null` (today's behaviour; SPEC-CORE-125 I8) |
| folder change (tags only) | tags are empty for the new scope (today's behaviour; the old scope's tags are wrong for it) |
| a round, `refreshKey`, the sidebar's own re-read after its own collection write | the list keeps what it showed |

A failure obeys the same sequence rule as an answer (§3): a failure of a read older than
another started read of that list changes nothing.

- **The WebSocket is disconnected** when the change happens: the event is lost; on
  reconnect the sidebar runs one round (`useWebSocketRefresh`'s catch-up), gathered like
  any round.
- **Two events land in the same tick**: `WebSocketProvider` keeps only the last event.
  Watching the events a drive write is followed by (`inbox.updated` after a tag write that
  closes an inbox row, `upload:complete` after an upload) in one subscription means the
  survivor still starts the round. A miss remains possible when the survivor is an event
  not watched here; the next watched event or reconnect corrects it.
- **A write fails** (404, 409, 422, 400): nothing is broadcast.
- **The broadcast fails or raises** (no event loop, a socket error, an unknown drive, an
  exception): the write stays committed and answers exactly as today; the failure is
  logged.

### 3. States

**Sequence rule.** Per list, every read (mount, drive change, folder change for tags,
`refreshKey`, a round, and the sidebar's own re-read after its own collection write) takes
a sequence number when it starts. Its answer or failure is applied only if no later read
of that list has started; an older read never replaces a newer one.

- No drive shown (`currentDrive` null, outside drive pages): watched events and reconnects
  start no gathering and no round.
- Idle → gathering (a watched event arrived; timer running) → reading (round started) →
  idle. Events during reading open a new gathering; its round may overlap the running one
  and the sequence rule settles the order.
- A drive change cancels a pending gathering and discards answers and failures of reads
  started for the previous drive.
- A folder change discards only tag reads started for the previous folder scope; pins,
  collections and summary reads in flight are still applied. The existing guard that keeps
  a null-folder tag read from overwriting a folder-scoped one is the same rule.
- Unmount cancels the timer and discards every answer.
- The first connection after mount may count as a reconnect in `useWebSocketRefresh` (when
  the hook mounts before the socket connects); the round it starts is allowed.
- A round whose collection list no longer holds the collection whose rename input is open
  closes that input and discards its text; nothing else is shown (the row is gone).

### 4. Data read and written

- Read: `GET /api/drives/{drive}/tags` (with `folder_path` when a folder is open),
  `GET /api/drives/{drive}/pins`, `GET /api/drives/{drive}/collections`,
  `GET /api/drives/{drive}/summary`. All existing, unchanged.
- Written: nothing new. The collection, pin and internal tag endpoints write what they
  write today and add a broadcast after the commit.
- Not read again on these events: the drive list and auth status (not drive-scoped; they
  change on unlock and lock, which reload the page), smart folders (they already announce
  writes within the tab), the inbox count (already follows its own events) and entry
  visibility.

### 5. External services

None. The WebSocket is the core's own.

### 6. Authorization

Unchanged. Every new broadcast goes through `ConnectionManager.broadcast(..., drive=...)`,
which sends it only to connections whose groups include the drive's access group. The
re-reads are the same authorized GETs the sidebar makes today.

### 7. Effect on existing features

- `useSidebarData`: gains the subscription, the gathering and the per-list sequence; keeps
  every existing trigger (mount, drive, folder, `refreshKey`). The `scan:complete` summary
  effect is folded into the round, which is drive-filtered: a scan of another public drive
  no longer re-reads this drive's summary.
- The hook's return value drops `setCollectionList` and gains `reloadCollections(): Promise<void>`,
  which runs a sequenced, keep-on-failure read of the collections. Every own-write re-read
  uses it: `useCollectionManagement` (create, rename, delete) and the drag-and-drop add in
  `SidebarCollectionsSection` (`handleDrop`).
- An inline rename input, a create input and their 409 state stay open with the typed text
  when a round replaces the list and the row is still there (SPEC-CORE-108 I9); the saved
  section and item order is applied to the new list as to any list (SPEC-CORE-107 I5).
- Other subscribers of `drive.structure_changed`, `drive.file_updated`, `inbox.updated`,
  `upload:complete` and `scan:complete` receive exactly what they receive today: the new
  broadcasts use only the three new event names, which no other subscriber watches.
- Addon webhooks: unchanged. The three new events are browser events only, like
  `inbox.updated`.
- MCP server, iOS shell: receive events they ignore.
- Tests that mock the hook's return shape or assert on `setCollectionList` are updated to
  the new shape, keeping what each asserts: `sidebar/__tests__/useCollectionManagement.test.ts`
  (asserts `reloadCollections` is called after a successful write instead of
  `setCollectionList(updated)`), `sidebar/__tests__/SidebarItemReorder.test.tsx`,
  `components/__tests__/SidebarActiveRow*`, `SidebarAddonNav*`, `SmartFolderSidebar*`,
  `driveSwitchBoundary*`, `imeEnterGuard*`, `sidebarShellFixtureParity*`,
  `src/__tests__/uploadLock.test.tsx`. `useSidebarData.summaryError.test.ts`
  (SPEC-CORE-125 I8, "keeps its previous value after a refresh") is rewritten to deliver
  `drive.structure_changed` through the real `useWebSocketRefresh` and context, advance
  past 500 ms, and assert the previous summary is kept after a failed round; I8's meaning is
  unchanged.

### 8. Error behavior

Nothing is shown on a failed round; the previous rows stay. No toast. Broadcast failures
are logged.

### 9. User-visible behavior

Within 500 ms of the last change (2 s of the first, during a stream), plus the requests,
without reload or navigation:

- a collection created, renamed or deleted from any screen appears, takes its new name or
  disappears in the sidebar's Collections; its item count follows additions and removals;
- a pin added or removed from Home, a folder menu or another tab appears or leaves; a
  pinned folder that was renamed or moved shows its new name and links to its new path;
- tags added or removed by bulk tagging, paste, upload, a quick note, a note's
  frontmatter, the chip editor or the Knowledge scanner appear in or leave the Tags
  section, and **All tags (N)** follows;
- **Missing Files** and its count follow files going missing, recovering and being purged.

While the viewer types in a Markdown note, autosaves send `drive.file_updated`; each pause
of 500 ms starts a round, so the sidebar reads about once per autosave at most. The rows do
not change unless the tags did.

### 10. Non-functional

- One round is four GETs. Rounds start no more often than watched events allow under §1.5:
  at most one per 500 ms pause, and at least one per 2 s during a stream.
- No new polling. No change to what the server stores.

## Touch points

- `frontend/src/components/sidebar/useSidebarData.ts`: the subscription, the gathering,
  per-list sequence, failure behaviour per read kind, no-drive state, folder change
  discarding tags only, `reloadCollections`; the `scan:complete` effect folded into the
  round.
- `frontend/src/components/sidebar/useCollectionManagement.ts`: re-reads through
  `reloadCollections`; closes the rename input when its collection leaves the list.
- `frontend/src/components/sidebar/SidebarCollectionsSection.tsx`: `handleDrop` re-reads
  through `reloadCollections`.
- `frontend/src/components/Sidebar.tsx`: passes `reloadCollections` instead of
  `setCollectionList`.
- `frontend/src/hooks/useWebSocketRefresh.ts`: used as is; not changed.
- Tests: new tests under `frontend/src/components/sidebar/__tests__/`; the updated tests
  listed in §7.
- `backend/app/routers/collections.py`: broadcast after commit in `create_collection`,
  `update_collection`, `delete_collection`, `add_collection_items`,
  `remove_collection_item`, `reorder_collection_items`.
- `backend/app/routers/drives.py`: broadcast after commit in `pin_folder`, `unpin_folder`.
- `backend/app/routers/internal.py`: `replace_file_tags_internal` broadcasts
  `drive.tags_changed` after commit.
- `backend/app/services/ws.py`: `broadcast_from_thread`, used through a wrapper that logs
  and swallows exceptions.
- `backend/tests/`: tests for the broadcasts.
- `docs/reference/websocket-events.md`: document the three new events; change "The core
  broadcasts these six events" to the new count; the paragraph on derived `drive.*` events
  stays true and gains a sentence that the three new events are sent directly; the
  addon-events sentence on emitting `files.updated` stays true.
- `docs/ADDON-DEVELOPMENT.md`: the `POST /files/{file_id}/tags` row says it notifies
  browsers with `drive.tags_changed` and sends no webhook.
- `docs/developer-guide/known-issues.md`: remove "The sidebar's tag list goes stale after a
  paste, bulk tagging, an upload or a quick note."
- `.claude/rules/design-decisions.md` (WebSocket): the sidebar's drive-scoped lists follow
  the watched browser events; a write that changes tags, pins, collections or the Missing
  count must make the core send one of them.
- Events added: `drive.collections_changed`, `drive.pins_changed`, `drive.tags_changed`
  (browser only).

No protected path is edited.

## Invariants

I1. With the sidebar showing drive D, any watched event (`drive.structure_changed`,
`drive.file_updated`, `inbox.updated`, `upload:complete`, `scan:complete`,
`drive.collections_changed`, `drive.pins_changed`, `drive.tags_changed`) for D leads,
without reload or navigation, to a read of D's tags, pins, collections and summary, and the
sidebar then shows their answers.

I2. A watched event whose `drive` is another drive causes no read, and with no drive
shown no watched event or reconnect causes a read.

I3. A round starts 500 ms after the last watched event of a gathering, or 2 s after its
first, whichever is earlier; events less than 500 ms apart within those 2 s produce one
round.

I4. For each list, a read's answer or failure is applied only if no later read of that
list has started; a drive change discards every read started for the previous drive; a
folder change discards only tag reads started for the previous folder, and tags are always
read with the folder current when the read starts.

I5. A failed round, `refreshKey` read or own-write re-read leaves the failed list as it was
shown. A failed mount or drive-change read leaves the list empty and the summary `null`; a
failed folder-change tag read leaves tags empty.

I6. Each successful create, update, delete, add-items, remove-item and reorder on a
collection of drive D broadcasts `drive.collections_changed`, each successful pin and unpin
in D broadcasts `drive.pins_changed`, and each successful internal tag write on a file of D
broadcasts `drive.tags_changed`, with payload exactly `{"drive": "D"}`, scoped to D, once
per request and after the commit; a request that answers 4xx broadcasts nothing; no
webhook is sent for any of them.

I7. When the broadcast raises or cannot be sent, the write is committed and the response's
status and body are those of a successful write.

I8. Every new broadcast for a drive with an access group reaches only connections whose
groups include it.

I9. After the WebSocket reconnects with a drive shown, the sidebar runs one round.

I10. A round that replaces the collection list while a collection that is still listed is
being renamed or created keeps that input open with its typed text and its 409 state; when
the renamed collection is no longer listed, the input closes and no request is sent for it.

## Checked, no action

- **Making each screen call `requestRefresh`.** That is how the sidebar is kept in step
  today, and it is why four paths were missed. It also cannot see another tab, MCP or
  addons.
- **Re-reading only the list an event concerns.** With `WebSocketProvider` keeping only the
  last event, separate subscriptions can each miss the event another swallowed; one
  subscription that re-reads everything does not. The cost is three extra small GETs per
  round.
- **A hard cap of one round per 2 s.** Would delay the common single change by up to 2 s
  after a previous round; the trailing 500 ms with a 2 s maximum wait reacts to a single
  change in 500 ms and bounds a stream.
- **Fixing `WebSocketProvider` to keep a queue of events.** That would close the remaining
  same-tick miss for every subscriber, but it changes delivery for all of them and has a
  known issue of its own (the clip toast); a separate change.
- **Sending the internal tag write as `drive.file_updated` or a `files.updated` webhook.**
  `drive.file_updated` makes the folder listing reset and Drive Home refetch once per note
  during a Knowledge scan; a webhook would tell the Knowledge scanner about its own write.
  A sidebar-only event avoids both.
- **Smart folders.** Already announce writes within the tab; another tab learns on its
  next read. Not measured as a problem.
- **Drive list and auth status.** Change only with drives.json (restart) or unlock/lock
  (full page load since #701).
- **Collections changing through cascades** (a purged file leaves its collections): the
  purge already sends `drive.structure_changed`, which starts a round.
- **Home page shelves and other collection lists** (CollectionPicker reads on open, the
  collection page reads its own detail). Out of scope: the measured staleness is the
  sidebar's.
- **`home_shortcuts` writing `home_added_at`.** The sidebar does not show it.
- **The existing triggers** (mount, drive, folder, `refreshKey`) are covered by the
  existing hook tests; I5 states their failure behaviour so a round's keep-on-failure is
  not applied to the mount read.
- **Backend tests under TestClient** have no event loop, so `broadcast_from_thread` logs
  and sends nothing; the tests patch it and assert the call, so they do not pass because
  nothing was sent.
