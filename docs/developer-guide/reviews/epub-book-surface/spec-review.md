# Spec review: EPUB book surface (PR-A)

Reviewed: `docs/superpowers/specs/2026-09-27-epub-book-surface.md` and
`invariants.md`, against code at `33bbe6add`. The vendored paginator was served by
the dev server (`/epub-reader/vendor/paginator.js`, same as the scratchpad copy).

## Measurements (not findings)

Scratch Playwright harness (outside the repo): the reader files from
`frontend/public/epub-reader/` at `33bbe6add` with the reader CSP, the
`e2e-epub/fixtures/host.html` host, the `horizontal` and `vertical` fixture books,
Chromium and WebKit at 1000x800. Pixels were sampled from screenshots in the
margins (x=3 and x=30 at y=300, x=500 at y=3) and at the bottom (x=500, y=590).

- **The band reproduces at the parent commit in both engines.** Open in light,
  `theme: dark`: the body turns `#161616`, but margin pixels stay `#ffffff`
  (WebKit: x=3, x=30 and y=3 all white; Chromium: x=3 and y=3 white). The section
  body's computed `background` is
  `rgb(22, 22, 22) none repeat scroll 0% 0% / auto padding-box border-box` in
  both engines, so foliate's split in `#replaceBackground` (paginator.js
  671-693) yields one part and replaces all of it.
- **The specified CSS fixes the band in both engines.** Simulated by calling
  `renderer.setStyles("html { color-scheme; --theme-bg-color: X } html, body {
  background: X !important; color: … }")` and setting the reader `<html>`
  background, with the host root at `color-scheme: dark`. Every sampled margin
  pixel was the new colour after a light-to-dark switch, after a resize, and
  after turning into later sections (new section loads). The variable does reach
  the root in time: `setStyles` writes `$style.textContent` synchronously and
  only then queues the rAF (paginator.js 1135-1152), and `getComputedStyle` in
  the rAF recalculates. On a new section, `setStyles` runs in `afterLoad`
  (`#goTo` → `onLoad`, paginator.js 1039-1046), before `getBackground` and
  before `#beforeRender`'s own `#replaceBackground`.
- **Invariant 5 already holds at the parent commit.** Page and section were
  unchanged after one switch and after four more toggles, with zero `turned`,
  for horizontal and vertical books in both engines. The same held with the
  simulated fix. A violation would be introduced, not pre-existing.
- `getComputedStyle(root).getPropertyValue("--x")` for `--x:   #1A0E10  ;`
  returns `"#1A0E10"` (trimmed) in both engines, so the parent-side read does
  not need its own trim for the regex to pass. All six token values
  (`globals.css` 28-97) are 6-digit hex.

## Findings

### F1 — major — The reader `<html>` background is load-bearing, and only a render proves it

**What.** `Paginator.render()` (resize, `gap` / `margin` /
`max-column-count` attribute changes; paginator.js 618-636, 772-779) calls
`#beforeRender` with no `background`. `#replaceBackground(undefined, …)` then
creates columns whose `style.background = undefined` is invalid, so they are
transparent (paginator.js 671-693). After any render, the surround is the
reader document, not `docBackground`. With the fixed CSS in place and the reader
`<html>` background removed (the obvious mutation), the margins were correct
before the resize and **white** after it: WebKit showed x=3, x=30 and y=3 white;
Chromium showed x=3 and y=3 white. The white comes from the colour-scheme
mismatch backdrop between a `color-scheme: dark` parent and a reader document
with none. A theme-switch-only test lets that mutation survive. On a phone the
render path is taken on rotation, on entering or leaving full screen, and on a
margin change in the typography panel, so the white band can come back even
with `--theme-bg-color` present.

**Suggested change.** State in the spec that the reader `<html>` background is
what the surround shows after any re-render. Make the e2e for invariant 1 run a
host whose root is `color-scheme: dark` and sample margin pixels **after a
render following the switch** (resize, or a `typography` margin change), not
only right after `theme`. Optionally, also set the reader document's own
`color-scheme` to the theme name, which removes the mismatch backdrop.

### F2 — major — The host fixture is outside the touch points, and the tests that hold invariants 4 and 5 would go vacuous

**What.** `frontend/e2e-epub/fixtures/host.html` sends `open` and `theme` with no
`colors` (host.html `open` object; `window.setTheme`). Under the spec, that
`theme` is ignored. These tests would then pass without a theme change taking
place:

- `reader.spec.ts:423` "opening, resizing, changing theme and mode report no turn"
- `typography.spec.ts:242` "a theme change lays the book out no more than once"

They are what holds invariants 4 and 5. Separately,
`typography.spec.ts:214-228` asserts `bodyBg` `rgb(22, 22, 22)`, the removed
`THEMES.dark`, so it fails as written. The `open` without colours would also put
every host-driven test on the fallback path.

**Suggested change.** Add `e2e-epub/fixtures/host.html`, `reader.spec.ts` and
`typography.spec.ts` to the touch points. Make the host send `colors` on both
messages. In each theme test, assert that the theme actually applied (for
example, the body's computed background equals the sent `bg`) before asserting
that nothing moved.

### F3 — minor — The fallback is underspecified, and the spec is wrong about today's light theme

**What.** "`open` falls back to no colour CSS at all (the book's own colours, as
today's light theme does in effect)." Two problems:

1. **Today's light theme is not "no colour CSS".** It forces
   `#1f1f1f` on `#ffffff` with `!important` (reader.js 66-78), which overrides a
   book's own colours.
2. **The spec does not say whether `color-scheme` and the reader `<html>`
   background survive the fallback.** Measured with a dark host:
   - With neither, the whole reader is white in both engines. That is the mismatch
     backdrop, not the book's colours.
   - With `color-scheme: dark` kept (it is "still sent as the name"), the body is
     `#121212` (Chromium) or `#1e1e1e` (WebKit) while the margins are `#ffffff`:
     a band on the fallback path.

**Suggested change.** Spell out the fallback as a list: no `color-scheme`, no
`html, body` colours, no `--theme-bg-color`, and no reader `<html>` background.
Alternatively, use system colours (`Canvas` / `CanvasText` with the scheme
name), which puts no message string into CSS. Drop the "as today's light theme
does" comparison.

### F4 — minor — Validation needs a type check, not only the regex

**What.** `RegExp.prototype.test` coerces its argument. Structured clone
delivers arrays, so `colors: { bg: ["#aaaaaa"] }` passes
`/^#[0-9a-fA-F]{6}$/.test(...)`. The interpolated value is the same harmless
string, so this is not an injection. It is still a hole in "no string from the
message placed into CSS without passing this check". Separately,
`colors: null` or a missing `colors` must not throw inside the handler.

On the rest of the security question:

- **The regex is sufficient** to keep `;`, `}`, `url(` and `\` out of CSS.
- **Messages are accepted only** from `parentWindow` at the same origin
  (reader.js 364), so the check is defence in depth.
- **The other message-to-CSS paths are closed:**
  - the theme name is checked against `light` / `dark` (core.js 8,
    reader.js 399);
  - typography values only select entries from constant tables
    (core.js 115-160);
  - `OWN_ROOT_VAR` comes from the book's own computed font size through
    `style.setProperty`, not from a message (reader.js 317-322).

**Suggested change.** The check should require `typeof v === "string"`, and
`colors` should be a non-null object with exactly `bg`, `fg` and `link` all
passing. Keep the check separate from `isValidOpen`: failing it there would
leave the reader waiting for an `open` it never accepts, which invariant 3's
"opens" already rules out.

### F5 — minor — `--theme-bg-color` on `html` can be overridden by a book

**What.** foliate reads `--theme-bg-color` from the section root's computed
style (paginator.js 675). A book rule `:root { --theme-bg-color: … }` has higher
specificity than the planned `html { … }`, and would choose the surround colour.
The `background` / `color` declarations beside it are `!important`; the
variable is not specified that way.

**Suggested change.** Declare it `--theme-bg-color: X !important`.

### F6 — minor — Invariants 1 and 2 are broader than the code can make true

**What.**
- **Invariant 1** says "every pixel … outside the text". A book's images, and
  elements the book gives their own background (a boxed aside, a table cell),
  are outside the text and keep their colours, because only `html, body` are
  overridden. The invariant is then false with no mutation.
- **Invariant 2** says the text colour is `--text-primary`. A book that sets
  `p { color: … }` keeps it, because the colour is set on `html, body` only and
  inherits. This is pre-existing: `THEMES` had the same shape.

**Suggested change.** Scope invariant 1 to the margins, the gutters and the
body background, sampled on an uncoloured fixture. Scope invariant 2 to the
computed `color` of `body` and of an unstyled `a:link` in an uncoloured fixture.

### F7 — minor — One part of the spec's change list already exists

**What.** "The effect that sends it also re-sends when the theme attribute
changes" is already true: `useSyncExternalStore` observes `data-theme`
(EpubPreview.tsx 27-35, 48), and the effect in useEpubReader.ts 181-184 posts
`theme` on every change once ready. The new risk is elsewhere. `open` would take
`theme` from `themeRef.current` (last render) and the colours from a live read.
In the window between the attribute changing and React re-rendering, the two can
disagree: a dark `bg` with `color-scheme: light`. This corrects itself at
`ready`, when the effect re-sends.

**Suggested change.** Derive the name and the colours from the same read at
send time (read `data-theme` next to the variables), and drop the "also
re-sends" item as work to do.

### F8 — minor — More places the change reaches that the touch points leave out

**What.**
- **`bg-bg-card` elsewhere in `EpubPreview`.** The error-state wrapper
  (EpubPreview.tsx 190) and the full-screen button `bg-bg-card/80` (344) stay on
  `bg-bg-card`. So do the panels (EpubTocPanel.tsx 69,
  EpubTypographyPanel.tsx 85). The spec names only the frame box, the overlay
  and the chrome bands, so which of the rest change is undecided.
- **jsdom has no stylesheet.** `EpubPreview.test.tsx` sets `data-theme`
  (line 84) and asserts `theme` posts (402-409). Under jsdom,
  `getPropertyValue("--bg-primary")` is `""`, so every parent-side test sends
  colours that fail validation unless it sets the variables inline.
- **Existing preview harness.** `e2e-epub/preview/` (the real `FilePreview`
  with `globals.built.css`) is the place where parent-read colours can be
  checked end to end, by toggling `data-theme` and sampling margins. It is not
  mentioned.

**Suggested change.** List these, and say which `bg-bg-card` uses move. Name
the preview harness as the end-to-end test for invariant 1 (with F1's render
step).

### F9 — minor — A "Checked, no action" reason is wrong about the current code

**What.** "A book that sets its own background image: … foliate keeps any image
part after the colour when it substitutes `--theme-bg-color`." The reader's rule
is the `background` shorthand with `!important` (reader.js 75, kept by the
spec), and that resets `background-image` to `none` on `html` and `body`. So
`getBackground` (paginator.js 179-185) never sees an image, except one set
inline with `!important`, and a cover page's body image is already erased
today. The conclusion (no action) stands; the reason does not.

**Suggested change.** Delete the second clause.

### F10 — minor — [pre-existing] A section without `<head>` gets no reader CSS

**What.** foliate inserts the style elements only `if (doc.head)`
(paginator.js 1012-1019), and `setStyles` returns when there are none
(1137-1138). Such a section gets no theme and no `--theme-bg-color`, so the band
stays for it after the fix. This behaviour is the same at `33bbe6add`.

**Suggested change.** Record it under "Checked, no action" or in the ledger. It
is not for this PR.

TOTAL: 10 findings
