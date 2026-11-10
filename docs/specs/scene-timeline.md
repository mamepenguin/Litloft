# One scene timeline for CLIP frames and the Visual Index

SPEC-ID: SPEC-ADDON-089
SPEC-ID: SPEC-ADDON-090

Approval:

## Summary

The file page's Info tab shows two intelligence sections for a video: **CLIP Frames**
(every scene frame the index cut, 276 for an 18-minute episode) and **Visual index** (the
6 to 24 of those frames a vision model described). Both draw cards in a box that scrolls
vertically. In a 384px inspector the CLIP box shows two cards out of hundreds, and nothing
says where in the video they are. The cards are cropped to 16:9 too, which cuts the sides
off a 4:3 video.

This change replaces both sections with a single **Scenes** section that is laid out
along the video's time axis.

- **SPEC-ADDON-089, the timeline.** A ruler as wide as the section. It draws a tick for
  every frame at its real time, so the places with many cuts show up as dense stretches,
  and it marks the playback position. Under the ruler is a 3×3 grid of the nine frames
  around the point being looked at. That point is the playback position, except while
  the reader is browsing the ruler. Frames keep the video's own proportions. Nothing in
  the section scrolls.
- **SPEC-ADDON-090, the Visual Index on the same axis.** The described frames are marked
  on the ruler and on their tiles. A card under the grid shows the description of the
  last described scene at or before the point being looked at. Generate, retry,
  progress and the stale notice move into the section.

The purpose behind keeping the Visual Index separate was to judge its selection and to
spot what it missed. That purpose is kept: the selection now sits on top of every frame
it was chosen from.

Agreed design: <https://claude.ai/artifact/4iG5xfmYq3ZXUTuLXFRaFP>. Copied to
`docs/process/reviews/feature-scene-timeline/design/`. The agreed boards are
`Main.dc.html` (interactive), `SceneStates.dc.html`, `LongVideo.dc.html` and
`Collapsed.dc.html`. `VerticalMinutes.dc.html` (B) and `BelowPlayer.dc.html` (C) are the
rejected alternatives and are not a standard. The play button in the bottom left of
`Main.dc.html` stands in for the player so that the board can be driven; it is not part
of the design. The pictures in `LongVideo.dc.html` are reused from the 18-minute video;
only its times are that file's.

## Required items

### 1. Normal flow

Native video, Visual Index policy on (SPEC-ADDON-089 and 090):

1. The reader opens a video's file page. The Info tab shows the **Scenes** header,
   collapsed, at the place the Visual index header used to be. Nothing is requested yet.
2. The reader expands it. The section requests `GET /files/{id}/clip-timestamps` and
   `GET /files/{id}/visual-index` at the same time and shows the loading skeleton
   (`Collapsed.dc.html`, lower half) until the timestamps arrive.
3. Once the timestamps arrive, the section draws, top to bottom:
   - the header with the frame count and, once the Visual Index has answered with at
     least one described scene, a green dot followed by the scene count;
   - the ruler;
   - the time labels under it;
   - the 3×3 grid;
   - the scene card;
   - the action row.
4. The section subscribes to the shared media clock (`subscribeMediaClock`). Whenever
   the playback position moves into another frame's span, the red marker and the
   outlined tile move with it. When the playing frame moves into the grid's last row,
   the grid moves on by one row. The rule is in §9.
5. With a mouse, moving the pointer over the ruler sets the browse point to the time
   under the pointer. A white line marks it, the grid and the scene card follow it, and
   the tile at the browse point gets a white outline. Leaving the ruler clears the
   browse point, and the grid returns to the playback position. A click on the ruler
   seeks to the time under the pointer and plays.
6. Clicking a tile seeks to that frame's time and plays. Clicking the scene card seeks
   to its scene's time and plays. Either action clears the browse point.
7. The reader collapses the section, or the page moves to another file. The browse
   point is dropped, the clock subscription ends, and the section starts collapsed for
   the next file.

Touch (pointer: coarse), inside the Bottom Sheet or the inspector:

8. Touching or dragging across the ruler moves the browse point and nothing else. It
   never seeks.
   - The browse point stays after the finger lifts.
   - It is cleared when a tile or the scene card is tapped (which seeks), when the
     playback position jumps by a seek from anywhere else, when the section collapses,
     and when the file changes.
   - A horizontal drag on the ruler belongs to the ruler (`touch-action: pan-y`), so a
     vertical drag still scrolls the sheet.

Keyboard:

9. The ruler is one tab stop (`role="slider"`). `←` / `→` move the browse point by one
   frame, `Home` / `End` move it to the first and the last frame, and `Enter` seeks to
   the browse frame and plays. Leaving the ruler (blur) clears the browse point. Tiles,
   the scene card and the actions are buttons in document order.

`.loft` (SPEC-ADDON-089, as SPEC-ADDON-080 has it today):

10. A `.loft` requests `clip-timestamps` on mount and on every `fileId` change. The
    header appears only once at least one row has come back.
    - The pictures come from `GET /files/{id}/scene-tile?t=`, and the frame route is
      never requested.
    - A tile that fails to load draws a blank block of the tile's size, with no visible
      alt text. It keeps its time label and click-to-seek.
    - The Visual Index parts never appear for a `.loft`: no dot count, no marks, no
      scene card, no actions, and no `visual-index` request.

Visual Index actions (SPEC-ADDON-090):

11. **Generate** (`POST /visual-index/generate`), **Retry failed scenes**
    (`POST /visual-index/retry`) and **Regenerate** behave as the Visual index section's
    buttons do today.
    - Each action reloads the section's Visual Index state when it succeeds.
    - The section listens to `intelligence.video_visual.progress`, `.succeeded`,
      `.partial` and `.failed` for its file while it is expanded, and reloads the Visual
      Index state on each of them.

### 2. Failure cases

- `clip-timestamps` fails, or returns no rows, for a native video. The section hides
  itself after the expand, as the CLIP Frames section does today. The Visual Index
  needs frames before it can run, so nothing is lost.
- `visual-index` fails or answers 404 (the feature is off, or the file is not found).
  The section behaves as if the Visual Index policy were off. The timeline still draws,
  without any Visual Index part.
- A frame or tile picture fails to load. A native tile keeps the browser's
  broken-image box, as today. A `.loft` tile shows the blank block (step 10).
- A Visual Index scene whose `start_time` matches no frame row within 0.05 s is still
  marked on the ruler at its own time. No tile carries its dot.
- A described scene with a null `scene_label` is skipped by the scene card. A scene
  whose `status` is `pending` or `failed` is marked on the ruler with a hollow dot:
  green for pending, red for failed.
- `generate` answers 409 `not_queued` with reason `waiting_clip`, or any other error,
  including a failed retry. The action row shows the message the Visual index section
  shows today in place of the note, until the next action or reload:
  `visualIndexWaitingPrerequisite` for `waiting_clip`, `visualIndexActionError` for the
  rest. While a request is out, the action's label is `visualIndexGenerating`
  ("Starting…") and it is disabled.
- The player's duration is not a finite positive number (metadata not loaded yet, or a
  live stream). The ruler uses the last frame's time plus the median gap between
  frames as its length, and switches to the player's duration once that is known.

### 3. States

Section: hidden, collapsed (the default and the state after every file change),
expanded-loading, expanded.

Point being looked at: the playback position, or a browse point (from hover, touch or the
keyboard). The transitions are steps 5, 6, 8 and 9 of §1.

Visual Index (native video with the policy on), drawn as in `SceneStates.dc.html`:

| State | Header | Ruler marks | Scene card | Action row |
|---|---|---|---|---|
| none: no active run, nothing in flight | frame count | none | absent | **Create scenes** (filled button) |
| first run in flight: no active run, staged run queued or running | spinner and `done / selected` | none | absent | none |
| active run, nothing in flight | dot and scene count | one solid mark per succeeded scene, hollow for pending or failed | present | **Regenerate scenes** (ghost) |
| active run with a staged update in flight | dot, spinner and `done / selected` | the active run's marks | present | none |
| active run `partial`, or staged run `partial`/`failed` | dot and succeeded count | as for an active run | present | note "N failed" and **Retry the N failed** (filled) |
| active run stale (`stale: true`) | as for an active run | as for an active run | present | an amber line above the row, and **Regenerate scenes** (filled) |

The visual-index API returns scenes only for the active run, so a first run in flight has
no per-scene marks. The board shows this.

### 4. Data read and written

- Read: `GET /files/{id}/clip-timestamps` (`start`, `content_preview`).
- Read: `GET /files/{id}/visual-index` (`active_run`, `staged_run`, `scenes`, `stale`).
- Read: `GET /files/{id}/frame?t=`, or `GET /files/{id}/scene-tile?t=` for a `.loft`.
- Read: the shared media clock.
- Written, only by the existing generate and retry routes: none of the backend
  changes. This change has no backend part: no table, route, worker or event changes.
- The browser keeps no state across files: no `localStorage`, no URL parameter.

### 5. External services

None. The section talks only to the intelligence addon through the host proxy. The
vision model is called by the existing Visual Index worker, as before.

### 6. Authorization

Unchanged.
- Every route goes through the host proxy's file-access check with `X-Lit-Drive`.
- The Visual Index routes keep their `addon_feature: video_visual_index` gate.
- The client still reads `usePolicy(drive, "intelligence", "video_visual_index")` and
  draws no Visual Index part when the policy is off.

### 7. Effect on existing features

- The intelligence manifest's `file-detail-sections` entries `visual-index` (priority 20)
  and `clip-frames` (priority 21) are replaced by one entry, `scenes`, at priority 20.
  `slots.ts` maps it to the new component. `VisualIndexSection.tsx` and
  `ClipFramesSection.tsx` and their tests are removed.
- Search, Ask, scene search, the MCP frame tools, the frame and scene-tile routes and the
  Visual Index worker are unchanged.
- The core tests that list these two files by path change with them:
  - `frontend/src/__tests__/section-rows.test.tsx`: the `overflow-x-auto` site list
    loses both files, because the new section scrolls on neither axis.
  - `frontend/src/__tests__/line-clamp-display.test.ts`: its anchor list replaces
    `VisualIndexSection.tsx` with the new file if that file still clamps lines,
    otherwise drops it.
  - `frontend/e2e-layout/no-horizontal-scroll.spec.ts` and its fixture: the add-on row
    cases for clip frames and the Visual Index (CORE-065 I3 and I4) are replaced by
    cases for the Scenes section. See Revises.
- The core needs a pointer bump to the merged intelligence commit (CLAUDE.md, Git).

### 8. Error behavior

What the user sees is in §2.
- No new logs on the client.
- The backend logs are unchanged.

### 9. User-visible behavior

Layout (`Main.dc.html`, 384px inspector):

- **Header row**: the Film icon, then **Scenes**, then the frame count. Then, as §3
  says, a 6px green dot followed by the scene count, or the progress. A chevron sits at
  the right.
- **Ruler**: full width, 44px tall, `rounded-lg`, `bg-bg-card`.
  - **Frames**: one 1px muted tick per frame at `start / duration` of its width. With
    500 frames the ticks merge into a band, and that is fine.
  - **Scenes**: a Visual Index scene is a 2px green line with a 7px dot above it.
  - **Window band**: a light band covers the time span of the nine frames in the grid.
  - **Markers**: the playback position is a 2px accent line, and the browse point is a
    1px `text-primary` line.
- **Time labels** under the ruler, 11px, tabular numbers:
  - `0:00` at the left and the duration at the right.
  - Between them, interior labels at the first step from 1, 2, 5, 10, 15 and 30
    minutes, then 1, 2, 3 and 6 hours, that gives at most four of them.
  - An interior label closer than 8% of the width to either end is left out.
  - The text follows `formatDuration`. The boards show `0:00 5:00 10:00 15:00 18:44`
    and `0:00 1:00:00 2:00:00 3:00:00 4:09:30`.
- **Grid**: three equal columns, `gap` 12px between rows and 8px between columns.
  - Each tile is the picture (`rounded-lg`, no crop) with its time under it, 12px,
    centered.
  - The picture's ratio is the natural ratio of the first picture in the window that
    loads. Until one loads it is 16:9.
  - The tile of the frame holding the playback position has a 2px accent outline with
    a 2px offset, and its time is `text-primary`.
  - The browse frame, when it is a different tile, has the same outline in
    `text-primary`.
  - A frame chosen by the Visual Index has an 8px green dot in its top-left corner.
- **Window rule**:
  - The grid shows frames `s` to `s + 8`, where
    `s = clamp(3 × floor(i / 3) − 3, 0, max(0, n − 9))`, `i` is the frame at the point
    being looked at and `n` is the number of frames.
  - The frame holding a time is the last frame whose start is at or before it; before
    the first frame it is frame 0.
  - With fewer than nine frames, the grid shows all of them.
  - Playback moving forward therefore steps the grid one row at a time, and the playing
    frame stays in the middle row everywhere except the first and the last row.
- **Motion**: when the window moves, tiles that stay travel to their new place (200ms
  `ease-out`), and new tiles fade in. A window that keeps no tile is not animated.
  Under `prefers-reduced-motion: reduce` nothing moves (DESIGN.md §7).
- **Scene card** (`rounded-xl`, `bg-bg-card`, `px-3 py-2.5`):
  - It shows the last described scene at or before the point being looked at, or the
    first described scene when that point is before all of them.
  - It holds a green dot and the time (12px, muted), the `scene_label` (14px,
    `text-primary`), and the `visible_text` (12px, muted, `white-space: pre-line`, two
    lines at most) when there is one.
  - `transcript_excerpt` and `scene_type` are not shown.
- **Action row**: as in §3. The note sits on the left (12px, muted) and the action on
  the right. A filled action uses `rounded-2xl` and `bg-bg-elevated`. A ghost action
  is text with a hover background. The stale line is 12px `text-accent-amber`.
- **Loading** (`Collapsed.dc.html`): the expanded header with a chevron, a ruler-shaped
  `bg-bg-card` block, and nine `bg-bg-elevated` blocks with short bars under them.
- **Collapsed**: the header row without counts.
- The section never scrolls on either axis, on either pointer. Its height while expanded
  is fixed by the content above and does not change when the window moves.

Text (`file` namespace, both locales):
- Title: **Scenes** / **シーン**.
- **Create scenes** / **シーンを作る**.
- **Regenerate scenes** / **シーンを作り直す**.
- **Retry the {count} failed** / **失敗した {count} 件をやり直す**.
- Note: **{count} failed** / **{count} 件失敗**.
- Ruler label: **Frame timeline** / **フレームの時間軸**.
- Tile and card label: **Play from {time}** / **{time} から再生**.
- The stale line keeps the existing `visualIndexStale` text.

The Visual index section's own empty text ("No visual index has been generated yet.")
is not shown. The **Create scenes** button takes its place.

Docs:
- `docs/addons/intelligence.md`: the Visual index and YouTube paragraphs, and the list
  of file-page sections.
- `docs/ADDON-DEVELOPMENT.md`: the slot table row.

### 10. Non-functional

- **Requests per window.** Only the nine pictures of the current window are requested.
  While the browse point is moving, a window's pictures are requested only after that
  window has stayed for 150 ms. A frame cache miss runs ffmpeg once per picture, so a
  sweep across the ruler must not ask for every frame.
- **Rendering.** The ruler renders 500 ticks without any per-tick listener; one pointer
  handler on the ruler works out the time. The clock subscription re-renders only when
  the playing frame, the window or the browse point changes, not on every clock tick.
- **Privacy.** Nothing is new. The Visual Index still sends frames only when the reader
  presses an action, or when the `on_index` mode runs it.

## Touch points

All paths are in the `addons/intelligence` repository unless they start with
`frontend/` or `docs/` in the core.

- `frontend/ScenesSection.tsx` (new; Container/Presenter split per
  `.claude/rules/frontend-conventions.md` if it grows past one file), and its tests.
- `frontend/ClipFramesSection.tsx`, `frontend/VisualIndexSection.tsx` and their tests
  (removed).
- `frontend/slots.ts`, `manifest.json` (`file-detail-sections`).
- `frontend/messages/en.json`, `frontend/messages/ja.json`.
- `frontend/api.ts`: read only. Existing helpers are reused.
- Core `frontend/src/lib/mediaClock` (`subscribeMediaClock` / `getMediaClockSnapshot`):
  read only.
- Core `frontend/src/__tests__/section-rows.test.tsx`,
  `frontend/src/__tests__/line-clamp-display.test.ts`.
- Core `frontend/e2e-layout/no-horizontal-scroll.spec.ts` and
  `frontend/e2e-layout/fixtures/no-horizontal-scroll.html`.
- Core `docs/addons/intelligence.md`, `docs/ADDON-DEVELOPMENT.md`.
- Core `addons/intelligence` gitlink (pointer bump).
- Rules passed through: `DESIGN.md` §5, §7 and §8.5 ("The primary pointer decides
  whether anything scrolls sideways"); `.claude/rules/frontend-conventions.md`;
  `.claude/rules/design-decisions.md` (Addons: no core-to-addon dependency).
- Agreed design: `docs/process/reviews/feature-scene-timeline/design/`.
- No protected path is edited.

## Invariants

I1. The ruler draws exactly one tick per `clip-timestamps` row, at `start / duration` of its width. The grid shows the nine frames from `s = clamp(3 × floor(i / 3) − 3, 0, max(0, n − 9))`, or all frames when there are fewer than nine, where `i` is the last frame whose start is at or before the point being looked at (frame 0 before the first).
I2. While no browse point is set, the outlined tile and the ruler's playback marker follow the shared media clock. A browse point (hover, touch or keyboard) moves the grid and the scene card but never changes the playback position. Only a click on the ruler (mouse), `Enter` on the ruler, a tile or the scene card seeks.
I3. On a coarse pointer, touching or dragging the ruler never seeks. The browse point it sets stays until a tile or the scene card is tapped, the playback position jumps by a seek, the section collapses or the file changes.
I4. No element inside the section scrolls on either axis on either pointer, and the section's height does not change when the window moves or the browse point changes.
I5. A native video requests nothing before its first expand. A `.loft` requests `clip-timestamps` on mount and on every `fileId` change, never applies a response for an earlier `fileId`, takes every picture from the scene-tile route and never from the frame route, never requests `visual-index`, and draws a blank tile-sized block with its time label and click-to-seek for a tile that fails.
I6. Only the pictures of the current window are requested, and while the browse point moves a window's pictures are requested only after it has stayed 150 ms.
I7. When the Visual Index policy is off, or `visual-index` fails or answers 404, the section draws no Visual Index part (no dot count, marks, tile dots, scene card or actions), and the timeline is otherwise unchanged.
I8. Every scene in the active run is marked on the ruler at its `start_time`: solid for `succeeded`, hollow green for `pending`, hollow red for `failed`. A tile carries the green dot exactly when a scene's `start_time` is within 0.05 s of its frame's `start`.
I9. The scene card shows the last succeeded scene with a non-null `scene_label` at or before the point being looked at (the first such scene before all of them), with its `visible_text` and never its `transcript_excerpt`, and activating it seeks to that scene's `start_time`.
I10. Each Visual Index state of §3 shows exactly the header, the marks and the action of its row. No generate, retry or regenerate action is offered while a staged run is queued or running, and each action calls the same route the Visual index section calls today.

## Revises

SPEC-ADDON-080 I6. The Scenes section of a `.loft` requests `clip-timestamps` on mount and on every `fileId` change, never applies a response for an earlier `fileId`, renders nothing until the current file's request returns at least one row (and stays hidden when it fails), then shows the collapsed Scenes header, takes every picture from the scene-tile route, never requests the frame route, and shows a blank block of the picture's size with no visible alt text, keeping its time label and click-to-seek, for a tile that fails; for a native video the section requests nothing before its first expand and takes its pictures from the frame route, as before.
SPEC-CORE-065 I3. On a touch environment the shelf, collection panel, page tabs, inspector tabs and breadcrumb remain horizontally scrollable as they were; the intelligence Scenes section scrolls on neither axis.
SPEC-CORE-065 I4. On a mouse environment no drawn item is clipped by a wrapper: the bounding box of every drawn card, tab and breadcrumb segment lies inside its container's box. A shelf with a "see all" link draws at most two rows; a shelf without one draws every card in wrapped rows; the collection panel keeps every track reachable through its vertical scroll; the intelligence Scenes section draws its nine tiles inside its own box without any scroll.

## Checked, no action

- **A backend change to return a staged run's scenes**, so that a first run could draw
  per-scene progress marks. It was skipped. The header shows `done / selected`, and the
  agreed board was redrawn to match the API.
- **A chapter band on the ruler.** Chapters live in the core's companion region. A core
  slot or prop would be needed to bring them in, and the reader did not ask for it.
- **Option C, the strip under the player.** Rejected by the reader: it needs a new core
  slot.
- **Passing the file's own width and height to the slot** so that the tile ratio is known
  before the first picture loads. That is a core prop change. The 16:9 placeholder
  changes once, at the first load of an expanded section.
- **Keeping `transcript_excerpt`.** The reader chose to drop it. Excerpts are long, often
  cut mid-word, and the Transcript tab has the same text.
- **Remembering the expanded state across files.** Both sections start collapsed today,
  and the reader did not ask to change that.
- **A "back to playback position" control on touch.** Tapping any tile, or any seek,
  clears the browse point. A separate control is not in the agreed design.
- **Fetching `clip-timestamps` before the expand for a native video**, so that the
  collapsed header could show counts. The agreed `Collapsed.dc.html` shows no counts,
  and the request is skipped until it is needed, as today.
