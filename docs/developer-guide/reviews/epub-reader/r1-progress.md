# PR-2 review, round 1 — progress contract, full screen, keys, parent integration

Reviewed SHA: `15e18db86` (detached worktree `<review-worktree>`).
Baseline: vitest 8 files / 273 tests green; playwright-epub 22/22 green (chromium + webkit).

## Findings

### F1. Reopening at a larger window near a chapter's end lands on foliate's trailing blank page
- Labels: `[introduced]` (core.js is new), invariant: none (6 is stated "at the same size"; this is the cross-device case the Goal names: "come back to where you stopped on any device").
- Where: `frontend/public/epub-reader/core.js:12-16` (`restoreAnchor`), used at `reader.js:150-153`.
- Mechanism: `restoreAnchor` returns `round(inSection * T) / (T - 1)` with `T` = text pages **at the reopening size**. When `inSection` is close to 1 and the new layout has at most about half the text pages of the old one, `round(inSection*T) == T`, so the anchor is `T/(T-1) > 1`; foliate then places page `round(anchor*(T-1)) + 1 = T + 1 = pages - 1`, which is the blank pad after the last text page. foliate's own formula `round(a*(T-1))` can never exceed `T-1`; the rescale removed that bound. The anchor is also kept as foliate's `#anchor`, so every later reflow (resize, entering full screen) re-lands on the pad until the reader turns.
- Reproduction (scratch spec, removed afterwards): viewport 420x700, open `horizontal.epub`, turn to the last text page of chapter 1 (index 1, page 9 of 11, `turned.fraction = 0.3777…`), then viewport 1400x900 and reopen with that fraction. Observed in **both chromium and webkit**: `{index: 1, page: 5, pages: 6}` → `page == pages - 1`, the trailing blank page. The user sees an empty page; the next turn moves into chapter 2.
- Suggested shape: clamp the rescaled anchor to `[0, 1]` (`Math.min(1, …)`); a unit case with `inSection = 8/9` and `pages = 6` would hold it.
- Severity: medium (user-visible on phone → desktop, the sync case the feature is for; no data loss).

### F2. On a phone, full screen cannot be opened or closed by touch, so edge taps are unreachable
- Labels: `[introduced]` (EpubPreview.tsx is new), invariant: none (7 is about not reloading; no invariant says full screen is reachable). Raise to the supervisor: it may be a design gap rather than a code defect.
- Where: `frontend/src/components/epub/EpubPreview.tsx:37,51,66-71,92-120`; `useFullscreen.ts` touch listeners are bound on `frameBoxRef`.
- Mechanism: the only way in is the `f` shortcut (no button, unlike the PDF viewer). `useFullscreen`'s touch idioms (swipe up to enter, swipe down / pinch to exit) listen on the frame box in the parent document, but the reader iframe fills that box and touch events inside an iframe are dispatched only in the iframe's documents. The reader itself stops every touch at its window (`reader.js:104-135`) and never reports vertical swipes or pinches upward.
- Reproduction (scratch spec, chromium with `hasTouch`, removed afterwards): added a `touchstart` counter on `#frame` in the host page, dispatched three CDP touches over the reader (centre, top-left margin, bottom-right margin). Observed `boxTouches = 0`.
- Consequence for a phone user with no keyboard: full screen is never entered, so `edgeAction` / `TAP_SLOP_PX` code (`reader.js:126-134`) never runs and the docs line "taps on the left or right edge turn pages" describes something they cannot reach. An iPad with a keyboard can enter the pseudo mode with `f` and leave only with `f`/`Esc` or the browser's back.
- Severity: medium (feature unreachable on the platform the spec names; no data impact).

### F3. Touch, reader-side keys, in-book links and `mode` have no test that fails when they break
- Labels: `[introduced]`, invariant: 4 (the list of reader actions it names), and the missing invariant proposed below.
- Mutations that survived every vitest and both Playwright projects (see table M3, M4, M13, M17-key):
  - `reader.js:106` `stop` made a no-op (foliate's own touch handling back on): **live**. A scratch CDP swipe (chromium) shows what it lets through: with the mutation the page moves from page 3 to page 4 and **no `turned` is posted** (`turned: []`); on the real code the same swipe posts exactly one `turned {fraction: 0.35}`. So "a swipe writes" rests on this one line and nothing holds it.
  - `reader.js:98` reader-side key turns dropped (`if (action.turn) return`): **live**. Space/PageDown typed into the book — the ordinary desktop path once the reader has been clicked — is untested; only `keyAction`'s table is unit-tested. (Scratch check on the real code: click into the book, PageDown → page 3 → 4, one `turned`, both engines.)
  - `reader.js:177` in-book link navigates without `turn()`: **live**. No test follows an internal link.
  - `reader.js:228` `mode` message ignored: **live**. Full-screen arrows and edge taps in the reader are never exercised; the e2e `mode` step only asserts that nothing is reported.
- Suggested: one Playwright case per input (CDP touch swipe in chromium; keyboard in the section document; an internal link in `books.ts`; `setMode(true)` then ArrowLeft) asserting one move and one `turned`.
- Severity: medium (these are four of the five input paths invariant 4 names).

### F4. foliate still moves the page outside `turn()` on selection and focus, and those moves are never saved
- Labels: `[introduced]` (the reader is new; the behaviour is foliate's), invariant: none as worded (4 is one-directional: it forbids writes from non-actions, it does not require every move to write).
- Where: `node_modules/foliate-js/paginator.js:578-610` — a pointer selection that extends past the visible range calls `this.next()` / `this.prev()` after 700 ms; a keyboard selection change and any `focusin` inside the section call `#scrollToAnchor`. None goes through `reader.js` `turn()`, so no `turned` is posted.
- Effect: drag-selecting text past the page edge (mouse, or long-press selection handles on a phone), or Tab onto a link on another page, moves the reader; if the reader then leaves without a key/swipe turn, the reopened place is the earlier page. The commit message's "every page turn goes through one path" is not true of these.
- Not measured in a browser: what to measure is a mouse drag-selection from mid-page past the right edge of the container in chromium, then read `renderer.page` and the `turned` list after 1 s.
- Severity: low.

### F5. The shipped e2e for invariant 6 does not hold the anchor rescale; only a model of foliate does
- Labels: `[introduced]`, invariant: 6.
- Where: `frontend/e2e-epub/reader.spec.ts:147-169` (turns 2 pages into chapter 2 and reopens once); `frontend/src/lib/__tests__/epubReaderCore.test.ts:29-48` (re-implements foliate's placement formula inside the test).
- Mutation M8: `restoreAnchor` returns `inSection` (foliate's own behaviour, which the spike found lands one page early near a chapter's end). **Live** in both Playwright projects; killed only by the unit test, whose expected value is computed from a copy of foliate's formula (`review-workflow.md` detector rule 2: both sides go through the same implementation). A foliate update that changes placement would leave the unit test green and the e2e would not see it.
- Measured: a scratch Playwright spec that turns through every page of chapters 1–3 and reopens at each `turned.fraction` finds **0 mismatches** on the real code (horizontal 12 pages, vertical 15, both engines) and **3 / 6 mismatches** with M8 applied. So the real round trip works; the shipped e2e just does not sample the pages where the rescale matters.
- Suggested: have the e2e round-trip every page of one chapter (or at least its last page), which makes the unit model redundant.
- Severity: low-medium (test lets an invariant-6 regression through).

### F6. The parent-side integration has live mutants: file change while mounted, routing, floor, blocking
- Labels: `[introduced]`, invariants: 7 / none (see each).
- Survived every vitest (Playwright does not run these files):
  - P12 `key={file.id}` removed from the iframe (`EpubPreview.tsx:105`): **live**. `MediaPlayerBlock` keeps `FilePreview` mounted across files (its comment: "re-rendering is the one thing a player must not do"), so `←`/`→` from one EPUB to the next goes through a `fileId` change while `EpubPreview` stays mounted. Without the key the old reader is reused, it has `state.opened = true` and never boots again, the parent waits for a `boot` that never comes, and the page shows "Loading" forever. No test re-renders `EpubPreview` with a second file.
  - P21 `setStatus({kind: "loading"})` removed from the fetch effect (`useEpubReader.ts:58`): **live**. Same untested path.
  - P9 stale-book guard removed (`useEpubReader.ts:77`): live; near-equivalent (the stale post goes to a removed window). Recorded, not a finding on its own.
  - P17 the `application/epub+zip` branch removed from `FilePreview.tsx:210-212`: **live**. Nothing asserts that an EPUB reaches the reader at all.
  - P18 `application/epub+zip` removed from `FLOORED_MIMES` (`fileDetailShell.ts:33-36`): **live**.
  - P11 the full-screen context made non-blocking (`EpubPreview.tsx:76`): **live**. The docs say search and Quick Note wait while the EPUB is full screen; no test presses a lower-context key in full screen.
  - P10 no `readerWindow.focus()` on entering full screen: live (the parent's blocking context still turns pages with arrows; only Space would differ). Recorded.
- Code on the file-change path itself reads correct at this SHA (pending write flushed to the old id, new `boot` gated by `openedRef` reset, old window's messages dropped by source) — the finding is that nothing holds it.
- Severity: medium for P12/P17 (a regression would make the feature disappear or hang with every test green), low for the rest.

### F7. The pinch-zoom guard reads the reader frame's scale, which is always 1
- Labels: `[introduced]`, invariant: 4 (a pan while zoomed becomes a page turn and a write, although the user did not ask to turn).
- Where: `frontend/public/epub-reader/reader.js:118` — `(window.visualViewport?.scale ?? 1) > 1`, evaluated in the reader document (an iframe).
- Measured (scratch spec, chromium mobile emulation, CDP `Emulation.setPageScaleFactor(2)`): top window `visualViewport.scale = 2`, reader iframe `visualViewport.scale = 1`. Page pinch-zoom on a phone scales the top-level page, so the guard never fires; a one-finger horizontal pan of ≥ 40 px over the zoomed book is read as a swipe and turns the page.
- To measure on iOS Safari: pinch-zoom the detail page over the book, pan sideways, watch whether the page turns. `parentWindow.visualViewport.scale` (same origin) is the value that moves.
- Severity: low-medium (phone users zoom to read small text).

### F8. Paging back to the first page and leaving keeps the older, later place
- Labels: `[introduced]`, invariant: none (the spec says "Nothing is written while the first page is shown").
- Where: `frontend/src/lib/epubProgress.ts:81-84`.
- Effect: stored 0.3 from an earlier session → reopen, page back to page 1 of the first section, leave → the record still says 0.3 and the book reopens there. Consistent with the spec's rule and with PDF ("page 1 is never written"); recorded because a user can hit it and it reads as "the reader forgot where I was". Supervisor's call whether it belongs in known-issues.
- Severity: low.

## Mutation table

Runner: one textual replacement, then the named suite, then `git checkout -- <file>`. "unit" = the vitest command from the brief; "e2e" = `playwright-epub` (chromium + webkit, 22 tests).

| id | file:line | mutation | want | suite | outcome |
|---|---|---|---|---|---|
| M1 | reader.js:82 | drop the "location unchanged → no post" guard | kill | e2e | **live** (no test turns at a boundary where nothing moves; harmless: parent would re-save the same place) |
| M3 | reader.js:177 | in-book link calls `view.goTo` directly, bypassing `turn()` | kill | e2e | **live** → F3 |
| M4 | reader.js:106 | `stop` made a no-op (foliate touch handling restored) | kill | e2e | **live** → F3 (scratch CDP swipe: page moves, `turned: []`) |
| M7 | reader.js:197 | restore wrapped in `turn()` | kill | e2e | killed (8 failed) |
| M8 | core.js:15 | `restoreAnchor` returns `inSection` | kill | e2e / unit | **live in e2e**, killed by the model unit test → F5 |
| M9 | core.js:13 | `textPages = pages` | live | e2e + unit | live — equivalent: brute force over T = 2..300, every page, 0 differences |
| M10 | reader.js:69 | fraction = end of page (`loc.size`) | kill | e2e | killed (4 failed) |
| M12 | reader.js:197 | `ready` posted before restore finishes | kill | e2e | killed (7 failed) |
| M13 | reader.js:228 | `mode` message ignored | kill | e2e | **live** → F3 |
| M14 | reader.js:225 | theme change routed through `turn()` | kill | e2e | live — theme restyle does not move `index:fraction` here, so the guard hides it; equivalent under these books |
| M16 | reader.js:83 | `atEnd: false` always | kill | e2e | killed (4 failed) |
| M17-key | reader.js:98 | reader-side key turns dropped | kill | e2e | **live** → F3 |
| M-reloc | reader.js:189 | every relocate outside a turn posts `turned` | kill | e2e | killed (8 failed) |
| P25 | reader.js:163 | fixed-layout check removed | kill | e2e | killed (2 failed) |
| P1 | epubProgress.ts:81 | first-page guard removed | kill | unit | killed |
| P2 | epubProgress.ts:85 | `atEnd` not stored as 1 | kill | unit | killed |
| P3 | epubProgress.ts:22 | `position >= 1` → `> 1` | kill | unit | killed |
| P4 | epubProgress.ts:21 | duration check removed | kill | unit | killed |
| P5 | epubProgress.ts:64 | no flush on unmount / file change | kill | unit | killed |
| P6 | epubProgress.ts:61 | flushed write goes to the current file id | kill | unit | killed |
| P7 | epubProgress.ts:80 | no `cancel()` at the top of `turned` | live | unit | live — degrades to one write at the first timer with the latest value; equivalent in outcome |
| P8 | useEpubReader.ts:73 | `openedRef` guard removed | kill | unit | killed |
| P9 | useEpubReader.ts:77 | stale-book check removed | live | unit | live — near-equivalent (posts to a removed window) |
| P10 | useEpubReader.ts:123 | no focus on entering full screen | kill | unit | **live** → F6 (minor) |
| P11 | EpubPreview.tsx:76 | full-screen context `blocksLower = false` | kill | unit | **live** → F6 |
| P12 | EpubPreview.tsx:105 | iframe `key={file.id}` removed | kill | unit | **live** → F6 |
| P13 | useEpubReader.ts:97 | replay dropped | kill | unit | killed |
| P15 | useEpubReader.ts:112 | theme posted before `ready` | live | unit | live (harmless) |
| P16 | EpubPreview.tsx:105 | iframe re-keyed on `isPseudo` / on `isFullscreen` | kill | unit | killed (both) |
| P17 | FilePreview.tsx:210 | EPUB branch removed | kill | unit | **live** → F6 |
| P18 | fileDetailShell.ts:35 | EPUB removed from `FLOORED_MIMES` | kill | unit | **live** → F6 |
| P21 | useEpubReader.ts:58 | status not reset to loading on file change | kill | unit | **live** → F6 |
| P22 | useEpubReader.ts:91 | `ready` ignored | kill | unit | killed |
| P23 | useEpubReader.ts:90 | writes `image-viewer:reading-direction` on ready | kill | unit | killed |
| P24 | EpubPreview.tsx:84 | `unsupported` shown as load failure | kill | unit | killed |
| P26 | useEpubReader.ts:122 | `mode` never posted | kill | unit | killed |
| P27 | EpubPreview.tsx:53 | inline context also enabled in full screen | live | unit | live — the overlay-priority blocking context outranks it |
| P28 | epubReaderChannel.ts:39 | source check removed | kill | unit | killed |

Tree restored after every mutation; scratch specs under `frontend/e2e-epub/zz-*.spec.ts` were deleted (copies of two kept in the scratchpad: `zz-scratch.spec.ts`, `zz-touch.spec.ts`). `git status` of the worktree is clean.

## Checked, no finding

- Chapter crossing forward and backward: every `next` and `prev` posts exactly one `turned`, and every posted fraction reopens on the same page (scratch spec, every page of chapters 1–3 and backwards from 0.45, both books, both engines: 0 mismatches). foliate's intermediate relocate on the blank pad is not posted.
- The `turning` guard vs foliate's `#locked`: `renderer.next()` awaits the full `#turnPage` including its 100 ms `wait`, so `state.turning` covers foliate's lock; a dropped turn writes nothing.
- A key typed into the book (click, then PageDown) turns and posts once in both engines; `f` handed back and replayed on the parent can still call `requestFullscreen` (resolved in chromium and webkit), so user activation survives the hop.
- Debounce across file change: the pending write is flushed to the old id (`pending.fileId`) and the old reader's late messages are dropped by source. StrictMode double effects abort the first fetch; the iframe is not remounted, so there is one `boot` and one `open`. A tab closed within 1 s of a turn loses that turn — the same shape as `pdfPageProgress.ts`, not new here.
- `ProfileProvider` renders children without context until mounted and then remounts them, so `readSaved` never runs with a stale "no profile" answer that survives.
- `boot` is posted once; if the parent's listener were not yet attached it would be lost and the page would stay on "Loading". The reader's module graph has to load first, so this was not reproducible; noted only as a place to look if a hang is ever reported.
- Invariant 9: neither `reader.js` nor foliate touches `localStorage` / `sessionStorage` (grep); the parent test (P23) holds it.

## Is anything missing from the invariant list?

Yes, three things this round found no invariant for:

1. **The converse of 4: every reader action that moves the page writes progress** (key in the book, swipe, edge tap, `turn` message, in-book link). As worded, 4 only forbids writes from non-actions, so a swipe that moves the page and writes nothing (M4) breaks no invariant. F3 shows four of those paths are held by nothing.
2. **Full screen can be entered and left with each input the reader supports** (keyboard on desktop, touch on a phone). F2: on a phone with no keyboard it cannot be entered, so the edge-tap part of 4 is unreachable.
3. **Reopening at a different size lands in the saved section near the saved place, never on a blank pad.** 6 covers only the same size; F1 lands on the pad in both engines.

(Also worth one line if the supervisor wants it: "Moving to the next file while the preview stays mounted opens the new book" — F6 P12.)

TOTAL: 8 findings
