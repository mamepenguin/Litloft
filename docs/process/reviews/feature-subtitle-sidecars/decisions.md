# Decisions

decision:
ran_in_app: yes
at: 1ae8d4876e99bbc0989bd16d1e8a971d04521287
by: agent
evidence: |
  Environment: worktree /Users/libre/Sources/video_share-subtitles at the SHA above, knowledge
  submodule checked out at 7a94f8d. Stack started with `scripts/dev/r5_stack.py clone` + `up`
  (images rebuilt by `up --build`; the frontend bundle contained the new subtitle codes) on
  http://video-share-subtitles.localhost:3101, data cloned, the main stack untouched. A scratch
  drive `R5字幕` (bind of .r5-stack/scratch, added to the clone's drives.json and overlay) held
  4-second H.264 test videos made with ffmpeg and subtitle files with distinct cue text.
  Driven in headless Chromium (Playwright 1.58) at 1440x900, ja locale; phone runs at 375x812
  with isMobile + hasTouch (`(pointer: coarse)` matched). Disk checked on the host bind after
  each step. Stack downed and destroyed afterwards.
  Screenshots: docs/process/reviews/feature-subtitle-sidecars/r5/ (gitignored).

  1. A/movie.mp4 with movie.srt, movie.ja.srt, movie.en.vtt. Info tab shows `字幕 3` and rows
     既定/movie.srt, 英語/movie.en.vtt, 日本語/movie.ja.srt (bare first, then by code). Row buttons
     at opacity 0, 32x32, until hover; on hover opacity 1, replace + red delete icons, row gets the
     elevated background (main-nohover.png, main-hover.png, main-full-1440.png). Player `<video>`
     carries three `<track>`s with `?v=<mtime_ns>`; the player's settings menu offers オフ / 字幕 /
     Japanese (player-menu-A.png, taken after the English track was deleted in step 4). PASS.
  2. B/plain.mp4 (no subtitles): empty state `字幕はありません` + 字幕を追加 (item2-empty.png). Form:
     ファイル 選択… + name, 言語 select with the 13 two-letter codes, 指定しない, その他のコード…,
     resulting name `plain.ja.srt`, キャンセル / 追加 (add-form.png). その他のコード… opens a text
     field under the select (add-form-other.png). Adding good_ja.srt as ja: list shows `字幕 1 日本語
     plain.ja.srt`, no page navigation, player gained the Japanese track showing cue
     `追加した日本語キュー`; file on disk. Shift_JIS file → `UTF-8 で保存された字幕ではありません。`;
     notes.txt → `.srt か .vtt のファイルを選んでください。`; a second ja →
     `この言語の字幕はすでにあります。差し替えを使ってください。` — each shown under the list with the
     form keeping its file and language; nothing written to disk (item2-err-*.png). Other-code
     field: `x` → `言語コードは英字 2〜3 文字で入力してください。`; `Pol` → saved as f2.pol.srt.
     PASS, with FAIL-2 below.
  3. Picked Japanese in the player, replaced movie.ja.srt with replacement.srt via the row's replace
     button (file chooser). Row still `movie.ja.srt`; track src version changed; the showing
     Japanese track's loaded cue changed from `A 日本語キュー 元` to `差し替え後の新しいキュー`; disk
     file has the new bytes. Same with the player's own menu on B (English picked → cue changed
     after replace). PASS.
  4. Shared C/movie.srt (movie.mp4 + movie.mkv): dialog `字幕を削除しますか？`, bold `movie.srt`,
     `ディスクから削除します。元に戻せません。`, `同じ名前の動画 1 本からも消えます。`, キャンセル (sand) and
     削除 (red text) (delete-dialog-shared.png). Cancel → file kept. Unshared A/movie.en.vtt: no
     shared line (delete-dialog.png, 448px wide); Escape and a backdrop click close it and keep the
     file; confirm removes it from disk, list shows 2 rows, player drops the track. Deleting the
     last track on B: list empty, player falls back to the 自動生成 track. PASS, with FAIL-1 below.
  5. Rename from the file page (FileActions → 名前を変更): R/renme.mp4 → renamed.mp4: renme.srt
     and renme.ja.srt became renamed.srt / renamed.ja.srt on disk; the page's list showed the
     carried names without reload (item5-after-rename.png). Move dialog → E: renamed.mp4 and both
     sidecars in E, none left in R, list still shows them (item5-after-move.png). Rename D/vid.mp4
     → target.mp4 while D/target.srt holds different content: the dialog shows an alert box
     `行き先に同じ名前の字幕があります。 D/target.srt`, input border rgb(158,10,10)
     (rename-refused.png); disk unchanged (vid.mp4, vid.srt, target.srt with their old content).
     PASS, with DIFF-1 below.
  6. Selection mode in C, both `Movie` (movie.mp4, movie.mkv) selected → 移動 → B: both moved, one
     movie.srt in B, C empty (item6-shared-move.png). Selection in F (f1.mp4 with f1.srt, f2.mp4)
     → E where E/f1.srt holds different content: f2.mp4 moved, f1.mp4 and f1.srt stayed in F,
     E/f1.srt unchanged, toast `1 件は字幕のため移動しませんでした`
     (toast-item6-collision-move.png). PASS. Paste was not exercised for the refusal path.
  7. Copy (FileActions → コピー, then Cmd+V in the folder) of G/copyme.mp4 (ja.srt, en.vtt):
     copyme_copy.mp4 + copyme_copy.ja.srt + copyme_copy.en.vtt with identical bytes; sources
     unchanged; the copy's page lists 英語 and 日本語. PASS.
  8. Trashed T/t.mp4 (own t.srt) and T/s.mp4 (s.srt shared with s.mkv), then ゴミ箱を空にする on the
     drive's trash: T left with s.mkv and s.srt; t.mp4, t.srt, s.mp4 gone from disk. PASS.
  9. Upload drawer → フォルダをアップロード with ep01.ja.srt, ep01.mp4, ep02.ja.srt, ep02.mp4: all
     four landed in upfolder/, each video's Info tab lists 日本語 epNN.ja.srt
     (item9-upload-drawer.png). Drawer refusals: re-uploading ep01.ja.srt →
     `行き先に同じ名前の字幕があります。 upfolder/ep01.ja.srt`; sjis.srt →
     `UTF-8 で保存された字幕ではありません。`; nothing new on disk (item9-drawer-refusals.png). PASS.
  10. Rename G/copyme_copy.mp4 → x.srt: dialog shows `.srt と .vtt の名前は字幕のアップロードでだけ
      使えます。`, nothing changed on disk (item10-rename-x-srt.png). PASS.
  11. Knowledge service running in the stack. New note G/r5note2.md, typed `before drop`, dropped
      dropped_r5.srt (DragEvent with a DataTransfer file on the CodeMirror content): editor text
      stays `before drop`, no placeholder and no loft:// link; toast
      `dropped_r5.srt は字幕として、このフォルダの動画の横に保存しました`; G/dropped_r5.srt on disk
      (item11-after-drop.png). Paste of a subtitle not exercised. PASS.
  12. Phone 375px, coarse pointer, inspector sheet → 情報: section 343px wide, rows 60px tall with
      padding-left 10px / padding-right 0, buttons 44x44 and visible (opacity 1), document
      scrollWidth 375, no element past the viewport (phone-rows.png). Empty state and empty + error
      (phone-empty.png, phone-empty-error.png), one row + error (phone-row-error.png), add form at
      full width (phone-error-addform.png, phone-row-error-addform.png). PASS.

  Design screenshots, in words:
  - Main (main-hover.png, 383px inspector): `字幕 3` small muted label with the count, three rows
    (label in text-sm, file name small muted), the hovered row elevated with refresh + red trash
    icons, sand 字幕を追加 pill with a plus. Order is 既定, 英語, 日本語 (the design shows 既定, 日本語,
    English); labels are translated (英語 rather than English).
  - Add (add-form.png): bordered elevated panel with ファイル / 選択… pill / chosen name, 言語 select,
    resulting name, キャンセル and red 追加 right-aligned.
  - Delete (delete-dialog.png, delete-dialog-shared.png): as in step 4.
  - Phone (phone-rows.png, phone-empty-error.png, phone-row-error.png): rows with 44px icons,
    empty text, red alert box under the list, sand add button.
  - Rename (rename-refused.png): title with pencil, input with red border, red alert box with the
    message and `D/target.srt` in regular weight, キャンセル / 変更.

  Failures and differences found:
  - FAIL-1. Deleting the track being shown, with captions on, turns captions off instead of showing
    the first remaining track (spec 185 States, "Player tracks"). B/plain.mp4 with ja + en, English
    picked in the player menu, English deleted: every remaining textTrack is `disabled`, the player
    menu shows the captions-off icon and no track list (item4c-after-delete-menu.png).
  - FAIL-2. Adding a track whose language sorts before the track being shown turns the new track on
    as well, so two tracks show at once (spec 185 States: the track being shown stays the same file
    across an add). R/plainfile.mp4 with Japanese picked, add `de`: textTracks German `showing`,
    English `disabled`, Japanese `showing`; both cue texts are drawn over the video at 0:01
    (item2c-two-tracks-showing.png). The same seen when adding en after ja on a fresh page.
  - DIFF-1. D8: the rename refusal names are not bold. The alert is a single span
    `行き先に同じ名前の字幕があります。 D/target.srt` at font-weight 400; the design draws the name at
    600.
  - Observation. With その他のコード… selected and the code field left empty, 追加 is enabled, the
    preview shows `f2.srt`, and the add creates a bare track f2.srt (no `subtitle_language` error).
  - Unrelated to this change: every video's Info tab shows `チャプター候補を読み込めませんでした。` from
    the intelligence addon in this stack.
pending: |
  - Subtitles seen and heard during real playback (timing, sync, rendering on devices) —
    PROJECT.md agent_cannot_verify "Audio and video as heard and seen". Cue text was read from the
    browser's TextTrack objects and one paused frame only.
  - The iOS app and other household devices, the real home LAN (agent_cannot_verify).
  - Not exercised: paste (ClipboardProvider) with a subtitle refusal, batch rename refusal,
    FileContextMenu and folder-tree inline rename entry points, quick note with a .srt name,
    pasting a subtitle into the knowledge editor, sidecar carry failure (needs a disk error),
    a 404 stale-list on replace/delete, and the 30-day auto-purge.
