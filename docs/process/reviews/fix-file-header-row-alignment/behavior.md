# File header row: the trail's left end and the fixed buttons' height

SPEC-CORE-094 (`docs/specs/file-detail-single-header.md`) shipped in #574. The human
reported two defects on a desktop file page on 2026-11-13: with the sidebar open the
home crumb sits against the sidebar, and, open or closed, the menu and tree buttons
are not on the same line as the home crumb and the trail.

Measured at 1280 and 1440 on the canonical route (`header-row-two-pane` fixture):
- Inline sidebar, tree closed: the header starts at x=240 and the home crumb at x=240,
  0px from the sidebar's border. D2's rule gives the later of the right pane's edge
  (240) and the buttons' right edge plus 12 (112).
- The buttons are 40px tall at `top: 12px`, centre y=32; the header is 56px, and its
  controls and trail are centred at y=28.

## Correct behaviour

SPEC-CORE-094 D2, revised: a file page's trail starts at whichever is furthest right of
the content's left edge, the fixed menu and tree buttons' right edge plus 12px, and the
header's own left end plus 16px (the inset its controls keep at its right end, `pr-4`).

The fixed menu and tree buttons are placed at the safe-area top plus 8px, so their
centre is the 56px header's centre line, on every screen and at every width. The trail,
the narrow two-line heading and the header's controls share that line.

## Tests

- `file-header-row-desktop.spec.ts`: the canonical-route edge cases include the 16px
  term; a new case opens the inline sidebar at 1440 and checks the inset and the
  shared centre line with the sidebar open and closed.
- `file-header-row.spec.ts`: the menu button is on the header's centre line on a phone,
  and the two-line heading is centred on it.
- `MenuButton.test.tsx` and the `pseudo-fullscreen.html` layout fixture carry the 8px.
