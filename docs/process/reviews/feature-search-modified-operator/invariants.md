spec: docs/specs/search-modified-operator.md

## Revisions

I21. (acceptance, 2026-11-19) An absolute bound resolves by the parsing 2 rule in the evaluation zone and is clamped only when the result falls outside 0..253402300799: in Asia/Tokyo `modified:<=9999` sends `lt:253402268400`, in UTC it sends `lt:253402300799`, and `modified:>=1970` in Asia/Tokyo sends `gte:0`.
