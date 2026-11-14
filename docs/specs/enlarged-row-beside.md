# Enlarge panels: the row moves beside the player

SPEC-ID: SPEC-CORE-105

Approval:

## Summary

SPEC-CORE-104 added **Enlarge panels**: while it is on, the framed player on the canonical
page is capped at the larger of 30% of the visible height and 270px, and the panels take
the rest. The layout around the smaller frame was inherited from the 50% state: the frame
is centred, and under it come a 1rem margin, the 2rem workbench row and a 0.75rem gap
before the panels. At 1376x878 the frame is 480px wide on a 960px canvas, so 240px on each
side of it is empty, and about 60px between the frame and the panels holds only the row.

While Enlarge panels is on, this change moves the row into the empty space to the
player's right and starts the panels right under the frame. The frame keeps its size; the
height the row and its margins took goes to the panels. The owner chose this over hiding
the row (switching panels would need turning Enlarge panels off first) and over growing
the frame.

## Required items

### 1. Normal flow

1. The reader is on the canonical page in the `beside` form or in `stacked` with the
   inspector closed, with at least one panel shown under a framed player, and turns
   Enlarge panels on (SPEC-CORE-104).
2. If the side space is at least 15rem (§3), the beside state applies:
   - the frame moves from the centre to the canvas content's left edge, at the same size;
   - the workbench row is drawn to the right of the frame, starting 1rem right of it. Its
     box is as tall as the frame and its top is the frame's top. The panel toggles sit at
     the top-left of that box and wrap within its width; the trailing group (the Enlarge
     panels button, then the `file-preview-actions` entries) sits at its bottom-right;
   - the panels start 0.75rem under that box and end at the bottom of the visible area
     as before (SPEC-CORE-085 step 7).
3. Turning Enlarge panels off, closing every panel, or leaving the workbench forms
   returns the layout of SPEC-CORE-104 (the row under a centred frame).

How it is built: no element changes parent and no grid is introduced. The host keeps its
column layout; in the beside state the row gets a left margin of the frame's width plus
1rem, a minimum height of the frame's height, and a negative top margin that lifts it
beside the frame (cancelling both the frame's height and the host's 1rem gap before the
workbench). Inside the row the toggles wrap at the top and the trailing group always
takes its own line at the bottom, right-aligned and wrapping if it must. The frame's
width and height come from the same expression that sizes the frame (§3), copied into
the beside rules, not from measuring the frame element, so a frame that leaves the flow
(pseudo full screen, the move animation, the mini player) does not move the row or the
panels. The row is painted below pinned frames and the mini player, and never over the
frame.

### 2. Failure cases

- Side space under 15rem: no beside state; the row stays under a centred frame, as in
  SPEC-CORE-104.
- The row's content is taller than the frame (many toggles wrapping, 2.75rem toggles
  under `pointer: coarse`, addon toggles arriving late): the row's box grows to its
  content; the panels start 0.75rem under the row's bottom instead of the frame's. The
  layout stays beside; nothing overlaps.
- Before the visible height is first measured (`railAvailable` is `null` on mount), the
  state is not beside. Opening a file with the value on may therefore draw the row under
  the frame for the first frames and then move it beside; an addon panel that becomes
  available later does the same. This is accepted. A resize may show one frame of the
  previous placement.

### 3. States

The beside state holds exactly when all of these hold:
- SPEC-CORE-104's button is drawn, in the `beside` form or `stacked` with the inspector
  closed (not `overlay`, where the open inspector covers the canvas's right side; player
  files do not reach that form today): canonical page, framed player, at least one panel
  shown;
- `workbench-player-focus` is `"true"`;
- the side space is at least 15rem.

Side space = C - W - 1rem, where C is the workbench root's measured width (the canvas
content width; `Workbench` already measures it for the 41rem rule), H is `railAvailable`
(the scroll container's visible height), wX = H x X x 16/9, and W is the frame's used
width under the existing CSS (`width: 100%`, `max-width` at the share, the SPEC-CORE-104
floor as `min-width`):

    W = max( min(C, w0.3), min(C, 480px, w0.5) )

The pure function must compute exactly this, and it must equal the frame's drawn width.

The decision is recomputed when C or H changes, and when the value, the shown panels or
the form change. The root font size is read when the decision is computed; a change to it
alone is not observed. There is no hysteresis: exactly 15rem in both directions.

Pseudo full screen, the move animation and the mini player take the frame out of the
flow without changing C or H, so they never change the state. System full screen
resizes the viewport, so the state may change while it is up; after leaving it at the
same window size, the state and the geometry are what they were before.

### 4. Data read and written

Reads `workbench-player-focus` and `workbench-panels` as today. Writes nothing.

### 5. External services

None.

### 6. Authorization

None. Layout only.

### 7. Effect on existing features

- SPEC-CORE-104: the cap, the floor, the button and the stored value are unchanged. Its
  I1 and I8 (the button in the row, after the toggles, before the preview actions, at
  the row's right edge) still hold with the row beside the frame.
- SPEC-CORE-085: the row is still above the panels and the panels still end at the
  bottom of the visible area, so "the room under the row" (085 I5, 104 I3) keeps its
  meaning. Only "the row under the player" (085 I1) changes (Revises).
- The 41rem panel-column rule: unchanged. The workbench root keeps its full width in both
  placements; only the row inside it is narrowed.
- Pseudo full screen, system full screen and the mini player: the frame's slot and the
  mini-player anchor are the same elements, in the same place, at the same size as with
  the value on and the row under the frame; the beside state does not depend on them.
- The collection surface, `stacked` with the inspector open, the phone, audio: no button,
  so never the beside state.
- No remount: no element changes parent; only classes, attributes and styles change.

### 8. Error behavior

None shown, nothing logged.

### 9. User-visible behavior

- At 1376x878 with the inspector beside and a fine pointer: the 480x270 frame at the left
  of the 960px canvas, the toggles and the button in the 464px to its right, the panels
  starting 0.75rem under the frame. The panel body is about 48px taller than with the row
  under the frame (with a coarse pointer, about 60px).
- The toggles and the trailing group keep their look and order.
- No text, label or setting is added.
- `docs/user-guide/viewers-and-players.md`: no edit. It says the toggles are in "a row
  there" under the player and that Enlarge panels is in that row; the row is still the
  same row, and where it sits is layout, which the docs rule leaves out of the guide.

### 10. Non-functional

No remount, no new request, no new dependency. No container query (a containment context
around a `<video>` or a cross-origin iframe renders the subtree rotated on iOS Safari, as
`Workbench.tsx` notes).

## Touch points

- New pure function in `frontend/src/lib/` (for example `workbenchBeside.ts`): W and the
  beside decision from C, H, the root font size and the SPEC-CORE-104 constants (§3).
- `frontend/src/components/FileDetail/workbench/Workbench.tsx`: the `playerFocus` prop
  gains the visible height H (`railAvailable`) and whether the form allows the beside
  state; the existing width measurement supplies C; `Workbench` sets
  `data-row-beside="on"` on its root in the beside state. The collection surface passes
  no `playerFocus`, so it never sets it.
- `frontend/src/components/FileDetail/ShellLayout.tsx`: passes H and the form condition
  (`beside`, or `stacked` with the inspector closed; not `overlay`) in `playerFocus`.
  `MediaCanvas.tsx` is not changed.
- `frontend/src/app/globals.css`: rules under
  `.media-detail-host:has(> .media-detail-workbench[data-row-beside="on"])` only: the
  frame's `margin-inline` at the start; the row's left margin, `min-height`, negative top
  margin, internal layout (toggles top-left wrapping, trailing group on its own bottom
  line, right-aligned, wrapping), and stacking below pinned frames and the mini player.
  W's expression is copied into these rules; the existing cap, floor and
  pseudo-full-screen rules are not edited, and `mediaDetailTheaterCss.test.ts` is not
  changed. The copy is held to the frame by the e2e geometry (I1 at sizes where each term
  of W wins).
- `frontend/src/lib/layoutSizes.ts`: the 15rem threshold.
- Tests: `frontend/e2e-components/player-workbench-desktop.spec.ts` (real-browser
  geometry with a fine and a coarse pointer, at sizes where each term of W wins, the
  threshold by a width-only and a height-only resize, pseudo full screen in and out); the
  SPEC-CORE-104 cases there that measure the row under the frame with the value on are
  moved to a size below the threshold, unchanged in what they assert. Vitest for the pure
  function and for the attribute's condition. `.loft` placement is checked in R-5 (the
  fixture has no `.loft` player).
- `DESIGN.md` Workbench section: the beside placement while enlarged; the 15rem threshold
  in the thresholds table; the "Placement belongs to the space" principle extended to say
  the row follows the frame (the panels' placement is still not a preference).
- Rules passed through: `.claude/rules/frontend-conventions.md` (DESIGN.md, values in
  code).
- No protected path. No backend, addon or Internal API change.

## Invariants

"The beside state" is defined in §3.

I1. In the beside state, at a fine pointer with the row's content no taller than the
frame: the frame's left edge is the canvas content's left edge (within 1px); the row's
left edge is the frame's right edge plus 1rem and its right edge the canvas content's
right edge (within 1px); the row's top is the frame's top and its bottom the frame's
bottom (within 1px); the first toggle's top-left is the row's top-left (within 1px); the
trailing group's bottom-right is the row's bottom-right (within 1px).

I2. In the beside state, the first shown panel's top is 0.75rem (within 1px) under the
lower of the frame's bottom and the row's bottom, and the panels span the canvas content
width. No row content intersects the frame or extends past the canvas content's right
edge, at either pointer.

I3. In the beside state the frame's width and height are those of SPEC-CORE-104's cap
(revised I2) at the same window size, including sizes where C or the 50% width is under
480px: the frame is not resized by the beside state.

I4. In the beside state with Find closed and the room under the row at least 18rem, each
shown panel ends within the visible area and the scroll container does not scroll.

I5. Outside the beside state the layout is exactly as before this change: a value-on page
with side space under 15rem, a value-off page, a page with no panel, the `overlay` form,
and every form or surface without the button match SPEC-CORE-104.

I6. Entering or leaving the beside state (a press, closing the last panel, a width-only or
height-only resize across the threshold, a `storage` event) does not remount the
`<video>` element, the `.loft` iframe or any panel entry, and does not change the
playback position or play state.

I7. Pseudo full screen, the move animation and the mini player never change the state.
Leaving pseudo or system full screen at the same window size leaves the page in the state
and geometry it had before entering. The full-screen frame and the mini-player window are
the same size and position as with the row under the frame.

I8. The panels are side by side exactly when the workbench width is at least 41rem, in
both placements.

I9. Once H is measured, the beside state holds exactly when §3's conditions hold: with the
other conditions met, a side space of exactly 15rem is beside and 15rem minus 1px is not,
whether reached by a width-only or a height-only resize; the state is never beside with
`workbench-player-focus` other than `"true"`.

## Revises

SPEC-CORE-085 I1. On a player file in a wide form, after the first measurement: the row under the player (beside it in the beside state of SPEC-CORE-105) holds exactly one toggle per panel-list item that has rendered and has not answered `false`, in `priority` order, and no other panel toggle; an addon entry whose component has not rendered yet (its module is still loading, or failed to load) has no toggle, no shown panel and no tab, and once rendered, silence means available; on the canonical page, while a panel is shown under a framed player, the row also holds the **Enlarge panels** button of SPEC-CORE-104 after the toggles; the `file-preview-actions` entries are at the row's trailing end, after that button, and in the narrow forms they stay in the player box; each toggle's `aria-pressed` is `true` exactly when its id is in `workbench-panels`; the row is not drawn when it has no toggle and no action; on the canonical page, chapters is never a toggle and is never drawn under the player; on the collection surface, chapters is a toggle whenever the file has chapters.

## Checked, no action

- **Hiding the row while enlarged and moving the button into the panel header.**
  Rejected by the owner: switching panels would need turning Enlarge panels off first.
- **Using the freed height to grow the frame.** Rejected by the owner; the panels get it.
- **Keeping the layout.** Rejected by the owner.
- **A two-column CSS grid host.** Rejected: the frame's percentage widths become cyclic in
  an intrinsically sized column (a `<video>` without metadata or an iframe sizes it at
  300px), the pseudo-full-screen slot and the mini-player anchor resolve against that
  column, and the 41rem measurement would lose its box.
- **Measuring the frame element.** Rejected: a pinned frame is as wide as the viewport and
  the mini window is 320px, so the placement would flip whenever a frame is pinned.
- **The `overlay` form.** Excluded from the beside state: the open inspector covers the
  canvas's right side there, where the row would go. Player files do not reach that form
  today (R-5 of SPEC-CORE-104).
- **A no-flash first paint.** Not promised: the visible height is measured after paint
  by the shared `useCompanionMetrics`, and changing that hook for every file page is out
  of scope.
- **Falling back to the row under the frame when the row's content is taller than the
  frame.** Not done: the row grows and the panels follow it; this is rare (many toggles,
  or 2.75rem toggles wrapping) and keeps the frame where it is.
- **Hysteresis around 15rem.** Not added; the threshold depends on a window resize, which
  the reader controls.
- **Moving the row beside the player with the value off.** Out of scope: at 50% the frame
  is wide and the side space is usually small.
- **SPEC-CORE-085 I2 and I5, SPEC-CORE-104 I1, I3 and I8.** They speak of the row's
  contents and the room under the row; the row is still above the panels, so they hold
  as written.
