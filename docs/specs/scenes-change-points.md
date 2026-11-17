# The Scenes list can show the frame scan's change points

SPEC-ID: SPEC-ADDON-124

Approval: sha256:753270a39ea2650b77adf4c53c6e4c915a5119b1b9b4884b35f275ad5017fdff Yuichi Senga 2026-11-17

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes the hash and the approver's name here and moves the ledger row in
docs/specs/INDEX.md to approved.
-->

## Summary

The scene change scan already stores, for every video it scans, the seconds whose
picture changed by at least 16 of 256 hash bits and at least 10 s after the previous
change, as `clip_change` embeddings. The Scenes section never shows them: its grid draws
the CLIP candidate frames (ffmpeg scene detection plus the 30 s interval fill), so a cut
is mixed in with filler frames and cannot be picked out.

This adds a two-option switch above the grid, 「標準」 / 「カット」, which swaps the
grid between the candidate frames and the stored change frames. The two lists are picked by
different rules (ffmpeg scene score above 0.3 plus a 30 s fill, against a 16-bit hash
change at least 10 s apart), so neither contains the other, and either can be the
longer. It needs no model and no
Visual Index run, so it works as soon as the video has been scanned — before any scene
is labelled.

## Required items

### 1. Normal flow

1. A viewer opens a video's page and expands the Scenes section.
2. The section requests `GET /files/{id}/clip-timestamps` as today: once at mount for a
   native video's availability, and again on every expand and every host show. The
   answer now carries both lists: `timestamps` (candidate frames) and `changes` (change
   frames).
3. When `changes` holds at least one item, the section draws a row of two chips between
   the ruler and the grid, 「標準 {n}」 and 「カット {m}」, with 「標準」 selected.
4. The grid, the ruler's tick marks and the picture window show the selected list. The
   scene marks, the scene card, the track length, the playhead and seeking are
   unchanged.
5. Pressing the other chip swaps the list in place. The browse point and the playback
   position are kept, so the window re-anchors to the row of the new list at or before
   that point. No `clip-timestamps` or `visual-index` request is sent; the tiles of the
   new window ask for their pictures as any tile does.
6. The section opens on 「標準」 for every file. Within one mounted section the choice
   survives collapsing and expanding, and a host that hides and shows the panel, as long
   as the re-fetched answer still has change frames.

### 2. Failure cases

- `changes` is empty or absent: no switch is drawn, the grid shows the candidate frames,
  and a retained 「カット」 selection falls back to 「標準」.
- The `clip-timestamps` request fails, or `timestamps` is empty: unchanged from today —
  the section reports nothing, is not drawn, and its host button is unavailable. The
  switch never makes the section available on its own, so a file with change frames and
  no candidate frames stays hidden.
- A `.loft` reference that the fetch downloaded can have change frames; the switch is
  drawn for it like any other file, and its pictures come from the scene-tile route as
  today. A change frame with no kept picture draws the empty block.
- A change tile's picture request fails (404, 400, network): the tile keeps its time and
  shows the empty block.
- A mode change while a picture request is in flight is safe: the response for a tile
  that is no longer drawn is ignored by the existing window bookkeeping.

### 3. States

| State | What is drawn |
|---|---|
| No change frames | No switch; grid, ruler ticks and window = candidate frames |
| Switch, 「標準」 selected | Grid, ruler ticks and window = candidate frames; 「カット」 unselected |
| Switch, 「カット」 selected | Grid, ruler ticks and window = change frames; 「標準」 unselected |
| Section collapsed, then expanded | The mode is kept when the new answer still has changes; otherwise 「標準」 |
| Host hides and shows the panel | Same as expand: kept while the new answer still has changes, otherwise 「標準」 |
| File changed | The mode returns to 「標準」 |
| Request in flight (the first, or a re-fetch on expand or host show) | No switch; the loading skeleton as today. The kept mode applies again when the answer arrives with changes |
| Response without changes while 「カット」 is selected | No switch; grid = candidate frames; the selection is reset to 「標準」 |
| Available through the Visual Index with `m > 0` and no candidate frames | The switch is drawn; 「標準」 shows no tiles and 「カット」 shows the cuts |

Allowed transitions: a chip press, collapse/expand, host hide/show, a file change, and
a response arriving. Not allowed: a mode without a response, and a switch on a section
that is not drawn at all (no candidates and no Visual Index).

### 4. Data read and written

- Read: `embeddings` rows with `embedding_type = 'clip_change'` and
  `vector_table = 'vec_clip_change'` for the file, ascending by `timestamp_start`,
  through the existing `clip-timestamps` route. No new route and no new request.
- Read: `indexed_files`, as the route already does for the drive check.
- Read/write: the frame cache. Selecting 「カット」 draws tiles whose times were never
  requested as candidate tiles, so the new window's tiles ask
  `GET /files/{file_id}/frame?t=<start>` (a `.loft`: `/scene-tile`), and a native video's
  miss extracts with ffmpeg and writes `intelligence_data_dir/frames/{file_id}/{ms}.webp`.
  The requests go through the section's existing window hook, so they start after its
  settle delay, exactly as a newly drawn window does today; a rapid toggling simply
  restarts that delay.
- Write: those frame-cache files only. No search-database row, no model call.

### 5. External services

None. The list itself is a column read; the pictures come from local ffmpeg or the
already stored storyboard tiles.

### 6. Authorization

Unchanged, and the checks are the ones the route has today: the addon manifest's
`file_access` pre-check in the host proxy, `require_drive` in the handler (400 without
`X-Lit-Drive`), and `_get_indexed_file_or_404` (404 for an unknown id or a drive
mismatch). The added field needs no check of its own.

### 7. Effect on existing features

- `ClipTimestampsResponse` gains one additive field. Its only consumer is the Scenes
  section; the existing e2e fixtures do not set it and render no switch, and a new
  arrangement does.
- The section grows by one control row only on files that have change frames.
  `useSceneRows` measures the grid, so `R` absorbs the row; the measurement of
  `scene-rows-fill-height` still holds for the parts it measures.
- The Visual Index marks, card, stale note and actions are untouched, and the default
  mode keeps the grid identical to today's.
- The public `/search/scene-segments` and `search_video_scenes` paths never see
  `clip_change`, and this change does not expose them to search.

### 8. Error behavior

- Nothing new is logged. A missing `changes` list is not an error.
- A picture that fails under either mode keeps its time and shows the empty block, as
  today.
- The section's existing failure and retry behaviour is unchanged.

### 9. User-visible behavior

- The switch is a left-aligned row of two chips, placed directly below the ruler and
  above the grid, inside a `role="group"`. Each chip is a `button` with `aria-pressed`,
  drawn as DESIGN.md's kind chips (§Find in file): `rounded-full border px-2.5 py-1
  text-xs`, the selected one `border-accent font-semibold text-text-primary`, the other
  `border-transparent text-text-muted`. Each chip is as wide as its label, 4 px apart,
  with no outline around the pair, and keeps this size on a coarse pointer as the Find
  tab's chips do.
- Chip labels: 「標準 {n}」 / 「カット {m}」 (ja), "Default {n}" / "Cuts {m}" (en). The
  number follows the noun as a count, as on the Find tab's chips, so no plural form is
  needed.
- `n` and `m` are the lengths of `timestamps` and `changes` in the response.
- The switch is drawn only when `m > 0`.
- Tiles are the selected list, ascending by `start`, in the same grid geometry as today;
  each tile's time and picture use that `start`. The dot keeps marking the tile that
  holds a scene's `section_start` in the shown list.
- The ruler's small ticks follow the selected list. The track's length `L` is taken
  from the candidate list (or the player's duration) in both modes, so the playhead, the
  browse line and click-to-time do not move when the mode changes. When there are no
  candidate frames, `L` is taken from the change list by the same rule, again in both
  modes. A change frame later than `L` clamps to the track's right edge like any other
  marker, and its tile still shows its true time.
- `←` and `→` step one row of the shown list (`Home`/`End` its ends), and `Enter` seeks
  the browse point, as the ruler's contract already says. `End` on a change list whose
  last start is past `L` puts the browse point at that start; `aria-valuenow` stays
  `min(point, L)`.
- When the section draws its own header, the bare number beside the title is the drawn
  list's length; the Visual Index count beside it stays the scene count. When the host
  draws the label, the section draws no bare number.
- The group's accessible name is 「表示するフレーム」 (ja) / "Frames shown" (en), a new
  `file`-namespace key.
- Both new labels and the group name exist in `messages/ja.json` and
  `messages/en.json`.

### 10. Non-functional

- The change list is at most the stored change frames, which the scan already caps at
  `indexing.frame_extraction.max_frames` (500) and spreads over the video.
- Switching to 「カット」 requests the pictures of the window's tiles, up to `R × c` per
  window, each once per file and again after the frame cache is purged; the browser's
  connection limit bounds concurrency. No prefetch beyond the window.
- The list size is bounded by the same cap as the candidate list, so the window, ruler
  and DOM cost keep the same order.
- No model, no cost, no privacy change.
- Layout is measured in a real browser: `frontend/e2e-components` renders the section
  with a `changes` fixture at the inspector width and the phone width.

## Touch points

- `addons/intelligence/app/schemas.py` — `ClipTimestampsResponse` gains
  `changes: list[ClipTimestampItem] = []`; an item is the existing
  `{start, content_preview}` (the worker stores `"Frame at {second}s"`).
- `addons/intelligence/app/routers/files.py` — the `clip-timestamps` handler reads the
  change rows with both the type and the vector-table filter.
- `addons/intelligence/frontend/api.ts` — `changes?: ClipTimestampItem[]`, optional so
  the five existing mocks and the core fixtures still type-check; a missing list is
  read as empty.
- `addons/intelligence/frontend/ScenesSection/ScenesSectionContainer.tsx` — keeps both
  lists and the mode, and hands the selected list to the presenter.
- `addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx` — the switch
  row, and the track length taken from the candidate list.
- `addons/intelligence/frontend/ScenesSection/scenesModel.ts` — the helper that picks
  the list for a mode.
- `addons/intelligence/frontend/messages/ja.json`, `messages/en.json` — three
  `file`-namespace keys: the two chip labels and the group's accessible name.
- `addons/intelligence/frontend/ScenesSection/__tests__/` — the switch and its states.
- `addons/intelligence/tests/` — the route returns both lists, the change list holds
  exactly the `clip_change` rows, and `timestamps` is unchanged.
- `frontend/e2e-components/fixtures/scenesSection.tsx` — `ScenesSectionArrangement`
  gains an optional `changes` dataset; the existing arrangements keep none, so every
  current case still renders no switch.
- `frontend/e2e-components/fixtures/scenesSectionData.ts` — the change-frame timestamps
  for that dataset.
- `frontend/e2e-components/fixtures/app.tsx` — two arrangements,
  `scenes-changes-384` and `scenes-changes-390`, registered beside the existing `scenes-*`
  ones.
- `frontend/e2e-components/scenes-section.cases.ts` — the new case. Its `card()`
  helper reads the first `button.rounded-xl`; the chips are `rounded-full`, so it still
  finds the scene card.
- `frontend/e2e-components/scenes-section-desktop.spec.ts` (mouse, 384 px) and
  `scenes-section.spec.ts` (touch, 390 px) — they call the case functions, so both must
  run the new one.
- `docs/addons/intelligence.md` — the scene change scan paragraph, the Scenes section's
  description, and a `GET /files/{file_id}/clip-timestamps` entry with both fields and
  the `clip_change` + `vec_clip_change` filter (the page does not document this route
  yet).
- `docs/user-guide/video.md` — the sentence about the Scenes panel's ruler gains the
  switch.
- `docs/specs/INDEX.md` — this id's ledger row.
- `addons/intelligence` (the gitlink in the main repository) — merge the addon change,
  then bump the pointer.
- `docs/process/reviews/feature-scenes-change-points/design/` — the design artifact.
- No `docs/reference/api.md` change: that page lists core endpoints, and the addon route
  is documented in `docs/addons/intelligence.md`, where this change adds the entry it
  was missing.

**Design.** The artifact is
`docs/process/reviews/feature-scenes-change-points/design/`: `canvas.json` and four
self-contained boards — `Section400All.dc.html`, `Section400Changes.dc.html`,
`Section400NoChanges.dc.html` and `Phone390Changes.dc.html` — with rendered
`preview-*.png` beside them. There is no external canvas URL. The boards that say 400
draw a 384 px section box (the inspector's `24rem`); the phone board draws a 390 px
sheet. Its checkable decisions:

- D1. At 384 px, top to bottom: title row, ruler track with its time labels, switch row,
  grid, scene card.
- D2. The switch row is left-aligned and only as wide as its two chips; the grid's first
  row follows it directly.
- D3. Two pill chips, 「標準 276」 then 「カット 113」, each as wide as its label, with no
  outline around the pair; the selected chip carries an accent border and no fill, the
  other no border and muted text.
- D4. The grid is three columns of 16:9 tiles: 112 px in the padded board, and whatever
  the section's own width gives in the e2e arrangement (`ScenesSectionArrangement` draws
  the section at 384/390 with no padding, so its tiles are wider). The column count, not
  the pixel width, is what the case checks.
- D5. With 「カット」 selected the ruler's ticks follow the cut list (fewer or more than the
  candidates, depending on the video) and the grid shows cut frames;
  the card, the ruler's scene marks and the playhead stay where they were.
- D6. The 390 px board shows the same order with both chips on one line at the same chip
  height as at 384 px; it draws the section's own title row, which the phone sheet's
  host supplies in the app.
- D7. With no change frames, no switch row is drawn.

## Invariants

I1. The switch is drawn only when the response carries at least one change timestamp;
otherwise the section draws no switch and the grid is the candidate list.

I2. With 「カット」 selected, every drawn tile's time is a change `start` and the drawn
tiles are a consecutive window of that list in time order; the 「標準」 window is
SPEC-ADDON-089 I1's, unchanged.

I3. A chip press sends no `clip-timestamps` and no `visual-index` request and writes
no search-database row; the only requests it causes are the picture requests of the
newly drawn tiles.

I4. The scene marks, the scene card, the stale note, the action row, the Visual Index
count, the playhead, the browse line and click-to-seek behave the same in both modes;
the track length is the same in both; and the ruler keys keep their mapping (one row per
press, the list's ends at `Home`/`End`, `Enter` seeks the browse point) over the shown
list.

I5. The two chip counts equal the two lists' lengths in the response, and the header's
bare number (when the section draws it) equals the drawn list's length.

I6. `clip-timestamps` returns `changes` as exactly the file's `clip_change` rows with
`vector_table = 'vec_clip_change'`, ascending by `timestamp_start`, and `timestamps`
exactly as it did before this change.

I7. A new file starts on 「標準」; a response without changes resets the selection to
「標準」 (not a temporary display); collapse/expand and host hide/show keep the mode
while the re-fetched answer still has changes.

I8. Every new message key exists in both locale files, and no key renders as its path.

I9. With the switch drawn, both chips sit on one line inside the section's content width,
the grid keeps the column count it has without the switch, no element overflows the section, and a press
changes neither the section's height nor the ruler's `aria-valuemax`.

## Revises

SPEC-ADDON-089 I1. The ruler draws exactly one tick per row of the list the section is
showing (the candidate rows, or the change rows when 「カット」 is selected), at
`min(start, L) / L` of its width, where `L` is the player's duration when that is a
finite positive number at least as large as the candidate list's last start, and
otherwise that last start plus the median gap between candidate frames (one candidate:
its start plus 1 s); with no candidate frames the change list stands in for the
candidate list in this rule, in both modes; a tick beyond `L` is drawn at the right edge. The grid shows the
window from `s = clamp(c × floor(i / c) − c, 0, max(0, n − R·c))`, or every row when
there are fewer than `R·c`, with `n` the shown list's length, `i` the last shown row at
or before the point (row 0 before the first), `R` rows and `c` columns.

SPEC-ADDON-090 I9. When the policy is off, when the first `visual-index` request fails,
answers 404, or answers `eligible: false` or `available: false`, and for every `.loft`
that has no change frames, the section draws no Visual Index part: no dot count, no
progress, no marks, no tile dots, no scene card and no actions. The timeline is
otherwise unchanged. Otherwise every active-run scene is marked at its seek time
(`section_start`, or `start_time` when that is null), styled by its status as §9 says. A
tile carries the dot exactly when a `succeeded` scene with `section_start` has its seek
time in the tile's range, from its frame's `start` up to the next shown frame's `start`,
the first tile also taking a seek time before it, or a `succeeded` scene without
`section_start` has its `start_time` within 0.05 s of its frame's `start`; the range is
taken in the list the section is showing. The scene card shows the last succeeded,
labelled scene whose seek time is at or before the point being looked at (or the first
such scene before all of them), with its seek time as its time label, its `visible_text`
and never its `transcript_excerpt`. Activating the card seeks to that scene's seek time.

SPEC-ADDON-111 I1. Scene search, tag kNN, scene segments, similar files, concept tagging
and the Scenes grid **in its default 「標準」 mode** return the same results for a file
before and after its frame scan; the change frames are additionally listed by the
Scenes section's 「カット」 selection and remain in the Visual Index's pool, and no
change-frame vector is ever in `vec_clip`.

SPEC-ADDON-104 I3. From top to bottom the section draws its header (when drawn), the
ruler with its labels, the frame-list switch (when drawn), the grid, then the Visual
Index placeholder or the scene card, the stale note and the action row, in that order,
with the gaps they have today. Nothing is placed between the grid and the card.

## Checked, no action

- Showing all cut seconds from the scan hashes rather than the stored change frames. The
  scan keeps up to 500 spread over the video (3 505 second-level changes on a 9.8-hour
  file), so an all-cuts list would need thousands of thumbnails; the stored frames are
  already CLIP vectors with cached pictures.
- Using the change frames as a stand-in for the Visual Index's scene list. Measured on
  the running library, the change set is 3 to 19 times denser than the sections and
  representatives are not change frames (0–12 %), so it is a different view, not a
  substitute.
- Marking the Visual Index representative frame (the green dot currently marks
  `section_start`). A separate question about the scenes, not about this list.
- Filtering the candidate list instead of replacing it (candidates minus filler): the
  scan does not record which candidate came from ffmpeg scene detection and which from
  the interval fill, so that split is not available without new storage.
- Pre-caching the change frames' pictures at scan time so the first switch is instant:
  a write-amplifying change to the worker, and the on-demand extraction matches how
  every other tile gets its picture.
- Adding a keyboard shortcut for the switch: Tab reaches both chips, and the ruler's
  key map is the section's documented one.
- Remembering the choice across files or across mounts: a per-file view, starting at
  「標準」 each time the section mounts.
- A time present in both lists keeps its picture when the mode changes, because the
  requested set and the failure set are keyed by time; that frame is the same picture in
  both modes, so it is not a wrong tile.
- Changing the existing e2e datasets to carry `changes`: the current cases stay the
  no-switch case, and a separate dataset draws the switch.
- The full-width `SegmentedControl`: it gives a filter of the grid the weight of the
  ruler and the grid, and its accent border sits beside the red playhead. The chips are
  the same selected-state rule at the size of the Find tab's filters.
- Extracting the Find tab's chip into a shared core component: the addon draws the same
  classes itself, so the change stays inside the addon. A third caller is the point to
  extract it.
- 「すべて」 / "All" for the candidate list: the cut list is not a subset of it and is
  often longer (190 candidates against 500 cuts on one measured file), so "all" would
  read as false.
- Labels other than 「カット」 / "Cuts": 「変化点」 and "Changes" do not say what changed;
  「シーン」 / "Scenes" collides with the Visual Index's scenes; 「ショット」 is less
  familiar; 「場面転換」 is long for a chip. The list also holds large camera moves and
  fades, not only hard cuts, which 「カット」 accepts as the reader's notion of a cut.
