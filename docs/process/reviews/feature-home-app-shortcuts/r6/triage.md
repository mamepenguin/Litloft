# Triage: r6

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Read coverage

Product files:
- addons/knowledge/frontend/NotesPage.tsx — full: Read the whole file.
- addons/knowledge/frontend/Page.tsx — full: Read the whole file.
- addons/knowledge/frontend/library/NotesLibrary.tsx — partial: Read lines 40-179, which hold the props, the sort and the fillHref hunks.
- addons/knowledge/frontend/library/libraryUrl.ts — partial: Read lines 85-114, the libraryHref function that holds the only hunk.
- addons/knowledge/frontend/notesapp/useNotesTarget.ts — full: Read the whole file.
- addons/knowledge/frontend/pages/clips.tsx — partial: Read lines 60-459, which cover every changed hunk.
- backend/app/models.py — partial: Read lines 380-419, the HomeAppShortcut class and its neighbours.
- backend/app/routers/home_shortcuts.py — full: Read the whole file.
- backend/app/schemas.py — partial: Read lines 1250-1289, the home-shortcut schemas.
- frontend/e2e-components/fixtures/homeAppEntries.tsx — full: Read the whole file.
- frontend/e2e-components/home-app-entries.cases.ts — partial: Read lines 30-59 in the file; the added measureAppShortcut and the I10 cases only through the diff.
- frontend/src/app/drive/[name]/apps/reading/page.tsx — full: Read the whole file.
- frontend/src/app/drive/[name]/apps/reading/shelf/page.tsx — full: Read the whole file.
- frontend/src/app/drive/[name]/apps/video/page.tsx — full: Read the whole file.
- frontend/src/app/drive/[name]/apps/video/shelf/page.tsx — full: Read the whole file.
- frontend/src/components/CollectionDetail.tsx — partial: Read lines 40-54 and 420-444, the two hunks.
- frontend/src/components/SmartFolderSaveButton.tsx — partial: Read lines 510-569, the SmartFolderMenuItems function that holds both hunks.
- frontend/src/components/appshell/TargetMenu.tsx — full: Read the whole file.
- frontend/src/components/folder/FolderToolbar.tsx — partial: Read lines 155-164 and 545-574, the two hunks.
- frontend/src/components/home/HomeAppEntries.tsx — full: Read the whole file.
- frontend/src/components/readingapp/ReadingApp.tsx — full: Read the whole file.
- frontend/src/components/readingapp/ReadingAppHeader.tsx — full: Read the whole file.
- frontend/src/components/readingapp/ReadingShelfPage.tsx — partial: Read lines 58-87 (props and the useReadingApp call) and grep for line 237 (homeEntry passed to the header).
- frontend/src/components/readingapp/useReadingApp.ts — partial: Read lines 105-354, the whole hook body that holds every hunk.
- frontend/src/components/videoapp/VideoApp.tsx — full: Read the whole file.
- frontend/src/components/videoapp/VideoAppHeader.tsx — full: Read the whole file.
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: Read lines 55-89 (props and the useVideoApp call) and grep for line 281 (homeEntry passed to the header).
- frontend/src/components/videoapp/useVideoApp.ts — partial: Read lines 100-379, the whole hook body that holds every hunk.
- frontend/src/lib/api.ts — partial: Read lines 880-909, getHomeShortcuts and setHomeShortcut.
- frontend/src/messages-core/en.json — partial: Read lines 30-111, the appShell and drive blocks that hold every hunk.
- frontend/src/messages-core/ja.json — partial: Read lines 36-110, the appShell and drive blocks that hold every hunk.
- frontend/src/types/index.ts — partial: Read lines 183-197, HomeShortcutKind and HomeShortcut.

Test files:
- addons/knowledge/frontend/__tests__/clipsTargetParam.test.tsx — missing from coverage
- addons/knowledge/frontend/__tests__/notesTargetParam.test.tsx — missing from coverage
- addons/knowledge/frontend/__tests__/targetParamPending.test.tsx — missing from coverage
- backend/tests/test_home_app_shortcuts.py — missing from coverage
- backend/tests/test_home_shortcuts.py — missing from coverage
- frontend/src/__tests__/appTargetParam.test.tsx — missing from coverage
- frontend/src/__tests__/appTargetPendingHolds.test.tsx — missing from coverage
- frontend/src/__tests__/homeAppShortcuts.test.tsx — missing from coverage
- frontend/src/components/appshell/__tests__/TargetMenu.homeRow.test.tsx — missing from coverage

## Needs a human

### unspecified_behavior

Note: TargetMenu no longer requests the default Target's count while `name` is null, on every load of all four apps, not only while a `?target=` is pending (TargetMenu.tsx:171-185).; The Notes Library drops `note` from the URL when a `?target=` was applied (NotesLibrary.tsx:159). The spec mentions only the view fill-in.; `libraryHref` now deletes `target` on every Notes Library navigation (libraryUrl.ts:98), and Clips' `replaceFilters`/`chooseTarget` delete it too (clips.tsx:214, 253).
- claude-read: TargetMenu no longer requests the default Target's count while `name` is null, on every load of all four apps, not only while a `?target=` is pending (TargetMenu.tsx:171-185).
- claude-read: The Notes Library drops `note` from the URL when a `?target=` was applied (NotesLibrary.tsx:159). The spec mentions only the view fill-in.
- claude-read: `libraryHref` now deletes `target` on every Notes Library navigation (libraryUrl.ts:98), and Clips' `replaceFilters`/`chooseTarget` delete it too (clips.tsx:214, 253).
- claude-verify: The TargetMenu default count is suppressed while the Target name is unknown on any load, not only while a ?target= is pending. This only applies while the menu is open.

### unspecified_behavior

Note: The TargetMenu default count is suppressed while the Target name is unknown on any load, not only while a ?target= is pending. This only applies while the menu is open.
- claude-read: TargetMenu no longer requests the default Target's count while `name` is null, on every load of all four apps, not only while a `?target=` is pending (TargetMenu.tsx:171-185).
- claude-read: The Notes Library drops `note` from the URL when a `?target=` was applied (NotesLibrary.tsx:159). The spec mentions only the view fill-in.
- claude-read: `libraryHref` now deletes `target` on every Notes Library navigation (libraryUrl.ts:98), and Clips' `replaceFilters`/`chooseTarget` delete it too (clips.tsx:214, 253).
- claude-verify: The TargetMenu default count is suppressed while the Target name is unknown on any load, not only while a ?target= is pending. This only applies while the menu is open.

## Findings

A: 0
B: 5
C: 0

### claude-read:R3 — bucket B, LOW, open

Claim: `addons/knowledge/frontend/library/NotesLibrary.tsx` changes behaviour but is not in the touch-point list, which names only Notes `library/libraryUrl.ts`.
Impact: When a `?target=` was applied, the Notes Library now ignores the URL's `sort`, drops `note`, and runs its fill-in replace whenever `target` is in the URL. This changes what the Library shows on landing (the Target's saved sort, no open note) and adds a replace. It is the intended SPEC-ADDON-157 behaviour, but nothing in the list tells a reader that the Library component itself changed.
Evidence: NotesLibrary.tsx:48-49 adds the `targetChanged` prop; :86-91 `!ignoreUrlSort && !targetChanged && isLibrarySort(rawSort)`; :152-162 fillHref also fires on `targetChanged || ... || searchParams.has("target")` and passes `{ note: null }` when `targetChanged`. NotesPage.tsx:151 passes `targetChanged`.
Repro: Compare the diff's file list with the Touch points section. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `library/NotesLibrary.tsx` (the `targetChanged` sort override, the note drop and the fill trigger) to the touch points.

</details>

### claude-read:R4 — bucket B, LOW, open

Claim: TargetMenu.tsx is listed only for the "`homeEntry` prop and the row", but the change also stops the default Target's count request whenever `name` is null. That applies to every app on every load, not only to a pending `?target=`.
Impact: On a plain open (no `?target=`) of Video, Reading, Notes or Clips, a menu opened while the saved Target is still being looked up no longer shows the default row's count until the lookup ends. The behaviour is small and arguably better, but it changes the existing Target menu for every caller, and the list does not plan it.
Evidence: frontend/src/components/appshell/TargetMenu.tsx:171-185 `onDefault || lookingUp ? null : () => getDriveFiles(...)`, with `lookingUp={name === null}` at :315. VideoAppHeader.tsx:61, ReadingAppHeader.tsx:59, NotesPage.tsx:178 and clips.tsx:444 all pass `name: null` while the Target is unknown, including the plain lookup.
Repro: Mutation: revert the `|| lookingUp` at TargetMenu.tsx:175. Expect appTargetParam's "Target menu opened while pending ... asks no count" to fail. No test covers the plain-path effect. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Extend the TargetMenu touch point to "the default count is not requested while `name` is null", or limit the hold to a pending `?target=`.

</details>

### claude-read:R1 — bucket B, INFO, open

Claim: Three existing components outside the touch-point list (CollectionDetail.tsx, SmartFolderSaveButton.tsx, folder/FolderToolbar.tsx) are edited to read `appShell.putOnHome`/`appShell.removeFromHome`, and `drive.putOnHome`/`drive.removeFromHome` are deleted from both message files, while the list says only that the `appShell` keys are added.
Impact: No user-visible change: the en and ja strings are the same text under the new namespace, and a repository-wide grep finds no remaining reader of `drive.putOnHome`/`drive.removeFromHome`. A reader who checks the diff against the list finds the Smart Collection, collection and pinned-folder `…` menus changed without a plan, and the message-file entry says nothing about the removal.
Evidence: frontend/src/components/CollectionDetail.tsx:48 adds `tShell = useTranslations("appShell")` and :435-436 use it; frontend/src/components/SmartFolderSaveButton.tsx:522,561-562; frontend/src/components/folder/FolderToolbar.tsx:160,567-568. frontend/src/messages-core/en.json and ja.json no longer have `drive.putOnHome`/`drive.removeFromHome`; the keys sit at appShell lines 43-44. Touch points: "`frontend/src/messages-core/{ja,en}.json` — `appShell.putOnHome`, `appShell.removeFromHome`, `drive.appShortcutLabel`" and none of the three components.
Repro: Compare the diff's file list with the Touch points section, then grep `putOnHome|removeFromHome`: only appShell readers remain. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the three components and the move of the two keys from `drive` to `appShell` in the touch points, or record the gap in the review.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: The See all route pages `frontend/src/app/drive/[name]/apps/video/shelf/page.tsx` and `.../reading/shelf/page.tsx` are edited (they pass `homeEntry`), but the touch-point list names only `apps/{video,reading}/page.tsx`.
Impact: No defect: I12 requires the See all pages to pass `homeEntry`, and they pass `video`/`reading`. The list is incomplete for these two route files.
Evidence: video/shelf/page.tsx:33 `homeEntry="video"`; reading/shelf/page.tsx:33 `homeEntry="reading"`. Touch point: "`frontend/src/app/drive/[name]/apps/{video,reading}/page.tsx` — read and remove `?target=`, pass `homeEntry`."
Repro: Compare the diff's file list with the Touch points section. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `apps/{video,reading}/shelf/page.tsx` to the touch points.

</details>

### claude-read:R5 — bucket B, INFO, open

Claim: Several new test files are outside the named test touch points: backend/tests/test_home_app_shortcuts.py (does not match `test_home_shortcuts*.py`), frontend/src/__tests__/homeAppShortcuts.test.tsx (the list names homeShortcuts.test.tsx and homeAppEntries.test.tsx, neither edited), appTargetParam.test.tsx, appTargetPendingHolds.test.tsx, and addons/knowledge/frontend/__tests__/targetParamPending.test.tsx (the list names only notesTargetParam and clipsTargetParam).
Impact: None at runtime. A reader matching the diff against the list finds unplanned test files, and the named files homeShortcuts.test.tsx and homeAppEntries.test.tsx are untouched.
Evidence: Each path is a `new file mode` in the diff. Touch points: "`backend/tests/test_home_shortcuts*.py`", "Frontend tests: `frontend/src/__tests__/homeShortcuts.test.tsx`, `homeAppEntries.test.tsx`, the `TargetMenu`, Video and Reading app tests", "Knowledge tests ... new `notesTargetParam.test.tsx` and `clipsTargetParam.test.tsx`".
Repro: Compare the diff's new-file list with the Touch points section. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the actual test files in the touch points.

</details>

## Not verified

- claude-read: No tests or type-checks were run. Everything here comes from reading the code.
- claude-read: Message-key readers in addon directories not tracked in this worktree, and in installed third-party addons, were not checked.
- claude-read: Whether any existing test asserts that the default count is requested while the Target is being looked up on the plain path.
- claude-read: The e2e cases file was read only in its changed ranges; the e2e specs were not run in a browser.
- claude-verify: I did not view the actual git diff. 'Changed' rests on r6/product-files.txt and r6/test-files.txt.
- claude-verify: I did not search addons other than knowledge for readers of the removed drive.putOnHome/removeFromHome keys.
- claude-verify: I did not run the test suites.
- claude-verify: I did not compare against the TargetMenu count behaviour before the change.

TOTAL: 5 findings
