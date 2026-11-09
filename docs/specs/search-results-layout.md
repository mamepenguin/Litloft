# Search results page: one results bar

SPEC-ID: SPEC-CORE-066
SPEC-ID: SPEC-ADDON-081

Approval:

## Summary

The search results page (`/drive/{drive}/search`) grew one control at a time, and its
controls now sit in four places: a Scene search checkbox with a hint sentence above the
query field, the count and two actions beside the field, a toolbar row under it, and the
Files / Passages switch further down above a "Filter in this folder…" field that has no
folder to filter. Turning Scene search on puts the scene shelf above the field and pushes
the field half a screen down. This change puts the page back into the order the Passages
design (SPEC-CORE-040) agreed and the owner re-approved on 2026-11-09:

- the query field first, always at the top;
- the condition chips under it, with the URL's `type` shown as a chip;
- one results bar: the Files / Passages switch and Scene search on the left, the count,
  sort, view and `…` on the right;
- the scene shelf under the bar, then the results.

The toolbar's Filter menu leaves this page, so a file type is chosen in one place
(「＋ 条件」). Save as Smart Folder and the intelligence addon's Find entry move into the
`…` menu. The match labels on result cards stop being colour-coded.

- **SPEC-CORE-066**: the core page layout, the `type` chip, the `…` menu entries, the
  single-colour match labels, and the `search-modes` slot moving into the `…` menu.
- **SPEC-ADDON-081**: intelligence's `find-mode` entry draws a menu row instead of a chip.

Agreed design: https://claude.ai/artifact/8rvA46N9E1ZRKiSMncvtVS, saved in
`docs/process/reviews/feature-search-results-layout/design/` (`Main`, `Scene`, `Phone`,
`Passages`, `Menu`, `Filtered`; the page before the change is in `design/before/`).

### Visible decisions of the design (what the design check compares)

- D1. Regions, top to bottom: query field; chip row (type chip, operator chips,
  「＋ 条件」); results bar; scene shelf (Scene search on, not in Passages); results.
  Nothing sits above the query field.
- D2. The query field spans the content width at every width. Nothing shares its row
  except the image button inside it.
- D3. Results bar, left to right: the Files / Passages `SegmentedControl`; the Scene search
  checkbox labelled 「シーン検索」 (「シーン」 below 640 px) with no hint text; a flexible
  gap; the count; View; Sort; `…` (View before Sort, as on every other page). A hairline border separates the bar from what follows.
- D4. The count reads 「N 件」 in Files and 「N ファイル・M 箇所」 in Passages (「M 箇所」 below
  640 px), on one line.
- D5. The `…` menu holds, in order: below 768 px only, the View group and the Sort group
  each followed by a separator (as today); the Smart Folder entries; a separator;
  選択モード; and the Find entry last, with no separator before it (so its late arrival
  moves nothing above it). In Passages: the Smart Folder entries, then the Find entry, no
  separator, at every width.
- D6. The type chip looks like an operator chip: `bg-sand` pill, 「種類」 in semibold, the
  kind, and a ✕.
- D7. Passages rows start at the content's left edge (no centring) within
  `max-w-list-row`.
- D8. Match labels on result cards share one neutral style, at today's size
  (`text-[10px]`).
- D9. Below 640 px the page is three rows above the results: field, chips, results bar.
  Below 768 px Sort and View are in `…`, as today.
- D10. With an operator in the query, the Scene search checkbox is absent and every other
  control keeps its place.
- D11. The results bar sticks to the top of the scroll area while the results scroll, as
  the toolbar row does today; the scene shelf scrolls under it.
- D12. Below 640 px the 「画像で探す」 pill stays first in the chip row, before the type
  chip. The image error line sits between the chip row and the results bar.

The scene shelf's own contents (its heading, card grid and 「すべて表示」) are drawn by the
addon and do not change; the design shows where it goes, not a new shelf.

## Required items

### 1. Normal flow

1. The viewer submits a query from the header search modal or the page's own field. The
   page opens at `/drive/{drive}/search?q=…` with any of `type`, `sort`, `order`,
   `smart_folder_id`, `include_scene_clip`, `show`.
2. The page renders the header: the query field, then the chip row. The chip row holds,
   in order: a 「種類: <kind>」 chip when the URL has a valid `type`, the operator chips of
   the current text (SPEC-CORE-039), and 「＋ 条件」.
3. Under the header, the results bar renders as D3. The Files / Passages control appears
   under the same condition as today (`passagesApplicable`). The Scene search checkbox
   appears exactly when the query has no operator, in both views.
4. With no operator and not (`show=passages` with a non-blank `q`), the page's own test
   today, the `search-results-top` slot mounts under the bar and above the results. The
   slot keeps that test even where `FolderBrowser` falls back to Files because Passages
   does not apply; the addon's
   entry draws nothing while `includeSceneClip` is false. Core does not add a gate on
   `includeSceneClip`.
   When the tree pane is visible and a file is selected (`hideToolbar`), the results bar
   still renders the view switch, Scene search, the count and `…`, which today are all
   reachable in that state (the Smart Folder button and Find sit in the header); only
   Sort and View hide, as the toolbar does today.
5. The results render: the Files grid or list, or the Passages list. No
   "Filter in this folder…" field is rendered on this page.
6. Viewer actions:
   - ✕ on the type chip removes `type` from the URL with `router.push` and keeps `q`,
     `sort`, `order`, `smart_folder_id`, `include_scene_clip` and `show`.
     On the search page the URL is the source of truth for `type`: `FolderBrowser`'s type
     state follows the `typeFilter` prop on every change (today it is seeded once), it is
     never seeded from the list snapshot (whose key `drive|||` the search page shares with
     the drive root), and the URL-sync effect never writes back a `type` the URL no longer
     has. Sort, order and view mode keep today's behaviour; they are out of scope. The two other
     controls that clear the type on this page, the no-results 「フィルタを解除」 and
     `PassageList`'s clear-filter action, stay and go through the same `push` as ✕.
     `search-results-top` receives the URL's type.
   - Checking or unchecking Scene search sets or deletes `include_scene_clip` with
     `router.replace`, as today.
   - `…` → Smart Folder entries behave as the current Smart Folder button and its menu:
     unsaved, 「スマートフォルダに保存」 opens the save dialog; on a saved search
     (`smart_folder_id` resolves), the menu shows 「保存済み: <name>」 as a non-interactive
     label, then 「更新」, 「名前変更」, 「削除」, each opening the dialog it opens today.
     After save and delete the URL keeps `show` and `include_scene_clip` as well as the
     `q`, `type` and `smart_folder_id` it keeps today (today it drops both, which would now
     throw a viewer who saves from Passages back to Files); `sort` and `order` behave as
     today. `smartFolder.saved` changes from 「保存中: {name}」 to 「保存済み: {name}」 (en stays
     "Saved: {name}"); the other labels are today's keys.
     A long name is cut to one line with an ellipsis inside the menu's width; the row is
     `role="presentation"`, not a menu item. Choosing an entry closes `…` first, then
     opens the dialog. The dialogs and the error
     toast are owned by a Smart Folder controller mounted by `FolderBrowser` for the
     page's lifetime, not by the menu panel, which unmounts on close. The component's
     own dropdown, and its `smart-folder-menu` Escape registration, go away.
   - `…` → Find entry (intelligence), probed each time the menu mounts the slot, as today
     on each mount; labelled with today's `find.pageCta`
     (「Findページを開く」 / "Open Find page"), navigates to the Find page with the trimmed
     query, as the chip does today.
   - `…` → 選択モード toggles select mode, as today.

### 2. Failure cases

- **Invalid `type` in the URL** (not one of `VALID_TYPES`, `markdown` mapped to `text`):
  `parseTypeFilter` returns null today; no chip renders and no type applies, as today.
- **The Smart Folder list is loading or failed:** the entries resolve as the button does
  today: a `smart_folder_id` that does not resolve shows the unsaved entry.
- **The intelligence probe has not answered or answers "off":** the Find entry is absent.
  The probe runs on every mount, as today, so the entry appears a moment after `…` opens;
  it is the menu's last row, so nothing above it moves. Closing the menu aborts the
  probe, as unmounting does today. New in SPEC-ADDON-081: a rejected request leaves the
  entry absent instead of the gate pending forever (today there is no `catch`). No result
  is cached.
- **The intelligence addon is not installed:** the slot is empty and the menu has no Find
  entry and no gap.
- **Scene shelf fetch fails:** unchanged; the addon decides what to draw.

### 3. States

The page state is the URL plus the existing loading flags. New combinations to cover:

| `type` | operator in `q` | `show` | Scene search checkbox | type chip | shelf |
|---|---|---|---|---|---|
| unset | no | files | shown | none | when on |
| set | no | files | shown | shown | when on |
| any | yes | files | absent | shown when set | absent |
| any | no | passages | shown | shown when set | absent |
| any | yes | passages | absent | shown when set | absent |

Count: hidden while `settledTotal` is null (Files) or while the meaning search is loading
or failed (Passages), as today.

Transitions (each a URL change; parameters not named are carried unchanged):

- Adding an operator (Enter or 「＋ 条件」): `push`, keeps `type`, `sort`, `order`,
  `smart_folder_id`, `include_scene_clip`, `show` (SPEC-CORE-039 I20). The checkbox hides
  but `include_scene_clip` stays in the URL, so removing the last operator brings the
  checkbox back in the state it had. Intended: the viewer's choice is not lost.
- ✕ on the type chip or a clear-filter action: `push`, drops `type` only; the view
  (`show`) stays.
- Files ↔ Passages: `replace`, changes `show` only (SPEC-CORE-040 I9). Entering Passages
  clears select mode (SPEC-CORE-040 I24); `…` in Passages has no 選択モード.
- A URL change while `…` is open leaves it as it is today (its open state is local to
  `FolderToolbar`, which is not remounted). A Smart Folder dialog that is open stays open,
  because its controller lives for the page, and acts on the URL's `q` at the moment of
  submission, as today.
- No transition is disallowed; every combination in the table is reachable by URL.

### 4. Data read and written

- Reads the URL search params as today. Writes only the URL (`type` removal via the chip,
  `include_scene_clip`, `show`), as today.
- Smart Folder create, update, rename and delete go through the same hooks as today.
- No backend, database, cache or file change.

### 5. External services

None. The intelligence status probe and the scene shelf fetch are unchanged.

### 6. Authorization

Unchanged. The page is reachable only for drives the viewer can access; nothing here
adds a route or a request.

### 7. Effect on existing features

- `FolderToolbar` is shared by every folder-like page. Only the search branch changes:
  `FilterMenu` is not rendered when `isSearch`; the left side of the bar gains the
  view switch and Scene search, and the count, only when `isSearch`. Folder, special-view
  and tag pages render as before.
- `FolderContent`'s `FilterField` is not rendered when `isSearch`; other pages keep it.
- `PageHeader` on the search page no longer receives `scope` or `actions`. Other
  `PageHeader` users render as before.
- `MATCH_BADGES` styles are shared by the result cards (`MatchOverlay`), the header
  modal's rows (`MergedResultItem`) and `MatchLegend`. All three take the single style, so
  the legend still matches what the rows show.
- The `search-modes` slot moves from `PageHeader` actions into the `…` menu, wrapped by
  the host's `role="menu"` as `file-actions-menu` is. Its props stay
  `{ query, drive, filter, onSelect }` and gain `closeMenu`.
- `ImageQueryView` (`?img=`) does not render `FolderBrowser` and is unchanged. It renders
  `SearchQueryHeader` with `typeFilter={null}` and an `imageSrc`, and the type chip is
  drawn only inside the chip row that `imageSrc` suppresses, so it never appears there.
- The header search modal (`GlobalSearch`) still writes `type=` into the results URL for a
  scoped filtered search; the chip is how that type now shows and goes away.

### 8. Error behavior

Nothing new is logged. Smart Folder errors show where they show today, the fixed
bottom-right toast, which outlives the menu (item 1). No new user-facing error text.

### 9. User-visible behavior

D1–D10 above, plus:

- The hint 「動画の中で特定のシーンが映っている箇所を探す」 is no longer shown. The message
  key may stay for other users; it is removed if nothing else reads it.
- 「フィルタ」 is no longer on the search page. A file type is chosen with 「＋ 条件」 →
  種類, which writes `type:<kind>` into the query (SPEC-CORE-039), or arrives as `type=`
  from the modal or a Smart Folder and shows as the chip.
- Choosing a type with 「＋ 条件」 adds an operator, so Scene search and Find disappear for
  that query, as they do today for any operator (SPEC-CORE-039 I21).
- Match labels: one style for every kind, `bg-bg-elevated text-text-muted`
  (`font-medium`, same size and radius as today). `MatchOverlay`'s fallback for a kind
  missing from `MATCH_BADGE_STYLES` takes the same style.
- The short Scene search label below 640 px: 「シーン」 / "Scenes" (new key).
- Docs updated in the same PR: `docs/user-guide/search.md` (the Filter control at :41,
  "the type chosen in the toolbar" at :64, the Save button at :68, the switch's position
  at :96, the Find chip at :137, the Scene search toggle's position);
  `docs/user-guide/file-browsing.md:128` ("click **Save**");
  `docs/addons/intelligence.md:208` ("Scene search above the search results");
  `docs/ADDON-DEVELOPMENT.md` slot rows for `search-modes` and `search-results-top`.

### 10. Non-functional

- No new kind of request. Opening `…` mounts the `search-modes` slot, which sends the
  probe it sends today on page load, once per open instead of once per page.
- Layout must hold at 375 px with no horizontal scroll (`frontend/e2e-layout/`
  `no-horizontal-scroll*.spec.ts`).
- Touch targets in the bar reach 44 px on a coarse pointer, as `SegmentedControl` and the
  toolbar buttons already do.

## Touch points

- `frontend/src/app/drive/[name]/search/page.tsx` — Scene search toggle and the
  `search-results-top` slot leave the page body; the page passes them to `FolderBrowser`.
- `frontend/src/components/FolderBrowser.tsx` — search branch of the header (`scope`,
  `actions` removed), the results bar composition, the shelf position, the `type` chip
  wiring.
- `frontend/src/components/folder/FolderToolbar.tsx` — search-only leading controls,
  count, `FilterMenu` hidden on search, extra `…` entries for search.
- `frontend/src/components/folder/FolderContent.tsx` — `FilterField` hidden on search.
- `frontend/src/components/search/SearchQueryHeader.tsx` — the type chip in the chip row.
- `frontend/src/components/SmartFolderSaveButton.tsx` — `buildSearchUrl` keeps `show` and `include_scene_clip`; split into menu rows
  (`ActionMenuItem`) and a controller that owns the dialogs and the toast; its own
  dropdown and `smart-folder-menu` registration removed.
- Guard registries that list `SmartFolderSaveButton`'s dropdown:
  `frontend/src/__tests__/popup-dismissal.test.ts`,
  `frontend/src/__tests__/anchoredDropdowns.test.ts` and
  `frontend/src/components/__tests__/anchoredDropdownDefaults.test.tsx`. Their entry is
  removed because the dropdown no longer exists, not to weaken the check; the `…` menu
  that now carries the entries is already registered there.
- `frontend/src/__tests__/core-search-vocabulary.test.ts`: the per-file counts of `search`
  keys and the total are recounted for the moved toggle, the removed `sceneSearchHint`
  and the new short label. A recount of keys that moved, not a looser bound.
- Tests that `vi.mock("@/components/SmartFolderSaveButton")` follow its new export names:
  `FolderBrowser.{snapshotScroll,sceneUrl,paste,hasMore,imageQuery,folderAnchor,passages}`,
  `SearchPage.queryHeader`, `SearchPage.filtered`, `ImageQueryView.test.tsx`.
- `SearchPage.queryHeader.test.tsx` and `FolderBrowser.header.test.tsx` assertions that an
  operator query renders no `search-modes` slot open `…` before asserting, so they still
  test SPEC-CORE-039 I21.
- `frontend/e2e-layout/fixtures/search-header.html`, `passage-rows.html` and
  `no-horizontal-scroll.html`, updated to the new markup; and a new
  `frontend/e2e-components/` spec that renders the real `FolderToolbar` search branch and
  `SearchQueryHeader` for I5 and I10.
- `frontend/src/messages-core/{ja,en}.json` `smartFolder.saved`; the short Scene label.
- `addons/intelligence/frontend/FindModeSlot.tsx` also catches a rejected probe.
- Other unit tests rewritten for the new structure (behaviour, not loosened):
  `FolderBrowser.header.test.tsx`, `FolderToolbar.passages.test.tsx` (`…` now shown in
  Passages), `SmartFolderSaveButton.test.tsx`, `SearchPage.sceneSlot.test.tsx`,
  `SearchPage.filteredSlots.test.tsx`, `SearchPage.passages.test.tsx`, FilterMenu and
  toolbar tests that assume the search page shows Filter, and
  `addons/intelligence/frontend/FindModeSlot.test.tsx` (chip → menu row).
- `frontend/src/components/search/PassageList.tsx` — left-aligned within
  `max-w-list-row`.
- `frontend/src/lib/matchBadges.ts` — one style for every badge.
- `frontend/src/messages-core/{ja,en}.json` — 「シーン」 short label, 「保存済み」 label if
  needed, removal of keys nothing reads.
- `addons/intelligence/frontend/FindModeSlot.tsx` (submodule) — draws an
  `ActionMenuItem` row and calls `closeMenu` before `onSelect`.
- `frontend/e2e-layout/search-header.spec.ts`, `passage-rows.spec.ts` and the
  no-horizontal-scroll specs — measurements updated to the new layout.
- `DESIGN.md` — §6 Page Header: the search results bullet (count and actions move to the
  results bar; Save is not a primary action).
- `docs/user-guide/search.md`, `docs/user-guide/file-browsing.md`,
  `docs/addons/intelligence.md`, `docs/ADDON-DEVELOPMENT.md` (slot table rows for
  `search-modes` and `search-results-top`).
- The `addons/intelligence` submodule pointer, bumped to the merged `FindModeSlot`
  change before the core PR.
- `docs/process/reviews/feature-search-results-layout/design/` — the agreed design.

No protected path is edited.

## Invariants

I1. In the page body (below the app toolbar, ignoring the visually hidden `<h1>`), no visible element is above the query field, in every state of the table in item 3, including Scene search on, measured on the real components in `frontend/e2e-components/`.
I2. At any width, including while the toolbar is hidden for a selected file, the page shows at most one visible Files / Passages control (exactly one while Passages applies), exactly one visible count and one `…`, and renders no `FilterMenu` and no "Filter in this folder…" field; folder, special-view and tag pages still render `FilterMenu` and `FilterField`, and gain no view switch, Scene search or count.
I3. The type chip renders exactly when the URL's `type` parses to a valid kind (`markdown` as `text`), and the listing is filtered by exactly the URL's `type`, also when the drive root's list snapshot carries a type; ✕ on the chip, the no-results 「フィルタを解除」 and `PassageList`'s clear-filter each push one history entry whose URL lacks `type` and keeps `q`, `sort`, `order`, `smart_folder_id`, `include_scene_clip` and `show`, after which the listing is unfiltered by type and no later effect puts `type` back.
I4. The Scene search checkbox renders exactly when the query has no operator, in both Files and Passages, also while the toolbar is hidden for a selected file; toggling it changes only `include_scene_clip`, with `router.replace`.
I5. With the checkbox absent, the Files / Passages control, the count, View, Sort and `…` keep the x positions they have when it is present, measured on the real components in `frontend/e2e-components/` at 1280 px and at 390 px.
I6. The `search-results-top` slot mounts after the results bar and before the first result, exactly when the query has no operator and not (`show=passages` with a non-blank `q`), and receives the URL's `type`.
I7. The `…` menu offers the Smart Folder actions available today for the same URL (save when unsaved; the saved name, update, rename and delete when `smart_folder_id` resolves; none when `q` is blank), each opening the same dialog as today after the menu closes and saving the URL's `q`, never unsubmitted field text; after save and delete the URL keeps `show` and `include_scene_clip`; a failed Smart Folder action shows its error toast after the menu has closed.
I8. The `search-modes` slot renders only inside the open `…` menu, as its last row, and never for a query with operators (asserted with the menu open); the Find entry navigates to `/drive/{drive}/addons/intelligence/find?q=<trimmed q>` and closes the menu; a rejected probe leaves no Find entry and no pending state; in Passages the `…` menu holds only the Smart Folder and Find entries at every width.
I9. Every match label on result cards, modal rows and the legend uses the same class string, the fallback for an unlisted kind included, and each kind keeps its label text.
I10. Measured in a real browser on the real components (`frontend/e2e-components/`): at 390 px the query field spans the content width, the results bar is one row with the count on one line, its controls are at least 44 px tall on a coarse pointer, and the page has no horizontal scroll in Files and Passages, with and without Scene search; at 1280 px the results bar is one row with the count right of the Scene search checkbox, Passages rows start at the results bar's left edge within `max-w-list-row`, and after scrolling the results the bar's top stays at the scroll area's top while the shelf scrolls under it.

## Revises

SPEC-CORE-039 I15. At 390 px wide, measured in a real browser by `frontend/e2e-layout/`, the field spans the content width with the full query reachable, and the count sits on one line in the results bar; at desktop width the field has its row to itself and the count shares the results bar with the view switch, Sort, View and `…`.
SPEC-CORE-039 I22. The Smart Folder save entry in the `…` menu saves the URL's `q`, never unsubmitted field text.
SPEC-CORE-040 I17. In Passages, sort, view mode, select, Play all and the Filter menu are hidden, while `sort` and `order` survive in the URL and apply again after switching back to Files; the `…` menu stays and offers only the Smart Folder and Find entries; `search-results-top` and Show more by similarity are not rendered.

## Checked, no action

- **Turning the type chip into a `type:` operator.** Considered so that a type has one
  form. Not done: `type=` combines with operators already (`filterFromParsed` resolves the
  kinds with it, SPEC-CORE-039 I6), and folding it into `q` would turn Scene search off
  for a viewer who came from the modal without asking for that.
- **Keeping Scene search available with operators.** The filtered meaning search does not
  send `include_scene_clip` (SPEC-CORE-039 I6). Changing that is a search change, not a
  layout one.
- **The image query page (`?img=`).** It does not render `FolderBrowser` and has its own
  header (SPEC for image query). Out of scope.
- **768–1199 px.** No layout of its own; the bar follows the existing `md` rule for Sort
  and View.
- **Other screens' scope line.** The owner questioned why `DESIGN.md` puts the count under
  the title. Only the search page changes here; the rule for Home, Library and the rest is
  a separate decision.
- **The scene shelf's own look.** Drawn by the addon and unchanged (see Summary).
- **A new slot id for the menu form of `search-modes`.** Considered `search-actions-menu`.
  Not done: `find-mode` is the slot's only entry, both sides ship together through the
  submodule pointer, and a second id would leave an unused one behind.
- **Empty results** keep today's `EmptyState`; the results bar stays above it with
  「0 件」.
- **Sort and view mode seeded from the drive root's list snapshot.** Today the search page
  shares the root's snapshot key, so a root sorted by title opens search sorted by title.
  Existing behaviour, not made worse here; a separate fix.
- **Caching the Find probe.** Considered so the entry appears at once on later opens.
  Not done: an aborted or failed `/status` returns null like the admin gate, so a cache
  could keep a wrong answer until reload, and a config change would not show without one.
- **SPEC-CORE-035 I8 and I12** (semantic-search-all-hits: "with the text filter off",
  "the text filter matches only drawn rows"). Not revised: with the field gone from the
  search page the filter is always off there, so both still hold as written.
- **SPEC-CORE-039 I14** ("its kinds exclude … the toolbar type"). Not revised: the type
  it means is the URL's `type`, which this change keeps; restating I14 would replace the
  menu entries SPEC-CORE-043 and SPEC-CORE-047 added since.
- **A design check without a test for the 「シーン」 short label and the removed hint.**
  These are text differences the design check sees; no invariant.
- **The hint text for Scene search** goes without a replacement (no `title` tooltip):
  the owner's rule is that the UI does not explain itself in sentences.
