# EPUB intelligence indexing invariants (R-0, approved by the user 2026-09-26)

## Touch points

- Intelligence DB tables written: `document_sections` (new), `embeddings`, `vec_text`, `fts_text_content`, `indexed_files.text_indexed`.
- Extractor registry (`app/workers/metadata.py` `_extractors`) and `TEXT_MIMES` (`app/indexer.py`).
- Shared HTML conversion (`app/extractors/html.py`), also used by `HtmlExtractor`.
- Intelligence endpoints whose response shape changes: search (`SearchResultSegmentMatch`), chunk excerpt (`ChunkExcerptResponse`), Ask SSE citations (`CitationModel`).
- Ask context assembly (`app/rag/context.py`) and citation location handling (`app/rag/service.py`), for every mime type.
- Model-facing prompt `app/prompts/rag/answer_system.jinja2`; evals location matching.
- Addon frontend: Ask page citation links and labels, Ask note formatting, detailed-summary citation panel.
- `design-decisions.md` sections passed through: Drives (drive boundary on search/citations), Addons: implementation discipline (no core→addon code), Internal API (none added).
- Core (PR-B, reviewed separately): `?section=` through the `/files/{id}` redirect, EPUB reader `open` / `restore()`, search pills.

## Invariants

1. A corrupt, truncated, encrypted or hostile EPUB never raises out of the extractor and never fails the indexing of any other file; a member over its cap or failing to parse loses only that member.
2. No read of an EPUB member exceeds its decompressed-byte cap, and no entity declared inside the book is expanded.
3. Ruby readings never appear in a stored chunk; the base text does.
4. A chunk's section number, its `document_sections` row, the wire `section`, the Ask `section N` token and `?section=N` all name the section that foliate opens at `index = N - 1`.
5. No search pill, Ask citation or summary citation for an EPUB shows a bare spine number when the section has a title, and none shows `p.N` / `Page N`.
6. Every EPUB link (search pill, Ask citation, summary citation) opens the book at the chapter it names, through the `/files/{id}` redirect.
7. Opening a book through `?section=N` does not change its stored reading progress until the reader turns a page.
8. PDF, Office, HTML and text indexing and their `?page=` behaviour are unchanged, except that PDF keyword context now uses the right chunk.
9. Deleting or reindexing an EPUB leaves no `document_sections` row from its previous extraction.

Invariants 6 and 7 are held by PR-B (core); PR-A holds the rest.

## Revision after round 3 (approved by the user 2026-09-27)

1. (revised) A corrupt, truncated, encrypted or hostile EPUB never raises out of the extractor and never fails the indexing of any other file. A member that was read but refused (entity declaration, over its cap, unparsable, unsupported encoding) loses only that member; a book whose zip read itself fails (bad CRC, corrupt stream, zip-level encrypted member) is not indexed at all. (Round-3 trajectory: two rounds added a prediction to the byte budget's charge for failed reads; the user chose to remove the case instead of estimating it. Loop closed after this fix by the user.)
