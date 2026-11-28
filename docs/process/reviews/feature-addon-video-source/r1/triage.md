# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/server-routes.js — full: Read the whole file (22 lines), plus the isStreamPath call site in server.js.
- frontend/src/components/VideoPlayer.tsx — full: Read the whole file (333 lines), plus usePlaybackProgress in lib/playbackProgress.ts and the ShellVideoPlayer signature.

Test files:
- frontend/src/__tests__/server-routes.test.ts — full: Read the whole file.
- frontend/src/components/__tests__/VideoPlayer.src.test.tsx — full: A new file. Its whole content is in the provided diff, and I read it there.

## Unspecified behavior, recorded

- claude-read: Inside the native shell without src, an onError prop is forwarded to ShellVideoPlayer, which ignores it, so it is never called.
  - F0 × I2 = 0, claude-read: No caller passes onError without src today. An addon always passes src, so nobody sees a silent drop in ordinary use.
  - F1 × I2 = 2, claude-verify: It needs a caller that passes onError without src inside the iOS shell. The documented addon pattern (ADDON-DEVELOPMENT.md:1402-1404) always passes both, so this rarely happens, and when it does a playback error just isn't reported to the caller.
- claude-read: On a src change under the same videoId, in a real browser the old controller's teardown save reads the new element's reset currentTime (0), so the last up-to-5 s of progress on the old source is not written.
  - F0 × I2 = 0, claude-read: The spec states no caller changes src under one videoId, so this needs use that does not occur.
  - F1 × I3 = 3, claude-verify: It needs an addon to swap src while the same video stays open, which is rare. The user then loses at most the last few seconds of resume position on the old source.
- claude-read: A whitespace-only src string is truthy, so it is used as the element source and selects the browser player inside the shell, instead of falling back like "".
  - F0 × I2 = 0, claude-read: Only a malformed caller-supplied src triggers it, which is outside ordinary first-party use.
  - F0 × I3 = 0, claude-verify: Only a first-party addon author's own bug passes a whitespace-only src, which is outside ordinary use. The player then shows a broken source instead of falling back.

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The I3b tests' check that no position from the new element is saved before the reseek, `expect(savedAfter.map(call => call[1])).not.toContain(0)`, can never fail, because `write` is never called with 0.
Impact: The I3b clause 'never saves a position read from the new element before that' has no working test. A regression that saved a stale or new-element position after a src change would pass the suite.
Evidence: frontend/src/components/__tests__/VideoPlayer.src.test.tsx (I3b block, both tests) asserts only that 0 is absent. frontend/src/lib/playbackProgress.ts:105, :191 and :269 call `write` only after the `usable()` check (`value > 0`), so 0 cannot appear in saveProgress calls at all. In jsdom the old controller's teardown (playbackProgress.ts:264-275) reads currentTime 30 from the same reused <video> after its src changed and writes 30. The assertion accepts that.
Repro: Mutation in my head: make the new controller's first onTick write `mc.getCurrentTime()` without checking resumePending or the interval gate. That saves 30 (test 1) or 0→skipped, and the assertion `not.toContain(0)` still passes. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Assert on the exact saveProgress calls after the new controller is handed out, for example that none of them carry the pre-change position (30) or any position other than the reseek target. Alternatively, reset currentTime to 0 and duration to NaN on src change in the test, as a real load does, and assert no save before the seek.

</details>

### claude-read:F2 — bucket B, INFO, open

Claim: The I5 clause 'a request to a matching path is sent to backendProxy whatever its query string' has no test. Only `isStreamPath` on bare pathnames is tested, and the query stripping in server.js is not exercised.
Impact: If server.js stopped passing only the pathname, for example by passing req.url, addon streams with a query such as `?v=` would silently take the stalling Next.js rewrite. No test would fail.
Evidence: frontend/src/__tests__/server-routes.test.ts:5-34 tests pathnames only. frontend/server.js:61 and :72 strip the query with `new URL(req.url).pathname` and route on it. server.js has no unit test and is unchanged by this diff.
Repro: not_reproduced
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Real browser behavior on a src change on the same <video> (load algorithm reset of currentTime and default playback start position relative to the seek from the new controller).
- claude-read: Whether React attaches a non-delegated error listener to <track> and synthetically bubbles it to the parent <video>'s onError in the React version used.
- claude-read: The contents of commit 86114c664 itself, as opposed to the branch diff (I cannot run git). I reviewed the provided diff and the files at HEAD.
- claude-read: Tests were not run.
- claude-read: iOS shell playback through the web player.
- claude-verify: I did not run the test suite; all conclusions come from static reading.
- claude-verify: I did not check real-browser currentTime reset behaviour on a src change.
- claude-verify: I did not read backend/app/routers/addon_proxy.py or design-decisions.md.

TOTAL: 2 findings
