# YouTube embed: gestures keep working at the end of a video in fullscreen

SPEC-ID: SPEC-ADDON-168

Approval: sha256:be3086499c7e876d633a697e9ccdffe4c573607cc56c00a2251f4189147e995f Yuichi Senga 2026-11-21

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

This is a bug fix in the media_import addon's YouTube player (`YouTubeEmbed`), with
Litloft's own controls (`controls: 0`). When a YouTube `.loft` plays to its end while
fullscreen, the viewer cannot leave fullscreen with a touch gesture: a swipe down or a
pinch on the picture does nothing, and a tap does not show or hide the control bar.

The cause: `gesturesInteractive = !adActive && !ended` turns the gesture overlay to
`pointer-events: none` once the player reports ENDED (state 0). A touch on the picture
then lands in the cross-origin iframe, whose events never reach the page, so
`useFullscreen`'s touch listeners on the frame see nothing. Only a swipe that starts on
the control bar still reaches them.

The overlay stood down at ENDED so that YouTube's end-screen grid of related videos
would stay clickable (the 2026-08-04 custom media controls design, §5.3). The embed as
configured (`controls: 0`, `rel: 0`) does not draw that grid: on the end screen the owner
sees the video's thumbnail, with the video title and the channel name as links to
youtube.com. The owner decided (2026-11-21): while the frame is fullscreen, the overlay
stays interactive at ENDED; in the page it keeps standing down, so those two links stay
clickable there. During an ad it stands down as today. The reasoning is the one that
design already applied to the pause-time overlay (§5.4): losing the basic touch
operations is a clear degradation, and the overlay is transparent, so nothing of
YouTube's is hidden from view.

SPEC-ADDON-168: in `YouTubeEmbed`, the gesture overlay is interactive when no ad is
playing and either the player has not ended or the frame is fullscreen.

## Required items

### 1. Normal flow

1. A viewer plays a YouTube `.loft` with Litloft's controls and enters fullscreen
   (button, `f`, double-click, swipe up, pinch out, or rotating to landscape).
2. The video reaches its end; the player reports ENDED.
3. The overlay stays interactive, because the frame is fullscreen
   (`fullscreen.isFullscreen` from the frame's `useFullscreen`).
4. On a touch device: a swipe down or a pinch in on the picture leaves fullscreen
   through `useFullscreen` as during playback; a tap toggles the control bar (it is
   already showing at ENDED, because the player reports paused, so the first tap hides it,
   as when paused); a double tap on a side skips 10 seconds as during playback. On a fine pointer: a click
   toggles play, which restarts the video, and a double-click leaves fullscreen.
5. Once fullscreen is left (the frame is no longer fullscreen, from the moment it starts
   carrying back to its slot), the player is still ENDED, so the overlay stands down and
   the iframe's title and channel links take the touch or click again.

### 2. Failure cases

| Step | What goes wrong | What happens |
|---|---|---|
| 2 | ENDED fires at the end of a pre-roll ad | the ad flag decides: while it is set the overlay stands down, as today |
| 3 | the browser refuses element fullscreen on a touch device | `useFullscreen` takes the pseudo path; `isFullscreen` is true while it is open, so the rule is the same |
| 4 | the fullscreen exit is refused or the frame is mid-transition | `useFullscreen` behaves as during playback; the overlay follows `isFullscreen` |
| 4 | a forward double tap or a seek at ENDED, or a replay that reaches the end again, makes the player report ENDED once more | each ENDED state change the player reports is handled as today: completion is recorded and `onEnded` is called (a Collection advances), the same as a skip to the end during playback |

### 3. States

The overlay is interactive or standing down. Inputs: ad playing (the ad heuristic reports
interrupted), player ENDED (the last state the player reported is 0), and frame fullscreen,
which is exactly `useFullscreen`'s `isFullscreen` (native element fullscreen, or the pseudo
phase "on"). The pseudo phases "opening" and "closing" count as not fullscreen, although
the frame is pinned during "closing".

| Ad | ENDED | Fullscreen | Overlay |
|---|---|---|---|
| yes | any | any | standing down |
| no | no | any | interactive |
| no | yes | yes | interactive |
| no | yes | no | standing down |

The overlay is a pure function of the three inputs, so every transition between rows is
allowed and none is disallowed: a change in any input re-renders the overlay with the row it
lands in. Examples: leaving fullscreen at ENDED moves from row 3 to row 4 at the start of
the carry back (phase "closing"), not when it settles; entering fullscreen at ENDED from the
page (the bar's button or `f`) moves from row 4 to row 3; replaying from ENDED (play, or a
seek that leaves ENDED) moves to row 2.

### 4. Data read and written

None. The overlay's interactivity is React state in the page. Watch progress, the
completion write and `onEnded` (Collection advance) are untouched.

### 5. External services

The YouTube IFrame player. No new call: its ENDED state and the existing ad heuristic
are read as today.

### 6. Authorization

None. No request is made and no access check is involved.

### 7. Effect on existing features

`interactive` passed to `MediaControls` changes for the fullscreen-ENDED case only, and
everything that reads it in core follows:

- the gesture overlay (`GestureOverlay`, `usePlayerGestures`): taps, double taps and
  clicks work at ENDED while fullscreen;
- the control bar's scrim (`backendOwnsFrame={!interactive}`) is drawn as during
  playback at ENDED while fullscreen;
- the most-watched jump button and its `P` shortcut (`jumpAvailable` reads
  `interactive`, SPEC-CORE-151) are available at ENDED while fullscreen, as they
  are while paused.

In the page, and in the YouTube-UI mode (`youtubeUi`, where Litloft's controls are not
drawn), nothing changes. Native video and audio players do not use this flag.

### 8. Error behavior

None new. Nothing is logged and no message is shown.

### 9. User-visible behavior

- In fullscreen at the end of a YouTube video, on a touch device: a swipe down or a pinch
  in on the picture leaves fullscreen; a tap shows the control bar; a double tap on a side
  skips 10 seconds.
- In fullscreen at the end, with a mouse: a click on the picture restarts the video and a
  double-click leaves fullscreen.
- In fullscreen at the end, the video title and channel name drawn by YouTube cannot be
  clicked or tapped. In the page they can, as today.
- During an ad nothing changes.

### 10. Non-functional

None. One boolean in the render; no timer, request or storage.

## Touch points

- `addons/media_import/frontend/players/YouTubeEmbed.tsx`: `gesturesInteractive` (addon
  repository; core takes it through the submodule pointer).
- `addons/media_import/frontend/players/__tests__/YouTubeEmbedPlayer.test.tsx`: the
  "click overlay" cases for the end screen.
- `addons` submodule pointer in core.
- Read, not edited: `frontend/src/components/player/hooks/useFullscreen.ts`
  (`isFullscreen`, the touch listeners), `frontend/src/components/player/MediaControls/`
  (`GestureOverlay`, `usePlayerGestures`, `MediaControlsContainer`).
- `.claude/rules/design-decisions.md`: no rule names the end-screen gate; nothing to
  change.
- No protected path is edited.

## Invariants

I1. While the YouTube player reports ENDED and the frame is fullscreen (native or pseudo) with no ad playing, the gesture overlay's `pointer-events` is `auto`, and a swipe down or pinch in that starts on the picture leaves fullscreen.
I2. While the YouTube player reports ENDED and the frame is not fullscreen, the gesture overlay's `pointer-events` is `none`.
I3. While an ad is playing (the ad heuristic reports interrupted), the gesture overlay's `pointer-events` is `none`, whether or not the frame is fullscreen and whether or not the player has ended.
I4. Leaving fullscreen while the player is ENDED sets the overlay's `pointer-events` to `none` without a further player state change, from the moment `isFullscreen` turns false (in the pseudo path, at the start of the carry back while the frame is still pinned); entering fullscreen at ENDED sets it to `auto`.
I5. During playback with no ad, the overlay's `pointer-events` is `auto` in and out of fullscreen, as before this change.
I6. Each ENDED state change the player reports for a video (not an ad) records completion and calls `onEnded` exactly once, whether or not the frame is fullscreen; an ENDED during an ad does neither.
I7. At ENDED in fullscreen with no ad, `MediaControls` receives `interactive` true, so the gestures, the scrim and the most-watched jump behave exactly as during a pause; at ENDED in the page it receives false.

## Checked, no action

- **Covering the end screen in the page.** Rejected by the owner: the title and channel
  links stay clickable in the page. The consequence is that at ENDED in the page a swipe
  up or pinch out on the picture does not enter fullscreen and a tap does not reveal the
  bar; the bar comes up when the player stops (YouTube `isPaused` is true at ENDED), and its fullscreen button
  works.
- **Relying on the control bar's exit button instead of covering.** Rejected by the
  owner: the gesture on the picture is the thing that did not work.
- **Leaving fullscreen automatically at ENDED.** New behavior nobody asked for; out of
  scope.
- **The ad state has the same shape** (overlay standing down, so no gesture exit during
  an ad in fullscreen). Covering an ad is not allowed by the embed terms and the skip
  button must stay reachable; unchanged. The control bar stays reachable for exit.
- **The YouTube-UI mode** draws no overlay of ours; YouTube's own controls handle
  fullscreen there. Unchanged.
- **Other embeds.** `VimeoEmbed` and other players do not pass `interactive`; `grep`
  finds `interactive=` only in `YouTubeEmbed`.
- **Whether the embed draws a related-video grid at all** is the owner's observation on
  their devices, not a guarantee from YouTube. If a grid appears in a future player, it is
  covered in fullscreen only, the same trade the pause-time overlay already makes.
- **Separate invariants for each gesture, the scrim and the jump button.** They follow
  from `interactive` (I7), and core's existing tests for `GestureOverlay`,
  `usePlayerGestures`, `MediaControlsContainer` and SPEC-CORE-151 already pin what each
  does when it is true. This change does not alter core.
- **Long press at ENDED** does not boost: `usePlayerGestures` checks `isPaused` first, and
  the player reports paused at ENDED. Unchanged.
- **Verification.** jsdom does no hit testing, so a unit test can only assert the overlay's
  `pointer-events` (and `interactive`); a touch dispatched in jsdom reaches the frame either
  way. The fault itself is confirmed in R-5: a real browser with a coarse pointer (touch
  emulation), a real YouTube `.loft`, seek near the end, enter fullscreen, let it reach the
  end, then a swipe down that starts on the picture leaves fullscreen; and in the page at
  ENDED, the picture still passes the touch to the iframe. On an iPhone (pseudo
  fullscreen) it is in `agent_cannot_verify`; the owner checks it.
- **Prose that becomes false.** Comments in `YouTubeEmbed.tsx` (the `controls` playerVar,
  the gate) and in the test file that say the end screen is never covered are deleted
  where they no longer hold.
- **User guide.** A gesture that already works during playback starting to work at the
  end is a bug fix, not something a viewer has to learn; no `docs/` page changes.
