# System fullscreen, phase 3, review round 1

Reviewed: `310af762` (not `develop...HEAD`). `7514dbfb` read for prose only.
Test command: `cd frontend && pnpm vitest run src/components/player/NativeSettingsRows src/components/__tests__/VideoPlayerShell.test.tsx src/components/__tests__/VideoPlayer*.test.tsx`
Baseline: 3 files, 44 tests, all green.

## Mutation table

| # | Mutation | want | result |
|---|---|---|---|
| M1 | `VideoSystemFullscreenButton`: drop `\|\| typeof video.requestFullscreen === "function"` | kill | killed ("is not offered where the browser has element fullscreen") |
| M2 | drop `typeof enter !== "function" \|\|` | kill | killed ("is not offered by a browser without the video's own fullscreen") |
| M3 | `enter.call(video)` -> `enter()` (loses `this`) | kill | killed ("hands the video to the system's player...", via `mock.contexts`) |
| M4 | remove the `try/catch` around `enter.call(video)` | kill | killed, but only by vitest's unhandled-error reporter (exit 1, "Errors 1 error"); all 44 tests pass. See finding 2 |
| M5 | remove `<VideoSystemFullscreenButton video={video} />` from `NativeToggleButtons` | kill | **survived** (44/44). See finding 1 |
| M6 | `VideoPlayer`: `isNativeShell()` -> `isNativeShell() && false` (shell renders the browser player, inv. 2) | kill | killed (14 failures in `VideoPlayerShell.test.tsx`) |
| M7 | drop `!video \|\|` guard | live | survived (equivalent: `enter` is already `undefined` when `video` is null) |
| M8 | test `document.requestFullscreen` instead of the element's | kill | killed (test 2 defines it on the element only) |

All mutations restored; `git diff` empty after each run.

## Findings

### 1. The button's place in the regular player's settings sheet is untested

- Label: [introduced]
- Severity: medium (bucket A: a test lets an invariant-8 violation through)
- File: `frontend/src/components/player/NativeSettingsRows/NativeSettingsRows.tsx:260`
- Mutation M5: deleting `<VideoSystemFullscreenButton video={video} />` from
  `NativeToggleButtons` leaves every test green (44/44). The unit tests render
  `VideoSystemFullscreenButton` directly; nothing renders `NativeToggleButtons`
  or `VideoPlayer` with an element that has `webkitEnterFullscreen` and no
  `requestFullscreen`, so the row can disappear from the iPhone browser / PWA
  sheet without a failure.
- Invariant: 8 ("In the browser and the PWA, the button puts the `<video>` into
  fullscreen"). Invariant 1's sheet-level half (desktop's `VideoPlayer` does not
  show it) is likewise held only at the unit level, though M1 covers the gate
  itself.
- Suggested hold: a `VideoPlayer.test.tsx` case that stubs
  `webkitEnterFullscreen` on `HTMLVideoElement.prototype` (and removes
  `requestFullscreen`), opens the settings sheet, and presses "Open in the iOS
  player"; plus the inverse with `requestFullscreen` present.

### 2. The refusal test's own assertions do not hold the `catch`

- Label: [introduced]
- Severity: low (bucket B: the suite still goes red)
- File: `frontend/src/components/player/NativeSettingsRows/__tests__/NativeSettingsRows.test.tsx:70-83`
- Mutation M4: removing the `try/catch` leaves both
  `expect(() => fireEvent.click(button()!)).not.toThrow()` and
  `expect(button()).not.toBeNull()` passing. React reports a handler exception
  through the window error path, so `fireEvent.click` never throws and the button
  stays mounted. The run fails only because vitest counts the uncaught
  `InvalidStateError` as an unhandled error (exit 1, "Tests 44 passed", "Errors 1
  error"). A setup that swallows window errors (e.g. an `onerror` handler in a
  future test setup) would let the mutation live. Not user-reachable today.

## Other paths checked (no finding)

- **Shell (inv. 2):** `VideoPlayer` routes `isNativeShell()` to
  `ShellVideoPlayer`, which does not render `NativeToggleButtons`; M6 shows the
  routing is held. A shell below `REQUIRED_SHELL_VERSION` is not
  `isNativeShell()` and gets the browser player, i.e. the browser behaviour.
- **Browser-controls mode:** `LitloftVideoControls` is not mounted when
  `playerUi === "browser"`, so the row is absent; the native bar keeps its own
  fullscreen.
- **Audio player:** does not use `NativeToggleButtons`.
- **Mini player:** `MiniPlayerContainer` hosts the same `FilePreview` ->
  `VideoPlayer`; no separate settings rows.
- **iPad Safari:** the gate (`video.requestFullscreen`, inherited from
  `Element.prototype`) is the same test `useFullscreen` uses for native vs
  pseudo fullscreen, so an iPad that has element fullscreen gets neither the
  button nor pseudo-fullscreen, consistent with invariant 1.
- **Return state (inv. 8, second half):** `createNativeVideoController` reads
  `currentTime` / `paused` from the element on every call and `playing` follows
  the element's `play` / `pause` events; the change adds no state to go stale.
  No test simulates `webkitendfullscreen`; not mutable within this commit.
- **Prose (`7514dbfb`):** nothing that contradicts the code in a way that would
  lead to a wrong change.

## Is anything missing from the R-0 list for this phase?

- Invariant 4 (on return, position and play/pause match and watch history keeps
  saving without rewinding) is scoped by the phase list to the shell, but it
  applies equally to the browser `<video>`: `usePlaybackProgress` must not
  re-run its resume seek when iOS hands the element back. Worth declaring for
  phase 3 as well.
- Unmeasured, device-only: rotating to landscape inside the iOS player while
  playing may trigger `useFullscreen`'s auto-rotate into pseudo-fullscreen
  underneath it, so the viewer returns to a pinned frame. Not an invariant
  break as written; listed for the user's R-5 run.

TOTAL: 2 findings
