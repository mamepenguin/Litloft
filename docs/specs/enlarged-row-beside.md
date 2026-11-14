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

1. The reader is on the canonical page in a workbench form (`beside`, `overlay`, or
   `stacked` with the inspector closed) with at least one panel shown under a framed
   player, and turns Enlarge panels on (SPEC-CORE-104).
2. If the space beside the frame is wide enough (§3), the frame moves to the canvas's
   left edge and the row moves to its right: the panel toggles at the top of that space,
   wrapping as needed, and the trailing group (the Enlarge panels button and the
   `file-preview-actions` entries) at its bottom-right, its bottom aligned with the
   frame's bottom.
3. The panels start 0.75rem under the frame, span the canvas width, and end at the bottom
   of the visible area as before (SPEC-CORE-085 step 7).
4. Turning Enlarge panels off, closing every panel, or leaving the workbench forms puts
   the row back under a centred frame, as today.

### 2. Failure cases

- The space beside the frame is too narrow: the row stays under the frame, as in
  SPEC-CORE-104. Nothing is shown to the reader.
- The canvas width is not yet measured on the first paint: the row is under the frame
  until the measurement arrives.

### 3. States

| Condition | Row | Frame |
|---|---|---|
| SPEC-CORE-104's button applies, value on, side space at least 15rem | beside the frame | at the canvas's left edge |
| Value on, side space under 15rem | under the frame (today) | centred (today) |
| Value off, no panel shown, or any form or surface where SPEC-CORE-104's button is not drawn | today's layout | today's layout |

Side space = the canvas's content width minus the frame's width minus a 1rem gap.
Transitions follow the value, the shown panels, the form and the canvas width (a window
resize or the inspector opening moves between the first two rows).

### 4. Data read and written

Reads `workbench-player-focus` and `workbench-panels` as today. Writes nothing new.

### 5. External services

None.

### 6. Authorization

None. Layout only.

### 7. Effect on existing features

- SPEC-CORE-104: the cap (revised I2), the floor, the button's behaviour and the stored
  value are unchanged. Only where the row sits while the value is on changes.
- SPEC-CORE-085: the panels' height rule is unchanged; the row is beside the player
  instead of under it in the state above (I1 and I2 are revised below).
- Panel columns (41rem rule) keep measuring the width the panels get, which is the
  canvas width in both placements.
- Pseudo full screen, system full screen and the mini player: unaffected; the pinned
  frame and the slot it leaves behind are the same as with the value off.
- The collection surface, the stacked inspector with the inspector open and the phone:
  unchanged; SPEC-CORE-104's button is not drawn there.
- Remounts: the change is layout only. No element moves to a different parent; the
  `<video>`, the `.loft` iframe and the panel entries are never remounted.

### 8. Error behavior

None shown, nothing logged.

### 9. User-visible behavior

- In the beside state, at 1376x878 with the inspector beside: the 480x270 frame at the
  left, the toggles and the button in the 464px to its right, the panels starting 0.75rem
  under the frame. The panel body is about 48px taller than with the row under the frame
  (the 1rem margin, the 2rem row and the 0.75rem gap become one 0.75rem gap).
- The toggles keep their look and order. The trailing group keeps the button before the
  preview actions, 0.5rem apart.
- Crossing the 15rem threshold switches at once, without animation.
- No text, label or setting is added.

### 10. Non-functional

No remount, no new request, no new dependency. The placement is measured in script, not
with a container query (a containment context around a `<video>` or a cross-origin
iframe renders the subtree rotated on iOS Safari, as `Workbench.tsx` already notes).

## Touch points

- `frontend/src/components/FileDetail/workbench/Workbench.tsx`: the beside placement.
  The row and the panel grid stay in the same parents; the root's layout lets the row
  share the first grid row with the player. The 41rem column measurement moves to an
  element that has a box in both placements (the panel grid, or the root measured
  without the row).
- `frontend/src/components/FileDetail/MediaCanvas.tsx` and `ShellLayout.tsx`: a host
  attribute for the beside state (for example `data-row-beside`), set from the value,
  the shown panels and the measured side space.
- `frontend/src/app/globals.css`: the beside rules (host as a two-column grid, the frame
  at the start, the row cell, the 0.75rem gap). The existing cap, floor and
  pseudo-full-screen rules are not edited.
- `frontend/src/lib/layoutSizes.ts`: the 15rem threshold.
- Tests: `frontend/e2e-components/player-workbench-desktop.spec.ts` (real-browser
  placement and heights), and vitest cases under
  `frontend/src/components/FileDetail/__tests__/` for the attribute and no remount.
- `DESIGN.md` Workbench section: the beside placement while enlarged.
- Rules passed through: `.claude/rules/frontend-conventions.md` (DESIGN.md, values in
  code), and the existing "no container query around a player" note.
- No protected path. No backend, addon or Internal API change.

## Invariants

"The beside state" is: SPEC-CORE-104's button is drawn, `workbench-player-focus` is
`"true"`, and the side space (canvas content width minus frame width minus 1rem) is at
least 15rem.

I1. In the beside state, the frame's left edge is the canvas content's left edge, the
whole workbench row is to the right of the frame (its left edge at least 1rem right of
the frame's right edge) and within the frame's top and bottom, and the trailing group's
bottom is the frame's bottom (within 1px) and its right edge the canvas content's right
edge (within 1px).

I2. In the beside state, the first shown panel's top is 0.75rem (within 1px) under the
frame's bottom, and the panels span the canvas content width.

I3. In the beside state with the room under the frame at least 18rem, each shown panel
ends within the visible area, the scroll container does not scroll, and each panel body
is taller than in the same window with the side space forced under 15rem (row under the
frame).

I4. The frame's size is the same in the beside state as with the row under the frame at
the same window size and value (SPEC-CORE-104 revised I2 holds in both).

I5. Outside the beside state, the layout is exactly as before this change: the row under
a centred frame when the value is on with too little side space, and today's layout when
the value is off, no panel is shown, or the button is not drawn.

I6. Entering or leaving the beside state (pressing the button, closing the last panel,
a resize across the threshold) does not remount the `<video>` element, the `.loft` iframe
or any panel entry, and does not change the playback position or play state.

I7. The panels are side by side exactly when the width they get is at least 41rem, in
both placements.

I8. The pseudo and system full-screen frames and the mini-player window are the same
size and position in the beside state as with the value off.

## Revises

SPEC-CORE-085 I1. On a player file in a wide form, after the first measurement: the row under the player (beside it in the beside state of SPEC-CORE-105) holds exactly one toggle per panel-list item that has rendered and has not answered `false`, in `priority` order, and no other panel toggle; an addon entry whose component has not rendered yet (its module is still loading, or failed to load) has no toggle, no shown panel and no tab, and once rendered, silence means available; on the canonical page, while a panel is shown under a framed player, the row also holds the **Enlarge panels** button of SPEC-CORE-104 after the toggles; the `file-preview-actions` entries are at the row's trailing end, after that button, and in the narrow forms they stay in the player box; each toggle's `aria-pressed` is `true` exactly when its id is in `workbench-panels`; the row is not drawn when it has no toggle and no action; on the canonical page, chapters is never a toggle and is never drawn under the player; on the collection surface, chapters is a toggle whenever the file has chapters.
SPEC-CORE-085 I2. In a wide form, the panels drawn under the player and the row are the available ids of `workbench-panels`, in `priority` order: side by side at a panel width of 41rem or more, one above the other below that. With none of them available, the area under the player and the row has zero height.

## Checked, no action

- **Hiding the row while enlarged and moving the button into the panel header.**
  Rejected by the owner: switching panels would need turning Enlarge panels off first.
- **Using the freed height to grow the frame.** Rejected by the owner; the panels get it.
- **Keeping the layout.** Rejected by the owner.
- **Moving the row beside the player with the value off.** Out of scope: at 50% the frame
  is wide and the side space is usually small.
- **A container query for the threshold.** Rejected for the iOS Safari rendering bug
  already noted in `Workbench.tsx`.
- **SPEC-CORE-104 I1/I8.** They name the button's place in the row and relative to the
  preview actions; they still hold with the row beside the player, so they are not
  revised.
