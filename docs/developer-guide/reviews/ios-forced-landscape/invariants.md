# R-0 invariants — forcing landscape for full-screen video in the iOS shell

Awaiting the user's approval (2026-10-02). Branch `feat/ios-forced-landscape-fullscreen`.

## Touch points

- Contract: `media.state` gains `videoWidth`, `videoHeight`; `page.immersive`
  gains `landscape`; `page.immersive.applied` is answered later when landscape
  is asked. No version bump.
- Page: `lib/shellImmersive.ts`, `lib/nativeBridge.ts`, `lib/nativeMedia.ts`,
  `components/player/hooks/useFullscreen.ts`, `ShellVideoPlayer.tsx`,
  `VideoPlayer.tsx`, `EpubPreview.tsx`; addon `media_import`
  `YouTubeEmbed.tsx` (separate PR, then the pointer bump).
- Shell: `ShellBridge`, `ShellMessage`, `MediaPlayer`, `WebViewModel`,
  `WebView`, `WebShell`, `LitloftApp`, new `OrientationPolicy` and
  `OrientationController`.
- `design-decisions.md` sections passed through: Watch history and profiles
  (the "reaching the end records the final position" rule), WebSocket (not
  touched).
- Data that cannot be regenerated: watch progress rows. Nothing here writes
  them.

## Invariants

1. With no shell, and with a shell that does not send `videoWidth`/`videoHeight`,
   no `page.immersive` message carries `landscape`, no orientation request is
   made, and the answer is not delayed.
2. A `page.immersive` message carries `landscape: true` only for a manual
   full screen of a video whose reported `videoWidth > videoHeight`. A video of
   unknown size (`0`), a portrait video, a YouTube Short (a `/shorts/` URL), an
   image, a PDF, an archive image viewer and an EPUB never carry it; the key is
   absent, never `false`.
3. A full screen entered by rotating the device (`"rotate"`) never carries
   `landscape`, and sitting up still leaves it.
4. After full screen closes by any path — button, Esc, navigation, document
   commit, WebContent termination, `WebShell` being torn down — the supported
   orientation set is the unlocked set again, and an app that was portrait when
   the lock was taken is portrait.
5. While `landscapeLocked`, a request for portrait fails; while not locked, the
   iPhone set is portrait and both landscapes and the iPad set is all four.
6. A full screen the viewer opened never opens a second hold because of the
   rotation the shell caused while the page was opening.
7. The shell never locks on an iPad, and an iPad's `page.immersive.applied` is
   not delayed.
8. A refused geometry update clears the lock and still answers
   `page.immersive.applied` with the web view's current size.
9. Playback position, `WatchHistory` writes, the mini-player gates and the
   existing immersive behaviour (status bar, safe-area, FLIP) are unchanged when
   `landscape` is absent.

## Revisions

None yet.
