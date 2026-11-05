spec: docs/specs/image-query-search.md

## Revisions

## Clarifications

Settled with the human on 2026-11-05, at approval. The spec's 20 recommendations under "Pending human confirmation" are confirmed as written: 「OK」 (answering "推奨どおりでよければ「承認」").

Spec readings settled by the main session on 2026-11-05 from the spec's own text, when the acceptance-test writer asked (no rule changes):

- Scenes: `floor` drops seeds before the relative threshold is computed; the threshold index is taken over the remaining seeds (capped by their count), `required_seeds(frames)` still from the drive's frame count.
- While image-search availability is pending, the image query view's gone state shows 「このドライブでは画像で探せません」 without the button (pending counts as unavailable, step 0).
- A drop of several files in the modal shows 「画像は1枚だけ選んでください」 and starts nothing (step 1, §8, confirmed item 17); §2's "nothing happens" means no query starts.
