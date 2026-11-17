# Decisions

decision:
ran_in_app: yes
at: 4a0d5817a8bf33453a08274d2e2a85b46c0cee09
by: agent
evidence: Parallel r5_stack (http://video-share-drive-unavailable.localhost:3101), driven with headless Chromium via Playwright (the Claude-in-Chrome extension was not connected); no writes to any drive. Unknown drive nonexistent_drive_test on root, /sub/folder, ?view=trash, ?file=<id>, /apps/video, ja and en, 393px (touch, mobile emulation) and 1280px: h1 "ドライブ「nonexistent_drive_test」を開けません" / "Can't open the drive “nonexistent_drive_test”", one link "ドライブ一覧へ"/"All drives" -> "/", no Unlock link, no Add button (no buttons in the content), no drop text, no "no files" text, no listing/tree; app header and sidebar present at 1280 and header (menu, tree toggle, search, profile) at 393. 80-char name (aaaa...) at 393 and 1280 in ja and en: heading wraps over 3 lines inside the content, scrollWidth == clientWidth (393/393, 1280/1280), no sideways scroll. Real drive 動画 at 1280 and 393: listing with 30 images, Add button present, no unavailable heading after load; ?file=kgSmhrcuvf1q opens the file page (player, info pane), no unavailable heading. Screenshots: /private/tmp/claude-502/r5du/{ja,en}-{m,d}-{root,file,apps,long}.png, real-d.png, real-m.png, real-file-d.png, real-file-m.png. Script output: DOM text checks per route. Not checked: the brief empty state before the 404 arrives (networkidle waited past it); Unlock link redirect round-trip.
pending: Locked-drive case with the Unlock link and its redirect back after unlock (needs a protected drive; passwords.json is [] here, config not changed). Transient state while the summary request is in flight. Real-device touch (iOS) not attempted.

page-headings exception: the owner chose on 2026-11-17 to add DriveUnavailable.tsx to NOT_YET_MIGRATED in frontend/src/__tests__/page-headings.test.ts ("検査に例外を1件足す"); its heading is a centred 18px message, which PageHeader does not draw.
