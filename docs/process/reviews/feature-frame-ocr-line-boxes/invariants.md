spec: docs/specs/frame-ocr-line-boxes.md

## Revisions

## Clarifications

Settled with the human on 2026-11-18, at approval (「受け入れます。承認です」). The three open points were accepted as the spec states them:
- A YouTube `.loft` whose video can no longer be downloaded keeps its text, and its boxes are lost for good.
- During the operator reindex of the 47 YouTube `.loft`s, a partial or `Unreadable` first read replaces the earlier text, as reindexing already does; the operator checks each settled file.
- A native re-read that is incomplete closes the video at rule 3 with its earlier text and no lines; such videos are found by the query in item 2.7 and read again by Regenerate.
- 2026-11-18, by the human (「フレーム失敗のまま（推奨）」), after the acceptance-test writer asked: a box whose quad holds NaN or inf stays a failed frame, as the reader treats it today (no text stored for that frame, SPEC-ADDON-133 I5). "Unusable" in item 2.2 and I4 covers quads that reach the store step, such as three or five points.
- Settled by the author from the spec: `chunk_text` in item 1.4 and I1 is called with its defaults, which is how the frame reader calls it; the `lines_json` serialisation options are not part of the contract, I5 is.
