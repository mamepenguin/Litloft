# P2-6 media_import — Import from URL (R-0, approved by the supervisor)

1. The Add row is not drawn on a drive where the `url_import` policy has resolved to false, and it is not drawn when the drive's `index` policy is false (the catalogue drops the addon). While the policy is loading or on a policy fetch error, it is drawn.
2. The dialog's initial destination is exactly the `path` handed in by the Add menu. With `path=""` (Home / drive root) it is the drive root even when the smart-folder memory holds a folder. The dialog neither reads nor writes the smart-folder memory.
3. An import sends exactly one `POST /link` to the chosen destination. For a URL resolved as channel, playlist or feed, no subscription create/sync is sent; the dialog stays open, keeps the URL and destination, and points to Manage.
4. Pressing or typing inside the dialog does not close it or lose input (AddButton's DismissScrim must not treat a press in the portalled dialog as outside).
5. The first Escape closes only the dialog; the second closes the menu and focus returns to Add.
6. On an import failure the dialog stays open with an error and keeps URL and destination; it closes only on success.
7. The Manage page Composer's behaviour (smart-folder default, subscriptions, STT mode) is unchanged.
8. The row and dialog work from `drive` and `path` alone; `surface` and `fileIds` being present or absent changes nothing.

Out of scope: behaviour when the host does not pass `onDialogOpenChange` (core develop before #266).
4 and 5 need core with #266's fix (63da8e0c or later); round 1 did not measure them.

## Revised by the supervisor after r1

- 4 (added): if the row's display condition (policy) changes after the dialog was opened, the open dialog and its input remain, and `onDialogOpenChange` true/false calls stay balanced.
- 6 (added): after an error or the channel/playlist/feed notice, the user can submit again (the Import button returns to a pressable state).
