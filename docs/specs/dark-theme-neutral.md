# Neutral near-black dark theme

SPEC-ID: SPEC-CORE-097

Approval:

## Summary

The dark theme's neutral tokens are tinted plum red (`--bg-primary: #1a0e10`,
`--text-muted: #c4a0a4`, `--sand: #3d2023`, ...), while the light theme's neutrals are
near-achromatic warm grey (`#f6f6f3`, `#91918c`, `#62625b`) and only the coral accent
carries hue. With a red accent on top of red-tinted surfaces, the whole dark screen reads
red, and video thumbnails are seen against a coloured ground. This change replaces the
dark theme's neutral tokens with a near-black palette that has the same faint warmth as
the light theme's greys (red equal to green, blue a few steps lower), and keeps every
hued token (accent, teal, amber, focus ring, danger, highlights, chart colours) as it
is. It is for every viewer who uses the dark theme or the system theme on a dark-mode
device. No pure-black (OLED) theme is added.

Agreed design: https://claude.ai/artifact/PHGQ4B3cbXf7XXSQob8dtT, artboard
`Neutral.dc.html` (recommended). The canvas files are saved in
`docs/process/reviews/feature-dark-theme-neutral/design/`; `Main.dc.html` there is the
current palette and `Oled.dc.html` the rejected pure-black option, kept for comparison
only.

## Required items

### 1. Normal flow

1. A viewer has the dark theme selected, or the system theme on a device in dark mode.
   The existing theme resolution (`DESIGN.md` §8) sets `data-theme="dark"` on `<html>`
   before first paint; this is unchanged.
2. Every element styled with a theme token picks up the new value from the
   `[data-theme="dark"]` block in `frontend/src/app/globals.css`.
3. The browser chrome (address bar, iOS status bar area) takes the `theme-color` for
   `prefers-color-scheme: dark` from `frontend/src/app/layout.tsx`, which becomes the new
   `--bg-primary`. This follows the device's colour scheme, not the theme chosen in the
   app: a viewer who picks Dark on a light-mode device keeps the `#ffffff` bar, as today.
4. A PWA launched from the home screen shows its splash on `background_color` from
   `frontend/public/manifest.json`, which becomes the new `--bg-primary`. The app icon
   drawn on that splash (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, a
   penguin on a dark brown square) is not changed.
5. Consumers that read `--bg-primary` / `--text-primary` / `--accent` at run time (the
   EPUB reader's surface colours, the iOS shell's page colour report) receive the new
   values without code changes.

#### The dark block after the change

The `[data-theme="dark"]` block declares exactly the 31 custom properties below plus
`color-scheme: dark`, and nothing else.

Changed (11):

| Token | Current | New |
|---|---|---|
| `--bg-primary` | `#1a0e10` | `#131312` |
| `--bg-card` | `#231216` | `#1c1c1b` |
| `--bg-elevated` | `#2f191b` | `#272725` |
| `--bg-sidebar` | `#1a0e10` | `#131312` |
| `--text-primary` | `#f5e6e8` | `#eeeeea` |
| `--text-muted` | `#c4a0a4` | `#a5a59f` |
| `--sand` | `#3d2023` | `#2f2f2c` |
| `--sand-hover` | `#4a2a2e` | `#3a3a37` |
| `--warm-light` | `#3d2023` | `#2f2f2c` |
| `--warm-silver` | `#7a6668` | `#8a8a84` |
| `--dark-surface` | `#0d0608` | `#0b0b0a` |

Unchanged (20), with their values:

| Token | Value |
|---|---|
| `--bg-border` | `rgba(255, 255, 255, 0.08)` |
| `--accent` | `#e85d5e` |
| `--accent-hover` | `#f07070` |
| `--accent-cta` | `#e85d5e` |
| `--accent-teal` | `#4caf80` |
| `--accent-amber` | `#f4c674` |
| `--player-indicator` | `#ffffff` |
| `--focus-ring` | `#617bff` |
| `--danger` | `#ff8a8a` |
| `--danger-bg` | `rgba(255, 45, 66, 0.12)` |
| `--highlight-bg` | `rgba(244, 198, 116, 0.55)` |
| `--mark-bg` | `rgba(126, 200, 126, 0.32)` |
| `--kbd-shadow` | `inset 0 -1px 0 rgba(255, 255, 255, 0.2)` |
| `--shadow-card` | `0 1px 2px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.25)` |
| `--graph-cat-1` | `#e85d5e` |
| `--graph-cat-2` | `#4caf80` |
| `--graph-cat-3` | `#f0a847` |
| `--graph-cat-4` | `#c98bc0` |
| `--graph-cat-5` | `#bdb869` |
| `--graph-cat-6` | `#7fa6d4` |

Derivation of the values the design did not draw: `--sand-hover` keeps the current step
above `--sand` (about +11 in each channel); `--warm-light` stays equal to `--sand` as it
is today; `--dark-surface` stays the deepest surface, below `--bg-primary`.

#### The light block, unchanged

The `:root, [data-theme="light"]` block keeps exactly these declarations (comments
aside):

```
--bg-primary: #ffffff;
--bg-card: #ffffff;
--bg-elevated: #f6f6f3;
--bg-sidebar: #ffffff;
--bg-border: rgba(145, 145, 140, 0.2);
--text-primary: #211922;
--text-muted: #62625b;
--accent: #d63031;
--accent-hover: #b52425;
--accent-cta: #d63031;
--accent-teal: #103c25;
--accent-amber: #78350f;
--player-indicator: var(--accent);
--player-indicator-track: rgba(112, 112, 112, 0.85);
--sand: #e5e5e0;
--sand-hover: #d5d5d0;
--warm-light: #e0e0d9;
--warm-silver: #91918c;
--dark-surface: #33332e;
--focus-ring: #435ee5;
--danger: #9e0a0a;
--danger-bg: rgba(230, 0, 35, 0.08);
--highlight-bg: #fff8c5;
--mark-bg: #dff0cf;
--kbd-shadow: inset 0 -1px 0 #b8c0c8;
--shadow-card: 0 1px 2px rgba(33, 25, 34, 0.04), 0 1px 3px rgba(33, 25, 34, 0.04);
--graph-cat-1: #d63031;
--graph-cat-2: #1f7a5a;
--graph-cat-3: #c2740a;
--graph-cat-4: #8e4585;
--graph-cat-5: #7c7a45;
--graph-cat-6: #3f6fa3;
color-scheme: light;
```

### 2. Failure cases

None at run time: the change is static CSS values and static colour strings. A build
that fails leaves the running version in place, as for any frontend change.

### 3. States

The theme states are unchanged: `light`, `dark`, and `system` resolved to one of those
two before first paint. Only the values painted in `dark` change.

### 4. Data read and written

None. No database, file, cache or local-storage key is read or written differently. The
stored theme preference is untouched.

### 5. External services

None.

### 6. Authorization

None: the theme is a per-viewer presentation setting with no access check.

### 7. Effect on existing features

- Every screen in dark mode changes colour, core and addon frontends alike: addons use
  the same tokens through Tailwind utilities and `var(--…)`, and none hard-codes a dark
  colour (every current dark value was searched for under `addons/`).
- EPUB reader: its book surface takes `--bg-primary` / `--text-primary` / `--accent`
  from the parent, so the book surface becomes `#131312`.
- iOS shell: `useReportPageBackground` reports `--bg-primary` to the native shell, which
  paints the area around the web view in it; that area becomes `#131312`.
- Missing-file badge (`MissingFileGrid.tsx`): white text on `bg-warm-silver/80`. White on
  `#8a8a84` is about 3.5:1 (5.3:1 on `#7a6668` today); the light theme's `#91918c` gives
  about 3.2:1 for the same badge. See `## Checked, no action`.
- Light theme: no change.

### 8. Error behavior

None: there is no new failure path, so nothing new is shown or logged.

### 9. User-visible behavior

- In dark mode, backgrounds, cards, raised surfaces, chips, the search field, secondary
  text and disabled text are near-black and grey instead of plum and pink.
- Coral stays the only hue on ordinary screens (buttons, selection, progress bar).
- The browser bar colour on a device in dark mode, and the PWA splash, become `#131312`. An installed
  PWA may keep its old splash until the browser refetches the manifest.
- Contrast: `--text-primary` is at least 11.5:1 and `--text-muted` at least 5.4:1
  against `--bg-primary`, `--bg-card`, `--bg-elevated` and `--sand`; `--warm-silver` is
  at least 4.9:1 against `--bg-primary` and `--bg-card` (it is 3.5:1 today).

#### What the design check compares

The artboard is a colour study on a simplified folder screen, not a layout. The design
check and R-5 compare **which colour paints which surface**, dark theme only; layout,
sizes, column counts and copy are out of scope. The checkable lines:

- Page ground and sidebar ground: `#131312`.
- File cards: `#1c1c1b`; the selected sidebar row: `#272725`. A selected file card is
  marked by its coral ring only; the artboard's raised fill under the selected card is a
  sketch detail, not a decision, and is not compared.
- Search field and filter chips: `#2f2f2c`.
- Primary text `#eeeeea`; card meta, counts and inactive sidebar rows `#a5a59f`.
- Coral `#e85d5e` on the primary button, the active chip, the progress bar and the
  selected card's outline, as today.

R-5 captures, in the dark theme at 1280 px and at 390 px: a drive's folder view in grid
mode with the sidebar open, the search field visible and a filter chip shown, and one
video file's detail page; and, at 1280 px only, an EPUB file open in the reader, whose
book surface paints `#131312`.

### 10. Non-functional

No size, time, concurrency, privacy or cost effect.

## Touch points

- `frontend/src/app/globals.css`: the `[data-theme="dark"]` block, values only (the
  light block untouched).
- `frontend/src/app/layout.tsx`: `viewport.themeColor` entry for
  `(prefers-color-scheme: dark)`.
- `frontend/public/manifest.json`: `background_color` and `theme_color`.
- `DESIGN.md`:
  - §1 Visual Theme, the Dark line: neutral near-black (`#131312`) with the same faint
    warmth as the light greys, coral the only hue.
  - §2.1 "Dark mode" token table: the new values and notes.
  - §9 Do: "Use plum black (`#211922`) in light mode and warm off-white (`#eeeeea`) in
    dark mode for primary text".
  - §9 Don't: "Do not use pure black in dark mode — use neutral near-black (`#131312`)".
- Rule passed through: `.claude/rules/frontend-conventions.md` (code is authoritative
  for values; `DESIGN.md` records the rule and its reason).
- Runtime consumers of the tokens, unchanged in code: EPUB reader surface colours,
  `useReportPageBackground` → iOS shell page colour.
- Test: a new `frontend/src/__tests__/dark-theme-neutral.test.ts`, citing SPEC-CORE-097,
  checking I1 to I7. I2, I4 and I5 are computed from the values parsed out of
  `globals.css`, not from constants, so they keep holding the reason for the values if
  I1's table is revised later. It reads `globals.css`, `layout.tsx` and `manifest.json` and scans
  the trees named in I7.
- No protected path is edited.

## Invariants

I1. The `[data-theme="dark"]` block of `globals.css` declares exactly the 31 custom properties listed in item 1 with exactly the listed values (11 changed, 20 unchanged), plus `color-scheme: dark`, and no other declaration.
I2. Each of the 11 changed dark tokens has red and green channels within 1 of each other and a blue channel no higher than red and at most 8 below it: no dark neutral is tinted red, green or blue.
I3. The `:root, [data-theme="light"]` block of `globals.css` declares exactly the declarations listed in item 1, "The light block, unchanged", and no other.
I4. In the dark theme, relative luminance (WCAG formula) strictly increases along `--dark-surface` < `--bg-primary` < `--bg-card` < `--bg-elevated` < `--sand` < `--sand-hover`.
I5. In the dark theme, `--text-primary` and `--text-muted` have a WCAG contrast ratio of at least 4.5:1 against each of `--bg-primary`, `--bg-card`, `--bg-elevated` and `--sand`, and `--warm-silver` has at least 4.5:1 against `--bg-primary` and `--bg-card`.
I6. The `theme-color` for `(prefers-color-scheme: dark)` in `layout.tsx`, and `background_color` and `theme_color` in `manifest.json`, equal the dark `--bg-primary` as read from `globals.css`.
I7. No file under `frontend/src` (excluding every `__tests__` directory and not following the `frontend/src/addons` links), `frontend/public` or `ios/Litloft` contains, compared case-insensitively, any of the 11 "Current" hex values in item 1 or `#1a0e08` / `#2d1810`.
I8. (review only, no test) The `DESIGN.md` §2.1 dark-mode table lists, for every token it names, the same value as the `[data-theme="dark"]` block.
I9. (R-5 only) In the dark theme, the EPUB reader's book surface paints `#131312`.

## Checked, no action

- **Pure-black (OLED) theme.** Considered and drawn (`Oled.dc.html`); the owner decided
  not to add it in this change.
- **Missing-file badge contrast.** White on `bg-warm-silver/80` drops from about 5.3:1 to
  about 3.5:1 in dark mode, the same level as the light theme's badge today (about
  3.2:1). The badge is a short label over a thumbnail at 80% opacity, so its real
  contrast also depends on the picture. Left as it is: the owner accepted it at approval.
- **App icon on the PWA splash.** The icons are a penguin on dark brown; the old
  manifest colours (`#1a0e08` / `#2d1810`) were that brown. The icon now sits on a
  neutral `#131312` splash. Redrawing the icon is a separate change; the owner accepted
  this at approval.
- **The iOS shell's surround.** It takes `--bg-primary` through
  `useReportPageBackground`, whose code does not change; R-5 does not run the iOS app
  for this change.
- **Other `--warm-silver` / `--bg-elevated` pairs.** Disabled controls
  (`disabled:bg-sand disabled:text-warm-silver`, the setup stepper's
  `bg-warm-light text-warm-silver`) go from about 2.8:1 to about 3.9:1; the
  missing-count badge in the sidebar (`text-warm-silver` on `bg-warm-silver/20`) and
  `CastButton`'s accent icon on `bg-bg-elevated` (4.4:1) are not given a contrast claim.
- **Test fixtures that use `#1a0e10`** (`epubReaderCore.test.ts`, `EpubPreview.test.tsx`,
  `useReportPageBackground.test.tsx`, `shell-contract.json`, `nativeMedia.test.ts`,
  `e2e-epub/fixtures/host.html`, `e2e-epub/typography.spec.ts`,
  `ios/LitloftTests/PageColourTests.swift`, `ShellBridgeVideoTests.swift`,
  `ContractTests.swift`). They use the value as an arbitrary sample colour passed through
  validation or a bridge, not as an assertion of the theme's value, so they keep passing
  and are left as they are. They also do not prove the reader's real dark surface; that
  surface is read from `--bg-primary` at run time and is seen in R-5.
- **Addon frontends in I7.** None hard-codes a dark colour today (searched); they live in
  their own repositories, and the core test does not scan them.
- **A test that `DESIGN.md` no longer holds the old values.** Not added:
  `.claude/rules/frontend-conventions.md` forbids tests that compare `DESIGN.md` text
  against the code. The four `DESIGN.md` edits are in the touch points, and today the old
  values appear only at those places (§1, §2.1 dark table, §9 Do and Don't).
- **rgb() forms in I7.** No production file writes a theme colour as `rgb(…)`; only a
  validation fixture does. I7 matches hex only.
- **Design canvases of earlier reviews** under `docs/process/reviews/*/design/` and
  `docs/developer-guide/reviews/` contain the old colours. They are records of past
  agreements and are not edited.
- **`--danger` (`#ff8a8a`) and `--danger-bg`.** Hued on purpose (error), like the accent.
- **`manifest.json` `theme_color` for light-mode viewers.** The manifest has one value
  for both schemes and it is dark today; it stays dark (neutral). Browsers that honour
  the per-scheme `<meta name="theme-color">` from `layout.tsx` use that instead.
- **User guide.** A colour change needs no `docs/user-guide/` edit (CLAUDE.md: changes
  that only adjust how something looks need none).
- **Accent on new surfaces.** `#e85d5e` on `--bg-elevated` is 4.4:1 and on `--sand`
  3.9:1; the accent is used there for selection outlines, progress bars and icons, not
  body text. Today the same pairs are 4.8:1 and 4.3:1, so the drop is small and the
  accent is not changed to compensate.
