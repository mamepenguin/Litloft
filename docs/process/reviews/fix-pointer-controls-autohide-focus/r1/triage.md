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
- frontend/e2e-components/controls-autohide-focus-desktop.spec.ts — full: Read the whole file.
- frontend/e2e-components/projects.ts — full: Read the whole file.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Read lines 130-189: the changed AT_THE_DESKTOP_WIDTH constant and the parity test that consumes it.
- frontend/src/components/player/MediaControls/CompactControlsPresenter.tsx — full: Read the whole file.
- frontend/src/components/player/MediaControls/PointerControlsPresenter.tsx — full: Read the whole file.

Test files:
- frontend/src/components/player/MediaControls/__tests__/PointerControlsPresenter.test.tsx — partial: Read lines 260-289: the changed auto-hide describe block.

## Unspecified behavior, recorded

- claude-read: A mouse click on a control-bar button followed by a keyboard shortcut press may make the focused button match :focus-visible and pin the bar visible again.
  - F3 × I3 = 9, claude-read: Triggered by clicking a bar button and then using Space/Arrow/M shortcuts while watching; the user sees the bar stay over the video until they click elsewhere.
  - F4 × I3 = 12, claude-verify: When the viewer clicks a bar button such as Play and then uses a keyboard shortcut (arrows to seek, M, Space), the focused button can turn :focus-visible and the bar stays on screen over playback until focus moves elsewhere.
- claude-read: While the bar is hidden by the idle timer, mouse-focused controls inside it no longer get pointer-events back, so the faded bar cannot be clicked through until the timer shows it again (previously focus-within restored pointer-events whenever a clicked control kept focus).
  - F5 × I1 = 5, claude-read: Triggered by idling after a click; moving the mouse re-shows the bar, so the user sees no practical difference.
  - F1 × I1 = 1, claude-verify: Once the idle timer has faded the bar, it ignores clicks even when a clicked control still has focus; in practice moving the mouse onto the frame re-shows it first, so the user rarely notices.

## Findings

A: 0
B: 1
C: 0

### claude-read:CR-1 — bucket B, LOW, open

Claim: After a mouse click on a control-bar button, any later keypress (the player's Space/Arrow/M/F/P shortcuts, which ShortcutsProvider handles and preventDefaults without moving focus) can make the still-focused clicked button match :focus-visible under the browser's keyboard-modality heuristic, so the bar is pinned visible again via has-[:focus-visible] — the very symptom this change targets, on a mixed mouse+keyboard path the new e2e test does not exercise.
Impact: A desktop viewer who clicks Play and then seeks or toggles with the keyboard shortcuts may find the control bar stays on top of the video until focus leaves the bar, the same as before the fix.
Evidence: frontend/src/components/player/MediaControls/PointerControlsPresenter.tsx:95 and CompactControlsPresenter.tsx:62 pin the bar on has-[:focus-visible]; frontend/src/components/player/hooks/useVideoShortcuts.ts:22-87 binds space/arrows/m/f/p globally; frontend/src/components/ShortcutsProvider.tsx:73-113 only skips INPUT/TEXTAREA/SELECT targets, so a focused BUTTON keeps focus while shortcuts fire; frontend/e2e-components/controls-autohide-focus-desktop.spec.ts:29-34 only checks click then idle, with no keypress between.
Repro: not_reproduced. Proposed check: in the new e2e spec, after play.click() press 'ArrowRight' (or 'm'), move the mouse off the frame and poll opacity for 0; if Chromium flips the focused Pause button to :focus-visible on the keypress, opacity stays 1.
Introduced: unverified
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add an e2e case that does click → shortcut keypress → idle and asserts opacity 0. If it fails, blur a mouse-activated control button after its click, or apply the has-[:focus-visible] override only when keyboard navigation moved focus into the bar.

</details>

## Not verified

- claude-read: Did not run the e2e or unit tests; I could not confirm that the new spec passes or that Chromium flips a mouse-focused button to :focus-visible after a keypress handled by a shortcut.
- claude-read: Did not check whether a mouse-clicked input[type=range] (SeekBar, VolumeSlider) matches :focus-visible in Chromium, which would pin the bar after a scrub.
- claude-read: Did not read the idle-timer/visibility hook that computes `visible`, or the peak-jump fixture arrangement itself.
- claude-read: Did not check Safari/Firefox behavior.
- claude-verify: Did not run Playwright or a real browser, so whether Chromium/WebKit marks the mouse-focused button :focus-visible after a preventDefaulted shortcut keydown is inferred from known browser behavior, not observed.
- claude-verify: Did not read the idle-timer and visibility hook to see whether keyboard shortcuts also re-arm visibility independently.
- claude-verify: Did not review TouchControlsPresenter.tsx beyond its grep match.

TOTAL: 1 findings
