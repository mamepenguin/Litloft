spec: docs/specs/nfc-tolerant-name-matching.md

## Revisions

I13. (addon-media-import-r1 F7; user decision 2026-10-06: "切り詰めたときだけ落とす") `_sanitize_filename` in `service.py` and in `subscription/manager.py` return the same NFC string for the same title, at most 200 code points long; when the title is longer than 200 code points the result does not end in a character with a non-zero `unicodedata.combining()` value, and a title of 200 code points or fewer keeps its trailing combining marks.
