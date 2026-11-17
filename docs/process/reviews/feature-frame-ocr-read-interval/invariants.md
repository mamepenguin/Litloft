spec: docs/specs/frame-ocr-read-interval.md

## Revisions

## Clarifications

Settled with the human on 2026-11-17, at approval (「ok」): the six open points were approved as the spec states them — automatic re-read of every native video under on_index; an incomplete re-read keeps the earlier read and is not retried automatically; changed scene selection accepted with stored Visual Index runs left until regenerated; the square-window test at 2.0 with sub-character changes accepted; a reindex raises a queued re-read to 100; re-reads do not hold back `.loft` backlog downloads.
- 2026-11-17, by the human (「yes」), after the acceptance-test writer asked which engine seam to fake: `app/workers/ocr.py` gains two functions, `detect_boxes(engine, image)` returning the detected boxes in detection order, and `recognise_boxes(engine, image, boxes)` returning one result per box (its line, or none when the engine drops it). Both run under `run_engine`'s lock; the frame reader calls the engine only through them, and they are the only code that reaches into RapidOCR's separate steps. Tests fake these two functions. I2 (equality with one `engine(image)` call) is not checked in CI, where RapidOCR is not installed; the item 10 harness checks it against the real engine on the production Mac mini. Also confirmed: the read / rebuild / re-read / close decision is made inside `index_frame_ocr`; every call to the engine counts as a frame's engine call; a frame whose engine call raised is still the last read frame for the 3-second gap.
