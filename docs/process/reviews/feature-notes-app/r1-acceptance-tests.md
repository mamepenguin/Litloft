# R1 review: acceptance tests for the Notes app (SPEC-ADDON-130/131/132, SPEC-CORE-130)

Tests reviewed, not product code:

- core `video_share-notes-tests` @ `c134fd054`: `backend/tests/test_folder_counts_listing_filters.py`
- `addons/knowledge` @ `f1e4b3d` + `0410850`: `frontend/__tests__/{notesAppHarness.tsx, notesFrame, notesHome, notesLibrary, Editor.saveHandle}.test.tsx`, `notesRoutesManifest.test.ts`, `tests/test_notes_with_sources.py`

Spec: `docs/specs/notes-app.md` (approved 2026-11-18). Threat model: personal tool, owner only, no adversary.
Scores: freq 0-10, impact 1-10 as in `rules/agents.md`. For a test that is red against a correct
implementation, freq is how often it fails (10 = every run) and impact is 5 (it blocks the change or
pushes the implementer to bend product code to the test).

Material read besides the tests: `TargetMenu.tsx`, `ToolbarMenu.tsx` (`MenuRadioGroup`), `memberTarget.ts`,
`useMemberTarget.ts`, `navigationGuard.ts`, `canonicalFileUrl.ts`, `Page.tsx`, `drives.py` (`folder-counts`,
`FileFiltersQuery`, watch-history), `shelves.py`, `internal.py` (`/files/bulk`), Knowledge `database.py`,
`conftest.py`, `internal_client.py`, `manifest.json`, and for one claim the implementation under review in
`video_share-notes-app/addons/knowledge/app/routers/notes_sources.py`.

## Coverage: would a test fail if the invariant were broken?

| Inv. | Covered by | Gap |
|---|---|---|
| I1 | `notesFrame` "a saved Smart Collection narrows every listing and count", "?view=all&clips=1 ... still leaves clips out", "scope line ... type=text and exclude_origin=webclip"; `notesHome` Continue writing params, Recently updated "A clip" absent, walk params; `notesLibrary` rail counts / shelves params, list params, the `note` check through `files/query` with `exclude_origin` | The Target menu's own "All notes" count (finding 23, spec issue) |
| I2 | `notesFrame` scope-line tests (total and params on every `files` call); `notesHome` walk params; `notesLibrary` list and rail params | Collection target never exercised (9) |
| I3 | `notesLibrary` "I3 under a member target the folder/tag rail and the list send the same ids"; Folders/Tags rail tests; core `test_spec_core_130_each_count_is_the_listings_total_at_that_path` | List paging untested, so "over all its pages" is not held (5); collection target (9) |
| I4 | `notesLibrary` "while a save is pending Saving… shows and another note waits", "a failed save hands the change to the navigation guard; cancelling keeps the editor", "a conflicting save ... confirming lets it happen", `GATED` x6 "waits for the save and happens on saved"; `Editor.saveHandle` "dirty is true inside the autosave debounce", "text typed while a save is in flight is saved again" | Failure path only for note change (7); sort change not gated in any test (8) |
| I5 | `notesLibrary` "I5 when the metadata/content fails ... no Edit" | "has not loaded" while switching notes (18) |
| I6 | `notesLibrary` "I6 rows link to the file page, no pane"; "I6 no Edit when the policy is off / unknown / flag off" | File-kind gate: no plain-text positive or non-document negative (10) |
| I7 | `test_notes_with_sources.py` "an id that is not a note of the drive is left out and never read", "the other drive sees only its own", "a source on another drive or not active is dropped" | — |
| I8 | `notesFrame` `?q=`, `?prefill=`, `?edit=` x3; `notesLibrary` "?view=all with folder, sort and q", "a tag in the URL shows Tags"; `/connections?focus=` by pre-existing `connectionsPage.test.tsx` | — |
| I9 | `notesFrame` "choosing a target writes the Knowledge key and no other app's", "a saved target that is gone", tooLarge/failed; `notesLibrary` segment tests | The tooLarge/failed test cannot pass (1) |
| I10 | `notesFrame` "while the count loads ... no 0", "when the count fails ... drive alone", "a target with no text ... 0 notes" | — |
| I11 | `notesHome` badge `1:02:05`, `1:05`, `p. 12`, source line incl. "Drive root" and locator-less; backend "the locator is the first link to that source", "a link to another file gives no locator", "a failed read falls back ... locators None" | — |
| I12 | None new. Pre-existing `Editor.*` tests exercise PUTs incidentally | No test pins the handle-less timing or the file page's indicator and view-mode toggle (16) |
| I13 | `notesFrame` "I13 the page does not ask for an overlay sidebar" | Home only, not Library (12) |
| I14 | core `TestGetUnderTheListingFilters`, `TestPostQuery` (every count compared with the listing's total at that path, plus pinned paths), "a filter narrows what type alone counts"; "only type / none" by the kept `test_drive_folder_counts.py` | — |
| I15 | core `TestDriveBoundary` both tests | — |
| I16 | None | No browser measurement at any listed width; the 1024-1279 menu rail has no test of any kind (6) |
| I17 | Pre-existing `NoteRow.test.tsx`, `clipsPage.test.tsx` (behaviour, not markup equality) | Markup equality not pinned; the protected-path rule is the guard. Not scored |
| I18 | `notesLibrary` "I18 Done with saved unmounts the editor, loads the note again and asks list and rail again" | Requests only; the fake answers the same data before and after (15) |
| I19 | `notesFrame` "I19 a drive with no notes draws only the header, tabs and No notes yet" (Home and Library, with a profile and history) | — |
| I20 | backend "an empty list is 422", "more than 60 ids is 422", "sixty ids are accepted"; `notesHome` "I20 walks at most 3 pages of 60"; `notesLibrary` "I20 tags are requested 24 shelves at a time ... at most 200" | Folders cap not tested (21); the tags test has a likely false failure (3) |
| I21 | `notesLibrary` "the view is recorded once per note shown" | — |

| SPEC-ID | Tests |
|---|---|
| SPEC-ADDON-130 | `notesFrame.test.tsx` (all) |
| SPEC-ADDON-131 | `notesHome.test.tsx`, `test_notes_with_sources.py`, `notesRoutesManifest.test.ts` |
| SPEC-ADDON-132 | `notesLibrary.test.tsx`, `Editor.saveHandle.test.tsx` |
| SPEC-CORE-130 | `test_folder_counts_listing_filters.py` |

The core test file is sound: each count is derived from the listing for the same parameters and pinned by
hand, distinctness is exercised (two tags, two collections, duplicate ids), and the drive boundary uses a
same-named collection and a same-named folder on the other drive so a leak changes a count. No finding there.

## Findings

### Tests that are red against a correct implementation (fix before implementation starts)

1. **The "Unavailable" mark is asserted as text, but the core menu renders it only as a `title` attribute.**
   Category: cannot pass / implementation detail. `notesFrame.test.tsx:347-362` ("I9 a member target that
   answers tooLarge/failed ...") ends with `screen.findByText(/Unavailable/)`. `TargetMenu.tsx:136` passes
   `unavailableLabel` as `{ disabled: true, title: unavailableLabel }`, and `ToolbarMenu.tsx:314-315` puts it on
   the `menuitemradio` as `title=`. `findByText` does not read attributes, and the spec forbids editing core
   frontend source ("Core frontend: no source file is edited"). So no correct implementation can satisfy the
   test. The tooLarge and failed cases are both red on every run. Fix: assert
   `getByRole("menuitemradio", { name: /Beach/ })` is disabled and has `title="Unavailable"`.
   freq 10, impact 5.

2. **This fixture's Target leaves zero notes, but the test expects Continue writing, which I19 forbids then.**
   Category: impossible fixture. `notesHome.test.tsx:175-194` ("does not follow the Target") saves `sf-trip`
   (`tag:trip`) over `notes(3)`, and none of those notes has a tag. The scope count goes out with `tag=trip`,
   the fake answers `total: 0`, and the page must draw "No notes yet" without Continue writing (frame step 7,
   I19). The test then awaits `findByText("Continue writing")`. A correct page never draws it, so the test
   times out. A page that draws sections before the count settles passes it only by a race. Fix: give the
   notes `tags: ["trip"]` (or one of them), so the Target keeps a note and the claim under test, "watch-history
   carries no target", is what decides the result.
   freq 10, impact 5.

3. **The `tag000` text is expected once, but the pane's meta line also shows it as a chip.**
   Category: implementation detail the spec leaves open. Verdict PLAUSIBLE. `notesLibrary.test.tsx:330`
   expects `queryAllByText(/^tag000\b/)` to have length 1. With no `note`, the pane shows the first row, `t0`,
   the newest. Library step 4 draws its tags "as read-only chips", so `tag000` appears in the rail entry and
   in the chip. The test passes only if the chip's text node is not the bare tag, for example `#tag000`. The
   spec does not decide that. Fix: count rail controls (`controls("tag000")`) instead of text.
   freq 10 (whenever chips render the bare name), impact 5.

4. **The DB-failure fixture cannot happen, and it fails the router pattern Knowledge uses everywhere.**
   Category: impossible fixture / implementation detail. `test_notes_with_sources.py:365-381` replaces
   `app.database.SessionLocal` with a function that raises `OperationalError`. A `sessionmaker()` call does
   not connect, so a locked or broken DB fails on a query, never there. With `Depends(get_db)`, the error is
   raised inside the dependency, before the route's own `try/except SQLAlchemyError`. FastAPI then answers 500,
   and `TestClient` re-raises. Every Knowledge router takes its session through `Depends(get_db)`, and so does
   the implementation now under review (`video_share-notes-app/.../notes_sources.py:84,101`). The test passes
   only for a route that opens its session inside its own `try`. Fix: make the query fail, for example by
   patching `Session.execute` to raise, or by dropping `note_origins` in the test DB.
   freq 10, impact 5.

### Invariants with no test, or only a test that cannot fail

5. **Nothing tests the list's next page.** Library step 2 says 60 per page and loads the next page on
   scrolling to the end, and I3 counts rows "over all its pages". Every Library fixture has 5 notes or fewer,
   except the 230-note tags test, which never scrolls. Defect let through: the list stops at 60 rows (no
   `useNearEnd`, or a page-2 request that replaces instead of appending). "All N" then disagrees with what the
   list can reach, and older notes are unreachable from the Library. Condition: any drive with more than 60
   notes in the selection, on every visit.
   freq 8, impact 5.

6. **I16 has no browser measurement, and the 1024-1279 rail menu has no test at all.** No `e2e-layout` or
   `e2e-components` spec was added, although section 10 requires a measurement at 1440, 1280, 1279, 1200,
   1100, 1024 and 390px. Nothing anywhere renders the menu mode ("Folders: <name> ⌄" / "Tags: <name> ⌄"), not
   even in jsdom. Every Library test runs at 1440 or below 1024. Defect let through: at 1024-1279 the rail is
   unreachable, or it still draws as a column and the page scrolls horizontally. Condition: an iPad in
   landscape, or a narrowed desktop window.
   freq 3, impact 5.

7. **For every gated change except "another note", only the `"saved"` outcome is tested.**
   `notesLibrary.test.tsx:670-684` (`GATED`) checks tab, segment, selection, search, "Open the file page" and
   Target only with `flush()` resolving `"saved"`. The handoff to `navigationGuard.request` on
   `"failed"`/`"conflict"`, and cancel keeping the editor, are tested only for choosing another row
   (`:624-651`). Defect let through: a tab or Target change after a failed save goes through without the
   discard dialog. The editor unmounts, its unmount write fails silently (Checked, no action), and the text is
   lost. This breaks I4. Condition: the server rejects a save (412 after an edit elsewhere, or a 5xx), then
   the viewer switches tab or Target.
   freq 1, impact 8.

8. **Sort change is missing from `GATED`, and the sort control is never used.** Library step 7 and I4 list
   "sort" among the gated changes. No test clicks the sort button. The URL `sort=` is only read on arrival
   (`:376-385`, `:415`). Defect let through: (a) a sort change while editing unmounts the editor without
   `flush()`, which is the same loss as finding 7 when the unmount write fails. (b) The sort button does not
   push history, does not remove `note`, or does not show the current sort's label.
   freq 1, impact 8 (a); freq 5, impact 3 (b).

9. **A collection target is never exercised.** The harness answers `/collections` with `[]` in every test.
   Frame step 2 names `resolveCollectionTarget`, and I3 says "member and collection targets included".
   Defect let through: the rail's `folder-counts` (whose `collection` parameter is new in SPEC-CORE-130) or
   `shelves` goes out without `collection=`. The rail then counts the whole drive while the list shows the
   collection, and its counts are silently wrong. Condition: a viewer whose Target is a collection.
   freq 3, impact 5.

10. **The Edit gate is tested on the file's kind only for Markdown.** I6 and Library step 5 require
    "Markdown, or a `text/plain` file `usePlainTextDocument` marks as a plain-text document", passing
    `plainTextDocument`, and `TextPreview` for plain text. All Library notes are `text/markdown`. Defect let
    through: Edit is offered on a `text/plain` file that is not a document (a log, a list), or a
    plain-text document is drawn through `MarkdownPreview` and edited without `plainTextDocument`. `type=text`
    lets such files into the list. Condition: a drive holding `.txt` files outside `webclip`.
    freq 3, impact 5.

11. **The pane's chrome provider is untested.** The `KnowledgeEditSection` stub ignores context, so
    nothing checks `MarkdownChromeProvider` with `isMobile: false` and the view mode fixed to `edit`. Nothing
    checks that `setViewMode` (and the view-mode shortcut) does nothing, or that the save state reaches the
    pane's row: "Saving…" is the host's own gate text, and "Saved" is never asserted. Defect let through:
    the shortcut switches the pane to preview, or the editor draws its own header in the pane. The shortcut
    is documented as a no-op there.
    freq 3, impact 3.

12. **I13 is tested on Home only.** `notesFrame.test.tsx:170-176` renders Home. I13 says "on every Notes
    page", and the three-pane Library is the page most tempted to call `useOverlaySidebar()`. Defect let
    through: at 1200px and wider the sidebar overlays the Library.
    freq 8, impact 3.

13. **The "untagged is not an entry" assertion cannot fail.** `notesLibrary.test.tsx:275` checks
    `controls("no_tag")`. The real untagged shelf, like the fake one, has `key: "no_tag"` and `label: ""`
    (`shelves.py:118,177`). An implementation that draws entries from `label` draws a blank-named entry with
    its count, and the regex never matches it. Defect let through: a nameless rail entry with a count, on
    every drive that has untagged notes. Fix: assert the number of entries, or that no control's name is
    only a number.
    freq 8, impact 3.

14. **No test reads a date.** Library step 2 and Revises I21 require the date of the sort's field
    (`created_at` under `created`, else `updated_at`). Home rows and Notes with sources show `updated_at`, and
    Continue writing cards show "folder · `updated_at`". The fixtures make `created` and `updated` differ, but
    nothing compares them. Defect let through: the rows show `updated_at` under the `created` sort, or
    `created_at` everywhere, and the dates are silently wrong.
    freq 5, impact 3.

15. **I18 is checked by requests only.** `:556-573` asserts the meta, content, relations, sources, list and
    counts requests go out after Done. The fake answers identical data before and after. A pane that refetches
    but keeps drawing the pre-save metadata or tags (a cache keyed by id) passes. Fix: change `server.notes`
    (for example tags) inside `flush`, then assert the new chips.
    freq 3, impact 3.

16. **Nothing pins I12 (an Editor without `saveHandle` is unchanged).** `Editor.saveHandle.test.tsx` always
    passes the prop. No test asserts, without the prop, that there is no PUT before the 2000 ms debounce and
    exactly one after. None asserts that the file page's own save indicator and view-mode toggle are still
    drawn. The pre-existing `Editor.*` tests reach PUTs only incidentally. Defect let through: the
    flush refactor changes autosave timing or order on the file page.
    freq 3, impact 3.

17. **The plain-text block in `flush()` is untested.** Library step 6 says a file whose save is blocked
    resolves `"failed"` only when it is dirty. Defect let through: Done on a clean, blocked file reports
    "Couldn't save" and traps the viewer in the editor, or a dirty one resolves `"saved"` and the text is
    dropped.
    freq 1, impact 5.

18. **I5's "has not loaded" case is untested.** Only load failures are tested. No test chooses another row
    while reading and checks that "Edit" is not drawn until the new note's metadata and content arrive.
    Defect let through: a stale Edit button from the previous note mounts the editor on a note that has not
    loaded.
    freq 1, impact 5.

19. **The "without a profile" Continue writing case cannot fail.** `notesHome.test.tsx:196-209` uses
    `history: []` in all three cases, so "without a profile" is indistinguishable from "with no rows". The
    real watch-history answers `[]` without a viewer too (`drives.py:1712-1713`), so the defect it would let
    through (rows drawn without a profile) is unlikely. Fix if kept: non-empty `history` with
    `nickname = null`, and assert no `watch-history` request.
    freq 1, impact 2.

20. **A selection change's history is not asserted.** Library step 2 says selection, sort and search changes
    push history and remove `note`. Search is tested (`:397-413`). Clicking a rail entry is tested only inside
    `GATED`, which checks `folder=Work` and nothing about push or `note`. Defect let through: a selection
    change uses replace (Back skips it) or keeps a `note` from the previous folder.
    freq 8, impact 2.

21. **Smaller rail rules are untested.** The 200 cap is untested for Folders. A selected tag beyond 200 is
    untested. "All" showing no count while the total is unknown is untested. On a counts failure, "All" and
    the selected entry should have no counts, but `control("All")` (`:261`) accepts "All 4". Defect let
    through: these drift with no test failing.
    freq 1, impact 2.

22. **The Library rows' openings are untested.** The Library rows are a new component (section 7), but no
    Library test sets `openings`. Their two lines of opening, and "a row whose opening failed to load has
    none", are covered for Home only. Defect let through: Library rows without their opening, or the request
    not sent.
    freq 8, impact 2.

### For the human (spec, not a test gap)

23. **I1 vs the core Target menu's "All notes" count.** When a Target other than the default is in force,
    the open menu shows the default option's count from `getDriveFiles(drive, { type: types, limit: 1 })`
    (`TargetMenu.tsx:114-120`). That call has no `exclude_origin`, so on Notes "All notes" counts web clips.
    I1 says no note counted in the header has `md_origin` `webclip`. The spec also says no core frontend
    source changes. No test can hold both, so a decision is needed: widen `defaultTargetTypes` handling in
    the core, or accept the menu's count as outside I1. Condition: a non-default Target, menu opened, on a
    drive with clips.
    freq 5, impact 3.

### Tests asserting what the spec does not say

None found. The assertions checked against the spec lines they cite include the exact `Try again` counts,
`queryByRole("search")` being absent, no "See all" under Notes with sources, the `getPending()` null after Done
fails, and the core's 400/422 pins (each compared with what `files` / `files/query` answer in the same test).
They all trace to a spec line or to existing `files` behaviour.

TOTAL: 23 findings
