# Reading's folder chips follow the folder position

SPEC-ID: SPEC-CORE-171

Approval:

## Summary

SPEC-CORE-166 (`docs/specs/app-folder-position.md`, shipped in #667) replaced the Reading
Library's chip row: there is no All chip any more, a chip is a link one level below the
folder position, and going back up is the breadcrumb's job. That spec did not declare the
earlier invariant it changes, SPEC-CORE-062 I18 (`docs/specs/reading-app.md`), which still
describes the All chip and a chip that narrows in place. This spec revises that invariant
to the behaviour that shipped. It changes no code.

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

The ledger and `review.sh` read SPEC-CORE-062 I18 as revised by this spec. The Reading
chip tests in `frontend/src/__tests__/appFolderPosition.test.tsx` cite SPEC-CORE-171.

### 8. Error behavior

none.

### 9. User-visible behavior

none beyond SPEC-CORE-166.

### 10. Non-functional

none.

## Touch points

- `docs/specs/reading-chips-follow-position.md`, `docs/specs/INDEX.md`
- `frontend/src/__tests__/appFolderPosition.test.tsx` (test names only)

## Invariants

I1. The Reading Library has no All chip; its chips are the child folders of the folder
position's `base`, counted under the target and the position alone, most files first then
name, and choosing one moves the position one level down without widening the target.

## Revises

SPEC-CORE-062 I18. The Library's chips are the child folders of the folder position's `base`, counted under the target and the position alone, most files first then name; there is no All chip, and choosing a chip moves the position one level down, never widening the target past a `folder` it carries.

## Checked, no action

- Editing `docs/specs/reading-app.md`: an approved spec is not edited; the revision lives
  here.
- New tests: the shipped acceptance tests already verify this; they gain the citation.
