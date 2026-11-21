# Reading's folder chips follow the folder position

SPEC-ID: SPEC-CORE-171

Approval: sha256:e414c8e37f7b8ba79743ee232dcb09f086f73f8ef2e35404a6be496891f024ba Yuichi Senga 2026-11-21

## Summary

SPEC-CORE-166 (`docs/specs/app-folder-position.md`, shipped in #667) replaced the Reading
Library's chip row: there is no All chip any more, a chip is a link to a child folder of the
position's `base`, and going back up is the breadcrumb's job. That spec did not declare the
earlier invariants it changes: in `docs/specs/reading-app.md`, I18 (the All chip and a chip
that narrows in place), I16b (a chip that resets to All on a fresh open) and I26 (an All
chip beside the retry); and SPEC-CORE-147 I12 (tag-counts carry "Reading's chip"). This spec
revises those invariants to the behaviour that shipped. It changes no code.

## Required items

### 1. Normal flow

As SPEC-CORE-166 §1.

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

Only `review.sh` reads `## Revises`: a later review of a topic whose spec declares
SPEC-CORE-062 or SPEC-CORE-147 gets these sentences in place of the earlier ones. It reads
ids of the form `I<N>` only, so the I16b line below is not picked up (see Checked, no
action).

In `frontend/src/__tests__/appFolderPosition.test.tsx` the Reading cases of these tests
also cite SPEC-CORE-171: D5 (no All chip; a link per child of `base` with its count, in the
endpoint's order), I4 (a chip pushes one entry), I8 from a deeper base (a chip is a child of
`base`), I1 under a folder-limited target (never widening), I6 (chips counted without tag,
state or name), keeps the first page's base (a later page fails: the loaded chips stay with
a retry), I11 (the first page fails: a retry and no All), I5 (choosing another target
removes the position) and I5 I9 (reload keeps it; no `folder` is the top). This PR moves
the SPEC-CORE-171 row to `implemented`.

### 8. Error behavior

none.

### 9. User-visible behavior

none beyond SPEC-CORE-166.

### 10. Non-functional

none.

## Touch points

- `docs/specs/reading-chips-follow-position.md`, `docs/specs/INDEX.md` (the row moves to
  `implemented` in this PR)
- `frontend/src/__tests__/appFolderPosition.test.tsx` (test names only, plus one assertion
  that a failed first chip page draws no All chip)

## Invariants

none of its own: the spec changes no code, and the revised sentences under `## Revises`
are what reviewers apply. Restating them here would give two copies that can drift.

## Revises

SPEC-CORE-062 I18. The Library's chips are the child folders of the folder position's `base`, counted under the target and the position alone, in the shelves endpoint's order; there is no All chip, and choosing a chip moves the position to that child of `base`, never widening the target past a `folder` it carries.
SPEC-CORE-062 I26. When a chip page fails, the chips already loaded stay and a retry is shown; with none loaded the row is the retry alone, with no All chip.
SPEC-CORE-063 I16b. The folder position is held only in the URL: opening the Library without `folder` shows the top of the target, a reload keeps the position, and choosing another target in the target menu removes it. The Library sort is stored per Target. The tag, state and name filters are never stored; they last while the page is open and reset on a full page load, a drive change and a Target choice.
SPEC-CORE-147 I12. Every tag-counts request the menu sends carries every condition in force: the Target's conditions (member ids through POST), the folder position narrowed into the Target, the state, the chosen tags and the name; after a toggle the menu stays open and requests again.

## Checked, no action

- Editing `docs/specs/reading-app.md`: an approved spec is not edited; the revisions live
  here.
- `review.sh` does not pick up the I16b line: its `later_revisions` accepts only
  `I<N>.` ids, so I16b revisions are dropped silently. The three earlier approved I16b
  revisions (app-view-per-target, app-library-filters, app-library-name-filter) have the
  same gap. `scripts/process/` is kit-owned and is not changed here; the fix belongs in the
  kit.
- The chip order: the frontend draws the shelves endpoint's order unchanged, which the D5
  test checks; the order itself is the endpoint's (`backend/app/routers/shelves.py`,
  `_order_shelves`) and is not part of this revision.
- New tests: apart from the one assertion above, the shipped tests already verify the
  revised sentences (listed in §7); they gain the citation.
- Video: SPEC-CORE-165 adds the same rows to Video, whose earlier specs had no folder chip
  and keep their Folder grouping, so no Video invariant needs revising.
