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

## PR 2 r1 (`716b40da9`) — [pr2-r1.md](pr2-r1.md)

Invariant 1 held (old/new probe: params, cache keys, semantic calls, rows identical).

| Finding | Bucket | Action |
|---|---|---|
| F2 `pnpm lint` error on the search page (JSX condition broke the memoised toggle handler) | A (CI) | condition computed before JSX (`b7b79653e`) |
| F1 scoped query turning impossible left the spinner on | A | `setLoading(false)` on that return, with a row in the scope tests (`b7b79653e`) |
| F3 unused `type` parameter | B | removed (`b7b79653e`) |
| survivors on correct code (`is:liked` forwarding, `append` wire shape, search-modes slot hidden) | B | recorded, no tests |

## PR 2 r2 (fix `b7b79653e`) — [pr2-r2.md](pr2-r2.md)

No findings. `pnpm lint` exits 0; the spinner stops when a scoped query turns impossible, and the new
row fails without the fix. Trajectory: the fix adds no branch, state or prediction.
