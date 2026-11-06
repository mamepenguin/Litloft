# Resume reading in archives and long text documents

SPEC-ID: SPEC-CORE-049
SPEC-ID: SPEC-CORE-050

Approval:

## Summary

Video, audio, PDF and EPUB already remember where the viewer stopped, through
`WatchHistory.playback_position` and `duration`. A ZIP archive read as a book (comic pages,
a photo set) and a long Markdown or text document forget: closing the file loses the page
or the scroll position, and nothing on Home says it was half read. This change records both
in the same two columns, with no schema change and no backend change, and reuses the
convention PDF resume already follows: the first page is never written, a finished
document starts over, an explicit target outranks the stored one, and a position that the
reader walked back from stays as the last place they read on.

- **SPEC-CORE-049**: an archive records the ordinal of the image the reader is looking at
  (counted over the whole archive) and the archive's image count. Opening the archive shows
  a **Resume** button above the listing; the viewer is never opened on its own.
- **SPEC-CORE-050**: a Markdown or text document longer than two screens records how far
  down it was read, in thousandths, and scrolls back there on the next open.

The viewer is one person on a PC browser. The phone layout and the iOS app run the same web
pages and are not specified separately; the iOS result is not verified (see 10).

## Required items

### 1. Normal flow

Archive (SPEC-CORE-049):

1. The viewer opens an archive file page. The page loads the archive index. The images are
   the index entries with `is_dir` false and `file_type` `"image"`; N is their count. They
   form one sequence: the folders that hold at least one image, ordered by
   `localeCompare` on the folder path (the archive root is the empty path and comes
   first), and within a folder the images ordered by `localeCompare` on the entry path,
   which is the order the image viewer flips through that folder today. The sequence is
   exactly those per-folder orders concatenated in folder-path order, and `file_type`
   `"image"` in the index is the only membership test. An image's
   position in the sequence, counted from 1, is its ordinal. The viewer's next and
   previous stay within one folder; the ordinal is only the number that names an image
   across the whole archive, so it jumps when the reader changes folder. An image that
   fails to load or decode still counts in N and in the ordinal, and showing it records.
2. The viewer opens an image (from the grid, the list, the inspector index, or Resume) and
   reads. Each time the viewer shows a different image whose ordinal is 2 or more, the
   ordinal is saved as `position` and N as `duration`. The save is a trailing debounce: it
   is sent after 1 s without a further change, and a pending one is sent at once when the
   viewer closes, the file changes (under the file id it was made for) or the page is left.
   Nothing is saved before the index has
   loaded, because the viewer cannot show an image before that.
3. The viewer opens the same archive again. If a position was stored for them, N equals the
   stored `duration`, and `2 <= position < N`, a **Resume** button with `position / N`
   appears above the listing. When the viewer closes during the same visit, the button
   shows the ordinal most recently saved in this visit if there is one, and the stored
   value otherwise, under the same condition. A stored position that is read after the
   reader has already saved one in this visit is discarded; the visit's own save wins.
4. Pressing it moves to the folder that holds that image and opens the viewer on it.
   Nothing else opens the viewer.

Text (SPEC-CORE-050):

1. The viewer opens a Markdown or text file page. Which store is used is decided by
   whether a nickname is set at the moment of each read or save, as for PDF. The text
   renders in the nearest
   scrollable ancestor of the rendered text, found at runtime, which is the page's `<main>`
   in the full-page layout and the right pane's scroll area in the two-pane layout.
2. The scroll host's own `scrollHeight` and `clientHeight` feed both tests: the document
   is long enough when `scrollHeight >= 2 * clientHeight`, and the fraction below uses the
   same two values. While the document is shown in its read view (not the Markdown editor's
   edit mode) and it is long enough, the reader's
   scrolling is recorded: `position` is `round(scrollTop / (scrollHeight - clientHeight) *
   1000)`, `duration` is 1000, saved by the same trailing debounce and again when the page is
   left. A position under 50 is not written.
3. The viewer opens the same file again. Once, after the text has been committed to the
   page (the load has finished and the first render is in the DOM), if the stored values are
   `duration = 1000` and `50 <= position < 900`, and the current rendered height is at
   least twice the visible height, the scroll host is scrolled to that fraction of the
   current scrollable range. The restore runs at most once per open of a file; a resize or
   a late render afterwards does not run it again.
4. A scroll event is the restore's own when the host's `scrollTop` equals the target the
   restore set, or the browser's clamp of it; a scroll event that leaves that value is the
   reader's, however soon it follows. A reader's scroll before the restore has landed
   abandons it and is recorded, even when that overwrites a larger stored position: the
   last write wins, as it does for PDF. The stored read has no timeout; until it returns
   or fails, nothing is restored.

### 2. Failure cases

- Saving fails (network, server, locked drive): ignored. Reading is not disturbed, no
  message appears, and the previously stored position stays.
- Reading the stored position fails: no Resume button; the text opens at the top.
- Loading the archive index fails or is slow: the existing loading and error states show
  and nothing is recorded or offered, because no image is shown and N is unknown.
- The archive changed since the position was stored (an image added, removed or replaced
  makes N differ): no Resume button. The row stays until the next write replaces it. An
  edit that keeps N and reorders images is not detected; Resume then opens the image now at
  that ordinal.
- The stored position is outside the range (`>= N`, or under 2): no Resume button.
- The archive has no images or one image: nothing is recorded and no button appears.
- The reader walks back to the first image, or back above 5 % of a text, and leaves: the
  later stored value stays and is what the next open resumes from. Nothing clears it
  except an explicit **Remove from history**, which already exists.
- Text edited since the position was stored: the fraction is applied to the current range,
  so it lands near, not exactly at, the old place.
- Text that grows after the restore (late images, async rendering): the scroll lands where
  the fraction pointed at the moment it was applied, and is not corrected.
- The reader scrolls before the stored position has been read or applied: the restore is
  abandoned and their scroll is recorded.
- The restore's own scroll is not a reader scroll: it is neither recorded nor does it
  count as the reader having scrolled. A clamp by the browser at the end of the range is
  likewise not the reader's.
- An explicit target is present: the stored position is not applied. A target is the
  `highlight` prop the page already passes to the viewer, or a non-empty `location.hash`
  when the file opens; in the two-pane layout the URL may carry neither, and then nothing
  suppresses the restore.
- No scrollable ancestor is found: nothing is recorded and nothing is restored.
- A restore that lands under 50 is the restore's own scroll and is not recorded.
- The text is shorter than two screens now (edited, or a taller window): no restore and no
  recording, whatever is stored.

### 3. States

Archive Resume button: `hidden` and `shown`.

- `hidden` to `shown`: the stored position has been read for the viewer, the index has
  loaded, and the condition in step 3 holds.
- `shown` to `hidden`: the viewer opens, or the file changes (the new file starts at
  `hidden` and is evaluated from its own stored position and index).
- Pressing Resume when the entry is no longer in the index does nothing: no viewer opens.
  The index is loaded once per file; an archive that changes underneath an open page is
  seen at the next open.
- `hidden` to `shown` again: the viewer closes and the condition in step 3 holds for the
  value most recently saved or stored.
- The button is never shown while the viewer is open.

Text restore: `idle` to `pending` when the text has been committed and the stored position
is being read; `pending` to `applied` (scrolled once) or `abandoned` (the reader scrolled
first, an explicit target is present, or the stored values are ineligible). `applied` and
`abandoned` are final for that open: no transition back to `pending`, and no second
restore. A new file id or a remount starts again at `idle`.

Text recording: `off` while the document is shorter than two screens, in edit mode, or
under position 50; `on` otherwise. It follows the current state as the window is resized or
the text is edited.

### 4. Data read and written

- `WatchHistory` (`playback_position`, `duration`, `last_played_at`): read and written
  through the existing `GET` / `POST /api/files/{id}/progress`. Archives write the ordinal
  and N; text writes thousandths and 1000. The row is keyed by the viewer's profile, so
  another nickname has its own position. No new column, endpoint or migration.
- Without a nickname (no profile), the position is kept in this browser's local storage
  through the existing `recentlyPlayed` helpers instead, as PDF does; the server is not
  called for positions. The same boundaries apply to what it holds, and a local entry
  whose `duration` does not match (N for an archive, 1000 for text) is ignored.
- Existing rows of these files that carry no position (`0` / `0`, written by the page-open
  record) are read as "nothing stored".

### 5. External services

None. Only Litloft's own progress endpoints are called; if they are slow or down, see 2.

### 6. Authorization

Unchanged. The progress endpoints keep their checks (`check_drive_access`, viewer identity
from the `lit_viewer` cookie or `X-Lit-Viewer`). A locked drive's files return 404 and the
viewer writes nothing.

### 7. Effect on existing features

- Home's **Continue Watching** (the drive's watch-history route in
  `backend/app/routers/drives.py`, gate `position < duration * 0.9`) will now list archives
  and long text documents that were stopped before 90 %, beside video, PDF and EPUB, with
  the existing progress bar on the card. That row needs a nickname, as it does today. A
  finished archive or a text read to 90 % leaves the row, and the record is kept, as
  `.claude/rules/design-decisions.md` requires. The gate is a ratio, so for an archive of
  ten images or fewer the row leaves at ordinal N - 1 (N = 10, ordinal 9) while Resume still
  shows; that mismatch is accepted.
- A card can be stale: an archive whose N changed keeps its row and bar, and the page then
  shows no Resume button; a text that became short keeps its row and opens at the top.
  PDF has the same behavior when its page count changes. It is accepted.
- Recently Viewed is unchanged. `personal_history` in the intelligence addon reads only
  `last_played_at`; `media_import` reads only videos. Neither interprets `position`.
  `mcp-server/` uses `position` only as a collection item's order, and `ios/` does not read
  the watch-history columns (a search of both found no other use).
- The components reach their file id and the profile as they do today (`fileId` props,
  `useProfile`); `FilePreview.tsx` and the external props of `MarkdownPreview` do not
  change.
- The page-open record (`recordFileView`, empty body) keeps updating only `last_played_at`.
- `useArchiveSort` orders the listing only; the sequence the viewer flips through is
  independent of it, so changing the listing's sort or type filter changes no ordinal.
- `useImageViewer` and `useArchiveNavigation` also serve loose-image viewing inside an
  archive folder and text entries; reporting the shown image changes neither. Archive text
  entries (`ArchiveTextViewer`), PDF, EPUB, video and audio pages share the scroll host and
  are unchanged.
- The Knowledge addon's editor wraps core's `MarkdownPreview`, not the other way round, so
  the recording stays in core's read view and no `addons/*` file changes.

### 8. Error behavior

Nothing is shown on any failure (see 2). No new logging; a failed save is dropped, as the
PDF and EPUB savers do.

### 9. User-visible behavior

- Archive: a **Resume** button with `12 / 80` above the listing when it applies, in the
  toolbar row, in both grid and list layouts. The key is `archive.resume` in `messages-core`
  with the values `Resume ({position} / {total})` and `続きから（{position} / {total}）`. It
  uses the existing button style. Pressing it changes the
  folder (the breadcrumb follows) and opens the viewer on that image.
- Text: opening a long, previously read document scrolls it to where it was left. No
  control and no message. A document read to 90 % or more opens at the top.
- Home: the archive or document appears in Continue Watching with its progress bar.
- A short document and the first 5 % of a long one never appear in Continue Watching.
- The boundary values the behavior is pinned to: text position 49 is not written and 50 is;
  a stored 899 is restored and 900 is not; an archive ordinal 1 is not written and 2 is;
  a stored archive position `N - 1` shows Resume and `N` does not. The three-way agreement
  of Resume, the 90 % gate and the card is promised for N above ten only (see 7).

### 10. Non-functional

- At most one save per file per second while paging or scrolling, plus one on leaving; the
  same cadence as PDF and EPUB.
- The ordinal sequence is computed from the archive index the page already loads; no new
  request, and no image is fetched for it.
- Privacy: the stored values are numbers on the viewer's own `WatchHistory` row; no file
  names or content go anywhere new.
- Positions of archives and text share the columns with media seconds; every reader of
  `position` that matters here is listed in 7.
- The text restore is layout behavior, which jsdom cannot measure. It needs a real-browser
  check in `frontend/e2e-layout/` in both the full-page and the two-pane layout, for: a
  document under two screens (no restore, no write); stored 49 (no restore), 50 and 899
  (restored) and 900 (opens at the top); a document that grows after the restore; a
  `highlight` or hash target present; the reader scrolling before the stored read returns
  (restore abandoned, the scroll recorded); the stored read pending, failed and empty. The
  iOS app's WKWebView is not verified by the agent (`PROJECT.md`, `agent_cannot_verify`).

## Touch points

- `frontend/src/components/ArchivePreview.tsx` (compose the resume logic, own the Resume
  state, open the stored ordinal through the existing `openFromIndex`)
- `frontend/src/components/archive/ArchiveToolbar.tsx` (the Resume button)
- `frontend/src/components/archive/useArchiveNavigation.ts` and
  `frontend/src/components/archive/archiveUtils.ts` (the archive-wide image sequence)
- `frontend/src/components/archive/useImageViewer.ts` (report the shown image)
- new `frontend/src/lib/archiveProgress.ts` and `frontend/src/lib/textScrollProgress.ts`,
  modeled on `frontend/src/lib/pdfPageProgress.ts`
- `frontend/src/components/TextPreview.tsx` and `frontend/src/components/MarkdownFileViewer.tsx`
  / `frontend/src/components/MarkdownPreview.tsx` (read view only); the scroll hosts
  `<main>` in `frontend/src/components/FileDetailShell.tsx` and the scroll area in
  `frontend/src/components/folder/RightPaneFile.tsx` are read, not changed
- `frontend/src/components/FilePreview.tsx` (read, not changed: it renders the three
  components and passes the props they already take)
- `frontend/src/lib/api.ts` (existing `getWatchProgress` / `saveWatchProgress`, unchanged)
  and `frontend/src/lib/recentlyPlayed.ts` (no-profile fallback, unchanged)
- `frontend/src/messages-core/ja.json`, `frontend/src/messages-core/en.json` (one key)
- `frontend/e2e-layout/` (a fixture and spec for the scroll restore, with the fixture
  registration the suite requires)
- `docs/user-guide/viewers-and-players.md`, `docs/user-guide/comments-history.md`,
  `docs/user-guide/file-browsing.md` (what Continue Watching lists and the Resume button)
- Table `watch_history`: read and written, no schema change. No backend file is edited and
  no `addons/*` file is edited.
- Rules passed through: `.claude/rules/design-decisions.md` (watch history: reaching the
  end records and never deletes; a view-only POST never overwrites a position),
  `.claude/rules/frontend-conventions.md`, `DESIGN.md` (the button).
- No protected path is edited.

## Invariants

I1. Showing an archive's first image, or an archive with fewer than two images, writes no
position; showing the image at ordinal 2 or later writes `position` = that ordinal and
`duration` = the archive's image count.

I2. The Resume button appears only when the stored `duration` equals the archive's current
image count and `2 <= position < duration`, and never while the viewer is open; in every
other case no button appears, and opening an archive never opens the viewer by itself.

I3. Pressing Resume opens the image whose ordinal equals the position, in the folder that
holds it, where the ordinal counts images with folders in path order and each folder's
images in the order the viewer flips through them, so the listing's sort order and type
filter never change which image that is.

I4. Showing the image with the last ordinal records position = image count and never
deletes the row; for an archive above ten images it then leaves Continue Watching, and it
keeps its Recently Viewed entry.

I5. A Markdown or text document is recorded only while it is in its read view, its rendered
text is at least twice the scroll host's visible height and the position is 50 or more of
1000; what is written is `position` in thousandths and `duration` = 1000, and a scroll
event that leaves `scrollTop` at the value the restore set is never recorded.

I6. A stored text position is applied at most once per open, only when `duration` = 1000,
`50 <= position < 900` and the current text is at least two screens tall; an explicit
target, or a scroll by the reader before the restore lands, prevents it, and a document
stored at 900 or more opens at the top without the row being deleted.

I7. A stored position changes only when the reader moves in the read view of the file
itself: opening without moving (the page-open record carries no position), walking back to
the first image or under 5 % of a text, the Markdown editor's edit mode, and a text entry
inside an archive all write nothing, so the earlier stored position stays.

I8. Positions belong to the viewer's profile: without a nickname they are read from and
written to local storage through `recentlyPlayed` and no position request is sent to the
server, and with a nickname another nickname's position is never read.

I9. While paging or scrolling, a file gets at most one position write per second (a
trailing 1 s debounce) plus one on leaving.

I10. A failed position write or read changes nothing the reader sees: the stored position
stays, the archive shows no Resume button and the text opens at the top.

## Checked, no action

- **Ordinal versus entry name.** An entry name survives a reorder that keeps N, an ordinal
  does not. `position` is a number column, so a name cannot be stored without a schema
  change. The N check catches additions, removals and replacements, which are the realistic
  ways a book changes; a same-count reorder is accepted as unsupported.
- **Auto-opening the viewer.** Decided against by the user: Resume is a button, so the
  listing stays reachable and the full-screen viewer is never forced.
- **Clearing the stored position when the reader walks back to the start.** Not done, as
  for PDF: writing a "first page" value would put a barely-read file in Continue Watching,
  and deleting the row would erase a distinction `design-decisions.md` keeps. The last
  position past the dead zone stays.
- **Markdown anchors (heading ids) instead of a fraction.** More precise after edits but
  needs a second stored value; a reading position that lands near is enough here.
- **Text restore by pixels.** Width changes reflow text, so pixels would land elsewhere.
- **Code, logs and CSV.** They go through `TextPreview` and follow the same two-screens
  rule. Short ones never record. A long log read to the middle will list in Continue
  Watching; accepted, since the user chose one rule for all text.
- **Image gallery and slideshow of loose images.** There is no document to resume; not in
  scope.
- **Spread mode** (two images at once): the recorded ordinal is the leading image of the
  spread the viewer is on.
- **A Resume button inside the full-screen viewer.** Not needed: the viewer opens on the
  saved image and the reader is already there.
- **New design artifact.** One button in an existing toolbar with an existing style; no new
  screen or component family, so the Design Artifact step does not apply.
- **The 90 % gate and small archives.** The gate is the existing ratio in `drives.py`. For an
  archive of ten images or fewer it hides the row one image before the end while Resume
  still shows. Changing the gate would change PDF, EPUB and video, so it is left.
- **A reader who scrolls before the stored read returns.** Their scroll wins and may replace
  a larger stored position, as a page turn does for PDF; a timeout on the read would only
  move the same race.
- **Backend validation of `position <= duration`.** The existing endpoint does not check it
  for PDF or EPUB either; the writers here only send valid pairs.
- **Locale-dependent order.** The sequence uses the viewer's own `localeCompare`, so a
  browser with a different locale could order an archive differently and Resume would then
  open another image with no sign. The viewer's order is the one the reader sees, changing
  it would change what they flip through, and the case needs two devices with different
  collation on one archive; accepted as a limit.
- **Which layouts show Resume.** Wherever `ArchivePreview` renders, the full page and the
  right pane alike; there is no layout-specific rule.
- **Callers of the watch-history route.** `DriveHome` calls it with no type filter, so
  archives and text appear in Continue Watching; `useFolderFiles` and
  `useRecentAndHistory` call it with `all` for their own lists. They are read, not changed.
- **Another device.** Positions follow the nickname through the server, so a second PC
  sees them; there is no merge rule beyond last write wins, as for video.
- **Text that is only partly loaded.** `TextPreview` and `MarkdownFileViewer` fetch the
  whole file before rendering (a large file waits for the existing size prompt), and
  `TextLines` caps only its decoration (`MAX_DECORATED_LINES`), not the lines in the page;
  there is no paged loading to land against.
