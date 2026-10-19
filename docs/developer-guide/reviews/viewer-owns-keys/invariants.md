# R-0 invariants — fix/viewer-owns-keys (5e148791)

1. While a full-screen image, archive or PDF viewer is open, no shortcut context of a lower priority fires — Cmd/Ctrl+K and Cmd/Ctrl+Shift+F (search), n (quick note), Cmd/Ctrl+\ (inspector), the file arrows — and none is listed in the `?` cheat sheet.
2. Every key the viewer itself binds (arrows, PageUp/PageDown, Esc, Space, f, = - 0 +) still works, as before.
3. A panel opened inside a viewer (the slideshow interval panel) still owns Escape over the viewer.
4. When the viewer closes, every blocked context works again.
5. With no viewer open, shortcut dispatch and the cheat sheet order are exactly as before.
6. `?` still opens and closes the cheat sheet while a viewer is open.

## Revised after r1 (author proposal from the reviewer's answer; to be confirmed by the user)

7. A mounted but closed ImageGallery blocks nothing.
Out of scope: the phone player's pinned full-screen frame (r1 F4) stays at priority 0 and blocks nothing; it is not one of the three viewers this change covers.
