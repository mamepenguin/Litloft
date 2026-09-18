# iOS shell Phase 2b — round 3

- Reviewed SHA: `b4f920189b2bc79c3bfe60145e2b2e798eac4b15`, in a detached worktree that did not move during the
  review. Round 2 saw `3e9b3745`; this round adds `89ec754e` (the round-2 record, prose only) and
  `b4f92018` (the round-2 fixes), which is the only change to code.
- Record read: round 1's findings file and round 2's, both under
  `docs/developer-guide/reviews/ios-shell-phase2b/`, with the user's triage of round 2 (1–6 are A, 7 is B);
  the invariants `2026-09-17-ios-native-video-invariants.md` (2b 1–10 plus 11–15 added after round 1, with
  the revision record) and `2026-09-16-ios-native-audio-invariants.md` (2a 1–17 with its four revisions); the
  spec `2026-09-17-ios-native-video.md` (§2 measurements, §3, "Checked, no action") and the plan;
  `CLAUDE.md`, `.claude/rules/review-workflow.md`, `comments.md`, `frontend-conventions.md`, and the
  watch-history part of `design-decisions.md`.
- Fix SHAs read with `git show`, in order: `c5682441`, `b18b6b13`, `03d43d84`, `f173a95c`, `f9c45d1e`,
  `3e9b3745`, `b4f92018`.
- Baseline before mutating, at `b4f92018`:
  - `xcodebuild test` (full scheme) → **TEST SUCCEEDED**, 196 test cases passed, 0 failed (193 at round 2).
    The three added are `scrollerFoundAfterTheDocumentScrolled`, `reportsWhatPictureInPictureSays` and
    `audioIsNeverOffered`. The Litloft server on `:3000` was only read.
  - `vitest run` over the nine suites this change touches (`shellSurface`, `vtt`, `nativeBridge`,
    `nativeMedia`, `useShellSurface`, `useShellCaptions`, `useMiniPlayer`, `VideoPlayerShell`,
    `AudioPlayer`) → **147 passed, 9 files** (125 over eight suites at round 2).
  - `tsc --noEmit` → clean. `eslint` over the four changed source files → clean.
  - `swiftlint lint --quiet` → clean.
- Mutations ran one at a time. Each replacement was confirmed to have changed the file before the run, and
  the file was restored with `git checkout --` after it. Nothing was fixed. The worktree finished clean.
- Every finding is in a file or a function these commits change, so each is `[introduced]` unless it says
  otherwise.

(sections below)
