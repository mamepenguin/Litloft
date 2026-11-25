# Triage: r1

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

## Read coverage

Product files:
- frontend/src/components/DuplicatesSection.tsx — full: Read the whole file (1-351).
- frontend/src/messages-core/en.json — partial: Read lines 1015-1039, which hold the changed hunk and the surrounding admin keys; also Grep for deleteSelected/deleteOthers across the repo.
- frontend/src/messages-core/ja.json — partial: Changed line 1028 seen via Grep (deleteOthers: 他の{count}件を削除); the surrounding hunk lines match the diff context. Did not open the rest of the file.

Test files:
- frontend/src/__tests__/DuplicatesSection.test.tsx — full: Read the whole file (1-273).

## Needs a human

### unspecified_behavior

Note: The first file in the server's group order is pre-selected as the keeper, so clicking the delete button without changing the radio trashes every other copy.; The dialog title and the confirm button both repeat 'Delete N others' / '他のN件を削除' and do not name the kept file or the files to be trashed.
- claude-read: The first file in the server's group order is pre-selected as the keeper, so clicking the delete button without changing the radio trashes every other copy.
  - F3 × I3 = 9, claude-read: A user who expands a group and confirms right away keeps whichever path the API lists first, which may not be the location they wanted; the files go to trash and can be restored.
  - F5 × I3 = 15, claude-verify: Each time the user opens a group and deletes without changing the radio, the first file in the server's order is kept and the others go to the trash. The kept file is marked on screen and the deleted files can be restored from the trash.
- claude-read: The dialog title and the confirm button both repeat 'Delete N others' / '他のN件を削除' and do not name the kept file or the files to be trashed.
  - F3 × I1 = 3, claude-read: Each confirmation shows the count but not the names, so the user relies on the row highlight behind the dialog to know what is kept.
  - F5 × I3 = 15, claude-verify: Every delete confirmation shows only 'Delete N others' and 'Move N files to trash?', with no filenames, so the user has to rely on the list behind the dialog to know which file is kept. The deletion goes to the trash and can be undone.

## Unspecified behavior, recorded

- claude-read: Arrow keys on a focused radio move the keeper within that group (native radio behaviour), which changes which files the delete button will trash.
  - F1 × I2 = 2, claude-read: Keyboard navigation inside an expanded group silently changes the marked keeper; the Keep badge and highlighted row move with it, so the change is visible.
  - F1 × I2 = 2, claude-verify: A user who focuses a radio and presses an arrow key changes the keeper. This is visible at once through the highlighted 'Keep' badge, and the move stays inside the group because each group has its own name.
- claude-verify: The header of a collapsed group always shows group.files[0].filename (DuplicatesSection.tsx:184), even after the user picked another file as the keeper, so the header can name a file that will be deleted.
  - F3 × I2 = 6, claude-verify: After the user changes the keeper and collapses the group, the header still shows the first file's name, though the size next to it does reflect the new choice.
  - single-scored

## Findings

A: 0
B: 3
C: 0

### claude-read:CR-1 — bucket B, LOW, open

Claim: No test asserts the delete button's text or its count, so the new 'Delete N others' / '他のN件を削除' label (the user-facing point of this change) can regress without any test failing.
Impact: A later edit that shows the wrong count (e.g. group.files.length instead of filesToDelete.length) or drops the label back to wording that reads as 'delete the marked file' would pass CI, and the user could misread which files get trashed.
Evidence: frontend/src/__tests__/DuplicatesSection.test.tsx:219,223,255,258,264 match the button only by /Delete/; the old assertions on the exact label 'Delete Selected' were loosened and no replacement asserts 'Delete 2 others' or 'Delete 1 other'. Component label at frontend/src/components/DuplicatesSection.tsx:226,232,234.
Repro: Mutation: change DuplicatesSection.tsx:226 to t("deleteOthers", { count: group.files.length }), or change en.json deleteOthers to 'Delete', in your head. Every test still passes, because each query is /Delete/ and batchDelete still receives the same ids. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In 'keeps the marked file and deletes the others', assert getByRole('button', { name: 'Delete 2 others' }); in the 2-file test, assert 'Delete 1 other' to cover the plural 'one' branch.

</details>

### claude-read:CR-2 — bucket B, INFO, open

Claim: The radio group name attribute `keep-${groupHash}` is not covered by any test, so removing it or making it constant across groups would pass.
Impact: Without a per-group name, keyboard arrow navigation and native exclusivity would span every expanded group, so marking a file in one group could uncheck the native radio in another. React's controlled `checked` still drives the deletion set, so the trashed files stay correct; only the visual and keyboard behaviour would be wrong.
Evidence: frontend/src/components/DuplicatesSection.tsx:103 sets name per group; the tests (DuplicatesSection.test.tsx:147-229) render only one group.
Repro: Mutation: replace name={`keep-${groupHash}`} with name="keep". No test fails, because no test renders two expanded groups. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a two-group test that expands both, marks a file in one, and checks that the other group's checked radio is unchanged.

</details>

### claude-read:CR-3 — bucket B, INFO, open

Claim: The English confirm message reads 'Move 1 files to trash?' for the most common case, a two-file group, because confirmDelete has no plural form; the dialog now sits next to the pluralised 'Delete 1 other'.
Impact: A cosmetic grammar error in the delete confirmation for every two-file duplicate group in the en locale.
Evidence: frontend/src/messages-core/en.json:1029 "Move {count} files to trash?"; it is used at DuplicatesSection.tsx:233. The change edited the neighbouring key at :1028 but left this one.
Repro: Expand a 2-file group in the en locale, click 'Delete 1 other': the dialog shows 'Move 1 files to trash?'. Also recorded in docs/process/reviews/fix-duplicates-keep-radio/decisions.md:14.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Use "{count, plural, one {Move # file to trash?} other {Move # files to trash?}}".

</details>

## Not verified

- claude-read: Did not run the test suite or the app; mutation results are reasoned, not executed.
- claude-read: Did not read ConfirmDialog to confirm that the last /Delete/ match is the confirm button and not the dialog title.
- claude-read: Did not check that next-intl's ICU formatter renders '#' in the en plural, beyond the manual evidence in decisions.md.
- claude-read: Did not check the backend batchDelete partial-failure handling (errors array ignored, pre-existing).
- claude-verify: I did not run the tests or mutate the code; I only read it.
- claude-verify: I did not see the git diff, so I could not confirm which i18n keys this commit changed (for example whether confirmDelete was edited).
- claude-verify: I did not read ConfirmDialog to see how it renders title, message and confirmLabel.
- claude-verify: I did not check whether the backend's batchDelete really moves files to the trash.

TOTAL: 3 findings
