# Show which parts of a video a viewer has watched

SPEC-ID: SPEC-CORE-140
SPEC-ID: SPEC-CORE-141

Approval: sha256:ee0724df65e30e717bcc7975ce649a286583c18c5bb944980c45424673ba9362 Yuichi Senga 2026-11-19

## Summary

The players have recorded, per viewer and per file, how many seconds of each 5-second segment
were played (`played_segments`, SPEC-CORE-026/027), and no screen shows it yet. This change
shows it in two places, for the viewer who played it.

- **SPEC-CORE-140**: a band above the player's seek bar. Each watched segment is drawn in
  white, and a segment played more times is drawn more opaque. The band appears while the
  pointer is over the seek bar, while the viewer drags it, and for 2 seconds after a skip; a
  double-tap skip on touch now brings up the bottom bar so the band can be seen. Ranges this
  page sends while playing are added to the band as they are sent.
- **SPEC-CORE-141**: the progress bar on Continue, Recently viewed and video-shelf cards fills
  the parts that were watched instead of one bar from the start to the resume point, and marks
  the resume point with a tick. A new field carries the data: `watched_ranges` on
  watch-history and shelf items.

Agreed design: https://claude.ai/artifact/DzKJXMQ76qfUGAdWsQ8TAG, saved in
`docs/process/reviews/feature-watched-ranges-display/design/` (`Main.dc.html`: pointer
layout with the band shown; `Touch.dc.html`: touch layout during a double-tap skip;
`Cards.dc.html`: top row `VideoCard`, bottom row `FileCard`). Its visible decisions:

- D1. The band is a 3px strip spanning the same box as the seek line's played fill (the full
  width of the seek line, not the knob's travel). Its bottom edge is 4px above the knob's top,
  which is 8px above the visible 4px line. It has no track of its own: an unwatched segment
  shows nothing behind it.
- D2. Band colours by level: 1 = white 35 %, 2 = white 60 %, 3 = white 90 %. The seek line,
  buffered fill, played fill and knob are unchanged.
- D3. On touch, a skip shows the bottom bar (time, full-screen button, seek bar with band)
  together with the existing half-disc skip feedback, and not the centre play button or the
  top-right buttons.
- D4. A card's bar keeps its height, empty track and fill colour (`VideoCard`: 4px, black 50 %
  track, white fill; `FileCard`: 3px, white 20 % track, accent fill); the watched ranges are
  filled and nothing else is.
- D5. The resume tick is 3px wide and 10px tall, rising from the thumbnail's bottom edge,
  rounded at the top, centred on the resume point, white with a 1px black 50 % outline, on
  both card kinds and in both themes.

## Required items

### 1. Normal flow

**Seek bar band (SPEC-CORE-140)**

1. A viewer with a profile opens a video in a player that calls `usePlaybackProgress` and draws
   `MediaControls` with the same media controller: `VideoPlayer`, `ShellVideoPlayer`, and
   media_import's `YouTubeEmbed`. A module store keyed by media controller connects them:
   `usePlaybackProgress` registers the controller's file id and the viewer's nickname there,
   and `MediaControls` subscribes for its controller. No player and no addon source passes a
   new prop.
2. The store reads `GET /api/files/{id}/played-segments` as soon as a controller has both a
   registration with a file id and a nickname and at least one `MediaControls` subscriber,
   whichever of the two comes first, once per (controller, file, nickname). A controller with no
   subscriber (`AudioPlayer`) is never read for. With no nickname nothing is read and no band is
   drawn. A nickname that appears after mount triggers the read; a nickname that changes clears
   the totals and reads again; a nickname that is cleared clears the totals. The totals belong
   to the registration: they are kept when `MediaControls` unsubscribes and subscribes again
   (no second read), sends that answer while nothing is subscribed are still added, and the
   entry is dropped when `usePlaybackProgress` unregisters (unmount, or a change of file or
   controller).
3. Each returned segment `n` covers `[s·n, min(s·n + s, D))`, where `s` is the response's
   `segment_seconds` (5 today; 5 is used before an answer arrives or when the read failed) and
   `D` is the duration the seek bar uses. Its **level** is `played_seconds / length` rounded
   half up to an integer, then clamped to 1..3, where `length = min(s, D − s·n)`. The frontend
   split in step 6 uses the same `s`; the backend keeps `PLAYED_SEGMENT_SECONDS` as its one
   source. A segment that starts at or after `D` is
   not drawn. Consecutive segments of the same level are drawn as one piece; a piece never
   spans a gap or a level change.
4. The band is **shown** while any of these holds, and otherwise is not rendered:
   - a mouse or pen pointer is over the seek bar's 40px row (hover);
   - a scrub is in progress (a pointer drag or a key scrub on the seek bar);
   - less than 2 seconds have passed since the last **skip**. The skips are exactly: every
     tap that seeks (the double tap and each further tap of the same burst), a press of the
     −10 / +10 buttons in the pointer layout, and the arrow-key shortcuts in
     `useVideoShortcuts` (`←`/`→` 10 s, `↑`/`↓` 60 s), which `VideoPlayer` and
     `ShellVideoPlayer` use. Each skip restarts the 2 seconds. media_import's `YouTubeEmbed`
     handles its arrow keys itself, so there they are not skips: they neither show the band
     nor reveal anything.
   - the touch chrome is in bottom-only (step 5), including the 2 seconds after a scrub that
     started there ends.

   Nothing else shows the band: a mouse move elsewhere on the frame, a single tap, any other
   control press, focus landing on the seek bar, a touch on the seek row that does not start a
   scrub, pausing, and a reveal of the chrome for any other reason.
5. A skip also makes the seek bar visible:
   - pointer and compact layouts: the whole bar is revealed, as any other control press does
     today. Arrow keys do the same.
   - touch layout: a tap that seeks or an arrow key puts the chrome in **bottom-only** (D3).
     A double tap always ends there, whether the chrome was hidden or whole when it began (the
     first tap toggles the chrome as today; the second tap skips). In bottom-only only the seek
     bar and the full-screen button take touches; the centre and top-right buttons are not
     drawn and take none; the hairline is not drawn. A scrub started in bottom-only stays
     bottom-only and restarts the 2 seconds when it ends. Pressing the full-screen button keeps
     bottom-only and restarts the 2 seconds. 2 seconds after the last skip, scrub end or
     full-screen press, bottom-only ends: while playing the chrome is hidden, and while paused
     the whole chrome shows, as the paused rule holds today. These turn bottom-only into the
     whole chrome, which then follows its existing idle rules: a single tap, playback pausing
     or resuming (a headset button, the end of the file), focus entering the chrome, and the
     settings sheet opening. A double tap during an ad break leaves the chrome as it was.
   - Arrow keys report the skip to the same store, keyed by the controller `useVideoShortcuts`
     already holds.
6. When the page's own capture sends `POST /api/files/{id}/played-ranges` and that request
   answers 2xx, the ranges it carried are split across segments exactly as the backend splits
   them and added to the store's totals for that controller and file. A send belongs to the
   file and nickname current when the request starts; a 2xx for a request started under
   another file or nickname than the store now holds is dropped. No new `GET` is made. A
   batch that is retried after a failure is added once, when the request that carried it
   answers 2xx. A send that fails, is discarded, or is for a file other than the one the store
   now holds adds nothing. The capture's retry, discard and teardown behaviour (SPEC-CORE-027)
   is unchanged.
7. Band data reaches only `MediaControls`. The host player does not re-render because of it,
   so SPEC-CORE-027 I7 ("capture causes no React re-render" of the host) still holds.

**Card ranges (SPEC-CORE-141)**

1. `GET /api/drives/{drive}/watch-history` and `GET /api/drives/{drive}/shelves`,
   `POST /api/drives/{drive}/shelves/query` build items as today. Every item that carries
   `watch_progress` also carries `watched_ranges`; an item without `watch_progress` carries
   neither key (not `null`, not `[]`).
2. `watched_ranges` is read in one query per response, for the requesting viewer and the files
   in that response. For each file, the segments with `played_seconds > 0` are merged into runs
   of consecutive indexes; a run `[a..b]` becomes `{ start: 5a, end: 5(b + 1) }` (5 is `PLAYED_SEGMENT_SECONDS`), with `end`
   clipped to `watch_progress.duration` when that duration is above 0, and a run whose clipped
   `end` is not above its `start` is dropped. The list is ascending by `start`; runs never
   overlap or touch. A file with no segments has `[]`. Runs are built in Python from the rows.
3. `FileCard` (drawn by `ContinueWatchingSection` for both Continue and Recently viewed on the
   drive home) and `VideoCard` (video app shelves) draw the bar:
   - `watch_progress.duration > 0` and `watched_ranges` non-empty: fill each range from
     `start / duration` to `end / duration` (clamped to 0..1) and nothing else; draw the tick
     at `position / duration` when `5 < position < duration − 5`, which is exactly when opening
     the file resumes there (`RESUME_THRESHOLD` in `playbackProgress.ts`).
   - `watch_progress.duration > 0` and `watched_ranges` empty or absent: today's bar, filled
     from 0 to `position / duration`, and no tick.
   - otherwise: no bar, as today.

Worked example. Duration 100 s, segments `{0: 5, 1: 5, 2: 2, 5: 12.5, 19: 4}`:
`watched_ranges = [{0, 15}, {25, 30}, {95, 100}]`. Band levels: segments 0, 1 → 1 (one piece
with segment 2); segment 2 → round(0.4) = 0 → clamped to 1; segment 5 → round(2.5) = 3;
segment 19 (length 5) → round(0.8) = 1.

### 2. Failure cases

| Step | What goes wrong | What the system does |
|---|---|---|
| Band read | `GET /played-segments` fails, times out or answers non-2xx | No stored band. Ranges sent later on this page are still added (step 6), so the band can show only this session's ranges. Not retried. Progress saves, resume and range sends are unaffected. |
| Band read | The answer arrives after the file, controller or nickname changed | Discarded. It is never drawn for another file or another viewer. |
| Band read | A send answers 2xx while the `GET` is in flight | Its ranges are added after the `GET` answer is applied; neither replaces the other. If the server committed the send before answering the `GET`, it appears twice until reload; accepted (Checked, no action). |
| Band | Duration unknown or not positive, or the seek bar disabled (ad break, not seekable) | No band. |
| Skip on touch | Double tap during an ad break | Unchanged: no skip, so no bottom-only and no band. |
| Lists | The `watched_ranges` query fails | The request fails with `500`, as any other query failure in the handler; nothing is written. |

### 3. States

Band visibility, per mounted seek bar:

| State | Event | Next |
|---|---|---|
| Hidden | Pointer enters the seek row, a scrub starts, a skip, or bottom-only begins | Shown |
| Shown | Pointer outside the row, no scrub, 2 s since the last skip, and not bottom-only | Hidden |
| Shown | Another skip | Shown; the 2 s restart |
| Any | Duration not positive, or seek bar disabled | Hidden |
| Hidden | Any event not listed in Normal flow step 4 | Hidden |

Band data, per controller: `empty` → (`GET` 2xx for the current file and nickname) `loaded` →
(send 2xx for the current file) `loaded` with ranges added. A `GET` failure leaves `empty`,
which sends still add to. A change of file or nickname, or clearing the nickname, returns to
`empty` before anything else is drawn; a `GET` answer or send result for the previous file or
nickname never moves the new state.

Touch chrome (adds one state to the existing hidden / whole):

| State | Event | Next |
|---|---|---|
| hidden or whole | A tap that seeks, or an arrow key (`useVideoShortcuts`) | bottom-only |
| bottom-only | Another skip, a scrub ends, or the full-screen button | bottom-only; the 2 s restart |
| bottom-only | 2 s after the last of those, playing | hidden |
| bottom-only | 2 s after the last of those, paused | whole |
| bottom-only | Single tap, pause or resume (including the end of the file), focus entering the chrome, settings opening | whole |
| any | Double tap during an ad break | unchanged |

### 4. Data read and written

- `played_segments`: read (per controller for the band, one query per list response). Never
  written by this change.
- `watch_history`: read as today. Not written by this change.
- No new table, column or migration. No browser storage.

### 5. External services

None. Only Litloft's own backend.

### 6. Authorization

Unchanged checks. `GET /played-segments` already 404s an unavailable file and answers only the
requesting viewer's rows. `watched_ranges` is read only for files the list already returns,
filtered by the requesting `viewer_id`; another viewer's rows are never read. No viewer
identity → watch-history is already `{ data: [] }`, and shelf items carry no `watch_progress`,
so no `watched_ranges`.

### 7. Effect on existing features

- Touch double-tap skip no longer hides the controls; it shows the bottom bar (D3). The skip
  itself, its accumulation and its feedback are unchanged.
- The arrow-key shortcuts now reveal the controls. Their seek amounts are unchanged.
- Continue and Recently viewed (`FileCard`) and video-shelf (`VideoCard`) cards with watched
  data no longer show a continuous bar to the resume point. Cards with no `played_segments`
  rows (history from before 2026-10-31, PDFs and other non-media) look as today. `FileCard`
  in grids without `watchProgress` is unchanged. `ReadingCard` is not changed.
- The watch-history and shelf responses gain one field on items that carry `watch_progress`.
  The iOS app and addons ignore it. The MCP `get_watch_history` tool passes the JSON through, so
  its output to an MCP client grows by the ranges (typically a handful per file); accepted, and
  the tool is not changed.
- `docs/user-guide/keyboard-shortcuts.md` (the touch gesture rows for tap and double-tap) and
  `docs/user-guide/viewers-and-players.md` (the gestures line) describe the double tap; both
  gain that it shows the seek bar.
- `usePlaybackProgress` gains a registration in the store; its saves, resume and capture are
  unchanged. Tests that mock `fetch` see the new `GET` only where `MediaControls` is mounted.
- Pickup (intelligence) reads `played_segments` through its own path; unaffected.
- `ProgressHairline` (the line left when the chrome withdraws) is unchanged and has no band.

### 8. Error behavior

No new message. A failed `GET /played-segments` shows no stored band and logs nothing in the
browser; a failed list request behaves as today.

### 9. User-visible behavior

- The band (D1, D2) above the seek bar, at the times in Normal flow step 4.
- On touch, skipping shows the bottom bar with the band (D3).
- Arrow keys show the controls (whole bar on pointer and compact layouts, bottom-only on touch).
- Continue, Recently viewed and video-shelf cards show watched ranges and a resume tick (D4,
  D5).
- No text is added. `docs/user-guide/video.md` gains one sentence saying what the band and the
  card fills mean, and that only playing of 10 seconds or more is recorded.

### 10. Non-functional

- One `GET /played-segments` per opened video per (controller, file, nickname); no polling.
- Lists: one extra query per response, reading `(file_id, segment_index)` of rows with
  `played_seconds > 0`, at most `ceil(duration / 5)` per listed file. Watch-history lists at
  most 50 files; shelves carry `watch_progress` only under `by=watch`, and an unkeyed request
  returns its three watch shelves of up to 60 items, so at most 180 files. A 2-hour video is
  at most 1,440 rows, so the worst response reads about 260,000 small rows through the
  `(viewer_id, file_id, segment_index)` key; it needs every listed file to be a fully watched
  2-hour video, and is accepted for a personal tool. `watched_ranges` has at most `ceil(duration / 10)` entries
  per file, because each recorded stretch is at least 10 seconds; no cap is applied.
- Per viewer only. Nothing is aggregated across viewers.
- Drawing the band does not re-render on every clock tick: its pieces depend only on the
  segment totals and the duration.

## Touch points

- `backend/app/schemas.py`: `WatchHistoryItemResponse`, `ShelfItemResponse` gain
  `watched_ranges` (omitted together with `watch_progress` on shelf items); a `WatchedRange`
  model.
- `backend/app/routers/drives.py` (`get_watch_history`), `backend/app/routers/shelves.py`
  (`_item` and the item builders): read `played_segments`, build `watched_ranges`.
- A helper turning segment rows into runs, shared by both routers (new, under
  `backend/app/services/`).
- A store keyed by media controller (new, under `frontend/src/lib/`): band totals, the file id
  and nickname, and skip signals.
- `frontend/src/lib/playbackProgress.ts`, `frontend/src/lib/playedRanges.ts`: register in the
  store; report the ranges a 2xx send carried.
- `frontend/src/components/player/MediaControls/parts/SeekBar.tsx`: the band.
- `frontend/src/components/player/MediaControls/MediaControlsContainer.tsx`, `types.ts`,
  `hooks/useMediaControlsState.ts`, `hooks/usePlayerGestures.ts`,
  `TouchControlsPresenter.tsx`, `PointerControlsPresenter.tsx`,
  `CompactControlsPresenter.tsx`: subscription, hover / scrub / skip visibility, bottom-only.
- `frontend/src/components/player/hooks/useVideoShortcuts.ts`: report arrow-key skips.
- `frontend/src/lib/api.ts`, `frontend/src/types/index.ts`: `getPlayedSegments`,
  `watched_ranges` on `WatchHistoryItem` and `ShelfItem`.
- `frontend/src/components/FileCard.tsx`, `frontend/src/components/videoapp/VideoCard.tsx`,
  `frontend/src/components/ContinueWatchingSection.tsx`: the bar and the tick.
- `frontend/e2e-layout/fixtures/video-app.html` and `frontend/e2e-layout/video-app.spec.ts`:
  the static copy of `VideoCard`'s progress track and fill.
- Real-browser measurement of D1 and D5 in `frontend/e2e-components/`, rendering the real
  components: `player-seek-indicator.spec.ts` (or a sibling) measures the band against the line,
  the played fill and the knob in both `SeekBar` variants (`centered`, `edge`); a card spec
  measures the bar fills and the tick on `FileCard` and `VideoCard` in both themes.
- Tests that mock `fetch` around a mounted `MediaControls`, in core and in
  `addons/media_import/frontend/players/__tests__/` if they fail on the new `GET`. The addon's
  source is not edited; a test edit there goes through the addon repository first.
- `DESIGN.md` §Over-video chrome and §Cards: the band, bottom-only, and the tick.
- `docs/reference/api.md` (watch-history, shelves), `docs/user-guide/video.md`,
  `docs/user-guide/keyboard-shortcuts.md`, `docs/user-guide/viewers-and-players.md`.
- Rules passed through: `.claude/rules/design-decisions.md` (watch history and profiles, the
  drive boundary), `.claude/rules/frontend-conventions.md`, `DESIGN.md`.
- No protected path is edited.

## Invariants

I1. The band is rendered only while a mouse or pen pointer is over the seek row, while a scrub is in progress, within 2 seconds after the last skip (a tap that seeks, a −10 / +10 button press, or a `useVideoShortcuts` arrow key), or while the touch chrome is bottom-only, and never while the duration is not positive or the seek bar is disabled; no other reveal, tap, press, focus or pause renders it, and `YouTubeEmbed`'s own arrow keys do not.
I2. Band pieces cover maximal runs of consecutive segments of one level, with segment `n` spanning `[s·n, min(s·n + s, D))` for the response's `segment_seconds` `s`, level `clamp(round-half-up(played_seconds / min(s, D − s·n)), 1, 3)`, and level opacities 0.35 / 0.6 / 0.9; a segment with no row, or starting at or after `D`, is not drawn.
I3. After a `POST /played-ranges` started for the store's current file and nickname answers 2xx, the band includes the ranges that request carried, split as the backend splits them, exactly once and without another `GET /played-segments`; a send that fails, is discarded, or was started for another file or nickname changes the band by nothing.
I4. Without a nickname, or for a controller no `MediaControls` subscribes to, no `GET /played-segments` is sent and no band is drawn; a registered, subscribed controller sends exactly one `GET` per (file, nickname) whatever order registration and subscription happen in and however often `MediaControls` resubscribes; after a change of file or nickname nothing from the previous file or nickname is drawn, including a late `GET` answer.
I5. In the touch layout a tap that seeks or a `useVideoShortcuts` arrow key shows the bottom bar with the seek bar, and not the centre play button, the top-right buttons or the hairline; in that state only the seek bar and the full-screen button take touches; 2 seconds after the last skip, scrub end or full-screen press the chrome is hidden while playing and whole while paused, unless the whole chrome was revealed meanwhile; a double tap during an ad break leaves the chrome as it was.
I6. In the pointer and compact layouts, the −10 / +10 buttons and the `useVideoShortcuts` arrow keys reveal the whole bar, and the arrow keys still seek by 10 and 60 seconds.
I7. Every watch-history or shelf item that carries `watch_progress` carries `watched_ranges` built from the requesting viewer's rows only: ascending, non-overlapping, non-touching runs of segments with `played_seconds > 0`, `end` clipped to `watch_progress.duration` when it is above 0, and `[]` when there are none; an item without `watch_progress` has neither key.
I8. With `watch_progress.duration > 0` and non-empty `watched_ranges`, `FileCard` and `VideoCard` fill exactly the ranges and draw the tick at `position / duration` only when `5 < position < duration − 5`; with empty or absent `watched_ranges` they draw today's bar from 0 to `position / duration` and no tick.
I9. These read paths write nothing, and the files, order and counts that watch-history and shelf requests return are the same as before this change.
I10. A failing or slow band read, and band updates, leave progress saves, the resume seek and played-range sends as they are without this change, and do not re-render the host player.

## Checked, no action

- **Audio player.** `AudioTransport` has its own native range input and no `MediaControls`;
  audio is recorded but gets no band and sends no `GET` in this change. A later spec can add
  it.
- **Arrow keys in media_import's YouTube embed.** The embed draws core `MediaControls` and calls
  `usePlaybackProgress`, so it gets the band, hover, scrub, button and double-tap behaviour with
  no addon source edit. Its arrow keys go through its own `useShortcuts`, so they do not report
  a skip; making them do so is an addon change left for later.
- **Hairline band.** The line left when the chrome withdraws stays a plain progress line; a
  band there would show all the time, which the agreed timing rules out.
- **A double count until reload.** A range sent while the first `GET` is in flight can be in the
  `GET` answer and also added locally. The window is one request long at page open, and a reload
  shows the stored truth. Not worth a sequence token.
- **Cards elsewhere.** Folder grids, search and collections draw `FileCard` without
  `watch_progress`; they keep no bar. `ReadingCard` shows reading progress, not media.
- **Building runs in SQL.** A gaps-and-islands query would read fewer rows, but the row counts in
  Non-functional are small for a personal tool; Python keeps the rule in one readable helper.
- **Partial segments on cards.** A segment with any played seconds counts as watched whole, so a
  card can overstate by up to 5 seconds at each end of a run; invisible at card width.
- **Tick colour.** The tick is white with an outline rather than the theme accent, because on
  `FileCard` the accent is already the fill colour and on `VideoCard` the fill is white; the
  outline and its height keep it apart from the fill.
- **Revising SPEC-CORE-026/027.** Their recording and endpoints are unchanged and their
  invariants hold (I7 of 027 is restated here as I10); no `## Revises` line is needed. No
  earlier spec states that a double-tap skip hides the controls.
- **i18n.** No new string.
