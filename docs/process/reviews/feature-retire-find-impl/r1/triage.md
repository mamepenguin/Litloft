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
- addons/intelligence/app/rag/service.py — full: Read every changed hunk in the diff (import line, docstring, removed Find block, removed find_files wrapper). Grepped for remaining uses of the removed and kept helpers.
- addons/intelligence/app/routers/rag.py — full: Read the changed hunks (imports, removed find_endpoint) in the diff. Grepped the remaining imports.
- addons/intelligence/app/schemas.py — full: Read the changed hunk (removed FindRequest and FindResponse) in the diff.
- addons/intelligence/frontend/AskFindHeader.test.tsx — full: Read all hunks in the diff.
- addons/intelligence/frontend/AskFindHeader.tsx — full: Read the file from line 10 to the end, plus the import hunk in the diff.
- addons/intelligence/frontend/FindChip.test.tsx — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/frontend/FindChip.tsx — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/frontend/FindModeSlot.menuRow.test.tsx — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/frontend/FindModeSlot.test.tsx — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/frontend/FindModeSlot.tsx — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/frontend/ModeTabs.scope.test.tsx — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/frontend/ModeTabs.test.tsx — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/frontend/ModeTabs.tsx — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/frontend/Page.scope.test.tsx — full: Read the changed hunk (removed link loop) in the diff.
- addons/intelligence/frontend/Page.test.tsx — full: Read the changed hunks (imports, describe rename, new I1 test) in the diff.
- addons/intelligence/frontend/Page.tsx — full: Read the changed hunk at the AskFindHeader call site. Grepped for the call site.
- addons/intelligence/frontend/api.ts — full: Read the changed hunk (removed findFiles and Find types). Grepped for leftover references.
- addons/intelligence/frontend/findFiles.api.test.ts — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/frontend/messages/en.json — full: Read the changed hunk (removed modeTabs and find blocks). Grepped for remaining key users.
- addons/intelligence/frontend/messages/ja.json — full: Read the changed hunk (removed modeTabs and find blocks).
- addons/intelligence/frontend/pages/find.test.tsx — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/frontend/pages/find.tsx — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/frontend/slots.ts — full: Read the changed hunk (removed find-mode registration) in the diff.
- addons/intelligence/manifest.json — full: Read both changed hunks (search-modes slot and /find route removals) in the diff.

Test files:
- addons/intelligence/frontend/__tests__/retireFind.manifest.test.ts — full: New file. Its whole content appears in the diff.
- addons/intelligence/frontend/__tests__/retireFind.searchModes.test.tsx — full: New file. Its whole content appears in the diff.
- addons/intelligence/tests/test_find_router.py — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/tests/test_find_service.py — full: Deleted file. Its whole content appears in the diff.
- addons/intelligence/tests/test_llm_routing_callers.py — partial: Read only the changed hunks in the diff (Ask/Find parametrization and the removed Find tests).
- addons/intelligence/tests/test_rag_trust_filter.py — partial: Read only the removed test hunk in the diff.
- addons/intelligence/tests/test_read_paths_skip_write_lock.py — partial: Read only the _READ_POSTS hunk in the diff.
- addons/intelligence/tests/test_search_file_kind_filter.py — partial: Read only the changed test function hunk in the diff.
- addons/intelligence/tests/test_spec_addon_071_validation_body.py — partial: Read only the BODIES and ROWS hunk in the diff.
- backend/tests/test_addon_proxy_drive_scope.py — full: Read lines 1-180, including the fixtures and the new test.
- frontend/src/app/drive/[name]/addons/[addon]/[slug]/__tests__/page.retireFind.test.tsx — full: New file. Its whole content appears in the diff. Also read the page.tsx it exercises.

## Findings

A: 0
B: 2
C: 0

### claude-read:CR-1 — bucket B, INFO, open

Claim: Four new test files that the diff adds do not appear in the Touch points list of docs/specs/retire-find.md: addons/intelligence/frontend/__tests__/retireFind.manifest.test.ts, addons/intelligence/frontend/__tests__/retireFind.searchModes.test.tsx, the new test_undeclared_route_is_404_without_calling_upstream in backend/tests/test_addon_proxy_drive_scope.py, and frontend/src/app/drive/[name]/addons/[addon]/[slug]/__tests__/page.retireFind.test.tsx.
Impact: None for the user. The paragraph 'Where the SPEC-ADDON-158 tests live' (retire-find.md:219-223) names the repository for each invariant's test (I1, I2, I3 grep and I5 in the addon; I3 proxy 404 and I4 in core), but the Touch points section names no file for them, and its core list says only 'No core frontend or backend production code changes'. The new files are test code that matches that paragraph, so this is a gap in the list, not a change nobody planned.
Evidence: retire-find.md:141-197 lists the touch points, and none of these four paths is in it. retire-find.md:219-223 assigns the invariant tests to repositories without file names. The diff adds the four tests, each labelled SPEC-ADDON-158 I2, I3, I4 or I5 (grep for SPEC-ADDON-158).
Repro: not_reproduced (compared the diff's file list with the spec's Touch points section)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:CR-2 — bucket B, INFO, open

Claim: addons/intelligence/app/rag/service.py changes its import line to drop TimeRange from the query_decomposer import. That line is not among the items the spec allows to change in service.py ('the functions and constants item 7 lists, and only those', plus docstrings on kept code).
Impact: None. TimeRange was used only by the deleted _build_decomposed_from_overrides. Grep finds no other use in service.py and no test that patches service.TimeRange; tests import it from app.rag.query_decomposer.
Evidence: service.py:59 changes from 'DecomposedQuery, TimeRange, decompose_query' to 'DecomposedQuery, decompose_query'. retire-find.md:162 limits service.py changes to the item-7 list. retire-find.md:96-97 allows only docstring edits on kept code, which covers the _rrf_merge_candidates docstring edit at service.py:464.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Did not run any test suite (Python, vitest), so pass/fail is inferred by reading only.
- claude-read: Did not check whether the coverage floors were changed or still pass after the deletions (D3).
- claude-read: Did not read the whole of service.py, rag.py or schemas.py beyond the diff hunks and grep checks for leftover symbols.
- claude-read: Did not verify that the Next.js build's dynamic import context excludes the deleted pages/find at build time.
- claude-verify: Pre-change content of service.py:59 (no git access); only the post-change state was read.
- claude-verify: Whether the _rrf_merge_candidates docstring at service.py:464 was edited, and whether kept function bodies are unchanged (no diff available).
- claude-verify: Tests were not executed.

TOTAL: 2 findings
