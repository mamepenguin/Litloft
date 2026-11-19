# Jump to the parts you watched most

SPEC-ID: SPEC-CORE-151

Approval:

## Summary

The player gains one control, 「よく観た所へ」 ("Jump to most watched"), that moves the playhead to
the start of a part of the current file the viewer has played repeatedly, taken from the watched
band of SPEC-CORE-140. Each press goes to the next such part, from the most watched down, and
wraps around. A short label says which one (「よく観た所 2 / 3」), and the band shows for 2 seconds
as after a skip. It is a button in the pointer layout's control row and in the touch layout's
bottom bar, and the `P` key. It reads only the band data the player already holds: no new
storage, endpoint or request. Per viewer, as the band is.

Agreed design: https://claude.ai/artifact/AAhtEdyeVPWaov9nok7bmh, saved in
`docs/process/reviews/feature-peak-jump/design/` (`Main.dc.html`: the pointer layout right after
a press; `Touch.dc.html`: the touch layout right after a press). Its visible decisions:

- D1. Pointer layout: an icon button (concentric circles) in the control row immediately after
  the +10 button, with the row's button size and style (transparent at rest, filled on hover as
  the others); its accessible name is 「よく観た所へ」, and it carries a native `title` tooltip
  「よく観た所へ (P)」 (pointer layout only). The artboards draw it hovered and leave out the
  mute and volume controls for brevity; this line governs.
- D2. Touch layout: the same icon button in the bottom bar, immediately before the full-screen
  button, drawn and pressable in the whole chrome and in bottom-only.
- D3. After a jump: the label 「よく観た所 n / N」 at the top centre of the frame, in the existing
  transient pill style (the long-press speed pill's look), for 2 seconds; and the band of
  SPEC-CORE-140 shown as after a skip.

## Required items

### 1. Normal flow

1. **Spots.** From the band's pieces of SPEC-CORE-140 for the current file and duration (the same
   segment totals and levels, including ranges added by this page's sends), a **spot** is a
   maximal run of consecutive segments each of level 2 or 3, merged across a level change between
   2 and 3 and never across a segment of level 1 or no row. Its **start** is the run's first
   second; its **strength** is the highest level in it; its **length** is its seconds. Spots are
   ordered by strength descending, then length descending, then start ascending. `N` is their
   count.
2. **Availability.** The control is shown only when `MediaControls` is mounted for the player
   (Litloft controls, not the browser's), the store holds a registration with a nickname for the
   controller (a profile is set), the duration is a finite number above
   0, the seek bar is not disabled (not interrupted, seekable), the controls are interactive (not
   while an embed's ad or end screen owns the frame), and `N ≥ 1`. When any of these stops
   holding, the button disappears, the key does nothing and is not consumed (the shortcut's `when`
   is false), and a label on screen hides. `MediaControls` publishes its current availability to
   the controller-keyed store; the shortcut's `when` reads it, and it is false while no
   `MediaControls` is subscribed for the controller.
3. **A press** (the button, or the key the app's shortcut matcher reads as `p`: `P`, Shift+P,
   and Ctrl+P on macOS; Cmd+P and Ctrl+P elsewhere stay the browser's print; not while an editing
   element, including the seek bar's range input, has focus) seeks to the start of the next spot: the first press for the file goes to
   spot 1; a later press goes to the spot that follows, in the current order, the spot last jumped
   to, identified by its start second, wrapping from `N` to 1; if no spot starts at that second
   any more (it vanished, or grew so its start moved), it goes to spot 1. Play or pause state is unchanged. If the seek throws, nothing else happens: no label,
   no skip, and the remembered spot does not move.
4. After the seek, the label 「よく観た所 k / N」 shows for 2 seconds with the values at the press
   (a new press restarts it), and the jump counts as a **skip** for SPEC-CORE-140: the band shows
   for 2 seconds, the pointer and compact layouts reveal the whole bar, and the touch layout goes
   to bottom-only, also when the press came from the whole chrome (a press of the touch button in
   bottom-only keeps it and restarts its 2 seconds). The label is a polite live region
   (`role="status"`). The touch button, like the play button, clears the double-tap sequence so a tap
   beside it is not read as a skip. While the long-press speed pill is shown, the label sits just
   below it.
5. **Order memory.** The remembered spot lives in `MediaControls`' state for the mounted
   controls and the file: it is cleared when the controller's registration in the store changes
   file or nickname (the store exposes the registered pair for this) or `MediaControls` remounts, kept
   while the control is temporarily unavailable, and never changed by a seek made by other means
   or by the spot list changing (the next press continues from it, rule 3).
6. **Where it works.** The button is in the pointer and touch layouts. The key is registered by
   `useVideoShortcuts` (`VideoPlayer`, `ShellVideoPlayer`) and reaches the mounted `MediaControls`
   through the controller-keyed store (a jump request beside `reportSkip`), so with no
   `MediaControls` mounted (browser controls) it does nothing; in every layout where
   `MediaControls` is mounted it acts, and in the touch layout it goes to bottom-only like the
   arrow keys. Its cheat-sheet label is `shortcuts.jumpToMostWatched`.
7. **Room in the row.** `COMPACT_MAX_WIDTH` (480) does not change. The pointer layout draws the
   button only when the frame is at least 524px wide (480 plus the button's 44px), so no control of
   the row is clipped even with a `0:00:00 / 5:55:20` time display; between 480 and 523px the
   pointer layout has no button and `P` still works.

### 2. Failure cases

| Step | What goes wrong | What the system does and the viewer sees |
|---|---|---|
| Band data | `GET /played-segments` failed or has not answered | No spots from stored data (only this page's sends count); the control is absent until there is a spot. |
| Seek | The controller's seek throws (a backend being torn down) | Nothing happens; no label, no skip. |
| Duration | Changes after spots were computed | Spots are recomputed from the band for the new duration (SPEC-CORE-140 rule 3); the remembered spot is kept (rule 5). |

### 3. States

Per mounted controls and file: `unavailable` ↔ `available`; the remembered spot survives the
round trip. Remembered spot: `none` → (press) a spot start → (press) the next spot's start …; a
change of the registered file or nickname, or a remount, returns it to `none`. Not allowed: it changing on a press while
unavailable, on a seek that throws, on a seek by other means, or on a change of the spot list.
The label: `hidden` → (press) `shown` for 2 s → `hidden`; a press while shown restarts the 2 s; a
file change or loss of availability hides it at once.

### 4. Data read and written

- Read: the band's segment totals held by `watchedRangesStore` (SPEC-CORE-140). Nothing new is
  fetched.
- Written: nothing. No storage, no request, no browser storage.

### 5. External services

None: the change is inside the player and makes no call.

### 6. Authorization

None beyond SPEC-CORE-140's: the band data is the viewer's own, read once per file with the
viewer's profile.

### 7. Effect on existing features

- The pointer control row gains one button; the touch bottom bar gains one button before the
  full-screen button.
- `P` becomes a player shortcut in `VideoPlayer` and `ShellVideoPlayer`.
- The skip rules of SPEC-CORE-140 gain one more kind of skip (this jump); nothing else about
  them changes.
- Docs: `docs/user-guide/keyboard-shortcuts.md` (`P`), `docs/user-guide/video.md` (one sentence:
  the button jumps to the parts you played most, and appears once you have replayed a part),
  `DESIGN.md` §Over-video chrome (one line: transient labels share the top centre and stack, the
  speed pill above the jump label).

### 8. Error behavior

None visible beyond the table above; nothing is logged.

### 9. User-visible behavior

- The button (D1, D2) appears only under the availability conditions.
- Each press moves to the next spot and shows 「よく観た所 k / N」 / "Most watched k / N" for 2 s
  (D3), with the band.
- New strings (ja / en): `player.jumpToMostWatched` 「よく観た所へ」 / "Jump to most watched",
  `player.mostWatchedPosition` 「よく観た所 {index} / {count}」 / "Most watched {index} / {count}",
  `shortcuts.jumpToMostWatched` 「よく観た所へ移動」 / "Jump to most watched". The pointer tooltip
  appends 「 (P)」.

### 10. Non-functional

- Spots are recomputed only when the band's pieces change, not per clock tick.
- No network, no storage; per viewer only.

## Touch points

- `frontend/src/lib/watchedRangesStore.ts` (a jump-request channel beside `reportSkip`, the
  published availability per controller, and the registered file and nickname) and a small module
  beside it computing spots from the pieces, recomputed only when the store version or the
  duration changes.
- `frontend/src/components/player/MediaControls/MediaControlsContainer.tsx`,
  `hooks/useMediaControlsState.ts`, `types.ts`, `PointerControlsPresenter.tsx`,
  `TouchControlsPresenter.tsx`, `GestureOverlay.tsx` (or the component that draws the label):
  the button, the remembered spot, the label, the skip report;
  the frame-width check for the pointer button (beside `MediaControls/layout.ts`, whose
  `COMPACT_MAX_WIDTH` is unchanged); `parts/ControlButton.tsx` (an optional `title`).
- `frontend/src/components/player/hooks/useVideoShortcuts.ts`: the `P` key.
- `frontend/src/messages-core/{ja,en}.json`: the three strings.
- `frontend/e2e-components/`: the button's placement, measured in a real browser.
- `docs/user-guide/keyboard-shortcuts.md`, `docs/user-guide/video.md`, `DESIGN.md`.
- Rules passed through: `.claude/rules/frontend-conventions.md`, `DESIGN.md`,
  `.claude/rules/design-decisions.md` (watch history is per viewer).
- No protected path is edited.

## Invariants

I1. Spots are exactly the maximal runs of consecutive segments of level 2 or 3 in the band's pieces for the current file and duration, never spanning a segment of level 1 or no row, ordered by highest level descending, then length descending, then start ascending.
I2. The first press for a file seeks to spot 1's start; each later press seeks to the start of the spot that follows, in the current order, the spot whose start equals the last jumped-to start (wrapping, or spot 1 when no spot starts there); play or pause is unchanged; a seek that throws shows nothing, reports no skip and leaves the remembered spot as it was.
I3. The remembered spot is cleared by a change of the controller's registered file or nickname, or a remount of `MediaControls`, and by nothing else: not by a seek by other means, a change of the spot list or the duration, or a spell of unavailability.
I4. The button is rendered, and `p` (as the matcher reads it, never while an editing element has focus) acts and is consumed, only with `MediaControls` mounted, a profile, a finite duration above 0, a seek bar that is not disabled, interactive controls and at least one spot; otherwise there is no button, `P` does nothing and is not consumed, and a label on screen hides, as it does on a change of the registered file or nickname.
I5. Every jump shows 「よく観た所 k / N」 (the press's values, as a polite live region, below the speed pill when that is shown) for 2 seconds, restarted by a further press, and counts as a skip for SPEC-CORE-140 (band for 2 s; whole bar on pointer and compact; bottom-only on touch, also when the press came from the whole chrome); a press of the touch button also clears the double-tap sequence.
I6. The feature makes no request and writes nothing: the number of `GET /played-segments` and `POST /played-ranges` calls, and every stored value, are the same with or without pressing it.
I7. The pointer layout places the button immediately after the +10 button, and only when the frame is at least 524px wide, with a `title` 「よく観た所へ (P)」; the touch layout places it immediately before the full-screen button (in the whole chrome and in bottom-only); the compact layout has no button; `COMPACT_MAX_WIDTH` is unchanged; at 524px with a `0:00:00 / 5:55:20` time display no control of the pointer row is clipped.
I8. The button's accessible name, the label and the cheat-sheet entry come from `player.jumpToMostWatched`, `player.mostWatchedPosition` and `shortcuts.jumpToMostWatched` in ja and en.

## Revises

SPEC-CORE-140 I1. The band is rendered only while a mouse or pen pointer is over the seek row, while a scrub is in progress, within 2 seconds after the last skip (a tap that seeks, a −10 / +10 button press, a `useVideoShortcuts` arrow key, or a jump to a most-watched spot of SPEC-CORE-151), or while the touch chrome is bottom-only, and never while the duration is not positive or the seek bar is disabled; no other reveal, tap, press, focus or pause renders it, and `YouTubeEmbed`'s own arrow keys do not.
SPEC-CORE-140 I5. In the touch layout a tap that seeks, a `useVideoShortcuts` arrow key or a jump to a most-watched spot (SPEC-CORE-151) shows the bottom bar with the seek bar, and not the centre play button, the top-right buttons or the hairline; in that state only the seek bar, the jump button and the full-screen button take touches; 2 seconds after the last skip, scrub end, jump-button press or full-screen press the chrome is hidden while playing and whole while paused, unless the whole chrome was revealed meanwhile; a double tap during an ad break leaves the chrome as it was.

## Checked, no action

- **A button in the compact layout.** The narrow pointer layout's single row has no room; `P`
  still works there.
- **YouTube embeds' `P` key.** media_import's `YouTubeEmbed` handles its own keys, as with the
  arrow keys in SPEC-CORE-140; its button still works, since the button lives in `MediaControls`.
  Making its `P` work is an addon change.
- **Level 1 parts.** Watched once is not "watched repeatedly"; including them would make nearly
  every played part a spot.
- **Jumping a little before the spot.** The spot starts where repeated playing began, which is
  already where the viewer chose to start; no lead-in is added.
- **A list of spots on the file page.** Decided against with the user: the band already shows
  them, and the button covers the pinpoint use.
- **Audio.** The audio player has no band (SPEC-CORE-140) and so no spots.
- **The row shifting when the button disappears.** During an ad break the button is removed, not
  disabled, so the time display moves by one button's width; ad breaks are rare and short.
- **Cmd+P / Ctrl+P.** The matcher reads them as `ctrl+p`, not `p`, so printing is untouched.
- **Raising `COMPACT_MAX_WIDTH` instead.** It would move the player workbench's frame and floor
  (SPEC-CORE-105) and take ±10, settings and full screen from every viewer at 480–523px; the
  width check on the button alone avoids both.
