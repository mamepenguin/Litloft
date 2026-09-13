# PR #268 invariants (R-0)

Approved by the supervisor before round 1, with one clause added to 4 at approval.

1. No screen's Add menu shows more than one row naming itself New note / New Note
   / New File at a time. On a drive where knowledge's `editor` policy has settled
   to false, zero; on a drive where knowledge's `index` is false (absent from the
   catalogue), zero.
2. In a core-only setup (no addon declares `folder-actions-menu`), Add holds the
   two upload rows plus New Folder (Library only) and no separator. Home keeps
   only the two upload rows.
3. On a drive where media_import's `index` is false, Import from URL is not
   offered; nor where `url_import` has settled to false.
4. With the real AddButton and the bumped real rows (New note, Import from URL):
   pressing a row opens its dialog and the row stays the same mount; a press
   inside the dialog leaves both menu and dialog; **while the dialog is open, one
   Escape closes only the dialog and the menu stays**; after the dialog closes,
   one Escape closes the menu and focus returns to Add.
5. The destination a row writes to is the place the screen names: the drive root
   (`""`) on Home, the folder on screen in Library — for both New note's default
   folder and Import from URL's default destination, and for Import from URL the
   Add `path` wins over the smart-folder memory.
6. The tree pane's "New file here", Ctrl+N, and the empty folder's New note still
   create a file through Core's `createFile` and open the editor at `?edit=1`.
7. `git diff --submodule=short addons/` shows only knowledge (→ 8f625f4e) and
   media_import (→ 09a44073); intelligence does not move.

## Revised by the supervisor after r1 (`268-r1.md`)

- **5, added:** a folder chosen again inside a row's dialog is the one written to
  (New note and Import from URL). The New note half is held by a knowledge-side
  test that follows in the next knowledge bump; the code at `18492e45` is correct.
