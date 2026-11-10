# Decisions

decision:
ran_in_app: yes
at: 6217b72232fc73e733cf78841d8fdc1f499d1993
by: agent
evidence: |
  Re-run after the origin/develop merge (b63771023) that brought the Continue desk (key=continue).
  Tree: core 6217b722 (clean except submodules outside this change), addons pinned and checked out at
  intelligence 77e21bf and media_import ade010a. Stack video_share-vds-* at http://localhost:3000 on the
  real data, not restarted. Browser: headless Chromium via Playwright 1.58.2. Profile set with the
  lit_viewer cookie ("subent" = viewer 02bb286b0179327f; "r5-probe-nofeed" = a profile with no Pickup feed).
  Screenshots in
  /private/tmp/claude-502/-Users-libre-Sources-video-share/c1771ebc-a854-4501-b14a-25e283d83837/scratchpad/r5b/shots/
  1. No profile, drive 動画 (s1-noprofile-discover.png): よく見るソース, 購読の新着, 新着. No 続きから, no おすすめ;
     no key=continue and no /pickup request. Two /watch reads (lane=regular, lane=feed, limit=60) and one
     restrict each (by=all&key=all&type=video&per_shelf=60, repeated ids; 4 -> 4, 60 -> 60). Both addon
     shelves: すべて見る -> /drive/%E5%8B%95%E7%94%BB/addons/media_import.
  2. Profile subent (s2-profile-reload-discover.png, -reload.png): order 続きから, おすすめ, よく見るソース,
     購読の新着, 新着. Continue requested shelves?by=watch&key=continue&type=video&sort=last_played&per_shelf=12
     (7/7). Its すべて見る -> apps/video/shelf?by=watch&key=continue&from=discover. おすすめ has no すべて見る;
     one /pickup?limit=60&offset=0 (total 272), restrict with watch=unwatched -> 49, so one page only.
     Reload: same ids in every shelf, same order.
  3. Continue is the desk: its 7 ids equal watch-history?filter=continue&type=video, and, read inside the
     backend container, exactly the viewer's 動画 video rows with position >= 3 % and < 90 % of duration,
     last played since 2026-10-27, dismissed_at NULL, newest first (the next row, 2026-10-16, is left out).
     The 4 おすすめ ids are all in the first 40 restricted feed ids (recomputed through the same endpoints);
     no Continue id is among them.
  4. Continue See all (s9-continue-seeall.png): page 続きから, sort button 最後に開いた順, 7 cards in the
     Discover order; request key=continue&sort=last_played&order=desc&per_shelf=60&page=1. Back returns to
     Discover with the same five shelves. Set-aside: POST /api/files/RsH7kcRuDFup/progress/dismiss (204);
     the See all page then showed 6 cards (s10-continue-after-dismiss.png). The row's dismissed_at was set
     back to NULL inside the container (count 7 again, last_played_at unchanged).
  5. Library first (lib.cjs): after a reload on ライブラリ only the folder classification was requested,
     no continue, /pickup, /watch or restrict. Clicking 発見 sent them once; ライブラリ -> 発見 again sent
     nothing new and drew the same five shelves.
  6. Target -> smart folder あんこ動画 (s4-target-anko.png): every request carried tag=あんこ, including
     key=continue (0 items) and the restricts. Pickup read 5 pages (offsets 0..240), each followed by one
     restrict; the pool had 4 ids and おすすめ drew those 4. Both Media Import shelves absent. While loading
     the DOM went 続きから|新着 -> 新着 -> おすすめ|新着; no provider shelf showed the previous target's items.
     Target restored to すべての動画: five shelves again.
  7. Mixed drive テスト画像 with profile (s5-mixed-discover.png): おすすめ, 新着. Continue 0/0 so absent.
     Pickup 5 pages; restricts 9+9+11+10+6. No Media Import shelf and no restrict for the lanes.
  8. Profile with no feed (s6-nofeed-discover.png): /pickup 0 of 0, no restrict for it, おすすめ absent,
     Continue 0/0 absent; よく見るソース, 購読の新着, 新着 drawn.
  9. English (s7-en-discover.png): Continue, Recommended, Regular sources, New from subscriptions, New.
  10. Phone width 390 (s8-phone-discover.png): same order and ids.
  Docs from the merge, read against the above: docs/user-guide/video.md (Continue within two weeks, set
  aside hidden; See all opens the desk with 最後に開いた順; Recommended no See all), docs/reference/api.md
  (key=continue under by=watch; ids filter), docs/ADDON-DEVELOPMENT.md (video-discover-recommended /
  video-discover-shelves rows) match what was seen.
  Every page logged MISSING_MESSAGE pageJump.aliases.app-video / app-reading / continue. They come from
  useJumpDestinations.ts and messages-core, both identical to origin/develop; this change does not touch them.
pending: |
  Not produced by ordinary use against the running stack (no restart or config change allowed):
  the drive's index feature turned off (Pickup 404), a Media Import /watch failure, a provider or module
  failing to load, and the catalogue-loading window. These are left to the unit tests or a human.
  No item of agent_cannot_verify is touched by this change.
