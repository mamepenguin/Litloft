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

## After r3 (decided by the user)

r3 found the bar's release state being patched (a copied `scrubbing` with a
third exit, then a guessed `released` landing). The user assigned C and chose
the reshape: the reader answers every seek by id (`seeked`), the hook holds the
target until that answer and resets it with the book, and the bar keeps only
its live drag and is remade per book. The invariants are unchanged.

## After r4 (decided by the user)

Bucket A empty; the loop converged (the reshape removed a state and a
prediction). Finding 2 (a redundant test) was deleted. Finding 1 (no test sends
a seek while another runs, so answering with the wrong id survives) and the
noted unanswered-seek path are recorded here and closed.

## After r5 and the device check (approved by the user)

11. A touch, click or drag on the slider while it is disabled sends nothing.

r5 F1 prompted 11. On an iPhone, a drag that started away from the thumb
snapped back on release: the native range kept its own value under the finger
and sent it after the drag was committed. The fix removed that second writer:
the row takes every pointer and the input is keyboard-only. That also removed
r5 F2 (two seeks per release) and F4 (mouse and touch mapping apart). F3 and F5
were test gaps and got tests.

## After r6 (decided by the user)

Not assigned C: the user judged the row taking over from the native range as
converging on a finite custom slider. F1 and F5 came from the input's blur
commit, which only a pointer needed and which was removed; F2 came from the
press moving focus, now prevented. F4's hold tests now start the drag with a
pointer on the row. F3 (no test that the input takes no pointer) is closed on
the user's device check; jsdom does no hit testing.
