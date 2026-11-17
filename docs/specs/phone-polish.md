# Phone polish: folder cards show a count, Add menu labels name the action

SPEC-ID: SPEC-CORE-122
SPEC-ID: SPEC-CORE-123

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

Two phone-width corrections found by a UI review on 2026-11-17 and chosen by the owner on
the design canvas https://claude.ai/artifact/XKXLin7PcqbjnvS1UfYhEw (row 2; its artboard
sources are copied to `docs/process/reviews/feature-phone-polish/design/` for reading,
together with `canvas.json`; they render only on the canvas).

- **SPEC-CORE-122.** Below 640px, a folder card's second line is the item count only
  (「13件」). Today it is the count followed by up to two kinds with their counts
  (「13件 · テキスト 7 · 画像 4」, `MAX_BREAKDOWN_KINDS = 2`), which a two-column card cuts
  after a few characters. A folder holding a single kind keeps that kind's name
  (「9件 · 動画」), as today. At 640px and wider the card is unchanged.
- **SPEC-CORE-123.** The `+ Add` menu's items name the action: 「ファイルをアップロード」 /
  "Upload files", 「フォルダをアップロード」 / "Upload folder", 「新規フォルダ」 / "New folder",
  so the second is no longer read as the same thing as the third.

For the owner; the app is a personal tool with no other users. (A third item from the same
review, raising the phone file sheet on open, was parked by the owner on 2026-11-17 and is
not part of this spec.)

## Required items

### 1. Normal flow

- 122: The viewer opens a folder view whose grid shows folder cards, on a viewport narrower
  than 640px. Each card shows the folder name and, under it, the item count; a folder with a
  single kind shows the count and that kind. The same rule applies to the card's line while
  the folder's name is being edited. At 640px and wider the card is unchanged.
- 123: The viewer presses `+ Add`. The menu lists 「ファイルをアップロード」, 「フォルダを
  アップロード」, 「新規フォルダ」 (ja) or "Upload files", "Upload folder", "New folder" (en),
  then any addon rows as today. Each item does what it does today.

### 2. Failure cases

- 122: A folder with no `kind_counts` → the count alone, as today.
- 123: none — labels only.

### 3. States

None — presentation only.

### 4. Data read and written

None.

### 5. External services

None.

### 6. Authorization

None — no request is added or changed.

### 7. Effect on existing features

- 122: `FolderCard`, wherever it is drawn (the folder grid and `RightPaneFolder`).
  `FolderListRow` shows the count alone at every width already and is not changed.
- 123: `upload.files`, `upload.folder` and `folder.newFolder` are read only by `AddButton`.
  `folder.newFolderTitle` and `folder.newFolderHere` are not changed.

### 8. Error behavior

None added.

### 9. User-visible behavior

Listed under 1. Nothing changes at 640px and wider for 122. 123 changes the menu text in
both locales at every width. The user guide's two affected sentences are updated (touch
points).

### 10. Non-functional

No new request, no new storage, no new dependency.

## Design decisions to check

Against the canvas artboard `FoldersCount.dc.html`. The folder names, counts and the
heading drawn there are sample content.

- D1 (122): two-column folder cards below 640px have a second line of the count alone, or the
  count and one kind name for a single-kind folder; the name line and the card's size are
  as today.
- 123 has no artboard; it is text only and is checked by its invariant, not by the design
  check.

## Touch points

- `frontend/src/components/FolderCard.tsx` — the second line below 640px (Tailwind `sm`,
  `display: none` on the breakdown), in both the link and the editing branch.
- `frontend/src/components/__tests__/FolderCard.test.tsx` — its whole-line assertions keep the
  exact text that is drawn at 640px and wider (I2).
- A new e2e-components arrangement in `frontend/e2e-components/fixtures/app.tsx` drawing real
  `FolderCard`s (a two-kind, a one-kind and an empty folder, plus one in rename), a new spec
  measuring them at 639 and 640px, and their registrations in
  `frontend/src/components/__tests__/componentFixtureParity.test.tsx` and
  `frontend/e2e-components/spec-viewport.spec.ts`.
- `frontend/src/messages-core/en.json`, `ja.json` — `upload.files`, `upload.folder`,
  `folder.newFolder` (en only).
- Tests whose expected labels change with 123 (updated to the new text, not loosened):
  `frontend/src/components/__tests__/AddButton.test.tsx`, `AddButton.bundledRows.test.tsx`,
  `frontend/src/components/folder/__tests__/FolderToolbar.test.tsx`,
  `FolderToolbar.bundledRows.test.tsx`, `frontend/src/__tests__/DriveHome.test.tsx`,
  `frontend/e2e-components/add-menu.cases.ts`.
- `DESIGN.md` — one line for the folder card: count only below 640px.
- `docs/user-guide/upload-and-fileops.md` (menu names), `docs/user-guide/file-browsing.md`
  (the card shows the kinds from 640px wide).
- `.claude/rules/frontend-conventions.md` — passed through, not edited.
- No protected path is edited.

## Invariants

I1. Below 640px, a folder card whose folder holds two or more kinds shows the item count and
no kind name; one holding a single kind shows the count and that kind's name; one with no
`kind_counts` shows the count alone; the same holds for the card's line while its name is
being edited.
I2. At 640px and wider, a folder card's second line is the same text as before this change,
in the link and in the editing branch.
I3. In both locales, the `+ Add` menu reads 「ファイルをアップロード」, 「フォルダをアップロード」,
「新規フォルダ」 (ja) and "Upload files", "Upload folder", "New folder" (en), in that order,
followed by any addon rows as today.
I4. Pressing the first item opens the file picker and the second opens the folder picker, as
before this change.

## Checked, no action

- **Folder cards between 640px and the widths where the breakdown fits.** Not changed: the
  report and the canvas cover phones.
- **The breakdown for assistive technology below 640px.** It is not drawn at that width
  (`display: none`), not hidden visually; the count still reads.
- **Where layout is measured.** I1 and I2's width rule is measured in a real browser
  (e2e-components) at 639 and 640px; jsdom has no layout, so the vitest cases check the text
  of each element, not which one is drawn.
- **`FolderListRow`.** It already shows the count alone at every width, including for a
  single-kind folder; it is left as it is.
- **Raising the phone file sheet on open.** Parked by the owner after three spec-design
  review rounds kept finding conflicts between an automatic raise and find, focus, load
  order and approved e2e specs.
