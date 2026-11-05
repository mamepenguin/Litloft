spec: docs/specs/in-file-find.md

## Revisions

I10. (r0) Opening the bar by any route — the button, Cmd/Ctrl+F, `?find=` or `find-shortcut` from the EPUB frame — focuses and selects the input, lists and selects the 「検索」 tab in both inspector instances, opens the desktop inspector or raises the phone sheet to at least half, and remembers the tab and layout it replaced; on any surface other than `canonical` (the file page `RightPaneFile` draws) there is no button and no shortcut.

I11. (r0, R-5) The find answer's `indexed` is true exactly when the stage that fills the file's kind has finished — `whisper_indexed` for a video or audio file, `ocr_indexed` for an image, `text_indexed` for every other kind — or when the file has an active Visual Index run while the drive's Visual Index is open; a file whose stage has not finished answers `indexed: false`, so it shows the not-yet-indexed text and never 「見つかりません」. This replaces the "any flag" rule of the addon's Normal flow step 6.

## Clarifications

Settled with the human on 2026-11-05, while the acceptance tests were written. These fill gaps in the approved spec and change no invariant.

- The bar's buttons are named 「前の箇所」, 「次の箇所」 and 「検索を閉じる」.
- A chip reads its label, a space and its count (「発話 6」), and 「発話 6+」 when `truncated` is true.
- `set-find-intercept` is `{type: "set-find-intercept", interceptFind: boolean}`, the same field name as on `open`.
