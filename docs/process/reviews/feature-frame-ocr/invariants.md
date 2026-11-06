spec: docs/specs/frame-ocr.md

## Revisions

- 2026-11-06, by the human (「高解像度は読み方を変える」), after the required measurement found 4K HEVC at 5.7–23.8 min per video hour (1080p: 4.95): for a video taller than 1080 lines, frame selection decodes only key frames (no full decode of every frame), and a selected frame is OCRed scaled down to 1080 lines. Videos up to 1080p keep the spec's method unchanged. Before implementing, this method is measured on the same 4K HEVC excerpt; if it still exceeds 5 minutes per video hour, stop and ask.

## Clarifications

Settled with the human on 2026-11-06, at approval:

- The spec's 8 owner decisions are as written in "Owner decisions (2026-11-06)" (「8 つとも推奨どおり」), with the settings labels 「動画内の文字」「スキャンしたページの文字」 and no Design Artifact.
- Earlier decisions behind the spec: no LLM/VLM for frame selection; every video within about 5 minutes of processing per video hour, with a minimum gap of about 10 s between read frames (writing-in-progress text may be missed); no measurement on the production Mac mini (the trial on this Mac stands).
- Implementation starts by measuring one 1080p and one 4K HEVC video; if either exceeds 5 minutes per video hour, stop and ask.
- 2026-11-06, after review r1 (「それでよい」): "taller than 1080 lines", "up to 1080p" and "scaled down to 1080 lines" in the Revision are measured on the short side of the upright (display-rotated) picture. A 2160x3840 portrait video takes the key-frame path and is OCRed at 1080x1920; a 1080x1920 portrait video keeps the spec's method at source resolution.
