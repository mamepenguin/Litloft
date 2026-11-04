# Triage: r1

## Warnings

- R-5 ran at 47a8390a33723952a26b213f4c9568cb1bcffe80, and these files changed since: backend/app/main.py, backend/app/models.py, backend/app/routers/drives.py, backend/app/routers/files.py, backend/app/routers/inbox.py and 14 more; run R-5 again if any of them changes what a user sees

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

## Findings

A: 0
B: 4
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff changes production code in frontend/src/components/search/SearchQueryHeader.tsx (new `show` prop, and `show=passages` added to the submission URL), and that file is not in the touch-point list.
Impact: The touch-point list puts "A2's submission keeps it" under `frontend/src/app/drive/[name]/search/page.tsx`, but page.tsx does not build the submission URL. A reader who trusts the list would look for I9's submission behaviour in the wrong file and could miss a regression in SearchQueryHeader. The behaviour itself is implemented: FolderBrowser passes `show={show}` to SearchQueryHeader, and SearchQueryHeader.showPassages.test.tsx covers it.
Evidence: diff: frontend/src/components/search/SearchQueryHeader.tsx adds `show?: string | null` and `if (show === "passages") params.set("show", "passages");` in the href builder. FolderBrowser.tsx passes `show={show}` at the SearchQueryHeader call site. The touch-point list names page.tsx for 'A2's submission keeps it' and does not mention SearchQueryHeader.tsx.
Repro: Compare the file list of the diff with the Core touch points: SearchQueryHeader.tsx appears in the diff and not in the list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `frontend/src/components/search/SearchQueryHeader.tsx` (A2's submission keeps `show`) to the spec's touch points, and remove that clause from the page.tsx bullet.

</details>

### claude-read:TP-4 — bucket B, LOW, open

Claim: The opposite direction: listed touch point `docs/addons/intelligence.md` (`passages=true` on `/search` and the `SearchPassage` shape) is not reached by the diff. The file has no mention of `passages=true` or `SearchPassage`.
Impact: A reader of the addon docs does not learn about the opt-in parameter or the wire shape that MCP and other callers could use. Documentation only.
Evidence: Grep for 'passages=true|SearchPassage' in *.md matches only docs/specs/passage-results-view.md and the review decisions.md. docs/addons/intelligence.md:242 mentions 'passages' only in the Ask retrieval description.
Repro: Grep 'passages=true' in docs/addons/intelligence.md returns no match.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Document `passages` on `/search` and the `SearchPassage` fields in docs/addons/intelligence.md, or remove the bullet from the touch points if that is deliberately deferred.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The commit under review (5d7f98bc3) edits frontend/e2e-layout/spec-viewport.spec.ts, a shared fixture registry: it adds `passage-rows.html` to FIXTURES and raises FIXTURE_COUNT from 15 to 16. The touch-point list does not name that file.
Impact: None at runtime. The edit is required: without it, 'the fixtures checked are the fixtures on disk' fails once passage-rows.html exists. The list only implies the edit through 'a frontend/e2e-layout/ case with a static fixture'.
Evidence: frontend/e2e-layout/spec-viewport.spec.ts:30 adds "passage-rows.html", and line 41 has FIXTURE_COUNT = 16. Glob of frontend/e2e-layout/fixtures/*.html returns exactly 16 files, which match the declared list, so the registry is consistent.
Repro: not_reproduced (cannot run Playwright). Read check: the declared list equals the 16 files on disk.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-3 — bucket B, INFO, open

Claim: The diff edits the existing frontend/src/__tests__/core-search-vocabulary.test.ts: per-caller key counts (FolderBrowser 1→6, new PassageList 12) and the total used-key population 56→70. The touch-point list names no such existing test.
Impact: None for a user. If those counts are wrong, the vocabulary guard fails loudly, not silently. 'Frontend tests next to the existing search tests' arguably covers the file.
Evidence: diff hunk in frontend/src/__tests__/core-search-vocabulary.test.ts: CALLERS map and `expect(used.length).toBe(70)`.
Repro: not_reproduced (cannot run vitest).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Did not run Playwright or vitest; the counts (16 fixtures, 70 vocabulary keys) were checked only by reading, the keys not at all.
- claude-read: The diff was truncated at 200000 bytes, so addon-repository files changed after test_search_passages.py (other tests, helpers, addon docs) may be missing from this list.
- claude-read: Could not read the git objects to confirm the exact file set of commit 5d7f98bc3 alone; I assumed it is the spec-viewport.spec.ts edit its message describes.
- claude-verify: Could not run git diff; changed-file set taken from r1/classification.json and the working tree at HEAD
- claude-verify: Did not inspect the addons/intelligence submodule diff contents or run any tests
- claude-verify: Did not check the invariants I1–I25 beyond the four findings

TOTAL: 4 findings
