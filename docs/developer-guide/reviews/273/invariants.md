# PR #273 invariants (R-0)

Approved by the supervisor before round 1, with 10 added at approval.

1. `text` selects exactly the active files whose mime is `text/markdown` or whose
   filename ends in `.md`, `.markdown` or `.txt` (case-insensitive), on the
   listing `?type=`, the tree `?type_filter=`, and watch-history `?type=`. A `.c`,
   `.h` or `.pl` (`text/plain` in the runtime image) is not selected, nor is
   `.rst`, `.csv`, `.mdown`, `.mkd` or `.text`.
2. A folder card's `kind_counts` / `dominant_kind` count a file as `text` exactly
   when `?type=text` would select it, and the counts still sum to `file_count`.
   `document` still returns every `text` row.
3. `markdown` sent to the listing, the tree or watch-history returns the same rows
   as `text` — neither a 422 nor an unfiltered result — and no response carries
   the value `markdown`.
4. A search page URL with `?type=markdown`, a stored tree filter of `markdown`,
   and a saved smart folder whose `file_type` was `markdown` each show the `text`
   filter selected and the `text` result, not All. After startup the smart folder
   row holds `text`.
5. A list snapshot carrying `markdown` is discarded, not restored.
6. Watch-history `?type=text&filter=all` returns a text file's view-only record
   (position 0, duration 0), and the type filter is applied before `limit`.
7. The filter chip and the tree filter offer Text (ja テキスト) in place of
   Markdown, and no other chip is added or removed.
8. The MCP `search_files` tool accepts `type: "text"`, and its schema no longer
   lists `markdown`.
9. core's kind tables and intelligence's `file_kind.py` agree (parity test), once
   the intelligence bump is in.
10. Where a folder's default view mode is derived from its kind
    (`viewModeForKind`, `useCollectionViewMode`, and anything reading
    `dominant_kind` for it), a folder whose files are mostly `.md` gets the same
    default view mode as before.

## Revised by the supervisor after r1 (`273-r1.md` F8)

- **4, removed:** the clause about a saved smart folder whose `file_type` was
  `markdown`, and its migration. Smart folders only accept video, image, audio
  and document, so the app never writes a `markdown` row. 4 now reads: a search
  page URL with `?type=markdown` and a stored tree filter of `markdown` each show
  the `text` filter selected and the `text` result, not All.
