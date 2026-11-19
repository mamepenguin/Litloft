# Scenes: a scrolling list of every frame

SPEC-ID: SPEC-ADDON-152
SPEC-ID: SPEC-ADDON-153

Approval: sha256:a36a7442854e2ce379a5d3930f5103bbd5421dc414d28b477267cc31cee4e958 Yuichi Senga 2026-11-19

## Summary

The intelligence Scenes section shows a video's frames as a window of `R × c` tiles around
the point being looked at (SPEC-ADDON-089, 093, 104). To see other frames the reader moves
that point along the ruler. Since the 10-second fill (SPEC-ADDON-144) a video has a frame
every 10 s at most, up to `max_frames` (500), so the window covers a few minutes and the
ruler has to be swept in small steps to find a scene. For the household's one user,
scrolling is much easier when looking for a scene.

This change draws every frame in one list that scrolls, the way the transcript does:

- **SPEC-ADDON-152, the list.**
  - Every frame is drawn, in `c` columns, in time order.
  - Under the player (the workbench) and in the stacked desktop inspector's tab, the
    list takes the height the ruler, card and action row leave and scrolls inside
    itself, so the panel body does not scroll. In the phone sheet the list scrolls with
    the sheet, with the ruler pinned at the top and a one-line card pinned at the
    bottom.
  - While playing, the list follows the playing frame, moving only when the playing row
    leaves view. A reader's scroll stops following and shows a **Back to current
    position** chip.
  - The scene card describes the ruler point when one is set, the playing scene while
    following, and the scene at the top of the list otherwise.
- **SPEC-ADDON-153, the ruler as the list's map.**
  - The band on the ruler shows the part of the video the list shows.
  - A click, tap or drag on the ruler scrolls the list to that time and never plays.
    Hovering draws a line only. A tile or the card plays from its time, as today.

SPEC-ADDON-104 (rows fill the height) no longer applies: there is no row count. It is
marked superseded in the ledger.

Agreed design: https://claude.ai/artifact/LQ5pW3HnepkWiJDPuVdnV1, saved in
`docs/process/reviews/feature-scenes-scroll-list/design/` (`Main.dc.html`,
`Short.dc.html`, `Phone.dc.html` and the shared `Panel.dc.html`). In `Main.dc.html` and
`Panel.dc.html`, the play button and time in the action row stand in for the player and
are not part of the design. Where this spec states a rule the boards do not draw (when
following scrolls, the ruler point's outline, the minimum list height), the spec wins.

The design's visible decisions:

- D1. Workbench, one panel, 1400px window: from the top, the panel holds the ruler with
  its labels, the list, the full scene card and the action row. The ruler, card and action
  row do not move when the list scrolls. The list fills the height between them.
- D2. The list draws 8 columns at the 1024px panel. The playing tile has the accent
  outline.
- D3. After the reader scrolls the list, a filled accent chip **Back to current position**
  is drawn centred at the top of the list, over the tiles. It is gone while following.
- D4. 900px window: the panel is too short for the full card. The card is one line (dot,
  time, label cut with an ellipsis), and the list keeps the rest, about one row.
- D5. Phone sheet, half and full snap: the ruler is pinned under the tab strip, the
  one-line card is pinned at the bottom of the sheet, and the list between them scrolls
  with the sheet. The action row comes after the last tile.
- D6. The band on the ruler covers the list's visible rows. Hovering the ruler draws a
  thin line and moves nothing else.
- D7. Tiles, ruler, marks, dots and the full card look as they do today.

## Terms

- **List**: the element holding the tiles, with every tile mounted. Its padding leaves
  room for the playing tile's outline, so the outline is not clipped.
- **Flow form**: the section has an ancestor marked `data-inspector-scroller`, which
  only the phone sheet's scroller (`mobile-inspector-content`) carries: the inspector's
  `column` form, shared by every tab (`docs/ADDON-DEVELOPMENT.md`, the contract the
  transcript also reads). The list is not a scroll container: it is as tall as its
  content and the marked ancestor scrolls it.
- **Bounded form**: no such ancestor. The hosts: the workbench panel body
  (`.media-detail-workbench-body`, on the media page and on the collection surface,
  one panel or two side by side), which stretches the section to its height, and the
  stacked desktop inspector's tab, whose `PanelTabBody` (`flex h-full min-h-0 flex-col`)
  bounds it to the tab panel's height. The list is a scroll container
  (`overflow-y: auto`, `scrollbar-gutter: stable`) that takes the height left after the
  ruler, the card or placeholder, the stale note and the action row, never less than one
  row step.
- **Scroller**: the list in bounded form; the marked ancestor in flow form. It **can
  scroll** when its scroll height exceeds its client height.
- **Visible area**: the part of the scroller's client box where tiles can be seen. In
  bounded form, the list's client box. In flow form, from the scroller's top plus
  `--inspector-sticky-top` (read with `getComputedStyle` on the section; 0 when unset)
  plus the pinned ruler's height, to the top of the pinned card's box.
- **Row step**: one drawn tile's height (picture and time label) plus the grid's row gap,
  measured from a drawn tile.
- **Visible row**: a row with at least half of its tile height inside the visible area.
  **Wholly visible**: the whole tile height is inside it.
- **Top row**: the first visible row; with none, the row at the top of the visible area.
- **Following**: a flag. While it is set and a `mediaController` is present, the list
  keeps the playing frame's row in view.
- **Place a row**: set the scroller's `scrollTop`, without animation, so that the row
  before it is the first row of the visible area (the row is the second), clamped to the
  scroll range; row 0 goes to the top of the list.
- **Ruler point**: the start of a frame, set by the ruler (§1.11–1.13): the frame whose
  start is at or before the time under the pointer, or the frame a key moved to. It is
  drawn as a thin line on the ruler and the white `outline-text-primary` outline on its
  tile (today's browsed tile).
- **Shown**: the section's body is expanded, it is not inside a `[hidden]` ancestor,
  and its host does not report `active: false` (an absent `active` counts as shown).
- **Placement events**: show; a file change; the frames arriving (a `.loft` reads them on
  mount and can be shown before they arrive); the controller appearing; following being
  set; a change of the playback time; a change of the visible area's size (a resize, a
  sheet snap, the placeholder giving way to the card, the stale note or action row
  appearing); a change of `c` or the row step.
- `c`, `L`, `n`: as SPEC-ADDON-089 and 093 define them, with `c` measured from the list's
  content width (Revises, SPEC-ADDON-093 I1).

## Required items

### 1. Normal flow

1. The reader shows the Scenes panel (or tab) for a video. The section loads as today
   (SPEC-ADDON-089 I6, I7; SPEC-ADDON-080 I6). While loading, the skeleton of `3c` blocks
   is drawn inside the list's box, so in bounded form it scrolls there and the host does
   not.
2. The section draws, from the top: the ruler with its labels, the list, then the Visual
   Index placeholder or the scene card, the stale note and the action row. In flow form
   the ruler is pinned at `top: var(--inspector-sticky-top, 0px)` and the card or
   placeholder at `bottom: 0` of the scroller, both with an opaque background and a
   `z-index` below 10. The pinned card's box reaches the scrollport's bottom edge and
   pads its content by `env(safe-area-inset-bottom)`, so on an iPhone the card sits above
   the home indicator. The stale note and the action row come after the list and scroll
   with it.
3. On show, on a file change and when the frames arrive, the list draws all `n` frames in
   `c` columns, following is set and there is no ruler point. With a `mediaController`
   the playing row is placed; without one the scroller is set so the list's top is at the
   top of the visible area. This happens before the first paint of the shown list, in
   flow form too, whatever position the shared scroller had.
4. **Following.** After any other placement event, while following is set, the section
   is shown and a `mediaController` is present, the playing row is placed when it is not
   wholly visible. While it is wholly visible, nothing scrolls. Without a controller
   nothing follows.
5. **Seeks from elsewhere** (the player's bar, the transcript, player shortcuts) move the
   playback time like playing does: while following, step 4 applies; while not
   following, the list stays where it is.
6. **The reader scrolls.** Following is cleared and the ruler point is removed when,
   while the section is shown and the scroller can scroll:
   - a `wheel` or `touchmove` lands on the scroller (in flow form, anywhere on it,
     including a vertical swipe that starts on the pinned ruler or card);
   - a mouse `pointerdown` lands on the scroller itself (its scrollbar);
   - `PageUp`, `PageDown`, `Home` or `End` is pressed while focus is inside the scroller
     and not on the ruler (which takes `Home` / `End` itself), or on the scroller itself;
   - a middle-button `pointerdown` lands anywhere in the scroller (autoscroll);
   - focus moves to a tile that is not wholly visible (the browser scrolls it in).
   `Space` and the arrow keys stay the player's page shortcuts while a tile has focus
   (play/pause, seek); their seeks act as step 5. A scroll the section makes itself never
   clears following. While the section is not shown it writes no `scrollTop` and ignores
   these events, so the other tabs of a shared scroller do not move.
7. **The chip.** While following is clear, a `mediaController` is present and the
   scroller can scroll, the chip **Back to current position** is drawn at the top of the
   visible area, centred, over the tiles. Activating it sets following (step 4).
8. **Playing from the list.** A tile or the scene card seeks to its time and plays,
   through `mediaController` or `videoRef` as today, sets following and removes the
   ruler point. A wholly visible tile does not make the list scroll.
9. **The card.** The scene card is chosen at the ruler point when one is set, otherwise
   at the playback time while following with a `mediaController`, otherwise at the start
   of the first frame of the top row (SPEC-ADDON-090 I9 as revised). It is full or one
   line (§3).
10. **The band** runs from the start of the first frame of the first visible row to the
    start of the frame after the last frame of the last visible row, or to `L`. It moves
    as the list scrolls.
11. **Ruler, mouse.** Moving over the ruler draws a hover line at the pointer; leaving
    removes it. Nothing else changes. A press sets the ruler point at the pointer and
    places its row; moving with the button held does the same continuously, and the
    release ends it. When the scroller can scroll, following is cleared. It never seeks.
12. **Ruler, touch or pen.** A tap, or a horizontal drag of at least 8 px, sets the ruler
    point under the finger and places its row, continuously during the drag; when the
    scroller can scroll, following is cleared. It never seeks. A touch that the browser
    hands to vertical scrolling before it has moved 8 px horizontally sets no ruler point
    and is a reader's scroll (step 6). A `pointercancel` after the drag has moved 8 px
    puts back the scroll position, following and ruler point the drag started from, and
    the `touchmove` of that gesture does not clear them.
13. **Ruler, keyboard** (while it has focus): `←` / `→` move the ruler point one frame
    back or forward. The first press starts from the ruler point when one is set,
    otherwise from the playing frame while following with a `mediaController`, otherwise
    from the first frame of the top row. `Home` / `End` move it to the first or last
    frame. Each move places its row and, when the scroller can scroll, clears following.
    `Enter` plays from the ruler point when one is set (step 8). These keys never reach a
    page shortcut (SPEC-ADDON-089 I4). The slider's `aria-valuenow` and `aria-valuetext`
    are the card's point (step 9).
14. **Pictures.** A tile's picture is requested once its row has been within one row step
    of the visible area for 150 ms with no scroll of the scroller in between. A tile's
    picture is requested at most once while the panel stays shown and the file is the
    same, and once drawn it stays drawn. A native frame that fails draws the tile's empty
    background with its time label and click-to-seek, and is asked for again only on the
    next showing; a `.loft` tile that fails keeps its blank block (SPEC-ADDON-089 I7).
15. When `c` or the row step changes (a resize, the first picture's ratio), the list is
    redrawn so that the first frame of the top row before the change is in the top row
    after it; while following with a controller, step 4 applies instead.
16. Hiding the panel and showing it again starts again at step 3.

### 2. Failure cases

- **No `mediaController`**: nothing follows, no chip, no playback marker. Ruler and tiles
  work as stated; a tile plays through `videoRef`.
- **The playback time is before the first frame**: the playing row is row 0.
- **Every frame fits** (the scroller cannot scroll): ruler input sets the ruler point
  but does not clear following, and no chip is drawn.
- **A bounded host too short for the fixed parts and one row**: the list keeps one row
  step, and the host's body scrolls. This is the only case where the workbench body
  scrolls for this section.
- **No frames** (a `.loft` drawn only through its Visual Index, SPEC-ADDON-129): there is
  no list, band or ruler point. A click, tap or key on the ruler does nothing. The card's
  point is the playback time, or 0 without a controller; the card is full in bounded form
  and one line in flow form.

### 3. States

- **Collapsed / loading / expanded**: unchanged (SPEC-ADDON-089 §3). A native video's
  frames are read on show; a `.loft`'s on mount (they may arrive while shown, a
  placement event). Neither changes while shown; a WS event reloads only the Visual
  Index.
- **Following set / clear**: set by step 3, a tile, the card, the chip and the ruler's
  `Enter`. Cleared only by §1.6 and by ruler input while the scroller can scroll
  (§1.11–1.13). A pause, a seek from elsewhere, a Visual Index reload or action, a resize
  or a picture's ratio leave it as it is.
- **Ruler point set / none**: set by §1.11–1.13; removed by a reader's scroll (§1.6), by
  a tile, the card, the chip or `Enter`, and by step 3. Playing, leaving or blurring the
  ruler do not remove it, so when every frame fits, a point set while following stays
  until one of those.
- **Card full / one line**: one line in flow form. In bounded form, one line when `H` is
  under two row steps, full otherwise, where `H` is the list's client height plus the
  drawn card's (or placeholder's) height minus the full card's minimum height (7.6rem).
  Because `H` does not depend on which card is drawn, the choice does not flip. The
  one-line card shows the dot, the seek time and the label on one line cut with an
  ellipsis, and never `visible_text`; activating it does what the full card does. The
  placeholder is the card it stands in for (7.75rem full, the one-line card's height
  otherwise) plus the action row's 2.25rem, as today.
- **Visual Index states**: unchanged (SPEC-ADDON-090).

### 4. Data read and written

- Read: `clip-timestamps`, `visual-index`, frame and scene-tile pictures, as today.
- Written: nothing. Following, the ruler point and the scroll position are not stored.

### 5. External services

None. The frame route runs ffmpeg on a cache miss; §1.14 bounds how many it is asked for.

### 6. Authorization

Unchanged: the same addon routes, with `X-Lit-Drive` and the per-drive policy.

### 7. Effect on existing features

- No core component changes; the transcript and its scroller are untouched.
- The other `player-side` panels and inspector tabs are unchanged; the section never
  scrolls a shared scroller while another tab is shown (§1.6).
- `useSceneRows` and the `R` measurement (SPEC-ADDON-104) are removed, with the tests of
  a row count that no longer exists: `ScenesSectionRows.test.ts`,
  `frontend/e2e-components/scenes-section-rows.spec.ts`,
  `scenes-section-rows-desktop.spec.ts`, `scenes-section-rows-scrollbar-desktop.spec.ts`
  and `scenes-section-rows.cases.ts`, and their entries in `projects.ts` and
  `spec-viewport.spec.ts`. The scrollbar stability those tests guarded is kept by the
  list's `scrollbar-gutter: stable` and measured again (§10).
- Tests of the window (`windowStartFor`, nine or `R·c` tiles, hover moving the grid, a
  mouse click on the ruler seeking, a browse point cleared by a jump) are rewritten to
  the new rules. The properties they protected stay tested: one tick per frame, the
  playing outline, the 150 ms settle, no page shortcut from the ruler, `.loft` pictures
  from the scene-tile route. `ScenesSectionOneList.test.tsx` cites I10 for the order.
- The full card keeps its `line-clamp` in `ScenesSectionPresenter.tsx`
  (`frontend/src/__tests__/line-clamp-display.test.ts` anchors it).
- The fixed-width Scenes routes (`scenes-351` … `scenes-long-390` in `fixtures/app.tsx`,
  `ScenesSectionArrangement`) wrap the section in a bounded box of a stated width and
  height standing in for the workbench body, and `scenes-section.spec.ts` /
  `scenes-section-desktop.spec.ts` keep measuring columns at those widths there. The
  revised SPEC-CORE-065 I3 and I4 clauses are measured in the new real-host suite.
- The user guide's video page and keyboard-shortcuts page describe hovering and
  clicking the ruler; they are updated in the core PR.
- A ruler click on a `.loft` with no frames no longer seeks (SPEC-ADDON-129 I4 as
  revised); its card still does.

### 8. Error behavior

Unchanged: the same messages for Visual Index actions; nothing new is logged.

### 9. User-visible behavior

- Everything in §1. New text: the chip **Back to current position** (ja 「現在位置に戻る」),
  one new key in the addon's messages.
- A mouse click on the ruler no longer plays; the user guide says so.
- Tab order inside the section: the ruler, the chip when drawn, every tile in time order,
  the card, the action row.

### 10. Non-functional

- Frames: at most `max_frames` (default 500) for a native video and for a YouTube
  `.loft`'s storyboard (`kept_tiles`), so every tile is mounted.
- A clock tick re-renders only the tiles whose playing outline changes, not all `n`.
- Pictures: opening the panel requests at most the tiles within one row step of the
  visible area; scrolling requests nothing until the scroller has been still for 150 ms.
- Measured in a real browser (`frontend/e2e-components/`, the real section in its real
  hosts):
  - hosts: the media-page workbench at 1400 and 900 px high, one panel and two side by
    side, turning the second panel on and off; the collection surface's panel; the
    stacked desktop inspector at 768×1024; the phone sheet at half and full snap,
    390 px wide;
  - states: classic scrollbars (columns and scroll position steady over 60 frames), 4:3
    pictures, Visual Index absent and stale (placeholder, card, note), first paint on
    opening the panel, toggling a panel and switching tabs, resizing taller and shorter;
  - invariants: I1, I2, I3 (wheel and touch on the pinned ruler and card in the sheet),
    I5, I8, I9 (placing a row; `pointercancel` restoring it), I10, and the revised
    SPEC-CORE-065 I3, I4. I6 (picture timing) and the rest of I9 are tested in jsdom with
    a measured layout stubbed.
- The iOS shell (touch scrolling, the pinned ruler and card in the sheet, the card above
  the home indicator, the sheet's pull-to-collapse) is in `agent_cannot_verify`: the
  human checks it on the phone after deploy.
- `max_frames` is a setting with a default of 500; every tile is mounted whatever it is
  set to.

## Touch points

- `addons/intelligence/frontend/ScenesSection/` (Container, Presenter, `scenesModel.ts`,
  hooks; `useSceneRows.ts` removed; a follow hook added) and its `__tests__/`.
- `addons/intelligence/frontend/messages/{ja,en}.json`: the chip's text.
- `frontend/e2e-components/`: `scenes-section*.ts`, `projects.ts`,
  `spec-viewport.spec.ts`, `fixtures/scenesSection.tsx`, `fixtures/scenesSectionData.ts`,
  `fixtures/inspectorResponsive.tsx`, `fixtures/app.tsx`; the `scenes-section-rows*`
  files removed.
- `frontend/scripts/check-coverage-denominator.mjs`, if a file without code is added or
  removed under `ScenesSection/`.
- `docs/user-guide/video.md` (Watching a video), `docs/user-guide/keyboard-shortcuts.md`
  (Scenes timeline).
- `docs/specs/INDEX.md`: rows for 152 and 153; SPEC-ADDON-104 → superseded.
- Rules passed through: `.claude/rules/frontend-conventions.md` (Container/Presenter, the
  design system), `DESIGN.md` (accent chip, radius, touch scrolling), and
  `.claude/rules/design-decisions.md` (Addons: no core-to-addon dependency).
- Order: the addon change merges in its repository first; the core PR bumps the
  `addons/intelligence` pointer with the core tests and docs.
- No protected path is edited.

## Invariants

Tests of the revised invariants cite the revised spec's id; tests of the lines below cite
SPEC-ADDON-152 (I1–I7, I10) or SPEC-ADDON-153 (I8, I9).

I1. The list draws one tile for each of the `n` frames, in time order, in `c` columns. Inside the section only the list scrolls, and only vertically. In bounded form the host's box (the workbench body, the inspector tab panel) does not scroll unless its content box is shorter than the sum of the ruler block, the card or placeholder, the stale note, the action row, the gaps between them and one row step.
I2. On show, a file change and the frames arriving, the first painted list has the playing row placed with a `mediaController`, or the list's top at the top of the visible area without one. After any other placement event, while following is set, the section is shown and a controller is present, the playing row is wholly visible; `scrollTop` changes only when it was not, and then it is the second row of the visible area (or the first for row 0), clamped to the scroll range.
I3. Following is set on show, on a file change, when the frames arrive, by a tile, the scene card, the chip and the ruler's `Enter`. It is cleared only by a reader's scroll input as §1.6 lists it, while the section is shown and the scroller can scroll, and by ruler input while the scroller can scroll; never by a scroll the section makes, a pause, a seek from elsewhere, a Visual Index reload or a resize.
I4. The chip **Back to current position** is drawn exactly while following is clear, a `mediaController` is present and the scroller can scroll.
I5. The scene card is chosen at the ruler point when set, otherwise at the playback time while following with a `mediaController`, otherwise at the start of the first frame of the top row. In flow form the card is one line; in bounded form it is one line exactly when `H` (§3) is under two row steps. The one-line card shows the dot, the seek time and the label, never `visible_text`.
I6. A tile's picture is requested only after its row has stayed within one row step of the visible area for 150 ms with no scroll in between, at most once while the panel stays shown and the file is the same, and a drawn picture is not removed while the panel stays shown.
I7. While the section is not shown it writes no scroller's `scrollTop`, so a shared scroller keeps the position another tab left. Showing it again or changing the file sets following and removes the ruler point.
I8. The ruler's band runs from the first frame of the first visible row to the start of the frame after the last visible row's last frame, or to `L`, and changes when the list scrolls.
I9. No ruler input seeks except `Enter` with a ruler point set. A mouse press or drag, a tap or a horizontal drag of at least 8 px sets the ruler point at the start of the frame under it and places its row; mouse movement without a button only draws the hover line. The first `←`/`→` press starts from the ruler point, else the playing frame while following with a controller, else the top row's first frame. A `pointercancel` after a drag has moved 8 px restores the scroll position, following and ruler point it started from.
I10. From the top the section draws the ruler with its labels, the list, the placeholder or scene card, the stale note and the action row. In flow form the ruler stays below `--inspector-sticky-top` and the card at the scroller's bottom while the list scrolls; in bounded form the ruler, card, stale note and action row keep their positions while the list scrolls.

## Revises

SPEC-ADDON-089 I1. The ruler draws exactly one tick per `clip-timestamps` row, at `min(start, L) / L` of its width, with `L` as §2 of docs/specs/scene-timeline.md defines it, except that when the answer has arrived with no rows `L` is the player's duration when that is a finite positive number (otherwise 0), and while no answer has arrived `L` is 0. The list draws every frame, as docs/specs/scenes-scroll-list.md I1 states.
SPEC-ADDON-089 I2. While a `mediaController` is present, the ruler's playback marker and the accent outline of the playing tile follow the shared media clock. Only three things seek: `Enter` on the ruler with a ruler point set, a tile and the scene card. Each seek is followed by play, through `mediaController` or, without one, through `videoRef`. Mouse movement over the ruler without a button draws a line and moves nothing.
SPEC-ADDON-089 I3. For a `touch` or `pen` pointer event the ruler never seeks. A tap or a horizontal drag of at least 8 px sets the ruler point and scrolls the list, as docs/specs/scenes-scroll-list.md I9 states. A touch handed to vertical scrolling sets no ruler point.
SPEC-ADDON-089 I5. The file page draws at most one Scenes panel for a video, and only in the states §3 does not hide, and nothing for any other file type. The intelligence manifest has exactly one `scenes` entry, in `player-side`, and no `visual-index` or `clip-frames` entry. Inside the section only the list scrolls, and only vertically. The section is as wide as its host's content box.
SPEC-ADDON-089 I8. Pictures are requested as docs/specs/scenes-scroll-list.md I6 states.
SPEC-ADDON-090 I9. When the policy is off, when the first `visual-index` request fails, answers 404, or answers `eligible: false` or `available: false`, the section draws no Visual Index part: no dot count, no progress, no marks, no tile dots, no scene card and no actions. Whether a `.loft` is eligible is the `visual-index` answer's to say. The list and ruler are otherwise unchanged. Otherwise every active-run scene is marked at its seek time (`section_start`, or `start_time` when that is null), styled by its status as §9 of docs/specs/scene-timeline.md says. A tile carries the dot exactly when a `succeeded` scene with `section_start` has its seek time in the tile's range, from its frame's `start` up to the next frame's `start`, the first tile also taking a seek time before it, or a `succeeded` scene without `section_start` has its `start_time` within 0.05 s of its frame's `start`. The scene card shows the last succeeded, labelled scene whose seek time is at or before the point docs/specs/scenes-scroll-list.md I5 names (or the first such scene before all of them), with its seek time as its time label; the full card also shows its `visible_text`, the one-line card does not, and neither shows its `transcript_excerpt`. Activating either card seeks to that scene's seek time, plays and sets following.
SPEC-ADDON-093 I1. The list has `c = max(3, floor((W + 0.5rem) / 7.5rem))` columns, where `W` is the list's measured content width (inside its padding and its stable scrollbar gutter) and rem is the root font size (16px when it is not a positive number). With `W` unknown, it has 3.
SPEC-ADDON-093 I3. Pictures are requested as docs/specs/scenes-scroll-list.md I6 states; never for the whole list at once.
SPEC-ADDON-093 I4. The ruler's band is as docs/specs/scenes-scroll-list.md I8 states.
SPEC-ADDON-093 I5. A change of `W` that changes `c` redraws the list in the new column count, keeping the top row's first frame in the top row (or, while following, the playing row in view), without a travel animation.
SPEC-ADDON-129 I4. When the `clip-timestamps` answer has arrived with no candidate frames and the player's duration `D` is finite and positive, the section drawn through its Visual Index has `aria-valuemax` `round(D)`, draws each scene mark at `min(seek time, D) / D` of the ruler's width and the playhead at `min(position, D) / D`, and a click, tap or key on the ruler does nothing; while no answer has arrived, or with no such duration, the ruler has `aria-valuemax` 0 and no time labels.
SPEC-CORE-065 I3. On a touch environment, the shelf, the collection panel, page tabs, inspector tabs and the breadcrumb remain horizontally scrollable, as they were. The intelligence Scenes section scrolls on no horizontal axis; its list scrolls vertically.
SPEC-CORE-065 I4. On a mouse environment, no drawn item is clipped by a wrapper: the bounding box of every drawn card, tab and breadcrumb segment lies inside its container's box. A shelf with a "see all" link draws at most two rows. A shelf without one draws every card in wrapped rows. The collection panel keeps every track reachable through its vertical scroll. The intelligence Scenes section keeps every tile reachable through its list's vertical scroll, with no horizontal scroll.

## Checked, no action

- **The human's earlier rejections, revisited 2026-11-19.** SPEC-ADDON-104 rejected
  "pinning the card to the bottom" and "shrinking below 3 rows". With a scrolling list
  the human chose to keep the card fixed under the list, and rows are no longer counted.
- **The section never scrolling (SPEC-ADDON-089 I5)** existed because the old boxes showed
  two cards out of hundreds with no place in the video. The ruler stays as that place:
  its band shows what the list shows.
- **Ruler hover moving the list** (today's behaviour): rejected by the human. The list
  would jump on every pass over the ruler and back on leaving.
- **Ruler click also playing**: rejected by the human; finding and playing are split.
- **Following that always keeps the playing row second**: rejected by the human; a tile
  click would make the list jump. The list moves only when the playing row leaves view.
- **A seek from elsewhere resuming following**: rejected by the human; it would pull the
  list away from where the reader is looking.
- **A card inside the list after each described scene**: rejected by the human.
- **A fixed-height list inside the sheet**: rejected by the human (two scrollers).
- **A list that shrinks to nothing in a very short host**: rejected by the human; the
  list keeps one row and the host's body scrolls in that case only.
- **Remembering the scroll place across hiding the panel**, as the transcript does: not
  done. Following or the ruler reach any place quickly; each showing starts again.
- **Smooth scrolling for placing**: not used, so the 150 ms picture settle and the band
  see one position.
- **The `fillHeight` prop or measured overflow to pick the form**: every host passes
  `fillHeight: true`, and overflow depends on the layout it would choose. The documented
  `data-inspector-scroller` mark is the host's own statement.
- **Marking the stacked desktop inspector's tab panel**: considered and dropped. Its tab
  body is a bounded flex column (`PanelTabBody`), so the list scrolls itself there, as
  the transcript's does; a mark would point the transcript at a box that does not
  scroll.
- **Drawing only the tiles near view**: not needed at the default `max_frames` of 500.
  A larger setting mounts more tiles; that cost is accepted for a personal tool.
- **Up to 500 tab stops between the ruler and the card**: accepted; the ruler and its
  keys are the quick way along the list.
- **The section drawing its own header** (`labelledByHost` false): no host uses it today;
  it takes whichever form its ancestors give it.
- **The loading skeleton**: stays `3c` (SPEC-ADDON-093 I6), drawn inside the list's box.
- **The ruler's hover line on touch devices**: there is no hover; the ruler point is the
  only line drawn by touch.
