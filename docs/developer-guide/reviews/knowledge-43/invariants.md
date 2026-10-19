# S2-16 knowledge — Clip web page row with a toast (R-0, approved by the supervisor)

Placement approved: option X. Job ids sent from the Add menu live in a module-scope set (`frontend/pendingClips.ts`); a `header-actions` entry that draws nothing (`ClipNotifier`) announces results and removes an id only when it shows that job's toast. Known weakness, not an invariant: a toast can be missed when core's `WebSocketProvider` replaces its single `lastEvent` before the notifier sees it, including while the notifier is unmounted (routes without a drive, `/files/{id}` before its metadata loads, a drive without knowledge).

1. The row is not drawn when the catalogue drops knowledge for the drive (`index` false). It is not gated on the `editor` policy.
2. The dialog's initial destination is exactly the Add menu's `path`; `path=""` is the drive root even when `knowledge:lastSubfolder:${drive}` is set. On every path (accepted, refused, duplicate) the dialog neither reads nor writes that key.
3. When the clip is accepted: exactly one `POST /clips` to the chosen subfolder, then `onDialogOpenChange(false)` and `onRequestClose` once each in that order; the dialog and menu close and nothing navigates.
4. When `POST /clips` fails: the dialog stays open with the error, keeps URL and destination, can be submitted again; the menu is not asked to close.
5. When the URL was clipped before: zero `POST /clips` until "Create new" (then as 3, to the chosen subfolder). "Open existing": zero `POST /clips`, one navigation to `/files/{latest file_id}`, menu closes. "Cancel": zero and zero, back to the menu.
6. For a job sent from this tab's Add row: its `ready` shows one success toast, its `failed` one error toast; one job never shows more than one toast in total, even if the notifier remounts. Events for other jobs (the Knowledge page's clips, other tabs) show no toast.
7. The Knowledge page's clip form is unchanged: remembered subfolder as default and written on success, the clip added to recent clips, the duplicate dialog, WebSocket status updates, and no toast.
8. Clips sent from the Add menu are not written to `knowledge:recentJobs:${drive}`.
9. Inside the Add menu, pressing or typing in the dialog does not close it; the first Escape closes only the dialog, the second the menu. If the row's display condition changes after opening, the dialog stays and `onDialogOpenChange` true/false stay balanced.
10. Row, dialog and notifier work from `drive` and `path` alone; `surface` and `fileIds` change nothing.

## Revised by the supervisor after r1

- 11. If the dialog is closed while `POST /clips` is pending, the late acceptance closes neither the menu nor any dialog opened since, and that job's result is still announced by a toast.
- 12. If a job's result arrives before its clip is accepted, the job still gets one toast as long as that event is still the provider's last event.
