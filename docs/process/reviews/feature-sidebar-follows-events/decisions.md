# Decisions

decision:
ran_in_app: yes
at: 93ee384f67e6c35e098707aaf4509b5becbb82d4
by: agent
evidence: Narrow re-run at 93ee384f6 (frontend rebuilt with scripts/dev/r5_stack.py up frontend; container created 2026-11-27T06:09:55Z), headless Chromium (Playwright 1.58.2), http://video-share-sidebar.localhost:3107, drive 動画 (public), 1280px. Script and screenshots: /private/tmp/claude-502/-Users-libre-Sources-video-share/6885aac4-d216-4105-8607-81874d174a0e/scratchpad/r5/r7c.mjs, r7c-*.png.
  (7c) A opens the sidebar inline rename on "R5 Z", types "Z typed"; B (API, same context) deletes Z; A presses Enter 8-9 ms later. Three runs: PUT answers 404 each time; no toast seen while polling [role=alert],[role=status] every 20 ms for 2 s; the input closes 20-35 ms after B's delete; A issues a collections GET ~14 ms after (the re-read) and another ~507 ms after (the event round); Z is gone from the sidebar. No reload (window marker kept). r7c-404-noToast.png.
  (regression) Inline rename "R5 N" -> "R5 N renamed": PUT 200, sidebar shows the new name, old gone, input closed, no toast. r7c-normal-rename.png. Inline rename "R5 M" -> "R5 Used" (name in use): PUT 409, input stays open with value "R5 Used", aria-invalid=true, described by "A collection with this name already exists", no toast. r7c-dup-rename.png. Collections created for the run were deleted.
  Earlier full run at 989440c7d26db55585b393418a18a4dc8a3a1202 (scripts s1.mjs..s9.mjs, s*.png in the same directory): steps 1-8 all passed (create/rename/add/delete seen in tab A in ~530-600 ms with no reload, same-tab rename/delete, pins incl. folder rename, batch tags, missing purge, other-drive events causing no reads, open rename input kept / closed on delete, context menu closed on delete, mobile overlay, gathering timing). Its one difference was 7c, which showed the toast "Failed to rename collection (the name may already be in use)"; fixed by 93ee384f6 as above.
pending: none. Not produced by ordinary use: a WebSocket disconnect/reconnect round (I9), a failed round keeping rows (I5), the internal tag write from the Knowledge scanner (drive.tags_changed), and a rename whose request is still in flight when the list without its collection is applied.
author_resolutions:
  - claude-deep:SCOPE-1 accept: useDriveScopedReads.ts was split out of useSidebarData.ts on the author's instruction to keep the hook under ~250 lines; useSidebarData.ts delegates to it and re-exports ScopedTags. No behaviour outside the spec; the approved spec is not edited after approval.
  - claude-read:F1 accept: same as claude-deep:SCOPE-1.
  - claude-read:1 accept: 1x2; a rename answering 404 means the collection is gone, so the input closes and the re-read removes the row (R-5 re-run at 93ee384f6).
  - claude-read:2 accept: 5x1; an own collection write reads collections at once and again in the round from its own broadcast; extra LAN requests only.
  - claude-read:3 accept: 1x2; after leaving drive pages and coming back with a failing tag read, Tags stays null, which the Tags section draws the same as empty.
  - claude-deep:1 accept: same as claude-read:1, including a drive-not-found 404.
  - claude-deep:2 accept: 0x1; an event matched in the tick of a drive switch starts one extra round for the new drive.
  - claude-deep:3 accept: same as claude-read:3.
