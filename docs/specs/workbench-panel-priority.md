# Workbench: give the panels priority over the player

SPEC-ID: SPEC-CORE-104

Approval:

## Summary

While a panel is shown under a framed player on the canonical file page, the player is
capped at half of the scroll container's visible height (SPEC-CORE-085 step 8,
`WORKBENCH_PLAYER_SHARE = 0.5`). That fits watching with a panel beside it. It does not fit
reading one: on a landscape screen the panel body is only 250-320px tall, about 10-14
lines, however large the screen is. The reader's main task decides which of the two should
be large, and today they cannot say which.

This change adds one icon button, **Enlarge panels**, to the trailing end of the workbench
row. While it is pressed, the player's cap drops from 50% to 30% of the visible height and
the panels take the rest. The choice is remembered per browser, like `workbench-panels`.

Measured with the e2e-components fixture (`#inspector-video`, one panel, inspector open
beside), panel body width x height, and the 16:9 frame:

| Viewport (estimated visible area) | 50%: frame | 50%: body | 30%: frame | 30%: body |
|---|---|---|---|---|
| iPad 11" landscape 1210x764 | 636x358 | 794x248 | 382x215 | 794x369 |
| iPad 11" More Space landscape 1376x878 | 738x415 | 960x283 | 443x249 | 960x449 |
| iPad 13" landscape 1376x962 | 812x457 | 960x325 | 487x274 | 960x508 |
| iPad 13" More Space landscape 1590x1122 | 955x537 | 1174x405 | 573x322 | 1174x620 |
| MacBook Air 13" browser 1470x830 | 695x391 | 1054x259 | 417x235 | 1054x415 |
| 1920x1080 browser 1920x950 | 802x451 | 1504x319 | 481x271 | 1504x499 |

The shortage is height, not width, and it is the same on every landscape screen. At 30%
the body grows about 1.6x and the frame stays larger than the mini player's 320x180.

Background: since the workbench keeps the player inside the visible area, the scroll
container hardly scrolls on the canonical page, so the mini player (which needs the player
scrolled out of view) effectively never appears there. The layout itself now does the mini
player's job. This change keeps that property: at 30% the player is still on screen.

## Required items

### 1. Normal flow

1. The reader opens a video or `.loft` file on the canonical page in a form that draws the
   workbench row (`beside`, `overlay`, or `stacked` with the inspector closed; called "a
   workbench form" below) and turns on at least one panel. The player is capped at 50%,
   as today.
2. The row under the player shows the **Enlarge panels** button at its trailing end,
   before the `file-preview-actions` entries.
3. The reader presses it. The stored value becomes on. The player's 16:9 frame is capped
   at 30% of the scroll container's visible height; the panels start under the row and
   end at the bottom of the visible area, as SPEC-CORE-085 step 7 already states, so they
   take the height the player gave up.
4. The reader presses it again. The stored value becomes off and the cap returns to 50%.
5. The value is kept across file changes, reloads and other windows of the same browser.

### 2. Failure cases

- localStorage cannot be read or written (private mode, quota): the value lives in memory
  for the session, as `workbench-panels` does. Nothing is shown to the reader.
- The stored value is missing or is not the string `"true"`: it is off.

### 3. States

Stored value: **off** (default) or **on**. Only the exact string `"true"` is on; a
missing, empty or any other value is off. Transitions: off -> on and on -> off, only by
pressing the button, or by a `storage` event from another window. Nothing else writes
`workbench-player-focus`: not a file change, a form change, opening Find, closing panels,
a reload, or an unreadable value.

Applied cap, per page:

| Condition | Cap |
|---|---|
| Canonical page, workbench form, framed player, at least one panel shown, value off | 50% |
| Same, value on | 30% |
| No panel shown, unframed player (audio), stacked with the inspector open, phone, collection surface | as today, unaffected by the value |

The button is drawn in the first two rows. Pseudo full screen, system full screen and the
mini player are not a separate state for this change: the button stays in the row under
them, and the value applies to the page underneath at once, as any re-layout does today.
The full-screen frame and the mini-player window themselves are not capped, as today.
Whether the mini player appears still follows `useMiniPlayer` (the player wrapper leaving
the scroll container's view); a press that changes the page's geometry may change that,
and that is accepted.

### 4. Data read and written

- localStorage key `workbench-player-focus`: read and written, per browser. Value `"true"`
  or `"false"`.
- `workbench-panels`: read only (to know whether a panel is shown). Never written by this
  change.
- No server, database, file or cache.

### 5. External services

None. The change is client-side layout.

### 6. Authorization

None. A per-browser display preference; it exposes no data.

### 7. Effect on existing features

- SPEC-CORE-085: the canonical cap gains a second value; the row gains one control that is
  not a panel toggle (I1 is revised below). The "at most half" bound of I5 still holds.
- SPEC-CORE-090 (collection surface): unchanged. Its player is not capped and its panels
  are 60% of the visible height; no button is drawn there.
- SPEC-CORE-083 (stacked): with the inspector open, unchanged: no row, no button. With
  the inspector closed the row and panels are under the player (SPEC-CORE-083 I4 as
  revised by SPEC-CORE-085), so the button and the value apply there like any workbench
  form.
- The mini player: its window is not capped (SPEC-CORE-085 step 8). On the canonical page
  it rarely appears, because the workbench keeps the player in view; at 30% the player is
  still in view.
- `--workbench-player-share` in `globals.css` already exists and is set from
  `mediaHostStyle`; it now carries 0.3 or 0.5.
- The Scenes panel sizes its rows from its host's height (SPEC-ADDON-093 follow-up), so it
  shows more rows while the value is on. No change in the addon.

### 8. Error behavior

Nothing is shown on any failure, and nothing is logged. A storage failure degrades to an
in-memory value, as above.

### 9. User-visible behavior

- An icon-only button (lucide `PanelTopClose`) at the trailing end of the workbench row,
  before the `file-preview-actions` entries, drawn only while it applies (§3).
- Accessible name and tooltip (`title`): ja **パネルを広げる**, en **Enlarge panels**. The
  name does not change with the state; `aria-pressed` carries the state.
- Styled like the panel toggles (`.workbench-toggle`, border, `is-on` accent while
  pressed), keeping their full radius, so it is a circle: 2rem x 2rem, 2.75rem x 2.75rem
  under `pointer: coarse`, no horizontal padding, the 16px icon centred.
- It sits at the row's right end together with the preview actions: the button and the
  `data-preview-actions` element share one trailing element that carries the auto margin.
  With no visible preview action the button's right edge is the row's right edge;
  otherwise it is directly left of the first preview action, `0.5rem` apart. When the
  row wraps, the button and the actions wrap together.
- Pressing it moves the row (and the button) up or down by the change in the player's
  height, about 150-190px on the measured iPads. This is expected.
- The design of record is the ASCII layout the human chose plus this section
  (`docs/process/reviews/feature-workbench-panel-priority/design/agreed-layout.md`).
- While on: the frame is capped at 30% of the visible height; the panels are taller.
- The switch applies at once. No animation is added.
- Default off: a reader who never presses it sees today's layout.
- `docs/user-guide/viewers-and-players.md` (Panels under the player) says the button
  exists and what it does, replacing "a video keeps at most half of the page's height".

### 10. Non-functional

- Pressing the button must not remount the `<video>` element or the `.loft` iframe, and
  must not change playback position or play state.
- No new network request.
- No new dependency.

## Touch points

- `frontend/src/lib/layoutSizes.ts`: a 30% constant beside `WORKBENCH_PLAYER_SHARE`.
- New `frontend/src/lib/workbenchPlayerFocus.ts`: the `workbench-player-focus` store
  (same shape as `lib/workbenchPanels.ts`: `useSyncExternalStore`, storage event, memory
  fallback, a reset for tests).
- `frontend/src/components/FileDetail/mediaHostStyle.ts`: takes the share as an optional
  parameter, defaulting to `WORKBENCH_PLAYER_SHARE` (0.5). It does not read the store.
  Its other callers, `FileDetailPresenter.tsx` (collection surface) and
  `FileDetailCanvas.tsx`, pass nothing and are not edited.
- `frontend/src/components/FileDetail/ShellLayout.tsx`: the one subscription to the
  store. It passes the share to `MediaCanvas` as a prop and the button's state to
  `Workbench` only when the player is framed.
- `frontend/src/components/FileDetail/MediaCanvas.tsx`: takes the share as a prop and
  passes it to `mediaHostStyle`. The keys and structure around `MediaPlayerBlock` and the
  panel sections do not change.
- `frontend/src/components/FileDetail/workbench/Workbench.tsx`: a new optional prop
  (`playerFocus: { pressed: boolean; onToggle: () => void }`). When it is given and at
  least one panel is shown, the button is drawn in a new trailing element of the row,
  after the `role="group"` "Panels" element. The `data-preview-actions` element moves
  into that trailing element, after the button, and keeps its attribute and
  `empty:hidden`. The button is inside neither the group nor `data-preview-actions`. The
  row's drawing condition (a toggle or an action) does not change, so the button never
  makes a row on its own. The collection surface passes no `playerFocus`. `FileDetailShell.tsx`'s
  measurement of `[data-preview-actions]` is therefore unchanged.
- `frontend/src/app/globals.css`: the trailing element's rule (auto margin, flex, the
  row's gap), and the circular icon variant of `.workbench-toggle`.
- `frontend/src/messages-core/{ja,en}.json`: `workbench.enlargePanels`.
- `frontend/src/test/setup.ts`: reset the new store.
- Tests: `frontend/src/app/__tests__/mediaDetailTheaterCss.test.ts` stays as it is (the
  CSS rule and its `0.5` fallback do not change);
  `frontend/e2e-components/player-workbench-desktop.spec.ts` measures in a real browser
  the cap, the panel height, the `<video>` node and playback across a press, and the
  button's position and 2rem box with and without a preview action. The key is set
  through `addInitScript`, as that spec already does for `workbench-panels`.
  `fixtures/inspectorResponsive.tsx` gains a `file-preview-actions` stub entry
  (controlled by a query parameter) for the position cases. The `.loft` iframe part of
  I4 is checked in vitest (`components/FileDetail/__tests__/`, same iframe node across a
  press), since the fixture has no `.loft` player. The 2.75rem box under
  `pointer: coarse` is checked as a CSS rule in a vitest CSS test, like
  `mediaDetailTheaterCss.test.ts`.
- Docs: `docs/user-guide/viewers-and-players.md`; `DESIGN.md` Workbench section: the
  player cap row, "The row is the panels' switch" (the button joins the row), and
  "Placement belongs to the space, not to a preference" (reworded: the reader chooses
  which panels are on and whether the player or the panels get the larger share, never
  where they are).
- Agreed design: `docs/process/reviews/feature-workbench-panel-priority/design/`.
- Rules passed through: `.claude/rules/frontend-conventions.md` (DESIGN.md, values in
  code, i18n in `messages-core/`), and the memory-recorded rule "no emoji in UI; icons are
  lucide".
- No protected path. No backend, database, addon or Internal API change.

## Invariants

"A workbench form" is `beside`, `overlay`, or `stacked` with the inspector closed.

I1. The **Enlarge panels** button is drawn exactly when the file is on the canonical page,
in a workbench form, with a framed player and at least one panel shown under it. Then there
is exactly one on the page, in the workbench row, after the "Panels" group and before the
`data-preview-actions` element, inside neither. It is never drawn on the collection
surface, in `stacked` with the inspector open, on the phone, for an unframed player, or
with no panel shown.

I2. On the canonical page in a workbench form, while at least one panel is shown under a
framed player and neither full screen nor the mini player is up, the 16:9 frame's height
is 30% of the scroll container's visible height when the stored value is `"true"`, and
50% otherwise, each within 2px, unless the canvas width limits the frame first. Only the
exact string `"true"` is on.

I3. With the stored value on, the room under the row at least 18rem at the 30% cap, and the
frame at the 50% cap limited by height rather than by the canvas width, each shown panel
ends within the visible area, the scroll container does not scroll, and each panel body is taller than it is with the value off at the same window size.

I4. Pressing the button does not remount the `<video>` element or the `.loft` iframe,
does not change the playback position or play state, and does not change
`workbench-panels`.

I5. The button's `aria-pressed` is `true` exactly when `workbench-player-focus` is
`"true"`. Its accessible name and its `title` are both `workbench.enlargePanels`
(ja パネルを広げる, en Enlarge panels) in both states. Pressing it writes the opposite
value, and every other window of the same browser applies it, `aria-pressed` and the cap
both, through the `storage` event. When storage writes fail, pressing it still flips the
value in memory.

I6. Only a press of the button writes `workbench-player-focus`. Closing every panel, a file
change, a form change, opening Find and a reload leave it unchanged. With every panel
closed the button is not drawn and the player is at its uncapped size; turning a panel on
again applies the stored value.

I7. With the stored value `"true"`, the collection surface, `stacked` with the inspector
open, the phone and an unframed player are laid out exactly as they are with the value
absent, and the pseudo or system full-screen frame and the mini-player window are the same
size as with the value absent.

I8. The button is in the workbench row's trailing element, with the preview actions. With
no visible preview action its right edge is the row's right edge (within 1px); otherwise
it ends `0.5rem` left of the first preview action. Its box is 2rem x 2rem with a fine
pointer.

## Revises

SPEC-CORE-085 I1. On a player file in a wide form, after the first measurement: the row under the player holds exactly one toggle per panel-list item that has rendered and has not answered `false`, in `priority` order, and no other panel toggle; an addon entry whose component has not rendered yet (its module is still loading, or failed to load) has no toggle, no shown panel and no tab, and once rendered, silence means available; on the canonical page, while a panel is shown under a framed player, the row also holds the **Enlarge panels** button of SPEC-CORE-104 after the toggles; the `file-preview-actions` entries are at the row's trailing end, after that button, and in the narrow forms they stay in the player box; each toggle's `aria-pressed` is `true` exactly when its id is in `workbench-panels`; the row is not drawn when it has no toggle and no action; on the canonical page, chapters is never a toggle and is never drawn under the player; on the collection surface, chapters is a toggle whenever the file has chapters.

## Checked, no action

- **A draggable divider between the player and the panels.** Rejected: on iPad the drag
  competes with the panel's own scroll, and the positions people use cluster at two.
- **Choosing the share automatically from the window's aspect ratio.** Rejected: it
  guesses the reader's intent and shrinks the video when they want to watch.
- **Letting the canonical page scroll again so the mini player returns.** Rejected: the
  320x180 window covers the bottom-right of the text being read, and it reverses the
  agreed decision that panels fit the visible area.
- **25% instead of 30%.** The human chose 30%: at 25% the frame is about the mini
  player's size.
- **The button in each panel header.** Rejected by the human: with two panels the same
  page-wide control appears twice.
- **Remembering per file, or resetting on each open.** The human chose per browser.
- **The collection surface.** Its player is not capped and its panels already take 60%;
  the problem measured here does not occur there.
- **Holding the share until full screen or the mini player ends.** Not done: it needs
  their state wired into the canvas, and the page underneath already re-lays out on any
  resize today.
- **A keyboard shortcut.** None added; the button is reachable with Tab.
- **Removing the mini player from the canonical page.** Out of scope; it is a separate
  change. This spec only records that it effectively does not appear there.
- **Applying the stored value before hydration (as `preferenceInitScript` does for the
  theme).** Not needed: the cap applies only while a panel is shown, and
  `workbench-panels` is itself read after hydration, so both values are read in the same
  pass.
- **Panel body width.** Unchanged; it was already sufficient (960px with the inspector
  beside on iPad 11" More Space).
