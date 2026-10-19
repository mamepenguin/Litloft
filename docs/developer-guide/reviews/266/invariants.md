# PR #266 invariants (R-0)

Approved by the supervisor before round 1, with one revision folded in at
approval (Core rows' write destinations added to 3).

1. On Home, the Add menu's addon rows receive exactly
   `{ drive, path: "", surface: "home", fileIds: [], onRequestClose, onDialogOpenChange }`.
2. In Library, the addon rows receive `path` = the folder on screen (`""` at the
   drive root), `surface: "library"`, and `fileIds` as before.
3. Where Library draws no Add today (special views, search, a tag-filtered root)
   it still draws none. Which Core rows (upload files, upload folder, new folder,
   New Note) appear is unchanged on both hosts, **and so is where they write**:
   the drive root on Home, the folder on screen in Library. Add remains the only
   accent fill on Home.
4. When every addon row renders null, no separator is drawn (Home with
   intelligence's AI rows receiving `fileIds: []` is this case).
5. An `onRequestClose` or `onDialogOpenChange` inside `addonProps` never replaces
   the host's.
6. After `onDialogOpenChange(true)`, a press inside a dialog portalled to `body`
   does not close the menu, and the menu does not answer Escape. After
   `onDialogOpenChange(false)`, one Escape closes the menu and focus returns to
   Add. ("First Escape closes the dialog, second the menu" is measured as the
   composition of these two.)
7. If the menu closes without `onDialogOpenChange(false)` — through
   `onRequestClose`, or by pressing the trigger again — the next menu opened
   closes on an outside press and on Escape.
8. With only rows that never call `onDialogOpenChange` (intelligence's AI rows),
   an outside press and Escape close the menu as before.

## Revised by the supervisor after r1 (`266-r1.md`)

- **6, added:** reporting `onDialogOpenChange(true)` does not remount the rows;
  the row that reported stays the same mount.
- Not added: a way out of the menu when a row reports `true` and its dialog goes
  away without `false`. That is the row's defect; the trigger still closes the
  menu and 7 restores the next one. Recorded as B.
