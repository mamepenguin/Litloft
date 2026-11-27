# Decisions

decision:
ran_in_app: yes
at: 5fa146b9ccd19b66a22ced240879468ea5549ed0
by: agent
evidence: |
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
