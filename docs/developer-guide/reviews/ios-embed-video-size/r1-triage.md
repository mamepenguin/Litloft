# Round 1 triage

Reviewed at `99f214f16`: `r1-code.md` (7 findings) and `r1-security.md` (5 findings). Triaged by the author; the user approved the dispositions and the revision of invariant 7.

## Bucket A (closed by tests only; each mutation re-run and killed)

- code F1: the `embeds.onSize` wiring in `ShellBridge.init` was held by no test (removing it, or swapping width and height, left every suite green). `theBridgeDeliversWhatTheFramesReport` runs the real bridge and reads what reaches the page.
- code F2: the hook's effect cleanup was not held. A test renders for video A, re-renders for B, delivers A's size and expects nothing.
- security F1: not a defect of the change. It read invariant 7 as the unmerged addon commit `d80dc2a`, which no release contains and addon PR #31 (closed) proposed. Invariant 7 now says what #426's core does; see its Revisions.

## Bucket B

- code F3: `isMainFrame` was untested (pre-existing line, newly load-bearing). `mainFrameReportsNothing` loads an embed's address as the page itself and first waits until its video has a size, so it cannot pass vacuously.
- code F4: the page's `message.type` check; a test delivers a message of another type carrying the same fields.
- code F5: `count >= 1` replaced by a non-empty check plus every report being 64x36 for the right id. Telling `loadedmetadata` from `resize` is not held: the fake page fires both. Left.
- code F6: the early `return` after `onSize` is observably the same except for a duplicate frame registration. Left.
- security B2: no coalescing of repeated identical sizes. The worst case is self-inflicted load under the personal-tool premise. Left.
- security B3: two unmerged addon branches; PR #31 is closed.
- security B4: the 16384 cap is enforced in the shell only; the page compares width to height. Left.
- security B5: the addon comment restating the code is deleted.

## For the device check (R-5)

- code F7 (offered C, unverified): the page keeps the size of the last `<video>` that reports. A landscape ad inside a Short, or the reverse, could set the wrong request. Not checked: needs an ad.
- Press full screen before first play: nothing is asked (the picture is 0x0 until it loads).
