# R-0 invariants — hiding the status bar while a viewer is full screen in the iOS shell

Approved by the user 2026-09-25.

1. In a shell below contract version 4 and in a browser, no full-screen surface waits before opening.
2. The shell is immersive exactly while at least one pseudo-fullscreen session or viewer is open; closing the last one brings the status bar back and returns the web view to `.bottom`. Element or OS fullscreen never makes it immersive.
3. A main-frame commit or a WebContent termination leaves the shell non-immersive; an SPA navigation or a download does not.
4. Toggling immersive never recreates the web view or reloads the page.
5. Manual pseudo-fullscreen in the shell records its entry box after the widening and releases immersive only after the frame is back in its slot; entering and then exiting animates both ways.
6. Exit, a second press, rotation or unmount during `"opening"` leaves no pinned frame, no history entry and no immersive hold.
7. While immersive, no viewer control overlaps the status-bar area.
8. The page behind a viewer does not move on screen across the widening and the narrowing, in portrait and landscape.
9. The shell native video covers its frame after the widening and after the narrowing.
10. After the last `page.immersive` request, the shell sends a `page.immersive.applied` for that final state carrying the web view's size after its layout — never a pre-layout size, and never nothing, in portrait and landscape. *(Added after Phase 1 r1, F1/F2.)*
