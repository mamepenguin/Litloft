# intelligence #69 — invariants (R-0)

Approved by the supervisor (video-share-38) on 2026-09-14.

1. `KIND_MIMES["text"] = ("text/markdown",)` and `KIND_SUFFIXES["text"] = (".md", ".markdown", ".txt")`. No `markdown` key remains in either table, and `pdf` is unchanged.
2. `type=text` matches only rows whose mime is `text/markdown` or whose filename, compared case-insensitively, ends with one of those extensions. A row that only has mime `text/plain`, such as `.c` / `.h` / `.pl` / `.log`, does not match.
3. `type=markdown` (old URLs) returns the same result as `text`: never 422 and never everything. The alias lives in one place inside `apply_kind_filter` and is not in the tables, so the tables the parity test reads stay equal to core's.
4. Other kinds are unchanged: video / image / audio / document / pdf, and an unknown value still matches 0 rows.
5. Ask Find's `text → document` mapping (`_FIND_HINT_TO_KIND` in `rag/service.py`) is unchanged.
