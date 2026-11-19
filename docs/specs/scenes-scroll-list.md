# Scenes: a scrolling list of every frame

SPEC-ID: SPEC-ADDON-152
SPEC-ID: SPEC-ADDON-153

Approval:

## Summary

The intelligence Scenes section shows a video's frames as a window of `R × c` tiles around
the point being looked at (SPEC-ADDON-089, 093, 104). To see other frames the reader moves
that point along the ruler. Since the 10-second fill (SPEC-ADDON-144) a video has a frame
every 10 s at most, up to 500, so the window covers a few minutes of a video and the
ruler has to be swept in small steps to find a scene. For the household's one user,
scrolling is much easier when looking for a scene.

This change draws every frame in one list that scrolls, the way the transcript does:

- **SPEC-ADDON-152, the list.**
  - Every frame is drawn, in `c` columns, in time order.
  - In a host that bounds the section's height, the list takes the height the ruler,
    card and action row leave and scrolls inside itself, so the panel body does not
    scroll. In a host that does not bound it (the phone sheet, the one-column
    inspector), the list is as tall as its content and scrolls with the host. The ruler
    stays pinned at the top and a one-line card at the bottom.
  - While playing, the list follows the playing frame. A reader's scroll stops following
    and shows a **Back to current position** chip.
  - The scene card describes the playing scene while following, and the scene at the top
    of the list otherwise.
- **SPEC-ADDON-153, the ruler as the list's map.**
  - The band on the ruler shows the part of the video the list shows.
  - A click, tap or drag on the ruler scrolls the list to that time and never plays.
    Hovering draws a line only.
  - A tile or the card plays from its time, as today.

SPEC-ADDON-104 (rows fill the height) no longer applies: there is no row count. It is
marked superseded in the ledger.

Agreed design: https://claude.ai/artifact/LQ5pW3HnepkWiJDPuVdnV1, saved in
`docs/process/reviews/feature-scenes-scroll-list/design/` (`Main.dc.html`,
`Short.dc.html`, `Phone.dc.html` and the shared `Panel.dc.html`). In `Main.dc.html` and
`Panel.dc.html`, the play button and time in the action row stand in for the player and
are not part of the design.

The design's visible decisions:

- D1. Workbench, one panel, 1400px window: from the top, the panel holds the ruler with
  its labels, the list, the full scene card and the action row. The ruler, card and action
  row do not move when the list scrolls. The list fills the height between them.
- D2. The list draws 8 columns at the 1024px panel. The playing tile has the accent
  outline, and following keeps the playing tile's row as the list's second row.
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

- **List**: the element holding the tiles. It is the section's own vertical scroll
  container (`overflow-y: auto`, `min-height: 0`), placed so it takes the height left in
  the section after the ruler, the card or placeholder, the stale note and the action
  row.
- **Bounded form**: the list's scroll height is greater than its client height, so the
  list scrolls itself. Hosts that give this form: the workbench panel body
  (`.media-detail-workbench-body`, whose child is stretched to its height) and the
  inspector tab panel in its `panel` form.
- **Flow form**: the list's scroll height is not greater than its client height, and its
  nearest vertically scrolling ancestor (other than the document's root scroller) has a
  scroll height greater than its client height. Hosts that give this form: the phone
  sheet (`mobile-inspector-content`) and the inspector in its `column` form.
- **Scroller**: the list in bounded form; the nearest vertically scrolling ancestor in
  flow form. When neither scrolls (every frame fits), there is no scroller and nothing
  scrolls.
- **Visible area**: the part of the scroller's client box that tiles can be seen in. In
  flow form this excludes the pinned ruler and the pinned card.
- **Row step**: one drawn tile's height (picture and time label) plus the grid's row gap,
  measured from a drawn tile.
- **Visible row**: a row with at least half of its tile height inside the visible area.
- **Top row**: the first visible row; with none (a list shorter than half a tile), the
  row at the top of the visible area.
- **Following**: a flag. While it is set and a `mediaController` is present, the list
  keeps the playing frame's row in view.
- **Focus row placement**: a frame's row is placed when the scroller's `scrollTop` is set
  so that the row before it is the first row in the visible area (the frame's row is the
  second), clamped to the scroll range. Row 0 is placed at the top.
- `c`, `L`, `i`, `n`: as SPEC-ADDON-089 and 093 define them, with `c` measured from the
  list's content width (see Revises, SPEC-ADDON-093 I5).

## Required items

### 1. Normal flow

1. The reader shows the Scenes panel (or tab) for a video. The section loads as today
   (SPEC-ADDON-089 I6, I7; SPEC-ADDON-080 I6).
2. The section draws, from the top: the ruler with its labels, the list, then the Visual
   Index placeholder or the scene card, the stale note and the action row. In flow form
   the ruler is pinned at `top: var(--inspector-sticky-top, 0px)` and the card or
   placeholder at `bottom: 0` of the scroller; the stale note and the action row come
   after the list and scroll with it.
3. The list draws all `n` frames in `c` columns. Following is set.
4. With a `mediaController`, the playing frame's row is placed (Terms) without
   animation. Without one, the list starts at its top and nothing follows.
5. While following, each change of the playing frame's row places the new row. A change
   within the same row does not scroll.
6. The reader scrolls the list with the wheel, a finger (`touchmove`) or by pressing on
   the scrollbar (a `pointerdown` of a mouse whose target is the scroller itself).
   Following is cleared. In flow form these inputs count only while the Scenes panel is
   the one shown, because the sheet's scroller is shared with the other tabs. A
   programmatic scroll never clears following.
7. While following is clear and a `mediaController` is present, the chip **Back to
   current position** is drawn at the top of the visible area, centred, over the tiles.
   Activating it sets following, which places the playing row.
8. A tile or the scene card plays from its time (seek, then play, through
   `mediaController` or `videoRef` as today) and sets following.
9. The scene card describes the last succeeded, labelled scene at or before the point
   being looked at (SPEC-ADDON-090 I9 as revised): the playback time while following, and
   the first frame of the top row otherwise.
10. The ruler's band runs from the start of the first frame of the first visible row to
    the start of the frame after the last frame of the last visible row, or to `L`.
11. Ruler, mouse: moving over it draws a thin line at the pointer, and leaving removes
    it. Nothing else changes. A click places the row of the frame at that time and
    clears following. It does not seek.
12. Ruler, touch or pen: a tap, or a horizontal drag of at least 8 px, places the row of
    the frame under the finger, continuously during the drag, and clears following. It
    never seeks. A touch handed to vertical scrolling changes nothing.
13. Ruler, keyboard (while it has focus): `←` / `→` move a ruler point one frame
    back or forward (the first press starts from the playing frame while following,
    otherwise from the first frame of the top row), `Home` / `End` move it to the first or
    last frame. Each move draws the line at the point, places its row and clears
    following. `Enter` plays from the point when one is set, and sets following. The ruler
    point is cleared when the ruler loses focus.
14. A picture is requested for a tile once its row has been within one row step of the
    visible area for 150 ms without the list scrolling in between. Once requested, its
    picture stays drawn until the file changes or the panel is hidden.
15. When `c` or the row step changes (a resize, the first picture's ratio, a classic
    scrollbar appearing), the list is redrawn so that, while following, the playing row is
    placed again, and otherwise the first frame of the top row stays in the top row.
16. Hiding the panel and showing it again, or changing the file, starts following again.

### 2. Failure cases

- **No `mediaController`**: nothing follows, no chip, no playback marker; the list starts
  at its top. Ruler and tiles work as stated; a tile plays through `videoRef`.
- **The playback time is before the first frame**: the playing row is row 0.
- **Few frames that all fit**: there is no scroller; following and the chip change
  nothing visible. The card and band still follow the rules above (the top row is row 0).
- **A list shorter than one row** (a very short panel): the list still scrolls at that
  height; nothing else changes size.
- **A picture request fails**: unchanged (a `.loft` tile keeps a blank block with its
  label and click-to-seek, SPEC-ADDON-089 I7).
- **Frames arrive or change while shown** (a regeneration, a WS reload): the list is
  redrawn; while following, the playing row is placed; otherwise the frame nearest the
  previous top frame's time stays in the top row.

### 3. States

- **Collapsed / loading / expanded**: unchanged (SPEC-ADDON-089 §3). Loading draws the
  skeleton of `3c` blocks (SPEC-ADDON-093 I6).
- **Following set / clear**: set on show, on file change, by a tile, the card, the chip
  and the ruler's `Enter`. Cleared by a reader's scroll (§1.6) and by any ruler move
  (§1.11–1.13).
- **Card full / one line**: one line in flow form; in bounded form one line when the
  list's client height, computed as if the full card were drawn, is less than two row
  steps; full otherwise. The test uses the full card's height whichever card is drawn,
  so the choice does not flip back and forth. The Visual Index placeholder has the
  height of the card it stands in for.
- **Visual Index states**: unchanged (SPEC-ADDON-089 §3, SPEC-ADDON-090).

### 4. Data read and written

- Read: `clip-timestamps`, `visual-index`, frame and scene-tile pictures, as today.
  Pictures as §1.14 states.
- Written: nothing. Following and the scroll position are not stored.

### 5. External services

None. The frame route runs ffmpeg in the intelligence addon on a cache miss; §1.14 and
§10 bound how many it is asked for.

### 6. Authorization

Unchanged: the same addon routes, with `X-Lit-Drive` and the per-drive policy, as today.

### 7. Effect on existing features

- The transcript panel and the other `player-side` panels are unchanged.
- `useSceneRows` and the `R` measurement (SPEC-ADDON-104) are removed, with their
  tests: `ScenesSectionRows.test.ts`, `frontend/e2e-components/scenes-section-rows.spec.ts`,
  `scenes-section-rows-desktop.spec.ts`, `scenes-section-rows-scrollbar-desktop.spec.ts`
  and `scenes-section-rows.cases.ts`. They test a row count that no longer exists.
- Tests of the window (`windowStartFor`, nine or `R·c` tiles, hover moving the grid, a
  mouse click on the ruler seeking) are rewritten to the new rules; the properties they
  protected (one tick per frame, the playing outline, the 150 ms settle, no file
  shortcut from the ruler, `.loft` pictures from the scene-tile route) stay tested.
- The Scenes cases in `frontend/e2e-layout/no-horizontal-scroll.spec.ts` and its fixture
  assert that the section never scrolls; they become "never scrolls horizontally, and
  scrolls vertically only in the list" (SPEC-CORE-065 I3, I4 as revised).
- The keyboard-shortcuts and video pages of the user guide describe hovering and
  clicking the ruler; they are updated.

### 8. Error behavior

Unchanged: the same messages for Visual Index actions; nothing new is logged.

### 9. User-visible behavior

- Everything in §1. New text: the chip **Back to current position** (ja: 「現在位置に戻る」), a
  new key in the addon's messages.
- The ruler no longer plays on a mouse click; the user guide says so.
- The section's height no longer depends on the frames shown: in bounded form it is the
  host's, in flow form it is its content's.

### 10. Non-functional

- Pictures: opening the panel requests at most the tiles within one row step of the
  visible area. Scrolling requests nothing until the list has been still for 150 ms.
  A picture is never requested twice for the same tile while the panel stays shown.
- Frames: a native video has at most 500 (`max_frames`). A YouTube `.loft` not yet
  downloaded has its storyboard tiles, with no cap. Scrolling must stay smooth with the
  largest list on the production drives; whether tiles far from view are drawn is left
  to the implementation, as long as the scroll height, the band, the top row and Tab
  order behave as stated.
- No new request, store, or core change beyond tests, fixtures and docs.

## Touch points

- `addons/intelligence/frontend/ScenesSection/` (Container, Presenter, `scenesModel.ts`,
  hooks; `useSceneRows.ts` removed; a follow hook added) and its `__tests__/`.
- `addons/intelligence/frontend/messages/{ja,en}.json`: the chip's text.
- `frontend/e2e-components/` Scenes cases and fixtures (`scenes-section*.ts`,
  `fixtures/scenesSection*.ts*`); the `scenes-section-rows*` files removed.
- `frontend/e2e-layout/no-horizontal-scroll.spec.ts` and
  `fixtures/no-horizontal-scroll.html`, Scenes part.
- `docs/user-guide/video.md` (Watching a video) and `docs/user-guide/keyboard-shortcuts.md`
  (Scenes timeline).
- `docs/specs/INDEX.md`: rows for 152 and 153; SPEC-ADDON-104 → superseded.
- Rules passed through: `.claude/rules/frontend-conventions.md` (Container/Presenter, the
  design system), `DESIGN.md` (accent chip, radius, the touch-scroll rules of §8.5),
  `.claude/rules/design-decisions.md` (Addons: no core-to-addon dependency).
- Order: the addon change merges in its repository first; the core PR bumps the
  `addons/intelligence` pointer with the core tests and docs.
- No protected path is edited.

## Invariants

Tests of the revised invariants cite the revised spec's id; tests of the lines below cite
SPEC-ADDON-152 (I1–I6) or SPEC-ADDON-153 (I7–I9).

I1. The list draws one tile for each of the `n` frames, in time order, in `c` columns, and its scroll height is the height of all `ceil(n / c)` rows whether or not every tile is mounted. Nothing else in the section scrolls vertically, and nothing scrolls horizontally. In bounded form the panel body that holds the section does not scroll.
I2. While following is set with a `mediaController`, after each change of the playing frame's row the playing row is placed (Terms); within a row no scroll happens. Following is never cleared by a programmatic scroll, and is cleared by the wheel, `touchmove` or a mouse `pointerdown` on the scroller itself; in flow form only while the Scenes panel is the one shown.
I3. The chip **Back to current position** is drawn exactly while following is clear and a `mediaController` is present. Activating the chip, a tile, the scene card or the ruler's `Enter` sets following; a tile, the card and `Enter` also seek and play.
I4. The point the scene card is chosen at (SPEC-ADDON-090 I9 as revised) is the playback time while following, and the start of the first frame of the top row otherwise. In flow form the card is one line; in bounded form it is one line exactly when the list's client height with the full card's height would be under two row steps.
I5. A picture is requested only for a tile whose row has stayed within one row step of the visible area for 150 ms with no scroll in between, at most once per tile while the panel stays shown, and a drawn picture is not removed while the panel stays shown and the file is the same.
I6. When `c`, the row step or the frame list changes, the first frame of the top row before the change is in the top row after it, or, while following, the playing row is placed.
I7. The ruler's band runs from the first frame of the first visible row to the start of the frame after the last visible row's last frame, or to `L`, and changes when the list scrolls.
I8. No ruler input seeks except `Enter` with a ruler point set. A mouse click, a tap or a horizontal drag of at least 8 px places the row of the frame at that time and clears following; mouse movement only draws the line. `←`, `→`, `Home`, `End` and `Enter` act on the ruler while it has focus and never trigger a page shortcut.
I9. In flow form the ruler stays in view at the top of the scroller (below `--inspector-sticky-top`) and the card at its bottom while the list scrolls; in bounded form the ruler, card, stale note and action row keep their positions while the list scrolls.

## Revises

SPEC-ADDON-089 I1. The ruler draws exactly one tick per `clip-timestamps` row, at `min(start, L) / L` of its width, with `L` as §2 of docs/specs/scene-timeline.md defines it, except that when the answer has arrived with no rows `L` is the player's duration when that is a finite positive number (otherwise 0), and while no answer has arrived `L` is 0. The list draws every frame, as docs/specs/scenes-scroll-list.md I1 states.
SPEC-ADDON-089 I2. While a `mediaController` is present, the ruler's playback marker and the accent outline of the playing tile follow the shared media clock. Only three things seek: `Enter` on the ruler with a ruler point set, a tile and the scene card. Each seek is followed by play, through `mediaController` or, without one, through `videoRef`. Mouse movement over the ruler draws a line and moves nothing.
SPEC-ADDON-089 I3. For a `touch` or `pen` pointer event the ruler never seeks. A tap or a horizontal drag of at least 8 px scrolls the list to that time, as docs/specs/scenes-scroll-list.md I8 states. A touch handed to vertical scrolling changes nothing.
SPEC-ADDON-089 I5. The file page draws at most one Scenes panel for a video, and only in the states §3 does not hide, and nothing for any other file type. The intelligence manifest has exactly one `scenes` entry, in `player-side`, and no `visual-index` or `clip-frames` entry. Inside the section only the list scrolls, and only vertically. The section is as wide as its host's content box.
SPEC-ADDON-089 I8. Pictures are requested as docs/specs/scenes-scroll-list.md I5 states.
SPEC-ADDON-090 I9. When the policy is off, when the first `visual-index` request fails, answers 404, or answers `eligible: false` or `available: false`, the section draws no Visual Index part: no dot count, no progress, no marks, no tile dots, no scene card and no actions. Whether a `.loft` is eligible is the `visual-index` answer's to say. The list and ruler are otherwise unchanged. Otherwise every active-run scene is marked at its seek time (`section_start`, or `start_time` when that is null), styled by its status as §9 of docs/specs/scene-timeline.md says. A tile carries the dot exactly when a `succeeded` scene with `section_start` has its seek time in the tile's range, from its frame's `start` up to the next frame's `start`, the first tile also taking a seek time before it, or a `succeeded` scene without `section_start` has its `start_time` within 0.05 s of its frame's `start`. The scene card shows the last succeeded, labelled scene whose seek time is at or before the point docs/specs/scenes-scroll-list.md I4 names (or the first such scene before all of them), with its seek time as its time label, its `visible_text` and never its `transcript_excerpt`. Activating the card seeks to that scene's seek time and sets following.
SPEC-ADDON-093 I3. Pictures are requested as docs/specs/scenes-scroll-list.md I5 states; the pictures requested are those of tiles near the visible area, never of the whole list at once.
SPEC-ADDON-093 I4. The ruler's band is as docs/specs/scenes-scroll-list.md I7 states.
SPEC-ADDON-093 I5. `W` is the list's content width (the section's width less a classic scrollbar). A change of `W` that changes `c` redraws the list in the new column count, keeping the top row as docs/specs/scenes-scroll-list.md I6 states, without a travel animation.
SPEC-CORE-065 I3. On a touch environment, the shelf, the collection panel, page tabs, inspector tabs and the breadcrumb remain horizontally scrollable, as they were. The intelligence Scenes section scrolls on no horizontal axis; its list scrolls vertically.
SPEC-CORE-065 I4. On a mouse environment, no drawn item is clipped by a wrapper: the bounding box of every drawn card, tab and breadcrumb segment lies inside its container's box. A shelf with a "see all" link draws at most two rows. A shelf without one draws every card in wrapped rows. The collection panel keeps every track reachable through its vertical scroll. The intelligence Scenes section keeps every tile reachable through its list's vertical scroll, with no horizontal scroll.

## Checked, no action

- **The human's earlier rejections, revisited 2026-11-19.** SPEC-ADDON-104 rejected
  "pinning the card to the bottom" and "shrinking below 3 rows". With a scrolling list the
  card below the list is where the human chose to keep it (question of 2026-11-19), and
  rows are no longer counted.
- **The section never scrolling (SPEC-ADDON-089 I5)** existed because the old boxes showed
  two cards out of hundreds with no place in the video. The ruler stays as that place:
  its band shows what the list shows.
- **Ruler hover moving the list** (today's behaviour): rejected by the human. The list
  would jump on every pass over the ruler and jump back on leaving.
- **Ruler click also playing**: rejected by the human; finding and playing are split, and
  a tile plays.
- **A card inside the list after each described scene**: rejected by the human.
- **A fixed-height list inside the sheet**: rejected by the human (two scrollers).
- **Remembering the scroll place across hiding the panel**, as the transcript does: not
  done. The list is quick to reach again by following or the ruler; each showing starts
  following.
- **Smooth scrolling for following and ruler jumps**: not used. Jumps are instant so the
  150 ms picture settle and the band see one position.
- **The `fillHeight` prop to pick the form**: every host passes `true`, so the form is
  measured (Terms).
- **Measuring `.loft` storyboard sizes on production**: not done here. §10 leaves the
  drawing method to the implementation; R-5 uses the longest `.loft` on the test drive.
- **The loading skeleton**: stays `3c` (SPEC-ADDON-093 I6).
