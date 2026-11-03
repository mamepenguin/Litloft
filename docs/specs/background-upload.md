# Uploads that keep going while the viewer moves around the app

SPEC-ID: SPEC-CORE-030

Approval: sha256:ffe09b32450a1f43cf6e5aaec2211505c8508836e1a38857b51bc8b161bf5211 Yuichi Senga 2026-11-03

## Summary

A viewer who drops files on a folder and then opens a file, another folder or another
drive loses sight of the upload. The upload queue and its drawer live inside the folder
view (`UploadZone` → `useUpload`), so leaving the view unmounts them. The requests keep
running in the background, but nothing shows their progress, nothing can cancel them, a
failure is reported to no one, and the folder's listing is not refreshed when they end.
Worse, the queue reads the folder path of the current render: a file still queued when
the viewer moves to another folder of the same drive is uploaded into that other folder.

This change moves the queue and the drawer to the app's root layout, so an upload
continues and stays visible and cancellable on every page of the app, and each file goes
to the folder it was added to. A file whose destination folder no longer exists when its
upload starts fails instead of recreating the folder. Closing or reloading the tab, or
locking the app, while an upload is unfinished asks for confirmation first. It is for
the viewer who uploads a batch and keeps using the app meanwhile.

Continuing after the tab is closed is out of scope: a page that is gone can no longer
read the files the viewer picked, and no browser Litloft supports offers a background
upload of local files (decided with the user on 2026-11-03).

## Required items

### 1. Normal flow

1. The viewer drops files or a folder on a view that hosts an upload zone, or picks them
   from the **Add** menu there, as today. The views that host one are those pinned by
   `frontend/src/__tests__/uploadZoneHosts.test.tsx`: Home, folder listings, and the
   drive-wide views (Favourites, Liked, Recent, Recently Added, All Files, a tag view),
   which upload to the drive root.
2. The zone hands each file to the app-wide upload queue together with its destination:
   the zone's drive and folder (the drive root for the drive-wide views), and the file's
   relative path inside a dropped folder. The destination is fixed at the drop or the
   pick. For a dropped folder that is still being read, files read after the viewer has
   left the view are still queued, to that same destination.
   The queue is a module-level store read with `useSyncExternalStore`, not a React
   provider, so components and tests that render without it keep working.
3. The queue uploads at most two files at a time across the whole app, in the order they
   were added, with today's chunked protocol (`upload/init`, `upload/{id}/chunk`,
   `upload/{id}/complete`) and today's chunk sizes.
4. The queue sends `require_folder: true` in the `POST /api/drives/{drive}/upload/init`
   body. With it, `init` checks that the destination folder (the folder sent as
   `folder_path`, before the dropped folder's relative path is merged in) exists as a
   directory in the drive. If it does, the upload proceeds as today, creating the dropped
   folder's subfolders as today. Without the field, `init` behaves exactly as today.
   The session remembers the field, and `upload/{id}/complete` repeats the same check
   before writing the file, so a folder renamed or moved while the file was being sent is
   not recreated either.
5. The drawer (`UploadProgress`) is drawn by the root layout whenever the queue holds an
   entry, on every page. Its content and controls are today's: progress, cancel for a
   pending or uploading file, **Clear** for finished ones, collapse. **Clear** removes the
   finished entries of every drive and does not refresh any listing.
6. When a file completes, every mounted view that hosts an upload zone for the same drive
   refreshes its listing. The search results view hosts none and does not refresh.
7. The viewer moves around the app freely; uploads continue and the drawer keeps showing
   them.

### 2. Failure cases

- A chunk, init or complete request fails: that file's entry shows **Error** with the
  message, as today, on whatever page the viewer is on; the other files continue.
- The destination folder was renamed, moved or deleted from disk before the file's
  upload started: `upload/init` answers 404 with `{"detail": "destination_folder_not_found"}`;
  no folder, temp directory or session is created.
- The same happened while the file was being sent: `upload/{id}/complete` answers the
  same 404, deletes the session and its received chunks, and writes nothing.
- In both cases the entry shows **Error** with the translated message *The destination
  folder was not found* (ja: 送り先のフォルダが見つかりません). `initUpload` and
  `completeUpload` read this one `detail` code; every other error keeps today's text, so a
  locked drive's 404 still reads as today.
- The destination drive becomes locked or unreachable mid-upload: the next request fails
  and the entry shows **Error**; nothing is retried.
- The viewer closes or reloads the tab while an entry is pending, uploading or
  processing: the browser's own leave-page confirmation is shown, where the browser
  offers one (iOS Safari and the iOS app do not). If the viewer leaves
  anyway, the uploads stop as today; the server cleans up the abandoned session after 24
  hours as today.
- The viewer presses **Lock** while an entry is pending, uploading or processing: an
  in-app confirmation (`ConfirmDialog`) asks before anything is locked: title
  *Uploads in progress* (ja: アップロード中です), message *Locking interrupts the uploads in
  progress.* (ja: ロックすると、実行中のアップロードは中断されます。), buttons *Lock*
  (ja: ロックする) and *Cancel* (ja: キャンセル). Confirming locks and reloads as today; cancelling leaves everything as it was,
  unlocked, with the uploads running. With no unfinished entry, **Lock** behaves as
  today. The reload after a confirmed lock does not show the upload's leave-page
  confirmation a second time; an unsaved-edit prompt from `DirtyBlocker` still applies
  as today.

### 3. States

Per entry: pending → uploading → processing → complete; pending or uploading →
cancelled on cancel; pending, uploading or processing → error on failure.

Not allowed:

- complete, error and cancelled are final: an entry never leaves them, and navigation
  never restarts one.
- processing cannot be cancelled (no cancel control is drawn for it, as today).
- a cancelled entry stays cancelled even when a chunk request already in flight succeeds
  afterwards; no further chunk and no `complete` is sent for it, and its server session
  is cancelled. (`complete` is sent only in processing, which cannot be cancelled.)

Finished entries (complete, error, cancelled) stay until **Clear**. The drawer's collapsed
state lasts across navigation; it resets to expanded when the drawer empties, and adding
files expands it.

The leave-page confirmation and the lock confirmation are armed while at least one entry
is pending, uploading or processing, and disarmed otherwise.

### 4. Data read and written

- Server: the same upload endpoints. `upload/init` with `require_folder` also reads
  whether the destination folder exists; it writes nothing new.
- Browser: the queue and its `File` objects live in memory under the root layout only.
  Nothing is written to storage, so a reload empties the drawer, as today.

### 5. External services

None: the change calls only Litloft's own upload endpoints.

### 6. Authorization

Unchanged. Each request carries the viewer's cookies as today, and the backend checks
drive access on every upload request. Moving to another drive does not change which drive
a queued file goes to, and cancel is sent to the entry's own drive.

### 7. Effect on existing features

- `UploadZone` keeps the drop target, the drag overlay and the `upload-files` event used
  by the **Add** menu (`AddButton`, `useFilePicker`), but hands files to the app-wide
  queue instead of owning one.
- `FolderBrowser` and `DriveHome` no longer pass a per-view completion callback; they
  refresh on the queue's completion signal for their own drive (1, step 6).
- Today each mounted zone has its own queue; now there is one, so "two at a time" is
  app-wide.
- In-app navigation is not blocked by an unfinished upload: `DirtyBlocker`'s in-app guard
  (`dirtyRegistry`, `navigationGuard`) is not used.
- The drawer's collapsed state now lasts across navigation.
- `router.refresh()` (language switch, `ClipboardProvider`) does not remount the root
  layout's providers, so the queue survives it.
- The folder check is opt-in: MCP `upload_file` (which may name a folder that does not
  exist yet and relies on the upload creating it) and the knowledge editor do not send
  `require_folder` and behave as today.
- Existing tests that render `UploadZone`, `DriveHome` or `FolderBrowser` without a
  provider, or call `useUpload` directly, are moved onto the provider with their
  assertions unchanged; the destination table and count guard in
  `uploadZoneHosts.test.tsx` keep every row.

### 8. Error behavior

Per-file errors are shown in the drawer as today, with no toast. The backend logs nothing
new beyond its usual request log for the 404.

### 9. User-visible behavior

- The upload drawer stays on screen, with its progress, cancel and **Clear**, when the
  viewer opens a file, another folder, another drive, search or settings.
- A file goes to the folder it was added to even if the viewer has moved on before it
  started. If that folder was renamed, moved or removed meanwhile, the file shows
  **Error** with "Destination folder not found".
- Closing or reloading the tab during an upload shows the browser's leave-page
  confirmation in browsers that offer one. **Lock** during an upload asks first.
- The drawer never covers the mini-player or the mobile inspector sheet's bar: it sits
  directly above whichever of them is shown, and above both when both are, with the
  mini-player's 16 px gap. While the mobile inspector sheet is open at half or full height,
  the drawer is not drawn, and it comes back when the sheet returns to its bar. Otherwise
  it stays in today's bottom-right place; on desktop file pages it may cover the lower
  right of the side panel, as it covers listings today, and can be collapsed.
- The open listing refreshes when one of its drive's uploads completes, as it does today
  when the viewer stays.
- `docs/user-guide/upload-and-fileops.md` says that uploads continue while you move
  around the app but stop when the tab is closed or reloaded (most desktop browsers ask
  first), that a file whose folder was renamed or moved meanwhile fails, and that in the
  iOS app uploads may stop while the app is in the background.

### 10. Non-functional

- Memory: the queue holds the `File` references the viewer picked, as today; nothing is
  copied.
- Concurrency: at most two files in flight across the app.
- One extra directory check per `upload/init`; no new request types.

## Touch points

- `frontend/src/hooks/useUpload.ts`: the queue becomes an app-wide module store, each
  entry carrying its drive and folder; the per-view hook is replaced by access to that
  store. `UploadFileEntry` stays exported from here.
- `frontend/src/components/UploadZone.tsx`: hands files to the app-wide queue; no longer
  renders `UploadProgress`.
- `frontend/src/components/UploadProgress.tsx`: rendered once by the root layout; its
  bottom offset follows the mini-player and the mobile inspector sheet's bar.
- `frontend/src/app/layout.tsx`: mounts the upload provider and the drawer inside the
  existing providers.
- `frontend/src/components/FolderBrowser.tsx`, `frontend/src/components/DriveHome.tsx`:
  refresh on the queue's completion signal for their drive.
- `frontend/src/components/Sidebar.tsx`: **Lock** asks with `ConfirmDialog` while an
  upload is unfinished, and disarms the leave-page confirmation for its own reload.
- `frontend/src/components/MiniPlayerContainer.tsx`,
  `frontend/src/components/MobileInspectorSheet.tsx`: read, so the drawer can sit above
  them (expose their shown state or height; no visual change to them).
- `frontend/src/components/AddButton.tsx`, `frontend/src/components/useFilePicker.tsx`,
  `frontend/src/lib/directoryReader.ts`: use the `UploadFileEntry` type; behaviour
  unchanged.
- `frontend/src/messages-core/ja.json`, `en.json`: the lock confirmation's text and the
  destination-folder error.
- `frontend/src/lib/api.ts` (`initUpload`, `completeUpload`): read the
  `destination_folder_not_found` code.
- Tests that drive the queue through `useUpload` or `UploadZone`
  (`frontend/src/__tests__/uploadZoneHosts.test.tsx`, `DriveHome.test.tsx`,
  `driveHomeFailureState.test.tsx`, `frontend/src/hooks/__tests__/useUpload.test.ts`) are
  adapted to the store with their assertions unchanged; the store is reset between
  tests.
- `backend/app/services/upload.py` (`init_upload`), `backend/app/routers/uploads.py`,
  `backend/app/schemas.py` (the init request body): the optional `require_folder` field
  and the folder check at `init` and at `complete`. `backend/tests/test_upload.py`: its
  test.
- `frontend/src/lib/api.ts` (`initUpload`): passes `require_folder`.
- `docs/user-guide/upload-and-fileops.md`: the sentences in 9.
- `docs/reference/api.md`: `require_folder` and the 404 from `upload/init`.
- Rules passed through: `.claude/rules/frontend-conventions.md` (DESIGN.md, Next.js 16
  client components), `.claude/rules/backend-conventions.md` (path checks under the drive
  base), the SPA navigation policy (page moves stay client-side; the lock's full reload
  is the one exception).
- The drawer's placement above the mini-player and the inspector bar, at desktop and
  mobile widths, is measured in a real browser (R-5): no pixel of the drawer overlaps
  either element.
- No protected path is edited.

## Invariants

I1. A file added from a zone, by drop or from the **Add** menu, is uploaded to that zone's drive and folder (the drive root for the drive-wide views) plus its relative path, whatever page or folder the viewer is on when its upload starts.
I2. Navigating within the app, or a `router.refresh()`, neither cancels nor restarts an unfinished upload, and the drawer still lists every entry with its current status.
I3. Cancelling a pending or uploading entry from any page stops its upload and sends the cancel request to that entry's own drive and upload id; a cancelled entry never becomes complete and no `complete` is sent for it.
I4. At most two files are uploading or processing at once across the whole app, and pending files start in the order they were added.
I5. While at least one entry is pending, uploading or processing, the upload's `beforeunload` handler cancels the event; with none, it does not; and after a confirmed **Lock** it does not.
I6. An unfinished upload never blocks in-app navigation.
I7. **Lock** with an unfinished upload calls the lock API only after the viewer confirms; cancelling leaves the app unlocked and every upload running.
I8. When a file completes, every mounted upload-zone view of the same drive refreshes its listing at least once afterwards, and no view of another drive, and no search view, does.
I9. A failure of one file shows **Error** on its entry and does not stop the other entries.
I10. `upload/init` with `require_folder: true` and a `folder_path` that is not an existing directory of the drive answers 404 `destination_folder_not_found` and creates no directory, temp directory or session; `upload/{id}/complete` for such a session whose folder has gone answers the same and writes no file and no folder; with an existing folder, or without `require_folder`, both behave as before.
I11. The entry for a `destination_folder_not_found` answer shows the translated destination-folder message; every other upload error shows today's text.
I12. **Clear** removes the finished entries of every drive and leaves unfinished ones; it triggers no listing refresh.
I13. The drawer overlaps neither the mini-player nor the mobile inspector sheet's bottom bar when either is shown, and is not drawn while the sheet is open at half or full height.

## Checked, no action

- **Continuing after the tab is closed or reloaded.** Not possible in the browsers
  Litloft supports (see Summary). Resuming a reloaded upload from the chunks the server
  already holds would need a re-pick of the same file, and the in-memory sessions do not
  survive a backend restart; not part of this spec.
- **No leave-page prompt on iOS.** iOS Safari and WKWebView do not show a
  `beforeunload` confirmation, so closing the tab there stops uploads without asking.
  The user guide words the prompt as a desktop-browser behaviour.
- **The iOS app in the background.** WKWebView suspends the page's scripts, so uploads
  may stop or fail; what the drawer shows on return cannot be verified by an agent
  (`agent_cannot_verify`). A native background transfer is a separate unit; this spec
  only documents the limit, worded as "may stop".
- **A destination folder that was trashed.** Trash does not touch the filesystem, so the
  folder still exists on disk and the upload lands there, as a drop into it would today.
- **Uploads that bypass the queue.** The knowledge editor's image drop calls the upload
  API directly; it is not shown in the drawer and does not arm the confirmations. Out of
  scope.
- **Showing each entry's destination in the drawer.** The drawer shows the relative path
  or file name as today; a destination label is a separate design question.
- **Retrying a failed file.** Not offered today; not added.
- **Persisting the drawer across reloads.** The `File` objects cannot be kept, so a
  persisted list could not be acted on.
