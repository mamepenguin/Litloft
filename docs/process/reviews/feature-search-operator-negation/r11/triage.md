# Triage: r11

## Trajectory

This run:
- claude-deep: Fix rounds in order. r9 found that the page resolution effect re-resolved after an impossible stretch. The r10 fix (3fd99e10e) took the `impossible` gate off the launcher data hooks, which removed a state. In the page effect it kept the `impossible` branch, changing it from clear to return, and added a held-resolution reuse branch backed by two new refs (inResolutionRef, resolvedRetryToken), which added state. This round (26001fc02) adds one more `!impossible` guard, on the derived `inNameState` (useFolderFiles.ts:354-360). It removes nothing. The guard repeats a prediction that earlier rounds already placed on `inNameBlocked` (:353) and `inNamePending` (:801), and on the effect itself (:302). So each round has added another `impossible` check in the same in: resolution area to undo a side effect of the previous one: the design is being patched, not restructured. The page now handles `impossible` in four separate places, while the window handles it in a single early branch. This round's change is small and correct for what it targets.
- claude-read: The fix rounds, in order. The original change added an `impossible` branch to useFolderFiles' resolution effect that cleared the resolution (r9 R1/D1/D2). 3fd99e10e removed the `!impossible` gate from the launcher data hooks. In the effect it turned the clearing into an early return and added a second branch that reuses a held resolution, with two new refs (inResolutionRef and resolvedRetryToken). 26001fc02, this round, adds no state and no new effect branch. It adds a `!impossible &&` guard to the derived `inNameState` (useFolderFiles.ts:354-360). That makes inNameState match `inNameBlocked` (:353) and `inNamePending` (:801), which already carried the same guard. So the round adds one more `impossible` check, the third derived output to carry it, and it adds that check because the round before changed what the held state contains. This is the third consecutive round patching how the page's in: resolution interacts with the `impossible` flag. The pattern is a design being patched rather than restructured: held resolution state plus per-output impossibility guards, where the window instead clears its error on an impossible branch. This round's patch is small, consistent with the existing guards, and closes r10 D3/R1. It also hides the dead 再試行 that r10 recorded as unspecified behavior. Nothing was removed.

Earlier runs:
- r9 / claude-deep: Since r7 the only commit is 9e80b2dc6, a docs commit that declares the revised invariants (I20-I30). Its record lists no fix commits. No round adds or removes a branch, a state or a prediction in code. r7's bucket-A finding R4 (smart-collection-members/route.ts has no memberLimit) is unchanged in code, and I17's text is not narrowed. route.ts:80-91 still evaluates without memberLimit. Its only consumer is the MCP tool, which needs the whole set, so the code is right and the open question is the invariant's scope. Nothing shows the design being patched round over round; the record simply has no fix round to judge.
- r9 / claude-read: No fix commits landed between r7 and this review ("Fix commits since the previous review: (none)"). The commit under review, 9e80b2dc6, only declares the revised invariants (I20-I30 in invariants.md), so no round has added a branch, a state or a prediction to the code, and none has removed one. The product code is the same as r7 read it. r7's open bucket-A finding R4 (route.ts passes no memberLimit) was not changed in code. In this checkout, /app-api/smart-collection-members is called only from mcp-server (mcp-server/src/tools/collections.ts), and from no Notes/Clips app target. It is therefore outside I17's app-target scope, and I do not raise it again.
- r10 / claude-deep: There is one fix commit (3fd99e10e), and it answers r9's D1, D2 and R1. In the launcher (useLauncherRows.ts:57-59) it removes a state: the `impossible` gate that r9 found on the data hooks' `active` flag is gone, so the Go to data stays loaded and `impossible` now only hides rows through `off`. On the search page (useFolderFiles.ts:294-348) it adds rather than removes. The `impossible` dependency and branch that the earlier round put in the resolution effect stay. The branch changes from "clear the resolution" to "return early", and the fix adds a second early-return branch next to it, reusing a held resolution. That branch carries two new pieces of state: an `inResolutionRef` mirror and a `resolvedRetryToken` ref that tells a retry apart from an impossible-to-possible flip. So the same effect has now been patched twice around the `impossible` flag. The first patch cleared the resolution and r9 found it re-resolved; the second keeps the resolution, which brings a new consequence (D3: a held failed/tooLarge/refused notice now shows for an impossible query). The window (useFileSearch) has a simpler model, a single held resolved resolution in a ref plus an impossible branch that clears the error, and the page still only imitates it. The design of the page-side in: resolution is being patched rather than restructured.
- r10 / claude-read: r7 to r9 had no fix commits, so no code was added or removed then. This round (3fd99e10e) makes two changes. In useLauncherRows.ts it removes a gate: the data hooks no longer take `!impossible` and go back to `open && !scope` / `open`, so it adds no new state there. In the useFolderFiles resolution effect it adds a branch and a state. The branch is a 'held resolution for the same key, not resolving, retry token unchanged → return' check. The state is two new refs, inResolutionRef and resolvedRetryToken. The `impossible` branch also changes from 'clear and bump the generation' to 'return early and keep'. The original change added that `impossible` branch to the effect, and this round adds a second branch to undo a side effect of the first. That is a mild sign of patching. The new branch also creates a display regression: a held failed/tooLarge/refused status now outlives an impossible stretch (R1 below). That follows from keeping state the earlier branch used to clear.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/file_matching.py — partial: Diff hunks in the prompt only; not touched by the fix commit.; partial: Every diff hunk in the prompt; not touched by the fix commit, not reopened.
- backend/app/routers/drives.py — partial: Diff hunks in the prompt only; not touched by the fix commit.; partial: Every diff hunk in the prompt; not touched by the fix commit.
- backend/app/routers/internal.py — partial: Diff hunks in the prompt only.; partial: Every diff hunk in the prompt.
- backend/app/routers/shelves.py — partial: The single forwarding hunk in the prompt.
- frontend/e2e-components/fixtures/app.tsx — partial: Both diff hunks in the prompt.
- frontend/e2e-components/search-chips-negated.spec.ts — full: New file, whole in the prompt diff.
- frontend/e2e-components/spec-viewport.spec.ts — partial: One-line hunk.
- frontend/src/components/SmartFolderSaveButton.tsx — partial: Both diff hunks in the prompt.
- frontend/src/components/folder/useFolderFiles.ts — partial: Lines 175-500 and 795-895 in the tree (resolution effect, derived in: state, first-page tracking, pending/loading), plus all diff hunks and the fix diff.; partial: Lines 180-379 (whole resolution effect and derived in: state) and 795-814 in the tree, plus every diff hunk and the fix diff.
- frontend/src/components/search/ConditionMenu.tsx — partial: Diff hunks in the prompt only.
- frontend/src/components/search/InNameNotice.tsx — full: The diff covers the whole component.
- frontend/src/components/search/SearchFilterChips.tsx — partial: Diff hunks in the prompt only.
- frontend/src/components/search/SearchQueryHeader.tsx — partial: One diff hunk.; partial: One hunk.
- frontend/src/components/search/useFileSearch.ts — partial: Diff hunks in the prompt only.; partial: Diff hunks in the prompt; impossible branch behaviour taken from the diff and earlier rounds.
- frontend/src/components/search/useLauncherRows.ts — partial: Diff hunk in the prompt.; partial: Diff hunks in the prompt.
- frontend/src/components/videoapp/VideoAppHeader.tsx — partial: The diff hunk.
- frontend/src/components/videoapp/useVideoApp.ts — partial: The diff hunk.
- frontend/src/lib/appTarget.ts — partial: Diff hunks.
- frontend/src/lib/inNameResolution.ts — partial: Diff hunks in the prompt.; partial: Every diff hunk in the prompt.
- frontend/src/lib/listingRequest.ts — partial: Diff hunks.
- frontend/src/lib/memberTarget.ts — partial: Diff hunks.
- frontend/src/lib/searchQuery.ts — partial: Diff hunks in the prompt.; partial: Every diff hunk in the prompt.
- frontend/src/lib/smartCollectionEval.ts — partial: Diff hunks.
- frontend/src/lib/videoAppTarget.ts — partial: Diff hunks.
- frontend/src/messages-core/en.json — partial: Diff hunks.
- frontend/src/messages-core/ja.json — partial: Diff hunks.

Test files:
- addons/intelligence/tests/test_filtered_search_file_ids_conditions.py — partial: Changed hunk only.
- addons/intelligence/tests/test_search_negation_filter.py — full: New file in the prompt diff.
- addons/intelligence/tests/test_search_negation_filter_scope.py — full: New file in the prompt diff.
- backend/tests/test_filtered_drive_files_contract.py — partial: Changed hunk only.
- backend/tests/test_search_negation_operators.py — full: New file in the prompt diff.
- frontend/src/__tests__/appTargetNegation.test.tsx — full: New file in the prompt diff.
- frontend/src/__tests__/core-search-vocabulary.test.ts — partial: Changed hunks only.
- frontend/src/components/__tests__/GlobalSearch.negation.test.tsx — full: New file in the prompt diff.
- frontend/src/components/__tests__/SearchPage.negation.test.tsx — full: New file in the prompt diff, including this fix commit's added case.
- frontend/src/components/__tests__/SmartFolderSaveButton.negation.test.tsx — full: New file in the prompt diff.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: One-line hunk.
- frontend/src/components/folder/__tests__/useFolderFiles.scope.test.tsx — partial: Changed hunks only.
- frontend/src/components/readingapp/__tests__/ReadingApp.memberTarget.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchFilterChips.negation.test.tsx — full: New file in the prompt diff.
- frontend/src/components/search/__tests__/SearchQueryHeader.modified.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchQueryHeader.negation.test.tsx — full: New file in the prompt diff.
- frontend/src/components/search/__tests__/SearchQueryHeader.scope.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchQueryHeader.sizeDuration.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/useFileSearch.filtered.test.tsx — partial: Changed hunks only.
- frontend/src/components/videoapp/__tests__/VideoApp.memberTarget.test.tsx — partial: Changed hunks only.
- frontend/src/components/videoapp/__tests__/VideoApp.negationTargetMenu.test.tsx — full: New file in the prompt diff.
- frontend/src/lib/__tests__/inNameResolution.negation.test.ts — full: New file in the prompt diff.
- frontend/src/lib/__tests__/listingRequest.negation.test.ts — full: New file in the prompt diff.
- frontend/src/lib/__tests__/searchImpossibleConditions.test.ts — full: New file in the prompt diff.
- frontend/src/lib/__tests__/searchNegationOperators.test.ts — full: New file in the prompt diff.
- frontend/src/lib/__tests__/searchQuery.test.ts — partial: Changed hunk only.
- frontend/src/lib/__tests__/searchScopeOperators.test.ts — partial: Changed hunks only.
- frontend/src/lib/__tests__/searchSuggestions.negation.test.ts — full: New file in the prompt diff.
- frontend/src/lib/__tests__/semanticSearch.passages.test.ts — partial: Changed hunk only.
- frontend/src/lib/__tests__/smartCollectionEval.negation.test.ts — full: New file in the prompt diff.

## Unspecified behavior, recorded

- claude-read: On the search page, a held failed, tooLarge or refused notice for an in: key disappears while the query is impossible and reappears unchanged, with no new resolution, when the contradiction is removed.
  - F1 × I1 = 1, claude-read: Typing then deleting a contradicting token on a refused '-in:' query briefly shows the empty state, then the same notice again; this is consistent with the spec but not described.
  - F1 × I2 = 2, claude-verify: After an in: name fails, is too large or is refused, the user makes the query impossible and then undoes that edit; the same notice comes back with no new resolution (useFolderFiles.ts:302 keeps the held resolution, and :355 only hides it while impossible). The notice is still accurate for that key, and 再試行 stays available.
- claude-read: A -in: name that no collection of the drive carries (a typo) is sent as exclude_collection and silently excludes nothing.
  - F2 × I3 = 6, claude-read: Typing '-in:Tirp' shows an Exclude chip over unfiltered results, so the user may believe the collection was excluded.
  - F2 × I4 = 8, claude-verify: If the user mistypes a collection name after -in:, it goes out as exclude_collection (useFolderFiles.ts:392-393), excludes nothing, and the results look like an unfiltered list, though the chip still shows the mistyped name.
- claude-deep: During an impossible stretch with a held resolved in: resolution, trackFirstPage marks that resolution as listed after the (request-free) empty page, so when the query becomes possible again inNamePending is already false before the real first page arrives.
  - F1 × I1 = 1, claude-deep: After editing an in: query through a contradiction and back, the page may for one render show the reset listing's empty state or a 0 count before loading starts, instead of the pending state the in: gate normally gives.
  - F1 × I1 = 1, claude-verify: When a query with a resolved in: name passes through an impossible state, trackFirstPage (useFolderFiles.ts:451-466) records the resolution as listed after the request-free empty page, so inNamePending (:800-804) is already false when the query becomes possible again. paginatedLoading and the per-subject settled count in FolderBrowser.tsx:671-689 still keep a wrong count from showing, so the user sees at most a brief loading difference.
- claude-deep: A -in: name that matches no collection of the drive (a typo) is sent as exclude_collection and silently excludes nothing.
  - F2 × I3 = 6, claude-deep: Typing '-in:Tirp' shows an Exclude chip over unfiltered results with no hint that the name matched nothing.
  - F2 × I4 = 8, claude-verify: Same behavior as claude-read index 1: if the user mistypes the name in a -in: exclusion, the excluded files still appear and nothing points out the unknown name, other than the chip's own text.
- claude-deep: A held failed, tooLarge or refused notice for an in: key reappears, without resolving again, when an intervening impossible edit is undone.
  - F1 × I1 = 1, claude-deep: Removing the contradicting token brings back the same notice as before; only 再試行 or a key change resolves again, as I28 asks.
  - F1 × I2 = 2, claude-verify: Same behavior as claude-read index 0: undoing an impossible edit brings back the held failed, tooLarge or refused notice for an unchanged in: key without resolving again. This matches the documented rule that only a key change, 再試行 or a reload resolves again.

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-deep: No tests or commands were run; conclusions come from reading useFolderFiles.ts lines 175-500 and 795-895 and grepping FolderBrowser, FolderContent and PassageList.
- claude-deep: Whether the one-render window after impossible-to-possible (listedResolution already set) actually shows an empty state or a 0 count depends on useInfiniteScroll's reset timing, which I did not read.
- claude-deep: The backend, addon and frontend files not touched by this fix commit were not reopened in the tree; their review relies on the diff in the prompt and on earlier rounds.
- claude-deep: Whether the real search route remounts useFolderFiles on a q change, which would bypass the held resolution entirely.
- claude-deep: Whether the addons/intelligence checkout matches the submodule pointer 612ee535f.
- claude-read: No tests or commands were run; conclusions come from reading useFolderFiles.ts lines 180-379 and 795-814 and grep results.
- claude-read: PassageList.tsx was read only through grep lines 344-353, not the rest of its rendering for an impossible query.
- claude-read: Backend, addon and other product files unchanged by this fix were read only through the diff in the prompt, not reopened.
- claude-read: Whether the real search route remounts useFolderFiles on a q change was not checked.
- claude-verify: The backend routes (drives.py, shelves.py, internal.py) and the addon's parity were not read.
- claude-verify: useInfiniteScroll's loading behavior when fetchPage identity changes was not read; I inferred that paginatedLoading covers the gap after an impossible stretch.
- claude-verify: No tests were run (tool-limited).

TOTAL: 0 findings
