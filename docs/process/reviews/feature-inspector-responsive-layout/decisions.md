# Decisions

decision: ship — the owner chose "出荷する (Recommended)" on 2026-11-12 for r6 (HUMAN_REVIEW_REQUIRED: unspecified_behavior, the stacked mini-player suppression of spec 082.3 implemented in files the touch points did not list).
ran_in_app: yes
at: 5d0368f6a54716aba05e34eedad9416b8de24ddd
by: agent
evidence: |
  Re-run 2 at 5d0368f6a (after ef4c02629 "separate the Info header and stack it on one row" and
  2d0d1af75 "keep the duration beside the title in the stacked header"), for the Info header block.
  Same environment as below: the worktree's frontend image rebuilt at 5d0368f6a, one extra container
  on video_share_default published on :3100 (removed afterwards), against the running backend;
  Playwright channel "chrome", headless, dark colour scheme, video Alx1ShvKJ5ny opened by clicking
  its card in the アニメ listing, tree:enabled:動画 = true (not set for the phone). New screenshots
  are the r5/rerun2-*.png files.

  - 900x700 stacked, Info selected: header block is a grid on one row. Title at x=16 w=366, 16px,
    nowrap, ellipsis (scrollWidth 533 > 366, so the real title is truncated with "..."); duration
    "17:46" beside it at x=394; Like / Favorites / Verified / AI / quote / more at the right
    (x=449..884, the pane's right padding). "+ Add tag" on the next row (y=490, full width 868).
    Rule (1px, rgba(255,255,255,0.08)) at y=518, full width; "Scenes" at y=523 w=868 (max-width
    none), Comments under it. PASS.
    (r5/rerun2-900x700-video-stacked-info-dark-artboard-SmallWindow.png)
  - 820x1180 stacked, Info selected: the same one-row header (title x=16 w=286 truncated with an
    ellipsis, duration x=314, actions x=369..804), "+ Add tag" under it, rule at y=695 w=788,
    Scenes full width (788). PASS. (r5/rerun2-820x1180-video-stacked-info-dark-artboard-Portrait.png)
  - Long title: the title above (533px of text) does not fit at either stacked width; it truncates
    with an ellipsis and the action row keeps its full width at the right edge, nothing wraps or is
    pushed off. PASS.
  - 1180x820 beside, Info: multi-row header as before (title 20px on two lines, duration, Like /
    Favorites / Verified, AI / quote / more, "+ Add tag"), then the rule at y=337 (w=351), Scenes
    at y=342 (max-width 384px). PASS. (r5/rerun2-1180x820-video-beside-info-dark-artboard-Main.png)
  - 390x844 phone, sheet opened with the inspector button, Info: multi-row header, rule at y=574
    (w=358), Scenes at y=579. PASS. (r5/rerun2-390x844-video-sheet-info-dark-artboard-PhoneInfo.png)
  - Resize while playing: 1180x820 beside, Info, playing, marker set on the <video>; viewport set to
    900x700: the same <video> (marker kept), not paused, currentTime 1.67 -> 3.77; form stacked; the
    header body switched from block to grid and lays out as in the 900x700 case above. PASS.
    (r5/rerun2-1180x820-video-playing-before-resize.png,
    r5/rerun2-900x700-video-playing-after-resize-from-1180x820.png)
  - Measured gaps, for the design check: "+ Add tag" bottom to the rule 8px; the rule line to the
    "Scenes" row 4px. No page errors in these runs.

  Re-run at 246ed978a (after 580c0f784 "keep the tree-yield store across a layout remount" and
  246ed978a "restore the stacked canvas scroll after find"), for the two FAILs of the run at
  4efad1144 and a short regression. Same environment as below: the worktree's frontend image rebuilt
  at 246ed978a, run as one extra container on video_share_default published on :3100, against the
  running backend; Playwright with channel "chrome", headless. New screenshots are the
  r5/rerun-*.png files.

  Case 1 again (was BUG), 1180x820, tree:enabled:動画 = true, video Alx1ShvKJ5ny:
  - Direct load by URL, 3/3: tree yielded on load (data-inspector-fit=beside, row x=0 w=1180,
    inspector 383px at x=797, button "Show tree", tree:enabled still "true"). First press of the tree
    button: pane back (row x=280 w=900, form stacked, inspector 900 wide under the player), label
    "Hide tree", aria-pressed true, tree:enabled still "true" (nothing written). Second press hides
    it and writes "false" (beside again), as a user hide should. PASS.
    (r5/rerun-1180x820-video-directload-tree-button-pane-back.png,
    r5/rerun-1180x820-video-directload-tree-button-second-press-hides.png)
  - Listing, "Show tree" pressed there, SPA open, F5, then the tree button, 3/3: after F5 yielded
    (beside, "Show tree", "true"); the press brings the pane back (row x=280 w=900, stacked, "Hide
    tree") with tree:enabled still "true"; going back to the listing shows the tree on. PASS.
    (r5/rerun-1180x820-video-reload-then-tree-button-pane-back.png)
  - React error #418 (hydration mismatch) was reported in 3/3 of these runs. Located: it fires on
    the plain page load of the folder listing with tree:enabled = true stored (not on the file page,
    not on reload of it). The develop stack on :3000 (frontend image built 2026-11-11, main checkout
    at bf57da0a5) reports the same error at the same step 3/3.

  Case 2 again (was BUG), 900x700, media-layout-preference = stacked, inspector closed with the
  chrome button, canvas (main) wheel-scrolled to scrollTop 200 (max 298), find opened with the find
  button (2 runs) or Cmd+F (1 run), "色" typed, closed with Close find / Escape: scrollTop 200 at
  +0.3s, +1.8s and +5.8s after closing, find bar gone, inspector closed, transcript under the player.
  3/3 PASS. (r5/rerun-900x700-video-inspector-closed-transcript-below-scrolled.png,
  r5/rerun-900x700-video-inspector-closed-transcript-below-find-open.png,
  r5/rerun-900x700-video-inspector-closed-transcript-below-after-find.png)

  Regression:
  - Open from the listing at 1180x820 with the tree on, 3/3: tree yields (beside), tree:enabled stays
    "true"; the tree button brings the pane back (row x=280 w=900, stacked) with nothing written;
    still back 3s later and after closing and reopening the inspector. PASS.
    (r5/rerun-1180x820-video-spa-open-tree-yielded.png, r5/rerun-1180x820-video-spa-tree-reopened.png)
  - Playback across a find round-trip at 900x700 (inspector open, stacked), 3/3 (find button twice,
    Cmd+F/Escape once): the same <video> element (marker kept), not paused, currentTime advancing
    (e.g. 1.24 -> 3.48 with find open -> 5.02 after close). PASS.
    (r5/rerun-900x700-video-playing-after-find-roundtrip.png)
  - Reader scrolling right after closing find (setup as case 2): a wheel up of 1000px at the canvas
    150ms or 400ms after Close find moves the canvas to 0 and it stays 0 at +0.1s, +0.4s, +1.9s,
    +5.9s; a further wheel down of 100px then moves it to 100. The restore does not pull it back.
    Wheel down of 300px at 400ms goes to the transcript list's own scroller (canvas stays at 200,
    list at 300), the same as with no find round-trip (control run).
    Seen, for the author: a wheel sent 0ms or 50ms after Close find lands while the canvas has no
    scrollable content yet (main scrollTop 0, scrollHeight = clientHeight, nothing scrollable under
    the pointer); that wheel does nothing and the canvas then shows the restored 200. The control
    run without find moves the canvas to 0 with the same wheel. (r5/rerun-900x700-video-scroll-right-after-find-close.png)

  Earlier run at 4efad1144 (cases 1 and 2 above supersede its two BUG entries):
  Environment: the worktree's frontend image (frontend/Dockerfile, context = repo root) run as one
  extra container on the running stack's network (video_share_default), published on :3100, against
  the running backend and its test data. Browser: Google Chrome (Playwright channel "chrome",
  headless, light colour scheme), viewport set per case. Files: video Alx1ShvKJ5ny
  (drive 動画, folder アニメ, 17:46, has a transcript; tabs Info / Related / Transcript / Ask);
  PDF qqWKEWaGsrZD (drive 動画, root). Screenshots: docs/process/reviews/feature-inspector-responsive-layout/r5/.

  Case 1, 1180x820, tree on (tree:enabled:動画 = true), video opened by clicking its card in the
  folder listing (SPA):
  - Tree collapsed by itself on open; data-inspector-fit=beside; inspector 383px wide at x=797,
    full row height (716px), no overlap with the player (player 764x430 at x=16). Tab strip is the
    inspector's first row; title, duration, Like/Favorites/Verified, AI row and "+ Add tag" are inside
    #inspector-panel-info; Transcript tab hides them. tree:enabled stayed "true". Inspector icon
    PanelRightClose. (r5/1180x820-video-spa-open-tree-yielded.png)
  - Tree button ("Show tree"): pane came back (row x=280, w=900), form became stacked, nothing written
    (tree:enabled still "true"). Not collapsed again after 3s, nor after closing and reopening the
    inspector. (r5/1180x820-video-spa-tree-reopened.png)
  - "Hide tree" then wrote "false" and gave beside; reload kept "false" and the beside layout.
    (r5/1180x820-video-spa-after-reload.png)
  - BUG, direct load / reload: open the same file page by URL or press reload on it (tree:enabled =
    true). The tree is collapsed as expected, but the tree button does not bring it back: the first
    press writes tree:enabled = "false" and the pane stays hidden, label stays "Show tree"; the second
    press writes "true" and the pane still stays hidden. Reproduced 3/3 (two direct loads, one
    listing -> SPA open -> F5). Leaving to the listing afterwards shows the tree off, because the
    first press wrote false. Spec 3 table / I8 expect yielded -> reopened with nothing written.
    (r5/1180x820-video-directload-tree-button-pressed-pane-still-hidden.png,
    r5/1180x820-video-directload-after-tree-button-twice.png,
    r5/1180x820-video-reload-then-tree-button-pane-stays-hidden.png)
  - React error #418 (hydration mismatch) was reported once in two reload runs; not reproduced in four
    later reload runs on :3100 or on the develop stack at :3000.

  Case 2, video, tree on, opened from the listing:
  - 1133x650: the tree yields and the form is beside (inspector 383px at right, frame 717x403), as in
    the MiniLandscape / MiniLandscapeInfo artboards. Stacked only after "Show tree": row 853px,
    frame 428x241 centred (<= half of the 546px row), inspector 272px (>= 40%), no overlap, player
    bottom 361 of 650, PanelBottomClose, no layout toggle, transcript a tab.
    (r5/1133x650-video-open-info.png, -transcript-tab.png, -tree-reopened.png,
    -tree-reopened-transcript-tab.png)
  - 900x700: stacked. Frame 473x266 centred (row 596, half 298), inspector 900x297 full width under
    it, controls bar on screen, PanelBottomClose, no layout toggle, tabs Info/Related/Transcript/Ask,
    header at the top of Info. (r5/900x700-video-open-info.png, -transcript-tab.png)
  - 820x1180: stacked. Frame 788x443 (row 1076), inspector 820x600, controls on screen,
    PanelBottomClose, no layout toggle. (r5/820x1180-video-open-info.png, -transcript-tab.png)
  - 744x1133: below 768px this is the phone form: bottom sheet at rest (name + Like/Favorites/more),
    chrome button PanelRight, data-inspector-fit=overlay written as today. This matches the
    MiniPortrait artboard ("same as the phone sheet") and spec 082.1; it is not the stacked form.
    (r5/744x1133-video-open-info.png)
  - Inspector closed in stacked (1133 reopened, 900, 820): PanelBottom icon, layout toggle shown,
    today's page. (r5/*-video-inspector-closed.png)
  - Playback continuity, one page, video playing from 900x700, a marker set on the <video> element:
    resize to 1180x820 (beside), 820x1180 (stacked), 1133x650 (beside), 744x1133 (phone), 900x700
    (stacked); tabs Transcript, Related, Info; inspector closed and opened; find opened with Cmd+F and
    with the find button, a term typed, closed; find opened and closed with the inspector closed.
    After every step: same <video> element, not paused, currentTime advanced. With the inspector
    closed, find turned the stacked layout on and closing find returned to closed.
    (r5/900x700-video-stacked-find-open.png, r5/900x700-video-inspector-closed-find-open.png,
    r5/900x700-video-inspector-closed-after-find-roundtrip.png, r5/744x1133-video-playing-after-resize.png)
  - BUG, canvas scroll across find (082.9, I2 last clause): 900x700, inspector closed (form stacked),
    transcript moved under the player with "Move transcript below the player" (the only write of
    media-layout-preference in the run, a user action), canvas wheel-scrolled to scrollTop 298 (and
    200 in two re-runs). Open find (find button, or Cmd+F), type a term, close find (Close find
    button, or Escape): playback continues on the same <video>, the inspector goes back to closed,
    but the canvas is at scrollTop 0 and stays there (checked 0.3s, 1.5s, 4s after closing). 3/3.
    (r5/900x700-video-inspector-closed-transcript-below-scrolled.png,
    r5/900x700-video-inspector-closed-transcript-below-find-open.png,
    r5/900x700-video-inspector-closed-transcript-below-after-find.png)
  - media-layout-preference stayed unset through every resize, form change, inspector toggle, yield
    and reopen in cases 1-5; only the layout-toggle press above wrote it.
  - 744x1133 sheet opened with the inspector button (half snap): grabber bottom 541 = strip top 541,
    strip first in inspector-shell, tabs Info/Related/Transcript/Ask, header in Info,
    --inspector-sticky-top 35px; Transcript selected hides Info.
    (r5/744x1133-video-sheet-open-info-dark.png, r5/744x1133-video-sheet-transcript-tab-dark.png)

  Case 3, 390x844: resting strip shows the file name, Like, Favorites, more. Opening the sheet (half
  snap): grabber, then the tab strip directly under it (handle bottom 341 = strip top 341), header
  inside Info, --inspector-sticky-top 35px = strip height; Transcript tab hides the Info panel;
  playback continued. (r5/390x844-video-sheet-resting.png, -sheet-open-info.png, -sheet-transcript-tab.png)

  Case 4, PDF at 900x700, tree on: no yield (tree stays, row x=280 w=620). Inspector closed by
  default; opened, it covers the right of the canvas (overlay, 383px at x=517, canvas still 620 wide),
  PanelRightClose, strip first, header in Info. (r5/900x700-pdf-default-inspector-closed.png,
  r5/900x700-pdf-inspector-open-overlay.png)

  Case 5, PDF with nothing stored: 1180x820 open (>= 1120px, beside), 1100x800 closed; at 1180x820
  with the tree on, no yield (overlay at row 900). For contrast a video at 1100x800 with nothing stored
  starts open. (r5/1180x820-pdf-default-nothing-stored.png, r5/1100x800-pdf-default-nothing-stored.png,
  r5/1180x820-pdf-tree-on-no-yield.png)

  Visible differences from the artboards noticed while running (for design-checker, not judged):
  - SmallWindow 900x700: the artboard draws the header in the full-width Info as one row (title +
    duration on the left, Like / Favorites / AI / more on the right) and "+ Add tag" under it. The app
    draws the narrow-pane layout stretched to 900px: title, then duration, then Like / Favorites /
    Verified, then AI / quote / more, then "+ Add tag", each on its own line. The same at 820x1180
    and 1133x650 stacked.
  - Main / MiniLandscapeInfo / SmallWindow: the artboards separate the header from Visual index with
    a rule and spacing. In the app "Scenes" follows "+ Add tag" about 20px below with no rule.
  - SmallWindow: the artboard frame is about 536x300; the app's is 473x266.
  - Dark-scheme shots at each artboard's size and state, tree on, opened from the listing:
    r5/1180x820-video-info-dark-artboard-Main.png (beside), r5/1133x650-video-transcript-dark-artboard-MiniLandscape.png
    (beside), r5/1133x650-video-info-dark-artboard-MiniLandscapeInfo.png (beside),
    r5/820x1180-video-transcript-dark-artboard-Portrait.png (stacked),
    r5/900x700-video-info-dark-artboard-SmallWindow.png (stacked),
    r5/744x1133-video-sheet-transcript-tab-dark.png (MiniPortrait), r5/390x844-video-sheet-info-dark-artboard-PhoneInfo.png.
    The other screenshots are in the light scheme.
pending: The iOS app on a real device (rotation between forms, full-screen playback, PiP) per agent_cannot_verify; audio/video as seen and heard.

## Design differences (design-check.md at 4efad1144)

Decided by the owner in the session on 2026-11-12, by id:

- D-1, D-10: fixed in ef4c02629 (rule and rhythm of the Info header block).
- D-3: fixed in ef4c02629 and the follow-up that puts the duration beside the title
  (stacked Info header on one row, sections at full width).
- D-4: accepted. The frame follows the spec's cap (half the row less the bars); the
  artboard's 536x301 is slightly over that cap.
- D-2, D-5, D-6, D-7, D-8, D-9, D-11: accepted for this change. They are differences in
  parts this branch does not change (section labels, the player's compact controls, the
  transcript's line length, the phone top bar, the chips' unset state, the toggle's
  pressed background); the artboards simplify them.
