spec: docs/specs/search-modified-operator.md

## Revisions

I21. (acceptance, 2026-11-19) An absolute bound resolves by the parsing 2 rule in the evaluation zone and is clamped only when the result falls outside 0..253402300799: in Asia/Tokyo `modified:<=9999` sends `lt:253402268400`, in UTC it sends `lt:253402300799`, and `modified:>=1970` in Asia/Tokyo sends `gte:0`.
I18. (implementation, 2026-11-19) Within one search run, every listing request, the meaning `filter`, the continuation and "Show more by similarity" carry identical `modified` wire forms. A Smart Collection named by `in:` keeps the `now` of the run that resolved its names and is not evaluated again until the `in:` names change (SPEC-CORE-116 I4 stands).
