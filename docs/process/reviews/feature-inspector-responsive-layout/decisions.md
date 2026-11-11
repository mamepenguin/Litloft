# Decisions

decision:
ran_in_app: yes
at: 4efad1144a2395eb47c639fb526faa613e3968f3
by: agent
evidence: |
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
  - Not exercised: the canvas scrollTop kept across a find round-trip (I2 last clause). This video's
    canvas does not scroll with the inspector closed (no description), so there was nothing to keep.

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
  - Screenshots are in the light scheme; the artboards are drawn dark.
pending: The iOS app on a real device (rotation between forms, full-screen playback, PiP) per agent_cannot_verify; audio/video as seen and heard.
