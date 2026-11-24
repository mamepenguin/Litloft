# Decisions

decision:
ran_in_app: yes
at: 6921309b52ba0a672d1a8ee592fc45d0073bb5ea
by: agent
evidence: Isolated stack from `scripts/dev/r5_stack.py clone` + `up` (images built from this worktree at 6921309b5; the built bundle contains `deleteOthers`), opened at http://video-share-dupkeep.localhost:3102/admin in headless Chromium (Playwright 1.58.2; the Chrome extension was not connected). Drive 動画, Duplicate Files section.
  1. Group 【神回】グローバル前日… (3 files), ja: expanding shows 3 `input[type=radio]`, 0 checkboxes, all named `keep-<group hash>`. First file checked with the 保持 badge; button reads 他の2件を削除.
  2. Clicking the second row moves the radio and the 保持 badge to it, the first loses both; the button still reads 他の2件を削除. Only one radio on the page is checked.
  3. Delete button opens the confirm dialog: title 他の2件を削除, message 2件のファイルをゴミ箱に移動しますか？, buttons キャンセル / 他の2件を削除. Closing it trashes nothing.
  4. Same steps in en: badge Keep, button and dialog title/confirm read "Delete 2 others"; on the 2-file group SNS投稿文.md they read "Delete 1 other".
  5. Two groups expanded at once (SNS投稿文.md and the 3-file group): marking a file in one leaves the other's selection unchanged; ArrowUp inside the 3-file group moves the selection within that group only. Buttons read 他の1件を削除 and 他の2件を削除.
  6. Delete with the second file (U1qnNxiciAau, "(1).loft") marked, confirmed in the dialog: the group leaves the list (13 -> 12 groups); GET /api/files/U1qnNxiciAau 200; W17j2XxMAmxf and 3bDTTEyx4Rma 404 and both listed in the drive's trash, nothing else from the group. Restored both with POST /api/files/batch/restore afterwards (all three 200, 13 groups again).
  Observed, not changed by this commit: the en confirm message reads "Move 1 files to trash?" for a single file (`confirmDelete` has no plural form).
  Screenshots: /private/tmp/claude-502/-Users-libre-Sources-video-share/2405e118-38ad-4b3f-be06-cedbc7000d33/scratchpad/shots/ (ja-02-expanded.png, ja-03-marked-2nd.png, ja-04-confirm.png, en-*.png, en1/en-*.png, ja-two-groups.png, del/ja-03-marked-2nd.png, del/ja-04-confirm.png, del/ja-05-after-delete.png). The stack ran on an APFS clone of data/ under .r5-stack/, so the main data/ was not written.
pending: none
