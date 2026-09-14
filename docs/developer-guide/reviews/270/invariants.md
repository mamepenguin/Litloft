# PR #270 invariants (R-0)

Approved by the supervisor before round 1, with 7 added at approval.

1. In a file's `[...]` menu, with the real `AddonSlot` and a `file-actions-menu`
   row that keeps its dialog in its own state: after the row calls
   `onDialogOpenChange(true)`, the row is the same mount and its dialog stays on
   screen.
2. While a row's dialog is up, a press inside that dialog (outside the menu)
   closes neither the dialog nor the menu.
3. With no dialog up, a press outside the menu closes it, and the click that press
   produces does not reach the element under it. Pressing the trigger while the
   menu is open closes it exactly once.
4. With no dialog up, Escape closes the menu and focus returns to the trigger.
   While a row's dialog is up, Escape does not close the menu.
5. A row's `onRequestClose` closes the menu and returns focus to the trigger. After
   the menu has closed by any path with a row's dialog reported open, the next
   opening of the menu closes on an outside press again.
6. Rename, Move, Move to Trash and Add to collection still close the menu and open
   their own dialog.
7. With knowledge's real `CreateNoteMenuItem` at the current pin: file `[...]` menu
   → **Create note** opens its dialog, the dialog stays on screen, and its fields
   accept input.
