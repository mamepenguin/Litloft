# Text at the top and bottom edges of PDF pages becomes searchable

SPEC-ID: SPEC-ADDON-060

Approval:

## Summary

The intelligence addon converts each PDF page with `pymupdf4llm.to_markdown(...,
page_chunks=True)` and the library's default `margins=(0, 50, 0, 50)`, which leaves out
every text line overlapping the top or bottom 50 points of the page. Indexing
(`app/extractors/pdf.py`) and `read_document` / the single-file question surface
(`app/document_text.py`, `_pdf_page`) both make that call. Whatever sits in those bands
never reaches the page's text, so search, exact search, Ask, excerpts and `read_document`
cannot see it.

This change keeps the library call as it is and adds back, for each page, the lines in
those two bands that are not running headers, running footers or bare page numbers. The
geometry comes from PyMuPDF's own text layer. Both callers use the same function, so
indexing and `read_document` give a page the same recovered lines. PDFs already in the
index are re-extracted once, in the background.

Measured on 2026-11-04 in a throwaway environment with the pinned `PyMuPDF==1.25.5` and
`pymupdf4llm==0.0.17`, on the B5 trial's PDFs (commit `3f7b05b07`,
`scripts/trials/figure_reading/`) and the trial's working set (37 PDFs, about 580 pages):

- The problem is smaller than the B5 report suggested. The report's "footnotes 0%" for
  today's extraction counts footnotes *labelled* as footnotes. Its own
  `footnote_anywhere` count, confirmed here, shows 25 of the 27 ground-truth footnotes
  are already in today's text: on A4 and Letter pages they sit above the 50-point band.
  The two that are lost are the source lines of 540-point-high slide pages.
- Today's text also loses text that is not a footnote: section and chapter titles set at
  the top edge (white-paper chapters such as 「第1 節 令和6 年能登半島地震の概要」), the
  last body line and date of a foreword, a journal's citation line and licence notice on
  page 1, and slide footers. The 320-page white paper loses 13 such lines.
- The same bands hold 844 running-header and running-footer lines and 303 page numbers
  in that one white paper. Turning the margins off would put all of them into the page
  text.
- Reading the band lines of every page takes 1 to 11 ms a page (3.5 s for the 320-page
  white paper).

The user decided on 2026-11-04, after the B5 trial (hako `HYtc2eaEwLn-qqtuXnGwV`), to stop
B5 and fix this cut instead.

## Required items

### 1. Normal flow

1. **Conversion.** `_extract_with_pymupdf4llm` and `document_text._pdf_page` pass
   `margins=PAGE_MARGINS` explicitly, where `PAGE_MARGINS = (0, 50, 0, 50)` is a new
   constant in `app/extractors/pdf.py`. The library's output does not change; the constant
   only fixes the band to the one the recovery reads, whatever a later library default
   becomes.
2. **Band lines.** A new function in `app/extractors/pdf.py` takes an open `fitz`
   document and returns, for each page up to `MAX_PAGES`, the page's *edge lines*. It
   reads `page.get_text("dict")`, keeps only text blocks, and takes each line whose box
   overlaps `y < 50` (top band) or `y > page.rect.height - 50` (bottom band). A line's
   text is its spans joined, with surrounding whitespace stripped. Empty lines are
   dropped.
3. **Filtering.** The filter runs over the whole document's edge lines, in page order:
   - A line with no character of a Unicode letter category (`L*`) is dropped. This removes
     page numbers such as `12`, `― 219 ―` or `3/40`.
   - A line's *key* is its NFKC form with all whitespace removed and each run of Unicode
     decimal digits replaced by one placeholder. A key found on 3 or more distinct pages
     is a *repeated* line. Only its first occurrence, on the lowest page, is kept; every
     later occurrence is dropped. This keeps a running header or a repeated source line
     once and drops the copies on other pages.
   - A line whose normalised text (NFKC, whitespace and the Markdown characters `` *_`#|>- ``
     removed) is already contained in that page's normalised Markdown is dropped, so a
     line the library kept is not repeated.
4. **Placement.** For each page, the kept top-band lines go before the page's Markdown and
   the kept bottom-band lines after it, each group in the order of the line boxes (top to
   bottom, then left to right). Lines are joined by newlines, and a group is separated from
   the Markdown by a blank line. A page with no kept line has exactly today's text.
5. **Indexing.** `_build_chunks_from_pages` and `_join_page_markdown` work on that page
   text. The recovered lines therefore land in the same page's chunks, with that page's
   `page` and `metadata`, at today's chunk size and overlap (`indexing.text_chunking`,
   400 / 80 by default). They also land in `pdf_markdown`, which detailed summaries read.
   Edge-line extraction runs inside `extract()`'s existing `PYMUPDF_LOCK` hold, on the
   document the fallback would also open.
6. **read_document and the single-file question surface.** `_pdf_range` computes the edge
   lines once for the whole document (under the `PYMUPDF_LOCK` it already holds), then
   gives each requested page its own kept lines, placed as in step 4. A requested page of
   a document gets the same kept lines from indexing and from `read_document`. The
   single-file question surface reads indexed chunks, so it gets them through step 5.
7. **Existing PDFs.** A new `index_meta` key `pdf_text_rules` holds a version string.
   At startup, in the lifespan, next to `check_idf_term_rules`, a check compares it with a
   constant `PDF_TEXT_RULES_VERSION` in `app/extractors/pdf.py`. When they differ, one
   transaction sets `text_indexed = 0` for every active row with mime type
   `application/pdf` and records the new version. The next `_resume_incomplete` queues a
   `TEXT_CONTENT` task for each of those files. When `INTELLIGENCE_SEARCH_DB_PATH` is set
   (the eval snapshot, which runs no indexer), nothing is reset and only the version is
   recorded, as `_migrate_embeddings_chunk_index` does.
8. **Backlog priority.** `_resume_incomplete` queues `TEXT_CONTENT` at priority -10, so
   a new upload's text task (queued at 0 by `_queue_file_tasks`) runs before the backlog,
   as the OCR backlog does. This applies to every resumed text task; a resumed task is
   backlog by definition.
9. **Unchanged chunks.** In `index_text_content`, when a file's new chunks equal its
   stored `fts_text_content` rows (same count and, in `chunk_index` order, the same
   `page` and `text`), the embeddings and FTS rows are left as they are and only
   `pdf_markdown`, `document_sections` and `text_indexed` are written. A PDF with nothing
   in its bands, which is most of the arXiv papers measured, then costs one extraction and
   no embedding.
10. **Citations.** When `index_text_content` rewrites a file's chunks and the file has
    `detailed_summary_citations` rows and an active `detailed_summary` insight, it
    recomputes them with `citations.calculate_and_store(file_id, <active content>)` after
    the write commits. Stored citations name chunks as `document:<chunk_index>`, and
    added lines move the chunk indices of every later page. Recomputing uses the embedder
    only, with no LLM.

### 2. Failure cases

- `get_text("dict")` raises on a page: that page has no edge lines, a WARNING names the
  file and the page number, and the other pages go on. The page keeps today's text.
- The edge-line pass raises as a whole (the document cannot be walked): no lines are
  recovered for the file, a WARNING names the file, and the library's Markdown is used as
  today. Extraction never falls to the fitz fallback because of the recovery.
- pymupdf4llm fails and the fitz fallback runs: unchanged. `get_text("text")` already reads
  the whole page, bands included, and adds no lines.
- A file is trashed, missing or purged while it is re-extracted: `index_text_content`
  finds no active row and writes nothing, as today.
- The embedding fails during the backlog: nothing is written, the earlier rows stay
  searchable, `text_indexed` stays false, and a later `_resume_incomplete` queues it again.
- The citation recompute fails: the earlier citation rows stay, a WARNING names the file,
  and the chunk write is not undone.
- The version check fails at startup: logged with its traceback, startup continues, and
  the next start checks again. The reset and the recorded version commit together.
- A `read_document` call on a large PDF spends up to about 5.5 s (500 pages at the measured
  worst of 11 ms a page) on the edge-line pass. This is inside the route's 25 s budget.
  The existing 10 s lock wait and its 429 are unchanged.

### 3. States

Per PDF: `text_indexed` true → false once, when the startup check sees a new
`PDF_TEXT_RULES_VERSION`, and false → true when its `TEXT_CONTENT` task completes, as
today. The index meta `pdf_text_rules` goes from absent or old to the current version,
once per version. No state for any other mime type changes.

### 4. Data read and written

- Read: the PDF through the read-only drive mount; `index_meta`; `fts_text_content` (for
  the unchanged-chunk comparison); `file_insights` and `detailed_summary_citations` (for
  the recompute).
- Written (intelligence `search.db`): `index_meta['pdf_text_rules']`;
  `indexed_files.text_indexed` for PDFs; `text_content` rows in `embeddings` and
  `vec_text`, `fts_text_content`, `fts_text_content_word`, `pdf_markdown`,
  `document_sections` through the existing `index_text_content` path; and
  `detailed_summary_citations` through `calculate_and_store`.
- Not written: the core DB, OCR rows (OCR applies to pictures only, `OCR_IMAGE_TYPES`, so a
  PDF has none), transcripts, summaries and any LLM output.

### 5. External services

None. Extraction and embedding run in the container. Recovered text then follows the
drive's `llm_cloud` policy like the rest of a document's text when Ask, the single-file
question surface or a detailed summary sends it to an LLM.

### 6. Authorization

Unchanged. Only drives whose `index` policy is on are indexed, and every search and read
path keeps its access checks.

### 7. Effect on existing features

- Semantic search, exact search, Ask, the single-file question surface, search excerpts
  and `read_document` see the recovered lines as part of their page. A hit reports that
  page's number.
- Detailed summaries generated after the re-extraction read `pdf_markdown` with the lines
  in it. Existing summaries are not regenerated; their citations are recomputed (step 10).
- Similar files, pickup, and the rarity and IDF statistics over `fts_text_content_word`
  include the recovered lines. The first occurrence of a running header on page 1 is
  included once per document.
- Short summaries, auto tags and retrieval keywords are not regenerated.
- During the backlog, each PDF keeps its old rows until its own task replaces them, so
  search keeps working. The admin status counts PDFs as pending text until they are done,
  and **Index details** shows their text task as pending.
- The OCR backlog and the text backlog both run at -10 and share the CPU with other
  indexing.

### 8. Error behavior

As in 2. Viewers see nothing. Operators see the WARNING lines and one INFO line at startup
when the version changes ("PDF text rules are now <v>; N PDFs will be re-extracted").

### 9. User-visible behavior

Search, exact search and Ask find words printed in the top and bottom 50 points of a PDF
page, such as a slide's source line, a footnote set close to the bottom edge, or a section
title at the top edge. A hit shows that page. A recovered line appears in an excerpt like
other text, as plain text without Markdown formatting, before or after the page's body.
Running headers, running footers and page numbers do not appear, except the first
occurrence of a repeated line. Roman-numeral page numbers (`ii`, `iii`) contain letters and
are kept. `read_document` shows the same lines on the same page. After the upgrade, PDFs
are re-extracted in the background. `docs/addons/intelligence.md` says what PDF extraction
keeps from the page edges and that the first start after the upgrade re-extracts every PDF.

### 10. Non-functional

- Extraction time per PDF page grows by 1 to 11 ms (measured), against about 200 ms for
  the conversion itself.
- The backlog costs one extraction per PDF plus an embedding of every chunk of each PDF
  whose chunks changed. The production count is not known to the author. It can be
  measured before approval, from the host:
  `sqlite3 ~/Services/Litloft/data/addons/intelligence/search.db "SELECT COUNT(*) FROM
  indexed_files WHERE active = 1 AND mime_type = 'application/pdf'; SELECT COUNT(*),
  SUM(page_count) FROM pdf_markdown; SELECT COUNT(*) FROM embeddings e JOIN indexed_files f
  USING (file_id) WHERE e.embedding_type = 'text_content' AND f.mime_type =
  'application/pdf';"` (PDF count, pages for PDFs on the primary path, and chunks to
  re-embed at most).
- Memory: one document's edge lines at a time, a few kilobytes a page.
- No language-specific rule. The filters use Unicode categories (letters, decimal digits),
  NFKC and page geometry only, and none keys on a word such as 「注」 or "Note"
  (`.claude/rules/backend-conventions.md`).

## Touch points

- `addons/intelligence/app/extractors/pdf.py`: `PAGE_MARGINS`, `PDF_TEXT_RULES_VERSION`,
  the edge-line function and filter, page-text assembly used by `_build_chunks_from_pages`
  and `_join_page_markdown`, the explicit `margins=` on both `to_markdown` calls.
- `addons/intelligence/app/document_text.py`: `_pdf_range`, `_pdf_page`.
- `addons/intelligence/app/database.py`: the `pdf_text_rules` check (next to
  `check_idf_term_rules`, using `_read_index_meta` / `_upsert_index_meta`).
- `addons/intelligence/app/main.py`: the lifespan call.
- `addons/intelligence/app/indexer.py`: `_resume_incomplete`, which now queues
  `TEXT_CONTENT` at -10.
- `addons/intelligence/app/workers/metadata.py`: `index_text_content` (unchanged-chunk
  skip, citation recompute).
- `addons/intelligence/app/citations.py`: `calculate_and_store`, called, not changed.
- `addons/intelligence/tests/`: extractor, document-text, version-check, resume-priority,
  unchanged-chunk and citation tests, with small generated PDFs holding band text, a
  running header and footer, and page numbers.
- `docs/addons/intelligence.md` (core repository, with the gitlink bump).
- Rules passed through: `.claude/rules/backend-conventions.md` (no language-dependent
  rules), the `PYMUPDF_LOCK` rule (every PyMuPDF use in the addon takes it),
  `.claude/rules/design-decisions.md` (LLM features and `llm_cloud`). No protected path is
  edited. The core is untouched except docs and the gitlink.

## Invariants

I1. A PDF page with no line overlapping the top or bottom 50 points has exactly the text, chunks and `pdf_markdown` part it has today.
I2. A line overlapping a band that has a letter, is not a later occurrence of a key found on 3 or more pages, and is not already in the page's Markdown appears in that page's text, so in a chunk with that page's number. Top-band lines come before the Markdown and bottom-band lines after it.
I3. A band line with no letter, and every occurrence after the first of a key found on 3 or more distinct pages, appears in no chunk, `pdf_markdown` row or `read_document` text.
I4. For a PDF on the primary path, the lines `read_document` adds to page N equal the lines indexing adds to page N of the same file.
I5. An error while reading edge lines leaves the library's Markdown in place and never makes extraction fall back to fitz; the fitz fallback's output is unchanged.
I6. The first start with a new `PDF_TEXT_RULES_VERSION` sets `text_indexed` false for every active PDF and for no other file, in the same transaction that records the version. A later start with the same version changes nothing, and with `INTELLIGENCE_SEARCH_DB_PATH` set no flag is changed.
I7. A file whose new chunks equal its stored `fts_text_content` rows keeps its embedding ids and FTS rows. A file whose chunks were rewritten and that has stored citations has them recomputed against the new chunks.
I8. Every PyMuPDF call added by this change runs while `PYMUPDF_LOCK` is held.
I9. Text, Office, HTML, EPUB and picture files produce the same chunks as before, and OCR rows are never touched.

## Revises

SPEC-ADDON-036 I9. For any file other than a PDF, `extract()` returns the same chunks, Markdown, extractor, page count and section titles as before SPEC-ADDON-036, including a workbook with a chartsheet; a PDF's are those SPEC-ADDON-060 defines.

## Checked, no action

- **Margins off (`margins=0`).** It gets every footnote measured (27 of 27). It also puts
  the running headers, running footers and page numbers into every page: 1,147 lines in
  the 320-page white paper. They would show in excerpts, in every `search_exact` hit for a
  journal's name, and in the IDF statistics. Rejected.
- **Margins off plus removing repeated lines from the Markdown.** The library merges,
  formats and reorders lines, so a repeated line has to be found again inside Markdown
  it may have changed. Changing the margins also moves every page's layout analysis, so
  every PDF's chunks change. The geometry route gets the same lines, leaves pages without
  band text byte-identical, and works on the text layer directly.
- **A footnote classifier (B5's A1: small font, below the lowest body block).** It labels
  footnotes; this change needs no label, because footnotes outside the bands are already
  indexed. In the bands it would also pass the small-font running footers, which only
  the repetition test tells apart.
- **A separate chunk, or a "footnote" marker, for recovered lines.** A separate chunk
  needs a new chunk kind. A marker would be a language-dependent word, and placing the
  lines in the page's own text already gives them the page number.
- **Left and right margins.** The library default does not cut them.
- **A cache of edge lines for `read_document`.** The pass is bounded at about 5.5 s on a
  500-page PDF. A cache adds invalidation for a measured cost that is within budget.
- **Roman-numeral page numbers.** They contain letters. Dropping them would need a rule
  on Latin letters, so they stay as one short line each.
- **Two different lines that differ only in their digits** ("Source: survey 2023" on three
  pages, "Source: survey 2024" on a fourth) share a key, so only the first is kept. This
  is rare and the kept line still finds the document.
- **Documents of 1 or 2 pages.** No key reaches 3 pages, so every band line with a letter
  is kept, running headers included. Short documents carry little such text.
- **Rotated and vertical-text pages.** The bands use `page.rect` as the library does. A
  vertical column that reaches a band is kept unless the library kept it already, which
  the containment check catches.
- **`SPEC-ADDON-036` I5 (no PDF request converts more than 10 pages).** The edge-line pass
  reads the text layer and converts nothing to Markdown, so I5 still holds.
- **Regenerating summaries, tags or keywords.** The added text is small. Regenerating them
  costs LLM calls and rewrites user-visible text; they pick it up the next time they run.
- **Scanned PDFs without a text layer.** They have no lines in any band. OCR for PDFs is
  outside this change.
