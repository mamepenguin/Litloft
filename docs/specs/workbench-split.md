# Workbench panels beside the player

SPEC-ID: SPEC-CORE-126
SPEC-ID: SPEC-CORE-127

Approval:

## Summary

For the household's one user, on the canonical page of a video or `.loft` file, in a wide
workbench form (SPEC-CORE-085). Today the workbench panels (Transcript, Scenes, Detailed
summary, Note) always sit under the player, and the player is capped at 50% (or 30% with
**Enlarge panels**) of the visible height so the panels get the rest. On a landscape
screen the panels are wide and short.

This change adds a second placement, the **split layout**: the player on the left, the
panels on the right, each panel column the full height of the canvas. One icon button in
the workbench row, **Show panels beside the player**, switches it on or off, and the
choice is remembered per browser, like `workbench-panels` and `workbench-player-focus`.
Where the canvas is too narrow for both columns, the button is not drawn and the panels
stay under the player.

- SPEC-CORE-126: the split layout: when it applies, its geometry, and what it leaves
  unchanged.
- SPEC-CORE-127: the **Show panels beside the player** button and its stored value
  `workbench-split`.

The collection playback surface (collection / playlist / folder play) is out of scope and
keeps today's layout. The pane is not generalised for other file types; the Markdown
version-history comparison is a separate knowledge-addon spec.

Design (agreed 2026-11-17): https://claude.ai/artifact/Vd5sanunK6yESim7CcZGag, saved in
`docs/process/reviews/feature-workbench-beside/design/`. The artboards:

- `Main.dc.html`: split layout, two panels, 1440x900, inspector open. It can be operated
  in Play.
- `One.dc.html`: split layout, one panel.
- `Closed.dc.html`: split layout, inspector closed.
- `Below.dc.html`: the panels under the player (today), with the new button off.
- `Narrow.dc.html`: 1280x900, inspector open: too narrow, no button, panels under the
  player.

The design's visible decisions:

- D1. In the split layout the canvas content has two columns with a 1rem gap. The left
  column is 60% of (content width − 1rem) and holds the player at its top, then the row
  1rem under the frame. The right column holds the shown panels.
- D2. The right column's panels start at the canvas content's top and end at its bottom.
  Two panels are one above the other, with a 0.75rem gap and equal heights.
- D3. The row in the left column: the panel toggles, then at the trailing end the new
  button and the preview actions. **Enlarge panels** is not drawn in the split layout.
- D4. The new button is a round icon button with the **Enlarge panels** look (accent
  border and tint when on). It is in the trailing group, before **Enlarge panels** where
  that is drawn. Its glyph is lucide `Columns2` (the artboard's off-centre divider is
  replaced by it; see Questions).
- D5. Under the row in the left column there is empty canvas. Nothing is moved into it.
- D6. At 1280x900 with the inspector open (content 864px) there is no button and the page
  looks as it does today.

## Definitions

- *Framed player*: the file is a video or a `.loft` (`playerFramed` in
  `FileDetailContainer.tsx`, fixed by the file kind). Audio is unframed. There is no
  runtime signal.
- *Workbench form*: as in SPEC-CORE-104 — `beside`, `overlay`, or `stacked` with the
  inspector closed.
- *Shown panels*: the ids of `workbench-panels` whose panel is available on this file
  (SPEC-CORE-085 I2). A shown panel that becomes unavailable without a close (an entry
  answering `false`, a file change) stops being shown.
- *W*: the scroll container's border-box width (`offsetWidth` of the element
  `ShellLayout` receives through `onScrollRootChange`) less 2rem (the host's padding),
  read with a `ResizeObserver` in a layout effect in `ShellLayout`, so it is known before
  the workbench is first painted. The border box includes a classic scrollbar, so W does
  not change when the page starts or stops scrolling, and the split layout never changes
  the scroll container's width: W does not depend on the layout it decides.
- *Canvas content*: the media host's (`.media-detail-host`) content box. With Find
  closed and no scrollbar its width is W.
- *H*: the scroll container's visible height (`--rail-avail`).
- *Split-eligible*: the file is on the canonical page, in a workbench form, with a framed
  player, at least one shown panel, and W measured and at least 61rem. 61rem is where the
  right column, 40% of (W − 1rem), reaches 24rem (`COLUMN_REM`). H, pseudo full screen
  and the mini player are not inputs. The width part is the pure function
  `splitFits(width: number, rootFontSize: number): boolean` in `lib/workbenchSplit.ts`;
  the other conditions are combined in `ShellLayout`.
- *Split layout*: split-eligible and `workbench-split` is exactly the string `"true"`.
- *Normal layout*: every other state of the workbench. Its baseline is this build with
  `workbench-split` absent (the new button is drawn there too).
- *Host content bottom*: the media host's content-box bottom, i.e. the visible bottom
  less the host's 1rem padding.

## Required items

### 1. Normal flow

1. The viewer opens a video on the canonical page, wide window, and turns on a panel
   (Transcript). The panel appears under the player as today. The row now also shows the
   **Show panels beside the player** button (not pressed), when W ≥ 61rem.
2. The viewer presses it. `workbench-split` becomes `"true"`. Without remounting the
   player or the panel, the page changes to the split layout: the player moves to the top
   left at 60% of the columns, the row sits under it, the panel fills the right column.
3. The viewer turns on Note. Transcript and Note are one above the other in the right
   column, equal heights.
4. The viewer closes both panels. With no shown panel the page is not split-eligible, so
   it is laid out as today with no panel (player at its full budget, row under it); the
   button is not drawn. The stored value stays `"true"`.
5. The viewer turns a panel on again. The split layout returns.
6. The viewer opens the inspector on a 1440px window with the sidebar open, or narrows
   the window, so W falls under 61rem. The page leaves the split layout for the normal
   layout, the button is not drawn, and the stored value is unchanged. When W is 61rem or
   more again, the split layout returns.
7. The viewer presses the button again. `workbench-split` becomes `"false"` and the
   normal layout returns.
8. Opening another player file, or reloading, while the stored value is `"true"` and the
   page is split-eligible draws the split layout from the first painted frame that shows
   a panel.
9. In the split layout the viewer enters pseudo full screen. The layout behind it stays
   split; leaving returns to the same geometry. System full screen resizes the viewport,
   so W may cross 61rem while it is up; leaving it at the same window size returns the
   page to the layout and geometry it had before entering.

### 2. Failure cases

- `localStorage` throws (private mode, blocked storage): pressing still flips the value
  in memory for this window, as `workbench-player-focus` does. Reading a throwing storage
  gives off.
- A stored value other than `"true"`: off.
- W not measured yet: not split-eligible; the button is not drawn. The measurement
  happens in a layout effect, before the workbench is first painted (step 8).
- H not measured yet (`useCompanionMetrics` measures after paint; `--rail-avail` and
  `--player-avail` fall back to `100dvh`): the split layout is drawn with the fallback
  budget. I2 and I3 hold once H is measured; I8 concerns only where the panels are.
- H too small for the frame at the left column's width with the row under it: the frame
  shrinks (16:9) until the row's bottom is at the host content bottom (§9); the left
  column keeps its width.

### 3. States

Two stored values: `workbench-split` ∈ {off (absent / not `"true"`), on (`"true"`)}.

Layout of a page: normal or split. Split holds exactly when split-eligible and on.

Inputs that can move the page into or out of split:

- a press of the button;
- the first panel becoming shown or the last shown panel stopping being shown (a toggle,
  a close button, an entry answering `false`, a file change);
- a change of W across 61rem (window width, inspector open/close, sidebar or tree
  open/close, Find opening the inspector);
- a change of form (workbench form ↔ `stacked` with the inspector open, phone);
- a `storage` event for `workbench-split` from another window.

Inputs that never change the layout: a change of H alone, the row re-wrapping, the page
starting or stopping to scroll, the Find bar opening in the canvas without changing W, a
`storage` event for `workbench-player-focus` or `workbench-panels` that leaves the shown
set non-empty, pseudo full screen (entering, its transition, leaving), and the mini
player. System full screen changes the layout only through W (§1 step 9).

No input writes `workbench-split` except a press.

While split: **Enlarge panels** is not drawn and the SPEC-CORE-105 beside-row state is not
entered (`data-row-beside` absent); `workbench-player-focus` is kept and applies again when
the page returns to the normal layout.

### 4. Data read and written

- `localStorage["workbench-split"]`: read on render and on `storage` events; written only
  by a press of the button. Value `"true"` or `"false"`.
- `localStorage["workbench-panels"]`, `localStorage["workbench-player-focus"]`: read as
  today; not written by anything in this change.
- No server data, table, endpoint or event.

### 5. External services

None. The change is frontend layout only.

### 6. Authorization

None beyond today's: the canonical file page's existing access checks decide whether the
page is shown at all. The stored value is a per-browser display preference.

### 7. Effect on existing features

- SPEC-CORE-085 (workbench): panel toggles, the two-panel limit, eviction, tabs in narrow
  forms are unchanged. In the split layout the panels stack in the right column instead
  of sitting under the player, the frame is not capped by H × 50%, and `active` covers a
  panel shown in the right column. Revised below.
- SPEC-CORE-104 (Enlarge panels): not drawn in the split layout; its value is kept and
  has no effect there. Revised below.
- SPEC-CORE-105 (row beside the frame while enlarged): never in the split layout. In the
  normal layout the new button joins its row, so its 13rem budget grows by the button at
  the coarse size and one gap (3.25rem) while the button is drawn, keeping the budget's
  rule of counting the coarse size. The button is drawn only at W ≥ 61rem, where the
  larger budget rejects the beside state only for a frame wider than about W − 16.25rem,
  i.e. at an H above about 1335px; none of SPEC-CORE-105's e2e windows changes state.
  Revised below.
- SPEC-CORE-113 (no page scroll): holds in the split layout too (I3 of this spec); its
  frame caps apply only outside it. Revised below.
- `DESIGN.md`, *Workbench (media file detail)*: the rule "Placement belongs to the space,
  not to a preference" is narrowed (wording in Questions, 1); the token table gains the
  split share and threshold; the *column threshold* and *player cap* rows gain "not in the
  split layout"; the row's contents gain the new button; the beside-row budget gains it.
- SPEC-CORE-082..084 / inspector forms and yields: unchanged. This change never opens or
  closes the inspector, the tree or the sidebar; it only reads the width they leave.
- Pseudo full screen, system full screen and the mini player: unchanged sizes and
  behaviour; the held slot behind a pinned frame keeps the width it had on entering,
  because nothing changes the layout while they are up.
- The collection surface (`FileDetailPresenter`'s own `Workbench`), `stacked` with the
  inspector open, the phone, audio: unchanged; they receive no split input.
- `file-preview-actions` stay at the row's trailing end in both layouts.

### 8. Error behavior

Nothing is shown to the viewer on a failure; a failed storage write falls back to memory
silently. Nothing is logged.

### 9. User-visible behavior

Geometry of the split layout (all within 1px; r = root font size):

- Left column: left edge = the canvas content's left edge; width L = 0.6 × (W − 1r).
- Frame: top-left at the canvas content's top-left. Width L and height L × 9/16 when the
  row then ends at or above the host content bottom. Otherwise the frame is 16:9,
  left-aligned in the column, and sized so the row's bottom is the host content bottom.
- Row: its top is 1r under the frame's bottom; it spans the left column (left edge to
  right edge, L wide) whether or not the frame is height-limited; it wraps inside the
  column.
  Toggles first in `priority` order, then the trailing group: the new button, then the
  preview actions.
- Right column: left edge = the left column's right edge + 1r; right edge = the canvas
  content's right edge. Its first panel's top is the canvas content's top; its last
  panel's bottom is the host content bottom. Two panels: 0.75r apart, equal heights.
  Each panel body scrolls inside itself.

The button:

- Lucide `Columns2`, 16px, in a round button with the **Enlarge panels** look
  (`.workbench-toggle-icon`): 2rem x 2rem at a fine pointer, 2.75rem x 2.75rem at a coarse
  pointer; neutral 1px border off, accent border and accent tint on.
- Accessible name and `title`: `workbench.splitPanels` — ja 「パネルを横に並べる」, en
  "Show panels beside the player", in both states. `aria-pressed` carries the state.
- Order in the trailing group: the new button, then **Enlarge panels** (normal layout
  only), then the preview actions, each 0.5rem apart.
- Default: off. A browser that never pressed it sees today's layout.

Timing: the switch is immediate (no animation).

Docs: `docs/user-guide/viewers-and-players.md`, *Panels under the player*, gains one
bullet on the button and that it needs a wide canvas (closing the inspector makes room).

### 10. Non-functional

- No remount of the `<video>` element, the `.loft` iframe or any panel entry on any input
  of §3; playback position and play state unchanged.
- No container query or containment context around the player or the panels (iOS Safari
  renders a `<video>` / cross-origin iframe inside one rotated; the reason `Workbench`
  measures its own width).
- The player box is not moved into a different parent between layouts, so pseudo full
  screen keeps pinning the same element. The workbench root keeps a box in both layouts
  (no `display: contents` on an element whose width is measured).
- No new network request. One `localStorage` key.

## Touch points

- `frontend/src/components/FileDetail/ShellLayout.tsx` — measures W on the scroll
  container, computes split eligibility, and passes the layout to the canvas and to
  `Workbench` as a `split` prop; passes nothing to the collection surface.
- `frontend/src/components/FileDetail/MediaCanvas.tsx` — the host carries
  `data-workbench-split="on"` exactly in the split layout, and no such attribute
  otherwise. In the split layout `data-workbench="on"` stays and `data-player-focus` is
  absent.
- Placement mechanism (no element changes parent, no `display: contents`, no
  containment): in the split layout the host is laid out as two columns; the player is in
  the left column; the `Workbench` root is in the right column at the host's full content
  height and keeps its box; the row is positioned out of the root into the left column,
  under the frame, the way SPEC-CORE-105 positions it beside the frame; the panel grid
  fills the root. While `split` is true, `Workbench` stacks the panels without consulting
  its 41rem measurement and does not enter the beside-row state.
- `frontend/src/components/FileDetail/mediaHostStyle.ts` and
  `frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts` — the frame's height
  budget in the split layout (row under a left-column frame, ending at the host content
  bottom).
- `frontend/src/components/FileDetail/workbench/Workbench.tsx` — the new button, the
  trailing-group order, no **Enlarge panels** and no beside-row state while split, panels
  stacked while split.
- `frontend/src/lib/workbenchSplit.ts` (new) — `splitFits`, and the `workbench-split`
  store modelled on `lib/workbenchPlayerFocus.ts` (its `storage` listener ignores other
  keys and treats `key === null` as a reload of this key; the server snapshot is off),
  with a reset for tests.
- `frontend/src/test/setup.ts` — resets the new store after each test, as it resets
  `workbench-panels` and `workbench-player-focus`.
- `frontend/src/lib/workbenchBeside.ts` — `isRowBeside(canvasWidth, visibleHeight,
  rootFontSize, splitButton: boolean)`: the budget is 13rem, plus 3.25rem when
  `splitButton`. `Workbench` does not call it in the split layout.
- `frontend/src/lib/layoutSizes.ts` — the 0.6 share and the 61rem threshold (derived from
  `COLUMN_REM`).
- `frontend/src/app/globals.css` — new rules keyed on
  `.media-detail-host[data-workbench-split="on"]`, after the existing workbench rules,
  that override the share cap for the split layout. The existing rules are not edited, so
  `frontend/src/app/__tests__/mediaDetailTheaterCss.test.ts` stays as it is (assertions
  for the new rules may be added). `data-player-focus` is absent while split, so the
  480px floor does not apply; the collection host never carries the attribute.
- `frontend/src/messages-core/ja.json`, `frontend/src/messages-core/en.json` —
  `workbench.splitPanels`.
- `DESIGN.md`, *Workbench (media file detail)* — the placement rule, two token rows, the
  row's contents and the beside-row budget.
- `docs/user-guide/viewers-and-players.md` — one bullet.
- Tests: `frontend/e2e-components/` (layout, real component, desktop project, with the
  coarse-pointer emulation the SPEC-CORE-104/105 tests use) and vitest under
  `frontend/src/` for the store and the pure decisions. Checked in R-5 instead, as the
  fixtures cannot reach them: I6 for the `.loft` iframe, and I1/I2 on an iPad
  (`agent_cannot_verify`: the coarse pointer of the iOS app is the human's check).
- Rules passed through: `.claude/rules/frontend-conventions.md` (DESIGN.md, i18n in
  `messages-core/`), `.claude/rules/design-decisions.md` (no core-to-addon code: panels
  stay generic `player-side` entries; no addon id is named).
- No protected path is edited.

## Invariants

"Split-eligible", "split layout", "shown panels", W, H, "canvas content" and "host
content bottom" are as defined above. I2 and I3 are measured with Find closed and after H
is measured.

I1. The **Show panels beside the player** button is drawn exactly when the page is
split-eligible, once, in the workbench row's trailing element, before **Enlarge panels**
when that is drawn and before the `data-preview-actions` element, each 0.5rem apart. Its
box is 2rem x 2rem at a fine pointer and 2.75rem x 2.75rem at a coarse pointer; when it is
the trailing element's last item, its right edge is the row's right edge. All within 1px.
It is never drawn on the collection surface, in `stacked` with the inspector open, on the
phone, for audio, with no shown panel, or while W < 61rem.

I2. In the split layout, at either pointer: the frame's left and top edges are the canvas
content's left and top edges and it is 16:9; the row's top is 1rem under the frame's
bottom and the row lies within the left column, whose width is 0.6 × (W − 1rem); the frame
is that column's width when the row then ends at or above the host content bottom, and
otherwise the row's bottom is the host content bottom; the right column starts 1rem right
of the left column and ends at the canvas content's right edge; the first panel's top is
the canvas content's top and the last panel's bottom is the host content bottom; two
panels are one above the other, 0.75rem apart, with equal heights. All within 1px.

I3. In the split layout at any H of 320px or more, the scroll container does not scroll,
and each panel body scrolls inside itself when its content is taller.

I4. In the split layout **Enlarge panels** is not drawn, the workbench has no
`data-row-beside` attribute, and the host has `data-workbench-split="on"` and no
`data-player-focus`. Outside it the host has no `data-workbench-split`.

I5. Outside the split layout the page is laid out exactly as it is, in this build, with
`workbench-split` absent: in particular below 61rem, with no shown panel, and with
`workbench-player-focus` `"true"`. The pseudo/system full-screen frame and the
mini-player window are the same size with the value on and off. Entering or leaving
pseudo full screen or the mini player never changes the layout, and leaving pseudo or
system full screen at the same window size leaves the page in the layout and geometry it
had before entering.

I6. No input listed in §3 — a press, the first panel shown or the last one gone, a width
change across 61rem, an inspector toggle, a form change, a `storage` event, an H-only
resize, full screen and the mini player — remounts the `<video>` element, the `.loft`
iframe or any panel entry, or changes the playback position, the play state or
`workbench-panels`.

I7. `workbench-split`: the button's `aria-pressed` is `true` exactly when the stored value
is `"true"`. Its accessible name and `title` are `workbench.splitPanels` in both states.
A press writes the opposite value; every other window of the same browser applies it
through the `storage` event. When storage writes fail, a press still flips the value in
memory. Only a press writes it: closing panels, a width change, a file change, a form
change, opening Find and a reload leave it unchanged.

I8. On opening a player file (first load, after the skeleton, or by selecting another
file) whose page is split-eligible with the stored value `"true"`, no painted frame shows a
panel under the player: the first frame that shows a panel shows it in the right column.

I9. `splitFits(width, rootFontSize)` returns true at a width of exactly 61rem and false at
61rem minus 1px, at root font sizes 16px and 20px. In a real browser a width-only resize
between those widths flips the layout, an H-only resize never does, and opening Find
never does.

## Revises

SPEC-CORE-085 I1. On a player file in a wide form, after the first measurement: the row under the player (beside it in the beside state of SPEC-CORE-105; under the player in the left column in the split layout of SPEC-CORE-126) holds exactly one toggle per panel-list item that has rendered and has not answered `false`, in `priority` order, and no other panel toggle; an addon entry whose component has not rendered yet (its module is still loading, or failed to load) has no toggle, no shown panel and no tab, and once rendered, silence means available; on the canonical page, while a panel is shown in the workbench of a framed player, the row also holds, after the toggles, the **Show panels beside the player** button of SPEC-CORE-127 when the page is split-eligible and the **Enlarge panels** button of SPEC-CORE-104 outside the split layout; the `file-preview-actions` entries are at the row's trailing end, after those buttons, and in the narrow forms they stay in the player box; each toggle's `aria-pressed` is `true` exactly when its id is in `workbench-panels`; the row is not drawn when it has no toggle and no action; on the canonical page, chapters is never a toggle and is never drawn under the player; on the collection surface, chapters is a toggle whenever the file has chapters.
SPEC-CORE-085 I2. In a wide form, the panels drawn are the available ids of `workbench-panels`, in `priority` order: in the split layout of SPEC-CORE-126, one above the other in the right column; otherwise under the row, side by side at a workbench width of 41rem or more and one above the other below that. With none of them available, the area under the row has zero height.
SPEC-CORE-085 I5. On the canonical page, while at least one panel is shown under a framed player in a wide form outside the split layout of SPEC-CORE-126, the 16:9 frame is at most half of the scroll container's visible height, the scroll container does not scroll at any visible height of 320px or more (with Find closed and the row not wrapped to no room), and each shown panel ends within the visible area. In the split layout the frame follows SPEC-CORE-126 I2 and the page does not scroll (SPEC-CORE-126 I3). On the collection surface, the panels together are 60% of the visible height (at least 18rem), the player is not capped, and for a video the order down the page is the player, the row, the panels, the information, then the queue. On either surface, each panel's body scrolls inside itself.
SPEC-CORE-085 I8. An entry's `active` is `true` exactly while it is shown in the workbench (under the player, or in the right column of the split layout of SPEC-CORE-126), or while its tab is the selected tab of an open desktop inspector or a raised phone sheet. An entry given no `active` prop behaves as it does today.
SPEC-CORE-104 I1. The **Enlarge panels** button is drawn exactly when the file is on the canonical page, in a workbench form, with a framed player and at least one panel shown under it, and the page is not in the split layout of SPEC-CORE-126. Then there is exactly one on the page, in the workbench row, after the "Panels" group and after the **Show panels beside the player** button when that is drawn, and before the `data-preview-actions` element, inside neither. It is never drawn on the collection surface, in `stacked` with the inspector open, on the phone, for an unframed player, with no panel shown, or in the split layout.
SPEC-CORE-104 I2. On the canonical page in a workbench form outside the split layout of SPEC-CORE-126, while at least one panel is shown under a framed player and neither full screen nor the mini player is up, the 16:9 frame's height is 50% of the scroll container's visible height when the stored value is not exactly `"true"`. When it is `"true"`, the frame's height is the larger of 30% of the visible height and 270px (the height of a frame 480px wide, the player's `COMPACT_MAX_WIDTH`, below which its controls go compact), and never more than 50% of the visible height. Each within 2px, unless the canvas width limits the frame first.
SPEC-CORE-104 I3. Outside the split layout of SPEC-CORE-126, with the stored value on, the frame at the 30% cap, and the frame at the 50% cap limited by height rather than by the canvas width, each shown panel ends within the visible area, the scroll container does not scroll at any visible height of 320px or more (with Find closed and the row not wrapped to no room), and each panel body is taller than it is with the value off at the same window size. In the split layout the stored value has no effect on the panels.
SPEC-CORE-104 I6. Only a press of the button writes `workbench-player-focus`. Closing every panel, a file change, a form change, entering or leaving the split layout of SPEC-CORE-126, opening Find and a reload leave it unchanged. With every panel closed the button is not drawn, and the framed player's height is capped at `--player-avail` (SPEC-CORE-113 I3); turning a panel on again applies the stored value, unless the page is then in the split layout.
SPEC-CORE-105 I5. Outside the beside state the workbench root has no `data-row-beside` attribute. Outside the beside state and outside the split layout of SPEC-CORE-126, where a row is drawn (a value-on page with side space under the threshold of I9, a value-off page with a panel, before H is measured), the frame is centred in the canvas content (left and right gaps equal within 1px) and the row's top is 1rem under the frame's bottom (within 1px), as in SPEC-CORE-104. In the split layout the frame and the row follow SPEC-CORE-126 I2.
SPEC-CORE-105 I8. The panels are side by side exactly when the workbench width is at least 41rem and the page is not in the split layout of SPEC-CORE-126, in both placements.
SPEC-CORE-105 I9. The threshold of the beside state is 13rem (208px), plus 3.25rem (the **Show panels beside the player** button of SPEC-CORE-127 at the coarse size and one 0.5rem gap) while that button is drawn, at either pointer. Once H is measured, the beside state holds exactly when §3's conditions hold with that threshold and the page is not in the split layout of SPEC-CORE-126. The pure function returns beside at a side space of exactly the threshold and not at the threshold minus 1px; in a real browser a width-only resize in the floor case flips the state between those two widths, and a height-only resize flips it when the side space moves at least 8px across the threshold. The state is never beside with `workbench-player-focus` other than `"true"`, and never in the split layout. The SPEC-CORE-104 e2e case for the share cap (1590x1122) stays in the beside state, asserting what it asserted.
SPEC-CORE-113 I4. With a panel shown outside the split layout of SPEC-CORE-126 and the stored value off, the frame's height is at most half of H. With the stored value on, the frame's height is the larger of min(270px, 50% of H, `--player-avail`) and min(30% of H, `--player-avail`). In the split layout the frame follows SPEC-CORE-126 I2.

## Questions for the human

The body is written with the recommended answer to each question. Approving this file
accepts those answers; a different answer is written into the body before approval.

1. **`DESIGN.md`: the placement rule.** Today: "Placement belongs to the space, not to a
   preference ... The reader chooses which panels are on and whether the player or the
   panels get the larger share, never where they are." Proposed: "**Placement belongs to
   the space, with one choice.** The wide forms use the workbench, and the stacked
   inspector and the phone use tabs. The reader chooses which panels are on, whether the
   player or the panels get the larger share, and — where the canvas holds two columns
   (61rem) — whether the panels sit under the player or beside it. Nothing else about
   placement is a preference: the row follows the frame." Token rows added: *split
   threshold* `61rem` (the right column reaches `24rem`), *split share* `60%` of the
   columns for the player.
2. **The icon.** Recommended: lucide `Columns2` (centred divider), the project's icon set;
   the artboard's off-centre divider was a hand-drawn glyph and is updated to match.
   Alternative: keep the hand-drawn 60/40 glyph as inline SVG.
3. **The row when the frame is height-limited.** Recommended: the row keeps the left
   column's full width (L), so the toggles and the trailing group stay where they are as
   the window gets shorter. Alternative: the row narrows to the frame's width.

## Checked, no action

- **A draggable divider between the columns.** The human chose a fixed 60/40 to start;
  a resizable split is a later spec if the fixed share proves wrong.
- **Two panels side by side inside the right column.** Rejected by the human: a 40%
  column split in two is too narrow for Japanese text.
- **Showing only one panel in the split layout.** Rejected: it would diverge from the
  two-panel rule of SPEC-CORE-085.
- **Closing the tree or the inspector automatically to make room.** Rejected: closing
  something the viewer opened, as a side effect of a layout button, is surprising. The
  button is simply not drawn below 61rem; the user guide says closing the inspector makes
  room.
- **Drawing the button disabled below 61rem.** Rejected: a disabled control with no way
  to tell why. The stored value survives, so the layout returns by itself.
- **Using the empty space under the row (D5).** Nothing is moved there: the description
  stays in Info (SPEC-CORE-088) and moving the inspector's content would be a separate
  design.
- **Enlarge panels meaning a different width share in the split layout.** Rejected: in
  the split layout the panels already take the full height, so the button has nothing to
  enlarge.
- **Pseudo full screen and the mini player as inputs to the layout.** Rejected, following
  SPEC-CORE-105 I7: flipping the layout under a pinned frame would move the held slot, and
  the mini player (which appears when the player scrolls out of view) could feed back into
  the layout. System full screen is not special-cased: it resizes the viewport and so
  reaches the layout through W, as it reaches SPEC-CORE-105's state.
- **Freezing W during system full screen.** Not done: SPEC-CORE-105 accepts the same
  change while it is up and only promises the state after leaving; this spec matches it.
- **A pointer-dependent beside-row budget.** Not done: the existing budget always counts
  the coarse size, and a runtime pointer change (an iPad gaining a trackpad) would become
  another input.
- **The collection playback surface.** Out of scope by the human's decision: its page
  scrolls, with the information and the queue under the panels, and needs its own design.
- **Audio.** Not split-eligible, as it is not eligible for Enlarge panels: the audio
  controls have no 16:9 frame to size.
- **A generic pane layout shared with Markdown.** Decided against on 2026-11-17: the
  in-canvas splits of the player and of the knowledge editor share no constraints worth a
  common component; the Markdown version comparison is a knowledge-addon spec.
- **Naming.** "Beside" is already taken by the inspector form and by SPEC-CORE-105's row
  state, and `WORKBENCH_COLUMNS_MIN_REM` already means "panels side by side". This spec
  uses "split" (`workbench-split`, `data-workbench-split`) to avoid both.
- **Keyboard shortcut.** None; the other workbench buttons have none.
