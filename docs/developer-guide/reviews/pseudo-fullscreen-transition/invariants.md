# R-0 invariants — carrying the player frame into pseudo-fullscreen

Approved by the user 2026-09-25. PR #379.

1. After entry settles, the frame's rect equals the viewport, and `elementFromPoint` at the header, menu button, centre and bottom lands on the frame.
2. After exit settles, the frame's rect equals its rect before entry (same viewport), and no `data-player-fullscreen`, `data-pseudo-fullscreen` or `data-fullscreen-moving` remains.
3. On the first painted frame of entry, the frame's visible box — its rect after `transform`, inset by the `clip-path` values scaled by the transform — equals the inline rect within 1px, in portrait and in landscape. No frame is painted with the frame at viewport size and no transform.
4. While moving, `elementFromPoint` anywhere in the frame hits the shield (the frame itself), never a MediaControls element, the `<video>` or the iframe.
5. The `getBoundingClientRect().top` of the first element after the player's wrapper does not change on any painted frame of an entry or an exit, with and without a sibling row in the wrapper, and with reduced motion. *(Revised after r1, F1: previously "between inline and pinned".)*
6. With reduced motion, native fullscreen, a rotation entry or exit, or `ShellVideoPlayer`, a spy on `frame.animate` records zero calls, and `isFullscreen` and the markers change in the same commit as before this change.
7. After "use browser controls" (exit and unmount in one commit), `history.state` carries no fullscreen marker, and no marker or body style remains.
8. A second toggle during an exit leaves the frame pinned at viewport size once settled; Escape during an exit does not call `history.back()` a second time.
9. After an exit is turned around by a second press, Back closes fullscreen and does not leave the page. *(Added after r1, F2.)*
10. An exit that interrupts an entry never makes the frame grow: the drawn frame only shrinks from the moment of the exit. *(Added after r1, F3.)*
