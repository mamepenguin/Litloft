# Decisions

decision:
ran_in_app: yes
at: 00f7502f404944ae2acf7cff07eac9bd1b5e9c1e
by: agent
evidence: |
  Environment: `LITLOFT_PORT=3993 docker compose -p litloft-r5-d1 -f docker-compose.yml -f .r5/override.yml up -d --build backend frontend`.
  The backend became healthy, the drive `scratch` scanned 4 files, and the app was driven at
  http://localhost:3993 with Chromium via Playwright scripts in `.r5/` (`check1-pdf.mjs`,
  `check1-phone-pdf.mjs`, `check2c`/`2d`/`2e`/`2f`/`2g`, `check3`/`3b`, `check4b`/`4c`,
  `check-toggle.mjs`, plus exploration scripts). Screenshots are in
  `docs/process/reviews/feature-ask-about-this-file/shots/` (`core-*.png`). Viewports:
  1440x900 and 390x844 (isMobile, hasTouch). No addon is installed (`drives.json` has
  `"addons": {}`), so the new `inspector-tabs` slot has no entry to draw.

  1. PDF `Litloft User Guide.pdf` (48 pages). 1440x900: the inspector's tab strip held exactly
     `Info` and `Pages` (no `Related`: the file has no relations; `Comments` is a section inside
     Info, not a tab). `Pages` listed pages 1..48; clicking `Go to page 3` changed the page box from
     1 to 3 and the canvas to page 3 ("What you can do"). Opening `/files/<id>?page=3` directly
     redirected to `/drive/scratch?file=<id>&page=3` with the page box at 3 and page 3 rendered.
     390x844: page 1 initially; opening the sheet showed `Info`/`Pages`; `Go to page 3` set the page
     box to 3 and the viewer to page 3; `?page=3` opened at page 3.
     Shots: core-desktop-pdf-open.png, core-desktop-pdf-pages-tab.png,
     core-desktop-pdf-after-page-3-click.png, core-desktop-pdf-direct-page-3.png,
     core-phone-pdf-open-tabs.png, core-phone-pdf-pages-tab.png, core-phone-pdf-after-page-3.png,
     core-phone-pdf-direct-page-3.png.
  2. EPUB `サッカーの神様をさがして.epub`. 1440x900: the inspector drew no tab strip and no tab
     buttons (Info content only). `Contents` listed `本文` and `参考文献`; clicking `参考文献` moved the
     reader to that chapter (position bar `参考文献`, 99%). Reading progress: seeking to a middle
     position (55%) stored `progress 0.55, duration 1`; after reopening the file the reader resumed
     at the same page (55%). Clicking `参考文献` and reopening instead opened at the cover at 0%,
     because that chapter is the book's last page and the reader stores "left at the last page" as
     finished and reopens such a book at the start; the jump itself moved (99%) and the save
     happened. `?section=2` opened at spine section 2 (the `目次` page, `lastLocation.section.current
     = 1` of 3) on both viewports, and the URL kept `section=2`. 390x844: `Contents` opened and
     `本文` moved the reader (position line `本文`). Shots: core-desktop-epub-open.png,
     core-desktop-epub-toc-open.png, core-desktop-epub-after-toc-click.png,
     core-desktop-epub-reopen-after-last-chapter.png, core-desktop-epub-mid.png,
     core-desktop-epub-resumed.png, core-desktop-epub-section-2.png,
     core-desktop-epub-section-1.png, core-phone-epub-open.png, core-phone-epub-toc.png,
     core-phone-epub-after-toc-click.png, core-phone-epub-section-2.png.
  3. Video `clip.mp4`. 1440x900 and 390x844: the video loaded (duration 14.58 s, 1920 px wide);
     pressing `Play` advanced `currentTime` from 0 to 2.48 then 5.54 s. The inspector had no tab
     strip and no tab buttons (Info content only) at both sizes. Shots:
     core-desktop-video-open.png, core-desktop-video-playing.png, core-phone-video-open.png,
     core-phone-video-playing.png.
  4. Phone sheet at 390x844 (PDF page): initially the resting bar (`mobile-inspector-peek`,
     title + like/star/menu). Tapping `Open the sheet` opened it at `half` (sheet top 506);
     dragging the handle up expanded it to `full` (top 169); tapping the handle at `half` also
     moved it to `full`; dragging down from `full` returned it to the bar; reopening gave `half`
     again; `Collapse the sheet` returned it to the bar. One synthetic drag whose pointer moves all
     carried the same timestamp (no elapsed time) sent the sheet back to the bar instead of
     expanding; a human-paced drag (40 ms per 20 px) expanded it to `full`, so that synthetic case
     is recorded as an artefact of the harness, not as a check. Shots:
     core-phone-pdf-sheet-bar.png, core-phone-pdf-sheet-half.png, core-phone-pdf-sheet-full.png,
     core-phone-pdf-sheet-closed.png.
  5. No new empty tab, tab strip or blank area: PDF pages had exactly Info/Pages (never a third,
     empty button); EPUB and video pages had no strip and no tab buttons; the phone sheet held only
     Info/Pages; screenshots above show no empty strip or gap where a tab would sit. The
     desktop inspector toggle still closes (`Close inspector` -> no pane) and reopens (`Open
     inspector` -> Info/Pages). Also seen, outside the listed checks: `GET
     /api/addons/knowledge/file_active_summary/<id>/note` answers 502 (the knowledge addon is not
     installed in this stack; no visible error); the EPUB page logs a
     `vendor/paginator.js` TypeError (`Cannot destructure property 'style' of 'el' as it is null`)
     and did not turn pages on click/wheel/swipe, while `PageDown`/`Space` with the reader focused
     did move to the next section; phone loads log a minified React #418 (hydration) error. None of
     these blocked the five checks, and no attempt was made to attribute them to this change.
pending: The addon half (SPEC-ADDON-053/056) and its Ask tab do not exist in this tree, so the
  Ask tab, its answer, citation pills and in-place jump were not exercised here; a viewer cannot
  reach them without the addon. Audio as heard and video as seen (`PROJECT.md`
  agent_cannot_verify), and the iOS app on a real device, are left to a human.
