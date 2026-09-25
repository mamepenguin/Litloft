# R-0 invariants — feat/pdf-resume-page

1. Opening a PDF with no `?page=` and a stored page `p` with `2 <= p < n`
   shows page `p` once the document loads.
2. `?page=N` shows page N regardless of the stored page, and does not get
   overwritten by the restore.
3. A stored page `>= n` opens page 1 and leaves the stored record untouched
   until the reader turns a page.
4. Page 1 is never written (opening and staying on page 1 leaves the row at
   the view-only 0/0, so the PDF is not in Continue watching).
5. No save happens while the stored page is being read.
6. A page turned in the full-screen viewer is saved without closing it.
7. Switching to another file does not write the previous file's page to the
   new file id, nor restore the old file's page into the new one.
8. Video/audio progress behaviour is unchanged.

Added after review round 1 (approved by the user 2026-09-25):

9. The page the reader leaves the document on is saved (after the debounce,
   on unmount, or on file switch), including a turn made while the stored
   page was being read.
10. Opening with `?page=` writes nothing until the reader turns a page,
    including a `?page=` past the end.
11. Returning to a file in the same mounted viewer restores like a fresh open.
12. Reading in full screen does not add drawing work to the inline viewer.

Revised after review round 2 (user assigned C to the trajectory and chose to
rebuild on reader-turn events, 2026-09-25):

- 5 becomes: a page turned by the reader while the stored page is being read
  is saved and cancels the restore; nothing else is saved during the read.
- 10 extends to: changing `?page=` on the file already open writes nothing.
