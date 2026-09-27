# Review record: search operators, stage 1

Invariants: [invariants.md](invariants.md).

## PR 1 r1 (`0bebbdfb8`) — [pr1-r1.md](pr1-r1.md)

No invariant broken; bucket A empty. Found by the author afterwards: the frontend detector
`file-kind-parity.test.ts` reads the classifier's body by function name and failed once it moved
to `_kind_predicate`.

| Finding | Bucket | Action |
|---|---|---|
| (author) kind-parity detector read the old function | fixed | detector reads `_kind_predicate` (test-only) |
| F3 no total asserted under repeated `type` | B (test) | assertion added to the existing table (test-only) |
| F1 1000+ repeated `tag`/`type` values → SQLite "expression tree too large" 500; the UI collapses duplicates and cannot reach it | B | recorded |
| F2 the shared predicate also serves `/tags`, `/folder-counts`, `/watch-history`, both tree paths — unchanged, killed by mutations | info | recorded |
| F4 tag case folding | pre-existing | recorded |

The fix commit changed only tests, so it gets no review round of its own (R-4).
