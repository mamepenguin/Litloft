# R-0: EPUB reader controls PR-1 (feat/epub-reader-controls)

Approved by the user 2026-09-26.

1. Restore on open, a resize, and every `location` message write no WatchHistory.
2. A seek to a position after the start writes exactly one `turned`, with the start of the page shown.
3. A seek to a fraction in (0, 1) lands on the same page a fresh open at that fraction shows. (revised after r1: scoped to (0, 1); a seek onto the last page saves 1, which reopens at the start by design)
4. No href or markup from the book reaches the parent DOM; TOC labels render as text.
5. A book whose TOC is empty, image-only or has unresolvable entries opens.
6. Sanitizer and CSP policy unchanged.
7. Inline, the bar never changes height while reading (frame height stable across pages).

## Added after r1 (approved by the user)
8. In full screen the chrome stays up while the slider is dragged, and hides again normally once the drag ends — including a drag cut short by leaving full screen.
9. After a pointer release on the slider, the page-turn keys turn pages again.
10. In full screen, showing or hiding the chrome never re-lays out the book.

## Real-browser measurement (for 7, 10 and r1 F7)

Measured in the running app (Chromium at 375×667, 667×375 and 1280×800; WebKit
at 375×667; ja and en; a vertical novel and a horizontal technical book), with
six page turns inline and the full-screen chrome shown and then hidden:

- 7: one iframe box across every turn in every combination; bar height fixed.
- 10: the iframe box is the same with the chrome shown and hidden; the chrome
  hides after the idle delay.
- r1 F7: with the slider and the position line side by side, the chapter label
  was zero-width at 375 px in both languages and the English page count was
  clipped. Fixed in d3fb6cab3 by stacking the line under the slider; after it,
  nothing is clipped at any size.
- Not measured: whether a thumb drag on iOS / Android ends in `pointerup`
  (R-5, on a device).
