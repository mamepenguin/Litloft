spec: docs/specs/image-query-search.md

## Revisions

## Clarifications

Settled with the human on 2026-11-05, at approval. The spec's 20 recommendations under "Pending human confirmation" are confirmed as written: 「OK」 (answering "推奨どおりでよければ「承認」").

Spec readings settled by the main session on 2026-11-05 from the spec's own text, when the acceptance-test writer asked (no rule changes):

- Scenes: `floor` drops seeds before the relative threshold is computed; the threshold index is taken over the remaining seeds (capped by their count), `required_seeds(frames)` still from the drive's frame count.
- While image-search availability is pending, the image query view's gone state shows 「このドライブでは画像で探せません」 without the button (pending counts as unavailable, step 0).
- A drop of several files in the modal shows 「画像は1枚だけ選んでください」 and starts nothing (step 1, §8, confirmed item 17); §2's "nothing happens" means no query starts.
- Text-query results page drop (I8, steps 0/2): on `origin/develop` (`11a00735d`) `FolderBrowser` returns the search page without an `UploadZone` (`if (isSearch) return inner;`), so "uploads exactly as before this change" means a drop classed *upload* there does nothing. Only a one-image drop starts an image query. The prose "every drop on the results page goes to the upload zone as today" (step 0) describes a zone that did not exist; the code keeps today's behaviour.
