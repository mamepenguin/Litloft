# Triage: r10

## Trajectory

This run:
- claude-deep: There is one fix commit (3fd99e10e), and it answers r9's D1, D2 and R1. In the launcher (useLauncherRows.ts:57-59) it removes a state: the `impossible` gate that r9 found on the data hooks' `active` flag is gone, so the Go to data stays loaded and `impossible` now only hides rows through `off`. On the search page (useFolderFiles.ts:294-348) it adds rather than removes. The `impossible` dependency and branch that the earlier round put in the resolution effect stay. The branch changes from "clear the resolution" to "return early", and the fix adds a second early-return branch next to it, reusing a held resolution. That branch carries two new pieces of state: an `inResolutionRef` mirror and a `resolvedRetryToken` ref that tells a retry apart from an impossible-to-possible flip. So the same effect has now been patched twice around the `impossible` flag. The first patch cleared the resolution and r9 found it re-resolved; the second keeps the resolution, which brings a new consequence (D3: a held failed/tooLarge/refused notice now shows for an impossible query). The window (useFileSearch) has a simpler model, a single held resolved resolution in a ref plus an impossible branch that clears the error, and the page still only imitates it. The design of the page-side in: resolution is being patched rather than restructured.
- claude-read: r7 to r9 had no fix commits, so no code was added or removed then. This round (3fd99e10e) makes two changes. In useLauncherRows.ts it removes a gate: the data hooks no longer take `!impossible` and go back to `open && !scope` / `open`, so it adds no new state there. In the useFolderFiles resolution effect it adds a branch and a state. The branch is a 'held resolution for the same key, not resolving, retry token unchanged → return' check. The state is two new refs, inResolutionRef and resolvedRetryToken. The `impossible` branch also changes from 'clear and bump the generation' to 'return early and keep'. The original change added that `impossible` branch to the effect, and this round adds a second branch to undo a side effect of the first. That is a mild sign of patching. The new branch also creates a display regression: a held failed/tooLarge/refused status now outlives an impossible stretch (R1 below). That follows from keeping state the earlier branch used to clear.

Earlier runs:
- r9 / claude-deep: Since r7 the only commit is 9e80b2dc6, a docs commit that declares the revised invariants (I20-I30). Its record lists no fix commits. No round adds or removes a branch, a state or a prediction in code. r7's bucket-A finding R4 (smart-collection-members/route.ts has no memberLimit) is unchanged in code, and I17's text is not narrowed. route.ts:80-91 still evaluates without memberLimit. Its only consumer is the MCP tool, which needs the whole set, so the code is right and the open question is the invariant's scope. Nothing shows the design being patched round over round; the record simply has no fix round to judge.
- r9 / claude-read: No fix commits landed between r7 and this review ("Fix commits since the previous review: (none)"). The commit under review, 9e80b2dc6, only declares the revised invariants (I20-I30 in invariants.md), so no round has added a branch, a state or a prediction to the code, and none has removed one. The product code is the same as r7 read it. r7's open bucket-A finding R4 (route.ts passes no memberLimit) was not changed in code. In this checkout, /app-api/smart-collection-members is called only from mcp-server (mcp-server/src/tools/collections.ts), and from no Notes/Clips app target. It is therefore outside I17's app-target scope, and I do not raise it again.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/file_matching.py — partial: Diff hunks in the prompt only; not touched by the fix commit.; partial: Every diff hunk shown in the review input; not changed by the fix commit and not reopened.
- backend/app/routers/drives.py — partial: Diff hunks in the prompt only; not touched by the fix commit.; partial: Every diff hunk in the review input; not changed by the fix commit.
- backend/app/routers/internal.py — partial: Diff hunks in the prompt only.; partial: Every diff hunk in the review input.
- backend/app/routers/shelves.py — partial: The single diff hunk.; partial: The single forwarding hunk in the prompt.
- frontend/e2e-components/fixtures/app.tsx — partial: Both diff hunks in the prompt.; partial: Both diff hunks.
- frontend/e2e-components/search-chips-negated.spec.ts — full: New file, whole in the diff.; full: New file, whole in the prompt diff.
- frontend/e2e-components/spec-viewport.spec.ts — partial: One-line diff hunk.; partial: One-line hunk.
- frontend/src/components/SmartFolderSaveButton.tsx — partial: Both diff hunks in the prompt.; partial: Both diff hunks.
- frontend/src/components/folder/useFolderFiles.ts — partial: Lines 170-369 in the tree (the whole resolution effect and derived state) plus every diff hunk and the fix diff.; partial: Lines 175-374 in the file (the whole resolution effect and derived state), plus all diff hunks; grep for inNameState/inNameBlocked users.
- frontend/src/components/search/ConditionMenu.tsx — partial: Diff hunks in the prompt only.; partial: Diff hunks only.
- frontend/src/components/search/InNameNotice.tsx — full: The diff covers the whole component.
- frontend/src/components/search/SearchFilterChips.tsx — partial: Diff hunks in the prompt only.; partial: Diff hunks only.
- frontend/src/components/search/SearchQueryHeader.tsx — partial: One diff hunk.; partial: One hunk.
- frontend/src/components/search/useFileSearch.ts — partial: Lines 110-229 in the file plus the listingParams diff hunk.; partial: Lines 110-229 in the tree plus the diff hunks.
- frontend/src/components/search/useLauncherRows.ts — full: Whole file read in the tree, plus the fix diff.; partial: The changed hunks of the original change and the fix commit.
- frontend/src/components/videoapp/VideoAppHeader.tsx — partial: The diff hunk.
- frontend/src/components/videoapp/useVideoApp.ts — partial: The diff hunk.
- frontend/src/lib/appTarget.ts — partial: Diff hunks.
- frontend/src/lib/inNameResolution.ts — partial: Diff hunks in the prompt.; partial: Every diff hunk.
- frontend/src/lib/listingRequest.ts — partial: Diff hunks.
- frontend/src/lib/memberTarget.ts — partial: Diff hunks.
- frontend/src/lib/searchQuery.ts — partial: Diff hunks in the prompt.; partial: Every diff hunk.
- frontend/src/lib/smartCollectionEval.ts — partial: Diff hunks.
- frontend/src/lib/videoAppTarget.ts — partial: Diff hunks.
- frontend/src/messages-core/en.json — partial: Diff hunks.
- frontend/src/messages-core/ja.json — partial: Diff hunks.

Test files:
- addons/intelligence/tests/test_filtered_search_file_ids_conditions.py — partial: Changed hunk only.
- addons/intelligence/tests/test_search_negation_filter.py — full: New file in the diff.; full: New file in the prompt diff.
- addons/intelligence/tests/test_search_negation_filter_scope.py — full: New file in the diff.; full: New file in the prompt diff.
- backend/tests/test_filtered_drive_files_contract.py — partial: Changed hunk only.
- backend/tests/test_search_negation_operators.py — full: New file in the diff.; full: New file in the prompt diff.
- frontend/src/__tests__/appTargetNegation.test.tsx — full: New file in the diff.; full: New file in the prompt diff.
- frontend/src/__tests__/core-search-vocabulary.test.ts — partial: Changed hunks only.
- frontend/src/components/__tests__/GlobalSearch.negation.test.tsx — full: New file in the diff, plus the fix commit's added test.; full: New file in the prompt diff, including the fix commit's added case.
- frontend/src/components/__tests__/SearchPage.negation.test.tsx — full: New file in the diff, plus the fix commit's added test.; full: New file in the prompt diff, including the fix commit's added case.
- frontend/src/components/__tests__/SmartFolderSaveButton.negation.test.tsx — full: New file in the diff.; full: New file in the prompt diff.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: One-line hunk.
- frontend/src/components/folder/__tests__/useFolderFiles.scope.test.tsx — partial: Changed hunks only.
- frontend/src/components/readingapp/__tests__/ReadingApp.memberTarget.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchFilterChips.negation.test.tsx — full: New file in the diff.; full: New file in the prompt diff.
- frontend/src/components/search/__tests__/SearchQueryHeader.modified.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchQueryHeader.negation.test.tsx — full: New file in the diff.; full: New file in the prompt diff.
- frontend/src/components/search/__tests__/SearchQueryHeader.scope.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchQueryHeader.sizeDuration.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/useFileSearch.filtered.test.tsx — partial: Changed hunks only.
- frontend/src/components/videoapp/__tests__/VideoApp.memberTarget.test.tsx — partial: Changed hunks only.
- frontend/src/components/videoapp/__tests__/VideoApp.negationTargetMenu.test.tsx — full: New file in the diff.; full: New file in the prompt diff.
- frontend/src/lib/__tests__/inNameResolution.negation.test.ts — full: New file in the diff.; full: New file in the prompt diff.
- frontend/src/lib/__tests__/listingRequest.negation.test.ts — full: New file in the diff.; full: New file in the prompt diff.
- frontend/src/lib/__tests__/searchImpossibleConditions.test.ts — full: New file in the diff.; full: New file in the prompt diff.
- frontend/src/lib/__tests__/searchNegationOperators.test.ts — full: New file in the diff.; full: New file in the prompt diff.
- frontend/src/lib/__tests__/searchQuery.test.ts — partial: Changed hunk only.
- frontend/src/lib/__tests__/searchScopeOperators.test.ts — partial: Changed hunks only.
- frontend/src/lib/__tests__/searchSuggestions.negation.test.ts — full: New file in the diff.; full: New file in the prompt diff.
- frontend/src/lib/__tests__/semanticSearch.passages.test.ts — partial: Changed hunk only.
- frontend/src/lib/__tests__/smartCollectionEval.negation.test.ts — full: New file in the diff.; full: New file in the prompt diff.

## Unspecified behavior, recorded

- claude-read: On the search page, an in: key that changes to another key only during an impossible stretch and then back (A → impossible B → A) reuses A's held resolution and its `now`, without resolving again.
  - F1 × I1 = 1, claude-read: Typing an impossible collection pair and removing it brings back the earlier results without reloading the lists; the user sees the same results, only faster.
  - F1 × I2 = 2, claude-verify: The user edits an in: query through an impossible intermediate key and back to the original key (A → B → A). The page reuses A's earlier resolution and its `now`, which for a modified:-relative Smart Collection can be slightly stale. Otherwise nothing visible changes.
- claude-read: While a query is impossible on the search page and its held in: resolution is 'failed', the shown 再試行 increments the retry token but starts no resolution until the query becomes possible again.
  - F1 × I2 = 2, claude-read: A user who presses 再試行 on a contradictory query sees nothing happen; removing the contradiction then retries.
  - F1 × I2 = 2, claude-verify: A held 'failed' notice is visible during an impossible query and the user presses 再試行. Nothing happens until the query becomes possible again, at which point the retry runs, so the button briefly looks dead.
- claude-read: A -in: name that no collection of the drive carries (a typo) is sent as exclude_collection and silently excludes nothing.
  - F2 × I3 = 6, claude-read: Typing '-in:Tirp' shows an Exclude chip with unfiltered results, so the user may believe the collection was excluded.
  - F2 × I5 = 10, claude-verify: The user mistypes the collection name in -in:. The query is sent as exclude_collection and silently excludes nothing, so the user sees unfiltered results with no warning. Per I28 this is the specified handling of an unknown name.
- claude-verify: If the query becomes impossible while the page's in: resolution is still in flight, the effect cleanup aborts it and leaves status 'resolving'. When the query becomes possible again, the `held.status !== "resolving"` guard lets resolution start again, so the page re-resolves instead of keeping a result.
  - F1 × I1 = 1, claude-verify: A query that turns impossible mid-resolution just resolves again when it turns possible. The user sees a short extra wait.
  - single-scored
- claude-deep: If the in: key changes while the query is impossible and then changes back before the query becomes possible again (A -> B -> A, all impossible except at the ends), the page reuses A's earlier resolution and its `now` instead of resolving again; the window does the same.
  - F1 × I1 = 1, claude-deep: It needs editing an in: name while another contradiction holds and restoring it exactly; the user sees A's earlier members, which differ only for a Smart Collection with a relative modified: part.
  - F1 × I2 = 2, claude-verify: An A → impossible B → A edit reuses A's held resolution and its `now` on both the page and in the window (useFileSearch.ts:209-210 reuses by key). Results stay correct except for a possibly stale relative date inside the Smart Collection.
- claude-deep: While the window's typed query is impossible, tag and has:/type:/is: value suggestions now still appear, because tags stay loaded, while page jumps and folder jumps are hidden.
  - F2 × I1 = 2, claude-deep: Typing 'tag:x -tag:x -tag:' in the window shows tag completions under an impossible query but no Go to rows; this is harmless and mixed.
  - F3 × I1 = 3, claude-verify: While the window's typed query is impossible, tag and operator suggestions still appear, because useLauncherRows.ts:60-73 does not depend on `impossible`, while page and folder jumps are hidden by `off` (:55). Completing a suggestion is still useful, so this is harmless.
- claude-deep: A '-in:' name that matches no collection of the drive is sent as exclude_collection and silently excludes nothing.
  - F2 × I3 = 6, claude-deep: A typo such as '-in:Tirp' shows an Exclude chip over unfiltered results; the spec allows it but gives no hint.
  - F2 × I5 = 10, claude-verify: A -in: name that matches no collection, for example a typo, is sent as exclude_collection and filters nothing. The user gets broader results than intended with no notice.

## Findings

A: 0
B: 2
C: 0

### claude-deep:D3 — bucket B, LOW, open

Claim: On the search page, once an in: key has a held 'failed', 'tooLarge' or 'refused' resolution, an edit that makes the query impossible keeps showing that InNameNotice instead of the impossible empty state, because the fix no longer clears the held resolution while impossible and inNameState is derived from it regardless of `impossible`.
Impact: Example: '-in:"Weekly" tag:x' shows the refused notice, and adding '-tag:x' makes the query impossible; the page keeps the refused notice where the window shows the empty state. With a held 'failed' state the notice keeps its 再試行 button, and pressing it during the impossible stretch does nothing visible: the token is bumped, but the effect returns at `if (impossible) return`. The spec's precedence (sending 1: an impossible combination is checked first, then inNameFailed, then refused) is reversed on the page, and the page and the window disagree. No request is sent, so nothing wrong is listed.
Evidence: useFolderFiles.ts:302 returns early while impossible without touching inResolution (before the fix it set it to null). useFolderFiles.ts:350-359 computes activeResolution/inNameState from inResolution with no `impossible` guard (inNameBlocked at :353 is guarded, inNameState is not). FolderContent.tsx:141-145 renders InNameNotice whenever inNameState is set, and FolderBrowser.tsx:874 hides the empty state when inNameState is set. The window's impossible branch clears the error (useFileSearch.ts:131 setInNameError(null)).
Repro: not_reproduced (static reading). In SearchPage.negation.test.tsx's harness: renderSearch({searchQuery: '-in:"Weekly" tag:x'}) and await the 'A Smart Collection cannot be excluded' text. Then rerenderPage({searchQuery: '-in:"Weekly" tag:x -tag:x'}) and settle. As read, the refused notice is still shown and 'No matching files found' is absent; before 3fd99e10e the notice was cleared.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Derive inNameState (and the retry offer) as null while `impossible`, for example `const activeResolution = !impossible && inResolution?.key === inKey ? inResolution : null` for the notice, while keeping the held resolution itself for reuse.

</details>

### claude-read:R1 — bucket B, LOW, open

Claim: On the search page, after the fix a held failed, tooLarge or refused in: resolution stays active while the query is impossible with the same in: key. The page then shows the in: notice (with 再試行 when the status is failed) instead of the impossible state's empty results. The search window shows the impossible state for the same edit.
Impact: Take '-in:"Weekly"', which is refused. Add 'tag:x -tag:x': the page keeps showing 「スマートコレクションは除外に使えません」 and hides 'No matching files found'. The spec puts the impossible check first. If the held status is 'failed', the shown 再試行 does nothing while the query stays impossible, because the effect returns early on `impossible`. The window clears inNameError on its impossible branch, so the page and the window now disagree for the same query.
Evidence: useFolderFiles.ts:302 now returns early while `impossible` and no longer calls setInResolution(null), which it did before the fix. activeResolution (:350-351) matches inKey, and inNameState (:354-359) is computed without checking `impossible`. FolderContent.tsx:141-145 renders InNameNotice whenever inNameState is set, and FolderBrowser.tsx:874 hides the empty state when inNameState is set. useFileSearch.ts:123-133 calls setInNameError(null) on the impossible branch.
Repro: not_reproduced (static reading). Render FolderBrowser with searchQuery '-in:"Weekly"' (Weekly is a Smart Collection) and wait for the refused notice. Rerender with '-in:"Weekly" tag:x -tag:x'. As read, the refused notice stays and 'No matching files found' is not shown. Before 3fd99e10e the resolution was cleared and the empty state was shown.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep the held resolution but gate the exposed state on the query: compute inNameState as null when `impossible` (e.g. `!impossible && activeResolution?.status === ...`), so the held status reappears only when the query becomes possible again.

</details>

## Not verified

- claude-deep: No test or command was run; D3 is derived from reading useFolderFiles.ts, FolderContent.tsx and FolderBrowser.tsx.
- claude-deep: Did not check whether the real search route remounts useFolderFiles on a q change (the tests rerender with the hook kept); a remount would drop the held resolution entirely.
- claude-deep: Did not read PassageList's notice path in the passages view beyond the grep; it also renders InNameNotice from inNameState.
- claude-deep: Backend, addon and other product files unchanged by the fix were read only through the diff in the prompt, not re-opened in the tree.
- claude-deep: Did not verify that the addons/intelligence checkout matches the pointer 612ee535f.
- claude-read: No tests or commands were run; R1 comes from reading useFolderFiles.ts, FolderBrowser.tsx greps and useFileSearch.ts.
- claude-read: FolderContent.tsx was not read beyond the grep lines 141-145, so I did not check whether another branch renders the impossible empty state before the notice.
- claude-read: React StrictMode double-invocation of the effect was reasoned through but not exercised.
- claude-read: Backend, addon and other product files were not re-read beyond the diff in the prompt, because the fix commit does not touch them.
- claude-read: useJumpDestinations.ts was not re-read to confirm the hooks load once per open with `active` steady.
- claude-verify: Did not run the app or tests; verified by reading code only.
- claude-verify: Did not check the backend handling of exclude_collection with an unknown name.
- claude-verify: Did not read the unit tests of useFolderFiles or useFileSearch.

TOTAL: 2 findings
