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
the page's place and stacking order) is built and measured first.

It is for the owner. Nothing new is visible; the change is the base for the next one.

Agreed design: none. The page looks as it does today.

Decisions the owner made on 2026-11-28:

- The scroll-out mini player is removed in this change.
- The layer is used at every width, the phone included.
- After a layout change made by a press or a resize, the player is in its new place in the
  first painted frame. While the canvas scrolls, and while the docked sidebar or the
  tree / queue pane animates open or closed (150 ms), the player may trail the slot by a
  frame and matches it once the motion ends.
- A wheel or trackpad scroll that starts on the player scrolls the page as today.
- The player's controls come after the page's in Tab order.

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
   `onEnded`), the queue page (`useQueuePage`) and the find marks (`useFindMarks`). The
   callbacks it hands keep their identity across re-renders, so no provider player is
   rebuilt.
3. The layer renders the player inside `AppShell`'s providers (`ShortcutsProvider` and the
   others the player reads) and outside the routed content. Its provider sits above the
   routed content, so it exists before any slot mounts and outlives every slot.
4. The layer draws the player over the slot, visible only within the slot's visible area.
   It paints over what the player paints over today (the canvas content that scrolls under
   the pinned phone player, the workbench, the aside) and under everything that paints over
   the player today.
5. Geometry:
   - The slot takes its width from the page's layout as the player does today. Its height
     is the player's content height: the 16:9 frame, plus the "Use Litloft controls"
     button in the browser-controls mode, or the `.loft` loading box, error card, link
     card, restricted card or Vimeo embed. When that content's height changes, the slot's
     height follows in the same painted frame.
   - On the phone the slot is pinned to the top of the canvas as the player is today
     (`[data-sheet-snap] .media-detail-player`), and the player stays on it while the
     canvas scrolls.
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
   cast button, the frame capture action, keyboard shortcuts, focus mode and its reveal
   strip, pseudo and system full screen, Picture-in-Picture, the media session, and the
   queue's advance, previous and next.
7. A wheel or trackpad scroll that starts on the layer's own elements over the player is
   applied to the slot's nearest scrolling ancestor. Touch drags on the player are taken by
   its gesture layer as today.
8. When the slot unmounts (leaving the page, or another file opening, since
   `FileDetailContent` remounts per file), the layer unmounts the player, and its teardown
   sends progress and played ranges as today, before any player for another file is
   created.
9. Scrolling the slot out of view draws nothing extra: no box. The player leaves the view
   with the slot.

Where no layer is mounted, the slot renders the player in place, as today: in the iOS
shell (`isNativeShell()`), where `AppShell` does not mount the layer, and in any render
outside `AppShell` such as a unit test.

### 2. Failure cases

- The stream fails or the embed reports an error: the player's own error state is drawn
  over the slot, which takes that content's height.
- The `.loft` stream JSON is slow or fails: the loading box or error card is drawn over
  the slot, as today.
- A full page load: everything goes away, as today.

### 3. States

| State | Player | Drawn | Entered by | Left by |
|---|---|---|---|---|
| None | none | nothing | start; the slot unmounts | a video or `.loft` slot mounts (→ Attached) |
| Attached | mounted, for the slot's file | over the slot, within its visible area; nothing while the slot has no box | a slot mounts | the slot unmounts (→ None) |

Not allowed: Attached for file A → Attached for file B without passing through None (A's
player is torn down first); two players at once. If a second slot mounts while one is
attached (a host bug, or development double mounting), the layer serves the slot mounted
last and the other renders an empty box of its size. Pseudo and system full screen and
Picture-in-Picture are the player's own states within Attached. In the iOS shell and
outside `AppShell` the layer is absent and these states do not apply.

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
- Overlay components keep their tiers unless the layer's tier needs one moved to keep
  painting over the player; only a `z-` value may change in them.
- Tab order on the file page: the player's controls follow the page's. Its shortcuts work
  as today.
- `litloft:file-page-closed` fires as today.

### 8. Error behavior

As in §2. No new message text. No logging is added.

### 9. User-visible behavior

- The file page looks and plays as today, at every width.
- The scroll-out mini player is gone: scrolling the video out of view no longer shrinks it
  into a window at the bottom right.
- Tab reaches the player's controls after the page's.
- In the browser-controls mode on a phone, a touch drag that starts on the video no longer
  scrolls the canvas (§ Checked, no action).
- User docs: `docs/user-guide/viewers-and-players.md` loses the "Mini player" bullet.

### 10. Non-functional

- Following the slot reads layout only after a layout change, while scrolling and while a
  sidebar or pane transition runs, and nothing while the page is still.
- No extra request; one player at most, as today.

## Touch points

- `frontend/src/components/AppShell.tsx` (mounts the layer and its provider)
- New: `frontend/src/components/player/layer/` (the layer, the slot, their shared store,
  `MiniPlayerBoxContext`)
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
- `frontend/src/app/globals.css`
- Overlay components whose `z-` value only may change (§7):
  `frontend/src/components/FileDetail/find/FindBarPresenter.tsx`,
  `frontend/src/components/MobileInspectorSheet.tsx`,
  `frontend/src/components/folder/TwoPaneLayout.tsx`,
  `frontend/src/components/UploadProgress.tsx`, `frontend/src/components/Sidebar.tsx`.
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
    test that renders the player without `AppShell`.
- Real-browser tests: new cases in `frontend/e2e-components/` that mount the real
  `AppShell` with the layer and the real file page, for I1 to I9; the desktop cases are
  registered in `frontend/e2e-components/projects.ts` `DESKTOP_ONLY`, the phone cases run
  at Pixel 5 width. Existing checks that measure the player's box move from
  `.media-detail-player > :first-child` to the slot:
  `frontend/e2e-components/document-summary-inspector.spec.ts`,
  `frontend/e2e-components/document-summary-inspector-desktop.spec.ts`. Fixtures that copy
  the player's placement are updated: `frontend/e2e-components/fixtures/app.tsx`,
  `frontend/e2e-layout/fixtures/pseudo-fullscreen.html`,
  `frontend/e2e-layout/fixtures/mobile-inspector-sheet.html`,
  `frontend/e2e-layout/build-fixture-css.ts`. The upload drawer's e2e-layout check
  (`frontend/e2e-layout/upload-drawer.spec.ts`,
  `frontend/e2e-layout/fixtures/upload-drawer.html`) stays, since the flag and the
  avoidance stay.
- R-5 in the running app: a native video and a YouTube `.loft` on a folder page and a
  queue page, at desktop and phone width.
- `docs/user-guide/viewers-and-players.md`
- `DESIGN.md` (the z-index table: the attached player's tier)
- Rules passed through: `.claude/rules/design-decisions.md` (watch history),
  `.claude/rules/frontend-conventions.md`, `DESIGN.md`.

No protected path is edited.

## Invariants

I1. While a video or `.loft` file page is open in a browser, the document holds exactly
one `<video>` element or provider iframe for it, rendered by the layer outside the slot.
After a file-to-file change it holds exactly one, of the new file, and the old file's last
progress and played-range sends carry the old file's id. In the iOS shell and outside
`AppShell` the player is inside the slot.

I2. Once scrolling and transitions have settled, the player's box equals the slot's box
within 1px, and no pixel of the player is painted outside the slot's visible area, at
1440x900 and 1280x800 with: no panel, a workbench panel shown, Enlarge panels, focus
mode, the split layout, the beside state, the inspector overlaid and stacked, the find
bar open, the tree pane shown and yielded, a queue pane shown, the docked sidebar open;
and at 390x844 with the canvas scrolled under the pinned player and with the sheet at
each snap.

I3. In the first painted frame after the slot mounts, after its content's height changes
(a `.loft` from loading to its embed or card, the controls mode switched), after entering
or leaving focus mode, toggling the inspector or its stacked form, toggling a panel or
Enlarge panels, entering or leaving the split layout or the beside state, opening or
closing the find bar, a sheet snap, and a window resize, the player's box already equals
the slot's box within 1px.

I4. Every element that paints over the player today still does, and the player still
paints over every element it paints over today. Checked at their overlap: dialogs and the
search palette, quick note and shortcut sheet, toasts, the header's menus, the page row's
menus, the workbench row's menus, `ContextMenu`, `ChromeButtons`, the drag-and-drop upload
overlay, the find bar, the inspector in its overlay form, the mobile inspector sheet and
its resting strip, the queue overlay at phone width, the upload drawer, the overlay
sidebar, the focus-mode dismiss layer, the focus reveal strip and handle, and the app
header revealed in focus mode; and the canvas content scrolling under the pinned phone
player, under it. In pseudo full screen the player covers the whole viewport and nothing
outside it paints over it; the page under it keeps its geometry within 1px, during and
after.

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

I9. Where no layer is mounted, `FilePreview` renders `VideoPlayer` or `LoftPlayer` in
place, with the same output as before this change.

## Checked, no action

- **Keeping playback after leaving the page.** The next spec. This change ends playback on
  leaving, as today.
- **The scroll-out box's other mentions.** SPEC-CORE-030 I13 (the drawer clears the
  mini-player), SPEC-CORE-104 I2 and I7, SPEC-CORE-113 I8 (the mini-player frame is not
  capped), SPEC-CORE-105 I7 and SPEC-CORE-126 I5 / I6 (the mini player never changes the
  layout or remounts the player), SPEC-CORE-135 I7 (no outlines in the box) and focus
  mode's "`T` works while the mini player is shown" describe a box this change no longer
  draws. They hold with no box, and the next spec draws one again, so none is revised.
- **Earlier no-remount invariants** (SPEC-CORE-128 I3, SPEC-CORE-105 I6 and I7,
  SPEC-CORE-126 I6, SPEC-CORE-085 I4, SPEC-CORE-113 I6), focus mode's first-frame rule
  (SPEC-CORE-128 I4) and the playback rule of the phone queue overlay (SPEC-CORE-193 I9)
  hold, and I3, I5 and I8 restate them for the layer.
- **Wheel over a cross-origin iframe.** Where a provider iframe is not covered by the
  player's own gesture layer (the moments `pointer-events` is handed to the iframe), the
  wheel event goes to the iframe's document and cannot be forwarded; it chains to the
  layer's ancestors instead. This was the behaviour for the iframe's own scrolling before
  too, only the chain target changes.
- **Touch drags.** The player's gesture layer is `touch-none`, so a drag on the player has
  not scrolled the page before either. In the browser-controls mode on a phone the native
  video has no gesture layer and a drag on it scrolled the canvas; through the layer it no
  longer does. The mode exists for AirPlay; accepted for this change.
- **Tab and reading order.** Accepted by the owner.
- **Layout reads while still (§10).** A performance property, not an observable one; not
  an invariant.
- **CSS anchor positioning and `moveBefore()`** would avoid the layer or the lag, but are
  not available in every browser the owner uses.
- **Words the next spec needs.** The i18n keys `miniPlayerClose`, `miniPlayerRestore`,
  `miniPlayerAnnounced`, `DESIGN.md`'s mini-player mentions (the shadow table, the
  over-video chrome heading, the player-cap row, the z-index row) and the iOS pages' "no
  mini player" sentences (`docs/user-guide/viewers-and-players.md`,
  `docs/user-guide/ios-app.md`) stay; they stay true or come back with the next spec.
- **Audio** keeps its in-page player; the next spec does not box it either.
- **Addon extension points.** No contract changes, so `docs/ADDON-DEVELOPMENT.md` needs no
  Extension-point entry and no addon is edited.
- **Backend, iOS and `mcp-server/`.** Untouched.
