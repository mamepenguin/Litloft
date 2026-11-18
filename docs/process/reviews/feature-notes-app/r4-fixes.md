# R4 review: fix commits on feature/notes-app

Reviewed (fixed SHAs, read with `git show`):
- knowledge: d407848 c07700c 7d8bbb6 2b13589
- core: 174505f4a (= ab876696d on the notes-app worktree)

Threat model: personal tool, owner only. A = silently wrong in normal use. B = misuse/odd input.
Ran: `npx vitest run src/addons/knowledge/__tests__/Editor.saveHandle.acceptance.test.tsx src/addons/knowledge/__tests__/notesLibrary.test.tsx` (98 passed).

## Findings (A)

None.

## Test gap (no behaviour defect)

- T1. `KnowledgeEditSection.tsx:104` (`frameless={frameless}`) is guarded by no test. `notesLibrary.test.tsx`
  mocks `KnowledgeEditSection` and checks the prop it receives; `Editor.saveHandle.acceptance.test.tsx`
  mounts `Editor` directly. Dropping the forward would bring both rules back in the pane with every test green.
  Not mutated (read only). Frequency 0 (needs a code change), impact 2 (display). Below threshold; listed only.

## Design differences (no scores)

- D1. Desktop, tabs to the Library (2b13589, `NotesLibrary.tsx:205` `pt-3` -> `pt-2.5`): the change is
  uniform across layouts, but R-5's rerun measured 23px at 1440/1280 (rail switch, `three`) and 20px at
  1100/1024 (rail menu). Moving both by 2px gives about 21px at 1440/1280 and about 18px at 1100/1024;
  the artboard says 20px. So the 1100/1024 layout, which matched, now sits 2px short, and 1440/1280 is
  still 1px over. The 3px the `three` layout carries beyond the classes comes from inside the rail
  (header py-2 8 + pt-3 12 = 20 by classes), not from the shared padding. Small; for the human to accept or
  target the `three` branch only.
- D2. Phone spacing now matches the artboard by classes: tabs to New note = grid `gap-y-1` 4 + `max-sm:mt-2`
  8 = 12px (row-start-4, no empty implicit track; the new 390 e2e asserts 12 +-1); New note to the rail row =
  header `py-2` 8 + panel `pt-0` + Library `max-sm:pt-2` 8 = 16px. Not re-measured in a browser here.

## Bucket B

None new.

## Checked, no finding

- File page keeps both rules: `bordered` no longer reads `useMarkdownChrome()`; it is `!frameless`
  (`Editor.tsx:1453`), and `VersionHistoryPanel` gets `frameless` (`Editor.tsx:1562`). The only
  `frameless` passer is `NotePaneContainer.tsx:254`; core's `knowledge-edit` slot (`slots.ts:5`, mounted by
  core ShellLayout/MarkdownDocumentLayout) passes no such prop, so the file page gets `undefined` -> both rules.
  `grep '<Editor'` finds one caller (`KnowledgeEditSection.tsx:96`); `grep KnowledgeEditSection` finds the
  slot and the pane only. `EditorToolbar` `bordered` defaults to true (`EditorToolbar.tsx:246`).
- The file-page test now mounts `Editor` under `MarkdownChromeProvider` (the provider the file page uses) and
  asserts `border-b` and `border-t`; since the decision no longer depends on the provider, the provider's exact
  value cannot change the outcome. The pane half asserts both rules gone; `notesLibrary.test.tsx:562` asserts
  the pane passes `frameless: true`.
- VersionHistoryPanel: collapsed, frameless swaps `border-t border-bg-border` for `mt-4`; non-frameless string
  unchanged apart from class order. Expanded state unchanged (inner `border-t` between toggle and body kept in
  both modes, which is inside the panel, not the pane's frame). `mt-4` sits in the editor's flex column; under
  `fillHeight` the editor grid only grows (`Editor.tsx:1474`), so nothing is clipped.
- PageHeader (174505f4a): without `primaryAction` (`withPrimary` false) nothing changes. With primary and no
  actions: row 4 below `sm`, `sm:row-start-1 sm:col-start-5` from `sm` (unchanged on desktop; `max-sm:mt-2`
  inert there). With actions + primary: still row 5 below `sm`, now 4 + 8 = 12px under the actions instead of
  4px; the existing 390 test (`action.top >= sort.bottom - 1`) still holds. No production caller passes both:
  `grep primaryAction` finds only `NotesPage.tsx:122` (no `actions`) via `AppHeader`; the other hits are
  `EmptyState`'s unrelated prop. Fixture added to `ARRANGEMENTS` and the parity list together.

TOTAL: 1 findings
