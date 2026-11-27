# Spec review r1 — docs/specs/collection-play-two-pane.md (SPEC-CORE-190..193)

Reviewer: spec-design-reviewer (fresh agent), against commit e43f09fa2. The reviewer had no
write tool; this file is its report as returned, saved by the author.

1. §1 step 5, D2, I3: page-row previous / next and arrow keys do not exist for video or audio
   today (`ShellLayout.tsx` draws `FileNavControls` for images only; `useFileNav` disables
   shortcuts on player files). Decide whether prev / next are drawn for players on a queue
   page and whether ←/→ change file there. Add `ShellLayout.tsx` (and keyboard-shortcuts
   docs if keys change). Human (key binding); author (touch point).
2. Phone pane button reaches unlisted files: `ChromeButtons.tsx` (hideTree on phone file page),
   `TreeToggle.tsx` (`hidden md:flex` with `?file=`), `useTreeVisible.ts`,
   `treeNarrowOpenStore`. Author.
3. §9 text: the design's pane button labels (キューを表示 / キューを隠す), the × (キューを閉じて
   フォルダツリーに戻す, removes `queue=`) and the phone close row (キューを閉じる, hides only)
   need distinct keys. Author.
4. I2 / §2: missing / trashed state is a snapshot; a Smart queue entry has no state at all;
   trashing or adding from the same page does not refresh the queue. Decide when state is
   judged per queue kind, whether same-page writes refresh the queue, and whether the Smart
   queue is exempt. Human.
5. Folder queue order: "the URL's sort and order" contradicts "as CollectionPanel fetches"
   (audio then video concatenated). Decide merged order and the default sort. Author.
6. §2 folder-fetch failure conflicts with I5 / I8 / §3; no loading state for the folder queue.
   Author.
7. I5 vs §2 / I10 / revised SPEC-CORE-109 I5 (gallery close) and the file-closing paths
   (`clearFile`, `onAfterDelete`). Author.
8. Autoplay rules cannot be told apart from the URL (Play vs row choice, reload, Back,
   legacy redirect, cold Smart URL); the revision drops "with no queue the file does not
   autoplay"; no invariant names the entry paths that start playback. Human.
9. §1 step 6 (removing the current item) contradicts §2 / I10. Author.
10. A failed reorder / remove reloads `CollectionDetail`, whose loading state replaces the
    whole `TwoPaneLayout` and stops playback. Author.
11. SPEC-CORE-064 I4 names the collection panel and is not revised; is the new queue pane in
    the no-horizontal-scroll fixture scope? Author.
12. Scrolling the current row into view (SPEC-CORE-178 I5) on advance / prev / next / load.
    Human.
13. D2's collection crumb conflicts with SPEC-CORE-094 I5 (trail destinations); phone
    heading line 1 on a collection page. Author.
14. I7 contradicts D2 (page row differs on purpose). Author.
15. Missing invariants: D2 crumb, `queue=folder` + sort/order surviving navigation, I3 at the
    ends and with loop, prev / next on folder / Smart queues, loop storage, Play skipping
    missing / trashed. Author.
16. Legacy URL precedence (collection/playlist > smart_collection > folder_play) dropped;
    `find`, `edit`, `sort`/`order` carriage unstated; I6 lacks folder `sort`/`order`. Author.
17. §3 lacks disallowed transitions; `queue=` on a collection page, cross-folder view,
    search route, non-root folder; Smart loading sub-state; collection page with no file;
    collection deleted. Author.
18. With the tree setting off, Play all / Smart Play show no queue on desktop; showing it
    writes `tree:enabled` (SPEC-CORE-082 I8). Human.
19. No way back to the Smart Collection (lands on drive root); is D4's name a link? Human.
20. Touch points omit `frontend/e2e-components/collection-workbench-metrics-desktop.spec.ts`,
    `player-workbench-desktop.spec.ts`, `scenes-scroll-list-desktop.spec.ts`,
    `workbench-no-panel-desktop.spec.ts`, `workbench-split-desktop.spec.ts`,
    `fixtures/app.tsx`, `CollectionDetail.test.tsx`, `FileDetailShell.tsx`; removed tests
    cite SPEC-CORE-089/090/179/094/032/109 — name where each citation remains;
    `FileDetailFullScreen.inboxNav.test.tsx` covers SPEC-CORE-032. Author.
21. No real-browser measurement named (I8, I9, D1 280px, D6 44px, D3 yield); iOS
    `agent_cannot_verify` items (background audio / Now Playing / PiP across an advance,
    mini player over the phone overlay) not flagged. Author.
22. The design draws a separate 48px page row under a 56px header; SPEC-CORE-094 I1 makes it
    one row. Confirm the design's two rows are not a decision. Author.

Regression risks named: final-position write racing the advance's unmount; tree expansion /
scroll state when the queue pane replaces it; yield store behaviour for the queue; reduced
motion of the reorder animation; Inbox walk staying on `/neighbors`; traceability after test
removal; collection page staleness (no WS); phone overlay and the mini player; old bookmarks
now going through the server fetch.

TOTAL: 22 findings
