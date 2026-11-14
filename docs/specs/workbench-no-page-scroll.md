# Workbench: no page scroll on the canonical page

SPEC-ID: SPEC-CORE-106

Approval:

## Summary

This change is for the household's one user, on the canonical page of a file with a framed
player, on a wide window in a workbench form (SPEC-CORE-085).

Today the page scrolls in two states, both on short windows (roughly a visible height
under 840px, such as iPad mini in landscape, or a PC browser window that is not maximised):

- **Panels shown.** SPEC-CORE-085 step 7 sets a floor of 18rem for the panel region and
  lets the page scroll when the room under the row is smaller. The toggle row ends up
  below the fold.
- **No panel shown.** The player is sized to the visible height less a 48px peek, so the
  toggle row, which is the only thing under the player, sits below the fold.

The owner chose to remove the scroll in the panels-shown state, because fullscreen covers
the case of watching the video across the whole screen. This spec extends that to the
no-panel state, so the page does not scroll on the canonical page in either state.

What changes, one line each:

- With panels shown, the 18rem floor is removed. The panel region takes the room the frame
  and the row leave, and each panel body scrolls inside itself. The 50% cap on the frame
  stays.
- With no panel shown, the framed player is capped so that the frame, the row and the
  spacing around them fit in the visible area. The row stays directly under the frame.
- Pseudo full screen, system full screen, the mini player, the collection surface, the
  stacked inspector and the phone are unchanged.

## Required items

### 1. Normal flow

1. The reader is on the canonical page, in a workbench form (SPEC-CORE-085), with a framed
   player and a visible height H (`railAvailable`, as today).
2. **Panels shown** (at least one panel is shown under the player):
   - the frame is capped as in SPEC-CORE-085 step 8 (at most half of H), as today;
   - the panel region starts under the row and ends at the bottom of H;
   - the panel region has no minimum height. When the room is small, the panels get less
     height and their bodies scroll inside themselves.
3. **No panel shown** (the row is drawn with its toggles, and nothing is under it):
   - the frame's height is capped at the room the row leaves: H, minus the frame's offset
     from the top of the scroll container, minus the row block (see §3);
   - the frame's width follows from that height at 16:9, as the existing `max-width` rule
     does, and the frame is never wider than the canvas;
   - the row sits directly under the frame, as in SPEC-CORE-085 step 3.
4. Turning a panel on or off moves between 2 and 3. The frame changes size with it; no
   element is remounted.

### 2. Failure cases

- **Very short window** (H below 320px): the frame and the row cannot both fit at a usable
  size. The page may then scroll; this is accepted and not promised (see §Checked, no
  action).
- **Row wraps** (more toggles than fit on one line at the canvas width): the row's height
  grows, and the row block grows with it, so the frame gets smaller. The row never scrolls
  sideways (SPEC-CORE-085 step 3).
- **Find open:** the find bar sits above the player in the scroll container and takes its
  own height. The rule above is measured with Find closed.
- **Full screen or mini player:** the frame leaves the flow. The cap does not apply, as
  SPEC-CORE-085 step 8 already says.

### 3. States

The cap in each state uses one budget, `playerBudget`:

    playerBudget = H - playerOffset - rowBlock

- `playerOffset`: the distance from the top of the scroll container's visible area to the
  top of the framed player's wrapper, measured in the same way as today.
- `rowBlock`: the row's measured height when it is drawn, plus the host's `1rem` top margin
  above the row and its `1rem` bottom padding. Before the row is measured, `rowBlock` is
  `2rem + 1rem + 1rem` (`2.75rem` with a coarse pointer), so the value is known on the
  first frame.

States:

- **No panel shown:** the frame's height cap is `playerBudget`. The 48px peek is not
  subtracted. (See the question in §Checked, no action.)
- **Panel shown:** the frame's height cap is the existing SPEC-CORE-085 step 8 cap, half of
  H. `playerBudget` does not apply.
- **Enlarge panels on (SPEC-CORE-104):** no change, since it needs a panel shown.
- **Beside state (SPEC-CORE-105):** no change, since it needs a panel shown.

### 4. Data read and written

None. Reads the stored panel list and the enlarge value as today; writes nothing.

### 5. External services

None.

### 6. Authorization

None. Layout only.

### 7. Effect on existing features

- SPEC-CORE-085 step 7 and I5 (the 18rem floor and the scroll it allows): revised below.
- SPEC-CORE-085 step 9 (no panel shown: the player is the size it is today): revised. The
  player is now smaller than today when no panel is shown, and the peek is removed from
  its budget.
- SPEC-CORE-104 I3 (the 18rem room condition): revised below.
- SPEC-CORE-105 (the beside state): unchanged. It applies only with a panel shown.
- The collection surface (SPEC-CORE-090): unchanged. Its panels are 60% of H and its
  player is not capped; this spec does not touch it.
- Stacked inspector, phone, audio: unchanged.
- No remount: only classes and styles change.

### 8. Error behavior

None shown, nothing logged.

### 9. User-visible behavior

- With panels shown, the panels get less height on a short window, and the page does not
  scroll.
- With no panel shown, the player is smaller than today on a short window, so that the
  toggle row is visible under it without scrolling. On a tall window the frame is the same
  as today, limited by the width or by the 16:9 height the budget allows.
- On a wide window, nothing visible changes with a panel shown, except that the 18rem
  floor no longer forces the page to scroll.

### 10. Non-functional

- The layout is measured in a real browser. A jsdom test cannot check boxes
  (`docs/process/PROJECT.md`, "Review in this project"), so the boxes are measured in
  `frontend/e2e-layout/`.
- The state is recomputed when H, the row's height, the canvas width or the panel state
  changes. It needs no timer.

## Touch points

- `frontend/src/lib/layoutSizes.ts`: `WORKBENCH_MIN_REM` is removed, or no longer used.
- `frontend/src/components/FileDetail/workbench/Workbench.tsx`: the `minHeight` on the
  panel grid.
- `frontend/src/components/FileDetail/MediaCanvas.tsx` and `mediaHostStyle.ts`: the
  `playerBudget` custom property for the no-panel state.
- `frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts`: `PLAYER_PEEK_PX` for
  the no-panel budget, and the measurement of the row's height.
- `frontend/src/app/globals.css`: the framed player's `max-width` rule for the no-panel
  state, and the host's `min-height` rule (`.media-detail-host[data-workbench="on"]`).
- `frontend/src/components/FileDetail/ShellLayout.tsx`: the `workbenchActive` flag, only if
  the no-panel state needs a separate attribute.
- Tests: `frontend/e2e-layout/` (new boxes and heights), and the existing unit test for
  the workbench layout constants, where it names `WORKBENCH_MIN_REM`.
- Documentation: none. No viewer-visible key, gesture or endpoint changes. The layout
  change is not a user-guide item (`CLAUDE.md`, "Shipped behaviour is documented under
  `docs/`").

## Invariants

"Wide canonical page" means SPEC-CORE-085's wide canonical form. "Visible height" is H.

I1. With at least one panel shown under a framed player, on a wide canonical page, the
scroll container does not scroll at any visible height of 320px or more, and each shown
panel's bottom edge is at or above the bottom of the visible area, within 1px.

I2. With no panel shown under a framed player, on a wide canonical page, the scroll
container does not scroll at any visible height of 320px or more, and the toggle row's
bottom edge is at or above the bottom of the visible area, within 1px.

I3. With no panel shown, the frame's bottom edge is 1rem (within 1px) above the row's top
edge, and the frame's height is at most `playerBudget`.

I4. With a panel shown, the frame's height is at most half of H, as SPEC-CORE-085 I5
says, and no panel region has a minimum height.

I5. A panel's body scrolls inside itself when its content is taller than the panel
region, and the panel region never extends below the visible area.

I6. Toggling a panel on or off changes only classes, attributes and styles of the player
and the workbench. It does not remount the `<video>` element, the `.loft` iframe or any
panel, and does not change the playback position or play state.

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

## Checked, no action

- **Enlarge panels' 270px floor (SPEC-CORE-104):** not changed. It is a height for the
  frame, applied with a panel shown, and it does not depend on the room under the row.
- **Pseudo and system full screen, mini player:** not capped by this spec (SPEC-CORE-085
  step 8, unchanged).
- **Collection surface:** its panels take 60% of H and it scrolls by design
  (SPEC-CORE-085 I5, collection bullet). Not changed here.
- **Stacked inspector and phone:** no row, no panel under the player. The inspector is a
  tab, not a region under the player, so the scroll there is not this change.
- **Peek (48px) in the no-panel state:** removed from the budget. Its purpose was to show
  the title under the frame, and the row now occupies that place. Recommendation: remove.
  The human decides; see the question below.
- **Visible heights under 320px:** the page may scroll (I1, I2 apply from 320px). Below
  that, both the frame and the panels are too small to be useful.
- **Find open:** measured with Find closed, as §2 says. With Find open the page may scroll
  by the find bar's height; this was already so (SPEC-CORE-104, known issues) and is not
  changed.

## Questions for the human

1. **Player size with no panel shown.** To keep the row on screen the player becomes
   smaller than it is today on short windows. Recommended: accept that. The alternative,
   keeping the player as it is and accepting the scroll in this state, is what the owner
   asked to remove.
2. **The 48px peek.** Recommended: remove it from the no-panel state (see above).
3. **Design check.** The agreed design (`docs/process/reviews/feature-player-workbench/design/`)
   draws the player at its full size with no panel shown (D5). Question 1 changes that, so
   the difference is listed for the human to accept or reject.
