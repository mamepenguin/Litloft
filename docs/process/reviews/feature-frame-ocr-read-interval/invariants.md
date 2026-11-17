spec: docs/specs/frame-ocr-read-interval.md

## Revisions

## Clarifications

Settled with the human on 2026-11-17, at approval (「ok」): the six open points were approved as the spec states them — automatic re-read of every native video under on_index; an incomplete re-read keeps the earlier read and is not retried automatically; changed scene selection accepted with stored Visual Index runs left until regenerated; the square-window test at 2.0 with sub-character changes accepted; a reindex raises a queued re-read to 100; re-reads do not hold back `.loft` backlog downloads.
