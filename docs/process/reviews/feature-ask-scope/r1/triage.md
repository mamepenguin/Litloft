# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1 is bucket A or BLOCKER

## Needs a human

### unspecified_behavior

Note: Search page trigger label text changes (F1).; ConditionMenu's hasPlus branch (label starting with ＋ or +) is a new rendering rule that SearchQueryHeader never used before.
- claude-read: Search page trigger label text changes (F1).
- claude-read: ConditionMenu's hasPlus branch (label starting with ＋ or +) is a new rendering rule that SearchQueryHeader never used before.
- claude-verify: The search page's visible trigger word changes from 条件 to 条件を追加 (F1).
- claude-verify: Four core tests outside the touch points are edited (F2).
- claude-verify: AskRequest rejects unknown keys for every /ask caller (F4), which the spec's I3 already covers.

### unspecified_behavior

Note: The search page's visible trigger word changes from 条件 to 条件を追加 (F1).; Four core tests outside the touch points are edited (F2).; AskRequest rejects unknown keys for every /ask caller (F4), which the spec's I3 already covers.
- claude-read: Search page trigger label text changes (F1).
- claude-read: ConditionMenu's hasPlus branch (label starting with ＋ or +) is a new rendering rule that SearchQueryHeader never used before.
- claude-verify: The search page's visible trigger word changes from 条件 to 条件を追加 (F1).
- claude-verify: Four core tests outside the touch points are edited (F2).
- claude-verify: AskRequest rejects unknown keys for every /ask caller (F4), which the spec's I3 already covers.

## Findings

A: 1
B: 3
C: 0

### claude-read:F1 — bucket A, MEDIUM, open

Claim: The extracted ConditionMenu draws the trigger text from the aria label (t("addFilter")), so the search page's visible trigger word changes from addFilterWord to addFilter, a place the touch points do not name.
Impact: On the search results page at sm and wider, the trigger reads 「＋ 条件を追加」 (en: "+ Add filter") instead of 「＋ 条件」 ("+ Filter"). The chip row is wider and the core message key addFilterWord is now unused, which is why the vocabulary test count fell from 82 to 81. The user sees a changed header on a page the spec says is unchanged.
Evidence: ConditionMenu.tsx trigger: when label does not start with ＋ or +, it renders `<span className="hidden sm:inline">{label}</span>`. SearchQueryHeader passes `label={t("addFilter")}`, and the old code rendered `t("addFilterWord")` there. messages ja.json:374-375 gives addFilter=条件を追加 and addFilterWord=条件. core-search-vocabulary.test.ts changed used.length 82 to 81 to absorb it.
Repro: Compare the old SearchQueryHeader trigger markup with the new one at 1280 px. The new one shows the longer label. Reverting the test count to 82 would fail the vocabulary test, which shows the key left the used set.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Give ConditionMenu a separate visible-word prop, or pass addFilterWord for the visible span while keeping addFilter as the aria-label.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The diff edits four existing core tests that are not in the touch-point list, only to follow the SearchQueryHeader to ConditionMenu path rename.
Impact: The guards for anchored dropdowns, popup dismissal, the toolbar menu home and the search vocabulary were repointed or recounted without being declared. A reviewer reading only the touch points would not look at them. The vocabulary count and caller table (24 to 2+21, 82 to 81) loosen or move a guard, which also hides F1.
Evidence: frontend/src/__tests__/anchoredDropdowns.test.ts, frontend/src/__tests__/popup-dismissal.test.ts, frontend/src/__tests__/core-search-vocabulary.test.ts and frontend/src/components/__tests__/toolbarMenuHome.test.ts are all in the diff.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket B, LOW, open

Claim: Two addon-side effects reach beyond the listed files. AskRequest now forbids unknown keys for every /ask caller, and schemas.py now imports app.file_matching, which was not there before.
Impact: The extra=forbid on the request is declared in the spec (Checked, no action) but is a global change. The new import couples the schemas module to file_matching and adds a circular-import risk. The refactor of SearchFilter into apply_filter_normalisation also changes the validator path for the search filter used by Find and /search.
Evidence: schemas.py adds `from app.file_matching import apply_filter_normalisation` and `model_config = ConfigDict(extra="forbid")` on AskRequest. file_matching.py moves the SearchFilter validator body into a shared function. The listed touch points name file_matching only as the shared validator.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, INFO, open

Claim: The diff reaches frontend/src/e2e-layout/spec-viewport.spec.ts (the fixture list and FIXTURE_COUNT) and adds a core test, CollectionDetail.collectionActions.test.tsx. The touch points name neither; they name only the new fixtures.
Impact: Minor. The shared viewport spec now covers two more fixtures, and a new core test pins the slot props.
Evidence: spec-viewport.spec.ts FIXTURES gains ask-scope-chips.html and collection-actions.html, and FIXTURE_COUNT goes from 17 to 19. The new test is under frontend/src/components/__tests__/.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: The truncated remainder of the diff (Page.tsx, api.ts, find.tsx, askNoteFormat.ts, slots.ts, manifest.json, messages, addon tests).
- claude-read: Whether other callers of AskRequest or SearchFilter exist outside the listed files.
- claude-read: Whether schemas.py and file_matching.py form an import cycle at runtime.
- claude-read: Actual rendering at the browser widths.
- claude-verify: I could not run git diff or any tests, so I did not confirm the old SearchQueryHeader code or the exact test edits.
- claude-verify: I did not check invariants I1, I2, I4 to I9 or I11 beyond what the findings touch.
- claude-verify: I did not read the e2e fixtures or the layout results.

TOTAL: 4 findings
