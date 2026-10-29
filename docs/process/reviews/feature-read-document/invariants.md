spec: docs/specs/read-document-text.md

## Revisions

- 2026-10-30, decided by the human: a pptx slide's text is the text indexing builds for it,
  title frame included (indexing keeps the title in the body), less the `## Slide N` heading
  line. Item 1.3's "other than the title" is superseded; I3 stands as written.

- 2026-10-30, decided by the human after R-5 showed concurrent PyMuPDF use corrupting both
  reads and indexing: every PyMuPDF use in the addon process (indexing and reads) holds one
  shared lock, so no two PDF conversions overlap. A PDF read takes it for its whole range
  within the same 10 s it waits for a slot; if it cannot (for example while indexing
  converts a long PDF), the read gets 429 `Document reader busy`. Office and EPUB reads do
  not take it.
