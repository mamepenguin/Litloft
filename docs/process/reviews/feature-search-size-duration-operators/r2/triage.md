# Triage: r2

## Trajectory

This run:
- claude-deep: I could not judge this fully. The fix-commit diffs were cut off, and the visible ones (e1648ca through e2d6290) only draft or revise specs for other features: Ask scope, share target and image query. They add no branch, state or prediction to the size/duration change. The r1 findings were scope observations on canOfferContinuation and hasOperators. They did not call for a code change, so I see no sign of patching.
- claude-read: The fix-commit record I received is truncated. The visible part (the first commits) consists of spec drafts for unrelated features (Ask scope, share target, image query). Those add no branch or state to this change, so I cannot say from the record whether any round of this change added a branch, state or prediction that an earlier round also added. The final diff looks consistent: the size and length entries live in ConditionMenu with fixed preset lists, and the single shared parser covers the listing and the Internal API. The only new finding is a fragile test dependency on the addon file. I cannot confirm whether the design is being patched.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: canOfferContinuation also checks searchKinds.impossible (raised in r1).; hasOperators is now true for size and duration, which reaches GlobalSearch, FolderBrowser and SearchResultsList (raised in r1).
- claude-deep: canOfferContinuation also checks searchKinds.impossible (raised in r1).
- claude-deep: hasOperators is now true for size and duration, which reaches GlobalSearch, FolderBrowser and SearchResultsList (raised in r1).

## Findings

A: 0
B: 3
C: 0

### claude-deep:D1 — bucket B, LOW, open

Claim: A core frontend test reads the addon submodule's Page.tsx from disk and extracts the ConditionMenu entries with a regex.
Impact: The core test suite depends on a submodule checkout and on the exact JSX shape of addons/intelligence/frontend/Page.tsx. It fails if the submodule is absent, or if the addon reformats that JSX, even though the menu is correct.
Evidence: frontend/src/components/search/__tests__/ConditionMenu.test.tsx: ASK_PAGE resolves to addons/intelligence/frontend/Page.tsx, and the regex /<ConditionMenu[\s\S]*?entries=\{(\[[^\]]*\])\}/ parses it.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Pin the Ask page's entries in an addon-side test, and keep the core test on an explicit entries list.

</details>

### claude-read:R2-1 — bucket B, LOW, open

Claim: A core test, ConditionMenu.test.tsx, reads the file addons/intelligence/frontend/Page.tsx from the submodule checkout and extracts the Ask page's entries list from it with a regex.
Impact: The core frontend test run fails if the submodule is not checked out, if the addon moves or reformats that file, or if the addon changes its entries literal. A change in the addon, which has its own PR, can break the core suite. No user-visible effect.
Evidence: frontend/src/components/search/__tests__/ConditionMenu.test.tsx, the new test 'draws the Ask page's entries without Size or Length': readFileSync(ASK_PAGE) with the regex /<ConditionMenu[\s\S]*?entries=\{(\[[^\]]*\])\}/.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Pin the Ask page's four entries in a core test that renders ConditionMenu with that literal list, and drop the file read.

</details>

### claude-deep:D2 — bucket B, INFO, open

Claim: The frontend impossible-range check treats fractional-second duration ranges as possible, while the backend compares whole seconds, so some ranges that admit no stored value are still requested.
Impact: For example, a query with duration >=90.5 and duration <=90.9 is sent to both stages and returns an empty result, instead of requesting nothing as I7 describes for ranges that admit no value. The user sees an empty list either way.
Evidence: frontend/src/lib/searchQuery.ts comparisonsImpossible (duration branch) compares real numbers. backend/app/routers/drives.py _apply_range_filters casts File.duration to Integer before comparing.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: I ran no tests, because I have no execution tool.
- claude-deep: I did not read the full bodies of the changed source files beyond the diff shown.
- claude-deep: I did not diff the addon submodule against its own repository.
- claude-deep: The fix-commit diffs were truncated in the prompt. The visible ones are docs-only spec drafts for other features, so I could not check what the fixes since r1 did.
- claude-deep: I did not verify the F2 consumers (GlobalSearch, FolderBrowser, SearchResultsList) by reading them again.
- claude-deep: I did not check non-SQLite behavior of CAST.
- claude-read: I ran no tests and could not read git history.
- claude-read: I did not read the full source files beyond the diff, so I did not check other callers of the changed functions.
- claude-read: The fix diffs in the record were truncated at 200000 bytes, so I did not see the later fix commits, including the ConditionMenu move and the restored menu entries, except through the final diff.
- claude-read: I did not diff the addon submodule against its own repository.
- claude-read: I did not check the contents of invariants.md or the other files in the r2 review directory.
- claude-verify: I did not run any tests.
- claude-verify: I did not check the addon's SearchFilter validation parity (I8).
- claude-verify: I did not check the backend duration wire-form validator for fractional values.
- claude-verify: I did not check whether the spec explicitly allows fractional duration amounts.

TOTAL: 3 findings
