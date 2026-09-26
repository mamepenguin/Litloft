# R-0 invariants: stop arrow-key file navigation on PDF and EPUB

1. On a file detail page (two-pane RightPaneFile and FileDetailFullScreen) whose file is a PDF (`application/pdf`) or an EPUB (`application/epub+zip`), pressing ← or → on the page never calls onNavigate / changes the file.
2. The same keys pressed while focus is inside the EPUB reader iframe (inline) never change the file and never turn a page or move the book's position.
3. For every other non-media file (image, text, markdown, archive, office, other) ← / → still go to the previous / next file, exactly as before.
4. Video, audio and .loft pages keep ← / → for seeking; nothing about them changes.
5. The on-screen previous / next buttons (FileNavControls) still change file on PDF and EPUB pages, and still pass through the same navigate path (navigationGuard).
6. In full screen, ← / → still turn pages in the PDF viewer and the EPUB reader, following reading direction; `f` and `Esc` from inside the EPUB iframe still reach the page (open / close full screen).
7. The reader → page message channel accepts no key the page does not act on; a forged `{type:"key", key:"ArrowLeft"}` from the reader frame is dropped.
