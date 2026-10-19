# R-0 invariants — fix/archive-viewer-portal (8ebe48a2)

1. At phone widths (`[data-sheet-snap]` active), an open ArchiveImageViewer paints over the app header, the file-detail chrome row and the sheet's resting strip; its top bar is visible and pressable.
2. At every width the viewer covers the whole viewport, not the column or the player box.
3. While open, everything outside the viewer is inert and body scroll is locked; on close both are restored and focus returns to what had it.
4. Closing the viewer (close button, Escape, leaving the archive) leaves no viewer node behind in `document.body`.
5. Viewer controls (prev/next, spread, reading direction, slideshow, download, close) and its keyboard shortcuts behave as before.
