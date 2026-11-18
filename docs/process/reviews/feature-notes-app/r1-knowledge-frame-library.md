# R1 review: Notes frame + Home (C2) and Library (C3)

Commits reviewed (addons/knowledge): `194fd22`, `dd6023b` only.
Threat model: personal tool, owner is the only user, no adversary. A = silently wrong in normal use; B = strange input / misuse.

## I17 check

- `NoteRow.tsx`, `useNoteOpenings.ts`, `noteDates.ts`, `notePages.ts`, `clips/*`: not touched by either commit.
- `NotesLanding.tsx`: only the imports and the deleted `FindNote` / `ContinueWriting` / `RecentNotes` change; `SectionHeading`'s body is unchanged.
- Clips imports (`SectionHeading`, `NoteRows`, `useNoteOpenings`, `groupNotesByAge`, `appendUnseen`) all still resolve at `dd6023b`.

## Findings

### F-1 (design question, raise to human) Opening the Library records a view for a note the viewer never chose

- Where: `frontend/library/pane/NotePaneContainer.tsx:108-114` (records on load), driven by `frontend/library/shownNote.ts:30-31` (no `note` → first row shown) and `NotesLibrary.tsx:153-158`.
- Rule: spec Library 3 + 4 + I21 require exactly this, so it is not a deviation from the spec; it conflicts with Home step 1 ("the notes this viewer opened last") and with `design-decisions.md` "Watch history": `WatchHistory` is the canonical view history that `personal_history` (intelligence Ask) reads.
- Normal use: open the Library at 1024px or wider, click through a few rail folders or change the sort. Each selection change drops `note`, the pane shows that list's first row, and an empty `POST /progress` is sent for it. After browsing four folders, Continue writing (limit 4) shows the four folders' newest notes instead of the notes the viewer was writing, and Ask's personal history counts them as viewed.
- Frequency 8 (every Library visit at desktop width), impact 4 (Home's first section and the canonical history are silently filled with browsed-past notes; nothing is lost, the viewer can see the cards are wrong). Score 32.
- Options: record the view only when the viewer chose the note (a row click, or a `note` already in the URL), not for the auto-shown first row. Needs a spec change (I21 / Library 4).

### F-2 "Done" is unreadable in the dark theme

- Where: `frontend/library/pane/NotePanePresenter.tsx:108` — `bg-text-primary text-white`.
- Rule: `frontend-conventions.md` (follow `DESIGN.md` tokens); the core pairs `bg-text-primary` with `text-bg-primary` (`frontend/src/components/epub/EpubPositionBar.tsx:209`).
- Normal use: the theme follows `prefers-color-scheme` (`ThemeProvider.tsx:25`). In dark mode `--text-primary` is `#eeeeea`, so the button is a near-white pill with white text and a white check icon; "Done" cannot be read.
- Frequency 5 (every edit in the pane while the system is in dark mode), impact 3 (clickable, but the label and icon vanish). Score 15.

### F-3 A Target change that passes through "looking up" keeps `note`

- Where: `frontend/library/NotesLibrary.tsx:108-117` with `frontend/NotesPage.tsx:80-81`.
- Rule: spec Library 1, last bullet: "A Target change keeps `folder` and `tag` and removes `note`."
- Normal use: in the Library with a note selected, choose a Smart Collection with free text (a member target). The target is `lookingUp` while it is evaluated, so `NotesPage` draws the skeleton in place of `NotesLibrary`, which unmounts; `lastTargetKey` starts at `null` on remount and the removal never runs. The `note` from the previous target is then checked without the target (`checkNote`), answers total 1 and stays in the pane, beside a list that does not contain it. The same happens leaving an `empty` target (the EmptyState also unmounts the Library).
- Frequency 2, impact 3. Score 6.

### F-4 The scope line and the rail's "All" are not asked again after Done

- Where: `frontend/library/NotesLibrary.tsx:60-64` (only rail and list take `refresh`); `frontend/NotesPage.tsx:41-49` (count loaded once per target).
- Rule: I3 (rail count equals the list) for the "All" entry, whose count is the header total.
- Normal use: under a tag-based Smart Collection target, edit a note in the pane and remove that tag, then Done. List and tag entries are re-requested and drop the note; the header "N notes" and "All N" keep the old number until the target or page changes.
- Frequency 1, impact 2. Score 2.

### F-5 A conflict on a gated change opens two dialogs at once

- Where: `frontend/library/pane/NotePaneContainer.tsx:159-173`.
- Rule: spec item 2, "`conflict`: the editor's conflict dialog ... For a gated change, the 'discard changes?' dialog follows."
- Normal use: the note was changed elsewhere (another tab or device) while it is open in the pane; the viewer clicks another row. `flush()` resolves `"conflict"`, the editor portals its `ConflictModal` (z-50) and the pane immediately calls `navigationGuard.request`, whose `DirtyBlocker` dialog opens at the same z-index. The viewer sees two stacked modals; confirming the guard first reloads the pane and unmounts the editor (and its conflict choice) before "Overwrite" or "Reload" was offered in order.
- Frequency 1, impact 3. Score 3.

## Design comparison (D-)

Artboards: `Main`, `NotesLibrary`, `NotesLibraryEdit`, `NotesLibraryPhone`. Declared differences (no "See all" on Notes with sources, the editor toolbar as a second row, states without an artboard) are not listed.

- D-1 Home section headings (`SectionHeading`, shared, unchanged) carry an icon (PenLine, Quote, Clock) and are `text-lg` (18px); the artboard's headings are 20px text with no icon.
- D-2 "New note" uses the `FilePlus` icon (`NotesPage.tsx:104`); the artboard uses a plain plus.
- D-3 Recently updated rows (shared `NoteRows`) put a folder icon before the folder name; the artboard's folder column is text only.
- D-4 The rail's "All" entry has a `Layers` icon (`LibraryRail.tsx:107`); the artboard draws the folder icon on every entry, "すべて" included.
- D-5 Notes with sources source line: the artboard writes "動画/料理 · 12:34 から" and, for a note citing several positions, "動画/学問 · 3 か所"; the code writes "<folder> · 12:34" and always the first source's position. The spec's line ("<source folder> · <locator>") matches the code; the artboard text is not listed as a declared difference.
- D-6 Phone (390): the artboard puts the rail menu button and the sort button on one row and the search field on the next; the code draws the rail menu alone (`NotesLibrary.tsx:216-218`), then the search field and the sort button together (`LibraryList.tsx:141-156`).
- D-7 Phone: the artboard's list rows run edge to edge (`margin: 0 -16px`); the code's rows sit inside the page's 16px gutter (`NotesPage.tsx:127` `px-4`).
- D-8 Phone: the artboard's rail button reads "フォルダ: 雑多なメモ" and the search "雑多なメモ を検索" (the folder's last segment); the code shows the full path ("フォルダ: メモ / 雑多なメモ", "メモ/雑多なメモ を検索"). The 1440 artboard's placeholder uses the full path, so the two artboards disagree with each other.
- Not verified: the editing pane's "no border or frame" (drawn by `KnowledgeEditSection`, outside these commits), and the phone rail button's filled pill style (core `ToolbarMenu`).

TOTAL: 13 findings
