spec: docs/specs/frame-ocr-line-boxes.md

## Revisions

## Clarifications

Settled with the human on 2026-11-18, at approval (「受け入れます。承認です」). The three open points were accepted as the spec states them:
- A YouTube `.loft` whose video can no longer be downloaded keeps its text, and its boxes are lost for good.
- During the operator reindex of the 47 YouTube `.loft`s, a partial or `Unreadable` first read replaces the earlier text, as reindexing already does; the operator checks each settled file.
- A native re-read that is incomplete closes the video at rule 3 with its earlier text and no lines; such videos are found by the query in item 2.7 and read again by Regenerate.
