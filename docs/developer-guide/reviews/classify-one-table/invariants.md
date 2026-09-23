# Invariants — one classification table (phase 1)

Declared before the first review round (R-0). Phase 1 changes where the answer
comes from, not what the answer is.

1. `classify` gives the same `(file_type, mime_type)` for every filename that
   the shipped container gives today. The parent's answers for all 160
   extensions its `mimetypes` knows are reproduced exactly.
2. `classify` gives the same answer whatever `mimetypes.guess_type` would
   return. Nothing in the result depends on a table the host may or may not
   carry.
3. `classify` stays a pure function of the filename — no I/O, and no import of
   `mimetypes` remains on its path.
4. A subtitle extension is still decided before anything else, and a `.loft` is
   still reported as `video`.
5. An extension the table does not name is `("other", "application/octet-stream")`,
   which is what the container already answers for one.
6. The extension is matched without regard to case.
7. No bucket moves in this phase. Source code is still `document` where it was
   `document`; that is phase 2's change and a reviewer should see none of it
   here.

TOTAL: 7 invariants
