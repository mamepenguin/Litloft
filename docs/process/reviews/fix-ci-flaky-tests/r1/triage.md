# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Read coverage

Product files:
- frontend/e2e-components/fixture-origin.spec.ts — full: Read the whole file (32 lines).
- frontend/e2e-components/fixtureOrigin.ts — full: Read the whole file (58 lines).
- frontend/e2e-components/player-workbench-desktop.spec.ts — partial: Read lines 1-70 (the changed hunk and open()), 540-600 (the reload and second-page tests) and 1325-1364 (the storage-event crossing). Grepped the whole file for reload/newPage/console.
- frontend/e2e-components/spec-viewport.spec.ts — full: Read the whole file (217 lines).
- frontend/e2e-components/workbench-split-desktop.spec.ts — partial: Read lines 1-70 (the changed hunk and open()) and 755-1064 (every reload, second-page and storage test). Grepped the whole file for FIXTURE, addInitScript, localStorage and console listeners.

Test files:
- none

## Needs a human

### unspecified_behavior

Note: Under the http origin, fetches that no stub answers resolve to a 404 Response instead of rejecting with a network error. Code paths that branch on `!res.ok` vs. catch may behave differently in the two migrated specs than under file://.
- claude-verify: Under the http origin, fetches that no stub answers resolve to a 404 Response instead of rejecting with a network error. Code paths that branch on `!res.ok` vs. catch may behave differently in the two migrated specs than under file://.

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The guard in fixture-origin.spec.ts only recognises a document crossing written literally as `.reload(` or `.context().newPage(`, so a spec that crosses documents in another way can stay on `file://` while the guard passes.
Impact: Test-only. A later spec could hit the same flaky null-after-reload or missing-storage-event failure in CI while this guard reports it as covered. Ways it slips through: a second `page.goto`/`open()` on the same page after a storage write, `other.goto(...)` on a page obtained as `context.newPage()` from the `{ context }` fixture, `page.goBack()`/`goForward()`, or `browser.newContext()`. No user of the product can observe this.
Evidence: frontend/e2e-components/fixture-origin.spec.ts:13 `ACROSS_DOCUMENTS = /\.reload\(|\.context\(\)\.newPage\(/`. The only crossings that exist today all use those two literal forms (player-workbench-desktop.spec.ts:561,573,1343; workbench-split-desktop.spec.ts:768,893,952,1014). inspector-responsive-layout-desktop.spec.ts reads localStorage but stays within one document per test (lines 24-43, 539-555), so no current spec escapes the guard.
Repro: not_reproduced. Mutation in my head: in any spec, replace `page.context().newPage()` with `context.newPage()`, taking `context` from the test fixture. ACROSS_DOCUMENTS no longer matches that file, the file drops out of `crossing`, the `toEqual([...])` at line 24 fails for the wrong reason, and once the expected list is updated the `file://` check never runs on that file.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Widen the pattern to also match `context.newPage(`, `.goBack(`/`.goForward(` and `newContext(`. Alternatively, require every spec that uses `localStorage` (not only those that cross documents) to use serveFixture, which avoids pattern matching on call shapes.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: Serving the fixture from http://localhost:47391 turns every unstubbed relative fetch in the two migrated specs from a rejected promise (file:// network error) into a resolved 404 Response, so those specs now run the page under different API-failure conditions than every other component spec.
Impact: Test-only. The fixture's fetch stub falls back to the native fetch for any endpoint it does not answer. Before this change that fallback rejected with a network error. Now the route answers it with `{status: 404}`. Product code that treats a rejected fetch differently from a `!ok` response (for example an error banner versus a silent retry, or a parsing error from `res.json()` on an empty body) now renders a different state in workbench-split-desktop and player-workbench-desktop only. Those specs could therefore assert a layout the page never reaches under the other specs, or the reverse. The comment at fixtureOrigin.ts:44-45 says a missing path is a 404 'as the same missing file is under file://'. That holds for element loads such as <track>, but not for fetch.
Evidence: frontend/e2e-components/fixtureOrigin.ts:41-52 answers every `${ORIGIN}/**` request, including `/api/...`, with a 404 when no file exists under ROOT. frontend/e2e-components/fixtures/inspectorResponsive.tsx:254 `return nativeFetch(input, init)` handles unmatched endpoints. frontend/e2e-components/fixtures/app.tsx:136-139 says unanswered fetches 'keep [their] offline failure'. Under file:// that is a TypeError; under the new origin it is a resolved 404.
Repro: not_reproduced. I could not run Playwright. Reasoning check: on the `#inspector-video` arrangement, a component fetch to an endpoint not listed in inspectorResponsive.tsx:205-253 now resolves with status 404 instead of rejecting.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In serveFixture, call `route.abort()` (a network failure) for paths that do not resolve to a file, at least for paths outside the bundle's own asset tree such as `/api/`. That keeps the 'offline failure' the fixture stubs assume. Alternatively, delete the 'as the same missing file is under file://' clause.

</details>

## Not verified

- claude-read: No Playwright run was possible: I did not observe that the migrated specs pass, or that they are no longer flaky.
- claude-read: Chromium's claimed unreliability of localStorage between file:// documents is not tested here; I took the motivation as given.
- claude-read: I did not check whether Playwright's context.route glob `http://localhost:47391/**` matches URLs with query strings and hashes as the specs use them (`?run=...&panels=...#inspector-video`).
- claude-read: The frontend/e2e-components/.build directory does not exist in this worktree, so I could not inspect the emitted asset types and paths.
- claude-read: I did not read every test in player-workbench-desktop.spec.ts and workbench-split-desktop.spec.ts. Unread tests could depend on file:// behaviour, such as fetch rejection or location.protocol.
- claude-read: The touch-point comparison could not be made because no invariants file exists for this change.
- claude-read: I did not independently verify the claim in decisions.md that no changed file ships in the runtime image.
- claude-verify: Did not run Playwright, so I did not observe a 404 vs. TypeError at runtime.
- claude-verify: Did not enumerate which unstubbed requests the inspector fixtures actually issue, or whether any component handles a 404 differently from a rejected fetch.
- claude-verify: Did not check that a context.route on an unused localhost port works without a listener on CI.

TOTAL: 2 findings
