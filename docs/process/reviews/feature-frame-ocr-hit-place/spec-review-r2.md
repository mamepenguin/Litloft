# Spec review r2: docs/specs/frame-ocr-hit-place.md

Reviewed at commit 8969e1b8e. All resolved in f8bb2b245.

1. How core limits `pictureOverlay` to YouTube without naming a provider, and how it knows it is on the file page. Resolved: passed to every embed; drawing depends on find, `frame_size` and embed support (step 23, I9).
2. The embed poll rate conflicts with the shared `mediaClock`. Resolved: use the clock (250 ms playing, 1000 ms paused), lag accepted (step 19, item 10).
3. "Ended" is not observable for the embed. Resolved: `t < getDuration()` (step 16).
4. Stacking inside the embed in the Litloft-UI mode. Resolved: under its controls, gesture overlay and poster (step 22, I9).
5. Slot transitions incomplete. Resolved: crop is final; small-frame failure before crop goes to thumbnail and never crop (step 11, States, I4).
6. `t=0.000` races two seeks. Resolved: the initial current row does not seek; the player's landing stands (step 15, failure 6, I6).
7. Enter before the first answer. Resolved: the viewer's pending step wins (step 15, I6).
8. Browser Picture in Picture. Resolved: hidden while in PiP (step 16, I7).
9. Design artifact URL and `canvas.json`. Resolved: both cited and saved.
10. No real-browser measurement named. Resolved: `frontend/e2e-components/` (item 10).

TOTAL: 10 findings
