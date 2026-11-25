# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/src/lib/appTarget.ts — full: Read the whole file.
- frontend/src/lib/memberTarget.ts — full: Read the whole file.
- frontend/src/lib/videoAppTarget.ts — full: Read the whole file.

Test files:
- frontend/src/__tests__/appTargetNegation.test.tsx — partial: Read only the diff hunks; unchanged lines 26-102 (the mocks and helpers) were not read.
- frontend/src/components/videoapp/__tests__/VideoApp.directTargetProviders.test.tsx — full: New file; its whole content appears in the diff.
- frontend/src/lib/__tests__/appTarget.test.ts — partial: Read only the diff hunk around lines 116-160.
- frontend/src/lib/__tests__/appTargetDirectExclusions.test.ts — full: New file; its whole content appears in the diff.
- frontend/src/lib/__tests__/readingAppTarget.test.ts — partial: Read only the diff hunks at the import and around lines 91-107.

## Unspecified behavior, recorded

- claude-read: For a query with free text and an exclusion (e.g. 'cats -path:Work'), resolveAppTarget and resolveVideoTarget now return usable params carrying both search and exclude keys, where before they returned unsupported_part.
  - F0 × I1 = 0, claude-read: Every caller checks the member target first or ORs the two results (VideoAppHeader.tsx:15, useVideoApp.ts:172, readingAppTarget.ts:39, useNotesTarget.ts:230-231), so the user sees no difference.
  - F1 × I1 = 1, claude-verify: Only a query with free text and an exclusion triggers it, and the user sees nothing different. Every caller (useVideoApp.ts:226, useNotesTarget.ts:84, and Reading through its member resolver) tries resolveMemberTarget first, and a query with free text always becomes a member target (memberTarget.ts:89), so the new direct params with search and exclude keys are never sent. The change only alters the result of a usability check whose outcome was already usable.
- claude-read: resolveVideoTarget calls hasImpossibleConditions(parsed) without folder.file_type, while resolveAppTarget passes it.
  - F0 × I1 = 0, claude-read: Video's separate excluded-kind and kinds checks give the same empty result for a fixed file_type, so the user sees nothing different.
  - F1 × I1 = 1, claude-verify: It applies when a Video target query excludes a kind and the folder has a fixed file_type. The user sees no difference: resolveVideoTarget re-resolves kinds with folder.file_type at videoAppTarget.ts:57-61 and returns empty whenever the fixed kind is not video or video is excluded, so leaving out the argument at line 54 never changes the result.

## Findings

A: 0
B: 3
C: 0

### claude-read:TP-1 — bucket B, INFO, open

Claim: The new test file frontend/src/lib/__tests__/appTargetDirectExclusions.test.ts is reached by the diff but is not named in the spec's touch-point list.
Impact: No user impact. The test pins the resolver output of resolveAppTarget, resolveVideoTarget, resolveReadingTarget and resolveMemberTarget, and checks that the direct wire form equals the evaluateSmartCollection wire form (I4). It is a test-only place the plan did not list.
Evidence: The diff adds frontend/src/lib/__tests__/appTargetDirectExclusions.test.ts as a new file of 273 lines. The touch points name only appTarget.test.ts and appTargetNegation.test.tsx as tests under frontend/src.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the file to the touch-point list, or accept it as an unplanned test addition.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The new test file frontend/src/components/videoapp/__tests__/VideoApp.directTargetProviders.test.tsx is reached by the diff but is not in the touch-point list.
Impact: No user impact. It covers I3 for provider restrict calls on Discover and on the See all page, and I9 for keying the Discover cache. Those behaviours live in restrict.ts and discoverCache.ts, which are listed, but this test location is not.
Evidence: The diff adds a new file of 281 lines. The touch points list videoapp product files (restrict.ts, discoverCache.ts and others) and no videoapp __tests__ path.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the file to the touch-point list.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: frontend/src/lib/__tests__/readingAppTarget.test.ts is modified by the diff but is not in the touch-point list. The list names readingAppTarget.ts only as 'read through', and its list of rewritten existing tests names only appTarget.test.ts and appTargetNegation.test.tsx.
Impact: No user impact. An existing test that pinned '-tag:read' and '!type:pdf' as unsupported_part was rewritten to the reversed behaviour. It is a third reversed test the plan's 'Existing tests that pin the behaviour this spec reverses' entry does not mention.
Evidence: The diff changes readingAppTarget.test.ts at around lines 91-107. The test 'refuses the negated operator %s' is replaced with 'SPEC-CORE-177 carries a parsed negation as the listing key' and a search-text/member-target case.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add readingAppTarget.test.ts to the list of reversed existing tests.

</details>

## Not verified

- claude-read: I did not run any tests.
- claude-read: The task names commit 9cf130c74 (a docs commit), but I reviewed the diff supplied in the prompt and could not confirm with git what that commit alone contains.
- claude-read: I did not audit every videoapp and readingapp component for spreading the params; I sampled restrict.ts and the tag merges in LibraryFace and ShelfPage.
- claude-read: I did not verify that the backend shelves and tag-count endpoints accept every new key; I only grepped for exclude_folder in drives.py and shelves.py.
- claude-verify: I did not run git diff, so whether each file was added or modified by this specific commit rests on the reader's evidence and on the file contents at HEAD.
- claude-verify: I did not check the declared invariants (I1-I10, revised I5) against the UI components or addon code.
- claude-verify: I did not run the tests.

TOTAL: 3 findings
