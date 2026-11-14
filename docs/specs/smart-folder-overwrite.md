# Overwrite a Smart Folder from its search page

SPEC-ID: SPEC-CORE-103

Approval:

## Summary

A Smart Folder opens as the search page with `?smart_folder_id=<id>`. The viewer can
change its conditions there, and the `…` menu already has a row that overwrites the
folder with them, but it is labelled 「更新」 with a refresh icon, sits behind `…`, and
nothing on the page says the conditions have changed. The viewer reads it as "reload"
and ends up deleting the folder and saving a new one. This change shows a 「上書き保存」
button at the end of the chips row whenever the page's conditions differ from the
folder's saved ones, renames the menu row to 「上書き保存」 with a save icon (disabled
while nothing differs), drops the confirmation dialog, and makes every Smart Folder
list on the page (the sidebar included) pick up a write made from the search page
without a reload. It is for the single viewer of a home-LAN library.

Agreed design: https://claude.ai/artifact/VC8dJnAU1MFhyV7ysRUD7a, saved in
`docs/process/reviews/feature-smart-folder-overwrite/design/`.

Visible decisions in the design, as checkable lines:

- D1. The button sits in the row under the query field (the type chip, the operator
  chips, 「＋ 条件」), after 「＋ 条件」, pushed to the row's right end.
- D2. It is a secondary (sand) button with the lucide `Save` icon and the label
  「上書き保存」; the results bar under the chips gets nothing new.
- D3. With the conditions unchanged the button is not drawn and the row keeps only the
  chips and 「＋ 条件」.
- D4. At 375px the chips row wraps, so the button moves to the next line when it does
  not fit; nothing scrolls sideways and the results bar is unchanged.
- D5. The `…` menu keeps 「保存済み: {name}」, then 「上書き保存」 with the `Save` icon,
  then 「名前変更」 and 「削除」; 「上書き保存」 is drawn disabled while nothing differs.

## Required items

### 1. Normal flow

1. The viewer opens a Smart Folder (sidebar row, Go to row, or any link carrying
   `smart_folder_id`). The search page loads the drive's Smart Folders and finds the
   one whose id matches (`SmartFolderController`, `current`).
2. The viewer changes the conditions: edits the query and submits, adds a condition
   with 「＋ 条件」, removes a chip, or removes the 種類 chip. Each of these keeps
   `smart_folder_id` in the URL (already true today), except removing the chip that
   leaves the query empty: that goes to the drive's root without the id, as today, and
   the page is no longer a Smart Folder page. This change does not alter that.
3. The page compares its conditions with `current`: the URL `q` (trimmed) against
   `current.query`, and the URL `type` (absent = `null`) against `current.file_type`.
   When either differs, the conditions are *changed*. Text typed into the query field
   but not submitted is not a condition: it neither shows the button nor is saved,
   because the results on screen are those of the URL `q`.
4. While changed, the 「上書き保存」 button appears at the right end of the chips row,
   and the `…` menu's 「上書き保存」 row is enabled.
5. The viewer presses either. The page sends
   `PATCH /api/drives/{drive}/smart-folders/{id}` with `{query, file_type}` (the trimmed
   URL `q` and the URL `type` or `null`, as they were at the press), with no
   confirmation dialog.
6. On success the page's list replaces the folder with the response, so the conditions
   are no longer changed: the button disappears and the menu row is disabled. Every
   other `useSmartFolders` instance mounted in the same tab for that drive (the
   sidebar's) refetches. The URL is not touched.

### 2. Failure cases

- The PATCH fails (network, 404 because the folder was deleted elsewhere, 422): the
  error toast 「スマートフォルダの更新に失敗しました」 shows for 3 s as today, the list is
  not changed, so the button stays and can be pressed again.
- The Smart Folder list has not loaded yet, failed to load, or holds no folder with the
  URL's id: there is no `current`, so neither the button nor the 上書き保存 row is shown;
  the menu offers 「スマートフォルダに保存」 as today.
- A refetch triggered by another instance's write fails: that list keeps the rows it
  had and sets no error. This is a change to the hook for notification refetches only;
  the first load of a list, and an explicit `refetch()`, keep today's error path (the
  list is cleared). The write itself has already succeeded.
- The open folder is deleted elsewhere in the same tab (sidebar 「削除」): the page's list
  refetches, `current` becomes `null`, and the page falls to *No folder*: the button
  and the 上書き保存 row go, and the menu offers 「スマートフォルダに保存」. The URL keeps
  the stale `smart_folder_id`; nothing navigates. This is what the page already shows
  for an unknown id.
- The open folder is deleted in another tab or device: this tab does not hear of it.
  Pressing 上書き保存 gets a 404, which is the failure above.

### 3. States

Per search page with a `smart_folder_id`:

- *No folder*: the list's first load has not finished or failed, or the list holds no
  folder with the id. No button; menu shows 「スマートフォルダに保存」. A refetch in
  progress is not *No folder*: the page keeps its current state on the rows it has until
  the response replaces them.
- *Unchanged*: folder found, conditions equal. No button; menu row disabled.
- *Changed*: folder found, conditions differ. Button shown; menu row enabled.
- *Saving*: a PATCH is in flight. The button and the menu row are disabled.

Allowed transitions:

- No folder → Unchanged / Changed when the list resolves or a refetch brings the id in.
- Unchanged ↔ Changed whenever the URL's `q` / `type` or the folder's saved conditions
  (a refetch) change, in either direction, without a PATCH.
- Unchanged / Changed → No folder when a refetch no longer holds the id.
- Changed → Saving on a press of the button or the enabled menu row.
- Saving → Unchanged / Changed on success, decided by comparing the URL *now* with the
  response; if the URL moved during the flight the page can be Changed again.
- Saving → Unchanged / Changed on failure, by the same comparison: the list is not
  touched, so the page is Changed unless the URL moved back to the saved conditions.
- Saving → No folder when a refetch removes the id during the flight. A success that
  arrives afterwards replaces nothing (the list no longer holds that id) and the page
  stays *No folder*; a failure shows the toast and the page stays *No folder*.

Disallowed: No folder → Saving and Unchanged → Saving (nothing to press); Saving →
Saving (a second press while one is in flight sends nothing, guarded from the moment of
the press, not from the next render); any state writing the URL because of an
overwrite.

### 4. Data read and written

- `smart_folders` table: one row is updated (`query`, `file_type`, and `updated_at` by
  the ORM's `onupdate`) through the existing PATCH. `name`, `sort_by`, `sort_order`,
  `viewer_id`, `drive`, `created_at` are not written. No schema change.
- `GET /api/drives/{drive}/smart-folders` is read again by every other mounted
  `useSmartFolders` instance for the same drive after a create, overwrite, rename or
  delete made through any instance.
- The URL is read (`q`, `type`, `smart_folder_id`) and not written by the overwrite.

### 5. External services

None. Only Litloft's own backend is called.

### 6. Authorization

Unchanged. The PATCH already checks the drive is known and unlocked
(`_validate_drive` → `check_drive_access`) and looks the folder up by id **and** drive
(`_get_or_404`). Smart Folders are shared by everyone who uses the drive, so anyone who
can open the drive may overwrite one, as with the existing row.

### 7. Effect on existing features

- The `…` menu row 「更新」 becomes 「上書き保存」 and loses its confirmation dialog
  (`updateConfirmTitle` / `updateConfirmMessage` are no longer used).
- `useSmartFolders` instances notify each other per drive, so the sidebar also picks up
  a Smart Folder created, renamed or deleted from the search page without a reload. The
  sidebar's own rename and delete reach the search page's list the same way. The
  notification is same-tab only (an in-memory signal, not BroadcastChannel or storage
  events), fires only after a write succeeds, is not delivered to the instance that
  wrote (it already applied the response), and reaches an instance only when its drive
  at that moment equals the written drive. A refetch started by the signal does not
  toggle the instance's `loading` / `error`, and of two fetches in one instance only the
  later-started one's response is applied, so quick successive writes cannot leave an
  older list on screen.
- The `ConfirmDialog` for 「更新」 is removed together with its `updateConfirm*` keys.
- Test files that mock `@/components/SmartFolderSaveButton` with only
  `SmartFolderController` and `SmartFolderMenuItems` must gain the new export, and the
  assertions built on 「更新」 and the confirm step are rewritten to the new contract.
- Other readers of Smart Folders (video app, reading app, Photo Diary target menus,
  `ManageTargetsDialog`) fetch through their own code paths and are not changed; they see
  the new query the next time they fetch.
- Image-query search passes `smartFolderId={null}` and hides the chips row, so it never
  shows the button.
- Sort, scene search and the Files / Passages switch are not saved and are not compared,
  so changing them never shows the button.

### 8. Error behavior

The only user-visible failure is the existing toast 「スマートフォルダの更新に失敗しました」 /
"Failed to update Smart Folder". Nothing new is logged on the frontend; the backend logs
nothing for a 404 or 422, as today.

### 9. User-visible behavior

- Button label 「上書き保存」 / "Overwrite", lucide `Save` icon, secondary (sand)
  button, size `sm`, at the right end of the chips row; 44px tall on a coarse pointer.
  Accessible name 「「{name}」に上書き保存」 / "Overwrite “{name}”".
- Menu row 「上書き保存」 / "Overwrite" with the `Save` icon, in the place of 「更新」;
  disabled (the existing disabled style of `ActionMenuItem`) while nothing differs.
- No confirmation, no success toast: the button disappearing is the confirmation.
- While saving, the button and the menu row take the existing disabled style
  (`Button` / `ActionMenuItem`); no spinner and no label change, because the request is a
  single small PATCH.
- When a press of the button succeeds and the button had focus, focus moves to the
  results bar's `…` button. Not the query field: focusing it would raise the on-screen
  keyboard on a phone.
- Unchanged: the 「保存済み: {name}」 row, 「名前変更」, 「削除」, 「スマートフォルダに保存」.
- `docs/user-guide/search.md` "Saving as a Smart Folder" says how to overwrite, and its
  claim that a Smart Folder keeps the sort is removed (the code saves the query and the
  type only).

### 10. Non-functional

One PATCH per press (the button is disabled while one is in flight). One extra GET per
other mounted list per write, which is a list of a drive's Smart Folders (tens of rows).
No privacy change: the same data, same endpoint.

## Touch points

- `frontend/src/components/SmartFolderSaveButton.tsx`: `SmartFolderController` computes
  changed / saving, overwrites without the confirm dialog, exposes them through the
  context; `SmartFolderMenuItems` relabels and disables the row; a new exported button
  component for the chips row reads the same context.
- `frontend/src/components/search/SearchQueryHeader.tsx`: renders that button at the end
  of the chips row.
- `frontend/src/hooks/useSmartFolders.ts`: after a successful create / update / remove,
  tells the other instances in the tab for the same drive to refetch; a refetch started
  by that signal keeps the previous rows when it fails and does not toggle
  `loading` / `error`; only the latest-started fetch's response is applied.
- The new button renders nothing when there is no `SmartFolderController` above it or
  its context is `null` (empty query), so `ImageQueryViewPresenter.tsx`, the
  e2e-components fixture and the `SearchQueryHeader.*.test.tsx` files that render the
  header alone are unchanged.
- `frontend/e2e-components/` (fixture `fixtures/app.tsx` and a spec beside the
  `search-results-bar` cases): a new case renders the real `SearchQueryHeader` inside a
  real `SmartFolderController` in the Changed state, with the Smart Folder list request
  answered by the fixture, and measures it at 375px and 1280px.
- Tests that mock `@/components/SmartFolderSaveButton` (about twelve files under
  `frontend/src/**/__tests__/`) gain the new export; the 「更新」 / confirm-step
  assertions in `SmartFolderSaveButton.test.tsx` and `SearchPage.resultsBar.test.tsx`
  are rewritten to the new contract, not removed.
- `frontend/src/messages-core/ja.json`, `frontend/src/messages-core/en.json`:
  `smartFolder.update` → 「上書き保存」 / "Overwrite", a new accessible-name key,
  `updateConfirmTitle` / `updateConfirmMessage` removed.
- `docs/user-guide/search.md`: the "Saving as a Smart Folder" section.
- `DESIGN.md` §Page Header: the sentence listing what sits under the query field gains
  the 上書き保存 button at the row's end.
- Endpoint used, not changed: `PATCH /api/drives/{drive}/smart-folders/{id}`
  (`backend/app/routers/smart_folders.py`), table `smart_folders`.
- Rules passed through: `.claude/rules/frontend-conventions.md` (design system, i18n in
  `messages-core/`), `DESIGN.md` §Buttons and §2.2 (one accent fill: the button is
  secondary), `.claude/rules/design-decisions.md` (drive boundary).
- No protected path is edited.

## Invariants

I1. On a search page whose `smart_folder_id` names a loaded Smart Folder of the page's drive, the 上書き保存 button is shown exactly when the trimmed URL `q` differs from the folder's `query` or the URL `type` (absent = null) differs from its `file_type`; changing only sort, scene search or the Files / Passages switch, or typing in the field without submitting, does not show it.
I2. With no `smart_folder_id`, with the list's first load unfinished or failed, with an id that matches no folder of the drive, or with no `SmartFolderController` above the header, neither the button nor the 上書き保存 menu row is shown, and nothing throws.
I3. Pressing the button or the enabled menu row sends exactly one `PATCH /api/drives/{drive}/smart-folders/{id}` for the page's drive and that id, whose body is `{query: <trimmed URL q>, file_type: <URL type or null>}` as they were at the press and nothing else, without opening a dialog.
I4. After a successful overwrite the URL is the same as before the press; if the URL's `q` / `type` did not change during the request the button is gone and the menu row is disabled, and if they changed to something other than what was sent the button is still shown.
I5. After a failed overwrite the toast 「スマートフォルダの更新に失敗しました」 is shown and the button is still shown and enabled.
I6. While an overwrite is in flight the button and the menu row are disabled, so a second press sends no second request.
I7. The 上書き保存 menu row is disabled when the conditions equal the saved ones and enabled when they differ.
I8. After a successful create, overwrite, rename or delete made through one `useSmartFolders` instance, every other instance mounted in the same tab for the same drive fetches the list once and shows the server's list without a reload; the writing instance and an instance for another drive do not fetch, and a failed write notifies no one.
I9. When a refetch triggered by another instance's write fails, that instance keeps the rows it had and its `loading` / `error` never change during that refetch; when its first load or an explicit `refetch()` fails, it shows an empty list as today.
I12. Measured in a real browser in the Changed state, the button is the last item of the chips row with its right edge at the row's right edge at 1280px; at 375px it wraps below the chips when it does not fit, the page has no horizontal scroll, and the results bar keeps a single row.
I14. After a successful overwrite started from the focused button, the focused element is the results bar's `…` button, not `<body>`.
I13. When two fetches of one instance overlap, the list shown afterwards is the response of the later-started one.
I10. The `…` menu of an open Smart Folder lists 「保存済み: {name}」, 「上書き保存」 (lucide `Save` icon), 「名前変更」, 「削除」 in that order, and the button's accessible name is 「「{name}」に上書き保存」 with the folder's current name.
I11. When the open folder is deleted through another instance in the same tab, the page shows no button and no 上書き保存 row, offers 「スマートフォルダに保存」, and the URL is unchanged.

## Checked, no action

- **Saving the sort.** Neither create nor overwrite sends `sort_by` / `sort_order`, and
  opening a Smart Folder does not apply them. The user chose to leave sort out (option 3
  rejected); the user guide's claim that the sort is kept is removed instead.
- **"Save as a new Smart Folder" while one is open.** Not asked for; the request was to
  overwrite. Today the menu offers 「スマートフォルダに保存」 only when no folder is open.
- **Confirmation before overwrite.** Dropped by the user's decision: the button appears
  only when the conditions changed and its label states the action.
- **Comparing internal whitespace or operator order** (`a  b` vs `a b`, `tag:x a` vs
  `a tag:x`). Compared as trimmed strings; a reordered query with the same meaning shows
  the button, and overwriting it is harmless.
- **The video / reading / Photo Diary target menus** keep their own fetches; they read
  only the folder's id and conditions when they next load.
- **A success toast.** None exists for the row today; the button disappearing is the
  feedback.
- **Backend change.** None needed: PATCH already updates `query` and `file_type` and is
  drive-scoped.
