spec: docs/specs/extraction-edits.md

## Revisions

## Clarifications

Settled with the human on 2026-11-06, at approval:

- The spec's 19 owner decisions are as written in `## Decisions by the owner` (「推奨通りでよい」 for 1–16, 「3 つとも推奨どおり」 for 17–19).
- Design artifact https://claude.ai/artifact/BRLnWzgXrzvTmgUkP9pMnk is approved (「specとデザインを承認します」), with these two points confirmed (「その通りでよいです」):
  - When the source toggle has three options (分割テキスト / 単語 / 外部字幕) and 元の結果に戻す and AIで整える do not fit on one row, the two buttons move together to a second row at the right edge. Switching to a view without those buttons removes that row; the list moving up is accepted.
  - The new header controls keep the shipped header's size on touch screens. Raising every header control to the 44 px touch target is a separate change.
- The UI labels are the shipped ones: 分割テキスト (the utterance view), 単語, 外部字幕, AIで整える, AI整形済み.
