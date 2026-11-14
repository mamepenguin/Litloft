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
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The search-mode URL sync in FolderBrowser now skips `router.replace` when the rebuilt params equal the current URL's (FolderBrowser.tsx:451). This affects every search page and is not in the spec.
- claude-read: The search-mode URL sync in FolderBrowser now skips `router.replace` when the rebuilt params equal the current URL's (FolderBrowser.tsx:451). This affects every search page and is not in the spec.
- claude-verify: FolderBrowser's search-mode URL sync now skips router.replace when the rebuilt params string equals the current URL's. That changes behaviour beyond the declared touch points. It holds only when the existing URL has the same parameters in the same order; any difference, such as order or extra parameters, still triggers a replace as before.

### unspecified_behavior

Note: FolderBrowser's search-mode URL sync now skips router.replace when the rebuilt params string equals the current URL's. That changes behaviour beyond the declared touch points. It holds only when the existing URL has the same parameters in the same order; any difference, such as order or extra parameters, still triggers a replace as before.
- claude-read: The search-mode URL sync in FolderBrowser now skips `router.replace` when the rebuilt params equal the current URL's (FolderBrowser.tsx:451). This affects every search page and is not in the spec.
- claude-verify: FolderBrowser's search-mode URL sync now skips router.replace when the rebuilt params string equals the current URL's. That changes behaviour beyond the declared touch points. It holds only when the existing URL has the same parameters in the same order; any difference, such as order or extra parameters, still triggers a replace as before.

## Findings

A: 0
B: 3
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The diff changes `frontend/src/components/FolderBrowser.tsx`, which is not in the touch-point list. Besides the focus plumbing for I10 (`moreTriggerRef`, `focusMoreTrigger` passed to `SmartFolderController`), it changes the search-mode URL sync effect so it no longer calls `router.replace` when the rebuilt params string equals the current URL's.
Impact: Every search page is affected, not only Smart Folder pages. The sync effect now skips navigations it used to make whenever the rebuilt query string matches the URL byte for byte, and still replaces when only the parameter order differs. No invariant or touch point names this, so a reader of the spec cannot tell that URL-sync behaviour moved. Today I found no wrong result a user can hit, because the skipped replace would have written the same URL.
Evidence: frontend/src/components/FolderBrowser.tsx:432-435 adds `urlParamsRef` and assigns it during render. :449-451 add `if (params.toString() === urlParamsRef.current.toString()) return;` before `folderRouter.replace(next)`. :89-93 and :966 add the focus plumbing. The touch-point list names SmartFolderSaveButton.tsx, SearchQueryHeader.tsx, useSmartFolders.ts, the e2e fixture, the tests, messages, docs and DESIGN.md, and does not name FolderBrowser.tsx.
Repro: Mutation done in my head: remove the early return at FolderBrowser.tsx:451. In SearchPage.smartFolderOverwrite.test.tsx, 'keeps the button when the URL moved to other conditions during the request' calls `page.navigate(...)`. That changes `searchQuery`, so the effect runs `router.replace` again and `routerCalls()` no longer equals `before`. That test would fail. So the dedup is held in place by an I4 test, which counts router calls the page itself causes on navigation and not only calls caused by the overwrite.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add FolderBrowser.tsx to the touch points, covering both the focus hand-off and the URL-sync dedup. Alternatively, make I4's router-call assertion measure only calls caused by the overwrite, and drop the dedup if nothing else needs it.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The diff changes `frontend/src/components/folder/FolderToolbar.tsx`, which is not in the touch-point list, by adding an optional `moreTriggerRef` prop that replaces the toolbar's own ref for the `…` trigger.
Impact: When a parent passes the prop, the shared ref takes over from the toolbar's own ref. FolderBrowser passes it on every view (the folder, special and search toolbars), not only on Smart Folder pages. The menu's focus return and outside-click logic then go through a ref owned by the parent. I found no broken behaviour, but the spec does not declare this coupling.
Evidence: frontend/src/components/folder/FolderToolbar.tsx:123-127 adds the prop. :158-159 are `const ownMoreTriggerRef = useRef(...)` and `const moreTriggerRef = sharedMoreTriggerRef ?? ownMoreTriggerRef;`. FolderBrowser.tsx:799 passes `moreTriggerRef={moreTriggerRef}` with no condition.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add FolderToolbar.tsx (the `moreTriggerRef` prop) to the touch points.

</details>

### claude-read:F3 — bucket B, INFO, open

Claim: The diff adds a shared test helper, `frontend/src/test/smartFolderServer.ts`, and edits `componentFixtureParity.test.tsx`. The touch-point list names neither.
Impact: Users are not affected. The fake server answers any path it does not match with `[]`, and it merges PATCH bodies with no validation. Other tests that adopt it later inherit that leniency without the spec mentioning it.
Evidence: frontend/src/test/smartFolderServer.ts (new, 124 lines; `if (!match) return json([]);`). frontend/src/components/__tests__/componentFixtureParity.test.tsx:286 adds the new arrangement id. The touch points name only the mocks of `@/components/SmartFolderSaveButton`, the rewrites in SmartFolderSaveButton.test.tsx and SearchPage.resultsBar.test.tsx, and the e2e-components files.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the new test helper and the parity test in the touch points, or accept them as implied test scaffolding.

</details>

## Not verified

- claude-read: I ran no tests or e2e cases. Mutation outcomes were reasoned through by reading the code.
- claude-read: I did not check whether any other caller renders FolderToolbar and depends on its `…` focus behaviour.
- claude-read: I did not check Next.js App Router behaviour for a same-URL `router.replace`, so I cannot say whether the skipped replace had any user-visible effect.
- claude-read: I did not isolate commit 828c99cb1's own diff from the branch diff given in the prompt. My answer is based on the diff provided.
- claude-verify: I did not run git diff against origin/develop. I inferred which files changed from r1/classification.json and the current file contents.
- claude-verify: I did not check whether smartFolderServer.ts is new or exactly 124 lines long.
- claude-verify: I did not run any tests or e2e measurements.

TOTAL: 3 findings
