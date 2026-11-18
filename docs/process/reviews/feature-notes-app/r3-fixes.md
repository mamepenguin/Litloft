# R3 review: fix commits on feature/notes-app

Reviewed (fixed SHAs, read with `git show`):
- knowledge: ea37e69 75a87ba c1b7ec8 d893b3b 9ef66af
- core: 9f9ab074e 09a385abd

Threat model: personal tool, owner only. A = silently wrong in normal use. B = misuse/odd input.

## Findings

### A1. The toolbar rule also disappears on the file page: the file page's editor runs under the same MarkdownChromeProvider

- Where: `addons/knowledge/frontend/Editor.tsx:1450` (`bordered={!chrome}`, ea37e69).
- Rule: the claim for R-5 #7 ("removed only in the Library pane; the file page keeps its rule");
  spec "The Knowledge editor draws its toolbar itself, below the host's row, as it does on the file page".
- Cause: `chrome` is `useMarkdownChrome()`, and the file page supplies that context too.
  `frontend/src/components/FileDetail/ShellLayout.tsx:553` renders a Markdown/plain-text file inside
  `MarkdownDocumentLayout`, which wraps its children in `<MarkdownChromeProvider value={chromeValue}>`
  (`frontend/src/components/markdown/MarkdownDocumentLayout.tsx:128`); the `knowledge-edit` slot
  (`KnowledgeEditSection.tsx:93`) mounts `Editor` there. So `chrome !== null` on the file page and
  `bordered` is false: the file page loses the rule under its toolbar, the same as the pane.
  `grep MarkdownChromeProvider` finds exactly two providers, the file page and `NotePaneContainer.tsx:250`;
  "a host supplies chrome" cannot tell them apart.
- Why the test passes: 75a87ba's "the file page keeps it" half mounts `Editor` with no provider at all,
  a branch the file page never takes (testing rule: a test takes the branch production takes).
- Condition: open any Markdown note on its file page with the inline editor, in edit or split view.
- Frequency 8, impact 2 (a visible change to another screen, silently; nothing breaks).
- Suggested shape: an explicit prop from the pane (e.g. `KnowledgeEditSection`/`Editor`
  `toolbarRule={false}` passed only by `NotePaneContainer`), or a field on the pane's chrome value
  that the file page's value lacks; test the file page through `MarkdownDocumentLayout` (or at least a
  provider with the file page's value) keeping `border-b`.

## Design differences (no scores)

- D1. Phone, tabs to New note: 8px, artboard 12px (`NotesLibraryPhone.dc.html`: New note `margin-top: 12px`).
  `PageHeader.tsx:172` puts the primary action on `row-start-5` below `sm`; Notes passes no `actions`,
  so row 4 is an empty implicit track and the grid's `gap-y-1` is counted twice (4 + 0 + 4). With
  `actions` present it would be 4px + the actions row.
- D2. Phone, New note to the rail row: by classes 12px, not 16px. New note is the header's last row;
  below it `<header>` `py-2` (8px), the panel `pt-0` (`NotesPage.tsx:148`, Library and count not 0), the
  Library `max-sm:pt-1` (4px, `NotesLibrary.tsx:205`); the rail menu and sort are both `ToolbarMenu`
  triggers under `items-center`, so no further offset by class. Artboard: `margin-top: 16px`. (R-5's
  old 55px against 8 + 24 + 20 = 52px by the old classes leaves ~3px the classes do not explain; even
  with it the result is ~15px.) Desktop tabs to Library: 8 (`py-2`) + 0 + 12 (`pt-3`) = 20px, matches.
- D3. R-5 #7's second half, the hairline at the bottom of the editor area in the pane, is not touched
  by these commits (only the toolbar's `border-b` is made conditional).

## Bucket B (misuse / odd input, no repro)

- B1. A drive name holding a lone surrogate makes `encodeURIComponent` throw; `readClassification` /
  `writeClassification` catch it (segment falls back to Folders, choice not stored). Same throw in
  core `appPrefs.keyFor`. Drive names come from `drives.json`.

## Checked, no finding

- #5 key format: `libraryUrl.ts:94` builds `litloft.addon.knowledge.classification.${encodeURIComponent(drive)}`;
  core `appPrefs.ts:33-37` builds `${"litloft.addon." + addon}.${field}.${encodeURIComponent(drive)}`.
  Same prefix, same separator, same encoder, so identical for every drive name, including `&`, spaces,
  `/`, `%`, non-ASCII (`encodeURIComponent` is the only transform on both sides). No collision with core's
  own `classification` field: `writeAppPrefs` takes only `AppId` (`video`/`reading`). The new test RED's on
  the raw key (the derived key would miss); `afterEach` clears storage so `key(0)` is the target key.
- #4: `railModel.ts:40,50` null both counts when `railFailed` (`rail.phase === "failed" && rail.data === null`,
  i.e. the Folders request or the first Tags page failed). A later Tags page failing keeps `partial`
  data, so All keeps its count, which is what the spec's Tags case says. Tests assert `textContent`
  equals the bare label (RED with the old 154).
- #6: `NotesLibrary.tsx:253` `pl-10` only when `paneDrawn` (three/menu); the narrow editing pane has no
  inset and keeps the panel's `px-4`. 1024-1279 keeps `pl-10` beside the list.
- A2: `choose` gates only `file.id !== shownId`; the shown note with no `note` in the URL is navigated
  (replace) without the gate, the pane keeps its key, the view gets recorded. Mutations (each restored,
  tree clean afterwards), 151 tests across the two files:
  - gate back to `!== params.note`: killed (the new step 7 test, `flush` called).
  - else branch removed: killed (2 tests: step 7 URL gains `note`; I21 first-row click records).
  - gate removed for another note (`navigate` directly): killed (7 gate tests).
  - else branch sent through the gate: killed (step 7 test).
- primaryAction: with `primaryAction` absent (`withPrimary` false), `PageHeader` emits the same
  `grid-cols` string and `sm:col-span-4` on tabs as before and no extra node; `AppHeader` only forwards
  the prop, so Video/Reading home and shelf headers are unchanged. From `sm` it sits in a 5th `auto`
  column on row 1 after the Target (col 4); below `sm` a `col-span-3` row with `[&>*]:flex-1`, no
  `-mr-2`, so it spans the content box (the 390 e2e asserts 16..374). Notes passes New note as
  `primaryAction` and no `actions` (d893b3b, its test checks both). c1b7ec8 fully reverts the interim
  `max-sm:w-` class and its assertion.
- 9ef66af only waits for the view record that is posted after the pane loads; the count is still exact.
- 9f9ab074e: the fixture now wraps the Library in the panel's `px-4`, and the 390 case asserts rows edge to
  edge. The fixture panel keeps `pt-6` while production's Library panel is now `pt-0`; nothing in the
  e2e measures vertical spacing, so D1/D2 are checked by class arithmetic only.

TOTAL: 1 findings
