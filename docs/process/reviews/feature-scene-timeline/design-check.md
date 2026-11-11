# Design check

at: 929422d0d7a4cd1d6fa244c33fec809d81577f9e
design: docs/process/reviews/feature-scene-timeline/design/

## Decisions read from the design
- Main (384 w): panel padding 16, gap 14 between header, ruler block, grid, scene card, action row (Main.dc.html:23)
- Main: header = film icon 14, "シーン", frame count, green dot + scene count, chevron-up at right; 14px, muted (Main.dc.html:24-30)
- Main: ruler 44 px tall, radius 8, bg #231216; window band rgba(245,230,232,.10), no edge lines; ticks top 16 / bottom 8, 1 px; scene marks 7 px dot + 2 px line green; hover line 1 px light; play line 2 px red (Main.dc.html:33-46)
- Main: label row 14 px high, 11 px muted, labels 0:00, 5:00, 10:00, 15:00, end (Main.dc.html:47-53)
- Main: grid 3 columns, gap 12 / 8, tiles 4:3, radius 8, time label 12 px centered; playing ring 2 px red offset 2; browse ring 2 px light; scene dot 8 px top-left (Main.dc.html:56-65, 168-173)
- Main: scene card padding 10/12, radius 12, bg #231216, hover #2f191b; time 12 px with dot, label 14 px, text 12 px max 2 lines; text row absent when the scene has no text (Main.dc.html:19-20, 68-76)
- Main: action row: ghost "シーンを作り直す", 12 px, padding 6/10, radius 16, right aligned (Main.dc.html:17, 88-91). The play button at the bottom left is board-only (spec line 49).
- SceneStates: row 1 filled "Create scenes" button 13 px, padding 8/14, radius 16, bg #2f191b, header with no scene count (SceneStates.dc.html:14, 92-96)
- SceneStates: row 2 header has dot + "3 / 6" + spinner, no marks, no action (SceneStates.dc.html:97-101)
- SceneStates: row 3 marks green; failed mark hollow red (border 1.5 px) with line rgba red .45; note "1 件失敗" left, filled "失敗した 1 件をやり直す" right (SceneStates.dc.html:72-74, 102-106)
- SceneStates: row 4 stale: amber line 12 px above action row; filled "シーンを作り直す" (SceneStates.dc.html:50-52, 107-111)
- LongVideo: ruler 36 px, 500 ticks across the full width, labels 0:00 1:00:00 2:00:00 3:00:00 4:09:30 with space between, window band with inset 1 px edge lines (LongVideo.dc.html:26-39)
- Collapsed: loading = header, flat ruler block 36 px #231216, empty 14 px label row, 9 blocks #2f191b with 40%-wide 14 px label bars; gap 14 (Collapsed.dc.html:30-47)
- Collapsed: collapsed header is one row with chevron-down (Collapsed.dc.html:18-22)

## Findings
### D-1 Main / SceneStates: scene card is about twice the height of the design's card when the scene has no text
- design: card shrinks to its content; the text row is absent when there is no text, so time + one label line (about 66 px) (Main.dc.html:73-75)
- implementation: card reserves two label lines and two text lines, so a scene with only a label draws a card about 122 px tall with an empty lower half (desktop-384-hover-browse.png, phone-390-expanded-scenes.png; ScenesSectionPresenter.tsx:539, 542 `min-h-[2.4rem]`, `min-h-[2.45rem]`). The spec states the reserved height (scene-timeline.md:54, 407) but does not attribute it to the human's decision.
- visible: at a glance

### D-2 Collapsed (loading): the loading ruler is lighter than the tile blocks, the design's is darker
- design: ruler block is flat #231216, darker than the #2f191b tile blocks (Collapsed.dc.html:37, 43)
- implementation: the disabled real ruler is drawn with its full-width window band at 10 % white, so it is the lightest element on screen (about rgb 71,49,50 against tiles rgb 47,25,27) (desktop-384-loading.png; ScenesSectionPresenter.tsx:445-452, 443). The ruler is 44 px instead of 36 px, and the gap from ruler to the first tile is about 42 px against the design's 34 (ruler 36 + 6 + 14 + 14 = 70 from ruler top; here 44 + 42 = 86 from ruler top).
- visible: at a glance

### D-3 SceneStates row 2: first-run progress header has no green dot
- design: dot + "3 / 6" + spinner (SceneStates.dc.html:30-35, 98)
- implementation: "Scenes 500 1 / 24 (spinner)" with no dot (desktop-384-state1-first-run.png; ScenesSectionPresenter.tsx:186-197 draws the dot only for `visual.count`). Spec row 1 states no dot (scene-timeline.md:243) without attributing it to the human.
- visible: side by side

### D-4 LongVideo: ruler of a long video fills only part of the width and its end labels collide
- design: ticks span the whole ruler (4:09:30 file), five labels with space between (LongVideo.dc.html:28-39)
- implementation: for the file whose player duration (9:46:36) is longer than its frames (4:09:30), ticks and band fill only the left ~43 % as one solid block, and the last two labels "8:00:00" and "9:46:36" touch with no gap ("8:00:009:46:36") (desktop-384-long-and-create.png, desktop-384-state1-first-run.png; ScenesSectionPresenter.tsx:500-513, timeLabels in scenesModel.ts). Data-dependent, but the board's longest case is drawn without a collision and with spread ticks.
- visible: at a glance

### D-5 SceneStates: action buttons are sized differently
- design: filled button 13 px text, padding 8/14; ghost button 12 px text, padding 6/10, so ghost text sits 10 px from the right edge (SceneStates.dc.html:14,16; Main.dc.html:17)
- implementation: both kinds use `text-xs px-4 py-2` (12 px, padding 8/16); the ghost "Regenerate scenes" text sits about 16 px from the right edge and is as tall as the filled button (desktop-384-hover-browse.png, desktop-384-long-and-create.png; ScenesSectionPresenter.tsx:336-340)
- visible: only by measuring

### D-6 Header while a re-run is in progress shows an extra "…" and is not drawn in the design
- design: running state shows "3 / 6" and a spinner (SceneStates.dc.html:98); no "…" form
- implementation: "Scenes 269 • 6 … (spinner)" (desktop-384-state2-update-running.png, first-run capture; text from `visual.progress.text`, ScenesSectionPresenter.tsx:198-209). The spec defines `…` while `selected_count` is 0 (scene-timeline.md:253-254).
- visible: side by side

### D-7 Not shown in R-5, cannot be checked
- SceneStates row 3: hollow red failed mark and 35 % pending marks, note "N failed" at left, filled retry button beside Regenerate (decisions.md `pending:` says it could not be produced)
- SceneStates row 4 stale: amber line above the action row, Regenerate drawn filled
- Main hover state on the scene card at rest vs hover is shown only for rest (hover:bg-sand not captured in the second run)
- Collapsed.dc.html collapsed header on the phone with the section collapsed after the loading state is in desktop-384-collapsed.png only at 384 and phone-390-collapsed.png (first run); loading at 390 exists (phone-390-loading.png) but was not compared here
- LongVideo.dc.html window band inset edge lines (1 px at 50 % white) are not in the implementation's band (ScenesSectionPresenter.tsx:445-452); the build cannot be compared since the long-file shot has no distinct band
- visible: not shown in R-5

TOTAL: 7 findings
