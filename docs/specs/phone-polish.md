# Folder cards show only a count, Add menu labels name the action

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

Two corrections from a UI review on 2026-11-17, decided by the owner.

- **SPEC-CORE-122.** A folder card's second line is the item count only (「13件」 /
  "13 items"), at every width. Today it is the count followed by up to two kinds with their
  counts (「13件 · テキスト 7 · 画像 4」, `MAX_BREAKDOWN_KINDS = 2`), or the count and the kind
  for a single-kind folder (「9件 · 動画」); a two-column phone card cuts that after a few
  characters. The owner judged the breakdown unnecessary, so it goes at every width rather
  than below a breakpoint. The design canvas
  https://claude.ai/artifact/XKXLin7PcqbjnvS1UfYhEw (row 2, sources and `canvas.json` in
  `docs/process/reviews/feature-phone-polish/design/`) showed the count-only card; its
  single-kind 「9件 · 動画」 is superseded by this decision.
- **SPEC-CORE-123.** The `+ Add` menu's items name the action: 「ファイルをアップロード」 /
  "Upload files", 「フォルダをアップロード」 / "Upload folder", 「新規フォルダ」 / "New folder",
  so the second is no longer read as the same thing as the third. Measured in Chromium, the
  ja labels wrap mid-word in today's 180px menu (「ファイルをアップロ／ード」); these rows do not
  wrap, and the menu grows to about 201px, which stays inside the window.

For the owner; the app is a personal tool with no other users. (A third item from the same
review, raising the phone file sheet on open, was parked by the owner and is not part of this
spec.)

## Required items

### 1. Normal flow

- 122: The viewer opens a folder view whose grid shows folder cards. Each card shows the
  folder name and, under it, `folder.items` for the folder's `file_count` (「13件」, "13
  items", 「0件」), and nothing else on that line. The same line is shown while the folder's
  name is being edited.
- 123: The viewer presses `+ Add`. On a folder view the menu lists 「ファイルをアップロード」,
  「フォルダをアップロード」, 「新規フォルダ」 (ja) or "Upload files", "Upload folder", "New
  folder" (en), then any addon rows as today. On Home, which passes no `onCreateFolder`, it
  lists the first two only, as today. The first opens the file picker, the second the folder
  picker, the third calls `onCreateFolder` once and closes the menu, as today.

### 2. Failure cases

- 122: none — `file_count` is always present; `kind_counts` is no longer read by the card.
- 123: none — labels and one layout rule.

### 3. States

None — presentation only.

### 4. Data read and written

None written. The card stops reading `kind_counts`; the API keeps returning it.

### 5. External services

None.

### 6. Authorization

None — no request is added or changed.

### 7. Effect on existing features

- 122: `FolderCard` is the only reader of `folderKindBreakdown`, so that helper and its test
  are removed. `FolderListRow` already shows the count alone and is unchanged. The card's
  height and name line are unchanged (the line keeps one row).
- 123: `upload.files`, `upload.folder` and `folder.newFolder` are read only by `AddButton`.
  `folder.newFolderTitle` and `folder.newFolderHere` are not changed. `ActionMenuItem` is
  shared by nine other menus, so the no-wrap rule is applied to the Add menu's three core rows
  only; other menus and the Add menu's addon rows wrap as today.

### 8. Error behavior

None added.

### 9. User-visible behavior

Listed under 1, at every width and in both locales. The user guide's two affected sentences
are updated (touch points).

### 10. Non-functional

No new request, no new storage, no new dependency. Widths below 320px are out of scope.

## Design decisions to check

- D1 (122): against `FoldersCount.dc.html`, a folder card's second line is the count alone and
  spans the card under the icon-and-name row; the name line, the card's size and the grid's
  columns are as today (this change does not touch the grid). The single-kind 「9件 · 動画」
  drawn there is superseded (count alone).
- The design check covers `FoldersCount.dc.html` only. `Main.dc.html` and `FoldersNow.dc.html`
  draw today's screens, `FoldersTwoLine.dc.html` is the rejected option, and
  `VideoHalf.dc.html` is the parked sheet item; none is a target.
- 123 has no artboard; it is checked by its invariants, not by the design check.

## Touch points

- `frontend/src/components/FolderCard.tsx` — the second line, in the link and the editing
  branch.
- `frontend/src/lib/folderKindBreakdown.ts`, `frontend/src/lib/__tests__/folderKindBreakdown.test.ts`
  — removed (no other reader).
- `frontend/src/components/__tests__/FolderCard.test.tsx`, case by case:
  "says what the count is made of" and "names a single kind without repeating its count" are
  rewritten to assert the count alone for a several-kind and a single-kind folder (I1);
  "names the two largest kinds and stops" is removed, because the two-kind cap no longer
  exists; "gives the breakdown the card's full width, not the strip beside the glyph" is kept,
  renamed to the count line, and still asserts the line spans the card under the glyph row.
- `frontend/src/components/AddButton.tsx` — no-wrap on the three core rows (through a prop or
  class on `ActionMenuItem`, without changing its default).
- `frontend/src/components/ActionMenuItem.tsx` — only if it needs to accept that prop or class.
- `frontend/src/messages-core/en.json`, `ja.json` — `upload.files`, `upload.folder`,
  `folder.newFolder` (en only).
- Tests whose expected labels change with 123 (updated to the new text, not loosened):
  `frontend/src/components/__tests__/AddButton.test.tsx`, `AddButton.bundledRows.test.tsx`,
  `frontend/src/components/folder/__tests__/FolderToolbar.test.tsx`,
  `FolderToolbar.bundledRows.test.tsx`, `frontend/src/__tests__/DriveHome.test.tsx`,
  `frontend/e2e-components/add-menu.cases.ts` (with an exact-name match, since Playwright's
  default name match is a case-insensitive substring and would pass on the old label).
- `frontend/e2e-components/fixtures/app.tsx` — the `AddMenu` arrangement gains a ja variant
  and a right-edge variant (trigger at the window's right edge, `align="right"`, as on
  DriveHome's header; the existing one is the left-edge trigger, as in FolderToolbar), both
  registered in `frontend/src/components/__tests__/componentFixtureParity.test.tsx`.
- `frontend/e2e-components/add-menu.spec.ts` (phone project, Pixel 5, 393px) — a case for I4 at
  393px and 320px, for en and ja, with the trigger at the left edge and at the right edge.
  The spec file already exists and is registered.
- `DESIGN.md` — one line for the folder card: count only.
- `docs/user-guide/upload-and-fileops.md` (menu names), `docs/user-guide/file-browsing.md`
  (the card shows the count).
- `.claude/rules/frontend-conventions.md` — passed through, not edited.
- No protected path is edited.

## Invariants

I1. A folder card's second line is exactly the localized item count for the folder's
`file_count`, with no kind name and no separator, in the link and in the editing branch.
I2. In both locales the `+ Add` menu's core rows read 「ファイルをアップロード」,
「フォルダをアップロード」, 「新規フォルダ」 (ja) and "Upload files", "Upload folder", "New folder"
(en), in that order, the third only where `onCreateFolder` is given, followed by any addon
rows as today.
I3. The first core row opens the file picker, the second the folder picker, and the third
calls `onCreateFolder` once and closes the menu.
I4. At a window width of 320px and wider, in both locales, with the trigger at the window's
left edge and at its right edge, each core row of the `+ Add` menu is one line high, shows its
whole label (no ellipsis; the label's box lies inside the row and the menu), and the whole menu
lies inside the window.
I5. An `ActionMenuItem` rendered without the new no-wrap option, in any other menu and in the
Add menu's addon rows, wraps a long label as before this change.

## Revises

SPEC-CORE-059 I5. A request of any other kind, and the folder roll-up's `kind_counts` for
every file, return what they returned before `epub` was added. (reading-app I5 named "the
folder card's kind label", which this change removes from the card; the classification it
protected is unchanged.)

## Checked, no action

- **Showing the breakdown where it fits.** Dropped: the owner judged the breakdown
  unnecessary, so no width rule (viewport or container) is needed.
- **The API's `kind_counts`.** Kept: removing a response field is outside this change and
  other readers may exist.
- **Windows narrower than 320px.** Out of scope (owner).
- **Addon repositories.** Checked the knowledge, media_import and intelligence frontends: none
  reads `upload.files`, `upload.folder` or `folder.newFolder`, and their "Folder" strings are
  their own keys.
- **`filter.type.*` messages.** They lose one reader (the card) but stay: the filter UI uses
  them.
- **No-wrap for every `ActionMenuItem`.** Not done: nine other menus share it, and long addon
  labels there would widen them.
- **Raising the phone file sheet on open.** Parked by the owner after three spec-design
  review rounds kept finding conflicts between an automatic raise and find, focus, load order
  and approved e2e specs.
