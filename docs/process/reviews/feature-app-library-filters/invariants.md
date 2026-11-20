spec: docs/specs/app-library-filters.md

## Revisions

I1. (before r1) For any parameters, every `tag-counts` entry's `count` equals the `count` of the shelves route's `by=all&key=all` answer for the same conditions plus `tag=<name>`, every tag group with such a count above 0 is listed once, no group with 0 is listed, and the list is ordered by count descending, then by name compared case-insensitively (`str.casefold`), then by name in code-point order; when this drive holds several spellings of one group, `name` is the first of them in that same order; `tag-counts/query` with ids X answers the same as `tag-counts` with a collection holding exactly X. A viewer filter other than `watch` (such as `opened`) is ignored, as the other listing routes ignore parameters they do not take.
