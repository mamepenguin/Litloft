# Triage: r9

## Trajectory

This run:
- claude-deep: Since r7 the only commit is 9e80b2dc6, a docs commit that declares the revised invariants (I20-I30). Its record lists no fix commits. No round adds or removes a branch, a state or a prediction in code. r7's bucket-A finding R4 (smart-collection-members/route.ts has no memberLimit) is unchanged in code, and I17's text is not narrowed. route.ts:80-91 still evaluates without memberLimit. Its only consumer is the MCP tool, which needs the whole set, so the code is right and the open question is the invariant's scope. Nothing shows the design being patched round over round; the record simply has no fix round to judge.
- claude-read: No fix commits landed between r7 and this review ("Fix commits since the previous review: (none)"). The commit under review, 9e80b2dc6, only declares the revised invariants (I20-I30 in invariants.md), so no round has added a branch, a state or a prediction to the code, and none has removed one. The product code is the same as r7 read it. r7's open bucket-A finding R4 (route.ts passes no memberLimit) was not changed in code. In this checkout, /app-api/smart-collection-members is called only from mcp-server (mcp-server/src/tools/collections.ts), and from no Notes/Clips app target. It is therefore outside I17's app-target scope, and I do not raise it again.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R1 is bucket A or BLOCKER
- open finding claude-deep:D1 is bucket A or BLOCKER
- open finding claude-deep:D2 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/app/file_matching.py — full: All diff hunks, plus lines 215-314 in the file.; partial: Every diff hunk (KINDS, the _normalise_* helpers, SearchFilter, the payload omission in fetch_matching_file_ids); the rest of the file not opened.
- backend/app/routers/drives.py — full: All diff hunks, plus lines 337-612 (kind predicates and apply_file_filters) in the file.; partial: Lines 455-564 of apply_file_filters in the file, plus every diff hunk (the rest of apply_file_filters, filtered_drive_files, FileFiltersQuery, callers).
- backend/app/routers/internal.py — full: Every changed hunk in the diff (FileMatchingRequest fields, validators, files_matching call).; partial: Diff hunks of FileMatchingRequest validators and files_matching only.
- backend/app/routers/shelves.py — full: The single changed hunk, a forwarding of the parameters.; partial: The single diff hunk; ShelfQuery base confirmed by grep.
- frontend/e2e-components/fixtures/app.tsx — full: Both changed hunks.; partial: Both diff hunks.
- frontend/e2e-components/search-chips-negated.spec.ts — full: New file, read whole in the diff.; full: New file, whole in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — full: One-line hunk.; partial: One-line diff hunk.
- frontend/src/components/SmartFolderSaveButton.tsx — full: Both changed hunks.; partial: Lines 180-380 (save, overwrite, play) in the file.
- frontend/src/components/folder/useFolderFiles.ts — partial: All diff hunks plus lines 170-420 of the file; the meaning, continuation and similarity code after line 486 only through the diff hunks.; partial: Lines 175-503 in the file plus every diff hunk.
- frontend/src/components/search/ConditionMenu.tsx — partial: All diff hunks plus a grep of choose() (lines 285-291) and the folder cap (line 664).; partial: Diff hunks plus choose() at lines 285-300.
- frontend/src/components/search/InNameNotice.tsx — full: The diff covers the whole component.
- frontend/src/components/search/SearchFilterChips.tsx — full: All diff hunks.; partial: Diff hunks only.
- frontend/src/components/search/SearchQueryHeader.tsx — full: One hunk.; partial: One diff hunk.
- frontend/src/components/search/useFileSearch.ts — full: Diff hunks plus lines 100-328 of the file.; partial: Lines 110-320 in the file plus the listingParams diff hunk.
- frontend/src/components/search/useLauncherRows.ts — full: Lines 40-105 (the whole hook) plus useJumpDestinations.ts 60-206.; full: The changed hunk.
- frontend/src/components/videoapp/VideoAppHeader.tsx — full: The changed hunk.; partial: The diff hunk.
- frontend/src/components/videoapp/useVideoApp.ts — full: The changed hunk.; partial: The diff hunk.
- frontend/src/lib/appTarget.ts — full: The changed hunks.; partial: Diff hunks.
- frontend/src/lib/inNameResolution.ts — full: All diff hunks.; partial: Every diff hunk (classifyNames, inNamesKey, checkInNamesForSave, resolveInNames head).
- frontend/src/lib/listingRequest.ts — full: All diff hunks.; partial: Diff hunks.
- frontend/src/lib/memberTarget.ts — full: All diff hunks.; partial: Lines 70-123 in the file.
- frontend/src/lib/searchQuery.ts — full: All diff hunks, plus tokenize and normaliseFolder (lines 587-665).; partial: Every diff hunk plus kindOf (645-649) by grep.
- frontend/src/lib/smartCollectionEval.ts — full: All diff hunks, plus the filter call at line 163.; partial: Diff hunks.
- frontend/src/lib/videoAppTarget.ts — full: All diff hunks.; partial: Diff hunks.
- frontend/src/messages-core/en.json — full: All diff hunks.; partial: Diff hunks.
- frontend/src/messages-core/ja.json — full: All diff hunks.; partial: Diff hunks.

Test files:
- addons/intelligence/tests/test_filtered_search_file_ids_conditions.py — partial: Changed hunk only.; partial: The changed hunk only.
- addons/intelligence/tests/test_search_negation_filter.py — full: New file in the diff.
- addons/intelligence/tests/test_search_negation_filter_scope.py — full: New file in the diff.
- backend/tests/test_filtered_drive_files_contract.py — partial: Changed hunk only.; partial: The changed hunk only.
- backend/tests/test_search_negation_operators.py — full: New file in the diff.
- frontend/src/__tests__/appTargetNegation.test.tsx — full: New file in the diff.
- frontend/src/__tests__/core-search-vocabulary.test.ts — partial: Changed hunks only.
- frontend/src/components/__tests__/GlobalSearch.negation.test.tsx — full: New file in the diff.
- frontend/src/components/__tests__/SearchPage.negation.test.tsx — full: New file in the diff.
- frontend/src/components/__tests__/SmartFolderSaveButton.negation.test.tsx — full: New file in the diff.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: One-line hunk.
- frontend/src/components/folder/__tests__/useFolderFiles.scope.test.tsx — partial: Changed hunks only.
- frontend/src/components/readingapp/__tests__/ReadingApp.memberTarget.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchFilterChips.negation.test.tsx — full: New file in the diff.
- frontend/src/components/search/__tests__/SearchQueryHeader.modified.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchQueryHeader.negation.test.tsx — full: New file in the diff.
- frontend/src/components/search/__tests__/SearchQueryHeader.scope.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchQueryHeader.sizeDuration.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/useFileSearch.filtered.test.tsx — partial: Changed hunks only.
- frontend/src/components/videoapp/__tests__/VideoApp.memberTarget.test.tsx — partial: Changed hunks only.
- frontend/src/components/videoapp/__tests__/VideoApp.negationTargetMenu.test.tsx — full: New file in the diff.
- frontend/src/lib/__tests__/inNameResolution.negation.test.ts — full: New file in the diff.
- frontend/src/lib/__tests__/listingRequest.negation.test.ts — full: New file in the diff.
- frontend/src/lib/__tests__/searchImpossibleConditions.test.ts — full: New file in the diff.
- frontend/src/lib/__tests__/searchNegationOperators.test.ts — full: New file in the diff.
- frontend/src/lib/__tests__/searchQuery.test.ts — partial: Changed hunk only.
- frontend/src/lib/__tests__/searchScopeOperators.test.ts — partial: Changed hunks only.
- frontend/src/lib/__tests__/searchSuggestions.negation.test.ts — full: New file in the diff.
- frontend/src/lib/__tests__/semanticSearch.passages.test.ts — partial: Changed hunk only.
- frontend/src/lib/__tests__/smartCollectionEval.negation.test.ts — full: New file in the diff.

## Unspecified behavior, recorded

- claude-read: On the search page, making an in: query impossible and then possible again by editing q or the page type re-resolves the in: names and re-evaluates in: Smart Collections, while the search window keeps its earlier resolution.
  - F1 × I2 = 2, claude-read: A user who briefly types a contradicting token after an in: Smart Collection query sees the results reload more slowly than in the window, because the collection lists are fetched again and the Smart Collection is evaluated again.
  - F1 × I2 = 2, claude-verify: Editing an in: query into an impossible state and back on the search page re-loads the lists and re-evaluates the in: Smart Collection with a new now. The user sees a brief resolving state, and at most a slightly different result when the Smart Collection uses relative modified: ranges.
- claude-read: A -in: name that matches no collection of the drive (a typo, or another drive's collection) is sent as exclude_collection and silently excludes nothing, with no notice.
  - F2 × I3 = 6, claude-read: Typing '-in:Tirp' instead of '-in:Trip' lists the unfiltered results with an Exclude chip shown, so the user may believe the collection was excluded.
  - F2 × I5 = 10, claude-verify: A typo in a -in: name is sent as exclude_collection and matches nothing, so files the user meant to exclude stay in the results with no notice. The spec deliberately says 'a name with no collection excludes nothing', and the visible results usually make the mistake noticeable.
- claude-read: While the typed query in the search window is impossible, the launcher hides its Go to rows, folder jumps and tag suggestions and stops loading tag names.
  - F1 × I2 = 2, claude-read: Typing 'tag:x -tag:x' in the window makes every jump and suggestion row disappear until the contradiction is removed.
  - F2 × I2 = 4, claude-verify: While a typed query in the search window is momentarily contradictory (e.g. 'tag:a -tag:a'), Go to rows, folder jumps and tag suggestions vanish until the conflict is removed. This can look like suggestions broke mid-edit.
- claude-deep: The search window hides jump rows and suggestions for a query that is impossible by kinds or conditions, but not for one that is impossible by range (useLauncherRows omits hasImpossibleRange), while the window's listing treats all three alike.
  - F1 × I1 = 1, claude-deep: Typing 'size:>1GB size:<1MB' in the window still shows jump rows while results are empty, whereas 'tag:x -tag:x' hides them, an inconsistency the user may notice.
  - F1 × I1 = 1, claude-verify: Only a query that is impossible by modified: range keeps showing jump rows and suggestions in the window (useLauncherRows.ts:47-54 omits hasImpossibleRange), while the listing still shows nothing. This is a harmless inconsistency.
- claude-deep: The window's search cache is keyed by the query text, so an entry written before this change for a query such as '京都 -tag:x' (then searched as text) can be read for the same text after it.
  - F0 × I2 = 0, claude-deep: It needs a cache entry that survives the deploy for exactly that text; the user would briefly see the stale text-search results until revalidation.
  - F0 × I2 = 0, claude-verify: The search cache has a 60-second TTL (searchCache.ts:18) and a deploy reloads the app, so a pre-change entry for a query with a new token can be read only in a sub-minute window across a live upgrade, and revalidation replaces it right away.

## Findings

A: 3
B: 0
C: 0

### claude-deep:D1 — bucket A, LOW, open

Claim: In the search window, a typed query that becomes impossible and then possible again turns the launcher's data hooks off and back on. That re-requests pins, collections, Smart Collections, the missing count, auth status, the flat folder tree and the tag list, for a query that holds new tokens and no in: or -in: name.
Impact: Typing an exclusion whose value has the same name as a positive tag along the way (e.g. 'tag:trip -tag:trip2023' passes through 'tag:trip -tag:trip') makes the window reload /collections and /smart-folders. It also reloads the whole flat folder tree (up to 50,000 entries) on every keystroke that leaves the impossible state. Results are not wrong; the cost is extra load and network traffic in a surface that I20 says loads no list for such a query.
Evidence: useLauncherRows.ts:47-59 passes `open && !scope && !impossible` as `active` to useJumpDestinations, useJumpFolders and useDriveTagNames. useJumpDestinations.ts:77-90 (useDriveOwned) re-runs `load(drive)` whenever `active` goes from false to true, and useIsAdmin (:97-110) refetches as well. Before the change `active` stayed true for the whole time the window was open. GlobalSearch.negation.test.tsx only asserts that the impossible query itself sends no /collections request, not what happens on the transition back.
Repro: Open the search window on a drive and type 'tag:trip -tag:trip', then append '2023'. Reading the code, after the last keystroke the window sends GET /collections, /smart-folders, /pins, the folder tree (flat), tags, summary and auth status again. Not run.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep `active` tied to `open && !scope` for the data hooks and apply `impossible` only to `off` (hiding the rows), so an impossible query hides rows without unloading and reloading the data.

</details>

### claude-deep:D2 — bucket A, LOW, open

Claim: On the search page, an in: query whose in: key does not change is resolved again (lists reloaded, and its in: Smart Collection evaluated again with a new `now`) after the query passes through an impossible state and back, because the resolution effect depends on `impossible` and clears the held resolution.
Impact: For a submitted 'in:Weekly tag:x -tag:x' followed by removing the '-tag:x' chip, the page reloads both lists and evaluates Weekly again, although the in: key is the same. A Weekly with a relative modified: can then list a slightly different member set. The window (useFileSearch) keeps its held resolution in the same sequence, so the page and the window behave differently.
Evidence: useFolderFiles.ts:291-296 sets the resolution to null when `impossible`, and :333 lists `impossible` in the effect deps, so a false->true->false flip of `impossible` with an unchanged inKey starts a new resolveInNames at :309 with modifiedNowRef.current, a new run's `now` (:184-191). useFileSearch.ts:123-134 returns early without touching resolutionRef, and :209-210 reuses the held resolution when the listKey matches.
Repro: Render FolderBrowser with searchQuery 'in:"Weekly" tag:x', wait for the evaluation, rerender with 'in:"Weekly" tag:x -tag:x', then with 'in:"Weekly" tag:x'. Reading the code, the evaluation listing for Weekly is sent a second time. Not run.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> While impossible, stop requesting but keep the held resolution (or key the held resolution by inKey and reuse it when `impossible` clears), as useFileSearch does.

</details>

### claude-read:R1 — bucket A, LOW, open

Claim: On the search page, a query that holds an in: name and becomes impossible and then possible again, with the in: key unchanged, resolves its in: names again and re-evaluates any in: Smart Collection with a new `now`, because `impossible` is a dependency of the resolution effect.
Impact: Take 'in:"Weekly" tag:x'. Typing '-tag:x' and then deleting it, or switching the page's type so that the kinds become impossible and back, reloads the collection and Smart Collection lists and re-evaluates Weekly: extra requests, a delay before results return, and, for a Smart Collection with a relative modified: part, possibly a different member set within one in: key. The search window keeps its held resolution (useFileSearch.ts:140,209-210 never clears resolutionRef on the impossible branch), so the page and the window behave differently for the same edit.
Evidence: frontend/src/components/folder/useFolderFiles.ts:291-296 sets inResolution to null whenever `impossible` is true. Line 333 lists `impossible` among the effect's dependencies [inKey, inRetryToken, driveName, impossible], so when the query turns possible again the effect re-runs, sets 'resolving' (line 299) and calls resolveInNames afresh (line 309) with modifiedNowRef.current, the new run's now. Before this change the dependencies were [inKey, inRetryToken, driveName]. I28 says only a change of the in: key, 再試行 or a reload resolves again, and that a q or type change does not. I29 says an in: Smart Collection is not evaluated again until the in: key changes.
Repro: not_reproduced (static reading). Render FolderBrowser with searchQuery 'in:"Weekly" tag:x' and wait for files/query. Rerender with 'in:"Weekly" tag:x -tag:x', then again with 'in:"Weekly" tag:x'. Expected under I28: the Weekly evaluation listing count stays the same. As read: a second evaluation listing and a second collections/smart-folders request are sent.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep the resolution state across an impossible stretch: skip starting a resolution while impossible, without clearing a resolution held for the same inKey, and drop `impossible` from the effect's restart trigger (or start the resolution only when inResolution?.key !== inKey).

</details>

## Not verified

- claude-deep: No test or command was run; D1 and D2 come from reading the code only.
- claude-deep: Whether the search page remounts useFolderFiles on a q change in the real route (the tests rerender with the hook kept); if it remounts, D2 reduces to the reload case.
- claude-deep: GlobalSearch.tsx and FolderBrowser.tsx rendering of the refused notice were not read beyond the tests.
- claude-deep: The addon's Ask scope path and the knowledge addon's Notes/Clips evaluation were not checked.
- claude-deep: ConditionMenu.tsx was read at the diff hunks and choose() only, not the whole component.
- claude-read: No tests or commands were run; R1 is derived from reading useFolderFiles.ts and has not been reproduced.
- claude-read: Whether the production SQLite schema still contains rows with a NULL mime_type despite the NOT NULL model (this matters for NOT(...) in exclude_type).
- claude-read: ConditionMenu.tsx and SearchFilterChips.tsx were read through the diff hunks and targeted greps, not line by line in full.
- claude-read: The continuation and 'Show more by similarity' code paths in useFolderFiles beyond line 486 were not read; I11 for them rests on the filter memo and the tests.
- claude-read: Whether the addons/intelligence checkout matches the submodule pointer 612ee535f.
- claude-read: The design artefact and the R-5 records were not opened.
- claude-verify: Did not run any test or the app; behaviour inferred from reading the code.
- claude-verify: Did not inspect the base commit's useFolderFiles.ts/useLauncherRows.ts directly; that the `impossible` gating was introduced here rests on the r7 triage notes.
- claude-verify: Did not read GlobalSearch.negation.test.tsx or the backend/addon files.

TOTAL: 3 findings
