# PR-2 review, round 2 — fix commit `12fc6fc1a` (progress / UI side)

Reviewed SHA: `12fc6fc1a` on `15e18db86` (detached worktree `<review-worktree>`).
Baseline: vitest 8 files / 319 tests green; playwright-epub 63 passed, 3 skipped (touch specs skip webkit).

## Question 1 — did the fix do what round 1 asked? (mutation table)

Runner: one textual replacement → named suite → file restored from a copy (`git status` clean after each). "unit" = the vitest command from the brief; "e2e" = `playwright-epub`, filtered with `-g` to the relevant describe blocks (both projects; touch tests run in chromium only).

| id | where | mutation | want | outcome |
|---|---|---|---|---|
| R1 | core.js restoreAnchor | clamp removed (`Math.round(inSection*T)/(T-1)`) | kill | killed: unit (new narrow→wide model test) and e2e narrow→wide in 3 of 4 cells (chromium×vertical, webkit×both). **chromium×horizontal passes with the clamp removed** — that cell never reaches the overflow. |
| R2 | core.js restoreAnchor | on overflow return page 0 instead of the last text page (`r > T-1 ? 0 : r`) | kill | **live** (unit + e2e) → F2 |
| R3 | core.js restoreAnchor | returns `inSection` (round-1 M8) | kill | killed by e2e "every page … reopens on itself", all 4 cells. P5 is closed. |
| Z1 | reader.js zoom guard | back to the reader's own `window.visualViewport` | kill | killed (zoom e2e, chromium) |
| Z2 | reader.js zoom guard | guard removed | kill | killed |
| Z3 | reader.js zoom guard | `zoom > 1` → `zoom >= 1` | kill | killed (swipe + edge-tap e2e) |
| T1 | reader.js `mode` | message ignored | kill | killed (edge-tap e2e) — the edge-tap test does depend on `mode` |
| T2 | reader.js touch | `stop` made a no-op | kill | killed (swipe, zoom e2e) |
| T3 | reader.js keys | reader-side key turn dropped | kill | killed (both engines) |
| T4 | reader.js link | in-book link bypasses `turn()` | kill | killed (both engines) |
| T5 | reader.js edge tap | edge tap no longer requires full screen | kill | killed |
| T6 | reader.js edge tap | frame offset dropped (`x = t.clientX`) | kill | **live** — code from `15e18db86`; the new edge-tap test taps only on the opening page. → F6 |
| C1 | EpubPreview toolbar | enter button `onClick` no-op | kill | killed |
| C2 | EpubPreview toolbar | exit button `onClick` no-op | kill | killed |
| C3 | EpubPreview toolbar | `disabled={!ready}` removed | kill | killed |
| C4 | EpubPreview toolbar | branch on `isPseudo` instead of `isFullscreen` | kill | **live** — the test sets both flags together; native full screen (desktop) is never rendered. → F5 |
| C5 | EpubPreview iframe | `absolute inset-0` removed (back to `h-full` in flow — the 150 px iframe) | kill | **live** → F4 |
| C6 | EpubPreview area | `min-h-0 flex-1` removed from the iframe's area | kill | **live** → F4 |
| P12 | EpubPreview iframe | `key={file.id}` removed | kill | killed (new file-change test) |
| P21 | useEpubReader | `setStatus({kind:"loading"})` on file change removed | kill | **live** → F3 |
| P10 | useEpubReader | no focus on entering full screen | kill | killed |
| P10b | useEpubReader | focus on **leaving** instead of entering | kill | **live** → F3 |
| P10c | useEpubReader | focus on every mode change | live | live (harmless) |
| P11 | EpubPreview | full-screen context `blocksLower = false` | kill | killed |
| P17 | FilePreview | EPUB branch removed | kill | killed |
| P18 | fileDetailShell | EPUB removed from `FLOORED_MIMES` | kill | killed |

Summary: P1 (anchor), P3 (keys, links, swipes, mode), P5 (round trip), P7 (zoom guard) and the parent-side items P12/P17/P18/P11/P10 are now held. Survivors: R2, T6, C4, C5/C6, P21, P10b.

The zoom e2e stubs `visualViewport.scale` on the host page (`window` of `host.html`, the reader's `top`), and Z1 shows it fails when the guard reads the reader's own viewport, so it holds what its name says — as far as a property stub can; the real pinch path is only measurable on a device.

Extra checks on the restructured frame (unit): keying the new iframe-area `div` on `isFullscreen` or on `isPseudo` (want=kill) is killed by "entering and leaving full screen keeps the same frame and does not fetch again" — invariant 7 still holds through the new wrapper.

T6 follow-up (throwaway spec, deleted): with the frame offset dropped, edge taps after three turns in `horizontal.epub` and `vertical.epub` behave identically to the real code in chromium. Equivalent in chromium; WebKit touch is not drivable here, so the line is unheld on the engine iOS uses. Code from `15e18db86`; not raised as a finding of this round.

## Live measurements (running stack at `12fc6fc1a`, file `4BO4MC4QbR30`, scripts in `scratchpad/live/`)

Desktop 1280×800, chromium and webkit, native full screen:
- inline: frame 624×487, iframe 624×447 (toolbar 40) — the 150 px iframe is gone.
- button → `document.fullscreenElement` is the frame; frame 1280×800, iframe 1280×760, X at (1240,4) 32×32, `elementFromPoint` at its centre is the button; focus is in the reader iframe.
- X → back inline, same sizes. Focus after exit: chromium keeps it on the (reused) button; webkit drops it to `body`.

Phone emulation (chromium, iPhone 13 profile, `requestFullscreen` stubbed to reject so the pseudo path runs):
- inline: frame 358×398, iframe 358×358 (the toolbar takes 40 px of the 60dvh box).
- tap button → pinned: frame 390×664 at (0,0), `z-index: 60`, `data-pseudo-fullscreen`, iframe 390×624, X at (350,4) and hit-testable (not covered by Header or chrome buttons), history entry pushed (`litloftFullscreen`), focus in the reader. The slot wrapper keeps 358×398, so the page beneath does not move.
- leaving by the X, by browser back, and by a downward swipe starting on the toolbar: all three unpin, the history marker is gone afterwards, no extra entry is left.
- chromium cannot emulate `env(safe-area-inset-*)`, so the notch / Dynamic Island case is F1 below.

## Findings

### F1. The full-screen toolbar ignores the safe area, unlike every other full-screen toolbar here
- Labels: `[introduced]` (the toolbar is new in `12fc6fc1a`), invariant 13 (touch must be able to leave full screen), severity medium if the measurement confirms it, otherwise low.
- Where: `EpubPreview.tsx` toolbar row `flex h-10 shrink-0 items-center justify-end … px-2`, inside a frame pinned `fixed inset-0`.
- Why it matters: `viewportFit: "cover"` (`layout.tsx`), and #380 makes the iOS shell hide the status bar and let the web view ignore the top safe area while immersive — which `useFullscreen` requests on the pseudo path for the EPUB too. The PDF, image and video full-screen toolbars all pad with `env(safe-area-inset-top)` / `-right` (`PdfFullscreenViewer.tsx`, `ImageGallery.tsx`, `TouchControlsPresenter.tsx`); this one puts the only exit button at 4 px from the physical top and 8 px from the right edge.
- Not asserted, measure: iOS simulator, iPhone with a Dynamic Island (e.g. 15 Pro), both in the Litloft iOS app and in Safari added to the Home Screen: open the EPUB, tap "Read full screen", and in portrait and in both landscape orientations (a) screenshot whether the X is clipped by the rounded corner or under the island / status area, (b) tap the X's centre with idb and check the frame unpins (`data-pseudo-fullscreen` gone). Also note whether the book's first line sits under the island (the reader has no top inset either, but that part is older).

### F2. The reopen tests hold "not the blank pad", not "near the saved place"
- Labels: `[introduced]` (tests added in the fix), invariant 14 (held as worded), severity low.
- Mutation R2: on overflow, return the section's first page instead of its last text page. Both the unit case ("never lands past the last text page") and the e2e ("a place taken in a narrow window never reopens on a blank page", which only asserts `1 ≤ page ≤ pages-2`) stay green in all four cells. A phone→desktop reopen that lands at the chapter start would ship green.
- Also: with the clamp removed entirely (R1), chromium×horizontal still passes — that cell's walk never produces a rounded page past the end, so only three of the four cells carry the assertion.
- Suggested: assert the reopened page is the section's last text page (`pages - 2`) and the same `index`.

### F3. Two component tests do not hold what their names say
- Labels: `[introduced]`, invariant 15 / 13, severity low.
- P21 (`setStatus({kind:"loading"})` removed on file change) is live. "moving to another book loads a new reader…" moves on from a book that only sent `boot`, so the status was still `loading` anyway. Moving from a **ready** book leaves the status `ready`: no loading overlay over the blank new iframe, and the full-screen button and `f` are enabled before the new reader has a book. Holding it needs the first reader to send `ready` before the rerender.
- P10b (focus the reader on **leaving** full screen instead of entering) is live. "entering full screen hands focus to the reader" installs the spy, then goes true→false→true and asserts `focus` was called at all, so the false step satisfies it. Assert the call count right after the false step (0) and after the true step (1).

### F4. The iframe-height fix has no test that fails without it
- Labels: `[introduced]`, invariant none (it is the author's own R-5 finding), severity low-medium (the regression is a 150 px reader on desktop, with every test green).
- Mutations C5 (iframe back to `h-full` in flow) and C6 (area loses `min-h-0 flex-1`) are live; jsdom lays nothing out and `e2e-epub` uses `host.html`, not `EpubPreview`.
- Measured live (above): iframe 447 px of a 487 px frame inline on desktop. What to hold: an `e2e-layout` case rendering `EpubPreview` (or its frame markup) at 1280×800 and asserting the iframe's height is the frame's height minus the toolbar, inline and in full screen.

### F5. Native full screen is never rendered in the component tests
- Labels: `[introduced]`, invariant 13, severity low.
- Mutation C4 (toolbar branches on `isPseudo` instead of `isFullscreen`) is live: the toolbar test sets `isFullscreen` and `isPseudo` together. With C4 on desktop native full screen the toolbar would show "Read full screen" (whose `toggle` still exits, so it is a wrong label rather than a dead end). A case with `isFullscreen: true, isPseudo: false` holds it.

### F6. The 40 px toolbar strip is now a live zone for `useFullscreen`'s swipe and pinch idioms, and only it is
- Labels: `[introduced]` (the strip is the only part of the frame in the parent document), invariant none, severity low — a decision, not a defect.
- Measured (phone emulation, `scratchpad/live/scroll.mjs`): a 120 px upward drag that starts on the inline toolbar strip pins the reader (`data-pseudo-fullscreen="true"`). A downward drag starting on the pinned toolbar exits. The same drags over the book do nothing (the reader stops them), as in round 1.
- Effect on a phone: someone dragging the detail page upward from that strip gets full screen instead. This is the video player's own idiom, so it may be wanted; but it is reachable on 40 px of a 398 px frame, which reads as accidental rather than designed. Measure on iOS whether that drag also scrolls the page / moves the inspector sheet before deciding.

### F7. The zoom guard reads `window.top`, which throws if Litloft is ever framed by another origin
- Labels: `[introduced]`, invariant none, severity low.
- Where: `reader.js` touchend, `(window.top?.visualViewport ?? window.visualViewport)?.scale`. `visualViewport` is not on the cross-origin `WindowProxy` allowlist, so if the Litloft page is embedded cross-origin (the app page sends no `frame-ancestors` / `X-Frame-Options`, checked with `curl -I`), every touchend in the reader throws before `swipeAction` and swipes / edge taps do nothing. Nothing is written, so no invariant breaks; the reader just goes dead to touch. The reader already only trusts `window.parent` (same-origin checked on every message), and on the page that holds it `parent` is where the pinch happens; reading `parentWindow.visualViewport` would cover the supported case without the cross-origin hazard. No supported deployment embeds Litloft, hence low.

## Question 2 — what the fix broke (summary)

Nothing a user hits in the measured paths: desktop inline height, native full screen enter/exit by button, and on a phone the pinned frame, its z-order over the header/chrome, the history entry, back, the X and the swipe-down all behave. Focus after the X: chromium keeps it on the button, webkit drops it to `body` (then the inline shortcuts still work on the page; not raised). Open items are measurements this environment cannot take: F1 (safe area, iOS simulator) and F6 (whether the strip drag also scrolls the page on iOS).

## Question 3 — trajectory

There is one fix round, so the comparison is fix vs. original. Of the round-1 items, the zoom guard is a **replacement** (reads a different viewport; no new branch), the toolbar is new UI for a gap (P2), and P3/P5/P6 are tests only. **One item does extend a prediction the original added:** `restoreAnchor` exists because the original predicts foliate's placement formula (`round(anchor·(T−1))`, `T = pages − 2`) and inverts it; this round adds a clamp to that inversion for a case the inversion did not anticipate (a fraction from a different layout). That is exactly the shape the rule describes — a second layer of compensation over foliate's internals — but it is one round, not two in a row, so it is not yet a C by the rule. Say it plainly: **if a later round touches `restoreAnchor` again (another edge of foliate's paging, pads, `max-column-count`, vertical books), the design of restoring by a rescaled fraction is being patched**, and the alternative worth weighing is one that removes the prediction (restore from a CFI / foliate's own location, accepting foliate's placement) rather than adding to it. The security-side changes in the same commit (a third CSP probe, sanitizer re-parse check) are outside this review's scope and were not assessed for trajectory.

Tree state: all mutations restored, throwaway spec `frontend/e2e-epub/zz-edge.spec.ts` deleted; `git status` of the worktree clean.

TOTAL: 7 findings
