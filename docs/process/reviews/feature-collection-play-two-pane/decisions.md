# Decisions

decision:
ran_in_app: yes
at: bf6e4feefefd4d44e50ac5db235fc07deac05697
by: agent
evidence: |
  Latest run, 2026-11-28, R-5 re-run at bf6e4feefefd4d44e50ac5db235fc07deac05697 (review r8 fix fbec10541): stack http://video-share-collection-play.localhost:3101, frontend container created 2026-11-28 10:00 JST (after fbec10541), its cloned data. Headless Google Chrome via Playwright, dark theme, NEXT_LOCALE=en, each scenario in a fresh context with empty origin storage. F1 fixed: at 1440x900 with the tree off, collection Play, then the pane's name → collection list with the pane kept (280px); four presses of the header button alternated hidden / shown ("Show tree" / "Hide tree") with no tree:* key written; leaving by the 動画 crumb ended the visit, and returning from the sidebar showed no pane. Regression: with the tree on, the button on a folder page and on a collection list wrote true / false as before; with a file open after Play and the tree off it hid and re-showed the queue without writing; at 1024x768 with the tree on the queue yields after Play and the button reopens it without writing. Details under "R-5 re-run at bf6e4feef"; screenshots r5/rr5-*. Earlier runs follow.
  Latest run, 2026-11-28, R-5 re-run at 07d24c136ca923c813d55b787bc0ee130b733b98 (review r7 fixes 0a1ba745d, 16ac5adaf, bc6be1f19, 5fe9be410): stack http://video-share-collection-play.localhost:3101, frontend container created 2026-11-28 09:45 JST (after 5fe9be410), its cloned data. Headless Google Chrome via Playwright, dark theme, NEXT_LOCALE=en, each scenario in a fresh context with empty origin storage (Autoplay off). F7 fixed: a folder queue on YouTube/おでかけ子ザメ reads 動画 / YouTube / おでかけ子ザメ / title, a Smart queue on the drive root reads 動画 / YouTube / title, and a collection page still reads 動画 / R5 videos / title at 1440; at 390 the heading's line 1 is おでかけ子ザメ, YouTube and R5 videos. F8 fixed: with the tree off, the collection crumb and the pane's name both return to the collection list with the pane still 280px; leaving the page by a sidebar link ends it, and Back to the collection shows no pane. F3 fixed: at 1100 the sidebar is an overlay on a file page (below 1200), so the case needs 1200; at 1200x800, tree off, sidebar inline, the row on screen is 960px and the inspector is stacked (the old sum 960+240 would have given beside); at 1208 (row 968) it is beside with a 552px player. Tree on, collection queue at 1024x768: the pane yields, Show the queue offered, page row keeps 1 / 9. Unspecified 3 fixed: a row choice on a collection page with no file open starts playback with Autoplay off. Regression: collection Play and an advance, folder Play all and an advance at 1440, as before. Details under "R-5 re-run at 07d24c136"; screenshots r5/rr4-*. Earlier runs follow.
  Latest run, 2026-11-28, R-5 re-run at 8ce8366f2eece4ff968846cf4d5c3775d9906e9a (design fixes D-7 and D-8, product commit 42c045a1c): stack http://video-share-collection-play.localhost:3101, frontend image built 2026-11-28 08:55 JST (after 42c045a1c, its bundle carries the new classes), its cloned data. Headless Google Chrome via Playwright, dark theme, English locale, fresh contexts with empty storage. D-7 fixed: at 1440x900 every R5 videos row's title column is 89px (ordinal 18px, thumbnail 48x28, move up / move down / remove 26px each). D-8 fixed: at 390x844 with a coarse pointer the overlay's row titles are 13px (also 13px in a 390px fine-pointer window). Regression: collection Play and an advance at 1440, and the phone overlay opening and closing while playback continued, as before. Details under "R-5 re-run at 8ce8366f2"; screenshots r5/rr3-*. Earlier runs follow.
  Stack: http://video-share-collection-play.localhost:3101 (frontend image built 2026-11-28 03:58 JST, after HEAD's commit), its own cloned data. Desktop Chrome, fine pointer. Viewports: 1440x900 for the artboard shots 19 and 23 (shots 01-18 are 1440x757), 1024x768, and 390x844 drawn in a same-origin iframe inside a 500px window (Chrome's minimum window width). Origin storage was empty at the start (tree setting off, Autoplay off). Screenshots, kept locally (gitignored): docs/process/reviews/feature-collection-play-two-pane/r5/.
  Artboard screens:
  - D1 (19-D1-video-collection-3of9-loop-on-1440x900.jpg): the "R5 videos" collection, item 3 of 9, playing, loop on. Pane 280px: name, "3 / 9", loop button lit; rows have the ordinal, a 16:9 thumbnail, the title (cut to about 6 characters), the duration, and up / down / remove always visible. The current row is tinted with an accent ring and a red ordinal. The page row reads 動画 / R5 videos / title, with ‹ 3 / 9 ›, and the inspector is on the right.
  - D2 (16-D2-markdown-document-row-1440.jpg): a Markdown item draws ‹ 2 / 5 › in the document row, with edit / split / preview to its right.
  - D3 (20-D3-video-collection-yield-1024x768.jpg): the pane is yielded and the page row keeps ‹ 3 / 9 ›. Pressing the pane button showed it again, with the inspector stacked under the player (07-...).
  - D4 (23-D4-folder-play-tree-off-loop-off-1440x900.jpg): アニメ Play all, loop off: name "アニメ", "1 / 28", loop and ×; rows have the ordinal, title and duration, with no thumbnail and no reorder buttons. Smart (15-...): "あんこ動画 1 / 8", loop and ×; the .loft rows have no duration.
  - D5 (21-D5-phone-video-playing-390.jpg): video playing; the row holds menu, pane button, "‹ R5 vid…" over the title, find, ‹ ›, search and capture. No n / N at this width.
  - D6 (22-D6-phone-video-queue-overlay-390.jpg): the overlay is 390px wide with a close row (×) on top, then the top block and rows with buttons. Playback continued. The header is cut off and the page scrolls sideways (defect 4).
  Collection (SPEC-CORE-190), collections "Spirit" (50 audio), "R5 mixed" (video, Markdown, two images, audio) and "R5 videos" (9 videos), the last two created for this run:
  - Play with the tree setting off: ?file= first item, the pane shown for the visit, tree:enabled:動画 not written, playing with Autoplay OFF (02-...).
  - Advance: item 1 seeked to its end → item 2 selected and playing. Row 6 (0:10) ended on its own → item 7.
  - Last item: next disabled at 50 / 50. With loop off the end stayed on 50, paused (03-...). The loop button wrote collection-loop=1, and the end then wrapped to item 1, which played and was scrolled into view. Next stayed disabled at 50 / 50 with loop on (04-...).
  - R5 mixed: the video's end skipped the Markdown and both images to the audio (5 / 5). With loop on, the audio's end wrapped to the video. From the Markdown, next went to image 3 / 5. On the images, the ← / → keys walked 3 → 4 → 3.
  - Reorder while playing: "move down" on the current row 1 made it row 2, "2 / 50". The same <audio> element kept playing, and previous then selected the new row 1. It was moved back afterwards.
  - Remove while playing: removing the current item left it mounted and playing. The pane shows "– / 49" with no row current, and both page-row arrows are disabled (05-...). See defect 2.
  - Add to collection (file menu) on that file: the pane re-read to 50 rows with the file last, "50 / 50", and the same <audio> kept playing.
  - Trash the open file (R5 mixed item 1, a video) from its menu: the file closed to the collection list. Play then selected item 5, the first playable item still there (I16). With loop on, its end stayed on item 5.
  - The trail's collection crumb and the pane's name both cleared ?file= and stayed on the collection page.
  - Opening a list row with Autoplay off: the file opened paused. Back to a collection file: paused.
  - Tree-off visit: the pane button hid the pane ("Show the queue") and showed it again ("Hide the queue"), with no tree:* key written.
  - queue=folder on a collection page: one pane, the collection's, with no ×.
  Folder and Smart (SPEC-CORE-191):
  - Tree on, アニメ Play all, Newest first: ?file=…&queue=folder&sort=created_at&order=desc. The tree was mounted and hidden, and the video played (11-...). Next kept queue / sort / order. A row choice played. A seek to the end advanced 4 → 5 and kept queue=.
  - × removed queue, sort and order and showed the tree, and the file kept playing (12-...).
  - Random Play all: the URL carries sort=random, folder-queue:動画:アニメ is stored, and the first item and the row order equal the listing at the press. A reload kept that order and opened paused.
  - The name link "アニメ" went to /drive/動画/アニメ with no query.
  - A file opened from search in another folder dropped queue= and showed the tree.
  - Tree off (tree:enabled:動画=false, set with the pane button): Play all showed the pane at 280px and wrote nothing. Trashing the open file from its menu ended the queue, showed no left pane, and wrote nothing. Smart Play from the search page showed the pane, and × left no left pane.
  - Smart, tree on: Play from the saved search page leaves the pane hidden (defect 1, 13-...). A reload shows it (15-...). Next kept queue=smart. × dropped it and showed the tree. The name links to the saved search with smart_folder_id, and following it ended the queue.
  - Cold Smart URL in a new tab: one evaluation was stored, and the pane showed "あんこ動画 2 / 8" with the name as a link.
  - Cold random folder URL in a new tab: see defect 5.
  Legacy URLs (SPEC-CORE-192), curl -D -:
  - ?collection=…&t=30&nav=inbox → 307 /drive/動画/collections/{c}?file=…&t=30, nav dropped.
  - ?playlist=…&find=abc → the same target, with find.
  - ?smart_collection=…&t=5&sort=name → /drive/動画?file=…&queue=smart:…&t=5, sort dropped.
  - ?folder_play=1&sort=name&order=asc&t=7&nav=x → the file's folder, ?…&queue=folder&sort=name&order=asc&t=7.
  - page / section / highlight / edit are kept. With all three parameters, the collection form wins. An unknown file → 404.
  - In the browser, /files/{id}?folder_play=1&t=30 landed on アニメ at "5 / 28", paused at 30 s.
  Phone (SPEC-CORE-193), 390x844 iframe:
  - After a reload, the row shows the pane button, the collection name as line 1, and ‹ ›. The overlay does not open by itself (08-...).
  - The pane button opened the queue at 390px, and playback continued (09-, 22-...). Choosing row 3 selected it, closed the overlay, and played it (10-...). The close row closed it without changing the file, still playing. The folder queue behaves the same (17-...).
  Defects:
  1. Smart Collection Play from its saved search page, at 1440 with the tree setting on, opens the file with the queue pane hidden: width 0, and the button reads "Show the queue". Reloading the same URL shows it at 280px. With the tree setting off it shows. Folder Play all and collection Play show it with the tree on. Steps: turn the tree on for 動画, open the あんこ動画 Smart Collection from the sidebar, press Play.
  2. For a file not in the ready queue, the pane shows "– / N", but the page row shows only the two disabled arrows and no "– / N" (§2, I10). Seen after removing the current item, and for ?file= outside the collection (18-...).
  3. On a collection page with no file open and the tree setting on, the item list has no top block (name, loop), against the "Collection, no file" row of §3 (14-...). Steps: turn the tree on, open /drive/動画/collections/bG77f6xG21ju.
  4. With the phone overlay open (collection and folder queues), the header row is offset by the overlay's 390px width. The trail, find, ‹ › and search sit at x 396–510, past the viewport, and the document scrolls sideways (scrollWidth 510 against 390). Measured in a 390px iframe in desktop Chrome, not on a device.
  5. A random folder queue with nothing stored (a new tab on ?queue=folder&sort=random) fetches /files?…&sort=random&order=desc, so each load shows a new shuffled order, not created_at desc (§1 Folder step 3, I15). Its first rows differed from created_at desc ("122-…" against "【約200万円】…").
  Not judged: inside a collection, row choices, previous / next and advances replace the history entry, so Back left the collection. With a Smart queue the trail reads 動画 / あんこ動画 / title.
  Left behind on the cloned data: the collections "R5 mixed" (flQ0vAgG8SXi) and "R5 videos" (oO1ntCEA3B1n); Spirit's order, with 02 Charon's Burden now last (removed, then re-added). The two trashed files (Alx1ShvKJ5ny, pzIoDOoWFeqf) were restored, and the origin's localStorage and sessionStorage were cleared. The browser tab is closed.
author_resolutions:
- claude-read:F7 fix: 0a1ba745d keeps the file's own trail on folder and Smart queue pages; only a collection page replaces it (FileDetailChrome.test.tsx table fails without it).
- claude-read:F8 fix: 16ac5adaf keeps a collection page's visit-shown pane until the page is left (CollectionDetail.queue.test.tsx fails without it).
- claude-read:F3 fix: bc6be1f19 counts the inline sidebar in the inspector fit only while it gives its place up; the tree-off 1100x800 case in TreeYield.test.tsx fails without it.
- claude-read:F2 accept: useInspectorFit.ts is missing from the touch points; the behaviour it carries is fixed under F3 and tested, so only the list is incomplete.
- claude-read:F1 accept: Breadcrumb.tsx gained an optional ancestorSegments prop used only by the collection trail; listing omission, no runtime effect elsewhere.
- claude-read:F4 accept: treeVisitStore.ts is the in-memory "shown for the visit" state the spec describes in §1 step 12; listing omission.
- claude-read:F5 accept: the removed e2e cases measured the retired collection route; the SPEC ids they cited stay cited elsewhere (checked by grep against test_dirs).
- claude-read:F6 accept: new and adjusted unit tests are test infrastructure for this change; no runtime effect.
- claude-read:unspecified 3 fix: 5fe9be410 sets the play intent on the first row choice of a collection page with no file open (CollectionDetail.queue.test.tsx fails without it).
- claude-read:unspecified 1 accept: ending a folder queue drops sort/order even when the listing had them in the URL before Play all; the listing then uses its stored sort (F2 x I3 = 6, below the fix threshold).
- claude-read:unspecified 2 accept: with the tree off, opening a collection file from a card also shows the item pane for the visit; it keeps the queue visible, which is what the page is for (F3 x I2 = 6).
- claude-read:unspecified 4 accept: a cold Smart queue shows an empty crumb only until the Smart Collection list answers; after F7 the trail is the file's own, so this applies to the pane name only (F1 x I2 = 2).
- claude-read:unspecified 5 accept: a hidden visit-shown pane reappears after crossing md or reopening a file (F1 x I2 = 2).
- claude-read:unspecified 6 accept: a play intent left by a guard-cancelled selection autoplays the next arrival at that same file once (F1 x I2 = 2).
- r8 claude-read:F1 fix: fbec10541 sends the press to the visit whenever a visit-shown pane is active and not yielded, so the list no longer writes tree:enabled; TwoPaneLayout.queuePane.test.tsx case fails without it.
- r8 claude-read:F2 fix: the same commit adds the list-side toggle case (render with visitUntilLeft, clear ?file=, press twice, storage untouched).
- r8 claude-read:unspecified 1 accept: with the tree off, any file opened on a collection page keeps the item pane on the list for the visit; the page is the collection's queue page (F4 x I2 = 8).
- r8 claude-read:unspecified 2 accept: same as r7 unspecified 1 (F2 x I3 = 6).
- r8 claude-read:unspecified 3 accept: same as r7 unspecified 6 (F1 x I3 = 3).
- r8 claude-read:unspecified 4 accept: same as r7 unspecified 5 (F1 x I2 = 2).
- r9 claude-read:F1 accept: a visit-shown pane the reader hid on the list stays hidden when Play is pressed again; one press of the pane button shows it (F2 x I3 = 6, below the fix threshold).
- r9 claude-read:unspecified 1 accept: same as r9 F1 (F2 x I3 = 6).
- r9 claude-read:unspecified 2 accept: same as r8 unspecified 1 (F4 x I2 = 8).
- r9 claude-read:unspecified 3 accept: same as r7 unspecified 1 (F2 x I3 = 6).
- r9 claude-read:unspecified 4 accept: same as r7 unspecified 5 (F1 x I2 = 2).
- r9 claude-read:unspecified 5 accept: same as r7 unspecified 6 (F1 x I2 = 2).
pending: |
  - The agent_cannot_verify iOS checks of spec §10: background audio and Now Playing across an advance; full screen and Picture in Picture across an advance; the mini player while the phone overlay is open; lock screen and headphone next / previous track on a queue page with Autoplay off.
  - Not driven in this run:
    - system Media Session next / previous track
    - 44px rows and buttons under a coarse pointer (desktop Chrome has a fine pointer; rows measured 40px)
    - a .loft item reporting its end, so no Smart advance
    - the loading and failed queue states
    - a reorder or remove request that fails
    - a drop onto the sidebar collection
    - the server-side watch record at an end (I1): there was no viewer profile, so only the localStorage record was seen, with progress equal to duration

## R-5 re-run at 5fa146b9ccd19b66a22ced240879468ea5549ed0 (fixes 6b633812b..5fa146b9c)

Scope: the five defects above, plus collection Play, folder Play all and an advance at 1440. Same stack (http://video-share-collection-play.localhost:3101, rebuilt from HEAD), desktop Chrome, 1440 wide; 390x844 in a same-origin iframe. Origin storage cleared at the start, then tree:enabled:動画=true. Screenshots (gitignored): r5/rr1-01 to rr1-05.
- Defect 1, fixed: sidebar あんこ動画 → saved search page → Play → ?file=BVtZs91FE2MA&queue=smart:iJoo9-NqbcRO. The queue aside is 280px with "あんこ動画 1 / 8", the button reads "Hide the queue" (rr1-01).
- Defect 2, fixed: /collections/oO1ntCEA3B1n?file=BVtZs91FE2MA (not in R5 videos): the page row and the pane both read "– / 9", arrows disabled (rr1-02). Removing the current item (row 9, playing) from the pane: the page row and pane read "– / 8", the video kept playing (rr1-04). Re-adding it from the file menu gave "9 / 9", which is also the original order.
- Defect 3, fixed: /collections/oO1ntCEA3B1n with no file, tree on: the pane's top block is "R5 videos" and the loop button, no n / N (rr1-03).
- Defect 4, fixed: 390px, R5 videos item 1 playing. Before: header buttons at x 12, 60, 194, 234, 268, 300, 338; scrollWidth 390; playing, t 2.18. Overlay opened by clicking the pane button: queue aside left 0, width 390, header buttons at the same x, scrollWidth 390, playing, t 9.07 (rr1-05). Closed with the close row's ×: same header, scrollWidth 390, playing, t 14.62, ?file= unchanged. Folder queue (アニメ, queue=folder) the same: aside 0/390, scrollWidth 390 before / during / after, playing with t 0.91 → 1.91 → 2.91.
- Defect 5, fixed: a new tab on /drive/動画/アニメ?file=Alx1ShvKJ5ny&queue=folder&sort=random with empty sessionStorage. The queue reads "1 / 28" with rows in the same order as the created_at desc queue of the first tab (【ピカチュウ】…, 【約200万円】…, Vol.144…). On reload, the requests were /files?…&sort=created_at&order=desc (listing and type=audio&type=video queue fetch); none carried sort=random. Nothing was written to sessionStorage.
- Regression checks at 1440, tree on: collection Play on R5 videos → ?file=I3e9u7RiDzz2, playing, pane 280px "1 / 9"; a seek to the end advanced to "2 / 9", playing, pane 280px. Folder Play all on アニメ → queue=folder&sort=created_at&order=desc, pane 280px "1 / 28", playing; a seek to the end advanced to "2 / 28", playing, pane 280px.
- Left behind: R5 videos ends in its original order. Origin localStorage and sessionStorage cleared, tabs closed, window back to 1440x900.
- Defects remaining: none of the five.


## Design check (design-check.md, 6 findings)

Decided by the owner on 2026-11-28:

- D-1: fix (folder / Smart queue rows on one line, duration at the right end, as FolderPlay.dc.html).
- D-2: accepted. The phone row is SPEC-CORE-094's file-page row, and its extra controls are that page's own; the design drew a simplified row.
- D-3: accepted. The phone sheet's open or peek state is the file page's existing behaviour; the design drew it open.
- D-4: fix (the open phone queue overlay covers the file sheet's peek bar).
- D-5: fix (phone queue thumbnails 56x32, as PhoneQueue.dc.html).
- D-6: fix (per-row buttons 26px wide at a fine pointer, as Main.dc.html; 44px at a coarse pointer stays).

## R-5 re-run at bcb9210ce244c190e1352a72a29228ffb2cf327c (design fixes D-1, D-4, D-5, D-6)

Scope: the four design differences the owner chose to fix. Same stack (http://video-share-collection-play.localhost:3101, frontend container recreated from HEAD), its cloned data. Google Chrome driven by Playwright, headless, dark theme, each scenario in a fresh context with empty origin storage. Desktop at a fine pointer; phone at 390x844 both as a mobile context (isMobile + touch, pointer: coarse) and as a plain 390px window (pointer: fine). Screenshots (gitignored): r5/rr2-*.
- D-6, fixed (sizes), title width still short of the design: R5 videos item 3 (?file=avDVaYmov12T), loop on, tree on, 1440x900, playing. Every up / down / remove button is 26x28. Title column 81px; titles read "7417-父さん…", "7988-お彼岸…" (about 7 characters; before the fix about 6). The design leaves about 89px: the implementation's ordinal is 20px (design 18), the button group has gap 2px (design 0), and the row's right padding is 6px (design 4). Thumbnails 48x28 (design 48x27). Pane 280px, no horizontal scroll (rr2-01, rr2-Main).
- D-1, fixed: アニメ Play (tree off, loop off) → ?file=Alx1ShvKJ5ny&queue=folder&sort=created_at&order=desc, playing, "1 / 28". Each row is one line, 32px high: ordinal at x 6 (18px), title at x 32 truncated on the same line, duration at y 9 on the title's line with its right edge 8px from the row's right edge (rr2-02, rr2-FolderPlay). Smart (?file=BVtZs91FE2MA&queue=smart:iJoo9-NqbcRO): rows 32px, one line; the .loft rows have no duration and their title runs to the right edge, the video row has 14:29 at the right end (rr2-03).
- D-4, fixed: 390x844, R5 videos item 3 playing, sheet at peek. Before opening: peek bar present, elementFromPoint at y 800 / 830 is the peek bar. Pane button ("Show the queue") → queue aside x 0, y 56, 390x788; the peek bar is not in the DOM, and every probed point (y 300, 600, 760, 800, 830) hits the aside; scrollWidth 390; the same <video> kept playing (t 1.73 → 3.33 → 5.42) (rr2-04). "Close the queue" → peek bar back, playing (t 6.96), ?file= unchanged (rr2-05). With the sheet opened to half ("Open the sheet", data-snap=half) first: the overlay covered it entirely (no sheet in the DOM, all probes on the aside); after closing, the sheet came back at data-snap=half and playback continued (t 8.57 → 10.16 → 11.73) (rr2-06, rr2-07, rr2-08). Folder queue (アニメ, queue=folder) the same: peek gone while open, back after close, playing t 1.38 → 2.92 → 4.52 (rr2-09). Identical results with a fine pointer at 390 (rr2-*-fine-*).
- D-5, fixed at a coarse pointer: in the overlay every thumbnail is 56x32, rows 52px high, per-row buttons 44x44, title 12px (rr2-04, rr2-PhoneQueue). The design draws buttons 36x44 and the title 13px. At a fine pointer in a 390px window thumbnails stay 48x28, buttons 26x28, rows 40px (rr2-04-D4-D5-fine).
- Artboard shots re-taken at HEAD: Main rr2-Main-collection-3of9-loop-on-1440x900.jpg; Narrow rr2-Narrow-collection-yield-1024x768.jpg (pane yielded, page row ‹ 3 / 9 ›, inspector beside the player); FolderPlay rr2-FolderPlay-tree-off-loop-off-1440x900.jpg; Phone rr2-Phone-collection-playing-390x844.jpg (coarse) and rr2-Phone-fine-collection-playing-390x844.jpg; PhoneQueue rr2-PhoneQueue-collection-overlay-390x844.jpg.
- Left behind: nothing on the server (no collection or file was changed); every browser context was closed.
- Differences remaining against the design: D-6 title column 81px against about 89px (ordinal 20 vs 18, button gap 2 vs 0, right padding 6 vs 4); phone overlay buttons 44x44 against 36x44 and title 12px against 13px at a coarse pointer.


## Design re-check (design-check.md, D-7 and D-8)

Decided by the owner on 2026-11-28: fix both. Fixed in 42c045a1c. Verified in a real browser by e2e-components/queue-page-desktop.spec.ts (collection row title at least 88px at 1440px; it measured 81px before the fix) and queue-page-phone.spec.ts (row titles 13px at 390px; 12px before the fix). No other design difference remains open.

## R-5 re-run at 8ce8366f2eece4ff968846cf4d5c3775d9906e9a (design fixes D-7 and D-8)

Scope: D-7 and D-8 (fixed in 42c045a1c), plus collection Play, an advance, and the phone overlay. Same stack (http://video-share-collection-play.localhost:3101, frontend image built 2026-11-28 08:55 JST, after 42c045a1c), its cloned data. Headless Google Chrome via Playwright, dark theme, NEXT_LOCALE=en, each scenario in a fresh context with empty origin storage (tree setting off, Autoplay off). Screenshots (gitignored): r5/rr3-*.
- D-7, fixed: 1440x900, fine pointer. /drive/動画/collections/oO1ntCEA3B1n → Play → ?file=I3e9u7RiDzz2, "1 / 9", playing (t 2.09), pane 280px, no horizontal scroll in the pane (scrollWidth 280). All nine rows: ordinal 18px, thumbnail 48x28, title column 89px at 12px, move up / move down / remove 26px each. Titles now read "7988-お彼岸…", "7417-父さんポ…" (rr3-01-D7-collection-play-1of9-1440x900.jpg).
- Advance at 1440: a seek to 0.3 s before the end of item 1 → ?file=pzIoDOoWFeqf, "2 / 9", playing (t 2.30); title columns still 89px (rr3-02-advance-2of9-1440x900.jpg).
- D-8, fixed: 390x844 mobile context (isMobile + touch, pointer: coarse matched), ?file=avDVaYmov12T (item 3). It opened paused (Autoplay off), so playback was started with the player's play (muted). "Show the queue" → aside x 0, y 56, 390x788, page scrollWidth 390. All nine row titles are 13px (title column 137px); thumbnails 56x32, buttons 44 wide (rr3-03-D8-coarse-phone-queue-overlay-390x844.jpg). In a plain 390px window (fine pointer) the titles are also 13px, thumbnails 48x28, buttons 26 (rr3-03-D8-fine-...).
- Phone overlay and playback: coarse, t 1.46 before opening → 3.01 while open → 4.60 after "Close the queue", never paused; ?file= unchanged and the queue aside gone after closing (rr3-04-coarse-phone-after-close-390x844.jpg). Fine pointer the same (t 1.45 → 3.08 → 4.68; rr3-04-fine-...).
- Left behind: nothing on the server (no collection or file changed); every browser context closed.
- Differences found: none.

## R-5 re-run at 07d24c136ca923c813d55b787bc0ee130b733b98 (review r7 fixes)

Scope: F7, F8, F3 and unspecified 3 from r7 (fixed in 0a1ba745d, 16ac5adaf, bc6be1f19, 5fe9be410), plus collection Play, an advance, and folder Play all at 1440. Same stack (http://video-share-collection-play.localhost:3101, frontend container created 2026-11-28 09:45 JST, after 5fe9be410), its cloned data. Headless Google Chrome via Playwright, dark theme, NEXT_LOCALE=en, each scenario in a fresh context with empty origin storage (Autoplay off throughout; video-share-autoplay never written). Screenshots (gitignored): r5/rr4-*.
- F7, fixed. Folder queue, nested: /drive/動画/YouTube/おでかけ子ザメ → Play → ?file=aR3bI3tKavvh&queue=folder&sort=created_at&order=desc, "おでかけ子ザメ 1 / 63", playing. The page row's trail is Home / 動画 (/drive/動画) / YouTube (/drive/動画/YouTube) / おでかけ子ザメ (/drive/動画/YouTube/おでかけ子ザメ) / title (rr4-01). Smart queue on the drive root: saved search page (?q=tag:あんこ type:video&smart_folder_id=iJoo9-NqbcRO) → Play → /drive/動画?file=BVtZs91FE2MA&queue=smart:iJoo9-NqbcRO, pane "あんこ動画 1 / 8"; trail Home / 動画 / YouTube (/drive/動画/YouTube) / title, the file's own folder (rr4-02). Collection: /collections/oO1ntCEA3B1n → Play → trail Home / 動画 / R5 videos (/drive/動画/collections/oO1ntCEA3B1n) / title (rr4-03). At 390x844 (mobile context) the heading's line 1 (back control) reads おでかけ子ザメ, YouTube and R5 videos respectively, with the title on line 2 (rr4-04, rr4-05, rr4-06).
- F8, fixed. tree:enabled:動画=false, 1440x900. Collection page with no file: no pane (aside width 0), sidebar inline. Play → ?file=I3e9u7RiDzz2, pane 280px "R5 videos 1 / 9" (rr4-07). The trail's R5 videos crumb → collection list, ?file= gone, pane still 280px (rr4-08). A row choice there opened item 2, playing. The pane's name (a link to the collection) → collection list, pane still 280px (rr4-09). The sidebar's Library link (client navigation) → /drive/動画, no left pane, sidebar inline (rr4-10). Browser Back to the collection page → no pane (aside width 0) (rr4-11). No tree:* key other than the preset was written.
- F3, fixed. Tree off, sidebar-open=true, a video opened from a card on /drive/動画/アニメ (no queue). At 1100x800 the file page's sidebar is an overlay (the sidebar is inline only from 1200px), so the row is the full 1100px and the inspector is beside: the case the finding describes does not arise at that size (rr4-12-...-1100x800). At 1200x800 the sidebar stays inline (padding 240px), the inspector-fit host is 960px, and the inspector is stacked under the player (inspector at y 428, full 960 width); the pre-fix sum would have been 960 + 240 = 1200 ≥ 968 and given beside (rr4-12-...-1200x800). At 1208x800 (host 968) it is beside with the player at 552px. At 1440x800 beside, player 784px. HEAD's parent was not built, so the old form is inferred from the formula, not seen. Tree on, collection Play at 1024x768: the queue aside is 0px (yielded), "Show the queue" is offered, the inspector is beside the player, and the page row keeps "1 / 9" (rr4-13).
- Unspecified 3, fixed. tree:enabled:動画=true, collection page with no file open, Autoplay off: choosing row 3 in the pane → ?file=avDVaYmov12T, "3 / 9", playing (t 2.81) (rr4-14). Choosing row 2 next also played.
- Regression at 1440x900: collection Play → "1 / 9" playing; a seek to 0.3 s before the end → ?file=pzIoDOoWFeqf, "2 / 9", playing (rr4-15). アニメ Play all → queue=folder&sort=created_at&order=desc, "アニメ 1 / 28", playing, trail 動画 / アニメ / title; a seek to the end → "2 / 28", playing (rr4-16). Drive root Play all → "動画 1 / 137", trail 動画 / title (rr4-17).
- Seen off the brief: a hand-typed /drive/動画/search?smart_folder_id=iJoo9-NqbcRO (no q) draws the drive root listing, and its Play opened jqdkGcXK972p (in YouTube) with the pane reading "動画 – / 137" (rr4-00). The UI's own Smart Collection link carries q, so this URL is not reached by ordinary use.
- Left behind: nothing on the server (no collection or file changed); every browser context closed.
- Differences from the spec found: none.

## R-5 re-run at bf6e4feefefd4d44e50ac5db235fc07deac05697 (review r8 fix)

Scope: F1 from r8 (fixed in fbec10541), plus the header pane button in the neighbouring states. Same stack (http://video-share-collection-play.localhost:3101, frontend container created 2026-11-28 10:00 JST, after fbec10541), its cloned data, collection "R5 videos" (oO1ntCEA3B1n). Headless Google Chrome via Playwright, dark theme, NEXT_LOCALE=en, each scenario in a fresh context with empty origin storage (Autoplay off). "Header button" is the pane button at x 60 in the app header; localStorage was read after every press. Screenshots (gitignored): r5/rr5-*.
- F1, fixed. 1440x900, storage empty (tree off). Collection list: no pane, "Show tree". Play → ?file=I3e9u7RiDzz2, Queue pane 280px, "Hide the queue", video playing, storage empty (rr5-01). The pane's name "R5 videos" → collection list, ?file= gone, Collection items pane still 280px, button "Hide tree" pressed (rr5-02). Press 1 → pane hidden (width 0), sidebar inline, "Show tree", storage empty (rr5-03). Press 2 → pane 280px, "Hide tree", storage empty (rr5-04). Presses 3 and 4 repeated hidden / shown, storage still empty. The trail's 動画 crumb → /drive/動画, no left pane, "Show tree" (rr5-05). The sidebar's R5 videos entry → the collection list with no pane (rr5-06). No tree:* key written at any point.
- Regression, tree setting on. /drive/動画/アニメ, storage empty: press → tree 280px, tree:enabled:動画=true (rr5-07); press → hidden, false; press → shown, true. Then the collection list: the item pane is shown, "Hide tree" (rr5-08); press → hidden, false (rr5-09); press → shown, true. As before.
- Regression, file open, tree off. Collection Play → Queue 280px, playing. Press → queue hidden, "Show the queue", storage empty, still playing (rr5-10). Press → queue 280px, "Hide the queue", storage empty, still playing (rr5-11).
- Regression, yield. 1024x768, tree:enabled:動画=true, collection Play → ?file=I3e9u7RiDzz2, Queue width 0, "Show the queue", inspector beside, page row ‹ 1 / 9 › (rr5-12). Press → queue 280px, inspector stacked (744px), storage still true (rr5-13). A further press hid it and wrote false, the "reopened" row of SPEC-CORE-082 I8.
- Left behind: nothing on the server; every browser context closed.
- Differences from the spec found: none.
