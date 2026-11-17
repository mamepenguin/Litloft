# Recover vertical text from PDF pages for search

SPEC-ID: SPEC-ADDON-122

Approval: sha256:f7de193bc675151d40788b14f9ed89279334dfb437ccfd3aa6abc45971d1279c Yuichi Senga 2026-11-17

## Summary

The intelligence addon omits vertical text from searchable PDFs made by Yomitoku: its pinned PyMuPDF4LLM filters non-horizontal lines even when their text layer is readable. Use pdfminer.six plain text for predominantly vertical pages and add its vertical boxes to the existing Markdown on other pages, preserving the Markdown conversion on horizontal-dominant pages. The same recovery is used by indexing and on-demand document reading. Existing PDFs are re-extracted in the background; no new OCR is performed.

On 2026-11-16, pdfminer.six 20260107 with vertical detection recovered the phrase 「私は信心深い人間ではなく」 on page 14 of サッカーの神様をさがして, and phrases on 14歳の恋（１） that the current converter omitted. In five provided books (novel, two comics, and two technical books), three sampled pages per book retained every non-whitespace character of the PyMuPDF text layer when compared by character counts; that measure does not prove reading order or OCR accuracy. One technical book contains vertical labels among horizontal text, so whole-page replacement based on the mere presence of vertical text is unsuitable. Full-file pdfminer extraction in the local test took 1.5 seconds for the 258-page novel and 0.3 seconds for the 201-page comic; these are measurements, not guarantees.

## Required items

### 1. Normal flow

1. For each PDF page within the indexing cap, run the existing PyMuPDF4LLM conversion and existing edge-line recovery. For a page whose embedded layer is empty, retain the current stored-page-OCR selection; do not apply this recovery to the stored OCR text.
2. For each page, count the non-whitespace characters in PyMuPDF `get_text("dict")` lines with direction `(0, 1)` and in lines with direction `(1, 0)`, allowing a tolerance of 0.01 per component. Ignore empty spans and other directions. Parse embedded text with `pdfminer.six==20260107` and `LAParams(detect_vertical=True)`. If the vertical count is greater than the horizontal count and nonzero, use pdfminer's complete page text in returned box order in place of the page Markdown and edge recovery. This keeps single characters and horizontal fragments that pdfminer puts outside vertical boxes. Such pages can contain repeated headers, page numbers and plain text instead of Markdown structure.
   Otherwise retain the existing assembled page Markdown and edge recovery, then append pdfminer `LTTextBoxVertical` text in returned order, excluding a box if its entire normalized text is already in the assembled text including boxes accepted earlier. To normalize, apply Unicode NFKC, remove all characters for which Python `str.isspace()` is true and remove the characters `*_` followed by backtick, `#|>-`; compare by case-sensitive substring. An empty normalized box is dropped. Separate accepted boxes by blank lines. For both cases keep line breaks; phrases split across printed lines or boxes need not match as a continuous string. An empty text layer continues to use stored OCR as before, without pdfminer recovery.
3. The resulting page text is used for that page's existing chunking, `fts_text_content`, embeddings, `pdf_markdown` and summaries. Page numbering, 200 MB and 500 page indexing caps, chunk size and overlap stay unchanged. Recovered text is plain text, not synthesized Markdown tables. Non-dominant mixed pages retain the existing horizontal Markdown, followed by recovered boxes; the two portions need not follow the original interleaved reading order.
4. `document-text` applies the same box recovery for each requested page, including pages beyond 500, without storing results. Its cursor, page numbers, limits, authorization and extractor labels remain as today. Each requested page is parsed independently of the other requested pages. The indexed and on-demand recovered text for the same unchanged page must agree before chunking, except the existing per-document versus per-page heading differences on the Markdown path.
5. Bump `PDF_TEXT_RULES_VERSION`. The existing startup transaction resets `text_indexed` for all PDFs once and the indexer rebuilds them in the background. Identical chunks retain the existing embedding and FTS rows; changed chunks use existing embedding and citation update behavior. Stored OCR is not changed.

### 2. Failure cases

Missing, invalid, encrypted or oversized files keep the existing behavior. If pdfminer vertical extraction for an embedded-text page raises or fails to open, or a predominantly vertical page produces an empty or whitespace-only complete pdfminer page text, log the file id or filename and page number without text; indexing fails the text task without overwriting existing chunks, Markdown, embeddings or citations and remains eligible for retry. For `document-text`, return the existing 422 document-unreadable error rather than silently claiming an incomplete page succeeded. Empty image-only pages are not treated as vertical extraction failures. A failure while computing embeddings keeps existing index data and the task retryable as today. Individual embedding storage failures keep their current behavior; atomic storage of every embedding is outside this change.

### 3. States

The existing PDF text task moves from unindexed to indexed only after all pages in its indexed range are extracted and embedding computation succeeds, using the existing storage behavior. A failed vertical extraction leaves it unindexed and does not replace prior data. A rules-version change resets the flag once; later successful processing restores it. Existing OCR page states and OCR mode are unchanged. A document read is stateless.

### 4. Data read and written

Read the PDF, `indexed_files`, and existing `pdf_page_ocr_texts`. The existing indexing path writes `indexed_files.text_indexed`, `fts_text_content`, `embeddings`, vector storage, `pdf_markdown` and, through existing citation recomputation, citation data. The version check writes the existing index metadata and resets PDF flags. Document reads write no file or database row. No sample PDFs or full extracted pages are committed.

### 5. External services

PDF extraction is local and makes no network or OCR call. Existing embedding calls and their configured provider are unchanged; a failed embedding leaves the task retryable and old index data intact.

### 6. Authorization

No new route or permission is added. Existing drive-scoped indexing and `document-text` lookup and `file_access` gate apply unchanged.

### 7. Effect on existing features

Keyword and exact search, semantic search, Ask, summaries and document reading can use recovered text. Search hits retain their original page number. Vertical boxes are added after the existing page text rather than interleaved, so mixed-page reading order and summary structure may differ from the printed page. A page whose vertical characters predominate uses plain text in place of Markdown, including any horizontal text on that page; other pages retain horizontal Markdown. Citation recomputation and successful `replace_document_sections` follow the current changed-chunk path. A failed vertical extraction leaves existing document sections unchanged. If PyMuPDF4LLM raises, the existing fitz fallback receives the same recovered boxes, deduplicated against that fallback text; both indexing and document reading apply this rule independently. OCR and non-PDF extractors do not change.

### 8. Error behavior

The operator gets a warning with the page and error class, not document contents. A failed indexing attempt keeps the old indexed data and is retried by the existing reconciliation path; an on-demand read returns 422. No success is recorded for a PDF whose vertical extraction failed.

### 9. User-visible behavior

A search for a contiguous word in a recovered vertical text box can find the PDF and show its page. Reading that page through `read_document` returns the recovered words. Following deployment, existing PDFs become searchable after their background re-extraction completes. There is no new setting or progress screen.

### 10. Non-functional

Use the existing PyMuPDF lock for every PyMuPDF operation; pdfminer must not modify the source. Keep 200 MB and 500-page indexing limits and the existing document-reader request cap, timeout and lock acquisition behavior. Parse only requested pages for `document-text`; do not perform document-wide pdfminer extraction on each page. No sample contents leave the machine during tests. The existing reader waits at most 10 seconds for its slot and PyMuPDF lock, but does not impose a hard cancellation deadline on extraction once running; this change adds none. Benchmark representative long PDFs before merge. A slow or stuck parser retains its existing worker or reader slot until it returns.

## Touch points

- `addons/intelligence/app/extractors/pdf.py`, `app/document_text.py`, `app/workers/metadata.py`, `app/database.py` and the existing PDF indexing queue and startup rules version.
- `addons/intelligence/requirements.txt` and `requirements-test.txt`, plus PDF extractor, document reader, indexing and reindex regression tests; no protected process-kit path is edited.
- Existing `indexed_files`, index metadata, `fts_text_content`, `embeddings`, vector storage, `pdf_markdown`, citation data and `pdf_page_ocr_texts`; existing `document-text` endpoint and citation update event.
- `.claude/rules/design-decisions.md`, `.claude/rules/backend-conventions.md`, `docs/process/testing-and-comments.md`, and the user-facing documentation covering document search and the addon.

## Invariants

I1. For a page within the 500-page indexing cap, a contiguous word in a recovered vertical box occurs after normalization in that page’s indexed and on-demand text, with the correct page number.
I2. A page where vertical characters do not outnumber horizontal characters retains its existing horizontal Markdown and gains each vertical box whose normalized text is not already present; a page where vertical characters predominate uses the complete pdfminer page text.
I3. A PDF page without vertical characters or recovered vertical boxes retains its existing text, chunks and Markdown; a non-PDF file is unchanged.
I4. An image-only page uses stored OCR text under the existing empty-layer rule, and no OCR row is changed by re-extraction.
I5. A vertical extraction exception, or empty pdfminer text on a predominantly vertical page, does not mark the text task successful, replace existing searchable or section data, or return a successful incomplete document read.
I6. A PDF rules version change resets PDF text flags once, preserves existing OCR rows, and does not reset non-PDF flags.
I7. PDF indexing respects the existing size and page caps; a document read can recover an explicitly requested later page and performs no database write.
I8. Every added PyMuPDF call holds the existing `PYMUPDF_LOCK`; document reads retain the existing request concurrency and timeout limits.
I9. If chunks are unchanged, existing FTS and embedding rows remain; if they change, existing citation recomputation is invoked.

## Revises

SPEC-ADDON-036 I9. PDF extraction output changes according to the predominantly vertical-page replacement and mixed-page vertical-box recovery specified here; other formats remain unchanged.
SPEC-ADDON-060 I1. A page without edge-band text remains unchanged only if it also has neither predominantly vertical text nor a recovered vertical box.
SPEC-ADDON-060 I2. On predominantly vertical pages, the complete pdfminer page text replaces the edge-line and Markdown assembly.
SPEC-ADDON-060 I3. On predominantly vertical pages, pdfminer page text may contain repeated headers, footers and page numbers.
SPEC-ADDON-060 I4. On predominantly vertical pages, both indexing and document reading use the complete pdfminer page text rather than recovered edge lines.
SPEC-ADDON-060 I10. On predominantly vertical pages, the complete pdfminer page text replaces the edge-line and Markdown assembly.
SPEC-ADDON-069 I5. Pages with an embedded text layer keep their earlier chunks except where this specification replaces predominantly vertical pages or adds recovered vertical boxes.

## Checked, no action

- Re-running or changing Yomitoku OCR is unnecessary for the tested PDFs: the embedded layer already contains the characters. OCR correction and accuracy are outside this change.
- Replacing all PDF Markdown with pdfminer output would discard existing heading and table structure, including on pages where a technical diagram contains vertical labels.
- Perfect manga panel order, vertical/horizontal interleaving and joining text across line or box boundaries are not promised; the sample experiment shows that these require separate evaluation. On non-dominant mixed pages some isolated vertical glyphs may be classified by pdfminer as horizontal and remain absent; the sample trial shows that adding every horizontal box also duplicates body text and headers. Recovery of those isolated glyphs requires a separate evaluated approach.
- Automatically repairing every historical PDF beyond the existing 500-page indexing limit is outside scope. No index is modified during the trial.
