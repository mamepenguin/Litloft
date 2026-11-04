# Triage: r2

## Warnings

- R-5 ran at fb2b2108a4428a1728cbf0ce503b3b59bf67cc9d, and these files changed since: .claude/rules/internal-api-policy.md, backend/app/database.py, backend/app/routers/internal.py, backend/app/services/fileops.py, docs/ADDON-DEVELOPMENT.md and 5 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-deep: There was one fix round (efbe71ff3). It adds no new branch, state or prediction. It replaced casefold() with lower() in the addon's tag deduplication, which removes a divergence instead of adding a special case, and it added one test row and corrected one doc sentence. The design is not being patched. One related divergence that r1's verifier noted (length checked after dedup in the addon, before dedup in the core) was not addressed in this round.
- claude-read: There has been one fix round (efbe71ff) since r1. It adds no branch, state or prediction. It replaces the addon's fold function (casefold → lower) so it matches the core's, adds one parity test row, and corrects the documented tag cap from 10 to 20. Nothing was added that an earlier round had also added, so there is no sign of the design being patched. The round also did not remove the second validator divergence that the r1 verifier noted (length checked after dedup in the addon, before dedup in the core). It remains open as R2-1.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R2-1 is bucket A or BLOCKER

## Findings

A: 1
B: 4
C: 0

### claude-read:R2-1 — bucket A, LOW, open

Claim: The addon and the core still check the 200-character tag cap on different tags. The addon checks only the tags it keeps after deduplication. The core checks every stripped tag before deduplication. So when a duplicate whose lower() fold matches has a different length, the two validators disagree.
Impact: Take the filter tags ['İ'*101, 'i̇'*101]. 'İ'.lower() is 'i̇', two code points, so both tags have the same key. The addon keeps the first tag (101 characters), skips the second as a duplicate, accepts the filter and calls the core. The core sees the second tag at 202 characters and answers 422. The addon then answers 503, and the user silently gets no meaning hits where both sides should have answered 422 or both accepted. It is practically unreachable in normal use.
Evidence: addons/intelligence/app/file_matching.py:61-73: duplicates are skipped at :66-67, and the length check at :72 runs over the kept `tags` only. backend/app/routers/internal.py:633-641: the length check at :637 runs on every non-blank tag before `deduped.setdefault` at :641. The r1 verifier already noted this second divergence. The fix commit efbe71ff changed only the fold (casefold to lower) and left the length check alone.
Repro: not_reproduced. Reasoning from Python semantics: 'İ'.lower() == 'i̇'. The addon path gives seen={'i̇'*101} and tags=['İ'*101], all lengths ≤200, so it accepts. The core path gives len('i̇'*101)=202>200, so it raises ValueError and answers 422.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In the addon, check the length of every stripped tag before skipping duplicates, as the core does. Add a parity row with ['İ'*101, 'i̇'*101].

</details>

### claude-deep:R2-1 — bucket B, LOW, open

Claim: The addon validator checks the 200-character tag cap only on the tags it keeps after lower()-deduplication, while the core request model checks it on every stripped raw tag before deduplication, so the two validators can still disagree on the same input.
Impact: A filter whose dropped duplicate is over 200 characters but whose kept spelling is not (possible only where lower() changes string length, e.g. U+0130 'İ' lowers to two code points) is accepted by the addon. The core then answers 422, the addon turns that into 503, and the frontend silently shows no meaning hits. Reaching this needs a tag over 200 characters made of length-changing capitals, which is crafted input that normal personal use does not produce.
Evidence: addons/intelligence/app/file_matching.py:61-73 deduplicates first (line 65-68) and runs the length check on the deduplicated list (line 72). backend/app/routers/internal.py:633-641 runs the length check on each raw tag (line 637) before setdefault (line 641). The r1 verifier recorded the same ordering divergence. The fix commit changed only the fold function, not this ordering.
Repro: not_reproduced. Reasoning: tags = ['İ'*101, 'i̇'*101]. Both lower() to the same 202-code-point string. The addon keeps the first (101 characters) and accepts. The core sees the second raw tag at 202 characters and answers 422.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Check the length on every raw stripped tag before deduplicating in file_matching.py, in the same order as the core.

</details>

### claude-deep:R2-2 — bucket B, LOW, open

Claim: The casefold-only parity row was added only to the addon's INVALID_FILTERS table. The core's test_internal_files_matching.py has no row with a fold-sensitive pair, so nothing pins the core validator's fold.
Impact: Changing the core's validate_tags (or apply_file_filters' by_fold) from lower() to casefold() would reintroduce the r1 I10 divergence from the other side, and no core test would fail. The 'Layer 2 parity table' is two hand-maintained lists, not one table run against both models.
Evidence: addons/intelligence/tests/test_filtered_search_contract.py:176-179 is the only occurrence of 'straße'/'STRASSE' in any *.py test (Grep over the repository). The TestRequestCaps cases in backend/tests/test_internal_files_matching.py use ASCII tags only (t0..t20, 'x'*n).
Repro: Mutation (in thought): backend/app/routers/internal.py:641 `tag.lower()` -> `tag.casefold()`. The backend caps tests still pass (ASCII only), and the addon tests do not exercise the core model. Survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add to backend TestRequestCaps the same row: 19 ASCII tags + ['straße','STRASSE'] -> 422.

</details>

### claude-read:R2-2 — bucket B, LOW, open

Claim: The new parity row 'casefold-only-pair-is-two-tags' exists only in the addon's table. No core-side test pins the core's tag fold, so a change of the core's lower() to casefold() would pass every test while breaking I10.
Impact: A later edit to FileMatchingRequest.validate_tags could reintroduce the r1 divergence from the core side without any test failing. Users would then get silent 503s or no meaning hits near the 20-tag cap.
Evidence: addons/intelligence/tests/test_filtered_search_contract.py:176-179 adds the row on the addon side only. A grep of backend/tests for 'straße|casefold|VALID_FILTERS' finds nothing. backend/tests/test_internal_files_matching.py TestRequestCaps covers only ASCII deduplication ('T0').
Repro: Mutation: in backend/app/routers/internal.py:641, change `tag.lower()` to `tag.casefold()`. No backend test exercises a pair where casefold and lower differ, so the mutant is expected to survive. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the same row (19 ASCII tags + 'straße', 'STRASSE' → 422) to backend/tests/test_internal_files_matching.py TestRequestCaps, or drive both sides from one shared table.

</details>

### claude-deep:R2-3 — bucket B, INFO, rejected

Claim: docs/specs/filtered-semantic-search.md:172 still says 'then the caps of 10 apply' (and section 2 says 'over the caps in 10'), while both validators and the now-corrected docs/addons/intelligence.md use 20 tags / 200 characters / 8 kinds.
Impact: A reader who treats the approved spec as the reference could lower TAG_MAX_COUNT or _MATCHING_MAX_TAGS to 10. That would break I10 parity and reject valid 11-20-tag queries. The fix commit corrected only the addon guide.
Evidence: docs/specs/filtered-semantic-search.md:172 'alias, then the caps of 10 apply.' versus addons/intelligence/app/file_matching.py:27 TAG_MAX_COUNT = 20, backend/app/routers/internal.py:57 _MATCHING_MAX_TAGS = 20, and spec section 10 itself ('at most 20 tags').
Repro: Read the lines cited above.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete 'of 10' / 'in 10' so the sentences refer to the caps in section 10. The spec is hash-approved, so this needs re-approval.

</details>

## Not verified

- claude-deep: I ran no tests. The mutation outcomes above come from reading the code, not from running the tests.
- claude-deep: I did not verify that the submodule checkout in this worktree is exactly at 5d65c9d9. I read the file as it is on disk.
- claude-deep: I did not re-read the addon's scoped channel code in app/search.py. This round did not change it.
- claude-deep: I did not check how the frontend parser's JavaScript toLowerCase() differs from Python lower() for tag deduplication before the request.
- claude-read: No tests were run, so I did not confirm that the new addon parameter passes or that the R2-2 mutant survives.
- claude-read: I did not confirm that the worktree's submodule checkout is exactly 5d65c9d.
- claude-read: I did not re-read the scoped channel code in addons/intelligence/app/search.py, because this round did not touch it.
- claude-read: The 'İ' behaviour of str.lower() is stated from Python's Unicode semantics, not executed.
- claude-verify: I did not run any test; the U+0130 divergence was derived by reading the code and from Python's str.lower semantics, not executed.
- claude-verify: I did not check whether a FileKindParam enum mismatch exists between the addon and core kind validators beyond the markdown alias.
- claude-verify: I did not review the frontend or the search channel changes.

TOTAL: 5 findings
