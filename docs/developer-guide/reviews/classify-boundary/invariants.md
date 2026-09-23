# Invariants — moving the boundary (phase 2)

Declared before the first review round (R-0). Phase 1 changed where the answer
comes from; phase 2 changes what the answer is, for the rows named here and no
others.

1. A source file is `other`: `.bat .c .h .ksh .pl .py .css .js .mjs` leave
   `document`, and the source extensions the table never held arrive as
   `other` rather than as nothing.
2. A source file keeps a `text/*` mime. `PUT /api/files/{id}/content`,
   `GET /api/internal/files/{id}/content` and the intelligence indexer read the
   mime, not the bucket, so what each of them accepts does not change.
3. Machine-read markup and data are `other`: `.xml .sgm .sgml .n3 .vcf`.
4. `.csv` and `.tsv` stay in `document`.
5. Prose in minimal markup is the nested `text` kind: `.md .markdown .txt`
   keep it and `.rst .adoc .org` gain it. A `.rst` is no longer `document`
   alone.
6. `.webp` is `image`, `.mts` and `.m2ts` are `video`, each with a player, a
   thumbnail and a duration where its bucket provides one.
7. Every row not named above answers exactly as it did at the end of phase 1.
8. The nested kind still does not require `file_type == "document"`: a row
   named `.md` whose stored `file_type` is `other` is still `text`.
9. A drive listing, the folder card's counts, `folder-tree` and watch history
   all report the same kind for the same file. No surface keeps the old one.

TOTAL: 9 invariants
