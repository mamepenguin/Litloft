# Workbench: no page scroll on the canonical page

SPEC-ID: SPEC-CORE-106

Approval: sha256:ebb1f55f13d09d85921460e8cd828bebedeb05df26583234c51069129426607a Yuichi Senga 2026-11-15

## Summary

For the household's one user, on the canonical page of a file with a framed player, in a
wide workbench form (SPEC-CORE-085). On a short window (a visible height under about 840px:
iPad mini in landscape, a PC browser window that is not maximised) the page scrolls, and the
toggle row ends up below the fold, in two states:

- **Panels shown.** SPEC-CORE-085 step 7 sets an 18rem floor for the panel region
  (`Workbench.tsx`, the grid's `minHeight`), so the page scrolls when the room is smaller.
- **No panel shown.** The player is sized to the whole visible height less a 48px peek
  (`--player-avail`), so the row, the only thing under the player, is below the fold.

Fullscreen covers watching the video across the whole screen (iPad: a fixed frame inside the
browser window; PC: `requestFullscreen`), so the in-page layout can give up that room. This
change removes the scroll in both states.

What changes:

- With panels shown: the 18rem floor is removed. The panel region is bounded by the host's
  height, so it takes the room the frame and the row leave, and each panel body scrolls
  inside itself. The 50% cap on the frame stays.
- With no panel shown: the framed player's budget is reduced by the measured height of the
  row, so the frame, the row and the spacing around them fit in the visible area.
- Unchanged: pseudo and system full screen, the mini player, the collection surface, the
  stacked inspector, the phone, audio.

## Required items

### 1. Normal flow

1. The reader is on the canonical page, in a workbench form (SPEC-CORE-085), with a framed
   player and a visible height H (`railAvailable`).
2. **Panels shown** (at least one panel is shown under the player):
   - the host (`.media-detail-host[data-workbench="on"]`) has `height: H` instead of
     `min-height: H`. Its flex column then bounds its children;
   - the frame's cap is half of H (SPEC-CORE-085 step 8, unchanged);
   - the row sits under the frame with its `1rem` top margin;
   - the panel region sits under the row after the row's `0.75rem` gap
     (`.media-detail-workbench` `gap`), fills the rest of the host, and has no minimum
     height. Its grid, its panels and their bodies are `min-height: 0`, and each body is
     `overflow: auto` (both already in `globals.css`);
   - so the panel region's bottom is H, and each panel body scrolls inside itself.
3. **No panel shown, toggles drawn** (the row is drawn, nothing is under it):
   - the host keeps no height rule (`min-height` is not set, as today), so it takes the
     height of its content;
   - the frame's height is `--player-avail` (its width is `--player-avail × 16/9` by the
     existing `max-width` rule, unchanged), with the row's block subtracted (§3);
   - the row sits directly under the frame, with no gap below it.
4. Turning a panel on or off changes the frame's size and the host's rule. No element is
   remounted.

### 2. Failure cases

- **Very short window** (H below 320px): the frame and the row cannot both be usable. The
  page may scroll; not promised (§Checked, no action).
- **Row wraps** (more toggles than fit on one line): the row's measured height grows, so the
  frame gets smaller. The row never scrolls sideways (SPEC-CORE-085 step 3). If the wrapped
  row leaves no room for the frame, the frame is 0px high and the page may scroll (Question 4).
- **Find open:** the find bar sits above the player and takes its own height. The rules are
  measured with Find closed; with Find open the page may scroll by the find bar's height, as
  today.
- **Full screen or mini player:** the frame leaves the flow and the cap does not apply
  (SPEC-CORE-085 step 8, unchanged).
- **No toggles and no actions:** the row is not drawn, its height is 0, and the cap is as it
  is today (no row block, peek as today).
- **The file has not resolved (`playerAvailable` null):** the existing CSS fallback applies
  (`--player-avail` falls back to `100dvh`, `globals.css`), and no new value is introduced.
  The clamp to 0 in `useCompanionMetrics` is kept.

### 3. States and transitions

The budget is computed in `useCompanionMetrics.ts`, as `--player-avail`:

    --player-avail = max(0, H - playerOffset - rowBlock)

- `playerOffset`: the existing measurement, the distance from the top of the scroll
  container's visible area to the top of the player wrapper.
- `rowBlock`: the measured `offsetHeight` of the workbench row plus `2rem` (the host's
  `mt-4` above the workbench and its `p-4` bottom padding). It is 0 when no row is drawn.
- The 48px peek (`PLAYER_PEEK_PX`) is not part of the budget. It is removed (Question 2).

The row is found by its class (`.media-detail-workbench-row`) inside the metrics hook's scope
(the mini-player pane, or the document), on every measure. The hook's `ResizeObserver` watches
the row element that is current, whether or not it existed when the effect ran, and a
`MutationObserver` over the scope (child list, subtree) measures again when the row element
mounts, unmounts or changes identity. A change in the row's height is observed by the same
observer. While the row sits beside the frame (`data-row-beside="on"`, SPEC-CORE-105), it is
not in the flow under the frame, so `rowBlock` is 0.

Before the row is first measured, `rowBlock` is 0, so on the first frame the frame may be
taller than the visible area. This is accepted, as SPEC-CORE-105 accepts for its own first
frame.

Where `ResizeObserver` is missing, the existing fallback applies (a single measurement on
mount, and on each run of the effect).

Transitions:

| From | To | What changes | Must not happen |
|---|---|---|---|
| panels shown | last panel closed | host rule `height` → none; `rowBlock` applies; frame cap → `--player-avail` | remount of the player or any panel |
| no panel | panel opened | host rule none → `height: H`; frame cap → half of H | remount |
| row drawn | row not drawn (no toggles, no actions) | `rowBlock` → 0 | a stale `rowBlock` left in the budget |
| row height changes (wrap, a new addon action) | — | `rowBlock` recomputed in the observer's callback | a frame larger than the new budget after a settled frame |
| normal | full screen or mini player | the frame leaves the flow; no cap | a change to the stored value or the panel list |

### 4. Data read and written

None. The stored panel list and the enlarge value are read as today; nothing is written.

### 5. External services

None.

### 6. Authorization

None. Layout only.

### 7. Effect on existing features

- SPEC-CORE-085 step 7 (the 18rem floor) and step 9 (no panel shown: the player is the size
  it is today): revised in `## Revises`, as prose. Steps are not carried by `review.sh`, so the
  revised invariants are in the I-lines below; the step text is replaced by §1 of this spec.
- SPEC-CORE-085 I5, the second bullet: revised.
- SPEC-CORE-104 I3 and I6: revised.
- SPEC-CORE-105 I4 states that the room under the frame must be at least `0.75rem + 18rem +
  1rem`. That premise was the floor, which no longer exists. The claim it makes (no scroll,
  panels within H) still holds by this spec's I1. 105 I4 is **not** revised; its 18rem term
  is a premise, not a requirement, and the e2e for 105 keeps it as a size fixture.
- SPEC-CORE-105's other invariants: unchanged. They apply only with a panel shown.
- The collection surface (SPEC-CORE-090): unchanged. Its rule `height: max(18rem, … 0.6)`
  (`globals.css`, the `data-collection-workbench` selector) stays, and so does its test in
  `mediaDetailTheaterCss.test.ts`.
- No remount: only classes, styles and custom properties change.

### 8. Error behavior

None shown, nothing logged.

### 9. User-visible behavior

- With panels shown on a short window, the panels get less height and the page does not
  scroll. The 50% frame cap is unchanged.
- With no panel shown on a short window, the player is smaller than today, so the toggle row
  is visible under it without scrolling. On a tall window the frame is the same as today
  (limited by the canvas width, or by the 16:9 height the budget allows).
- The 48px title peek under the frame disappears in this state (Question 2).

### 10. Non-functional

- The layout is measured in a real browser (`docs/process/PROJECT.md`, "Review in this
  project"). A jsdom test cannot check boxes.
- The budget and the host rule are recomputed when H, `playerOffset` or the row's height
  changes, through the existing observers. No timer.

## Frame share by state

The frame's share of H while a panel is shown is the existing custom property
`--workbench-player-share`, set in `mediaHostStyle.ts` by the enlarge value:

| Panel shown | Enlarge value | Frame cap |
|---|---|---|
| yes | off | 50% of H (SPEC-CORE-085 step 8) |
| yes | on | 30% of H, floor 270px (SPEC-CORE-104) |
| no | off or on | `--player-avail` (this spec) |

Only the first two rows are read by the revised SPEC-CORE-104 I3 and by I4 below.

## Touch points

- `frontend/src/app/globals.css`: `.media-detail-host[data-workbench="on"]`: `min-height:
  var(--rail-avail)` becomes `height: var(--rail-avail)`, and the rule is restricted to the
  panel-shown state (the attribute is only set then, by `workbenchActive`). Nothing else in
  the stylesheet changes. The collection rule (`data-collection-workbench`) is not touched.
- `frontend/src/components/FileDetail/workbench/Workbench.tsx`: the grid's `minHeight`
  (`WORKBENCH_MIN_REM`) is removed. The row element is not passed anywhere; the metrics hook
  finds it by class (§3).
- `frontend/src/lib/layoutSizes.ts`: `WORKBENCH_MIN_REM` is deleted, after its last use in
  `Workbench.tsx` is removed. Grep `WORKBENCH_MIN_REM` to confirm.
- `frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts`: subtracts `rowBlock` from
  `--player-avail`, removes `PLAYER_PEEK_PX` (Question 2), and observes the row element that
  is current (§3).
- `frontend/src/components/FileDetail/hooks/__tests__/useCompanionMetrics.test.tsx` (new): the
  row that exists at mount is observed.
- `frontend/src/components/FileDetail/MediaCanvas.tsx`, `mediaHostStyle.ts`,
  `ShellLayout.tsx`: no change.
- Tests whose expected values change or which are removed or rewritten:
  - `frontend/src/components/FileDetail/__tests__/FileDetailCanvas.test.tsx` (lines 213, 219,
    278, 288) assert exact `--player-avail` pixel values (508, 632, 402px) computed with the
    48px peek and no row block. The new values are the old ones plus 48 exactly: no row is
    drawn in those cases, so `rowBlock` is 0. The subtraction of a drawn row is measured in
    the e2e suite (`e2e-components/`), not in jsdom, which has no layout.
  - `frontend/src/app/__tests__/mediaDetailTheaterCss.test.ts`: the canonical host assertion becomes
    `height: var(--rail-avail, 100dvh)` with no `min-height`. The regex matches that rule
    in the extracted host block. The collection test (the `max(18rem …)` rule) is kept.
  - `frontend/e2e-components/player-workbench-desktop.spec.ts`: the SPEC-CORE-085 I5 test
    that asserted the 18rem floor and page scroll is rewritten as SPEC-CORE-106 I1 (the
    region is below 18rem and the page does not scroll). Its name changes with it.
  - `frontend/e2e-components/inspector-responsive-layout-desktop.spec.ts`: the test
    "find with the inspector closed in a stacked row restores the canvas scroll" is deleted.
    Reason: its premise was not true on the baseline either. With the inspector open in a
    stacked layout the canvas holds only the player, so its scroll height equals its client
    height before and after this change (measured at 900×700 and 900×520). The test
    therefore checked nothing about the canvas scroll it named. No test replaces it, and
    the stacked inspector stays unchanged (§7).
  - `frontend/e2e-components/workbench-no-page-scroll-desktop.spec.ts` (new), registered in
    `e2e-components/projects.ts` and `e2e-components/spec-viewport.spec.ts`.
- Live measurement: the suite that renders the real canonical page (`frontend/e2e-components/`)
  measures the live `--player-avail`, the row's height and the host's scroll. The static
  fixtures in `frontend/e2e-layout/` cannot run the hook, so they check only the CSS rule.
- Documentation: none. No viewer-visible key, gesture or endpoint changes. A layout change
  of this kind is not a user-guide item (`CLAUDE.md`).
- Risk zones: none of these paths is in `process/risk-zones.conf` as CRITICAL or HIGH.
  Frontend layout is not a protected path (`docs/process/PROJECT.md` lists none).

## Invariants

"Wide canonical page" means SPEC-CORE-085's wide canonical form with a framed player. The
invariants apply with Find closed and with a row that does not wrap to zero room (§2).

I1. With at least one panel shown, the scroll container does not scroll at any visible
height of 320px or more, every shown panel's bottom edge is at or above the bottom of the
visible area (within 1px), and each panel body scrolls inside itself when its content is
taller than the panel.

I2. With no panel shown and the row drawn, the scroll container does not scroll at any
visible height of 320px or more, and the row's bottom edge is at or above the bottom of the
visible area (within 1px).

I3. With no panel shown and the row drawn, the frame's bottom edge is 1rem (within 1px)
above the row's top edge, and the frame's height is at most `--player-avail`.

I4. With a panel shown and the stored value off, the frame's height is at most half of H.
With the stored value on, it is at most 30% of H, and at least 270px unless the canvas width
limits it first.

I5. With a panel shown, the host's height is H (within 1px), and the panel region has no
minimum height, so that a region's height is 0 at a small H and grows with H.

I6. Toggling a panel on or off, and a row whose height changes, change only classes,
attributes, styles and custom properties of the player and the workbench. They do not
remount the `<video>` element, the `.loft` iframe or any panel, and do not change the
playback position or play state.

I7. A change of the row's measured height, a row that mounts or unmounts, and a change of H
recompute `--player-avail`. After a settled frame, the frame's height is at most the current
`--player-avail`.

I8. With the full-screen or mini-player frame in place, no cap from this spec applies, and
the stored panel list and the enlarge value are unchanged by entering or leaving it.

## Revises

SPEC-CORE-085 I5. On the canonical page, while at least one panel is shown under a framed
player in a wide form, the 16:9 frame is at most half of the scroll container's visible
height, the scroll container does not scroll at any visible height of 320px or more (with
Find closed and the row not wrapped to no room), and each shown panel ends within the visible
area. On the collection surface, the panels together are 60% of the visible height (at least
18rem), the player is not capped, and for a video the order down the page is the player, the
row, the panels, the information, then the queue. On either surface, each panel's body
scrolls inside itself.

SPEC-CORE-104 I3. With the stored value on, the frame at the 30% cap, and the frame at the
50% cap limited by height rather than by the canvas width, each shown panel ends within the
visible area, the scroll container does not scroll at any visible height of 320px or more
(with Find closed and the row not wrapped to no room), and each panel body is taller than it
is with the value off at the same window size.

SPEC-CORE-104 I6. Only a press of the button writes `workbench-player-focus`. Closing every
panel, a file change, a form change, opening Find and a reload leave it unchanged. With every
panel closed the button is not drawn, and the framed player's height is capped at
`--player-avail` (SPEC-CORE-106 I3); turning a panel on again applies the stored value.

Prose only (not an I-line; `review.sh` does not carry it): SPEC-CORE-085 step 7 (the 18rem
floor) and step 9 (the player at its size today with no panel shown) are replaced by §1 of
this spec.

## Design check

The agreed design is saved in `docs/process/reviews/feature-player-workbench/design/`
(mock https://claude.ai/artifact/SMLPhPJSRZzLYhe21a4sJS). The design-check reads these
checkable lines:

- Panels shown, canonical page, row under a centred frame: the row is directly under the
  frame; the panel region fills the rest of the host; the panels are side by side at 41rem or
  more.
- No panel shown (D5): the row is directly under the frame; the frame is at its full size
  today. **This spec changes it** (Question 1, accepted or rejected by the human).
- The enlarge state: the 30% frame and the row under it, unchanged from SPEC-CORE-104.

## Checked, no action

- **Enlarge panels' 270px floor (SPEC-CORE-104):** unchanged. It is a height for the frame
  with a panel shown.
- **Pseudo and system full screen, mini player:** not capped by this spec (I8).
- **Collection surface:** its panels take 60% of H and it scrolls by design (SPEC-CORE-085
  I5, collection bullet). Its 18rem rule and its test stay.
- **Stacked inspector and phone:** no row and no panel under the player. Not this change.
- **Visible heights under 320px:** the page may scroll. I1 and I2 start at 320px.
- **Find open:** measured with Find closed. With Find open the page may scroll by the find
  bar's height, as today.
- **Wrapped row with no room:** accepted as in §2 and Question 4.
- **Row measured on the first frame:** `rowBlock` is 0 until measured (§3), as SPEC-CORE-105
  accepts for its own first frame.
- **Mutation review:** PROJECT.md asks for one on a large or load-bearing change. This change
  is layout only. The reviewer may run one on the `rowBlock` subtraction and on the host
  height rule if the human wants it.

## Decisions

Accepted by the human on 2026-11-14: each question below is decided as its recommendation.

1. **Player size with no panel shown (recommended: accept).** To keep the row on screen the
   player is smaller than today on short windows. Without this change the page scrolls in
   this state.
2. **The 48px peek (recommended: remove).** The peek shows the title under the frame. The row
   now occupies that place. Keeping it would push the row 48px below the fold.
3. **Design difference (recommended: accept Q1 and record it).** Q1 changes the design's D5
   (the player at full size with no panel shown). The design-check records it as a `D-`
   finding to accept or reject.
4. **Wrapped row with no room (recommended: accept the scroll).** When the toggle row wraps
   to three or more lines on a short window, no frame height is left and the page may scroll.
   The alternative is to hide wrapped toggles, which removes them from view.
