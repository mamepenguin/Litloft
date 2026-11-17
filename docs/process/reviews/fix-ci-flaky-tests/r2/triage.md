# Triage: r2

## Trajectory

This run:
- claude-read: One fix round (8b64b05). In fixtureOrigin.ts it removed a state rather than adding one: the 404 branch is gone and the single fallback became abort, so that part is a simplification. In fixture-origin.spec.ts it added two more predictions about how a spec crosses documents (goBack/goForward and a bare context.newPage) to the alternatives the previous round introduced. Each review has so far added alternatives to this pattern list, and it still misses a repeated goto (F1). That part of the design is being patched shape by shape instead of keyed on what matters (localStorage use).

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/e2e-components/fixture-origin.spec.ts — full: Read the whole file (33 lines).
- frontend/e2e-components/fixtureOrigin.ts — full: Read the whole file (60 lines).
- frontend/e2e-components/player-workbench-desktop.spec.ts — partial: Read lines 1-70 (changed hunk and open()) and 550-589 (reload and second-page tests). Grepped the whole file for crossings, console listeners and track.
- frontend/e2e-components/spec-viewport.spec.ts — partial: The fix commit does not touch this file. I reviewed only the one-line registry addition shown in the diff (fixture-origin.spec.ts added to AT_THE_PHONE_WIDTH); r1 read the whole file.
- frontend/e2e-components/workbench-split-desktop.spec.ts — partial: Read lines 1-70 (changed hunk and open()) and 755-1074 (every reload, second-page, storage and console-error test).

Test files:
- none

## Findings

A: 0
B: 1
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: Even after the regex was widened, the guard in fixture-origin.spec.ts does not notice a second navigation of the same page within one test (a second `page.goto` or `open()` after a localStorage write). So a spec can cross documents that way, stay on `file://`, and the guard still passes.
Impact: Test-only. A future spec that writes localStorage and then calls `page.goto` again could hit the flaky null-after-navigation the fix targets, while the guard reports that spec as covered. No product user can observe this. No current spec does this: the only crossings use `.reload(` or `.context().newPage(`, all in the two migrated files.
Evidence: frontend/e2e-components/fixture-origin.spec.ts:13 `ACROSS_DOCUMENTS = /\.reload\(|\.go(Back|Forward)\(|\bcontext(\(\))?\.newPage\(/` has no alternative for a repeated `goto`. Both specs navigate through `page.goto` inside `open()` (player-workbench-desktop.spec.ts:63, workbench-split-desktop.spec.ts:62). Calling open() twice in one test is a document crossing that the pattern cannot see. Line 20 also scans only `*.spec.ts`, so a crossing placed in a `.cases.ts` helper (scenes-section-rows.cases.ts already touches localStorage) is never inspected. A grep for reload/goBack/goForward/newPage/newContext across e2e-components finds only the 7 sites in the two migrated specs, so the gap is latent.
Repro: not_reproduced. Mutation in my head: add a spec that calls `open(page, X)`, writes localStorage, then calls `open(page, X)` again and reads the value, using `pathToFileURL(PAGE)`. ACROSS_DOCUMENTS does not match it, the file is not in `crossing`, the `toEqual` list at line 24 stays correct, and the guard passes.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Stop enumerating call shapes. Require serveFixture (and forbid pathToFileURL) in every spec whose source mentions `localStorage`, or scan `.cases.ts` files too and treat more than one `goto(`/`open(` per test as crossing.

</details>

## Not verified

- claude-read: I could not run Playwright, so I did not observe at runtime that `route.abort()` makes fetch reject, or that the migrated specs pass and are no longer flaky.
- claude-read: I did not inspect the built bundle (.build), so I do not know which assets, if any, it requests and are now aborted.
- claude-read: I did not read every test in player-workbench-desktop.spec.ts or workbench-split-desktop.spec.ts. I read only the changed hunks, open(), and the crossing and console tests.
- claude-read: I did not check whether any spec calls open()/goto more than once in a single test after writing localStorage.
- claude-verify: I did not run the Playwright suite or the guard test.
- claude-verify: I did not check every file:// spec test by test for multiple goto calls after a storage write; I only grepped for goto, storage and navigation sites.
- claude-verify: I did not check whether .cases.ts helpers are imported by file:// specs in a way that crosses documents.

TOTAL: 1 findings
