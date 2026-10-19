# Markdown tag writes go to the frontmatter

Each round is a fresh reviewer on one commit. `invariants.md` is the list the
rounds were briefed with; it was not revised. `spec-review.md` is the review of
the design before implementation.

- **r1** on `d7c4662a2`: clearing the only frontmatter key wrote the bare body,
  so a body opening with a `---` rule was read back as frontmatter (F1, A); the
  pre-read size check and the symlink guard were untested (F3, F5); a single
  `PUT /tags` answers a disk-write error with a bare 500 (F2, B); orphan-tag
  cleanup is untested (F4, B).
- **`8a5f71776`** keeps an empty block instead, and adds the size and symlink rows.
- **r2** on `8a5f71776`: the BOM strip in the new branch was untested (F1, A);
  set-then-clear on a note without a block leaves an empty block (F2, B). One
  branch added, none removed.
- **`b5205e8c2`** adds the BOM row; tests only, so no further round.
