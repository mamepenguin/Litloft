# Code review r2 — ios-embed-video-size (core 99f214f16, addon 6cba254)

Baseline: vitest (embedVideoSize + YouTubeEmbedPlayer) 59 passed, `pnpm tsc --noEmit` clean; iOS ContractTests/EmbedFramesTests/EmbedFramesPageTests TEST SUCCEEDED, new tests confirmed in the run list (embedSize, sizeIsValidated, sizeIsReported, blankReportsNothing, foreignFrameReportsNothing x2).

## 1. First-round question: places the diff reaches that are not in the touch-point list

- `ShellBridge.init` now wires `embeds.onSize` -> `deliver(EmbedSize)`. The only link between the frame handler and the page. Not listed. Candidate invariant: "a size reported by a judged frame reaches the page as embed.size for that video id with width/height unswapped". No test holds it (finding 1).
- The shared receiver `window.__litloft` and its `listeners` set (`subscribeToShell`): every mounted YouTubeEmbed now adds a listener, and unmount/videoId-change must remove it. Candidate: "a listener for a previous videoId does not write into the current one" (finding 2).
- `shell-contract.json` (shared fixture) gains `reports.embedSize`; `ContractTests.everyReportIsCovered` pins the set. Held.
- `EmbedFrames.userContentController`: size messages return before `frames[videoId] = frame`, so size reports do not (re)register the frame used by `embed.fullscreen`. Candidate: "a size report leaves the frame registry untouched" (I2 live, finding 6).
- `useFullscreen`'s `isLandscape` path from #426 (`holdImmersive({landscape})`) gains a second caller. Covered by the new YouTubeEmbed tests.
- The injected script now runs code in every frame of every page, not just provider frames (document-level capture listeners); the handler judges the frame, so only cost, not trust. No finding.

## 2. Mutation table

Frontend (vitest, run on embedVideoSize.test.ts + YouTubeEmbedPlayer.test.tsx)

| id | target | want | observed | verdict |
|---|---|---|---|---|
| F1 | drop `message.type !== "embed.size"` | kill | LIVE | gap (finding 4) |
| F2 | drop `videoId` equality | kill | KILLED (2 tests) | ok |
| F3 | positive(): drop isFinite | live (Infinity>0 true, shell caps at 16384) | LIVE | intended |
| F4 | positive(): drop `> 0` | kill | KILLED | ok |
| F5 | positive(): drop typeof number | live (isFinite rejects strings) | LIVE | equivalent |
| F6 | drop `size.current = null` reset | kill | KILLED | ok |
| F7 | drop effect cleanup (return subscribe) | kill | LIVE | gap (finding 2); a throwaway test "rerender to other id, deliver old id's size, expect null" passes with cleanup and FAILS without it |
| F8 | drop height check / drop width check | kill | KILLED / KILLED | ok |
| F9 | unstable getter (no useCallback) | kill | KILLED | ok |
| F10 | drop `videoId === null` guard | live (null never equals a string id) | LIVE | equivalent |
| A1 | addon `>=` | kill | KILLED (square) | ok |
| A2 | addon flipped comparison | kill | KILLED | ok |
| A3 | drop `size !== null` | kill | KILLED | ok |
| A4 | always true | kill | KILLED | ok |
| A5 | `useEmbedVideoSize(null)` | kill | KILLED | ok |

iOS (xcodebuild, the three suites)

| id | target | want | observed | verdict |
|---|---|---|---|---|
| I1 | size delivered before the frame is judged (fallback id) | kill | KILLED by foreignFrameReportsNothing (both addresses path) | ok |
| I1b | handler passes `isMainFrame: false` | kill | LIVE | gap (finding 3) |
| I2 | drop `return` after onSize | live | LIVE | intended (finding 6) |
| I3a-d | `>=0` on w/h; `<max` on w/h | kill | KILLED x4 (sizeIsValidated) | ok |
| I3e/f | drop width max / height max | kill | KILLED x2 | ok |
| I3g | drop isFinite | live (NaN fails >0, Inf fails <=max) | LIVE | equivalent, isFinite is redundant |
| I3h | drop bool rejection | kill | KILLED | ok |
| I3i | height read from "w" | kill | KILLED (unit + page) | ok |
| I4a | capture flag true -> false | kill | KILLED (sizeIsReported) | ok |
| I4b | drop `loadedmetadata` | want live (test cannot tell) | LIVE | finding 5 |
| I4c | drop `resize` | want live | LIVE | finding 5 |
| I4d | drop `instanceof HTMLVideoElement` | live (audio has no videoWidth) | LIVE | equivalent |
| I4e | drop `videoWidth > 0` in script | live (Swift rejects 0) | LIVE | equivalent; blank test holds only the pair |
| I4f | script posts swapped w/h | kill | KILLED | ok |
| I5 | delete `embeds.onSize = ...` in ShellBridge.init | kill | LIVE | finding 1 |
| I5b | bridge swaps width/height | kill | LIVE | finding 1 |
| I6a | EmbedSize type string | kill | KILLED (embedSize) | ok |
| I6b | EmbedSize width/height keys swapped (last occurrence; first attempt hit ImmersiveApplied) | kill | KILLED (embedSize) | ok |

Tree restored after every mutation; final `git status --short`: ` M addons/media_import`, `?? ios/Design/`, `?? scratchpad/`; submodule on feat/loft-landscape-from-the-embed-size at 6cba254.

## 3. Findings

1. [A][introduced] The production wiring from handler to page is not held by any test. Deleting `embeds.onSize = { ... deliver(EmbedSize(...)) }` from `ShellBridge.init` (I5) and swapping width/height inside it (I5b) both leave all three suites green. `EmbedFramesPageTests.Page.init` overwrites `bridge.embeds.onSize` with its own recorder right after building the bridge, so the page tests never exercise the bridge's closure, and ContractTests only encodes a hand-built `EmbedSize`. Result: with the wiring gone no `.loft` ever asks for landscape (invariant 1 silently degrades to "always portrait") and every check passes. Fix direction (not done): assert on what the web view receives (or the bridge's outgoing sent message) rather than replacing the callback.
2. [A][introduced] Stale subscriber on videoId change: with the cleanup removed (F7) a size reported for the previous video id is written into the ref now serving the new id (invariant 4). Reproduced with a throwaway test (render with id A, rerender with id B, deliver A's size, expect null): passes with the cleanup, fails without it; the committed suite passes either way. Whether a mounted YouTubeEmbed's `videoId` can change in place (url prop change) is unverified; the hook contract allows it and the committed test "forgets the size when asked about another video" does not cover the listener.
3. [B][pre-existing line, newly load-bearing] `isMainFrame: frame.isMainFrame` in `userContentController` is not held (I1b LIVE): only the pure `videoId(...)` function is tested for the main-frame case, no test sends a size from a main frame. Parent has the same line (`git show 8c11e7026:ios/Litloft/Bridge/EmbedFrames.swift`), but it now also gates delivery to the page.
4. [B][introduced] The page does not hold `message.type` (F1 LIVE): another message type carrying `videoId/width/height` would be applied as a size. No such type exists today.
5. [B][introduced] No test tells `loadedmetadata` from `resize` (I4b, I4c LIVE); the fake mp4 fires both. The `resize` path (size changing after first load) is untested. Also `sizeIsReported` asserts `page.sizes.count >= 1`, which review-workflow detector rule 1 says to avoid for enumerating assertions.
6. [B][introduced] Non-size bodies (any dictionary failing validation) fall through to the announce branch and register the frame (`frames[videoId] = frame`), the same effect as the `null` announce, so no new capability; but a valid size now deliberately skips registration (I2 LIVE), and no test holds either side. Offer: if "a size report leaves the frame registry untouched" is wanted as an invariant, it needs a test; otherwise leave.
7. [B/C offer][introduced, unverified] The reported size is the last one any `<video>` in the YouTube frame reports. A landscape pre-roll ad inside a portrait Short (or the reverse) would be reported through the same `resize`/`loadedmetadata` listener and could set the orientation request for the wrong picture. Cannot be backed by code or measurement here (no ad playback in tests); raised only as a design question for the supervisor.

TOTAL: 7 findings
