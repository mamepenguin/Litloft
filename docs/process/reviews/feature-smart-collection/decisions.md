# Decisions

decision:
ran_in_app: yes
at: fe615e7220aa57f44e4e516c7f1d32101e97dde7
by: agent
evidence: |
  Second R-5 run, after the fix for the first run's item 4, in a Playwright-driven Chromium
  (1.58.2) against this worktree's running stack at
  http://video-share-smart-collection.localhost:3101 (drives 動画 and テスト画像), at 1440x900
  and 375x812, in ja and en. The stack was not started, rebuilt or restarted, and is left
  running. Throwaway fixtures were made in the app's own API on this stack's data: eight Smart
  Collections (r2 ren / r2 del, ja|en, 1440|375), four collections (r2 coll del ...), and four
  29-30 byte .txt files uploaded to 動画 and moved to its trash. Screenshots are under
  docs/process/reviews/feature-smart-collection/shots/ with the r2- prefix (69 files); one line
  per captured state, with its viewport, overlay box, dialog box and the element returned by
  elementsFromPoint at five fixed points, is in .r5/manifest.jsonl (75 lines added by this run).

  1. OK. Sidebar Smart Collection row → right-click → 名前変更 / Rename. Both dialogs are now
  portalled to document.body: overlay exactly 1440x900 at z-50 with its bg-black/60 dimmer,
  and the dialog 448x209 at x=496 (centre 720 = the window's centre, dy=0). elementsFromPoint
  at the four corners and over the 240px sidebar returns the dimmer, so the whole window is
  dimmed, sidebar included (aside z-40). The title スマートコレクションの名前を変更 / Rename
  Smart Collection is one line in both locales, and キャンセル/変更 sit on one line.
  Name in use: renaming "r2 ren ja1440" to "trip" against the collection "Trip" answered
  PATCH 409 {"detail":"Name already in use"}; the input stayed open holding "trip", focused,
  caret 4/4, aria-invalid=true, aria-describedby pointing at the visible line
  同じ名前のコレクションがあります / A collection with this name already exists (12px,
  rgb(158,10,10), 4px under the field's row, 400px wide = that row), the field's border
  rgb(158,10,10), 変更 enabled, no toast and no 名前変更に失敗しました text. A click on the
  dialog's title (blur) sent nothing, kept the line and the dialog open, and put focus back in
  the input; Enter with the unchanged text sent nothing; one typed character removed the line
  and aria-invalid; a second 409 followed by Escape closed the dialog, and reopening showed
  the current name with no line. Renaming to "r2 renamed ja1440" answered 200, closed the
  dialog and replaced the row (no old name left, no toast). The same sequence passed at 375
  (overlay 375x812, dialog 343 wide at x=16, centred; the ja title wraps to two lines at that
  width, the en one stays on one) and in en at 1440. See
  r2-sidebar-rename-dialog-{ja,en}-{1440,375}.png, r2-sidebar-rename-in-use-*-1440/375.png,
  r2-sidebar-rename-in-use-blur-ja-1440.png, r2-sidebar-rename-success-*.png.

  2. OK. The row's 削除 / Delete confirmation is the shared ConfirmDialog, now in the body
  portal: overlay 1440x900 z-50 with the dimmer over every probe point including the sidebar,
  dialog 448x162 at x=496, centred (dy=0), title スマートコレクションを削除 / Delete Smart
  Collection on one line, focus on the Delete button. Escape closed it with the row still
  there; Cancel closed it with the row still there and no request; Delete answered DELETE 204,
  the dialog closed and the row disappeared from the sidebar immediately and after a reload,
  with GET /smart-folders no longer listing it. Same at 375x812 in ja and en. See
  r2-sidebar-delete-dialog-{ja,en}-{1440,375}.png, r2-sidebar-delete-done-*.png.

  3. FAIL (one line, Escape on the collection page's dialog). Moving a file to the trash from the
  file's actions menu still uses the shared ConfirmDialog and is correct: overlay in
  document.body 1440x900 z-50, dimmer on every probe point, dialog 448x186 at x=496 centred,
  title on one line, focus on its confirm button; Escape closed it, Cancel closed it with the
  viewer still open, and ゴミ箱に移動 / Move to Trash answered DELETE 200, closed the viewer
  and the file was listed by GET /trash. Passed in ja and en at 1440 and 375 (343 wide at
  375). The collection page's `…` → コレクションを削除 / Delete collection is not
  ConfirmDialog: it is CollectionDetail's own inline fixed overlay (z-50, bg-black/50, dialog
  max-w-sm = 384px at 1440, 343px at 375), still centred, the whole window still dimmed,
  Cancel closes it and the delete answered 204 and left the page; but Escape does not close
  it, in ja and en at 1440 and 375. That overlay was not changed by this fix, so this is not a
  regression, but it differs from "Escape closes each". See
  r2-file-trash-dialog-*.png, r2-file-trash-done-en-375.png,
  r2-collection-delete-dialog-*.png, r2-collection-delete-after-escape-ja-1440.png.

  4. OK. At 375 with the sidebar drawer open (aside z-40 inside its z-30 scrim), the rename
  dialog and the delete confirmation render in the body portal at z-50: overlay 375x812,
  dialog 343 wide at x=16 (centred, dy=0), and elementsFromPoint at (120,100) and (120,700)
  returns the dimmer above the drawer's rows, with the field at the dialog's centre as the top
  element. Both worked from the open drawer: the rename reached the 409 line, closed on
  Escape and renamed with 200 (row renamed), and the delete closed on Escape and Cancel and
  answered 204 with the row gone, in ja and en. See
  r2-sidebar-rename-over-drawer-{ja,en}-375.png, r2-sidebar-delete-dialog-*-375.png and the
  stacks recorded in .r5/manifest.jsonl.
pending: none
