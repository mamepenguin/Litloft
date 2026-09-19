# iOS system fullscreen — final round 1

Reviewed at `cee1ed16` (branch `feat/ios-system-fullscreen`), not `develop...HEAD`.
Commits in scope: `74565fcc`, `0ff2bad9`, `172d1c01` (reverts of phase 2), `6ccd2fd5` (inline marks), `cee1ed16` (docs).

Baseline: `EmbedFramesPageTests` (8), `EmbedFramesTests`, `ContractTests` all pass on iPhone 17 Pro Max simulator (`BE039A5E`, not the booted `4AB8B4E9`), derived data in a scratch directory.

## 1. Reverts

Verified, no finding:

- `git diff 087332ea HEAD -- ios frontend/src/lib` is byte-identical to `git diff 6ccd2fd5~1 6ccd2fd5 -- ios frontend/src/lib` (compared with `diff`; `IDENTICAL`).
- `git diff --stat 087332ea 172d1c01 -- . ':!docs'` lists only phase 3's four frontend files (`NativeSettingsRows.tsx`, its `index.ts` and test, and `VideoPlayerShell.test.tsx` +37). So after the reverts the code tree is exactly phase 1 + phase 3; nothing of `6fc6e6a9` / `cead9693` / `343f5b4c` remains and nothing of phase 1 or phase 3 was lost.
- Phase 3's tests in `VideoPlayerShell.test.tsx` ("offers the iOS player where there is no element fullscreen…", "does not offer the iOS player where the browser has element fullscreen") survive; only phase 2's two shell tests ("asks the shell to open the file in the iOS player", "does not offer the iOS player in a shell that cannot open it") are gone.
- No `media.fullscreen` identifier remains under `ios/` or `frontend/src`.
- Contract: `shell-contract.json` still has `"version": 3` and `commands.embedFullscreen = {type: "embed.fullscreen", videoId}`; `ShellMessage.embedFullscreen`, `ShellBridge` routing (`type == "embed.fullscreen"` gated by `EmbedFrames.isVideoId`) and `nativeBridge.requestEmbedFullscreen` are intact. `ContractTests` pass on iOS; `pnpm vitest run src/lib src/components/__tests__/VideoPlayerShell.test.tsx src/components/player` passes (87 files, 1287 tests).
- `ShellVideoPlayer.tsx` renders `NativeAutoplayToggle` / `SubtitleTrackOptions` only, not `NativeToggleButtons`, so phase 3's `VideoSystemFullscreenButton` does not reappear inside the shell after the revert.
- Submodule pointers: `git diff --submodule=short 087332ea HEAD -- addons` is empty.

## 2. `6ccd2fd5` against revised invariant 3

Paths measured in the simulator with temporary probe tests added to `EmbedFramesPageTests.swift` (removed afterwards). Each probe was also run against the parent script (`git show 6ccd2fd5~1:ios/Litloft/Bridge/EmbedFrames.swift`) where the comparison mattered.

| path | HEAD observation | parent observation |
|---|---|---|
| normal end, real WebKit exit (`closeAllMediaPresentations`, no synthetic event) | `marks-0` while shown, `left-marks-2` after exit — WebKit's own `webkitendfullscreen` does reach the shell's listener | marks never removed (`marks-2`) |
| refusal by throw (no metadata) | marks stay 2 (`refusedKeepsItsMarks`) | — |
| second request for the same video while it is already fullscreen | `state-playing-0` during, `left-marks-2` after exit: the second call records `inline = []`, its `restore` is a no-op, but the first call's `restore` is still registered and restores both marks | — |
| return state after real exit | `state-paused-2-t4.25` | `state-paused-2-t4.24` — the pause on exit is the simulator's `closeAllMediaPresentations`, not the missing marks; no difference observable here |
| request for a second embed while the first is fullscreen | see finding F1 | marks untouched on both |

Not measured: a video moved from the system player into picture in picture and then requested again. A probe that called `webkitSetPresentationMode("picture-in-picture")` in the simulator hung the test runner twice and was abandoned; this remains for the device.

### F1. A request that WebKit accepts without throwing but never presents leaves the video without its inline marks for good

- **Label:** [introduced] — the mark removal is new in `6ccd2fd5`; the same probe against the parent script leaves `marks-2` on both videos.
- **Severity:** medium (bucket A candidate: revised invariant 3, "must put them back when fullscreen ends or is refused").
- **Where:** `ios/Litloft/Bridge/EmbedFrames.swift:129-138`. Marks are removed before `webkitEnterFullscreen()`, and the only restore paths are a synchronous throw and `webkitendfullscreen`. A call that returns normally but does not present fires neither.
- **Reproduction (simulator, temporary probe):** two embeds on the page. Play `first`, ask for `first` to go fullscreen, wait for `webkitbeginfullscreen`, then ask for `second`. Close presentations with `closeAllMediaPresentations()` and wait 3 s. Events:
  `… fullscreen:first, marks-0:first, … mode-inline-0:second, mode-fullscreen-0:first, pm-inline-2:first, left-marks-2:first, mode-inline-0:second, mode-inline-2:first`.
  `second` never entered fullscreen (`webkitPresentationMode` stays `inline`, no `webkitbeginfullscreen`), the call did not throw, and `second` is left with 0 of 2 marks after everything has closed. `first` is restored correctly.
- **Effect:** on iPhone WebKit requires the `playsinline` attribute for inline playback, so that embed's next play goes to the system player instead of inline, in YouTube's own UI too, until the iframe is reloaded. Reaching it needs a second request while one video is already presented. The system player covers the page, so the likely route is picture in picture (unmeasured, see above) or any other state in which WebKit declines without throwing.
- **Partly self-healing (read from the code, not measured):** the unrefused `{ once: true }` listener stays on that video, so the next time it really leaves fullscreen — including the unintended fullscreen caused by the missing marks — `restore` runs and puts both marks back.
- **What would show a fix works:** the probe above ending with `mode-inline-2:second`.

### F2. No test holds that the marks stay off while the system player shows the video; restoring them the moment it begins passes everything

- **Label:** [introduced]
- **Severity:** low-medium. It breaks no R-0 line as worded (revised invariant 3 permits the removal and requires the restore), but it lets the change's whole purpose be undone silently.
- **Where:** `ios/LitloftTests/EmbedFramesPageTests.swift:228-242` (`inlineMarksComeBack`), against `ios/Litloft/Bridge/EmbedFrames.swift:138`.
- **Mutation M10:** `addEventListener("webkitendfullscreen", restore` → `addEventListener("webkitbeginfullscreen", restore`. `want=kill`, **survived** (EmbedFrames.swift recompiled; `inlineMarksComeBack` passed in 1.5 s).
- **Why it survives:** the fixture's own `webkitbeginfullscreen` listener is registered at page load, before the shell's, so it reads `marks-0` before the shell's listener runs. The marks are sampled only at that instant. The later `left-marks-2` is satisfied too, because they were already back.
- **Would kill it:** after `fullscreen:` arrives, post `marks` to the frame, as `refusedKeepsItsMarks` already does, and expect `marks-0`.

### F3. `restore` writes the marks back with an empty value and the fixture cannot tell whether only the original marks come back

- **Label:** [introduced]
- **Severity:** low (bucket B). No user-visible effect found. Both are boolean attributes and `video.playsInline` reflects presence only.
- **Where:** `ios/Litloft/Bridge/EmbedFrames.swift:129-130`.
- **Mutations:** M6 (`setAttribute(name, "false")`) survived, `want=live`. M9 (drop the `hasAttribute` filter, so both marks are removed and later *added* even when the video had only one or none) survived, `want=live`. The fixture video always carries both marks.
- Recorded for the ledger only.

### F4. Prose asserts unmeasured PiP behaviour that the device check contradicted

- **Label:** [introduced] on this branch (phase 1 docs and `6ccd2fd5`'s doc comment). Not `cee1ed16`, which only removes phase 2 text and is otherwise consistent with the code.
- **Severity:** low (prose, bucket B). Reported only because a reader would act on it: it says the `.loft` PiP-on-leave problem is solved.
- **Where:**
  - `docs/addons/media-import.md:106`: "Leaving the app from there moves it into the picture-in-picture window".
  - `docs/user-guide/ios-app.md:98-101`: the same claim.
  - `docs/developer-guide/known-issues.md:134-136`: "reaches picture in picture only through **Open in the iOS player**".
  - `ios/Litloft/Bridge/EmbedFrames.swift:120-122`: "so leaving the app can move it into picture in picture".
- **Evidence:** the brief's device finding says leaving the app from Litloft's button did not start PiP. Whether `6ccd2fd5` changes that is the user's next device check.
- **Remedy:** delete the leave-the-app sentences until the device check measures them. Do not reword them.

### F5. `CoordinatorTests/downloadFromALivePage` flakiness

- **Label:** [pre-existing]. Known and not in scope. Not run in this review.

## 3. Mutation table

Swift mutations are applied to `enterFullscreenScript` in `ios/Litloft/Bridge/EmbedFrames.swift`. Before each run a script checked that the target text occurred exactly once and replaced it. The run was `-only-testing:LitloftTests/SharedMediaState/EmbedFramesPageTests` on iPhone 17 Pro Max with scratch derived data, and the file was restored with `git checkout` after each run. Every run recompiled and executed; none failed to compile.

| id | mutation | want | result | killed by |
|---|---|---|---|---|
| M1 | drop `restore()` in `catch` | kill | killed | `refusedKeepsItsMarks` |
| M2 | drop the `webkitendfullscreen` listener | kill | killed | `inlineMarksComeBack` |
| M3 | drop `removeAttribute` | kill | killed | `inlineMarksComeBack` |
| M4 | only `playsinline` in the list | kill | killed | `inlineMarksComeBack` |
| M5 | drop `{ once: true }` | live | live | — (restore is idempotent) |
| M6 | restore with value `"false"` | live | live | — (F3) |
| M7 | remove the marks *after* `webkitEnterFullscreen()` | live | live | — whether order matters is the device question; no test can see it |
| M8 | `catch` returns `false` instead of rethrowing | live | live | — (only the log line differs) |
| M9 | drop the `hasAttribute` filter | live | live | — (F3) |
| M10 | restore on `webkitbeginfullscreen` instead of `webkitendfullscreen` | kill | **live** | — (**F2**) |
| M11 | `if (video.paused) return false;` before the marks | kill | killed | `requestReachesItsOwnFrame`, `frameMovedToAnotherVideo`, `inlineMarksComeBack` |
| M12 | `finally { restore(); }` (restore immediately after the call) | kill | killed | `inlineMarksComeBack` |
| FE1 | `NativeSettingsRows.tsx`: drop `\|\| typeof video.requestFullscreen === "function"` (phase 3 guard, checks the revert kept phase 3) | kill | killed | `NativeSettingsRows.test` "is not offered where the browser has element fullscreen", `VideoPlayerShell.test` "does not offer the iOS player where the browser has element fullscreen" |

`6ccd2fd5` changes no frontend code, so FE1 is the only frontend mutation.

**The synthetic `webkitendfullscreen` in `inlineMarksComeBack`.** Probe A dispatched no synthetic event. It played the video, entered fullscreen, then exited through `closeAllMediaPresentations()`. WebKit's own `webkitendfullscreen` reached the shell's listener in the content world (`left-marks-2`). So in the simulator the stand-in matches the real event. A mutation that listens under a name WebKit never fires would be killed either way. The gap in this test is F2, not the stand-in.

Probe caveat: `closeAllMediaPresentations()` did not exit fullscreen for a video that had never played (`mode-fullscreen-0` 5 s after the call). Probes that end a presentation therefore play the video first.

## 4. Trajectory (phase 1 `.loft` path)

The fix diffs, in order:

- `4785a8f2` creates the path: frame recording, plus `webkitEnterFullscreen` on request.
- `e18f88b8` adds **one guard**: the script checks its own location against scheme, host and path before acting. It also makes the provider injectable.
- `b235b72a` is tests only, plus the provider made visible. It adds no branch.
- `6ccd2fd5` adds **a state**, "marks removed", with two restore paths.

These do not form a run of rounds that each add handling for a case the round before missed. `e18f88b8` was a review fix. `b235b72a` added nothing to the code. `6ccd2fd5` is not a fix of the phase 1 design. It answers a new requirement from a device measurement: YouTube-UI fullscreen went to PiP on leave and Litloft's button did not. The user revised invariant 3 to allow it before it was written. So this is **a new requirement from a measurement, not the design being patched.**

Two things for the supervisor to watch:

- The requirement rests on an **unmeasured premise**: that the missing `playsinline` is what enables automatic PiP. If the device check says no, the remedy is to revert `6ccd2fd5`, not to patch it.
- F1 already shows a path the new state does not cover. Any fix for it adds a branch: a timeout, a presentation-mode check, or restoring when no `webkitbeginfullscreen` arrives. That would make two consecutive rounds that add a branch or state to this script, which `review-workflow.md` R-4 classes as a C. A shape that removes the state instead would converge. One such shape removes the marks only once `webkitbeginfullscreen` has fired. Whether that still gives PiP is also a device question.

## 5. Tree

After every mutation and probe, `git status --short` shows only this file (`?? docs/developer-guide/reviews/ios-system-fullscreen/final-round-1.md`). The temporary probe tests and all mutations were reverted with `git checkout`. The booted simulator `4AB8B4E9` was not used, and no docker command was run.

TOTAL: 5 findings
