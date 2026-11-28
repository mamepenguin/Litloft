# The file page's player is drawn by a layer

SPEC-ID: SPEC-CORE-194

Approval:

## Summary

The video and `.loft` player lives inside the file page today (`FilePreview` under
`RightPaneFile`), so it can only exist while that page does. The owner wants a video to
keep playing in a mini player while browsing other screens. That needs a player whose
lifetime is not the page's. This change builds that foundation and nothing more:

- SPEC-CORE-194: in a browser, the player of a video or `.loft` file is rendered by one
  layer mounted in `AppShell`, and the file page draws a slot the layer covers. On the
  file page the player looks, sizes, layers and behaves as it does today, at every width.
  Leaving the page still ends playback, as today. The scroll-out mini player
  (`MiniPlayerContainer`, `useMiniPlayer`), which the current file-page layouts almost
  never show, is removed.

Keeping playback alive in a box after leaving the page is a separate spec, written on top
of this one once it has merged. The owner chose this split on 2026-11-28, so that the part
whose feasibility reading the code cannot settle (one element outside the page drawn at
the page's place and stacking order) is built and measured first. That later work starts
with desktop video and `.loft`; the phone and audio come in later phases, which is why
this layer already serves every width.

It is for the owner. Nothing new is visible; the change is the base for the next one.

Agreed design: none. The page looks as it does today.

Decisions the owner made on 2026-11-28:

- The scroll-out mini player is removed in this change.
- The layer is used at every width, the phone included.
- After a change of the slot's box, the player is in its new place in the first painted
  frame. While the canvas scrolls, and while the docked sidebar or the tree / queue pane
  animates open or closed (150 ms), the player may trail the slot by one frame and matches
  it once the motion ends.
- A wheel or trackpad scroll that starts on the player scrolls the page as today.
- A touch drag that starts on the video in the browser-controls mode, or on a YouTube
  iframe while its own controls take touches, no longer scrolls the canvas. Accepted.
- The player's controls come after the page's in Tab order.
- The phone browser is checked by the agent in Safari on the iOS Simulator; a real
  iPhone is not part of acceptance.

## Required items

### 1. Normal flow

Terms: the **slot** is what a file page draws in the player's place for a video or `.loft`
file. The **layer** is the one element, mounted in `AppShell`, that renders the player for
the slot. The slot's **visible area** is the part of its box not cut off by any ancestor
that clips (the `overflow-clip` row of `TwoPaneLayout`, the section, the canvas scroll
root).

1. The viewer opens a video or `.loft` file on its file page (any host of `RightPaneFile`:
   a folder, a view, a collection, a queue page, search).
2. In a browser, `FilePreview` draws the slot instead of `VideoPlayer` / `LoftPlayer`.
   The slot hands the layer the file and every value the player reads from the page: the
   file's live props (subtitles, title, poster, duration, `initialTime`, `autoPlay`,
   `onEnded`) and the two page contexts the player reads, the queue page (`useQueuePage`)
   and the find marks (`useFindMarks`). The callbacks it hands keep their identity across
   re-renders, so no provider player is rebuilt.
3. The layer renders the player inside `AppShell`'s providers, outside the routed
   content. The player's other inputs come from there or from module stores:
   `ShortcutsProvider` (AppShell), the profile, toasts and translations (root layout),
   and the pointer-mode, shell-surface, most-watched and preference stores (modules).
   `MiniPlayerBoxContext` is the layer's own. The layer's provider sits above the routed
   content, so it exists before any slot mounts and outlives every slot. An error boundary
   inside the layer catches a render error of the player or an addon embed.
4. The layer draws the player over the slot, visible only within the slot's visible area,
   at `z-[15]`: above the page content it paints over today (the canvas content that
   scrolls under the pinned phone player, the workbench, the aside) and below every
   surface at `z-20` and above. In pseudo full screen it takes the tier the frame has today
   (`z-50`, `z-[60]` on the phone).
5. Geometry:
   - The slot takes its width from the page's layout as the player does today. Its height
     is the player's content height: the 16:9 frame, plus the "Use Litloft controls"
     button in the browser-controls mode, or the `.loft` loading box, error card, link
     card, restricted card or Vimeo embed.
   - The layer follows every change of the slot's box, whatever causes it: a press, a
     resize, content of the page arriving late (the find answer's chips line, an addon
     toggle, the workbench row wrapping, `--player-avail` recomputed, a refetch), and a
     change of the player's own content height (the slot follows that one). Each is
     matched in the first painted frame, except scrolling and the 150 ms sidebar and pane
     transitions, which may trail by one frame.
   - On the phone the slot is pinned to the top of the canvas as the player is today
     (`[data-sheet-snap] .media-detail-player`). It does not move on screen while the
     canvas scrolls under it, so the player stays on it without trailing.
   - In pseudo and system full screen, during the move into and out of it included, the
     player is not clipped. The slot keeps the height it had before, so the page under it
     does not move.
   - While the slot has no box (an ancestor is `display: none`, such as the file section
     while the phone queue overlay is open), the player is not drawn and cannot take
     focus; it keeps playing, and its shortcuts stay registered as they are today.
6. Everything the page does with the player works as today through the same controller
   and element: chapters, description timestamps, Ask time pills, find in file and its
   frame outlines, the workbench panels and the `player-side` / `file-detail-sections` /
   `file-preview-actions` addon entries that receive `mediaController` and `videoRef`, the
   cast button, the frame capture action, keyboard shortcuts, focus mode with its reveal
   strip and its reading anchor (`readingAnchor.ts`, which resolves a hit on the layer to
   the slot), pseudo and system full screen, Picture-in-Picture, the media session, and
   the queue's advance, previous and next.
7. A wheel or trackpad scroll that starts on the layer's own elements over the player is
   applied to the slot's nearest scrolling ancestor. Touch drags on the player are taken by
   its gesture layer as today.
8. When the slot unmounts (leaving the page, or another file opening, since
   `FileDetailContent` remounts per file), the layer unmounts the player, and its teardown
   sends progress and played ranges as today, before any player for another file is
   created.
9. Scrolling the slot out of view draws nothing extra: no box. The player leaves the view
   with the slot.

Where no layer is mounted, the slot renders the player in place, inside the slot element
with no other wrapper: in the iOS shell (`isNativeShell()`), where `AppShell` does not
mount the layer, and in any render outside the layer's provider such as a unit test.

### 2. Failure cases

- The stream fails or the embed reports an error: the player's own error state is drawn
  over the slot, which takes that content's height.
- The `.loft` stream JSON is slow or fails: the loading box or error card is drawn over
  the slot, as today.
- The player or an addon embed throws while rendering: the layer's error boundary draws
  the `.loft` error card's look over the slot instead of the player. The page, the
  sidebar and the header stay usable, and the next slot that mounts gets a fresh player.
- A full page load: everything goes away, as today.

### 3. States

| State | Player | Drawn | Entered by | Left by |
|---|---|---|---|---|
| None | none | nothing | start; the served slot unmounts with no slot waiting | a video or `.loft` slot mounts (→ Attached) |
| Attached | mounted, for the served slot's file | over the slot, within its visible area; nothing while the slot has no box | a slot mounts | the served slot unmounts (→ None, or → Attached for a waiting slot with a new player) |

The layer serves one slot at a time. A slot that mounts while another is served (a host
bug, or development double mounting) draws an empty box of its size and waits; when the
served slot unmounts, the player is torn down and the waiting slot gets a new one. Not
allowed: one player passing from one file to another; two players at once. Pseudo and
system full screen and Picture-in-Picture are the player's own states within Attached. In
the iOS shell and outside the layer's provider the layer is absent and these states do not
apply.

### 4. Data read and written

Unchanged. The player sends today's requests from today's hooks (`usePlaybackProgress`,
`watchedRangesStore`): `POST /api/files/{id}/progress`, `POST /api/files/{id}/played-ranges`,
`GET /api/files/{id}/progress` once at start, the stream, thumbnail and subtitle URLs. The
page sends what it sends today. No table, column, endpoint, event or storage key is added
or changed.

### 5. External services

`.loft` embeds load their provider's player (the YouTube IFrame API through the
media_import addon) as today, once per mount of the slot.

### 6. Authorization

Unchanged. The player plays the file of the page that is open, through the same stream
URL and cookie.

### 7. Effect on existing features

- `FilePreview` renders the slot for video and `.loft` files where a layer is mounted.
  Audio, images and documents are unchanged.
- `MiniPlayerContainer` and `useMiniPlayer` are removed with the scroll-out box.
  `MiniPlayerBoxContext` and `useInMiniPlayerBox` move to the layer's directory and stay
  false; `FindOutlineLayer` keeps reading them. `bottomChrome`'s mini-player flag and the
  upload drawer's avoidance of it stay; nothing sets the flag in this change, and the next
  spec does.
- `FileDetailContainer` and the addon slot props receive the layer's controller as
  `mediaController`, and `videoRef` stays a ref whose `current` is the layer's `<video>`.
  The addon contract is unchanged.
- The `miniPlayerRoot` / scroll-root plumbing that existed only for the scroll-out box is
  removed where it has no other reader (`useCompanionMetrics` keeps its own).
- No overlay component changes its tier: the layer's `z-[15]` sits under all of them.
- `readingAnchor.ts` treats a point on the layer as a point on the slot, so focus mode's
  reading anchor finds the canvas scroller and anchors as today.
- Tab order on the file page: the player's controls follow the page's. Its shortcuts work
  as today.
- `litloft:file-page-closed` is dispatched by `FileDetailContent`'s unmount, which this
  change does not touch.

### 8. Error behavior

As in §2. No new message text. No logging is added.

### 9. User-visible behavior

- The file page looks and plays as today, at every width.
- The scroll-out mini player is gone: scrolling the video out of view no longer shrinks it
  into a window at the bottom right.
- Tab reaches the player's controls after the page's.
- On a phone, a drag that starts on the video in the browser-controls mode, or on a
  YouTube iframe's own controls, no longer scrolls the canvas.
- User docs: `docs/user-guide/viewers-and-players.md` loses the "Mini player" bullet.

### 10. Non-functional

- Following the slot reads layout only when the slot's box can have changed (an observed
  resize or mutation, scrolling, a running transition), and nothing while the page is
  still.
- No extra request; one player at most, as today.

## Touch points

- `frontend/src/components/AppShell.tsx` (mounts the layer and its provider)
- New: `frontend/src/components/player/layer/` (the layer, the slot, their shared store,
  the error boundary, `MiniPlayerBoxContext`)
- `frontend/src/components/FilePreview.tsx`
- `frontend/src/components/FileDetail/MediaPlayerBlock.tsx`
- `frontend/src/components/FileDetail/FileDetailContainer.tsx`
- `frontend/src/components/FileDetail/FileDetailPresenter.tsx`
- `frontend/src/components/FileDetail/ShellLayout.tsx`
- `frontend/src/components/FileDetail/MediaCanvas.tsx`
- `frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts`
- `frontend/src/components/FileDetail/find/FindContext.tsx`
- `frontend/src/components/queue/QueuePageContext.tsx`
- `frontend/src/components/folder/RightPaneFile.tsx`
- `frontend/src/components/MiniPlayerContainer.tsx` (removed)
- `frontend/src/hooks/useMiniPlayer.ts` (removed)
- `frontend/src/components/player/FindOutlineLayer.tsx` (the context's new import path)
- `frontend/src/components/VideoPlayer.tsx`
- `frontend/src/components/loft/LoftPlayer.tsx`
- `frontend/src/lib/readingAnchor.ts`
- `frontend/src/app/globals.css` (the phone pin and the iOS WebKit pinned-iframe rules,
  re-keyed to the slot and the layer)
- Unit tests that change:
  - removed with what they test: `frontend/src/hooks/__tests__/useMiniPlayer.test.ts`;
    in `frontend/src/__tests__/uploadDrawerPlacement.test.tsx` the case "uses the
    mini-player's own height and gap" (it reads `MiniPlayerContainer.tsx` by path); the
    `miniPlayerRoot` cases in
    `frontend/src/components/folder/__tests__/RightPaneFile.test.tsx` ("passes a
    scroll-container element as miniPlayerRoot"),
    `frontend/src/components/FileDetail/__tests__/FileDetailContent.test.tsx` and
    `frontend/src/components/FileDetail/__tests__/MediaShell.test.tsx`; the
    `useMiniPlayer` consumer in `frontend/src/lib/__tests__/mediaClock.consumers.test.ts`.
  - changed import path only: `frontend/src/components/player/__tests__/FindOutlineLayer.test.tsx`.
  - kept as they are, through the in-place fallback:
    `frontend/src/components/__tests__/FilePreview.test.tsx`,
    `frontend/src/components/FileDetail/__tests__/MediaPlayerBlock.test.tsx`,
    `frontend/src/components/FileDetail/__tests__/FindInFile.test.tsx` and every other
    jsdom test that renders the player without the layer's provider.
- Real-browser tests:
  - Every fixture under `frontend/e2e-components/fixtures/` that renders `VideoPlayer`,
    `LoftPlayer`, `FilePreview` or `FileDetailContent` is wrapped in the layer's provider
    and layer, so the suites on them run the layer; among them `app.tsx`,
    `inspectorResponsive.tsx`, `frameOutline.tsx`, `fileHeaderRow.tsx`, `focusMode.tsx`,
    `queuePage.tsx`. Their suites keep their assertions; a check that reads the player's
    box through `.media-detail-player > :first-child` reads it through the slot instead
    (`frontend/e2e-components/document-summary-inspector.spec.ts`,
    `frontend/e2e-components/document-summary-inspector-desktop.spec.ts` and any other
    spec using that selector).
  - New cases in `frontend/e2e-components/` for I1 to I13; the desktop cases are
    registered in `frontend/e2e-components/projects.ts` `DESKTOP_ONLY`, the phone cases
    run at Pixel 5 width.
  - Static fixtures that copy the player's placement are updated to the slot and layer:
    `frontend/e2e-layout/fixtures/pseudo-fullscreen.html`,
    `frontend/e2e-layout/fixtures/mobile-inspector-sheet.html`,
    `frontend/e2e-layout/build-fixture-css.ts`. The upload drawer's check
    (`frontend/e2e-layout/upload-drawer.spec.ts`,
    `frontend/e2e-layout/fixtures/upload-drawer.html`) stays.
- R-5 in the running app: a native video and a YouTube `.loft` on a folder page and a
  queue page, at desktop and phone width; and Safari on the iOS Simulator
  (`ios-simulator` skill): the pinned phone player with the canvas scrolling under it,
  pseudo full screen, a YouTube `.loft` with the header and the sheet over it.
- `docs/user-guide/viewers-and-players.md`
- `DESIGN.md` (the z-index table gains the row "Attached player layer | `z-[15]` | the
  file page's video or `.loft` player, above page content, below every surface at `z-20`
  and above; its pseudo full screen keeps `z-50` / `z-[60]`")
- Rules passed through: `.claude/rules/design-decisions.md` (watch history),
  `.claude/rules/frontend-conventions.md`, `DESIGN.md`.

No protected path is edited.

## Invariants

I1. While a video or `.loft` file page is open in a browser, the document holds exactly
one `<video>` element or provider iframe for it, rendered by the layer outside the slot.
After a file-to-file change it holds exactly one, of the new file; the old file's last
progress and played-range sends carry the old file's id and are sent before the new
file's `GET /progress`. In the iOS shell and outside the layer's provider the player is
inside the slot.

I2. The player's box equals the slot's box within 1px, and no pixel of the player is
painted outside the slot's visible area, by the second animation frame after the last
scroll or transition frame, at 1440x900 and 1280x800 with: no panel, a workbench panel
shown, Enlarge panels, focus mode, the split layout, the beside state, the inspector
overlaid and stacked, the find bar open with its answer, the tree pane shown and yielded,
a queue pane shown, the docked sidebar open; and at 390x844 with the canvas scrolled under
the pinned player (also during the scroll) and with the sheet at each snap.

I3. In the first painted frame after the slot mounts, after its content's height changes
(a `.loft` from loading to its embed or card, the controls mode switched), after entering
or leaving focus mode, toggling the inspector or its stacked form, toggling a panel or
Enlarge panels, entering or leaving the split layout or the beside state, opening or
closing the find bar or its answer's chips line arriving, the workbench row appearing or
wrapping, a sheet snap, and a window resize, the player's box already equals the slot's
box within 1px.

I4. Every element that paints over the player today still does, and the player still
paints over every element it paints over today. Checked at their overlap: dialogs and
their backdrops, the search palette, quick note and shortcut sheet with their backdrops,
toasts, the header's menus, the page row's, resting strip's and workbench row's menus and
the menu scrim behind them on a phone, `ContextMenu`, `ChromeButtons`, the drag-and-drop
upload overlay, the find bar, the inspector in its overlay form, the mobile inspector
sheet and its resting strip, the queue overlay at phone width, the upload drawer, the
overlay sidebar and its backdrop, the focus-mode dismiss layer, the focus reveal strip and
handle, and the app header revealed in focus mode; and the canvas content scrolling under
the pinned phone player, under it. In pseudo full screen the player covers the whole
viewport, toasts, dialogs, the quick note and the shortcut sheet still paint over it as
today, and the page under it keeps its geometry within 1px, during and after.

I5. These keep the same `<video>` element or provider iframe, its `currentTime` and its
play state: entering or leaving pseudo or system full screen, focus mode, a panel,
Enlarge panels, the split layout, the beside state, the inspector's forms, the find bar
and a find step, the tree or queue pane, the docked sidebar, a sheet snap, the phone queue
overlay, a resize, a refetch of the file, a change of its subtitle list and a queue
reorder.

I6. A chapter press, a description timestamp and an Ask time pill change the player's
`currentTime`; the cast button, the frame capture and the addon `videoRef` read the
layer's `<video>`; find-in-file frame outlines are drawn on the player as SPEC-CORE-135 I7
states; with focus on the page, space, the arrow keys, `m`, `f` and `p` act on the player
as before; on a queue page the end of a file and the media session's next / previous move
through the queue as SPEC-CORE-190 states; focus mode's header reveals when the pointer
enters the top strip over the player, an iframe included (SPEC-CORE-128 I10).

I7. Scrolling the slot out of view while playing draws no box. A wheel or trackpad scroll
that starts on the player scrolls the slot's nearest scrolling ancestor by the same amount
it would scroll without the layer.

I8. While the slot has no box (the phone queue overlay open), no pixel of the player is
painted, no element of it takes focus, and its `currentTime` keeps advancing if it was
playing; when the slot is shown again, the player is drawn over it with the same element.

I9. Where no layer is mounted, `FilePreview` renders `VideoPlayer` or `LoftPlayer` as the
only child of the slot element, with the props it passed before this change.

I10. On the file page, Tab from the last focusable element of the routed content moves to
the player's first focusable control, and the player's controls are reached after every
focusable element of the routed content.

I11. In focus mode, with the point at the top of the visible content area on the player,
entering and leaving keep the reading anchor's distance from the top of the content area
within 1px, as SPEC-CORE-128 I2 states for any other content.

I12. A render error thrown by the player or an addon embed leaves the header, the sidebar
and the page's other content rendered and usable, draws an error card over the slot, and
the next file opened plays.

I13. While one slot is served, a second slot that mounts draws an empty box of its size
and no player; when the served slot unmounts, the first player is gone before the second
slot's player is created.

## Checked, no action

- **Keeping playback after leaving the page.** The next spec. This change ends playback on
  leaving, as today.
- **The scroll-out box's other mentions.** SPEC-CORE-030 I13 (the drawer clears the
  mini-player), SPEC-CORE-104 I2 and I7, SPEC-CORE-113 I8 (the mini-player frame is not
  capped), SPEC-CORE-105 I7 and SPEC-CORE-126 I5 / I6 (the mini player never changes the
  layout or remounts the player), SPEC-CORE-128 I6, SPEC-CORE-135 I7 (no outlines in the
  box) and focus mode's "`T` works while the mini player is shown" describe a box this
  change no longer draws. They hold with no box, and the next spec draws one again, so none
  is revised.
- **Earlier no-remount invariants** (SPEC-CORE-128 I3, SPEC-CORE-105 I6 and I7,
  SPEC-CORE-126 I6, SPEC-CORE-085 I4, SPEC-CORE-113 I6), focus mode's first-frame and
  reading-anchor rules (SPEC-CORE-128 I2, I4) and the playback rule of the phone queue
  overlay (SPEC-CORE-193 I9) hold, and I3, I5, I8 and I11 restate them for the layer.
  SPEC-CORE-085 I1's preview actions stay in `.media-detail-player` next to the slot.
- **Wheel over a cross-origin iframe.** Where a provider iframe is not covered by the
  player's own gesture layer (the moments `pointer-events` is handed to the iframe), the
  wheel event goes to the iframe's document and cannot be forwarded; the canvas does not
  scroll then.
- **Touch drags.** Accepted by the owner (Decisions). The player's gesture layer is
  `touch-none`, so in Litloft's own controls a drag on the player has not scrolled the page
  before either.
- **The view-transition snapshot.** A folder navigation's slide names
  `[data-listing-scroller]`; the layer is outside it. The player is gone by then (the slot
  unmounts on leaving), so nothing of it slides separately.
- **Other hit tests.** `DismissScrim`'s `popup.contains` and `AppShell`'s
  `pointerOverHeader` ask about their own popups and the header, which the layer is not
  part of; they are unaffected.
- **Tab and reading order.** Accepted by the owner; I10 pins the accepted order.
- **Layout reads while still (§10).** A performance property, not an observable one; not
  an invariant.
- **`litloft:file-page-closed`.** Dispatched by `FileDetailContent`, which this change does
  not edit; SPEC-ADDON-056 keeps relying on it unchanged.
- **CSS anchor positioning and `moveBefore()`** would avoid the layer or the lag, but are
  not available in every browser the owner uses.
- **Words the next spec needs.** The i18n keys `miniPlayerClose`, `miniPlayerRestore`,
  `miniPlayerAnnounced`, `DESIGN.md`'s mini-player mentions (the shadow table, the
  over-video chrome heading, the player-cap row, the z-index row) and the iOS pages' "no
  mini player" sentences (`docs/user-guide/viewers-and-players.md`,
  `docs/user-guide/ios-app.md`) stay; they stay true or come back with the next spec.
- **Audio** keeps its in-page `AudioPlayer` in this change. Serving it from the layer, and
  boxing it, may come in a later phase.
- **A real iPhone.** Replaced by Safari on the iOS Simulator, by the owner's choice.
- **Addon extension points.** No contract changes, so `docs/ADDON-DEVELOPMENT.md` needs no
  Extension-point entry and no addon is edited.
- **Backend, iOS and `mcp-server/`.** Untouched.
