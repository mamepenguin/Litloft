# Inspector toggle at the header's right end

SPEC-ID: SPEC-CORE-098

Approval:

## Summary

On a file page at 768px and wider, the inspector toggle moves from the file's own controls
to the far right end of the app header, past the profile button, behind a divider of its
own. The inspector opens on the right side of the window, and the tree, which opens on
the left, already has its toggle at the left end beside the menu button. Putting the
inspector's toggle at the right end gives both side panes the same rule: the outermost
button on each side opens the pane on that side. The toggle's behaviour, icons, labels
and shortcut do not change. Phones and pages without an inspector do not change either.

Agreed design: https://claude.ai/artifact/L6kDNkSpJCRjMXwv5SRGS8, saved in
`docs/process/reviews/feature-inspector-toggle-right-end/design/`. The chosen option is
A (`Main.dc.html`, `ACompare.dc.html`, `AStacked.dc.html`). `Current.dc.html` shows
today's placement, and `BCompare.dc.html` shows the rejected option B.

Visible decisions in the design, as checkable lines:

- Wide file page with an inspector, left to right: menu button, tree button, trail, the
  file kind's controls, the Inbox actions, divider, search, quick note, the
  `header-actions` slot, profile button (avatar, or the set-up button when no nickname
  is set), divider, inspector toggle.
- The inspector toggle is the header's last control. Its right edge is 16px (`pr-4`)
  from the header's right end, which is where the profile button's right edge is today.
- The second divider looks like the first: 1px wide, 20px tall, `bg-bg-border`. It is
  12px from the profile button's right edge and 12px from the toggle's left edge. The
  first divider's spacing does not change.
- Between the file kind's controls (or the Inbox actions) and the first divider there is
  no toggle.
- Stacked inspector (a player file whose inspector sits under the player): same place,
  with the bottom-panel icons.
- A page without an inspector ends at the profile button, with no divider and no
  reserved space after it. On a file page with an inspector, search, quick note, the
  slot and the profile button therefore sit further left than on a folder page, by the
  width of the toggle and its divider. This shift is accepted.

## Required items

### 1. Normal flow

1. The viewer opens a file whose page has an inspector, at a viewport of 768px or wider.
2. The header shows the file's row. Then come search, quick note, the `header-actions`
   slot and the profile button, then a divider and the inspector toggle.
3. The viewer presses the toggle, or `Cmd/Ctrl+\`. The inspector opens or closes as it
   does today. The toggle's icon and label change as they do today.
4. The viewer moves to another file, or the page goes from loading to loaded. The
   toggle stays at the right end without the header passing through its ordinary form.
5. The viewer leaves for a page with no inspector. The toggle and its divider disappear,
   and the header ends at the profile button.

### 2. Failure cases

Nothing new can fail: no data is read or written. Until the header's trailing container
has mounted, the toggle is not drawn yet. It is never drawn at its old place as a
fallback.

### 3. States

The toggle's own states are unchanged: open or closed, crossed with beside or stacked,
which gives four icons. Whether the toggle is in the header:

| Page | Viewport | Toggle and its divider |
|---|---|---|
| Hosted file page with an inspector (canonical route, or a file that rides the file-detail shell on the collection route, such as Markdown or plain text) | ≥ 768px | in the header, last |
| Hosted file page with an inspector | < 768px | absent |
| Hosted file page without an inspector (a collection-route file that does not ride the shell, the right pane's error state) | any | absent |
| File page outside the shell (no app header) | any | toggle at the end of its own row, as today; no second divider |
| Any page that is not a file page | any | absent |

The toggle and its divider are one unit: they appear and disappear together, gated by
the same signal the toggle uses today (`useIsMobile`). Transitions:

- Crossing 768px on a file page with an inspector: both appear, or both disappear.
- File page with an inspector → its error state, or → a collection-route file that
  does not ride the shell: both disappear.
- Canonical route, file → file, loading → loaded, beside ↔ stacked: the unit stays in
  every frame, with the icon of the new state.
- Collection route, loading → a loaded file that rides the shell, or a file that does not
  ride the shell → one that does: the unit appears. The collection route's loading row
  has no inspector.
- Collection route, a file that rides the shell → one that rides it too: the unit stays
  in every frame.
- Leaving the file page: both disappear.

Forbidden at every moment: a divider without a toggle after the profile button, a toggle
without that divider, a toggle both in the row and at the right end, two toggles, and a
toggle left behind by a file page that is no longer on top.

### 4. Data read and written

None. The inspector's open/closed preference is stored where it is today, and this
change does not touch it.

### 5. External services

None.

### 6. Authorization

None. The header carries no new action.

### 7. Effect on existing features

- `FileHeaderRowProvider` gains a second portal target, at the header's trailing end.
  It is owned by the same top drawer as the row: it is not a second drawer, so the "the
  newest mounted file page owns the row" rule covers it on file-to-file and
  loading-to-loaded swaps.
- `Header` mounts the trailing target after the profile button. The target takes no
  space and adds no gap when nothing is portalled into it.
- `FileDetailChrome`, when hosted, stops drawing the toggle inside the row. It portals
  the divider and the toggle together into the trailing target. Unhosted, it keeps
  drawing the toggle inside its own row.
- SPEC-CORE-094 I2 (the app-wide group sits at the folder page's x) and I3 (the toggle's
  presence) are revised below. The tests in
  `frontend/e2e-components/file-header-row-desktop.spec.ts` that assert them (the x
  equality, the D2 order, "toggle shown") change to assert the revised sentences.
- Header crowding at 768px: the trailing group does not shrink, so the trail gets less
  width. The trail already truncates. I8 below pins the outcome on the real header.
- Tests that find the toggle by `data-testid="inspector-toggle"` keep working. Unhosted
  renders (`FileDetailChrome.test.tsx`, `StackedInspector.test.tsx`, `MediaShell.test.tsx`,
  `Workbench.test.tsx`) still find it in the row.

### 8. Error behavior

None. No failure path exists (item 2).

### 9. User-visible behavior

- Wide file page with an inspector: the inspector toggle is at the far right of the
  header, after the profile button and a divider.
- Its icons, `aria-label`, `title`, `aria-pressed` and the `Cmd/Ctrl+\` shortcut are
  unchanged.
- The toggle is the header's last tab stop and the last control a screen reader reaches
  in it, after the profile button.
- No control sits between the Inbox actions (or the file kind's controls) and the first
  divider any more.
- On a file page with an inspector, the app-wide group sits further left than on other
  pages.
- Phones: no change.
- `docs/user-guide/viewers-and-players.md`:
  - "Search sits in the same place as on every other screen" is deleted. It would no
    longer be true.
  - "on a wide window the inspector toggle sits beside the file's controls" and "the
    toggle at the end of the page row" both become "the toggle at the right end of the
    header".

### 10. Non-functional

No new requests. Moving the toggle into the trailing target must not remount the player
or the inspector (I9).

## Touch points

- `frontend/src/components/Header.tsx`: mount a trailing container after the profile
  button. The container takes no space when empty.
- `frontend/src/components/FileHeaderRowProvider.tsx`: register the trailing container
  and portal into it, owned by the top drawer as the row is.
- `frontend/src/components/FileDetail/FileDetailChrome.tsx`: when hosted, portal the
  divider and the inspector toggle into the trailing container instead of drawing the
  toggle in the row. Unhosted, keep the toggle in the row.
- Tests: `frontend/src/components/FileDetail/__tests__/FileDetailHeaderRow.test.tsx`,
  `frontend/src/components/FileDetail/__tests__/headerRowHarness.ts`,
  `frontend/e2e-components/file-header-row-desktop.spec.ts` (revised SPEC-CORE-094 I2 and
  I3 assertions, and new ones for this spec), and
  `frontend/e2e-components/inspector-responsive-layout-desktop.spec.ts` and
  `frontend/e2e-components/player-workbench-desktop.spec.ts` where they locate the toggle.
- `DESIGN.md`: the §Header "Wide, left to right" order, and the §Page Header sentence
  about where a file page's inspector toggle is drawn.
- `docs/user-guide/viewers-and-players.md`: the sentences in item 9.
- Rules passed through: `.claude/rules/frontend-conventions.md` (design system),
  `DESIGN.md` §Header and §Page Header.
- No protected path is edited.

## Invariants

I1. On a hosted file page with an inspector at a viewport of 768px or wider, the
inspector toggle is the header's last control. Its left edge is right of the profile
button's right edge, no other button is right of it, and its right edge is 16px from the
header's right end.
I2. In that state, exactly one divider lies between the profile button and the toggle,
12px from each, and the divider that separates the file's controls from search is still
present.
I3. On a page without an inspector, on a hosted file page without one, or below 768px,
the header contains no inspector toggle and no divider after the profile button, and the
profile button's right edge is 16px from the header's right end.
I4. Pressing the toggle, or `Cmd/Ctrl+\`, opens and closes the inspector as before.
`aria-pressed`, the label and the icon (right-panel when beside, bottom-panel when
stacked, each in an open and a closed form) follow the open state as before.
I5. Across a file-to-file swap, a loading-to-loaded swap, a beside-to-stacked resize, a
resize across 768px, or a move to a hosted file page without an inspector, every frame
shows either no toggle and no trailing divider, or exactly one toggle with exactly one
trailing divider. The header never holds a toggle inside the row, never holds two, and
never holds one left by a file page that is no longer on top. Where the outgoing and the
incoming hosted file page both have an inspector at 768px or wider, every frame shows the
unit.
I6. A file page drawn outside the shell (no app header) still shows its inspector toggle
at the end of its own row.
I7. The order of the trail, the file kind's controls and the Inbox actions is unchanged,
and no inspector toggle sits between them and the first divider.
I8. At 768px wide, on the canonical route with a video file (find and the file kind's
controls shown), the tree closed, not walking the Inbox, no `header-actions` entries, a
200-character file name and the set-up button in place of the avatar, the header does not
wrap, none of its controls overlap, the trail's leaf is truncated, and the toggle lies
inside the header's box.
I9. Pressing the toggle, and a beside-to-stacked resize, keep the same player media
element and its playback position.
I10. On a hosted file page with an inspector at 768px or wider, the toggle follows the
profile button in the header's focus order, and nothing focusable follows the toggle
inside the header.

## Revises

SPEC-CORE-094 I2. At ≥ 768px on a file page, the trail's first crumb starts at the edge D2 defines; on a file page without an inspector, the search button, the quick note button and the profile button sit at the same x as on a folder page of the same drive at the same width, and on a file page with an inspector each sits left of that x by the same amount, equal to the distance from the profile button's right edge to the inspector toggle's right edge on that page.
SPEC-CORE-094 I3. At < 768px on a file page, the row shows no quick note button, no avatar, no tree button and no inspector toggle, and while walking the Inbox no search and no document controls; at ≥ 768px it shows the quick note button, the avatar, the tree button wherever a current drive is known, and, wherever the page has an inspector, the inspector toggle as the header's last control, including while a rename is open.

## Checked, no action

- Option B, reserving the right-end slot on every page so the app-wide group never
  shifts: rejected by the user. It leaves a visible empty slot on every page without an
  inspector.
- Moving the toggle into the inspector itself (close inside, open at the canvas edge):
  not taken. Opening and closing would then happen in two different places.
- Phone layout: unchanged by decision. The sheet is raised from its resting strip
  (DESIGN.md §Header).
- `docs/user-guide/keyboard-shortcuts.md`: the shortcut does not change, so the page
  does not change.
- First paint on a phone: the toggle is gated by `useIsMobile` today, and the trailing
  container mounts after hydration, so the gate is the same as today's. No new flash
  path is added.
- Rows wider than I8's fixture at 768px (walking the Inbox with a note's view switch,
  the tree open, addon slot entries): this change adds the toggle's width to them as to
  every row, and does not decide what gives way when such a row cannot fit. That is
  today's behaviour and outside this change.
- `frontend/e2e-components/header-row-crowding.spec.ts` measures the unhosted
  arrangement, which this change does not alter. The hosted 768px case is I8, measured
  in `file-header-row-desktop.spec.ts`.
