# Phone polish: player files open with the sheet raised, folder cards show a count, Add menu labels name the action

SPEC-ID: SPEC-CORE-122
SPEC-ID: SPEC-CORE-123
SPEC-ID: SPEC-CORE-124

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

Three phone-width corrections found by a UI review on 2026-11-17 and chosen by the owner
on the design canvas https://claude.ai/artifact/XKXLin7PcqbjnvS1UfYhEw (its artboard
sources are copied to `docs/process/reviews/feature-phone-polish/design/` for reading; they
render only on the canvas).

- **SPEC-CORE-122.** On the file page (the canonical file route, the one `FileDetailShell`
  draws) opened on a viewport narrower than 768px, a file with a player (video, audio, or an
  embedded `.loft`) raises the inspector sheet from `peek` to `half` — its top edge on the
  player's bottom edge — once the player's height is known and only if `half` then meets
  the player's bottom edge. Today the space between a 16:9 player and the 56px resting
  strip — about 500px on a 390 × 844 phone — is empty and reads as a page that failed to
  load. `half` already exists and is not modal, so the player stays usable.
- **SPEC-CORE-123.** Below 640px, a folder card's second line is the item count only
  (「13件」). Today it is the count followed by up to two kinds with their counts
  (「13件 · テキスト 7 · 画像 4」, `MAX_BREAKDOWN_KINDS = 2`), which a two-column card cuts
  after a few characters. A folder holding a single kind keeps that kind's name
  (「9件 · 動画」), as today. At 640px and wider the card is unchanged.
- **SPEC-CORE-124.** The `+ Add` menu's items name the action: 「ファイルをアップロード」 /
  "Upload files", 「フォルダをアップロード」 / "Upload folder", 「新規フォルダ」 / "New folder",
  so the second is no longer read as the same thing as the third.

For the owner, on a phone; the app is a personal tool with no other users.

## Required items

### 1. Normal flow

- 122: The viewer opens a file whose `playerKind` is not null on the file page, on a viewport
  narrower than 768px. The page first shows the resting strip, as today. When the player's
  height has been measured, if `half` meets the player's bottom edge (`halfSnapUnderPlayer`
  is not null), the sheet slides up to `half` once, with the sheet's ordinary opening
  motion. The viewer may then lower it to `peek` with the handle, a pull or Escape, or raise
  it to `full`, exactly as today. Opening another file (a new `fileId`) starts over: a
  player file is raised once its player is measured, a file with no player stays at `peek`.
- 123: The viewer opens a folder view whose grid shows folder cards, on a viewport narrower
  than 640px. Each card shows the folder name and, under it, the item count; a folder with a
  single kind shows the count and that kind. The same rule applies to the card's line while
  the folder's name is being edited. At 640px and wider the card is unchanged.
- 124: The viewer presses `+ Add`. The menu lists 「ファイルをアップロード」, 「フォルダを
  アップロード」, 「新規フォルダ」 (ja) or "Upload files", "Upload folder", "New folder" (en),
  then any addon rows as today. Each item does what it does today.

### 2. Failure cases

- 122:
  - The file is still loading → the loading strip, as today; nothing is raised until the
    file is known and its player measured.
  - `half` does not meet the player's bottom edge after measurement (a portrait video, a
    phone in landscape, any player whose bottom is below the fixed fraction) → the sheet
    stays at `peek`. It is never raised over the player.
  - A refetch of the same file (same `fileId`), a later re-measurement of the player, or a
    resize does not raise the sheet again: the raise happens at most once per file opened.
  - The page was opened at 768px or wider and the viewport is then narrowed below 768px for
    the same file → the sheet starts at `peek` and is not raised.
- 123: A folder with no `kind_counts` → the count alone, as today.
- 124: none — labels only.

### 3. States

- 122: The sheet's states (`peek`, `half`, `full`) and their transitions are unchanged. What
  changes is one automatic transition `peek → half` per file opened below 768px, taken when
  the player is measured and only if `half` meets the player's bottom edge. Find's override is
  unchanged: opening find raises to `half` and closing restores the state remembered when it
  opened. A page opened with `?find=` has find open from the start, so the remembered state
  is `peek`, and closing find leaves the sheet at `half` only if the automatic raise has
  happened by then, otherwise at `peek`.
- 123, 124: none — presentation only.

### 4. Data read and written

None. No preference is stored: the starting state is not remembered between files, visits
or devices, and `inspector-open:{drive}` is not written.

### 5. External services

None.

### 6. Authorization

None — no request is added or changed.

### 7. Effect on existing features

- 122:
  - `FileDetailShell` resets the sheet on `resetKey` (the file id); the automatic raise is
    keyed to that reset, so a new file can be raised and the same file cannot be raised twice.
  - The collection surface (`?collection=`, `?playlist=`, `?folder_play=1`, Smart Collection
    playback) has no sheet for a player file and is not changed.
  - The desktop inspector (`useInspectorOpen`, `inspectorOpenStore`) is not touched.
  - The resting strip's name button and its like, favourite and `⋮` behave as SPEC-CORE-094 I7
    states; on a raised player page they are reached after lowering the sheet.
  - Accepted by the owner: while the sheet is raised, the upload progress drawer is not drawn
    (background-upload I13), the open drawer takes Escape and lifts itself over the keyboard
    for a focused field (DESIGN.md §Bottom Sheet). These now hold from the moment a phone
    player page has raised its sheet; lowering the sheet ends them, as today.
  - The mini-player and fullscreen are not touched.
- 123: `FolderCard`, wherever it is drawn (the folder grid and `RightPaneFolder`).
  `FolderListRow` already shows the count alone at every width and is not changed.
- 124: `upload.files`, `upload.folder` and `folder.newFolder` are read only by `AddButton`.
  `folder.newFolderTitle` and `folder.newFolderHere` are not changed.

### 8. Error behavior

None added.

### 9. User-visible behavior

Listed under 1 and 2. Nothing changes at 768px and wider for 122, at 640px and wider for 123.
124 changes the menu text in both locales at every width. The user guide's three affected
sentences are updated (touch points).

### 10. Non-functional

No new request, no new storage, no new dependency.

## Design decisions to check

Against the canvas artboards `VideoHalf.dc.html` and `FoldersCount.dc.html`. Everything
else drawn on them (the tab names, the 情報 tab's buttons, tags and chapters, the sample
names) is illustration of today's inspector, not a decision of this spec.

- D1 (122): on a 16:9 player file at 390 × 844, the raised sheet's top edge meets the
  player's bottom edge and the band between them is gone.
- D2 (122): the sheet shows the inspector as it shows today at `half`; the tab selected is
  the one today's sheet selects.
- D3 (123): two-column folder cards below 640px have a second line of the count alone, or
  the count and one kind name for a single-kind folder.
- 124 has no artboard; it is text only and is checked by its invariant, not by the
  design check.

## Touch points

- `frontend/src/components/FileDetailShell.tsx` — the one automatic raise per `resetKey`.
- `frontend/src/components/FileDetail/hooks/useSheetHalfSnap.ts`, `frontend/src/lib/sheetSnap.ts`
  (`halfSnapUnderPlayer`) — read for "measured" and "meets the player's bottom edge";
  changed only if the measurement must be exposed.
- `frontend/src/components/FileDetail/ShellLayout.tsx`, `FileDetailContainer.tsx` — read only:
  `isPlayerFile` is `playerKind(file) !== null`.
- `frontend/src/components/FolderCard.tsx` — the second line below 640px (CSS breakpoint `sm`),
  in both the link and the editing branch.
- `frontend/src/messages-core/en.json`, `ja.json` — `upload.files`, `upload.folder`,
  `folder.newFolder` (en only).
- Tests whose expected labels change with 124 (updated, not loosened):
  `frontend/src/components/__tests__/AddButton.test.tsx`, `AddButton.bundledRows.test.tsx`,
  `frontend/src/components/folder/__tests__/FolderToolbar.test.tsx`,
  `FolderToolbar.bundledRows.test.tsx`, `frontend/src/__tests__/DriveHome.test.tsx`,
  `frontend/e2e-components/add-menu.cases.ts`.
- `DESIGN.md` §Bottom Sheet (a phone player page raises the sheet once to `half` when it meets
  the player) and the folder card (count only below 640px).
- `docs/user-guide/upload-and-fileops.md` (menu names), `docs/user-guide/viewers-and-players.md`
  (on a phone, a video opens with the sheet raised), `docs/user-guide/file-browsing.md` (card
  shows the kinds from 640px wide).
- `.claude/rules/design-decisions.md`, `frontend-conventions.md` — passed through, not edited.
- No protected path is edited.

## Invariants

I1. On the file page below 768px, a file whose `playerKind` is not null shows the sheet at
`half` once its player has been measured, when `half` meets the player's bottom edge; a file
whose `playerKind` is null shows it at `peek`.
I2. On the file page below 768px, the sheet's top edge is never above the player's bottom
edge unless the viewer raised it there: when `half` would not meet the player's bottom
edge, the sheet stays at `peek`.
I3. After the viewer lowers the sheet to `peek` on a player file, a refetch of the same file,
a re-measurement of the player or a resize leaves it at `peek`; opening a different player
file raises it again.
I4. At 768px and wider, opening any file leaves the desktop inspector open or closed as it is
today, and nothing new is written to storage; a page opened there and narrowed below 768px
for the same file shows the sheet at `peek`.
I5. While the sheet is at `half` on a player file, a tap on the player plays and pauses it.
I6. Opening and closing find on a player file below 768px leaves the sheet in the state it was
in when find opened.
I7. Below 640px, a folder card whose folder holds two or more kinds shows the item count and
no kind name; one holding a single kind shows the count and that kind's name; the same holds
for the card's line while its name is being edited.
I8. At 640px and wider, a folder card's second line is the same text as before this change.
I9. In both locales, the `+ Add` menu reads 「ファイルをアップロード」, 「フォルダをアップロード」,
「新規フォルダ」 (ja) and "Upload files", "Upload folder", "New folder" (en), in that order, and
the first two open the file picker and the folder picker respectively.

## Checked, no action

- **Remembering the viewer's last sheet state across files.** Not done: `half` is not
  modal and does not cover the player, so re-raising it on the next file costs nothing to
  watch; a stored preference is new state for no seen need.
- **Images, PDFs and documents.** Not changed: they have no player and fill the page, so
  there is no empty band under them.
- **The collection surface's player.** It has no sheet; adding one is a different change.
- **A YouTube-style inline layout instead of a sheet.** Rejected on the canvas: the sheet
  and its resting strip are the agreed phone design (hako 2026-09-16, 2026-11-13).
- **Folder cards between 640px and the widths where the breakdown fits.** Not changed: the
  report and the canvas cover phones.
- **The breakdown for assistive technology below 640px.** It is not drawn at that width
  (`display: none`), not hidden visually; the count still reads.
- **I7 and I8 are layout.** They are measured in a real browser (e2e-components) at 639 and
  640px, not in jsdom.
