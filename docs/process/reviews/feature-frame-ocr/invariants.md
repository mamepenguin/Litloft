spec: docs/specs/frame-ocr.md

## Revisions

## Clarifications

Settled with the human on 2026-11-06, at approval:

- The spec's 8 owner decisions are as written in "Owner decisions (2026-11-06)" (「8 つとも推奨どおり」), with the settings labels 「動画内の文字」「スキャンしたページの文字」 and no Design Artifact.
- Earlier decisions behind the spec: no LLM/VLM for frame selection; every video within about 5 minutes of processing per video hour, with a minimum gap of about 10 s between read frames (writing-in-progress text may be missed); no measurement on the production Mac mini (the trial on this Mac stands).
- Implementation starts by measuring one 1080p and one 4K HEVC video; if either exceeds 5 minutes per video hour, stop and ask.
