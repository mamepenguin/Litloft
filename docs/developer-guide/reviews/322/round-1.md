# Review R1 — ea20bd4e (feat: paint the iOS shell's status bar area in the page colour)

Reviewed SHA: ea20bd4e956e4b4550f9d235a139768d68ae1e0d. Parent for [introduced] checks: a637d307 (ea20bd4e^), run in a separate scratch worktree (since removed).
Tree restored: `git status --short` shows only `?? ios/Design/`.

## Behaviour measured at ea20bd4e (shell side)

A temporary probe test (not committed; copy kept at scratchpad/ZZReviewProbe.swift.txt) hosted the real `WebShell(serverURL: http://localhost:3000/)` as the window's root in the iPhone 17 simulator (A71C6EF0), window forced to dark, then posted `page.background` from inside the loaded page and sampled the band pixel at y = safeTop/2 with `drawHierarchy` into sRGB:

```
PROBE safeTop=62.0 webMinY=62.0 webHeight=812.0 winHeight=874.0
PROBE env/innerHeight=Optional(0px|812)
PROBE before colour band=[0, 0, 0]          (systemBackground, dark)
PROBE after #1a0e10 band=[26, 14, 16]
PROBE after #ffffff band=[255, 255, 255]
```

So on the shell side invariants 1, 3, 4 and the shell half of 2 hold at this SHA. The :3000 server serves the pre-change frontend, so the page side (the hook in AppShell actually posting on mount / on data-theme change) was NOT observed in the simulator; it rests on the vitest tests and on reading ThemeProvider/preferenceInitScript/globals.css (data-theme is the only thing that changes `--bg-primary`; the `system` theme's matchMedia listener re-applies `data-theme`, which the observer sees).

## Findings

### 1. Nothing holds the only mount of the page-colour reporter — removing it leaves every test green, and it now feeds both the band and shell video
- Label: [introduced]
- Invariant: 1, 2, 5
- Where: frontend/src/components/AppShell.tsx:18 (`useReportPageBackground();`)
- Scenario: someone moves/removes the hook call in AppShell (e.g. while restructuring AppShell). In the shell the band stays systemBackground (pure black in dark — invariant 1 broken, theme switches do nothing — invariant 2), and, because `useShellSurface` no longer reports the colour, `VideoSurface.setPageColor` is never called: shell video playback loses the page colour it used to get (invariant 5). The whole frontend suite stays green.
- Evidence:
  - HEAD, mutation F11 (delete the call in AppShell), `pnpm vitest run src/components src/hooks src/app` → LIVE, `Tests 4065 passed`. The two AppShell tests (AppShell.globalSearch / AppShell.quickNote) do not stub the shell.
  - Parent a637d307, equivalent mutation (replace `reportPageBackground(colour)` in useShellSurface.ts with `void colour`) → KILLED: `× useShellSurface > tells the shell the page's colour, and again when it changes`, `Tests 1 failed | 7 passed`.
  - So at the parent, dropping the page→shell colour report for video was caught; at HEAD the same outcome (no report at all) is not. The hook itself is well held (F1, F2, F4, F6–F10 all killed); only its mount is not.

### 2. The band in WebShell has no test: its colour, its fallback and its reach into the safe area can all be broken with the iOS suite green
- Label: [introduced] (the `band` view and property are created by this commit)
- Invariant: 1, 2, 3
- Where: ios/Litloft/Web/WebShell.swift:18 (`band.ignoresSafeArea()`), :35-38 (`band`)
- Scenario: any edit to `band` — drawing systemBackground regardless of `pageColor`, a different fallback, or dropping `.ignoresSafeArea()` so the band stops at the safe area — ships the old black band. PageColourTests only checks `WebViewModel.pageColor`, never what WebShell paints.
- Evidence (full LitloftTests suite, 194 tests, per mutation; probe output alongside):
  - S3 fallback `Color(.systemBackground)` → `Color.black`: LIVE. (Probe cannot tell them apart in dark; in light the band would be black instead of white — invariant 3.)
  - S4 band ignores `pageColor` (always systemBackground): LIVE on rerun (first run had one unrelated CoordinatorTests failure, "a file asked for from a live page leaves the page alone", which does not touch WebShell and passed on rerun). Probe: band stays `[0,0,0]` after `#1a0e10` and after `#ffffff` — invariants 1 and 2 broken.
  - S7 `band.ignoresSafeArea()` → `band`: LIVE. Probe: band `[0,0,0]` after both colours — invariant 1 broken.
  - The probe above shows the band is measurable in a unit test (host WebShell in the test host window, post `page.background`, sample the pixel at y < safeAreaInsets.top), so the gap is not a platform limit.

### 3. The bridge → VideoSurface colour wiring is untested
- Label: [pre-existing]
- Invariant: 5
- Where: ios/Litloft/Web/WebView.swift:102 (`player?.surface.setPageColor(color)`)
- Scenario: drop the surface call in the `onPageBackground` closure (e.g. when editing the closure this commit just changed); shell video no longer paints the web view's own background in the page colour behind the video. VideoSurfaceTests call `surface.setPageColor` directly, and PageColourTests only asserts the model.
- Evidence: S2 (delete the line) — HEAD: full suite LIVE. Parent a637d307: same mutation, full suite LIVE (`Test run with 192 tests in 24 suites passed`). Same result on both → pre-existing. The commit edited this closure and added a test of the neighbouring model call (S1 killed) but not of this one.

### 4. Invariant 4 (web view stays at `.ignoresSafeArea(edges: .bottom)`) has no test
- Label: [pre-existing] (the line is unchanged by this commit; not re-run at the parent, and no test at the parent references WebShell)
- Invariant: 4
- Where: ios/Litloft/Web/WebShell.swift:23
- Scenario: changing it to `.ignoresSafeArea()` puts the page under the status bar (the spec's measured regression: sidebar, search input and gallery bar under the status bar).
- Evidence: S5 `.ignoresSafeArea(edges: .bottom)` → `.ignoresSafeArea()`: full suite LIVE. Probe: `webMinY=0.0 webHeight=874.0`, `env(safe-area-inset-top)=62px`, `innerHeight=874` — invariant 4 visibly broken, nothing fails.

### 5. Prose: the comment on the WebView line invites the change invariant 4 forbids
- Label: [pre-existing]
- Invariant: 4 (risk only)
- Where: ios/Litloft/Web/WebShell.swift:20-21 ("The page reads the safe area itself, and keeping the web view inside it leaves a band the page cannot paint.")
- Scenario: read above `.ignoresSafeArea(edges: .bottom)`, it argues for letting the web view out of the safe area generally ("the page reads the safe area itself"), and the band it names is now painted by the shell. A reader could "finish the job" with `.ignoresSafeArea()`, which is exactly S5. The new comment at :15-17 already states the real constraint. Suggest deleting the older two lines rather than rewording. Bucket B.

## Mutation table

Frontend: `pnpm vitest run src/hooks/__tests__/useReportPageBackground.test.tsx` unless noted. iOS: full LitloftTests (xcodebuild test, iPhone 17 A71C6EF0, `-parallel-testing-enabled NO`) unless noted.

| id | where | mutation | want | got |
|---|---|---|---|---|
| F1 | useReportPageBackground.ts | delete `if (!isNativeShell()) return;` | kill | KILLED (older-shell test) |
| F2 | same | drop `|| colour === sent` | kill | KILLED |
| F3 | same | drop `!colour ||` | live (Swift drops an unparseable colour) | LIVE |
| F4 | same | attributeFilter `["class"]` | kill | KILLED |
| F5 | same | remove attributeFilter entirely | live (extra calls only, equal-skip absorbs) | LIVE |
| F6 | same | cleanup `() => {}` (no disconnect) | kill | KILLED (5 tests) |
| F7 | same | remove initial `report()` | kill | KILLED |
| F8 | same | remove `sent = colour` | kill | KILLED |
| F9 | same | observe `document.body` | kill | KILLED |
| F10 | same | read `--bg-secondary` | kill | KILLED |
| F11 | AppShell.tsx | delete `useReportPageBackground();` (tests: src/components src/hooks src/app) | kill | LIVE — finding 1 |
| P-F | parent useShellSurface.ts | `reportPageBackground(colour)` → `void colour` (useShellSurface.test) | kill | KILLED (parent reference for finding 1) |
| S1 | WebView.swift | delete `model?.setPageColor(color)` | kill | KILLED (PageColourTests) |
| S2 | WebView.swift | delete `player?.surface.setPageColor(color)` | kill | LIVE — finding 3 |
| P-S2 | parent WebView.swift | same as S2 | kill | LIVE (pre-existing) |
| S3 | WebShell.swift | fallback → `Color.black` | kill | LIVE — finding 2 |
| S4 | WebShell.swift | band ignores `pageColor` | kill | LIVE (rerun; first run 1 unrelated CoordinatorTests failure) — finding 2 |
| S5 | WebShell.swift | web view `.ignoresSafeArea()` | kill | LIVE — finding 4 |
| S6 | WebViewModel.swift | `setPageColor` body emptied (PageColourTests + probe) | kill | KILLED |
| S7 | WebShell.swift | `band.ignoresSafeArea()` → `band` | kill | LIVE — finding 2 |

Baselines: frontend `pnpm test` 507 files / 7414 passed; `pnpm exec tsc --noEmit` clean; iOS full suite 194 tests passed.

## Is anything missing from the R-0 list? (round 1 only)

- **Web view backgrounds without a video.** Because the colour now arrives on every page load, `VideoSurface.setPageColor` → `clearBackgrounds()` sets `webView.backgroundColor` and `underPageBackgroundColor` to the page colour on every page, not only while a video shows (the `if let pageColor` block precedes `guard showsVideo`). `WebView.makeUIView` still sets `.systemBackground` for those, which is now overwritten shortly after load. This is a behaviour change on non-video pages (overscroll paint) that no invariant covers; the spec mentions it only for new-page + old-shell. Worth declaring what the web view's own backgrounds should be with no video.
- **Page side of invariant 2** depends on `data-theme` being the only thing that changes `--bg-primary` (true today: globals.css `:root,[data-theme="light"]` / `[data-theme="dark"]`, and ThemeProvider/preferenceInitScript are the only writers). The previous per-frame poll did not depend on that. If that dependency is intended, it may deserve a line.
- **Compatibility** (old page + new shell leaves band systemBackground; new page + old shell only touches web view backgrounds) is in the spec but not in the list.

## Notes
- Simulator 4AB8B4E9 was never addressed by any command of mine; at the end `simctl list` showed it Shutdown (it was Booted at the start — changed by its own session). A71C6EF0 is shut down.

TOTAL: 5 findings
