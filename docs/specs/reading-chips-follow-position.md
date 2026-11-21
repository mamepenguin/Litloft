# Reading's folder chips follow the folder position

SPEC-ID: SPEC-CORE-171

Approval:

## Summary

SPEC-CORE-166 (`docs/specs/app-folder-position.md`, shipped in #667) replaced the Reading
Library's chip row: there is no All chip any more, a chip is a link one level below the
folder position, and going back up is the breadcrumb's job. That spec did not declare the
earlier invariants it changes in `docs/specs/reading-app.md` (SPEC-CORE-062): I18 still
describes the All chip and a chip that narrows in place, I16b a chip that resets to All on
a fresh open, and I26 an All chip beside the retry. This spec revises those three
invariants to the behaviour that shipped. It changes no code.

## Required items

### 1. Normal flow

As SPEC-CORE-166 §1: the chips are the child folders of the position's `base`, asked for
under the target and the position alone; choosing one pushes the URL with that folder.

### 2. Failure cases

none: no behaviour changes; SPEC-CORE-166 §2 holds.

### 3. States

none: SPEC-CORE-166 §3 holds.

### 4. Data read and written

none.

### 5. External services

none.

### 6. Authorization

none: unchanged.

### 7. Effect on existing features

The ledger and `review.sh` read SPEC-CORE-062 I16b, I18 and I26 as revised by this spec.
In `frontend/src/__tests__/appFolderPosition.test.tsx`, the Reading cases of these tests
also cite SPEC-CORE-171: D5 (no All chip, chip links and counts), I4 (a chip pushes one
entry), I8 from a deeper base (a chip is one level below `base`), I1 under a
folder-limited target (never widening), I6 (chips counted without tag, state or name), I11
(a failed chip request: Retry and no All), I5 (another target clears the position) and I5
I9 (reload keeps it). This PR moves the SPEC-CORE-171 row to `implemented`.

### 8. Error behavior

none.

### 9. User-visible behavior

none beyond SPEC-CORE-166.

### 10. Non-functional

none.

## Touch points

- `docs/specs/reading-chips-follow-position.md`, `docs/specs/INDEX.md`
- `frontend/src/__tests__/appFolderPosition.test.tsx` (test names only)
- The SPEC-CORE-171 row moves to `implemented` in this PR.

## Invariants

I1. The Reading Library has no All chip; its chips are the child folders of the folder
position's `base`, counted under the target and the position alone, most files first then
name; choosing one moves the position to that child of `base`, never widening the target
past a `folder` it carries.
I2. The position is held only in the URL: a reload keeps it, another target clears it, and
a failed chip request shows a retry with no All chip.

## Revises

SPEC-CORE-062 I16b. The Library sort is never stored, and the folder position is held only in the URL: a reload keeps it and a target change clears it.
SPEC-CORE-062 I18. The Library's chips are the child folders of the folder position's `base`, counted under the target and the position alone, most files first then name; there is no All chip, and choosing a chip moves the position to that child of `base`, never widening the target past a `folder` it carries.
SPEC-CORE-062 I26. When a chip page fails, the chips already loaded stay and a retry is shown; with none loaded the row is the retry alone, with no All chip.

## Checked, no action

- Editing `docs/specs/reading-app.md`: an approved spec is not edited; the revision lives
  here.
- New tests: the shipped acceptance tests already verify every clause of I1, I2 and the
  three revised invariants (listed in §7); they gain the citation.
- Video: SPEC-CORE-165 adds the same rows to Video, whose earlier specs had no folder chip
  and keep their Folder grouping, so no Video invariant needs revising.
