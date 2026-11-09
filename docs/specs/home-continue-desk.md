# Continue as a desk: recent, started, and set-aside-able

SPEC-ID: SPEC-CORE-069
SPEC-ID: SPEC-CORE-070
SPEC-ID: SPEC-CORE-071

Approval:

## Summary

Every "Continue" in Litloft lists every file stopped before 90 %, however long ago and
however briefly it was opened. On production (one viewer, measured 2026-11-09, read-only,
inside the backend container) 284 files qualify; 228 were last touched more than 30 days
ago, and 53 are under 3 % in. The viewer can no longer tell which few things they mean to
come back to: on Home's row, on its See all, and on the Video and Reading apps' Continue
shelves.

Continue becomes a **desk**: what was started (at least 3 % in), is not finished (under
90 %), was touched in the last 14 days, and has not been set aside. On production that is
21 of 284.

- **SPEC-CORE-069**: Home. The row is renamed **続きから** / **Continue** and lists the
  desk across all kinds. Its See all opens a new `?view=continue` listing the desk, not
  the whole history. The watch-history endpoint gains `filter=continue`.
- **SPEC-CORE-070**: set-aside. A card in Home's Continue row can be set aside
  (**続きから外す** / **Remove from Continue**). This stamps `dismissed_at` on the viewer's
  history row and deletes nothing. Opening the file again puts it back on the desk.
- **SPEC-CORE-071**: the Video and Reading apps. Discover's Continue shelf and its See
  all list the desk of their kind, through a new shelves key `by=watch&key=continue`.
  Library's watch-state grouping and the In progress state filter keep their meaning.

Home already mixes kinds in this row; there are no video-only rows on Home to remove.

## Required items

### 1. Normal flow

The desk predicate, one backend expression shared by every reader below, holds for a
`watch_history` row of the requesting viewer when all of these are true:

- `duration > 0`
- `playback_position * 100 >= duration * 3`
- `playback_position * 10 < duration * 9` (the exact complement of `_watch_bucket`'s
  `finished`, so a desk row is never `finished`)
- `last_played_at >= now − 14 days`
- `dismissed_at IS NULL` or `dismissed_at < last_played_at`

`now` and the stored timestamps are compared as naive UTC, as `last_played_at` is written
today.

Home (069):

1. A viewer with a profile opens a drive's Home.
2. The page requests `GET /api/drives/{drive}/watch-history?filter=continue&limit=12`.
3. The backend returns this viewer's rows that meet the desk predicate, for active files of
   the drive (`active_file_filter()`), narrowed by `type` when given, newest
   `last_played_at` first, the first `limit`.
4. Home draws them in the first row under 続きから / Continue. `SectionRow` shows as many
   as fit (4 to 5 at common widths), as today.
5. The row's See all opens `/drive/{drive}?view=continue`. It requests the same filter
   with `limit=50` and the view's type filter, and lists the files newest-played first in
   the drive's list or grid, with the same branches as `?view=recent` (no pagination, no
   folder tree). Like the other views it has no page heading: the sidebar names it.
   Recently Viewed's See all stays `?view=recent`.
6. The sidebar's Views gain **続きから** / **Continue** (lucide `Play`) directly above
   Recently Viewed, lit on `?view=continue`, and page jump gains the same entry under the
   same condition as the sidebar row.
7. `?view=continue` with an empty desk shows a new empty state: title 途中のファイルはありません
   / Nothing in progress, description 最近 2 週間に開いて途中まで見たファイルが、ここに並びます。 /
   Files you opened in the last two weeks and stopped part-way appear here. Without a
   profile it shows the Recently Viewed no-profile state (`no-recent-profile`). A failed
   request shows the empty state, as `?view=recent` does today.

Set aside (070):

1. The viewer right-clicks (or long-presses) a card in Home's Continue row and chooses
   続きから外す / Remove from Continue (lucide `EyeOff`), placed directly above Remove
   from history.
2. The page sends `POST /api/files/{id}/progress/dismiss`.
3. The backend sets `dismissed_at = now` on this viewer's row for the file and returns
   `204`. Any existing row is accepted, whatever its state; a repeat dismiss writes `now`
   again.
4. After the `204`, the card leaves the Continue row (not Recently Viewed). A card that was
   fetched but beyond the row's capacity moves into view.
5. Any later `POST /api/files/{id}/progress` by the same viewer for that file (opening the
   file-detail page, or a player saving its position) sets `last_played_at` past
   `dismissed_at`, so the file is on the desk again if it meets the rest of the predicate.

Apps (071):

1. Discover in the Video or Reading app requests its Continue shelf as
   `GET /api/drives/{drive}/shelves?by=watch&key=continue&sort=last_played&order=desc`
   with the app's target filters, as it does today with `key=in_progress`.
2. The backend applies the desk predicate as the key filter. `continue` is accepted only
   as a `by=watch` key: a `by=watch` request without `key` still groups into
   `in_progress`, `unwatched` and `finished` and never returns a `continue` shelf;
   `watch=continue` as a filter value stays a `422`, as any unknown value is today.
   `_watch_bucket`, `WatchState` and `WATCH_KEYS` are not changed. On the frontend
   `continue` does not join `ShelfWatchState`; the shelf pages accept it as a key through
   their own check, and `parseWatchState` for the `?watch=` URL parameter keeps rejecting
   it.
3. The shelf's See all opens the shelf page with `key=continue`. Its heading is that app's
   Discover shelf string: Video 続きから / Continue (`videoApp.shelves.continue`), Reading
   続きを読む / Continue reading (`readingApp.shelves.continue`).

### 2. Failure cases

- Watch-history or shelves request fails: unchanged; each surface shows its existing
  failure state.
- Dismiss fails (network, `404`, `5xx`): the card stays where it was and
  `ContinueWatchingSection` shows the toast 続きから外せませんでした / Could not remove
  from Continue. It catches the error itself; `FileContextMenu` still swallows and closes.
- Dismiss without a viewer: `204`, nothing written. This check comes first, as in the
  other progress endpoints, so it wins over every `404` below.
- Dismiss for a file with no row for this viewer, a missing or trashed file, or a file in
  a drive the caller has not unlocked: `404`, nothing written.
- Migration fails at startup: startup fails, as for the other column migrations.

### 3. States

These are the desk's own classes. They are not the `by=watch` buckets, and
`_watch_bucket` is not changed: a row at 1 % is `in_progress` there and Barely started
here.

| Desk progress | Condition |
|---|---|
| Barely started | `duration = 0` or `position * 100 < duration * 3` |
| Started | `position * 100 >= duration * 3` and `position * 10 < duration * 9` |
| Finished | `position * 10 >= duration * 9` (same as `finished`) |

Set-aside is a flag beside the desk progress, not one more value of it:

| Set-aside | Condition |
|---|---|
| Set aside | `dismissed_at ≥ last_played_at` |
| Not set aside | `dismissed_at` null or `< last_played_at` |

A row is on the desk when it is Started, Not set aside, and touched within 14 days.

Allowed transitions:

- `POST /progress` (with or without a position) updates `last_played_at`, which clears
  Set aside, and may change the progress state.
- `POST /progress/dismiss` sets Set aside on any existing row.
- `DELETE /progress` removes the row; a later `POST /progress` creates a new one with
  `dismissed_at` null.
- Time alone takes a row off the desk after 14 days.

Not allowed: `GET /progress`, `POST /played-ranges`, highlight writes, comments, and any
addon read never change `dismissed_at` or clear Set aside. Nothing but the dismiss
endpoint writes `dismissed_at`.

### 4. Data read and written

- `watch_history`: gains nullable `dismissed_at DATETIME`, added by a guarded migration
  (only when the column is absent; a fresh DB gets it from the model). Existing rows get
  `NULL`. Written only by the dismiss endpoint. Read by `filter=continue` and
  `key=continue`.
- `files`: read as today.
- No cache, file or addon DB is touched.

### 5. External services

None.

### 6. Authorization

As for the other per-viewer progress endpoints: the viewer comes from `lit_viewer` or
`X-Lit-Viewer`; the file must be active and in an unlocked drive (`_get_file_or_404` →
`check_drive_access`). `filter=continue` keeps `_validate_drive` and returns an empty list without a viewer, as
the other filters do. `key=continue` keeps the shelves endpoint's drive check, and without
a viewer returns `400 viewer_required`, as every `by=watch` request does today; both apps
already handle that answer.

### 7. Effect on existing features

- `filter=unfinished` (default) and `filter=all` are unchanged: Recently Viewed,
  `?view=recent`, search's recent list and the MCP `get_watch_history` tool return what
  they return today.
- `by=watch` grouping and `key=in_progress` / `unwatched` / `finished` are unchanged:
  Library's watch grouping and the Reading app's state filter keep counting every
  in-progress file.
- `GET /api/files/{id}/progress` (resume position) is unchanged.
- The intelligence and media_import addons read `watch_history` with explicit column
  lists; an added column changes nothing there.
- Remove from history still deletes the row and removes the card from both Home rows.
- The `drive-home-sections` slot stays right after the Continue row.

### 8. Error behavior

- Dismiss failure: the toast above; nothing logged beyond the request log.
- `filter` other than `unfinished`, `all`, `continue`: `422`, as today.
- `by=watch` with a `key` other than the three states or `continue`: unchanged from today.

### 9. User-visible behavior

- Home: heading 続きを見る → 続きから, Continue Watching → Continue; icon unchanged.
  Files opened but barely started, files untouched for 14 days and set-aside files are no
  longer in the row or its See all. They stay in Recently Viewed.
- Home's Continue See all opens the new `?view=continue`; the sidebar's Views and page
  jump gain 続きから / Continue above Recently Viewed; an empty desk shows 途中のファイルは
  ありません / Nothing in progress. Recently Viewed's See all is unchanged.
- Home's Continue row card menu gains 続きから外す / Remove from Continue (`EyeOff`)
  directly above Remove from history. Recently Viewed's card menu does not.
- Video app Discover: Continue lists only desk videos; its See all likewise. Reading app
  Discover: 続きを読む likewise for books. The apps have no set-aside action; a file set
  aside on Home is gone from them too.
- A set-aside file comes back after the viewer opens it again.
- Without a profile none of the Continue surfaces is shown, as today.

### 10. Non-functional

- Every desk query is bounded by viewer and drive; the predicate adds row filters only.
- Thresholds are backend constants: 3 %, 90 % (existing), 14 days.
- `dismissed_at` is never returned by any endpoint.

## Touch points

- `backend/app/models.py`: `WatchHistory.dismissed_at`.
- `backend/app/database.py` (HIGH): guarded `ALTER TABLE watch_history ADD COLUMN
  dismissed_at DATETIME`.
- A shared desk predicate (backend), used by `backend/app/routers/drives.py`
  `get_watch_history` (`filter=continue`) and `backend/app/routers/shelves.py`
  `_key_filter` (`by=watch&key=continue`).
- `backend/app/routers/progress.py`: `POST /api/files/{file_id}/progress/dismiss`.
- `backend/tests/`: watch-history, shelves, progress and migration tests.
- `frontend/src/lib/api.ts`: `getWatchHistory` accepts `"continue"`; new
  `dismissContinueItem(fileId)`; `ShelfWatchState` or the shelves key type accepts
  `continue` as a key.
- `frontend/src/components/DriveHome.tsx`: Continue row `filter=continue`, See all
  `?view=continue`; separate removal handlers for dismiss (Continue row only) and Remove
  from history (both rows).
- `frontend/src/components/ContinueWatchingSection.tsx`, `FileContextMenu.tsx`,
  `frontend/src/hooks/useFileMenuItems.ts`: the menu item and the toast.
- `frontend/src/lib/driveViews.ts`, `frontend/src/components/folder/useFolderFiles.ts`,
  `frontend/src/components/FolderBrowser.tsx`, `frontend/src/components/folder/FolderContent.tsx`,
  `frontend/src/components/EmptyState.tsx`, `frontend/src/components/sidebar/SidebarLibrarySection.tsx`,
  `frontend/src/lib/pageJump.ts`: the `continue` view, its sidebar row, page-jump entry and
  empty state. Tests that enumerate views or check sidebar/page-jump parity
  (`app/drive/[name]/__tests__/layout.test.tsx`, `page.test.tsx`,
  `components/sidebar/__tests__/pageJumpParity.test.tsx`) gain the view.
- `frontend/src/components/videoapp/useDiscover.ts`, `DiscoverFace.tsx`,
  `VideoShelfPage.tsx`, `labels.ts`; `frontend/src/components/readingapp/useDiscover.ts`,
  `DiscoverFace.tsx`, `ReadingShelfPage.tsx`, `labels.ts`: `key=continue`.
- `frontend/src/messages-core/ja.json`, `en.json`: Home heading, sidebar row, menu label,
  toast, empty-state copy. The shelf-page headings reuse the existing Discover strings.
- Frontend tests whose assertions change (to the new call, heading or key, not loosened):
  `frontend/src/__tests__/DriveHome.test.tsx` (`getWatchHistory("media", 12)` →
  `getWatchHistory("media", 12, "continue")`), `DriveHome.icons.test.tsx`,
  `DriveHome.driveChange.test.tsx`, `driveHomeSectionOrder.test.tsx`,
  `driveHomeFailureState.test.tsx`, `accent-budget.test.tsx` ("Continue Watching" /
  「続きを見る」 → "Continue" / 「続きから」), `section-rows.test.tsx` (`getWatchHistory`
  signature), and the video and reading app Discover tests that assert `in_progress`
  for the Continue shelf.
- Docs: `docs/reference/api.md`, `docs/user-guide/overview.md`, `file-browsing.md`,
  `comments-history.md`, `playlists-favorites.md`, `profile-preferences.md`, `video.md`,
  `reading.md`, `docs/addons/media-import.md`, `docs/ADDON-DEVELOPMENT.md` (slot location).
- Rules passed through: `.claude/rules/design-decisions.md` "Watch history and profiles"
  (only an explicit Remove from history deletes a row), "Drives" (drive-scoped queries).

## Invariants

I1. `filter=continue` returns only this viewer's rows for active files of the requested drive that meet the desk predicate (`duration > 0`, `playback_position * 100 >= duration * 3`, `playback_position * 10 < duration * 9`, `last_played_at` within the last 14 days, `dismissed_at` null or earlier than `last_played_at`), narrowed by `type` before `limit`, ordered by `last_played_at` newest first, at most `limit`; no returned row is `finished` under `by=watch`.
I2. `filter=continue` without `type` returns a qualifying video, audio, PDF, EPUB, archive, text or `.loft` row regardless of kind.
I3. `filter=unfinished` and `filter=all`, and `by=watch` grouping with `key` `in_progress`, `unwatched` or `finished`, return the same rows and counts as before this change, whatever `dismissed_at` holds.
I4. `by=watch&key=continue` returns exactly the files under the request's filters whose viewer row meets the desk predicate, the same set `filter=continue` gives for that drive; without a viewer it is `400 viewer_required`; `by=watch` without `key` never returns a `continue` shelf; `watch=continue` is `422`.
I5. A dismiss writes only `dismissed_at` of the caller's row for that file: `playback_position`, `duration` and `last_played_at` are unchanged, the row is not deleted, no other row changes, `GET /api/files/{id}/progress` still returns the stored position, the file stays in `key=in_progress`, and no endpoint's response contains `dismissed_at`.
I6. After a dismiss, a later `POST /api/files/{id}/progress` by the same viewer for that file, with or without a position, puts it back under `filter=continue` and `key=continue` when it meets the rest of the predicate; no other request clears a dismiss.
I7. A dismiss without a viewer returns `204` and writes nothing, even for a missing, trashed or locked file; with a viewer, a file with no row, a missing or trashed file, or a file in a drive the caller has not unlocked returns `404` and writes nothing.
I8. Startup on a database without `dismissed_at` adds it as `NULL` for every existing row and loses no row; a fresh database and a second startup both start without error.
I9. Home's Continue row is headed 続きから / Continue and requests `filter=continue`; only its card menu offers 続きから外す / Remove from Continue, directly above Remove from history; a successful dismiss removes the card from that row and not from Recently Viewed; a failed one leaves it and shows the toast; Remove from history still removes the card from both rows.
I10. Home's Continue See all opens `?view=continue`, which requests `filter=continue` with `limit=50` and the view's type, is lit by a sidebar row and page-jump entry 続きから / Continue directly above Recently Viewed, and shows the new empty state when the desk is empty; in both apps Discover's Continue shelf and its See all use `key=continue`, and the shelf page for that key is headed with that app's Discover shelf string.

## Revises

SPEC-CORE-057 I8. Discover's shelves are: Continue = the viewer's videos that meet the desk predicate of SPEC-CORE-069 (`by=watch&key=continue`), most recently played first; Recommended = a random sample of the viewer's `unwatched` videos (of all videos under the target when there is no profile); New = videos by `created_at` descending; each at most 12; a shelf with no videos is not drawn; Continue is not drawn without a profile.
SPEC-CORE-061 I17. Discover is Continue reading = the viewer's books that meet the desk predicate of SPEC-CORE-069 (`by=watch&key=continue`) by last played, Not read yet = a random sample of `unwatched` books (all books under the target when there is no profile), New = `created_at` descending, at most 12 each; an empty shelf is not drawn; Continue reading is not drawn without a profile.

## Checked, no action

- **Video-only rows on Home.** None exist; only the heading said "Watching".
- **A cap on Home's row.** `SectionRow` already shows only what fits (4 to 5 cards); the
  request stays at 12 so a dismissed card is replaced from what was fetched.
- **An explicit "save for later" list.** Rejected with the user: it needs an action at the
  moment of leaving, which is usually skipped, and such lists grow without bound.
- **Deleting the row on set-aside.** Rejected with the user: it would lose the resume
  position.
- **A set-aside action in the apps.** Not in this change; the apps honour a set-aside made
  on Home. Their cards have no per-card menu today.
- **Changing `in_progress` itself.** It is a watch state, used by Library grouping and the
  state filter, where "every started book" is the right answer. The desk is a separate key.
- **Per-kind thresholds.** Positions are in different units per kind (seconds, pages, a
  0–1 fraction for EPUB and text); only the ratio is comparable. A short PDF opened on page
  1 can pass 3 %; accepted.
- **Visit counts as an intent signal.** `watch_history` keeps one row per viewer and file
  with no count; not needed for the measured problem.
- **MCP `get_watch_history`.** Keeps `unfinished` / `all`; its description says
  "continue-watching" loosely, and agents read the position themselves.
- **Undo after set-aside.** Opening the file again is the way back; Recently Viewed still
  lists it.
- **A design artifact.** No new screen: a heading, a menu item, a sidebar row, a view
  reusing the Recent view's list, and a different key on existing shelves.
- **`docs/IMAGES-NEEDED.md`.** A list of screenshots to take; the old heading there does
  not mislead a user.
