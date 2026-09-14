# knowledge #45 — invariants (R-0)

Approved by the supervisor (video-share-38) on 2026-09-14.

1. `CreateNoteDialog` is drawn with `createPortal` into `useDialogPortalTarget()`'s target, never inside FileActions' `role=menu` box.
2. Opening calls `onDialogOpenChange(true)` once. Closing, by cancel or by create, calls `onDialogOpenChange(false)` and then `onRequestClose`, as it does today. The call sequence is tested for an exact match.
3. While the dialog is closed, nothing is drawn in the portal target.
4. When the editor policy is off, the row is not shown (unchanged).

Recorded, not changed: if the policy resolves to off after the dialog opened, the item returns null and the open dialog disappears with it.
