# Decisions

decision:
ran_in_app: yes
at: a42e727705b2b670783988d67fb7254e369a83f1
by: agent
evidence: Stack built with `docker compose up -d --build` in the worktree at a42e72770 (project video_share-panel-priority, port 3995) against an APFS clone of the main checkout's data/ (own copy, not shared with any running stack), drives mounted read-only, no LLM keys. Driven with Playwright Chromium 1.58 at exact viewports. Files: video with a transcript wJnOX7w4b-Or (mp4), .loft K6MydOKHZRon (YouTube iframe), audio with a transcript 0LyQRbfZiDyW (m4a), a collection made for the run (Dh12dapvbzdl). Screenshots in docs/process/reviews/feature-workbench-panel-priority/r5/; files named fixture-* come from the e2e-components fixture, not the app.
  Normal flow (beside, inspector open, Transcript panel on):
  - 1376x878 off: frame 720x405, ratio 0.493 of the 822px canvas (width-limited), panel 325px tall, button 32x32 at the row's right (976 = row right), after the Panels group, outside data-preview-actions, aria-pressed false, name and title "Enlarge panels". Press: localStorage "true", aria-pressed true, is-on accent, frame 438x247, ratio 0.300, panel 325 -> 483, canvas does not scroll, panel ends 16px above the visible bottom; the row moved up 158px. Press again: "false", back to 405 / 325. (1376x878-off.png, 1376x878-on.png)
  - 1440x900: frame 750x422 (0.500) -> 450x253 (0.300); panel 330 -> 499; row moved up 169px; no scroll. (1440x900-off.png, 1440x900-on.png)
  - Two panels (Transcript, Scenes side by side): 1376x878 each 354 wide, 325 -> 483 tall; 1440x900 386 wide, 330 -> 499; both end inside the visible area, no scroll, at 0.5 and 0.3. (1376x878-two-panels-*.png, 1440x900-two-panels-*.png)
  - No request other than the video's /stream was made during two presses.
  - Playback across a press: same <video> node (expando kept), one <video>, currentTime 7.96 -> 9.71 and still playing. .loft: same iframe node, the app's clock 0:07 -> 0:08 and 0:12 four seconds later, Pause still shown; after a second press 0:14, same node. (1376x878-loft-*.png) workbench-panels unchanged by every press.
  - Keyboard: focus then Space turns it on, Enter turns it off.
  - ja (NEXT_LOCALE=ja): name and title パネルを広げる in both states; aria-pressed flips.
  States and failures:
  - Stored "TRUE", "1", "", "false", "yes" and absent: aria-pressed false, ratio 0.5. "true": 0.3.
  - Kept across reload, a file change by URL and an in-app link to another file.
  - Two windows of one browser context: a press in either updates aria-pressed and the cap in the other through the storage event, both directions.
  - setItem throwing for the key: a press still flips aria-pressed and the cap, nothing is written, nothing is shown.
  - Closing the only panel with the value "true": button gone, frame uncapped (441px), value stays "true"; reopening the panel applies 0.3 again. (1440x900-panels-closed-value-true.png) Opening and closing Find, closing the inspector, and resizing 1440x900 -> 900x878 (stacked, inspector open, no button) -> 1440x900 leave the value "true", and 0.3 applies again. (1440x900-on-inspector-closed.png)
  - Stacked, inspector closed (900x878): button drawn, 0.5 -> 0.3, panel 319 -> 483. (900x878-stacked-closed-*.png)
  Unaffected by "true" (compared with the value absent, same setup):
  - Stacked, inspector open (900x878): no row, no button, identical boxes. (900x878-stacked-open-*.png)
  - Phone 390x844 (isMobile, touch): no button, identical boxes. (390x844-phone-*.png)
  - Audio with a transcript (1440x900): no button, identical layout fingerprint of the canvas. (1440x900-audio-*.png)
  - Collection surface (collection Play, 1440x900): no button, frame 1088x612 and panels identical. (1440x900-collection-*.png)
  - System full screen: frame 1440x900 / 1376x878 with either value. (1440x900-system-fs-value-absent.png)
  - Pseudo full screen (touch context, requestFullscreen refused): frame 1376x878 with either value. (1376x878-pseudo-fs-*.png)
  - Coarse pointer: button 44x44 (2.75rem), right edge = row right. (1376x878-coarse-*.png)
  Preview action and wrapping, fixture only: with the Quote stub the button ends 8px (0.5rem) left of Quote and Quote's right edge is the row's; without it the button's right edge is the row's (1376x878 and 1440x900, off and on). At 820px wide with a 44px root font the row wraps and the button and Quote move to the second line together, right-aligned. (fixture-*.png)
  Differences and observations for the author:
  - Compact controls with a fine pointer: with the value on, the frame is 438-450px wide at 1376x878 and 1440x900, under the player's COMPACT_MAX_WIDTH (480), so the controls switch to the compact layout (Play, time, mute, seek bar; no Back/Forward 10s, Settings or Full screen button; full screen only by double click). Off: the full pointer controls. (1376x878-controls-hover-value-*.png, 1440x900-controls-hover-value-*.png) With a coarse pointer the touch layout is kept and Full screen is still offered at 0.3 (the pseudo full-screen run). In the spec's own table the 30% frame widths are 382, 443, 487, 573, 417 and 481, so the iPad 11", iPad 11" More Space and MacBook Air 13" rows are under 480.
  - With Find open, the canonical page scrolls by the find bar's 75px and the panel ends below the visible area, with the value on (scrollHeight 919 / clientHeight 844 at 1440x900) and equally with it off. I3 states no scroll with the value on and does not exempt Find. (1376x878-find-open-value-*.png)
  - At 1440x560 with the value on the frame is 269x151, smaller than the mini player's 320x180 (the spec's table covers only taller windows); the page scrolls by 11px. (1440x560-mini-value-*.png)
  - Not from this change, seen with either value: after resizing from the stacked form back to 1440x900 the row and panels take about 9-10 s to come back.
  Not reachable in the app at this SHA:
  - No addon registers `file-preview-actions` at the pinned addon commits; the row has no data-preview-actions element, so the Quote cases ran in the fixture (`actions=1`) only.
  - The `overlay` form with a player file: useInspectorFit picks stacked or beside for a player file off the phone, and the phone is the "phone" form.
  - Row wrapping: with the app's two toggles the row did not wrap at 820px even at a 40px root font; wrapping was shown in the fixture with two panels and Quote.
  - The mini player: at 1440x560 and 1376x600, playing and with the canvas scrolled to the bottom, the player never left the view and no mini window appeared with either value, so its window size could not be compared.
  - Scenes showing more rows while on: the Scenes panel of the test video was empty, so this was not checked.
pending: Real iPad per agent_cannot_verify (Safari, coarse pointer, pseudo full screen, the mini player on device); in the real app, the mini-player window size, the file-preview-actions Quote case and the Scenes row count (not reachable here).
