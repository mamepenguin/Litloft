# Invariants — moving the boundary (phase 2a)

Declared before the first review round (R-0). Phase 1 changed where the answer
comes from; this phase changes what the answer is, for the rows named here and
no others.

**Split from the phase as planned.** Widening the nested `text` kind to
`.rst` / `.adoc` / `.org` needs `_KIND_SUFFIXES`, which
`frontend/src/__tests__/file-kind-parity.test.ts` compares against the
intelligence addon's copy — by design, so that a core change without a pointer
bump fails. That half is 2b, and it moves both repositories at once. Nothing
here touches `_KIND_MIMES` or `_KIND_SUFFIXES`.

1. A source file is `other`: `.bat .c .h .ksh .pl .py .css .js .mjs` leave
   `document`, and the source extensions the table never held arrive as
   `other` rather than as nothing.
2. A source file keeps a `text/*` mime. `PUT /api/files/{id}/content`,
   `GET /api/internal/files/{id}/content` and the intelligence indexer read the
   mime, not the bucket, so what each of them accepts does not change.
3. Machine-read markup and data are `other`: `.xml .sgm .sgml .n3 .vcf`.
4. `.csv` and `.tsv` stay in `document`. `.rst` and `.org` are `document`
   here; they become the nested `text` kind in 2b.
5. `.webp` is `image` and `.m2ts` is `video`, each with a player, a thumbnail
   and a duration where its bucket provides one.
6. `.mts` is `other`. It names an AVCHD stream and a TypeScript ESM module;
   settled as the module, with `.ts` and `.cts`, so that the family answers one
   way. The AVCHD half of the `known-issues.md` row stays open and says so.
7. No extension is written twice. A dict literal keeps the last of a repeated
   key and says nothing; two went in while this table was being moved, one of
   them a family whose two meanings disagree.
8. Every row not named above answers exactly as it did at the end of phase 1.
9. A drive listing, the folder card's counts, `folder-tree` and watch history
   all report the same kind for the same file. No surface keeps the old one.

TOTAL: 9 invariants
