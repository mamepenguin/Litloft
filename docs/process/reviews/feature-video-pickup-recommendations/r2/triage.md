# Triage: r2

## Trajectory

This run:
- claude-read: The rounds since r1 do not patch this design. b8ecfe1 changes only spec status. The develop commits (c5bda03, 55c6541 and the test-wait fixes) are separate features. The merge b637710 swaps the Continue key from in_progress to continue in useDiscover and DiscoverFace, and adds no branch, state or prediction to the provider design. 848db3b only pins submodules. 6217b72 updates test fixtures to the new key and removes a wait on the deleted random Recommended. fc2eec9 records the R-5 rerun. No round re-adds a branch that an earlier round added, and no round removes one.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R2-1 is bucket A or BLOCKER

## Findings

A: 1
B: 1
C: 0

### claude-read:R2-1 — bucket A, LOW, open

Claim: When a provider shelf's inputs change, useDiscover resets Recommended and the addon shelf states to loading/idle inside useEffect, so the first render after the change still gives DiscoverFace the previous target's loaded items. useLoad, by contrast, derives loading during render.
Impact: For one React commit after a target, catalogue or profile change, Recommended or an addon shelf is in the DOM with the previous target's videos. A target picked by a click is a discrete event, so React flushes the passive effect before paint and the user is unlikely to see it. A params change from a non-discrete source, such as an async smart-folder refresh, can paint that frame. The spec's own unit test for this case does not catch it.
Evidence: frontend/src/components/videoapp/useDiscover.ts:152-158 and :201-210 call setRecommended({status:'loading'}) and setShelfStates(...) only inside the effect. useDiscover.ts:290-300 return the stale `recommended` and `shelfStates` in the same render. frontend/src/components/appshell/useLoad.ts:17-21 and :49-52 document and implement the rule that a changed `load` reads as loading at once, so no frame shows the old inputs' result. VideoApp.discoverProviders.test.tsx 'I11 hides a shelf while it re-runs for a new target' asserts with waitFor, so a single stale commit passes it.
Repro: not_reproduced. Read the code: render N+1 with new params reaches DiscoverFace with recommended.state still {status:'loaded', data: old}, and providerDrawn() returns true until the effect commits.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Tag each provider state with the inputs it was computed for (drive, params, hasProfile, entries key, onViewerRejected), as useLoad does with `load`. Treat a mismatch as loading during render, and add a test that asserts synchronously right after a target change.

</details>

### claude-read:R2-2 — bucket B, INFO, open

Claim: The page-jump entry `continue`, which came in with the develop merge, has no `pageJump.aliases.continue` message, so every page logs MISSING_MESSAGE.
Impact: Console noise on every page, and the Continue jump has no aliases. Discover is not affected.
Evidence: frontend/src/lib/pageJump.ts adds key 'continue'. frontend/src/components/search/useJumpDestinations.ts:137 reads t(`pageJump.aliases.${jump.key}`). frontend/src/messages-core/en.json:1402-1414 has no `continue` alias. decisions.md records MISSING_MESSAGE pageJump.aliases.continue as seen in R-5 and identical on origin/develop.
Repro: Open any drive page and check the console for MISSING_MESSAGE pageJump.aliases.continue (recorded in decisions.md).
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add pageJump.aliases.continue in en.json and ja.json, in develop rather than on this branch.

</details>

## Not verified

- claude-read: I did not run any test, e2e spec or the app. R2-1 is inferred from React's commit and effect ordering.
- claude-read: I did not read the bumped submodule sources beyond the provided diff.
- claude-read: I did not verify that no non-discrete path changes params while Discover is shown.
- claude-verify: I did not open VideoApp.discoverProviders.test.tsx to confirm that it uses waitFor.
- claude-verify: I did not run any test or browser session to watch MISSING_MESSAGE logged at runtime.
- claude-verify: I did not check next-intl's version-specific default onError behaviour.
- claude-verify: I did not review the backend `ids` parameter, the addon submodules or the docs.

TOTAL: 2 findings
