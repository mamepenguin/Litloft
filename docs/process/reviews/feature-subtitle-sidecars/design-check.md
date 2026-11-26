# Design check

at: 0ede039b559bf46928b0ffba22bd87aff7814e56
design: docs/process/reviews/feature-subtitle-sidecars/design/

## Decisions read from the design
- Main: Info tab, 384px wide. Section heading `字幕 <count>` 12px/500 muted, count weight 400 (Main.dc.html:31)
- Main: rows in order 既定, 日本語, English (Main.dc.html:33-58); row padding 8px 10px, radius 12px, gap 8px (Main.dc.html:33)
- Main: row label 14px, file name 12px muted, ellipsis (Main.dc.html:35-36)
- Main: hovered row background #f6f6f3; replace + delete buttons 32x32 round, 16px icons, delete in #9e0a0a (Main.dc.html:39-51)
- Main: add button pill, #e5e5e0, 13px, plus icon 14px, label 字幕を追加 (Main.dc.html:61-64)
- Add: inline form panel under the list, border 1px, radius 16px, bg #f6f6f3, padding 12px, gap 12px (Add.dc.html:33)
- Add: label ファイル, `選択…` pill + file name; label 言語 + select (日本語 (ja), English (en), 指定しない, その他のコード…); resulting name 12px muted; キャンセル (transparent) and 追加 (#d63031, white) right-aligned (Add.dc.html:34-54)
- Delete: modal 392px wide (440 artboard minus 24px padding), radius 20px, padding 24px, no close button, title 18px/700 (Delete.dc.html:16-18)
- Delete: name 14px/600, two 13px muted lines (disk / shared), キャンセル sand pill 14px, 削除 transparent #9e0a0a 600 (Delete.dc.html:19-27)
- Phone: empty section heading `字幕` without count, text 字幕はありません 14px muted, add button min-height 44px, 14px (Phone.dc.html:24-31)
- Phone: row padding 4px 0 4px 10px, buttons 44x44, 18px icons, no round background (Phone.dc.html:37-49)
- Phone: error alert, bg rgba(230,0,35,0.08), #9e0a0a, 13px, alert icon 16px (Phone.dc.html:52-55)
- Phone: tabs 情報 / 関連 (Phone.dc.html:18-21)
- Rename: title 名前を変更 with no icon, no close button; label 新しい名前 above input; input border #9e0a0a, white bg, radius 12px (Rename.dc.html:18-21)
- Rename: alert with no icon, message then each name on its own line at 600; names bare (`Night.ja.srt`) (Rename.dc.html:23-26)
- Rename: キャンセル transparent, 変更 #d63031 (Rename.dc.html:28-29)

## Findings
### D-1 Main: track order differs
- design: 既定, 日本語, English (Main.dc.html:33-58)
- implementation: 既定, 英語, 日本語 (sorted by code) (r5/main-hover.png; decisions.md notes it)
- visible: at a glance

### D-2 Main: labels are translated names, not the design's `English`
- design: third row label `English` in a ja page (Main.dc.html:55)
- implementation: `英語` (r5/main-hover.png)
- visible: at a glance

### D-3 Delete dialog: close button added
- design: no close button, title only (Delete.dc.html:18)
- implementation: an X at the top right of the dialog (r5/rerun-reg4-delete-dialog-shared.png)
- visible: at a glance

### D-4 Delete dialog: wider than the design
- design: 392px (Delete.dc.html:16-17)
- implementation: 448px at 1440 (r5/rerun-reg4-delete-dialog-shared.png, x 496 to 944); decisions.md also gives 448
- visible: only by measuring

### D-5 Rename dialog: pencil icon in title and close button added
- design: plain title, no close button (Rename.dc.html:18)
- implementation: pencil icon before the title, X at the right (r5/rerun-d8-rename-refused-440.png)
- visible: at a glance

### D-6 Rename dialog: no 新しい名前 label above the input
- design: label 12px muted (Rename.dc.html:20)
- implementation: input with no label (r5/rerun-d8-rename-refused-440.png)
- visible: at a glance

### D-7 Rename dialog: input background is sand, not white
- design: #ffffff (Rename.dc.html:21)
- implementation: light sand fill inside the red border (r5/rerun-d8-rename-refused-440.png)
- visible: side by side

### D-8 Rename dialog: alert has an icon
- design: text only (Rename.dc.html:23-26)
- implementation: alert icon at the left of the box (r5/rerun-d8-rename-refused-440.png)
- visible: at a glance

### D-9 Rename dialog: names carry the folder and the whole name block is bold
- design: bare name `Night.ja.srt`, 600, message line regular (Rename.dc.html:24-25)
- implementation: `D/target.srt`, `D/target.ja.srt` (folder prefix) (r5/rerun-d8-rename-refused-440.png). The message line also looks darker than regular in the shot, which cannot be confirmed from the image; decisions.md says it is weight 400.
- visible: at a glance (folder prefix)

### D-10 Rename dialog: キャンセル is a sand pill
- design: transparent background (Rename.dc.html:28)
- implementation: light sand pill (r5/rerun-d8-rename-refused-440.png)
- visible: side by side

### D-11 Phone: row taller than the design
- design: 4px vertical padding plus 44px buttons, about 52px (Phone.dc.html:37-49)
- implementation: rows 60px tall (decisions.md item 12; r5/phone-row-error.png shows the larger spacing)
- visible: only by measuring

### D-12 Phone: error sits above the add button
- design: alert directly after the list (Phone.dc.html:52); the add button is not drawn in that artboard
- implementation: alert between list and 字幕を追加 button, in both empty and one-row cases (r5/phone-empty-error.png, r5/phone-row-error.png). The design draws the empty state's button right after the text and never draws button plus error together, so the order is not specified.
- visible: side by side

### D-13 Phone: tab set not the design's
- design: 情報 / 関連 (Phone.dc.html:19-20)
- implementation: 情報 / 文字起こし / 関連 (r5/phone-row-error.png). Likely existing core behaviour for a video with a transcript; reported as seen.
- visible: at a glance

### D-14 Main and Add: Info tab surroundings not comparable
- design: tabs 情報 / チャプター / 関連, then 種類 / 長さ / サイズ / フォルダ rows above 字幕 (Main.dc.html:17-28)
- implementation: R-5 shots (r5/main-hover.png, r5/add-form.png) are cropped to the inspector body and show title, Like/お気に入り/検証済み, AI, tag row, then 字幕; no 種類/長さ/サイズ/フォルダ rows and no tab bar visible in the Main-width shots.
- visible: at a glance

### D-15 Add: the design's state (one existing row plus open form) is not shown
- design: 既定 row above the open form (Add.dc.html:24-55)
- implementation: add-form.png shows the form opened from the empty state only; no shot with the form open under an existing row at inspector width
- not shown in R-5 with a row above; the form itself matches
- visible: not comparable

TOTAL: 15 findings
