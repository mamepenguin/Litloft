# R-0 invariants — Copy file ID (approved with the spec, 2026-09-25)

1. Choosing Copy ID never touches the file clipboard: ClipboardProvider copy/cut are not called and no paste banner appears.
2. When navigator.clipboard.writeText resolves, the written text is exactly file.id and no dialog opens; a success toast shows.
3. When navigator.clipboard is absent or rejects and execCommand("copy") returns true, a success toast shows and no dialog opens.
4. When both fail, a dialog opens whose input value is exactly file.id, fully selected, read-only.
5. The off-screen textarea used for the fallback is removed from the DOM on every path, including a throw, and focus returns to the element that had it.
6. The row is present and enabled for a missing file; its position is the same in FileActions (file page "…") and FileContextMenu (card/list right-click).
7. copyText never throws.

## Revision after round 1 (approved by the user, 2026-09-25)

8. The dialog closes from every surface (FileActions and FileContextMenu) by Esc, the backdrop and the Close / X buttons. (from r1 F3)
9. When the dialog opens, the id input has focus, not only a selection range. (from r1 F2)
