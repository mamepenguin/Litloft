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
   - the workbench row is drawn to the right of the frame, starting 1rem right of it, as
     one line whose bottom is the frame's bottom: the panel toggles at its left, the
     trailing group (the Enlarge panels button, then the `file-preview-actions` entries)
     at its right. The toggles stay right above the panels they switch. When they do not
     fit on one line they wrap upward: the first toggles in `priority` order stay on the
     bottom line, later ones go above it, and the trailing group stays at the right end
     of the bottom line. The space above the row, beside the frame, is left empty;
   - the panels start 0.75rem under the frame and end at the bottom of the visible area
     as before (SPEC-CORE-085 step 7).
3. Turning Enlarge panels off, closing every panel, or leaving the workbench forms
   returns the layout of SPEC-CORE-104 (the row under a centred frame).

How it is built: no element changes parent and no grid is introduced. The host keeps its
column layout. In the beside state the workbench root's top margin becomes 0.75rem and it
is the containing block of the row; the row is taken out of the flow and placed with its
bottom 0.75rem above the workbench root's top (so on the frame's actual bottom, whatever
the frame's content), its left edge at the frame's width plus 1rem and its right edge at
the root's right edge. Its height is its content's, so wrapping grows it upward. The only
value copied from the frame is its width W (§3), used horizontally; no height is copied
and the frame element is never measured.

### 2. Failure cases

- Side space under 15rem: no beside state; the row stays under a centred frame, as in
  SPEC-CORE-104.
- The row's content is taller than the frame (three or more wrapped lines, which needs
  more toggles than core has or wide addon content): the row extends above the frame's
  top into the host's padding and, with Find open, can cover the find bar. Accepted as
  rare; the panels are not moved.
- The frame's content is not 16:9 (a `.loft` error box or link card): the row's bottom
  is still the frame's actual bottom; nothing else changes.
- While pseudo or system full screen is up the frame leaves the flow, the workbench moves
  up and the row with it, under the full-screen frame. Nothing is promised about that
  hidden geometry; I7 promises what returns when it ends.
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

The pure function must compute exactly this, and it equals the frame's drawn width within
1px (C is a whole-pixel `clientWidth`). In the beside state W <= C - 16rem, so the C terms
never bind there and W reduces to max(w0.3, min(480px, w0.5)); the CSS for the row's left
offset copies that reduced form, and the e2e covers the two cases that can win in the
beside state: the 480px floor (w0.3 < 480px <= w0.5) and the 30% share (w0.3 > 480px).

The 15rem threshold is chosen so that on one line fit: the longest core toggle label in
either locale ("Detailed summary", about 130px), the Enlarge panels button and the 0.5rem
gaps, with room for one short preview action (the quote action). Wider addon content
wraps.

The decision is recomputed when C or H changes, and when the value, the shown panels or
the form change. The root font size is read when the decision is computed; a change to it
alone is not observed. There is no hysteresis: exactly 15rem in both directions.

Pseudo full screen (including its enter and exit transition, `data-fullscreen-moving`)
and the mini player take the frame out of the flow without changing C or H, so they
never change the state. System full screen
resizes the viewport, so the state may change while it is up; after leaving it at the
same window size, the state and the geometry are what they were before.

### 4. Data read and written

Reads `workbench-player-focus` and `workbench-panels` as today. Writes nothing.

### 5. External services

None: the change is client-side layout and makes no request.

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
  mini-player anchor are the same elements at the same size as with the row under the
  frame, moved to the canvas's left edge with the frame; the beside state does not
  depend on them.
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
  frame's `margin-inline` at the start; the workbench root's 0.75rem top margin and
  `position: relative`; the row's absolute placement (bottom 0.75rem above the root,
  left at W + 1rem with W's reduced form, right 0) and internal layout (toggles at the
  left wrapping upward with `wrap-reverse`, trailing group at the right end of the bottom
  line). No z-index is added: the row is not over the frame and pinned frames and the
  mini player are already above it. The existing cap, floor and pseudo-full-screen rules
  are not edited, and `mediaDetailTheaterCss.test.ts` is not changed. The copied W is
  held to the frame by the e2e geometry (I1 at the floor case and the share case).
- `frontend/src/lib/layoutSizes.ts`: the 15rem threshold.
- Tests: `frontend/e2e-components/player-workbench-desktop.spec.ts` (real-browser
  geometry with a fine and a coarse pointer, at the floor case and the share case, the
  threshold by a width-only and a height-only resize, pseudo full screen in and out); the
  SPEC-CORE-104 cases there that measure the row under the frame with the value on are
  moved to a size below the threshold, unchanged in what they assert. Vitest for the pure
  function and for the attribute's condition. `.loft` placement is checked in R-5 (the
  fixture has no `.loft` player).
- Agreed design: `docs/process/reviews/feature-enlarged-row-beside/design/` (artifact
  https://claude.ai/artifact/8nJ43QKhmF5tE2YB7aLxP6), board `BottomRow.dc.html`
  ("A2"). `Current.dc.html` is today's layout for comparison; `Main.dc.html` (toggles at
  the top) and `CenterStack.dc.html` (frame centred, toggles stacked) are the rejected
  variants. Checkable decisions: the frame at the canvas's left edge; one row beside it
  whose bottom is the frame's bottom; toggles at its left, the Enlarge panels button at
  its right; the space above the row empty; the panels 0.75rem under the frame, full
  width.
- `DESIGN.md` Workbench section: the beside placement while enlarged; the 15rem threshold
  in the thresholds table; the "Placement belongs to the space" principle extended to say
  the row follows the frame (the panels' placement is still not a preference).
- Rules passed through: `.claude/rules/frontend-conventions.md` (DESIGN.md, values in
  code).
- No protected path. No backend, addon or Internal API change.

## Invariants

"The beside state" is defined in §3.

I1. In the beside state, at a fine pointer with the toggles on one line: the frame's left
edge is the canvas content's left edge; the row's left edge is the frame's right edge
plus 1rem and its right edge the canvas content's right edge; the toggles' bottom and the
trailing group's bottom are the frame's bottom; the first toggle's left edge is the row's
left edge and the trailing group's right edge the row's right edge. All within 1px. When
the toggles wrap, the bottom line holds the first toggles in `priority` order and the
trailing group at its right end, and its bottom is still the frame's bottom.

I2. In the beside state, the first shown panel's top is 0.75rem (within 1px) under the
frame's bottom, and the panels span the canvas content width. With the core toggles and
at most one short preview action, no row content intersects the frame or extends past
the canvas content's right edge, at either pointer.

I3. In the beside state the frame's width and height are those of SPEC-CORE-104's cap
(revised I2) at the same window size, including sizes where C or the 50% width is under
480px: the frame is not resized by the beside state.

I4. In the beside state with Find closed and the room under the row at least 18rem, each
shown panel ends within the visible area and the scroll container does not scroll.

I5. Outside the beside state (a value-on page with side space under 15rem, a value-off
page, a page with no panel, the `overlay` form, before H is measured, and every form or
surface without the button) the workbench root has no `data-row-beside` attribute, the
frame is centred in the canvas content (left and right gaps equal within 1px), and the
row's top is 1rem under the frame's bottom (within 1px), as in SPEC-CORE-104.

I6. Entering or leaving the beside state (a press, closing the last panel, a width-only or
height-only resize across the threshold, a `storage` event) does not remount the
`<video>` element, the `.loft` iframe or any panel entry, and does not change the
playback position or play state.

I7. Pseudo full screen (its transition included) and the mini player never change the
state.
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

- **Toggles at the top of the space beside the frame (design A).** Rejected by the owner:
  the toggles switch the panels and belong right above them.
- **Frame centred with the toggles stacked vertically to its right (design B).** Rejected
  by the owner after comparison: the frame's left edge would not line up with the panels,
  five toggles at the coarse size do not fit in 270px, and "Detailed summary" does not
  fit a 125px column.
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
  the reader controls. Where classic scrollbars exist and only one of the two placements
  makes the page scroll, the scrollbar's width can hold either state for a few pixels
  around the threshold; accepted, and I9 is tested at heights where neither placement
  scrolls.
- **Copying the frame's height to place the row.** Rejected: a framed `.loft` that is not
  16:9 and a pinned frame (0px tall in the flow) would misplace it. The row is anchored to
  the workbench, which follows the frame's actual bottom.
- **A stacking rule for the row.** Not needed: the row is not over the frame, and pinned
  frames (z-50) and the mini player (z-40) are positioned above it already.
- **Moving the row beside the player with the value off.** Out of scope: at 50% the frame
  is wide and the side space is usually small.
- **SPEC-CORE-085 I2 and I5, SPEC-CORE-104 I1, I3 and I8.** They speak of the row's
  contents and the room under the row; the row is still above the panels, so they hold
  as written.
