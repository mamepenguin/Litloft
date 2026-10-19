# Phase 3 r1 triage

Approved by the user 2026-09-26.

| # | Bucket | Action |
|---|---|---|
| F1 | A | One guard at the top of the pseudo path: nothing happens when the hook has unmounted or another press already left "off". The `"opening"` check in `enter` became redundant and was removed. |
| F2 | A | Same guard. |
| F3–F6 | A | Tests with fake animations and ResizeObservers: release only after the carry back, a turned-around carry keeps the hold, the slot is measured after the widening, an earlier wait running out does not pin a re-entry. |
| F7 | A | The second-press test exits and checks the release. |
| F8 | R-0 revision | #379 item 6 ("`isFullscreen` and the markers change in the same commit as before") is read as holding outside a version-4 shell. In a version-4 shell the rotation entry and `ShellVideoPlayer` wait for the widening, as designed. |

Carried to Phase 4 (device only): when the widening's resize arrives, whether a second viewport change follows, whether the answer's size equals `clientWidth/Height`, whether the narrowing moves the slot, 60 fps, and item 9.
