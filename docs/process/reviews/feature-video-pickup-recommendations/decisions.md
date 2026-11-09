# Decisions

decision:
ran_in_app: yes
at: 3b2dcd2a891269b52831f48172ec855bc2e4c47a
by: agent
evidence: |
  Tree: core 3b2dcd2a (clean except submodules). The running stack (video_share-vds-*, http://localhost:3000)
  used the checked-out addons intelligence 548ff29f and media_import 0cb808a5. HEAD still pins the older
  addon commits (intelligence ef6410c6, media_import 9368b26e); the pointer bump is uncommitted.
  Browser: headless Chromium via Playwright 1.58.2 (the Chrome extension was not connected). Profile set
  with the lit_viewer cookie (nickname "subent" = viewer 02bb286b0179327f; "r5-probe-nofeed" = a profile
  with no Pickup feed). Screenshots in
  /private/tmp/claude-502/-Users-libre-Sources-video-share/c1771ebc-a854-4501-b14a-25e283d83837/scratchpad/r5/shots/
  1. No profile, drive 動画, default target (s1-noprofile-discover.png): shelves よく見るソース, 購読の新着, 新着.
     No 続きから, no おすすめ, no /pickup request. Requests: watch?lane=regular and lane=feed (limit=60) and one
     restrict per lane (by=all&key=all&type=video&per_shelf=60, repeated ids; 4 ids -> 4, 60 ids -> 60).
     Both addon shelves had すべて見る -> /drive/%E5%8B%95%E7%94%BB/addons/media_import.
  2. Profile subent (s2b-profile-reload-*.png): order 続きから, おすすめ, よく見るソース, 購読の新着, 新着.
     おすすめ had no すべて見る. One /pickup?limit=60&offset=0 (total 271), restrict with watch=unwatched
     returned 53, so the provider stopped after one page. After a reload the おすすめ ids were the same,
     in the same order. The 4 drawn ids (12rHLQIAKnL1, z4hItdQwJKeQ, e9VgPeWyoIRT, ZKP6bUOXUAgE) are active
     動画 videos with no watch_history row for the viewer, and all are in the first 40 restricted feed ids
     (checked against pickup_item inside the intelligence container).
  3. Library face first (s3-library.png): after a reload on ライブラリ, no /pickup, /watch or restrict request.
     Clicking 発見 sent them once. Switching ライブラリ -> 発見 again sent no provider request; same shelves.
  4. Target -> smart folder あんこ動画 (tag:あんこ type:video), s4-target-anko.png: the providers ran again
     with tag=あんこ. Pickup read 5 pages (offsets 0..240), each followed by one restrict. While loading,
     the DOM showed only 続きから|新着 (no provider shelf with the previous target's items), then 続きから,
     おすすめ, 新着. Both Media Import shelves were absent; the API confirms 0 of their lane ids match the
     tag. The default target was restored afterwards.
  5. Mixed drive テスト画像 with profile (s5-mixed-discover.png): おすすめ drawn. Pickup read 5 pages; restricts
     returned 9+9+11+10+6 = 45 (the spec's measured 45). No Media Import shelf and no restrict for the lanes
     (that drive has only library subscriptions, so restrict([]) sent nothing).
  6. Profile with no feed (s6-nofeed-discover.png): /pickup returned 0 of 0, no restrict for it, おすすめ
     absent; the Media Import shelves still drawn.
  7. English (s7-en-discover.png): Continue, Recommended, Regular sources, New from subscriptions, New.
  8. Phone width 390 (s8-phone-discover.png): same order, two columns.
  9. See all on 購読の新着 opened /drive/動画/addons/media_import (s10-seeall-media-import.png). An おすすめ
     card opened the file (s11-recommended-card-open.png); the viewer's row became 0/0 (opened only).
     On reload that video stayed in おすすめ, as the stale-feed case expects for a video only opened.
  10. API: 61 ids -> 422 "ids accepts at most 60 elements"; 60 duplicate ids -> 200; ids= and an empty
     element among valid ids -> 422; an id from テスト画像 on 動画 -> not returned; reversed ids -> answered
     in the backend's order (restrict re-orders on the client); unknown drive -> 404. A video was trashed
     (DELETE /api/files/V-vy3qP6zejZ): restrict dropped it, and the Discover lane showed a different 4th
     video. It was restored (deleted_at NULL again).
  Every page logged MISSING_MESSAGE pageJump.aliases.app-video / app-reading. That comes from
  useJumpDestinations.ts and messages-core, neither of which this change touches.
  Shelves draw 4 cards (one row at 1440, 2x2 at 390). That is the existing shelf grid, and Continue and New
  do the same.
pending: |
  Not produced by ordinary use against the running stack (no restart or config change allowed):
  the drive's index feature turned off (Pickup 404), a Media Import /watch failure, a provider or module
  failing to load, and the catalogue-loading window. These are left to the unit tests or a human.
  No item of agent_cannot_verify is touched by this change.
