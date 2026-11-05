spec: docs/specs/share-target.md

## Revisions

## Clarifications

Settled with the human on 2026-11-05, at approval. The spec's 15 recommendations under "Pending human confirmation" are confirmed as written: 「承認。」 (answering "推奨どおりでよければ「承認」").

The design artifact (https://claude.ai/artifact/EK4185Udj28YvHCeYUJrHT) predates the last revision: where it shows file → URL → text classification or lacks the waiting, preparing and checking rows, the spec wins.

## Spec readings

Settled by the human on 2026-11-05 from the spec's own text, when the acceptance-test writer asked (no rule changes):

- Upload file names: in `shared-<YYYYMMDD-HHmmss>-<n>.<ext>`, `n` is 1-based (the first item is `-1`).
- Polling window for an unanswered file-creating request: 2 min plus 1 s per started 50 MiB block (rounded up; 75 MiB → 122 s).
- After a drive answers 404 / 403 and another drive is picked, the item that got the 404 is among "the items not yet saved" and is sent again to the new drive.
