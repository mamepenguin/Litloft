# P2-5 knowledge — New note and Clip web page rows (R-0, approved by the supervisor)

Measured feature names: knowledge recognises only `editor` and `index` (docs/addons/knowledge.md, "Per-drive policy"). New note is gated on `editor`; Clip web page has no feature key and is gated only by the catalogue (`index`).

1. New note is not drawn once the drive's `editor` policy resolves to false; drawn while loading and on a policy error. Neither row is drawn when the catalogue drops knowledge for the drive (`index` false). Clip web page is not gated on `editor`.
2. New note creates nothing until the dialog is confirmed: cancel or Escape sends zero create requests.
3. On confirm, exactly one create request for the chosen folder/filename; on success exactly one navigation to `/files/{created id}?edit=1`. On failure the dialog stays open with an error and does not navigate.
4. Both dialogs start at exactly the Add menu's `path`; `path=""` is the drive root even when `knowledge:lastSubfolder:${drive}` is set. Neither dialog reads or writes that key.
5. The Knowledge page's own clip form still starts at the remembered subfolder and writes it on success.
6. A clip sends exactly one `POST /clips` to the chosen subfolder. When the URL was clipped before, no `POST /clips` is sent until "Create new"; "Open existing" sends zero `POST /clips` and navigates once; "Cancel" sends zero and navigates zero times.
7. Pressing or typing inside either dialog does not close it; the first Escape closes only the dialog, the second closes the menu (needs core 63da8e0c or later).
8. The file-scoped "Create note" row (file-actions-menu) keeps its behaviour and destination.
9. The rows and dialogs work from `drive` and `path` alone; `surface` and `fileIds` change nothing.
10'. After `POST /clips` is accepted, while the dialog is open: its own job's `knowledge.clip.ready` navigates once to `/files/{file_id}`; its own job's `knowledge.clip.failed` shows the error and keeps URL and subfolder with the dialog open; another job's event does nothing.
11'. A clip sent from the Add menu is not written to `knowledge:recentJobs:${drive}`.
12'. While fetching, the dialog can be closed; closing is not an error and does not resend `POST /clips`. The "closing does not stop it" line is visible for the whole fetching state.

## Revised by the supervisor after P2-6 r1 (applied to P2-5 before its first round)

- 7 (added): if New note's display condition (`editor` policy) changes after its dialog was opened, the open dialog and its input remain, and `onDialogOpenChange` true/false calls stay balanced.
- 3 / 10' (added): after a New note creation failure, and after a clip failure, the user can submit again.

## Revised by the supervisor after r1: clip row removed from this change

The Clip web page row, its dialog, the ClipForm extraction and the dashboard's subfolder-memory move are out of this change (kept on branch `feat/add-menu-clip-row`, 4922724a). Items 5, 6, 10', 11', 12' and the clip half of 1, 3/10' (revision), 4 and 7 no longer apply. What remains:

1. New note is not drawn once the drive's `editor` policy resolves to false; drawn while loading and on a policy error; not drawn when the catalogue drops knowledge (`index` false).
2. New note creates nothing until confirmed: cancel or Escape sends zero create requests.
3. On confirm, exactly one create request for the chosen folder/filename; on success exactly one navigation to `/files/{created id}?edit=1`. On failure the dialog stays open with an error, does not navigate, and the user can submit again.
4. The dialog starts at exactly the Add menu's `path`; `path=""` is the drive root.
7. Pressing or typing inside the dialog does not close it; the first Escape closes only the dialog, the second closes the menu. If the `editor` policy changes after the dialog opened, the dialog and its input remain and `onDialogOpenChange` true/false stay balanced.
8. The file-scoped "Create note" row (file-actions-menu) keeps its behaviour and destination.
9. The row and dialog work from `drive` and `path` alone.
13. The Knowledge page's code and behaviour are identical to the pinned knowledge commit `07c59e5e`.
