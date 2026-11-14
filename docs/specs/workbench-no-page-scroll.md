# Workbench: no page scroll on the canonical page

SPEC-ID: SPEC-CORE-106

Approval:

## Summary

For the household's one user, on the canonical page of a file with a framed player, in a
wide workbench form (SPEC-CORE-085). On a short window, roughly a visible height under
840px (iPad mini in landscape, a PC browser window that is not maximised), the page
scrolls, and the toggle row ends up below the fold, in two states:

- **Panels shown.** SPEC-CORE-085 step 7 sets a floor of 18rem for the panel region
  (`Workbench.tsx`, the grid's `minHeight`), so the page scrolls when the room is smaller.
- **No panel shown.** The player is sized to the whole visible height less a 48px peek
  (`--player-avail`), so the row, which is the only thing under the player, is below the
  fold.

Fullscreen covers watching the video across the whole screen (iPad: a fixed frame inside
the browser window; PC: `requestFullscreen`), so the in-page layout can give up that room.
This change removes the scroll in both states.

What changes:

- With panels shown: the 18rem floor is removed. The panel region takes the room the frame
  and the row leave. The 50% cap on the frame stays.
- With no panel shown: the framed player's budget is reduced by the measured height of the
  row, so the frame, the row and the spacing around them fit in the visible area. The row
  stays directly under the frame.
- Unchanged: pseudo and system full screen, the mini player, the collection surface, the
  stacked inspector, the phone, audio.

## Required items

### 1. Normal flow

1. The reader is on the canonical page, in a workbench form (SPEC-CORE-085), with a framed
   player and a visible height H (`railAvailable`).
2. **Panels shown** (at least one panel is shown under the player):
   - the frame's cap is half of H, as SPEC-CORE-085 step 8 says (unchanged);
   - the panel region starts under the row and ends at the bottom of H, with no minimum
     height;
   - each panel body scrolls inside itself (`.media-detail-workbench-body`, which already
     has `overflow: auto`).
3. **No panel shown, toggles drawn** (the row is drawn, nothing is under it):
   - the frame's cap is `--player-avail`, with the row's block subtracted (§3);
   - the frame's width is `--player-avail × 16/9`, so its height is `--player-avail` (the
     existing `max-width` rule, unchanged);
   - the row sits directly under the frame (SPEC-CORE-085 step 3).
4. Turning a panel on or off changes the frame's size. No element is remounted.

### 2. Failure cases

- **Very short window** (H below 320px): the frame and the row cannot both be usable. The
  page may scroll; not promised (§Checked, no action).
- **Row wraps** (more toggles than fit on one line): the row's measured height grows, so
  the frame gets smaller. The row never scrolls sideways (SPEC-CORE-085 step 3). If the
  wrapped row leaves no room for the frame, the frame is 0px high and the page may scroll
  (Question 4).
- **Find open:** the find bar sits above the player and takes its own height. The rule is
  measured with Find closed; with Find open the page may scroll by the find bar's height,
  as today.
- **Full screen or mini player:** the frame leaves the flow and the cap does not apply
  (SPEC-CORE-085 step 8, unchanged).
- **No toggles and no actions:** the row is not drawn, its height is 0, and the cap is as
  it is today (no row block).

### 3. States

The no-panel budget is computed in `useCompanionMetrics.ts`, as `--player-avail`:

    --player-avail = H - playerOffset - rowBlock - peek

- `playerOffset`: the existing measurement, the distance from the top of the scroll
  container's visible area to the top of the player wrapper.
- `rowBlock`: the measured `offsetHeight` of the workbench row, plus `2rem` (the host's
  `mt-4` above the workbench and its `p-4` bottom padding). It is 0 when the row is not
  drawn.
- `peek`: `PLAYER_PEEK_PX` (48px) as today, **only if Question 2 keeps it**. This spec
  recommends removing it; the implementation follows the human's answer.

Before the row is first measured, `rowBlock` is 0, so on the first frame the frame may be
taller than the visible area. This is accepted, as SPEC-CORE-105 accepts it for its own
first frame.

`rowBlock` is measured by a `ResizeObserver` on the row element. The row element is passed
from `Workbench` to the hook through a ref, so `useCompanionMetrics` observes it in the same
way it observes the player wrapper today. Where `ResizeObserver` is missing, the existing
fallback applies (the value is measured once on mount).

Other states:

- **Panel shown:** `--player-avail` does not apply; the cap is `--workbench-player-share`
  (50%) on the framed player, unchanged.
- **Enlarge panels on (SPEC-CORE-104):** unchanged, since the button needs a panel shown.
  Its `min-width` floor is inside the `[data-workbench="on"]` rule (`globals.css`), so it
  does not apply with no panel shown.
- **Beside state (SPEC-CORE-105):** unchanged, since it needs a panel shown.

### 4. Data read and written

None. The stored panel list and the enlarge value are read as today; nothing is written.

### 5. External services

None.

### 6. Authorization

None. Layout only.

### 7. Effect on existing features

- SPEC-CORE-085 step 7 (the 18rem floor) and step 9 (no panel shown: the player is the size
  it is today): revised in `## Revises`.
- SPEC-CORE-085 I5, its second bullet (the scroll allowed when the room is under 18rem):
  revised.
- SPEC-CORE-104 I3 (the 18rem room condition): revised.
- SPEC-CORE-104 I6 ("with every panel closed the player is at its uncapped size"): revised.
  The player is capped by `--player-avail` in that state.
- SPEC-CORE-105: unchanged.
- The collection surface (SPEC-CORE-090): unchanged. Its panels are 60% of H and it scrolls
  by design.
- No remount: only classes, styles and custom properties change.

### 8. Error behavior

None shown, nothing logged.

### 9. User-visible behavior

- With panels shown on a short window, the panels get less height and the page does not
  scroll. The 50% frame cap is unchanged.
- With no panel shown on a short window, the player is smaller than today, so the toggle
  row is visible under it without scrolling. On a tall window the frame is the same as
  today (limited by the canvas width, or by the 16:9 height the budget allows).
- The 48px title peek under the frame disappears in this state, unless Question 2 keeps it.

### 10. Non-functional

- The layout is measured in a real browser (`docs/process/PROJECT.md`, "Review in this
  project"). A jsdom test cannot check boxes.
- The budget is recomputed when H, `playerOffset` or the row's height changes, through the
  existing observers. No timer.

## Touch points

- `frontend/src/lib/layoutSizes.ts`: `WORKBENCH_MIN_REM` is deleted. Its only users are
  `Workbench.tsx`'s import and `minHeight`.
- `frontend/src/components/FileDetail/workbench/Workbench.tsx`: the grid's `minHeight` is
  removed; the row element gets a ref, exposed to the parent.
- `frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts`: `rowBlock` is measured
  and subtracted from `--player-avail`. `PLAYER_PEEK_PX` is removed or kept per Question 2.
- `frontend/src/components/FileDetail/ShellLayout.tsx`: passes the row ref from the
  workbench to the metrics hook.
- `frontend/src/components/FileDetail/MediaCanvas.tsx` and `mediaHostStyle.ts`: no change
  expected (`--player-avail` is already written there).
- `frontend/src/app/globals.css`: no change expected. The `max-width` on `--player-avail`
  (line 897) already caps the frame's height. If implementation shows a height rule is
  needed, it is added here and listed in §Revises.
- Tests: any test that asserts the 18rem floor (grep `WORKBENCH_MIN_REM` and `18rem`), and
  `frontend/e2e-components/` and `frontend/e2e-layout/` for the new layout measurements.
- Documentation: none. No viewer-visible key, gesture or endpoint changes. A layout change
  of this kind is not a user-guide item (`CLAUDE.md`).

## Invariants

"Wide canonical page" means SPEC-CORE-085's wide canonical form with a framed player.

I1. With at least one panel shown, the scroll container does not scroll at any visible
height of 320px or more, and every shown panel's bottom edge is at or above the bottom of
the visible area, within 1px.

I2. With no panel shown and the row drawn, the scroll container does not scroll at any
visible height of 320px or more, and the row's bottom edge is at or above the bottom of the
visible area, within 1px.

I3. With no panel shown and the row drawn, the frame's bottom edge is 1rem (within 1px)
above the row's top edge, and the frame's height is at most `--player-avail`.

I4. With a panel shown, the frame's height is at most half of H, and the panel region has no
minimum height.

I5. A panel's body scrolls inside itself, and the panel region never extends below the
visible area.

I6. Toggling a panel on or off changes only classes, attributes, styles and custom
properties of the player and the workbench. It does not remount the `<video>` element, the
`.loft` iframe or any panel, and does not change the playback position or play state.

## Revises

SPEC-CORE-085 I5. On the canonical page, while at least one panel is shown under a framed
player in a wide form, the 16:9 frame is at most half of the scroll container's visible
height, each shown panel ends within the visible area, and the scroll container does not
scroll. On the collection surface, the panels together are 60% of the visible height (at
least 18rem), the player is not capped, and for a video the order down the page is the
player, the row, the panels, the information, then the queue. On either surface, each
panel's body scrolls inside itself.

SPEC-CORE-104 I3. With the stored value on, the frame at the 30% cap, and the frame at the
50% cap limited by height rather than by the canvas width, each shown panel ends within the
visible area, the scroll container does not scroll, and each panel body is taller than it
is with the value off at the same window size.

SPEC-CORE-104 I6. Only a press of the button writes `workbench-player-focus`. Closing every
panel, a file change, a form change, opening Find and a reload leave it unchanged. With every
panel closed the button is not drawn, and the framed player's height is capped at
`--player-avail` (SPEC-CORE-106 I3); turning a panel on again applies the stored value.

SPEC-CORE-085 step 7 and step 9 (in Normal flow): replaced by §1 of this spec. The panel
region has no minimum height; with no panel shown, the player's cap is `--player-avail`
with the row's block subtracted, not the size it had before.

## Checked, no action

- **Enlarge panels' 270px floor (SPEC-CORE-104):** unchanged. It is a height for the frame
  with a panel shown, and it does not depend on the room under the row.
- **Pseudo and system full screen, mini player:** not capped by this spec.
- **Collection surface:** its panels take 60% of H and it scrolls by design
  (SPEC-CORE-085 I5, collection bullet).
- **Stacked inspector and phone:** no row, no panel under the player. Not this change.
- **Visible heights under 320px:** the page may scroll. I1 and I2 start at 320px.
- **Find open:** measured with Find closed. With Find open the page may scroll by the find
  bar's height, as today.
- **Wrapped row taller than the room:** accepted as in §2, and raised as Question 4.
- **Row measured on the first frame:** `rowBlock` is 0 until measured (§3), as SPEC-CORE-105
  accepts for its own first frame.

## Questions for the human

1. **Player size with no panel shown (recommended: accept).** To keep the row on screen the
   player is smaller than today on short windows. Without this change the page scrolls in
   this state.
2. **The 48px peek (recommended: remove).** The peek shows the title under the frame. The
   row now occupies that place. Keeping it would push the row 48px below the fold.
3. **Design difference (recommended: accept Q1 and record it).** The agreed design
   (`docs/process/reviews/feature-player-workbench/design/`, mock
   https://claude.ai/artifact/SMLPhPJSRZzLYhe21a4sJS) draws the player at its full size with
   no panel shown (D5). Q1 changes that. The design-check records it as a `D-` finding to
   accept or reject.
4. **Wrapped row with no room (recommended: accept the scroll).** When the toggle row wraps
   to three or more lines on a short window, no frame height is left and the page may
   scroll. The alternative is to hide the row's wrap, which removes toggles from view.
