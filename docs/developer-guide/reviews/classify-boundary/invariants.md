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
2. **No row's mime changes, except where the bucket is media.** `.webp` and
   `.m2ts` gain one; every other row keeps what it had, including the rows that
   had none. `PUT /api/files/{id}/content`,
   `GET /api/internal/files/{id}/content` and the intelligence indexer are keyed
   on the mime, so what each accepts is byte-identical before and after.
   **Revised after round 1 (finding A-1).** It was written as "a source file
   keeps a `text/*` mime", which held for the fourteen rows that moved and not
   for the forty-three that arrived: those went from `application/octet-stream`
   to `text/plain`, which turned `.tfvars`, `.conf`, `.ini`, `.toml` and
   `.yaml` from refused into served — on an endpoint that skips the
   drive-unlock check by design, with the secret an optional gate. Widening
   that allowlist is a security decision, and naming a bucket is not the place
   to take it.
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

10. A card shows no excerpt for a file that is not a Document, so the source
    files that moved lose theirs. The file page is unchanged. Recorded rather
    than fixed: the gate is a bucket test where a name test would serve, in
    three frontend components.

TOTAL: 10 invariants
