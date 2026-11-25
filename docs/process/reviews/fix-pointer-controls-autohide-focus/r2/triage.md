# Triage: r2

## Trajectory

This run:
- claude-read: Yes, the design is being patched one control at a time. 9e5949876 added a branch to ControlButton: a click with detail > 0 while the button is focused blurs it. This guesses pointer versus keyboard input from event.detail. acf56fdf1 moved that check into releasePointerFocus and added the same blur to SeekBar and VolumeSlider, guessing pointer input there from onPointerUp. So each round adds the same pointer-versus-keyboard guess to another kind of control, while the bar-level rule (has-[:focus-visible]) stays the same. acf56fdf1 also removed nothing: it dropped the inline activeElement check from ControlButton but kept it inside the helper. bfdc7a15d changes docs only. Because of this per-control approach, any focusable element added to the bar later must opt in, and VolumeSlider's opt-in has no pointer capture, which SeekBar's has (CR-2).

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
- frontend/e2e-components/spec-viewport.spec.ts — partial: Read lines 140-194: the changed AT_THE_DESKTOP_WIDTH entry and the parity test that consumes it.
- frontend/src/components/player/MediaControls/CompactControlsPresenter.tsx — full: Read the whole file.
- frontend/src/components/player/MediaControls/PointerControlsPresenter.tsx — full: Read the whole file.
- frontend/src/components/player/MediaControls/parts/ControlButton.tsx — full: Read the whole file.
- frontend/src/components/player/MediaControls/parts/SeekBar.tsx — full: Read the whole file.
- frontend/src/components/player/MediaControls/parts/VolumeSlider.tsx — full: Read the whole file.
- frontend/src/components/player/MediaControls/parts/pointerFocus.ts — full: Read the whole file.

Test files:
- frontend/src/components/player/MediaControls/__tests__/PointerControlsPresenter.test.tsx — partial: Read lines 70-119 (the seek-bar scrub tests) and 255-294 (the changed auto-hide block).

## Unspecified behavior, recorded

- claude-read: After any mouse click on a control-bar button, the seek bar or the volume slider, keyboard focus moves to the document body, so a Tab press afterwards starts from the top of the page instead of continuing from the clicked control.
  - F2 × I2 = 4, claude-read: Triggered by clicking a control and then pressing Tab; the user sees focus jump to the start of the page's tab order instead of the next control.
  - F2 × I2 = 4, claude-verify: After a mouse click on a control, a Tab press is affected only if the browser resets its sequential-focus starting point on blur(). Chromium usually keeps the click point as the starting point, so at most the user sees Tab land on an earlier element than expected, and this needs mixed mouse and Tab use.
- claude-read: A click on a ControlButton that arrives with detail > 0 from an assistive technology (for example a screen reader's activate command, which some browsers dispatch as a click with detail 1) also blurs the button, so focus lands on the body.
  - F0 × I3 = 0, claude-read: Needs a screen reader, which this single-user tool's user does not use; the AT user would lose their place in the bar.
  - F0 × I2 = 0, claude-verify: It needs a screen reader activation that dispatches a click with detail > 0. The single home user is not described as using assistive technology, and the only result is focus moving to the body.
- claude-read: A touch tap on the seek bar or a ControlButton in the touch layout also drops focus, because SeekBar and ControlButton are shared and releasePointerFocus does not check the pointer type.
  - F5 × I1 = 5, claude-read: Triggered by any tap on touch devices; nothing is visible because touch has no keyboard focus ring, so the behavior is harmless.
  - F5 × I1 = 5, claude-verify: A touch tap on the seek bar or a shared ControlButton blurs it. Touch focus rarely becomes :focus-visible and there is no keyboard to continue from, so the user sees no difference.
- claude-verify: Before this change, after a mouse click on the volume slider, the focused INPUT took ArrowUp/ArrowDown and changed the volume natively, because ShortcutsProvider.tsx:74-79 treats an INPUT target as editing and skips the video shortcuts. Now focus goes to the body, so the same key press runs the global video shortcuts in useVideoShortcuts.ts:46-63 and seeks ±60s instead of changing the volume. Likewise ArrowLeft/ArrowRight after a seek bar click now seek ±10s through the shortcut rather than stepping the range natively.
  - F2 × I4 = 8, claude-verify: Clicking the volume slider and then pressing ArrowUp to raise the volume a little more makes the video jump 60 seconds forward. The user notices and can press ArrowDown to undo it.
  - single-scored

## Findings

A: 0
B: 1
C: 0

### claude-read:CR-2 — bucket B, LOW, open

Claim: VolumeSlider releases focus only from its own onPointerUp and, unlike SeekBar, never calls setPointerCapture, so whether the blur runs depends on the browser sending the pointerup of a drag released outside the 80px input to that input.
Impact: If a browser targets that pointerup at whatever element is under the cursor, a viewer who drags the volume past the end of the slider and then presses any key leaves the volume input focused and :focus-visible, so the bar stays over playback. The focused input also swallows the player shortcuts, because ShortcutsProvider skips INPUT targets.
Evidence: frontend/src/components/player/MediaControls/parts/VolumeSlider.tsx:73 has only onPointerUp, with no onPointerDown or setPointerCapture. frontend/src/components/player/MediaControls/parts/SeekBar.tsx:141-142 captures the pointer and 155-158 releases focus on pointerup, and 162-164 says outright that a pointer released outside the input is a case to handle. The e2e volume test (controls-autohide-focus-desktop.spec.ts:65-74) clicks the middle of the slider and never releases outside it.
Repro: not_reproduced. Proposed check: in the volume e2e case, mouse.down at the slider's centre, mouse.move to x = box.x + box.width + 60, mouse.up, press 'm', then waitOffFrame. I believe Chromium's native slider drag captures mouse events on the input, so this may pass there; I have not checked Firefox or WebKit.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Mirror SeekBar: add onPointerDown={(e) => e.currentTarget.setPointerCapture?.(e.pointerId)} to the volume input, or add a drag-release-outside case to the e2e spec.

</details>

## Not verified

- claude-read: Did not run Playwright or the unit tests. Whether the new e2e cases pass, and whether they fail with the fix reverted, is inferred from reading the code.
- claude-read: Did not confirm how Chromium, Firefox or WebKit target the pointerup of a native range drag released outside the input (CR-2).
- claude-read: Did not read SettingsSheet to see whether it returns focus to the Settings button on close.
- claude-read: Did not read peak-jump.serve.ts or the autoHideMs value used by the fixture.
- claude-verify: Whether Chromium, Firefox and WebKit deliver pointerup to a native range input when a thumb drag is released outside it; no browser could be run.
- claude-verify: Whether blur() resets the sequential focus navigation starting point in any engine (unspecified entry 0).
- claude-verify: Unit tests and the e2e suite were not run.

TOTAL: 1 findings
