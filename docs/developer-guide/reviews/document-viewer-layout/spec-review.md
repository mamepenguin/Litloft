# Spec review: document-viewer-layout (PR-B)

Reviewed: `docs/superpowers/specs/2026-09-27-document-viewer-layout.md` and
`invariants.md` against `cb329495e`. Pre-implementation; findings are about
whether the spec, as written, can be implemented against the current code and
whether the invariants hold what they claim. Measurements taken on the running
app (http://localhost:3000) with Playwright unless stated.

## Gutter (spec §1, invariant 1)

### S-1 [blocker] "The player block cancels the top padding" puts the book 16 px above the canvas on a phone

- **What.** On a phone there is no top padding to cancel: `[data-sheet-snap] .media-detail-host { padding-top: 0 }` already removes it, and the only phone-side counter-rule zeroes `margin-top` on the player's *first child*, not on the wrapper. A `-mt-4` on `.media-detail-player` (what "the player block cancels" reads as) moves the book up past the canvas's top edge. The canvas `<main>` scrolls, so those 16 px end up under the page row and can't be reached.
- **Evidence.** `globals.css:1149-1161`. iPhone 13 profile (390×664), EPUB: canvas `<main>` top y=104, book root y=104 today. With `margin:-1rem` on `.media-detail-player` the root sits at y=88, 16 px above `<main>`. With the same margin on the root (first child), it stays at y=104 because the phone rule cancels it.
- **Spec change.** Name the element that carries the bleed and the phone behaviour. Either put it on the viewer's root, the wrapper's first child (the video pattern, `FilePreview.tsx:116,138`), so the existing phone rule applies, or put it on the wrapper and add a `[data-sheet-snap]` counter-rule for the wrapper's top margin. Write "top padding is cancelled only where the host has one (not under `[data-sheet-snap]`)".

### S-2 [major] Negative margins on the viewer root shift it sideways without widening it

- **What.** `EpubPreview`'s root and `PdfPreview`'s root are both `w-full`. A `width: 100%` box with `-mx-4` moves 16 px left and keeps its width, which leaves a 32 px gutter on the right. Only a box with `width: auto` grows into negative margins, which is why video's `-mx-4` works (its div has no width).
- **Evidence.** `EpubPreview.tsx:205`, `PdfPreview.tsx:508`. Measured with `margin:-1rem` on the root: phone EPUB goes from x=16 w=358 to x=0 w=358; desktop 1280×800 EPUB goes from x=256 w=624 to x=240 w=624; desktop PDF goes from x=256 w=624 to x=240 w=624. The same margin on `.media-detail-player` gives w=390 (phone) and w=656 (desktop), the full canvas column. The PDF floor rule makes the first child a flex item (`globals.css:1290-1301`), but `w-full` still stops it stretching.
- **Spec change.** Choose one mechanism and state it. (a) Put the bleed on the wrapper through a host or wrapper attribute set by `MediaCanvas`, plus the phone top-margin counter-rule from S-1. (b) Put the bleed on the root and replace `w-full` with `width: auto` or `calc(100% + 2rem)`. (a) keeps the viewers unaware of their host, which is the rule the existing `globals.css:1152-1156` comment follows. Note that (a) also bleeds the `file-preview-actions` row inside the wrapper (`MediaPlayerBlock.tsx:111`, `px-3`). Say whether that is intended.

### S-3 [major] The collection route renders EPUB/PDF through `FileDetailCanvas`, which the spec leaves out

- **What.** `/files/{id}` (`?collection=` / `?folder_play=1`) does not ride the shell (`ridesFileDetailShell` returns false when `surface !== "canonical"`). EPUB/PDF there go through `FileDetailPresenter` → `FileDetailCanvas` inside `FileDetailFullScreen`'s `px-4 py-6 max-w-5xl` column. The spec decides the bleed "in `MediaCanvas`" but drops `rounded-xl` inside `EpubPreview`/`PdfPreview`, which render on every surface. On the collection route that leaves a square-cornered card sitting inside the gutters. That breaks DESIGN.md §5 ("Do not expose less than 12px border-radius on outer surfaces"), and the new §5 wording ("edge-to-edge … at every width") would be false there.
- **Evidence.** `fileDetailShell.ts:59-68`, `FileDetailPresenter.tsx:105-196`, `FileDetailFullScreen.tsx:135,146,185`, `FileDetailCanvas.tsx:105` (no host padding). `RightPaneFile` uses the canonical surface, so it is covered by `MediaCanvas`.
- **Spec change.** Either bleed on the collection route too, or tie the radius to the bleed (CSS keyed on the same attribute, so a viewer that isn't bled keeps `rounded-xl`) and write in "Checked, no action" that the collection route keeps its card. Add `FileDetailCanvas`/`FileDetailFullScreen` to the touch points or to "Not touched". Invariant 1 should name the surface: "on the canonical file page".

### S-4 [major, possible C] On a phone the reading area shrinks after this change

- **What.** Motivation 1 is a larger reading area on a phone. On a phone the book already starts at the canvas top (S-1), so the change gains 32 px of width only. The bar goes from one 40 px row to two. Row 1 is 44 px on a coarse pointer by the spec. Row 2 holds buttons, and DESIGN.md requires 44 px targets on a coarse pointer, so it is also about 44 px. The frame height is set by `useFillHeight` and does not change, so the book loses about 48 px of height.
- **Evidence.** iPhone 13 profile, EPUB today: frame 358×472, bar 40, book iframe 358×432 = 154,656 px². After the change, assuming an 88 px bar: 390×384 = 149,760 px², about 3 % less. Rules: DESIGN.md:532 ("Every button reaches a 44px touch target on a coarse pointer") and :899. Bar height today: `EpubPreview.tsx:305,324` (`h-10`).
- **Spec change.** State row 1 and row 2 heights for each pointer type; the spec only says "fixed per pointer type". Then either accept the trade and correct the "Why", or reach the 44 px floor without stacking two full rows. For example, row 1's hit area could overhang row 2's upper half, since the thumb draws in only 4-14 px; DESIGN says to grow hit areas down a column rather than stack them. This changes the design, so it is for the supervisor.

## Bar and slider (spec §2-§3, invariants 2-5)

### S-5 [minor] Key the focus state to the input's `:focus-visible`; `focus-within` on the row is broader

- **What.** The only focusable element in the row is the hidden range input, so `focus-within` fires on any focus, including focus that is not visible. The accent state would then turn on in cases the spec calls "keyboard focus". The existing bar already uses `peer-focus-visible:`. The track, fill and knob come after the input as siblings, and new marks and the bubble can too, so `peer-focus-visible` covers every state change without `focus-within`.
- **Evidence.** `EpubPositionBar.tsx:27-28` (`peer … opacity-0 pointer-events-none`), `:147-166`, `:170`. Pointer presses call `preventDefault` (`:136`), so a pointer never moves focus onto the input; `focus-within` adds only the non-visible cases.
- **Spec change.** Replace "`focus-visible` / `focus-within` on the row" with "`:focus-visible` on the input (`peer-focus-visible`, or `:has(input:focus-visible)` on the row)". Also state that hover uses Tailwind's `hover:` variant, which v4 gates on `(hover: hover)`. A raw `:hover` in `globals.css` would stick on iOS after a tap and leave the accent state on after a touch drag.

### S-6 [minor] The bubble needs clamping, or the frame edge clips it at the ends

- **What.** The frame is `overflow-hidden` and now spans edge to edge. A bubble centred on a thumb near 0 % or 100 % (or near 100 % / 0 % mirrored for RTL) runs past the frame's side and is clipped. The thumb has the same problem and already clamps itself (`calc(visual% + (0.5 - visual) * 16px)`); the bubble is wider and varies in width. Vertically it is safe, because it sits over the book inside the frame, in inline mode and in both full-screen modes. It overlays the reader iframe, so it must be `pointer-events-none`.
- **Evidence.** `EpubPreview.tsx:212` (`overflow-hidden`), `EpubPositionBar.tsx:183`.
- **Spec change.** Add: the bubble's horizontal position is clamped to the row, it has a max width, and the chapter name truncates inside it.

### S-7 [minor] Chapter marks: duplicate fractions, marks next to the ends, and a count cap that doesn't prevent crowding

- **What.** (a) TOC entries in the same file share that file's start fraction. Two depth-0 entries anchored inside one XHTML file therefore give two marks at the same place, and both count toward the 24. (b) Front matter clusters near 0. The test book on the running app has one depth-0 entry, at fraction 0.0015, which is about 0.6 px from the start of a 390 px track: a mark nobody can tell from the start, and it reads as a rendering glitch. (c) The cap is justified by a 320 px track, but after S-2 the track is 358-390 px on a phone and up to about 1000 px on a desktop. A count doesn't stop five marks landing 2 px apart.
- **Evidence.** `epubToc.ts:11-23`; `public/epub-reader/core.js:90-115` (fraction = the section's start); TOC captured from the `ready` message of `4zQh_nJy5Cwa`: `{total: 2, depth0: 1, depth0Inner: 1, fraction: 0.0015}`.
- **Spec change.** Count and draw distinct fractions. Replace or supplement the count cap with a minimum spacing in px, measured against the track, from each other and from both ends. At minimum, keep marks away from the ends. State the rule in the invariant (invariant 5) so a unit test can check it.

### S-8 [minor] Invariant 4's "one `turned`, one WatchHistory write" is false for a seek that lands on the current page

- **What.** The reader posts `turned` only when the location key changes, and the WatchHistory write hangs off `turned`. If a drag is released at a fraction on the page already shown, correct code posts no `turned` and writes nothing, so the invariant as written fails.
- **Evidence.** `public/epub-reader/reader.js:151-162, 271-279`; `useEpubReader.ts:165-174`.
- **Spec change.** "Release sends exactly one seek to the dragged fraction; at most one `turned` (and so at most one WatchHistory write) follows; a cancelled drag sends none."

### S-9 [minor] Invariant 2 can't be broken where it claims coverage, and nothing can measure invariant 3's coarse-pointer half

- **What.** Full-screen chrome show/hide changes only `opacity` and `inert`, never layout, so the clause "across … full-screen chrome show / hide" can't be violated by any mutation. What can break is the per-pointer height: a hover or drag class that changes a row's height, or a row 2 that wraps. The e2e-epub harness runs only desktop Chromium and WebKit at 1000×800, fine pointer, so the coarse half of invariants 2-3 (44 px row, neutral thumb, 20 px drag thumb) has no harness. The harness also mounts a bare `FilePreview` with no `<main>` or `.media-detail-host`, so it can't measure invariant 1.
- **Evidence.** `useAutoHidingChrome.ts:103-108`; `playwright-epub.config.ts` (projects); `e2e-epub/preview/app.tsx` (renders `FilePreview` only).
- **Spec change.** Rewrite invariant 2 as "bar height = F px (fine) / C px (coarse) in rest, hover, focus-visible and drag, and with a long or empty chapter label", and drop the chrome clause. Add a coarse project (`hasTouch`, `isMobile`) to e2e-epub, or measure in e2e-components. Measure invariant 1 in a fixture that includes the host and `<main>`.

## Panels and full screen (spec §4, invariants 6-7)

### S-10 [major] `panelStyle` hard-codes the old one-row bar, so a panel in full screen will overlap the two-row bar

- **What.** In full screen the bar is an absolute overlay at the bottom of the frame, and the panel is kept clear of it by the literal `calc(2.5rem + 0.5rem)`, which assumes today's 40 px `h-10` bar. A two-row bar with a different height per pointer type makes that constant wrong in full screen, so the panel covers row 2. Inline, the spec's "sit flush on top of the bar" needs `bottom: 0` instead of today's `0.5rem`, and a sheet "spanning the frame" needs `inset-x-0` instead of `inset-x-2`. Neither `panelStyle` nor the `className` passed to the panels is in the touch points. The spec's only line on this is "the height stays capped by the frame".
- **Evidence.** `EpubPreview.tsx:83-84` (`panelBottom`, `maxHeight`), `:266,274` (`absolute inset-x-2`), `:292-305` (full-screen chrome and bar `h-10`), `:324`.
- **Spec change.** Define one per-pointer bar height (a CSS custom property set under `(pointer: coarse)`). Use it for the bar's height and for the panel's `bottom`/`max-height` in full screen, and set `bottom: 0` inline for both panel forms. Add `panelStyle` to the touch points. Invariant 7's "touches the bar" and "above the bar" must be measured in full screen as well as inline.

### S-11 [major] A container query on the frame box goes against the repo's recorded iOS hazard, and a safer container is available

- **What.** `globals.css` records that on iOS Safari a `container-type` wrapped around a `<video>` or a cross-origin iframe renders the whole subtree rotated and spinning. The frame box contains the reader iframe. `reader.html` is same-origin (no `sandbox`, CSP only), but foliate draws the book in nested iframes of its own. The spec neither addresses the hazard nor asks for an iOS check. `container-type` also brings layout containment, which makes the frame the containing block for fixed descendants (`globals.css:1284-1287`). That is harmless today because the scrim's class is overridden to `absolute`, but it is a trap for later.
- **Evidence.** `globals.css:825-827`, `:1284-1287`; `EpubPreview.tsx:208-217` (frame), `:236-242` (iframe); `lib/epubReaderCsp.ts` (no sandbox).
- **Spec change.** Make the size container an iframe-free box: an `absolute inset-0` wrapper around `DismissScrim` and its panel, placed as a sibling of the iframe inside the book box. The scrim and panel stay adjacent inside it, so DismissScrim's `nextElementSibling` rule (`DismissScrim.tsx:113-115`) still holds. Its width is the book box, which in pseudo full screen is inset by the safe areas (`EpubPreview.tsx:228-231`). That is the width the panel actually lays out in, so it is the better number to compare against 512 px. Whichever box is chosen, require a check on the iOS simulator (pseudo full screen and inline) before merge.

### S-12 [minor] The panel's own radius and border are not "placement classes only"

- **What.** Both panels hard-code `rounded-xl border … shadow-lg` in their components. The sheet form needs `rounded-t-2xl` and no bottom border; otherwise its border doubles the bar's `border-t` inline (and the chrome's `border-t` in full screen). Those classes depend on the container, so they live in the panel components or become props, not placement. Separately, the app's other bottom-sheet popups dim below 640 px (`MENU_SCRIM`), and the spec doesn't say whether the EPUB sheet dims.
- **Evidence.** `EpubTocPanel.tsx:69`, `EpubTypographyPanel.tsx:58`, `EpubPreview.tsx:294,324`, `DismissScrim.tsx:5-10`.
- **Spec change.** List the radius, border and shadow per form, including "no bottom border on the sheet". State whether the sheet form dims, or add it to "Checked, no action".

### S-13 [minor] In full screen a taller bar covers more of the page, and the reader isn't told

- **What.** In full screen the book box extends under the bottom chrome (in pseudo mode its `bottom` is only the safe-area inset, and in native mode it is `inset-0`), and the chrome overlays it. Going from 40 px to two rows (up to about 88 px on a coarse pointer, S-4) roughly doubles the strip of text hidden while the chrome is shown. The chrome is held open during a drag and while a panel is open, and that is exactly when the reader wants to see the page.
- **Evidence.** `EpubPreview.tsx:221-235, 292-302`; `useAutoHidingChrome` hold (`EpubPreview.tsx:62-65`).
- **Spec change.** Record it in "Checked, no action", or give the full-screen bar a single row. The spec already removes the full-screen button from the bar in full screen, so row 2 has less in it there.

## Touch points and claims

### S-14 [minor] Places the change will reach that the touch-point list leaves out

- `globals.css`: `[data-sheet-snap] .media-detail-host` / `.media-detail-player > :first-child` (`:1149-1161`), the canvas-floor rules (`:1290-1301`), and `.media-detail-player:has([data-epub-reader])` (`:1094`). All of them interact with whichever element carries the bleed (S-1, S-2).
- The collection route: `FileDetailCanvas.tsx`, `FileDetailFullScreen.tsx` (S-3).
- `EpubPreview.tsx`'s `panelStyle` and the panels' `className` (S-10), and its error state (`:190`, `rounded-xl bg-bg-card`). That box replaces the frame when the book fails to open; after the bleed it would be a rounded card that bleeds to the edges, or one that doesn't.
- `useFillHeight`. It is reached but needs no change: with a 16 px top bleed on the desktop the root re-measures from 607 to 623 px tall (measured), because the host's resize fires the observer. It belongs in the touch-point list as "verified, unchanged".
- DESIGN.md §5's general rule ("no less than 12px on outer surfaces"), not only the exception, since S-3 decides which surfaces the exception covers.
- `MediaPlayerBlock`'s `file-preview-actions` row, if the bleed goes on the wrapper (S-2).

### S-15 [minor] [pre-existing] The bar's buttons use `disabled:opacity-30`, which DESIGN.md forbids

- **What.** The contents, Aa and full-screen buttons fade when disabled. The full-screen button is being moved into row 2 and the other two re-laid out, so this is the change that could correct it. It is recorded as pre-existing, not as introduced.
- **Evidence.** `EpubPositionBar.tsx:110,122`, `EpubPreview.tsx:344`; DESIGN.md §6 Buttons ("Do not use `disabled:opacity-*`").
- **Spec change.** None required. Either say that row 2 buttons follow the disabled rule, or list it in "Checked, no action".

## Claims about current code, checked

Correct as stated: the 16 px `MediaCanvas` gutter (`MediaCanvas.tsx:62`); the rounded frame (`EpubPreview.tsx:215`) and PDF card (`PdfPreview.tsx:508`); the always-accent thumb (`EpubPositionBar.tsx:182`); the full-screen button floating over the book (`EpubPreview.tsx:339-356`); panels spanning the frame (`inset-x-2`); the `drag` state existing for `data-dragging` (`EpubPositionBar.tsx:66`); arrows turning pages (`:15-20,157-162`); `TocEntry` carrying `depth` and nullable `fraction` (`epubReaderChannel.ts:9-14`). The one claim that is wrong is the implicit one that a top padding exists to cancel on a phone (S-1).

TOTAL: 15 findings
