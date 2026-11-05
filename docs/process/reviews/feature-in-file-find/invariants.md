spec: docs/specs/in-file-find.md

## Revisions

I10. (r0) Opening the bar by any route — the button, Cmd/Ctrl+F, `?find=` or `find-shortcut` from the EPUB frame — focuses and selects the input, lists and selects the 「検索」 tab in both inspector instances, opens the desktop inspector or raises the phone sheet to at least half, and remembers the tab and layout it replaced; on any surface other than `canonical` (the file page `RightPaneFile` draws) there is no button and no shortcut.

## Clarifications

Settled with the human on 2026-11-05, while the acceptance tests were written. These fill gaps in the approved spec and change no invariant.

- The bar's buttons are named 「前の箇所」, 「次の箇所」 and 「検索を閉じる」.
- A chip reads its label, a space and its count (「発話 6」), and 「発話 6+」 when `truncated` is true.
- `set-find-intercept` is `{type: "set-find-intercept", interceptFind: boolean}`, the same field name as on `open`.
