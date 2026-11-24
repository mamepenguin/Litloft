# Decisions

decision: continue (r1, HUMAN_REVIEW_REQUIRED for unspecified_behavior; the user chose "全画面で上げる (Recommended)": the fixed buttons sit on the header's centre line on every screen, not only file pages. The sidebar spacer finding is fixed and the unit assertion tightened in the commit after r1; the spec's D2 and §7 are superseded by behavior.md for this fix.)
ran_in_app: yes
at: 29b4b23466650e4708539381ec17755b7c3d2f09
by: agent
evidence: |
  Bug fix `docs/process/reviews/fix-file-header-row-alignment/behavior.md` (SPEC-CORE-094 D2,
  revised so the trail keeps 16px inside the content's box), re-run against `Header.tsx` at the
  SHA above. Scratch stack `LITLOFT_PORT=3995 docker compose -p litloft-r5-header -f
  docker-compose.yml -f .r5/override.yml up -d --build backend frontend knowledge intelligence`,
  driven at 1440x900 and 1280x800 with Chromium (Playwright) script `.r5/r5-run2.cjs`
  (log `.r5/r5-run2.log`); state churn checked with `.r5/r5-churn2.cjs`. Every number is
  `getBoundingClientRect`. The first run's record follows under "First run", the second run's
  numbers under "Second run".
pending: None for the states above; every measured value matches D2 revised. Not attempted, as
  before: a real notched iPhone / the iOS app with a non-zero `env(safe-area-inset-top)` (the
  inset was 0 throughout), and audio and playback as seen and heard
  (`docs/process/PROJECT.md`, `agent_cannot_verify`). Seen but outside the changed path: the
  collection page logs one 404 for `/api/drives//addon-policies` (empty drive in the URL) and
  the video page three 404s for the intelligence addon's transcript, subtitles and picture-text
  of this scratch clip; nothing was drawn from either and neither moved the trail.

## First run

  Started a scratch stack from this checkout:
  `LITLOFT_PORT=3995 docker compose -p litloft-r5-header -f docker-compose.yml -f .r5/override.yml up -d --build
  backend frontend knowledge intelligence`, then drove http://localhost:3995 with Chromium (Playwright)
  scripts under `.r5/` (`r5-header.cjs`, log in `.r5/r5-header.out`; `hdr-toggle2.cjs`, `hdr-toggle3.cjs`
  for the sidebar/tree interaction). Drive `scratch` (`.r5/drive`, reused `data/`, `drives.json`,
  `passwords.json`) held the video `notes/clip.mp4` (kuZZg9SDNqgx) and the note
  `notes/meeting-notes.md` (zGfJzkpWk_vh); a scratch collection `lbarfAIUnENp` was created through
  `POST /api/drives/scratch/collections` + `/items` to reach the collection route. Every number below
  is `getBoundingClientRect` (px, 2 decimals where it matters), not a stylesheet reading.

  1. Left end of the trail. File page `/drive/scratch/notes?file=<id>` with the sidebar inline and open,
     tree closed: at 1440x900 and at 1280x800 the sidebar box is 0..240 (right border at x=240), the
     header box starts at x=240, and the home crumb `a[aria-label="Home"]` (16x16) starts at x=256, so
     +16px from the sidebar's right border and +16px from the header's left edge; the trail's own box
     (`file-detail-chrome`) starts at the same 256, and `file-header-row` at 240. After closing the
     sidebar with the menu button: sidebar -240..0, header left=0, home and chrome at x=112 (+112 from
     the sidebar's right edge, +112 from the header's left edge, i.e. the tree button's right edge 100
     + 12). With the tree open (clicking the tree button closes the sidebar; the tree is inline at
     0..280 and the header spans 0..1440): home and chrome at x=280, +280 from the header's left edge
     and 0px from the folder tree's right edge. Opening the sidebar from that state draws it as an
     overlay (0..240) and the trail stays at 280, 40px from the overlay's border. Identical values for
     the Markdown note at both widths. Observation, and it is what D2 says: the tree case has a 0px
     gap because D2's first term is the content's left edge; only the header's own left end carries
     the 16px term.
  2. Vertical centres. The same six values hold in all six desktop states (1440 and 1280, video and
     note, sidebar open / sidebar closed / tree open): menu button (x=12, top=8, 40x40) centre y=28;
     tree button (x=60, top=8, 40x40) centre y=28; home icon 16x16 at y=19.5..35.5 centre y=27.5;
     breadcrumb nav (`nav` in `file-detail-chrome`, 20px tall for the video, 24px for the note) centre
     y=27.5 and every crumb link and the title text inside it centre y=27.5; search button (34x34,
     top=10.5) centre y=27.5; header box 0..56 centre y=28, header content excluding its 1px
     border-bottom 0..55 centre y=27.5. Difference: menu and tree sit 0.5px below the trail, the crumb
     text, the search button and the header's content line; menu to header box 0px. The 0.5px is the
     header's 1px bottom border, and the buttons' top=8 with a 40px box gives 28 (= 56/2), which is the
     arithmetic the spec states.
  3. Folder page `/drive/scratch/notes` and home `/` at 1440: menu centre y=28, header box centre y=28
     (content 27.5), search centre y=27.5 at x=1272..1306 on the folder page and x=1312..1346 on the
     home page; the folder page still shows its tree button at 60,8, the home page renders none. Neither
     page puts a crumb in the header: `file-header-row` is 0px tall and the folder/home breadcrumb is in
     the page body (home icon y=86..102), so only the fixed buttons could be measured there.
  4. Phone 390x844 (isMobile, hasTouch, deviceScaleFactor 2), file page: header row 0,5.5,300x44 (centre
     27.5); the two-line trail block is 64,5.5,184x44, centre y=27.5 (line 1 = the "notes" back chip,
     centre 17.5; line 2 = the title "Clip", centre 39.5); menu centre y=28, header box centre y=28
     (content 27.5), search centre y=27.5. The block starts at x=64 = the menu button's right edge (52)
     + 12, and the 16x16 home icon is not rendered below md. Folder page, same viewport: header row 0px
     tall (no crumb in the header, the breadcrumb is in the body at y=86..102), menu centre y=28, tree
     button visible at 60,8 centre y=28, search centre y=27.5.
  5. Collection route `/files/kuZZg9SDNqgx?collection=lbarfAIUnENp` at 1440: the centred column is
     `main div.max-w-6xl` at left=144 width=1152 with padding-left 16px, so its padded edge is x=160;
     the back control `button[data-testid="file-detail-back"]` is 160..217.77 and the home crumb
     225.77..241.77, i.e. the back control is 0px from the column's padded edge (+16 from the column's
     box). Centres: back, home, trail and search y=27.5, menu y=28, header box y=28 (content 27.5); no
     tree button on this route. The page scrolls vertically (document 1578px) and does not scroll
     horizontally: document width equals the viewport in every state measured above.

  Screenshots, top-left 700x120 of each desktop state:
  `docs/process/reviews/fix-file-header-row-alignment/shots/{1440,1280}-{video,markdown}-{sidebar-open,sidebar-closed,tree-open}.png`;
  full-page or full-viewport: `collection-1440.png` (+ `collection-1440-crop.png`), `folder-page-1440.png`
  (+ crop), `home-page-1440.png` (+ crop), `phone-file.png`, `phone-folder.png`.
pending: A real notched iPhone / the iOS app with a non-zero `env(safe-area-inset-top)` was not
  emulated (all measurements above ran with the inset at 0); audio and playback as seen and heard is
  out of R-5's reach (`docs/process/PROJECT.md`, `agent_cannot_verify`).

## Second run

```text
LITLOFT_PORT=3995 docker compose -p litloft-r5-header -f docker-compose.yml -f .r5/override.yml \
  up -d --build backend frontend knowledge intelligence
```

HEAD `29b4b23466650e4708539381ec17755b7c3d2f09`, stack up, `http://localhost:3995/` 200, then
`.r5/r5-run2.cjs` (video `kuZZg9SDNqgx`, note `zGfJzkpWk_vh` both opened as
`/drive/scratch/notes?file=<id>`; collection `lbarfAIUnENp`). Values are
`getBoundingClientRect` px.

1. Home crumb's left edge (`a[aria-label="Home"]`, 16x16) in the three states, identical at
   1440x900 and 1280x800 and identical for the video and the note:

   | state | sidebar | tree | header box | home | from sidebar border | from header left | from tree border |
   |---|---|---|---|---|---|---|---|
   | A sidebar inline open, tree closed | 0..240 (1px border) | 240..240 (closed) | 240..1440 / 240..1280 | 256..272 | +16 | +16 | - |
   | B sidebar closed, tree closed | -240..0 | 0..0 (closed) | 0..1440 / 0..1280 | 112..128 | +112 | +112 | - |
   | C tree open | -240..0 (closed) | 0..280 | 0..1440 / 0..1280 | 296..312 | - | +296 | +16 |

   The trail's own box (`file-detail-chrome`) starts at the same x as the home crumb in every
   state (256 / 112 / 296), and `file-header-row` carries the matching inline `padding-left`
   (16px / 112px / 296px); at 1440 the row spans 240..1272, 0..1272 and 0..1272. The fixed bar
   (menu + tree buttons) is 12..100, so state B is the buttons' right edge 100 + 12, state C is
   the tree's border 280 + 16, and state A is the right pane's edge 240 + 16, which is also the
   header's left end 240 + 16. The first term of D2 revised (16px inside the content's box) is
   the binding one in A and C and is dominated by the buttons in B.

2. Collection route `/files/kuZZg9SDNqgx?collection=lbarfAIUnENp` at 1440x900: header row
   `padding-left: 160px`, `file-detail-chrome` and the back control at 160, home at 225.77..241.77.
   The centred column `main div.max-w-6xl` is 144..1296 with `padding-left: 16px`, padded edge
   160, so the back control is 0px from the padded edge and +16 from the column's box. The trail
   did not move from the first run.

3. Vertical centres (spot check and, in fact, every state): menu button 12,8 40x40 centre y=28;
   tree button 60,8 40x40 centre y=28; home icon centre y=27.5; breadcrumb nav centre y=27.5
   (20px tall on the video, 24px on the note); search 34x34 at top 10.5, centre y=27.5; header box
   0..56 centre y=28, header content excluding its 1px border-bottom centre y=27.5. Same relation
   as the first run: the buttons sit 0.5px below the trail and the header content line, and on the
   56px header's centre line.

4. Ordinary use around the change: tree open then closed returns the trail 296 -> 256; closing the
   inline sidebar with the menu button gives 112; opening the tree from the inline-sidebar state
   closes the sidebar (-240..0) and leaves the trail at 296; widening that state from 1280 to 1440
   keeps it at 296 (`.r5/r5-churn2.cjs`). The document width equalled the viewport in all 13
   measured states, so nothing overflows horizontally.

Screenshots, top-left 700x120 of each desktop state, prefix `r2-`:
`docs/process/reviews/fix-file-header-row-alignment/shots/r2-{1440,1280}-{video,markdown}-{sidebar-open,sidebar-closed,tree-open}.png`
and `r2-collection-1440.png`.
