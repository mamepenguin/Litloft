# Triage: r6

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

Note: The submodule bump changes Ask tab behaviour (thread, New conversation, Save as Markdown) and the /files/{id}/ask contract (history), with no spec in this change.; The ConditionMenu label now shows at phone width; no design decision (D1–D12) states this.; FolderBrowser.handleSceneToggle builds the URL from props rather than the current URL params, so any parameter the page does not model (for example img) is dropped on toggle; the old page-level toggle copied every parameter.
- claude-read: The submodule bump changes Ask tab behaviour (thread, New conversation, Save as Markdown) and the /files/{id}/ask contract (history), with no spec in this change.
- claude-read: The ConditionMenu label now shows at phone width; no design decision (D1–D12) states this.
- claude-read: FolderBrowser.handleSceneToggle builds the URL from props rather than the current URL params, so any parameter the page does not model (for example img) is dropped on toggle; the old page-level toggle copied every parameter.
- claude-verify: The ConditionMenu label is now visible at phone width, and no spec item covers it.
- claude-verify: The submodule bump ships the Ask thread, file-question history and storyboard retry behaviour without a core spec.

### unspecified_behavior

Note: The ConditionMenu label is now visible at phone width, and no spec item covers it.; The submodule bump ships the Ask thread, file-question history and storyboard retry behaviour without a core spec.
- claude-read: The submodule bump changes Ask tab behaviour (thread, New conversation, Save as Markdown) and the /files/{id}/ask contract (history), with no spec in this change.
- claude-read: The ConditionMenu label now shows at phone width; no design decision (D1–D12) states this.
- claude-read: FolderBrowser.handleSceneToggle builds the URL from props rather than the current URL params, so any parameter the page does not model (for example img) is dropped on toggle; the old page-level toggle copied every parameter.
- claude-verify: The ConditionMenu label is now visible at phone width, and no spec item covers it.
- claude-verify: The submodule bump ships the Ask thread, file-question history and storyboard retry behaviour without a core spec.

## Findings

A: 0
B: 5
C: 0

### claude-read:TP-1 — bucket B, MEDIUM, open

Claim: The addons/intelligence submodule bump brings in much more than the FindModeSlot change named in the touch points: the Ask tab thread UI and its save-as-note, file-question history in the backend route and schema, an empty-answer failure path, the YouTube storyboard retry on reindex, and an `origin` field on knowledge note creation.
Impact: Merging this core PR changes the Ask tab (new layout, a New conversation button, Save as Markdown, an emptied box after send), the `/files/{id}/ask` request contract (a `history` field, 422 for a malformed one), and reindex behaviour for YouTube lofts. The search-layout spec, its invariants and the review do not cover any of this, so a regression in those features would land without a spec or a review aimed at it.
Evidence: Submodule diff 07dbabce..76317005 touches addons/intelligence/frontend/AskTab.tsx, askStore.ts, askStream.ts, askNoteFormat.ts, citationLabel.ts (new), AskSaveDialog.tsx, knowledgeBridge.ts, messages/{en,ja}.json (newConversation), app/routers/rag.py, app/rag/file_question.py, app/rag/prompt.py, app/schemas.py (FileQuestionTurn, history), prompts/rag/file_question_*.jinja2, app/routers/files.py, app/workers/clip.py (request_storyboard_retry), and new tests AskTabThread.test.tsx, test_spec_addon_081_file_question_history.py and test_spec_addon_085_storyboard_retry.py. The touch-point list names only `addons/intelligence/frontend/FindModeSlot.tsx` and "the submodule pointer, bumped to the merged FindModeSlot change".
Repro: Read the submodule portion of the diff and compare each changed path with the touch-point list. Only FindModeSlot.tsx, FindModeSlot.test.tsx and FindModeSlot.menuRow.test.tsx belong to this spec.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either bump the pointer to a commit that holds only the FindModeSlot change on top of 07dbabce, or record the extra addon specs (Ask thread, file-question history, storyboard retry) as already merged and reviewed, and list them in the touch points.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: A test that the submodule bump brings in tags a different feature (file-question history) with SPEC-ADDON-081, the ID this change's spec and INDEX.md give to the FindModeSlot menu row.
Impact: Traceability breaks: a search for SPEC-ADDON-081 now finds two unrelated features. A reviewer or tool that maps tests to invariants by ID would credit history tests to the Find menu-row spec, or the reverse.
Evidence: addons/intelligence/tests/test_spec_addon_081_file_question_history.py docstring: "SPEC-ADDON-081: a file question carrying the earlier turns of its conversation", and its tests cite "SPEC-ADDON-081 I3" and other items. docs/specs/search-results-layout.md:4 and docs/specs/INDEX.md:165 declare SPEC-ADDON-081 as intelligence's find-mode entry drawing a menu row. No spec file in the repo declares a file-question-history SPEC-ADDON-081.
Repro: Grep for SPEC-ADDON-081: the matches are search-results-layout.md, INDEX.md, FindModeSlot.menuRow.test.tsx and test_spec_addon_081_file_question_history.py, which describe two different features.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Renumber one of the two specs, and the test names and docstrings that cite it, so that each SPEC-ADDON ID names one feature.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: `frontend/src/components/search/ConditionMenu.tsx` is changed so the 「＋ 条件」 button shows its word at every width, and no touch point or design decision lists this.
Impact: At phone width the chip row gains the word 「条件」/"Filter" beside ＋, which changes the chip-row wrapping that I1/I10 measure. The user guide still says the button is just **＋** on a phone (docs/user-guide/search.md:37).
Evidence: ConditionMenu.tsx: `<span className="hidden sm:inline">{label}</span>` became `<span>{label}</span>`. The new e2e test `the condition button names what it adds at 390px` in frontend/e2e-components/search-results-bar.spec.ts asserts this. The e2e-layout fixture search-header.html still keeps `hidden sm:inline` on that label, so the layout fixture no longer copies the real markup.
Repro: Compare the diff hunk for ConditionMenu.tsx with the touch-point list, which has no entry for ConditionMenu.tsx, and with D12 and the docs.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add ConditionMenu.tsx to the touch points with the decision behind it, and update the search-header.html fixture to match; the stale line at docs/user-guide/search.md:37 can be corrected along with it.

</details>

### claude-read:TP-5 — bucket B, LOW, open

Claim: Several test and registry files outside the touch-point list are edited: SearchPage.semanticContinuation.test.tsx (SPEC-CORE-035 I9/I11/I12 assertions rewritten), FolderBrowser.passages.test.tsx (FolderToolbar mock removed and I9 tests rewritten, beyond the mock rename listed), FolderBrowser.sceneUrl.test.tsx (an assertion inverted, beyond the mock rename listed), toolbarMenuHome.test.ts (new allow-list entry), componentFixtureParity.test.tsx, and e2e-components/{fixtures/app.tsx, projects.ts, spec-viewport.spec.ts}.
Impact: The rewritten SPEC-CORE-035 tests change what they check. The I12 text-filter test now asserts only that the field is absent, and the I9 count test reads `toolbar.latest.total` instead of rendered text. A regression in what earlier specs guarantee could therefore pass without the reviewers who own those specs seeing the change.
Evidence: SearchPage.semanticContinuation.test.tsx: the I9 test now checks `toolbar.latest.total`, and the I12 `it.each` no longer types into the filter field. FolderBrowser.sceneUrl.test.tsx: 'keeps the flag when the type filter changes' became 'leaves the URL ... alone when only the type changes' with `expect(routerReplace).not.toHaveBeenCalled()`. toolbarMenuHome.test.ts:77 adds SmartFolderSaveButton.tsx.
Repro: Compare each edited path in the diff with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List these tests and registries in the touch points, with a note of which earlier-spec assertions they restate.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: `frontend/src/components/MatchOverlay.tsx` is changed for the badge fallback style but is missing from the touch-point list, which names only `frontend/src/lib/matchBadges.ts` for I9.
Impact: None at runtime: the fallback now uses MATCH_BADGE_STYLE as I9 requires. Only the touch-point list is incomplete.
Evidence: MatchOverlay.tsx: `MATCH_BADGE_STYLES[type] ?? "bg-sand text-text-primary"` became `?? MATCH_BADGE_STYLE`. Spec item 9 mentions this fallback, but the touch-point list does not name the file.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Whether the extra submodule commits were already merged and reviewed on the addon's own main branch before this pointer bump.
- claude-read: Whether an addon-side spec document defines a separate SPEC-ADDON-081 for file-question history outside this repository.
- claude-read: No test or e2e run: the tests' behaviour was read, not executed.
- claude-read: Whether commit 2c17d0c9a itself (a docs review re-run) differs from the branch diff as presented.
- claude-verify: I did not compare the submodule range 07dbabce..76317005 with git; I only checked that the named files and symbols exist in the worktree.
- claude-verify: For TP-5, I did not confirm against origin/develop that each listed test file was modified (or added) on this branch.
- claude-verify: I ran no tests.

TOTAL: 5 findings
