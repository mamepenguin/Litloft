# R2 review: fix commits on feature/notes-app

Reviewed (fixed SHAs, read with `git show`):
- knowledge: 7ae31a4 8064049 1b402d8 8099163 15e538e c6de91f be3f4f9 882d2d4
- core: a5771c2db e848954a9

Threat model: personal tool, owner only. A = silently wrong in normal use. B = misuse/odd input.

## Findings

### A1. The core I16 layout e2e fails at 390px against the addon HEAD; its fixture lacks the panel the phone layout depends on

- Where: `frontend/e2e-components/fixtures/notesLibrary.tsx:78-89` (core a5771c2db) together with
  `addons/knowledge/frontend/library/NotesLibrary.tsx:229` (`-mx-4`, c6de91f).
- Rule: spec "Phone (390) ... the list rows edge to edge"; I16; testing rule "a test must take the
  branch production takes".
- Observed: `pnpm exec playwright test --config=playwright-components.config.ts notes-library-desktop`
  with the submodule at 882d2d4: 6 pass, `at 390px the layout is list` fails with
  "the page does not scroll sideways: Expected <= 390, Received 406".
- Cause: production draws the Library inside `NotesPage`'s `<div id="notes-app-panel" className="px-4 ...">`,
  so `-mx-4` cancels that padding. The fixture renders `NotesLibrary` directly in `PageFrame`
  (no horizontal padding), so the list hangs 16px outside the page. The fixture measures a structure
  production does not have, and nothing in a real browser asserts "edge to edge" (only "on the page").
- Condition: every CI run of the e2e-components job once the pointer is bumped to c6de91f or later.
- Frequency 10, impact 5 (red CI, noticed). Fix: wrap the arrangement in the same `px-4` panel (or
  render the real panel) and assert at 390 that list.left ≈ 0 and list.right ≈ innerWidth.

### A2. Clicking the row of the note being edited, when the URL has no `note`, runs the save gate and leaves editing

- Where: `addons/knowledge/frontend/library/NotesLibrary.tsx:158`
  (`if (file.id !== params.note) gate(...)`, was `file.id !== shownId`).
- Rule: Library 7 / I4 gate "shows another note"; the same note is not another.
- Condition: open the Library at `?view=all` (no `note`; first row shown), press Edit, type,
  click the same (first) row in the list. `params.note` is null, so the click goes through the gate:
  `flush()` -> on "saved" `reload()` unmounts the editor and the pane returns to reading;
  on "failed"/"conflict" the "discard changes?" dialog opens for a click that changes nothing,
  and confirming it discards the text.
- Frequency 3, impact 3 (editing closes unexpectedly; the text is saved on the common path).
- Suggested shape: gate only when `file.id !== shownId`; when it is the shown note and the URL lacks it,
  `navigate({ note }, "replace")` without the gate (the pane keeps its key, so the view is still recorded).

### A3. `replacement` is never cleared except by a row click, so Back/Forward to the replaced note does not record it

- Where: `addons/knowledge/frontend/library/NotesLibrary.tsx:99-105, 157, 192`.
- Rule: Library 4 / I21 "the URL they arrived at (a link, a reload, Back or Forward) carried its `note`".
- Condition: open a link whose note was trashed (`note=zz`) -> step 3 replaces it with the first row
  `n1` (replacement = n1) -> change folder (push) -> Back to `?view=all&note=n1`. The Library stayed
  mounted, `replacement` is still `n1`, so `recordView` is false and nothing is written. A reload of the
  same URL does record it, so the two arrivals disagree.
- Frequency 1, impact 3 (a note missing from Continue writing). Whether a Back to a page-written
  entry counts as "arrived" is arguable; if it does not, nothing to fix. A per-history-entry marker
  (or clearing `replacement` when `params.note` changes to something else) would make it consistent.
- Untested either way.

### A4. The Target-change note drop compares with the last *ready* key, so a round trip through a non-ready target keeps `note`

- Where: `addons/knowledge/frontend/NotesPage.tsx:43-57`.
- Rule: Library 1 "A Target change keeps `folder` and `tag` and removes `note`".
- Condition: Library at `?view=all&note=n3` under target A -> choose a target whose status is not
  `ready` (an empty member target: the page draws "No notes yet"; or a lookup that ends unusable and
  falls back to the same default key) -> choose A again. `targetKey` was null in between, so
  `lastTargetKey` is still A and `changed` is false; `note=n3` stays and the pane shows n3 instead of
  the first row.
- Frequency 1, impact 2.

### A5. On a phone the first frame draws the desktop list header, then re-lays out

- Where: `NotesLibrary.tsx:211-233` with `useLibraryLayout` returning `null` before its effect runs.
- Condition: every load below 1024px: `layout === null` -> rail row `px-3` with no sort, list not
  `-mx-4`, sort inside the list; after the effect, the phone row. One-frame jump.
- Frequency 10, impact 1.

## Design differences from NotesLibraryPhone.dc.html (no scores)

- D1. Sort button position: the artboard puts "更新順" right after the rail button (`gap: 8px`, free
  space to the right). The implementation wraps the rail menu in `min-w-0 flex-1`
  (`NotesLibrary.tsx:216`), so the sort button sits at the row's right edge, away from the rail button.
- D2. Rail button style: the artboard's rail button is a filled pill (`background: #e5e5e0`, no border);
  `LibraryRailMenu` uses `ToolbarMenu`'s default bordered card style (no `filled`), the same look as
  the sort button, so the two no longer differ in weight as drawn.
- Matches: rail row and search share the 16px gutter; search full width below the row; rows edge to
  edge with 16px inner padding; folder name is the last segment on both the button and the
  placeholder (root stays "Drive root" because its key is `""`).

## Bucket B (misuse / odd input, no repro)

- B1. `lastSegment` of a folder path ending in `/` or made only of `/` returns the input; such paths
  do not come from the scanner.

## Checked, no finding

- Test fixes against the spec (8064049): "Unavailable" is the `title` of the disabled row, which is what
  the core `TargetMenu` draws for Video and Reading (`TargetMenu.tsx:142`), so the new assertion is the
  spec's "as in Video and Reading", not weaker. The Home Target test now gives the target a note so the
  page is not in the `0` empty state (I19) — needed for the test to reach Home at all. `controls("tag000")`
  still asserts exactly one entry. `findAllByText` only waits.
- Harness changes do not open a branch production lacks: Next's `app-router.js` memoizes
  `searchParams` on `canonicalUrl` (lines 114-124), so a same-URL replace yields the same object, as the
  harness now models; the App Router unmounts a page whose route the URL left (route wrapper); the real
  `Editor` publishes `dirty = content !== lastSaved` through `useDirty` (Editor.tsx:693-695), which is
  what the stub now publishes and what `navigationGuard.request` reads.
- Deleted unit test "changing the target key starts a new list and drops the note": covered at page
  level. `notesLibrary.test.tsx:746` (non-lookup Trip target) asserts `note` gone, `folder` kept and the
  list re-asked with `tag=trip`; n4 is not in Trip's rows and the no-target check would still show it,
  so the assertion depends on the drop. `:1023` covers the lookup path the old Library-level code missed.
- recordView (c6de91f) against revised Library 4 / I21: link and reload arrival -> recorded
  (`:486`, replacement starts null); no `note` -> not recorded (`:1088`); row click -> recorded once
  (`:1094`), including the first row already shown (`:1105`, URL gains `note`, pane keeps its key, the
  prop flips true after load); replacement -> not recorded (`:1114`), clicking it then records (be3f4f9);
  selection/sort/search/segment push without `note` -> first row, not recorded; Target change drops
  `note` -> not recorded; Back/Forward to a note the viewer chose -> new pane key, recorded (except A3).
  Lane order: `setReplacement` (default lane, from an effect) commits before `router.replace`
  (transition), so no render shows `params.note === replacement target` with a stale `replacement`.
- 7ae31a4: `_require_drive` (distill.py) already unquotes, so dropping the second `unquote` fixes a
  double decode; patching `Session.execute` makes the route's own query fail, and the 503 can only come
  from the route's handler.
- e848954a9: the prop is optional and only adds `exclude_origin` when set; the notesFrame wire test
  (`exclude_origin=webclip`, `type=text`) exercises the real `getDriveFiles` through `AppHeader`.
- 15e538e: `FILE_COUNT` 66 -> 90 matches the files the Library added.
- Done button `text-bg-primary` on `bg-text-primary` inverts with the theme.

## Mutation (gated change -> flush -> navigationGuard)

Command: `NO_COLOR=1 pnpm exec vitest run src/addons/knowledge/__tests__/notesLibrary.test.tsx src/addons/knowledge/__tests__/notesFrame.test.tsx`
(baseline 113/113 pass). Each mutant applied alone, files restored from a copy, `git status` clean.

| # | Mutant | Result |
|---|---|---|
| M1 | sort calls `navigate` without `gate` | killed (3: saved/failed/conflict sort rows) |
| M2 | selection without `gate` | killed (3) |
| M3 | segment without `gate` | killed (3) |
| M4 | tab click `router.push` without `runGated` | killed (3) |
| M5 | Target `onChoose` without `runGated` | killed (3) |
| M6 | row choose without `gate` | killed (3) |
| M7 | failed/conflict proceeds without `navigationGuard.request` | killed (12+) |
| M8 | guard confirm reloads but does not `proceed()` | killed (8) |
| M9 | "saved" does not `proceed()` | killed (8) |
| M10 | gate treats "editing" as "reading" | killed (12+) |
| M11 | "conflict" treated as "saved" | killed (8) |

No survivors.

Counted: A1-A5, B1, D1-D2.

TOTAL: 8 findings
