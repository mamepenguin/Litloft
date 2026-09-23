# R-0 invariants — feat/viewer-pinch-zoom (3f21bbcf)

1. At fit, touch swipe, edge tap/click, centre tap and the arrow keys behave exactly as at the parent in both ImageGallery and ArchiveImageViewer, in LTR and RTL, with spread off, split halves and pairs.
2. While zoomed, no touch swipe and no edge tap/click changes the page; the arrow keys and on-screen prev/next buttons still do.
3. A mouse drag never changes the page.
4. Any page change (keys, buttons, swipe, slideshow tick, split-half step) shows the new face at fit.
5. Panning never shows empty space inside the frame on an axis where the picture is larger than the frame, including a split half and a pair.
6. Ctrl/⌘ + wheel inside the viewer never zooms the browser page; a plain wheel at fit is left alone.
7. Chrome auto-hide, the centre-tap toggle, Escape-to-close and the slideshow behave as before.
8. A pinch never pages or toggles the chrome when the fingers lift, including when they lift one at a time.

## Revised after r1 (approved by the user)

9. Opening a viewer always starts at fit, including reopening the folder gallery after closing it zoomed.
10. A face that changes shape at the same position (single ⇄ pair ⇄ half, e.g. toggling spread) returns to fit.

Also decided with the user after r1: desktop Safari's trackpad pinch (WebKit gesture events) is supported in this PR; if it proves unworkable on a real Mac it is dropped rather than patched.
