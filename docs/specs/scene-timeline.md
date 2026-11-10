# One scene timeline for CLIP frames and the Visual Index

SPEC-ID: SPEC-ADDON-089
SPEC-ID: SPEC-ADDON-090

Approval: sha256:b4e54db683000fddc69a9ec97c7f9c2cb858e41b2de94e26777d2adaf1022b33 Yuichi Senga 2026-11-10

## Summary

For a video, the file page's Info tab shows two intelligence sections:

- **CLIP Frames**, which shows every scene frame the index cut (276 for an 18-minute
  episode).
- **Visual index**, which shows the 6 to 24 of those frames that a vision model
  described.

Both sections draw cards in a box that scrolls vertically. In a 384px inspector, the CLIP
box shows two cards out of hundreds, and nothing tells the reader where in the video those
cards are. The cards are also cropped to 16:9, which cuts the sides off a 4:3 video.

This change replaces both sections with one **Scenes** section, laid out along the
video's time axis.

- **SPEC-ADDON-089, the timeline.**
  - A ruler as wide as the section has one tick per frame, at the frame's real time.
    Stretches with many cuts show up as dense bands. The ruler also marks the playback
    position.
  - Under the ruler, a 3×3 grid shows the nine frames around the point being looked at.
    That point is the playback position, unless the reader is browsing the ruler.
  - Frames keep the video's own proportions.
  - Nothing in the section scrolls.
- **SPEC-ADDON-090, the Visual Index on the same axis.**
  - The described frames are marked on the ruler and on their tiles.
  - A card under the grid describes the last described scene at or before the point
    being looked at.
  - Generate, retry, progress and the stale notice move into this section.

The Visual Index was kept in a separate section so that the reader could judge what it
selected and spot what it missed. This change keeps that purpose: the selection is now
drawn on top of every frame it was chosen from.

The agreed design is <https://claude.ai/artifact/4iG5xfmYq3ZXUTuLXFRaFP>, copied to
`docs/process/reviews/feature-scene-timeline/design/`.

- **The standard.** The agreed boards are `Main.dc.html` (interactive),
  `SceneStates.dc.html`, `LongVideo.dc.html` and `Collapsed.dc.html`.
- **Not the standard.** `VerticalMinutes.dc.html` (B) and `BelowPlayer.dc.html` (C) are
  the rejected alternatives.
- **Board-only parts.** The play button at the bottom left of `Main.dc.html` stands in
  for the player so that the board can be driven; it is not part of the design. The
  pictures in `LongVideo.dc.html` are reused from the 18-minute video; only its times
  belong to that file.

Where this spec gives a value the boards do not draw (the scene card's reserved height,
for example), the spec wins.

## Required items

### 1. Normal flow

**Native video with the Visual Index policy on (SPEC-ADDON-089 and 090)**

1. **Open the file page.** The reader opens a video's file page. The Info tab shows the
   **Scenes** header, collapsed and without counts, where the Visual index header used
   to be. The section requests nothing from the intelligence addon. The only request
   is the core drive-policy read (`usePolicy`).
2. **Expand.** Each time the reader expands the section, it requests
   `GET /files/{id}/clip-timestamps`.
   - It also requests `GET /files/{id}/visual-index` at the same time, unless the policy
     is off.
   - If the policy is still loading, `visual-index` is requested once the policy
     resolves as on.
   - The loading skeleton (`Collapsed.dc.html`, lower half) shows until the timestamps
     arrive.
3. **Draw.** When the timestamps arrive, the section draws from top to bottom:
   - the header, with the frame count, and the Visual Index count or progress (§3);
   - the ruler, with the time labels under it;
   - the 3×3 grid;
   - the scene card;
   - the action row.
4. **Follow playback.** When `mediaController` is present, the section subscribes to the
   shared media clock (`subscribeMediaClock`).
   - Whenever the playback position moves into another frame's span, the red marker and
     the accent-outlined tile move with it. This happens whether or not a browse point is
     set.
   - With no browse point set, the grid also moves on by one row when the playing frame
     reaches the grid's last row (§9).
5. **Browse with a mouse.** Moving the pointer over the ruler sets the browse point to
   the time under the pointer.
   - A white line marks the browse point. The grid and the scene card follow it, and the
     tile at the browse point gets a white outline.
   - Moving the pointer off the ruler into the grid or the card keeps the browse point,
     so the reader can click a frame they browsed to. Leaving the section clears it, and
     the grid returns to the playback position.
   - Clicking the ruler seeks to the time under the pointer and plays.
   - Which behaviour applies (this step, or step 8) is decided per event by its
     `pointerType`: `mouse` follows this step, `touch` and `pen` follow step 8.
6. **Seek from a tile or the card.** Clicking a tile seeks to that frame's time and
   plays. Clicking the scene card seeks to the scene's time and plays. Either action
   clears the browse point.
7. **Collapse or change file.** When the reader collapses the section, or the page moves
   to another file:
   - The browse point is dropped, and so is every loaded result, except a `.loft`'s
     rows on a collapse (step 10).
   - The clock subscription and the event listening end.
   - A response that arrives later is discarded.
   - The next file starts collapsed.

**Touch and pen (by `pointerType`), in the Bottom Sheet or the inspector**

8. **Browse with a finger.** A tap on the ruler, or a horizontal drag of at least 8 px
   that starts on it, moves the browse point and nothing else. It never seeks.
   - A touch that the browser hands to vertical scrolling (`pointercancel`; the ruler
     has `touch-action: pan-y`) leaves the browse point as it was before that touch.
   - The browse point stays after the finger lifts.
   - The browse point is cleared when:
     - a tile or the scene card is tapped (which seeks);
     - the playback position jumps (§9, "Jump");
     - the section collapses;
     - the file changes.

**Keyboard**

9. **The ruler as a slider.** The ruler is one tab stop with `role="slider"`.
   - Focusing it sets nothing.
   - `←` / `→` move the browse point by one frame. The first press starts from the
     playing frame.
   - `Home` / `End` move the browse point to the first and the last frame.
   - `Enter` seeks to the browse frame, plays, and clears the browse point. With no
     browse point set, `Enter` does nothing.
   - These five keys call `preventDefault` and `stopPropagation` on the ruler. They never
     reach the page's shortcuts (`ShortcutsProvider`: file navigation and the player's
     seek keys).
   - `aria-valuemin` is 0 and `aria-valuemax` is `L` (§2), in whole seconds.
     `aria-valuenow` is the time of the browse point, or of the playback position when no
     browse point is set, in whole seconds. `aria-valuetext` is that time formatted by
     `formatDuration`.
   - The browse point is cleared when focus leaves the section, and when the playback
     position jumps (§9). Moving focus from the ruler to a tile keeps it, so a keyboard
     user can reach a browsed tile.
   - Tiles, the scene card and the actions are buttons, in document order.

**`.loft` (SPEC-ADDON-089, revising SPEC-ADDON-080 I6)**

10. **A `.loft` file.** A `.loft` requests `clip-timestamps` on mount and on every
    `fileId` change.
    - The header appears only once at least one row has come back.
    - Expanding requests nothing and goes straight to expanded, with no loading
      skeleton. Collapsing keeps the rows.
    - Pictures come from `GET /files/{id}/scene-tile?t=`. The frame route is never
      requested.
    - A tile that fails to load draws a blank block of the tile's size, with no visible
      alt text. It keeps its time label and click-to-seek.
    - Visual Index parts never appear for a `.loft`, and `visual-index` is never
      requested.

**Visual Index actions (SPEC-ADDON-090)**

11. **Generate, retry and regenerate.**
    - **Create scenes** and **Regenerate scenes** call `POST /visual-index/generate`.
      **Retry the N failed** calls `POST /visual-index/retry`.
    - While the request is out, the pressed action reads "Starting…"
      (`visualIndexGenerating`) and every action is disabled.
    - When the request succeeds, the section reloads its Visual Index state.
    - While expanded, the section listens to `intelligence.video_visual.progress`,
      `.succeeded`, `.partial` and `.failed`. It reloads the Visual Index state only for
      events whose file id is the current file.

### 2. Failure cases

- **No frame rows (native video).** `clip-timestamps` fails or returns no rows. The
  section hides itself after the expand, as the CLIP Frames section does today. The
  Visual Index cannot run without frames, so nothing is lost.
- **Visual Index still loading.** Until the policy and `visual-index` have both
  answered, the header shows the frame count only, and no mark is drawn. The scene card
  and the action row keep their space but are empty. If the answer is "no Visual Index",
  that space is removed once.
- **A reload fails.** A reload after a good answer (from an action or a WS event) that
  fails keeps the last good Visual Index state on screen.
- **No usable Visual Index.** On the first load, any of the following counts as "no
  Visual Index" (I9). The timeline is drawn without any Visual Index part:
  - the policy is off;
  - `visual-index` fails;
  - `visual-index` answers 404;
  - `visual-index` answers `eligible: false` or `available: false` (for example, no
    `llm.vision_model` is configured).
- **A picture fails to load.** A native tile shows the browser's broken-image box, as
  today. A `.loft` tile shows the blank block (step 10).
- **A scene with no matching frame.** A Visual Index scene whose `start_time` matches no
  frame row within 0.05 s is still marked on the ruler at its own time. No tile carries
  its dot.
- **A scene with no label.** A succeeded scene with a null `scene_label` is skipped by
  the scene card. It is still marked on the ruler and on its tile.
- **An action fails.** `generate` answers 409 `not_queued` with reason `waiting_clip`,
  or any action fails in any other way.
  - The action row's left side shows `visualIndexWaitingPrerequisite` for
    `waiting_clip`, and `visualIndexActionError` for everything else.
  - The message replaces the note in every row.
  - It is cleared by the next action, by any reload of the Visual Index state (WS
    events included), by collapse and by a file change.
- **The duration and out-of-range times.**
  - The ruler's length `L` is the player's duration when that is a finite positive
    number at least as large as the last frame's start.
  - Otherwise, `L` is the last frame's start plus the median gap between frames. With a
    single frame, it is that frame's start plus 1 s.
  - A frame, scene or marker time beyond `L` is drawn at the right edge.
- **No `mediaController` yet.** Until the player reports a `mediaController`, the
  section draws no playback marker and no accent outline, and the grid shows the window
  at frame 0.
  - A seek falls back to `videoRef.current.currentTime = t`, followed by
    `videoRef.current.play()`. Nothing follows `videoRef` as a clock.
  - With neither present, tiles, the card and the ruler do not seek.

### 3. States

**Section states and transitions**

| From | To | Trigger |
|---|---|---|
| hidden | collapsed | file change to a video. A `.loft` changes only once rows arrive |
| collapsed | expanded-loading | expand (native) |
| collapsed | expanded | expand (`.loft`, whose rows are already loaded) |
| expanded-loading | expanded | the timestamps arrive with at least one row |
| expanded-loading | hidden | the timestamps fail or are empty (native) |
| expanded-loading, expanded | collapsed | collapse. A response still out is discarded |
| any | collapsed or hidden | file change |

- A native video that became hidden stays hidden until the file changes.
- Nothing returns to expanded without an expand.

**Point being looked at**

The point being looked at is the playback position, or a browse point set by hover,
touch or the keyboard. Steps 5, 6, 8 and 9 of §1 set and clear the browse point.

**Visual Index states**

These apply to a native video with a usable Visual Index, and are drawn in
`SceneStates.dc.html`. The first row that matches wins, in this order:

| # | Condition | Header | Ruler marks | Scene card | Action row |
|---|---|---|---|---|---|
| 1 | a staged run is `queued` or `running`, with no active run | spinner, `done / selected` | none | absent | none |
| 2 | a staged run is `queued` or `running`, with an active run | dot, spinner, `done / selected` | the active run's | as in 4 | none |
| 3 | N > 0, where the staged run is `partial` or `failed`, or the active run is `partial` | dot and count of succeeded scenes (none when no active run) | the active run's (none when no active run) | as in 4 (absent when no active run) | note "N failed", **Retry the N failed** (filled), and **Regenerate scenes** (ghost; **Create scenes** when there is no active run) |
| 4 | an active run | dot and count of succeeded scenes | one mark per scene | present when at least one succeeded scene has a label, absent otherwise | **Regenerate scenes** (ghost) |
| 5 | no active run, nothing staged | frame count only | none | absent | **Create scenes** (filled) |

- **N.** N is the staged run's `failed_count` when the staged run is `partial` or
  `failed`. Otherwise it is the active run's `failed_count`. A run can fail before any
  scene with `failed_count` 0. Retrying it has nothing to retry, so row 3 does not
  apply, and row 4 or 5 is drawn.
- **`done / selected`.** This is `completed_count / selected_count`, or `…` while
  `selected_count` is 0.
- **The stale line.** When `stale` is true, an amber line sits above the action row in
  rows 3 and 4. In row 4, **Regenerate scenes** is then drawn filled instead of ghost.
  Rows 1 and 2 never show it.
- **Why rows 1 and 2 draw no marks.** The visual-index API returns scenes only for the
  active run, so a first run in flight has no per-scene marks.

### 4. Data read and written

**Read**

- `GET /files/{id}/clip-timestamps`: `start`.
- `GET /files/{id}/visual-index`: `eligible`, `available`, `active_run`, `staged_run`,
  `scenes`, `stale`.
- `GET /files/{id}/frame?t=`, or for a `.loft`, `GET /files/{id}/scene-tile?t=`.
- The shared media clock.
- The core drive policy.

**Written**

- Only by the existing generate and retry routes, unchanged.
- This change has no backend part: no table, route, worker or event changes.

**Kept in the browser**

- Nothing outlives the section. There is no `localStorage` and no URL parameter.

### 5. External services

None.

- The section talks only to the intelligence addon, through the host proxy.
- The vision model is still called by the existing Visual Index worker.

### 6. Authorization

Unchanged.

- Every route goes through the host proxy's file-access check with `X-Lit-Drive`.
- The Visual Index routes keep their `addon_feature: video_visual_index` gate.
- The client reads `usePolicy(drive, "intelligence", "video_visual_index")` and draws no
  Visual Index part when the policy is off.

### 7. Effect on existing features

**The two old sections**

- The intelligence manifest's `file-detail-sections` entries `visual-index` (priority 20)
  and `clip-frames` (priority 21) are replaced by one entry, `scenes`, at priority 20,
  with the label **Scenes**.
- `slots.ts` maps `scenes` to the new component.
- `VisualIndexSection.tsx`, `ClipFramesSection.tsx` and their tests are removed.

**What stays the same**

- Search, Ask, scene search, the MCP frame tools, the frame and scene-tile routes, and
  the Visual Index worker do not change.

**What the reader loses**

- The collapsed header no longer shows Visual Index progress before the section is
  expanded (see Checked, no action).

**Core tests that list these files by path**

- `frontend/src/__tests__/section-rows.test.tsx`: both files leave the `overflow-x-auto`
  site list.
- `frontend/src/__tests__/line-clamp-display.test.ts`: the `VisualIndexSection.tsx`
  anchor becomes `addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx`,
  which holds the scene card's line clamps.
- `frontend/e2e-layout/no-horizontal-scroll.spec.ts` and its fixture: the add-on row
  cases for clip frames and the Visual Index (CORE-065 I3, I4) are removed. Revises
  states the replacement, and a new real-component case measures it (§10).

**Release**

- The core moves the `addons/intelligence` pointer to the merged commit (CLAUDE.md,
  Git).

### 8. Error behavior

- What the reader sees is described in §2.
- No new logs are written, on the client or on the backend.

### 9. User-visible behavior

**Layout** (`Main.dc.html`; the section's width is whatever the host gives it)

- **Header row**:
  - From left to right: the Film icon, **Scenes**, and the frame count as a bare
    number.
  - Then, as §3 says, a 6px green dot and the scene count, or the progress.
  - A chevron sits at the right.
  - The dot and count have the accessible name "{count} scenes". The progress has
    "Processing {progress}" (first run) or "Updating {progress}" (an update).
- **Ruler**: full width, 44px tall, `rounded-lg`, `bg-bg-card`.
  - **Frame ticks**: one 1px muted tick per frame, at `start / L` of the width. With many
    frames the ticks merge into a band. The count is bounded by the index's
    `max_frames` (500 by default), and the ticks are drawn as one SVG path or a single
    canvas, not as one element per tick.
  - **Scene marks**: a 2px line under a 7px dot.
    - `succeeded`: solid green.
    - `pending` and `running`: a hollow green dot over a faint green line.
    - `failed`: a hollow red dot over a faint red line.
  - **Window band**: a light band covers the time span of the nine frames in the grid.
  - **Markers**: the playback position is a 2px accent line. The browse point is a 1px
    `text-primary` line.
- **Time labels**: under the ruler, 11px, with tabular numbers.
  - `0:00` sits at the left and `L` at the right.
  - Between them, interior labels sit at the first step from this list that gives at
    most four of them: 1, 2, 5, 10, 15 or 30 minutes, then 1, 2, 3 or 6 hours.
  - An interior label closer than 8% of the width to either end is left out.
  - All labels are formatted by `formatDuration`.
  - The boards show `0:00 5:00 10:00 15:00 18:44` and
    `0:00 1:00:00 2:00:00 3:00:00 4:09:30`.
- **Width**: the section is at most `24rem` wide, the inspector's width. On the
  collection surface, where `file-detail-sections` is drawn in the canvas, it does not
  grow past that.
- **Grid**: three equal columns. Rows are 12px apart and columns 8px apart.
  - **Tile**: the picture (`rounded-lg`, not cropped), with its time under it at 12px,
    centered.
  - **Tile ratio**: the natural ratio of the first picture in the window that loads.
    Until one loads, it is 16:9.
  - **Pictures not requested yet**: a tile whose picture has not been requested yet is
    an empty `bg-bg-elevated` box with its time.
  - **Playing tile**: the tile of the frame holding the playback position has a 2px
    accent outline with a 2px offset, and its time is `text-primary`.
  - **Browse tile**: the browse frame, when it is a different tile, has the same outline
    in `text-primary`.
  - **Scene dot**: a frame whose time matches a `succeeded` scene has an 8px solid green
    dot in its top-left corner.
- **Window**: the grid shows frames `s` to `s + 8`, where
  `s = clamp(3 × floor(i / 3) − 3, 0, max(0, n − 9))`.
  - `i` is the frame holding the point being looked at. That is the last frame whose
    start is at or before the point, or frame 0 before the first frame.
  - `n` is the number of frames. With fewer than nine frames, the grid shows all of
    them.
  - So as playback moves forward, the grid steps one row at a time. The playing frame
    stays in the middle row, except in the first and the last row of the video.
- **Jump**: between two consecutive clock samples, the position differs by more than
  2 s from where steady playback at the current rate would have put it. While paused,
  any change of more than 0.5 s counts.
- **Motion**: when the window moves, tiles that stay travel to their new place (200ms
  `ease-out`) and new tiles fade in. A window that keeps no tile is not animated. Under
  `prefers-reduced-motion: reduce` nothing moves (DESIGN.md §7).
- **Scene card**: `rounded-xl`, `bg-bg-card`, `px-3 py-2.5`.
  - **Which scene**: the last succeeded scene with a label at or before the point being
    looked at, or the first such scene when the point is before all of them.
  - **Contents**:
    - a green dot and the time, 12px muted;
    - the `scene_label`, 14px `text-primary`, at most two lines;
    - the `visible_text` when there is one, 12px muted, `white-space: pre-line`, at most
      two lines.
  - **Height**: the card reserves the height of two label lines and two text lines.
  - `transcript_excerpt` and `scene_type` are not shown.
- **Action row**:
  - The note or error sits on the left, at 12px muted.
  - The actions sit on the right.
  - A filled action uses `rounded-2xl` and `bg-bg-elevated`. A ghost action is text that
    gets a background on hover.
  - The stale line is 12px `text-accent-amber`.
- **Loading** (`Collapsed.dc.html`): the expanded header with its chevron, a
  ruler-shaped `bg-bg-card` block, and nine `bg-bg-elevated` blocks with short bars
  under them.
- **Collapsed**: the header row without counts.
- **No scrolling**: the section never scrolls on either axis, with either pointer.
- **Fixed height**: once expanded, the section's height does not change when the
  window moves or the browse point changes.

**Text**

All keys are new keys in the `file` namespace, in both locales. The manifest label is
**Scenes**.

| Key | en | ja |
|---|---|---|
| `scenesTitle` | Scenes | シーン |
| `scenesCount` (accessible name) | {count} scenes | {count} シーン |
| `scenesProcessing` (accessible name) | Processing {progress} | 処理中 {progress} |
| `scenesUpdating` (accessible name) | Updating {progress} | 更新中 {progress} |
| `scenesCreate` | Create scenes | シーンを作る |
| `scenesRegenerate` | Regenerate scenes | シーンを作り直す |
| `scenesRetry` | Retry the {count} failed | 失敗した {count} 件をやり直す |
| `scenesFailedNote` | {count} failed | {count} 件失敗 |
| `scenesRuler` | Frame timeline | フレームの時間軸 |
| `scenesPlayFrom` | Play from {time} | {time} から再生 |

- **Kept existing keys**: `visualIndexStale`, `visualIndexGenerating`,
  `visualIndexWaitingPrerequisite` and `visualIndexActionError`.
- **Removed keys**, from both locales:
  - `searchIndex.clipTitle`;
  - `file.visualIndexTitle`, `visualIndexSceneCount`, `visualIndexProcessing`,
    `visualIndexUpdating`, `visualIndexPartial`, `visualIndexEmpty`,
    `visualIndexGenerate`, `visualIndexGenerateAgain`, `visualIndexRetryFailed`,
    `visualIndexSceneFailed` and `visualIndexTranscriptExcerpt`.

**Docs**

- `docs/addons/intelligence.md`:
  - the feature table row for the Visual index;
  - the Visual index paragraph;
  - the YouTube paragraph's "CLIP frames panel";
  - the list of file-page sections.
- `docs/ADDON-DEVELOPMENT.md`: the slot table row.
- `docs/user-guide/keyboard-shortcuts.md`: the ruler's `←` / `→` / `Home` / `End` /
  `Enter`.
- `docs/user-guide/video.md`: one sentence. Hovering the scene ruler, or touching it on
  a phone, shows the frames there without moving the video. A click on the ruler, or a
  tap on a frame, plays from that point.

### 10. Non-functional

- **Requests**: only the nine pictures of the current window are requested.
  - While the browse point is moving, a window's pictures are requested only after that
    window has stayed put for 150 ms.
  - A frame-cache miss runs ffmpeg once per picture, so a sweep across the ruler must
    not ask for every frame.
- **Rendering**:
  - Pointer handling: the ruler has one pointer handler, which works out the time.
  - Re-renders from the clock: the section re-renders only when the playing frame, the
    window or the browse point changes. It does not re-render on every clock tick.
- **Measurement**: a new `frontend/e2e-components` case renders the real Scenes
  component, with its API stubbed, in Chromium.
  - Widths: 384px with a mouse, 390px with a coarse pointer, and a 900px host (the
    collection surface), where the section stays at `24rem`.
  - It checks that no element scrolls on either axis.
  - It checks that the section's height stays the same across a window move, a browse
    point move, a scene card with no `visible_text` and one with a two-line label.
- **Privacy**: no new data is sent anywhere. The Visual Index still sends frames only
  when the reader presses an action, or when the `on_index` mode runs it.

## Touch points

All paths are in the `addons/intelligence` repository, unless they start with
`frontend/` or `docs/` in the core.

**In `addons/intelligence`**

- `frontend/ScenesSection/` (new): `ScenesSectionContainer.tsx`,
  `ScenesSectionPresenter.tsx`, `index.ts` and its tests, per
  `.claude/rules/frontend-conventions.md`. `slots.ts` imports `./ScenesSection`.
- `frontend/ClipFramesSection.tsx`, `frontend/VisualIndexSection.tsx` and their tests
  (removed).
- `frontend/slots.ts`, and `manifest.json` (`file-detail-sections`).
- `frontend/messages/en.json`, `frontend/messages/ja.json`.
- `frontend/api.ts`: read only. The existing helpers are reused.

**In the core, read only**

- `frontend/src/lib/mediaClock.ts`, `frontend/src/hooks/usePolicy`,
  `frontend/src/hooks/useWebSocket`, and `frontend/src/components/ShortcutsProvider.tsx`
  (whose listener the ruler keys must not reach).

**In the core, changed**

- `frontend/src/__tests__/section-rows.test.tsx` and
  `frontend/src/__tests__/line-clamp-display.test.ts`.
- `frontend/e2e-layout/no-horizontal-scroll.spec.ts` and
  `frontend/e2e-layout/fixtures/no-horizontal-scroll.html`.
- `frontend/e2e-components/`: a new Scenes case, with the fixture and stub it needs.
- `docs/addons/intelligence.md`, `docs/ADDON-DEVELOPMENT.md`,
  `docs/user-guide/keyboard-shortcuts.md` and `docs/user-guide/video.md`.
- The `addons/intelligence` gitlink (pointer bump).

**Rules passed through**

- `DESIGN.md` §5, §7 and §8.5 ("The primary pointer decides whether anything scrolls
  sideways").
- `.claude/rules/frontend-conventions.md`.
- `.claude/rules/design-decisions.md` (Addons: no core-to-addon dependency).

**Also**

- The agreed design: `docs/process/reviews/feature-scene-timeline/design/`.
- No protected path is edited.

## Invariants

I1. The ruler draws exactly one tick per `clip-timestamps` row, at `min(start, L) / L` of its width, with `L` as §2 defines it. The grid shows the nine frames from `s = clamp(3 × floor(i / 3) − 3, 0, max(0, n − 9))`, or every frame when there are fewer than nine. `i` is the last frame whose start is at or before the point being looked at, or frame 0 before the first.
I2. While a `mediaController` is present, the ruler's playback marker and the accent outline of the playing tile follow the shared media clock, whether or not a browse point is set. A browse point (hover, touch or keyboard) moves the grid and the scene card and never seeks. Only four things seek: a mouse click on the ruler, `Enter` on the ruler with a browse point set, a tile and the scene card. Each seek is followed by play, through `mediaController` or, without one, through `videoRef`. A mouse browse point stays while the pointer is inside the section and is cleared when it leaves.
I3. For a `touch` or `pen` pointer event the ruler never seeks. A tap or a horizontal drag of at least 8 px sets the browse point. A touch handed to vertical scrolling leaves it as it was. The browse point stays until a tile or the scene card is tapped, the playback position jumps (§9), the section collapses or the file changes.
I4. While the ruler has focus, `←`, `→`, `Home`, `End` and `Enter` act on the ruler and never trigger a page shortcut: no file navigation, and no player seek other than the ruler's own `Enter`.
I5. The Info tab draws at most one Scenes section for a video, and only in the states §3 does not hide, and nothing for any other file type. The intelligence manifest has exactly one `scenes` entry and no `visual-index` or `clip-frames` entry. No element inside the section scrolls on either axis, with either pointer. While the section is expanded, its height does not change when the window moves or the browse point changes. The section is never wider than `24rem`.
I6. A native video requests no `clip-timestamps`, `visual-index` or picture before its first expand. Each expand requests `clip-timestamps`, and also `visual-index` unless the policy is off. No response, WS-triggered reload or action result is applied for a `fileId` other than the current one, or after the section has collapsed. WS events reload the section only while it is expanded, and only for the current file.
I7. A `.loft` requests `clip-timestamps` on mount and on every `fileId` change and at no other time, never applies a response for an earlier `fileId`, and takes every picture from the scene-tile route and none from the frame route. It never requests `visual-index` and draws no Visual Index part. A tile that fails draws a blank tile-sized block, with its time label and click-to-seek.
I8. Only the pictures of the current window are requested. While the browse point moves, a window's pictures are requested only after that window has stayed 150 ms.
I9. When the policy is off, when the first `visual-index` request fails, answers 404, or answers `eligible: false` or `available: false`, and for every `.loft`, the section draws no Visual Index part: no dot count, no progress, no marks, no tile dots, no scene card and no actions. The timeline is otherwise unchanged. Otherwise every active-run scene is marked at its `start_time`, styled by its status as §9 says. A tile carries the dot exactly when a `succeeded` scene's `start_time` is within 0.05 s of its frame's `start`. The scene card shows the last succeeded, labelled scene at or before the point being looked at (or the first such scene before all of them), with its `visible_text` and never its `transcript_excerpt`. Activating the card seeks to that scene's `start_time`.
I10. The Visual Index part draws exactly the first matching row of §3's table, and a failed reload leaves the last good state drawn. No action is offered while a staged run is `queued` or `running`, and no retry is offered when N is 0. **Create scenes** and **Regenerate scenes** call `/visual-index/generate`, and **Retry the N failed** calls `/visual-index/retry`. A `waiting_clip` refusal shows `visualIndexWaitingPrerequisite`, and any other failure shows `visualIndexActionError`.

## Revises

SPEC-ADDON-080 I6. The Scenes section of a `.loft` requests `clip-timestamps` on mount and on every `fileId` change, and never applies a response for an earlier `fileId`. It renders nothing until the current file's request returns at least one row, and stays hidden when that request fails. It then shows the collapsed Scenes header. It takes every picture from the scene-tile route and never requests the frame route. For a tile that fails, it shows a blank block of the picture's size with no visible alt text, keeping the tile's time label and click-to-seek. For a native video, the section requests nothing from the intelligence addon before its first expand, and takes its pictures from the frame route, as before.
SPEC-CORE-065 I3. On a touch environment, the shelf, the collection panel, page tabs, inspector tabs and the breadcrumb remain horizontally scrollable, as they were. The intelligence Scenes section scrolls on neither axis.
SPEC-CORE-065 I4. On a mouse environment, no drawn item is clipped by a wrapper: the bounding box of every drawn card, tab and breadcrumb segment lies inside its container's box. A shelf with a "see all" link draws at most two rows. A shelf without one draws every card in wrapped rows. The collection panel keeps every track reachable through its vertical scroll. The intelligence Scenes section draws its tiles inside its own box, with no scroll.

## Checked, no action

- **Returning a staged run's scenes from the backend.** This would let a first run draw
  a mark per scene as it progresses. It was skipped: the header shows `done / selected`,
  and the agreed board was redrawn to match the API.
- **Showing Visual Index progress in the collapsed header.** The old section fetched on
  mount for this. The agreed `Collapsed.dc.html` shows no counts, and the section
  requests nothing until it is expanded. A run started from the section is only ever
  watched while the section is expanded.
- **A chapter band on the ruler.** Chapters live in the core's companion region.
  Bringing them in would need a core slot or prop, and the reader did not ask for it.
- **Option C, a strip under the player.** The reader rejected it, because it needs a new
  core slot.
- **Passing the file's width and height to the slot**, so that the tile ratio is known
  before the first picture loads. That is a core prop change. The 16:9 placeholder
  changes once, at the first load of an expanded section.
- **Keeping `transcript_excerpt`.** The reader chose to drop it. Excerpts are long, often
  cut mid-word, and the Transcript tab has the same text.
- **Remembering the expanded state across files.** Both sections start collapsed today,
  and the reader did not ask to change that.
- **A "back to playback position" control on touch.** Tapping any tile, or any jump of
  the playback position, clears the browse point. A separate control is not in the
  agreed design.
- **An invariant for the time-label steps.** §9 states the rule, and an acceptance test
  checks it against the two boards' label rows. A wrong label is visible at a glance and
  harms nothing.
