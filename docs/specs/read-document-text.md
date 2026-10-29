# Let MCP agents read the text of PDF, Office and EPUB files

SPEC-ID: SPEC-ADDON-036
SPEC-ID: SPEC-CORE-019

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

An agent connected through the MCP server can read `text/*` and JSON files, but not a PDF,
a Word document, a spreadsheet, a slide deck or an EPUB book: `get_file_content` refuses
their MIME types, and the only way in is `semantic_search` excerpts or a thresholded Ask.
The intelligence addon already extracts these formats when it indexes them, but what it
stores cannot be read back as the document: text chunks overlap by 200 characters, and the
stored PDF Markdown separates pages with `---`, which a page's own horizontal rule also
produces.

- SPEC-ADDON-036: a new intelligence endpoint, `GET /files/{file_id}/document-text`, extracts
  the requested pages (PDF), slides (pptx), sheets (xlsx), sections (EPUB) or the whole
  document (docx) from the file on demand, with the extractors indexing uses, and returns
  them as numbered units with a cursor for the next read.
- SPEC-CORE-019: a new MCP tool, `read_document`, calls it.

No text is stored; the text always matches the file as it is now. EPUB section titles are
the ones indexing stored, so they match what search reports.

## Required items

### 1. Normal flow

**SPEC-ADDON-036**

1. The caller sends `GET /api/addons/intelligence/files/{file_id}/document-text` with
   `X-Lit-Drive` and optional `start` (unit number, default 1, at least 1), `count` (units,
   default and maximum below), `offset` (characters to skip in the first unit, default 0,
   at least 0) and `max_chars` (default 50000, 1 to 200000).
2. The handler finds the file's `indexed_files` row by `file_id`, `drive = X-Lit-Drive` and
   `active` in one query (404 `File not found` otherwise, the same detail for all three
   cases), and decides the unit kind from its MIME type:

   | MIME | Unit | `count` default / maximum | Title |
   |---|---|---|---|
   | `application/pdf` | page, 1-based, every page of the file | 5 / 10 | none |
   | pptx | slide, 1-based, every slide of the deck | 50 / 200 | the slide title, when it has one |
   | xlsx | sheet, 1-based, every sheet in workbook order, including empty sheets and chartsheets | 5 / 50 | the sheet name |
   | `application/epub+zip` | spine section, 1-based, every spine item (the numbering search results use as `section`) | 10 / 100 | the stored `document_sections` title for that section, else none |
   | docx | the whole document; `unit_count` is always 1 | 1 / 1 | none |

3. It extracts only the requested units, off the event loop. A unit's text is the text
   indexing builds for it before chunking, without the heading line indexing prepends to a
   slide or sheet (its name is the `title`):
   - PDF: the requested pages converted by PyMuPDF4LLM in one call over just those pages.
     Heading levels (`#`) are detected over the pages converted, so they can differ from
     the whole-file conversion indexing made; the page text is the same. If PyMuPDF4LLM
     raises on the requested pages, those pages are read as PyMuPDF plain text and
     `extractor` is `fitz_fallback`; reads of other ranges of the same file can still use
     PyMuPDF4LLM.
   - docx: headings as `#` lines and paragraphs in document order, then the tables, one row
     per line with cells joined by ` | `. An empty document is one unit with empty text.
   - xlsx: the sheet's non-empty rows, cells joined by spaces, up to 1000 rows. An empty
     sheet or a chartsheet has empty text. `truncated` is true only when the sheet has more
     than 1000 non-empty rows.
   - pptx: the slide's text frames other than the title, one paragraph per line.
   - EPUB: the section's Markdown with ruby annotations dropped and links removed, as
     indexing builds it. The navigation document, a non-HTML item, an encrypted (DRM) item,
     and an item over the 5 MB section cap have empty text, as they do in indexing.
4. Size caps: the per-file caps indexing applies (PDF 200 MB, docx and xlsx 50 MB, pptx
   100 MB) refuse the file. For EPUB, one request may decompress at most 20 MB: the
   container, the package document, `encryption.xml` and the requested sections, in that
   order. When the budget runs out before a requested section, the response ends before
   that section and `next` points at it, unless it is the first unit of the response, in
   which case its text is empty. The indexing caps of 500 PDF pages, 2000 EPUB sections and
   2 million EPUB characters do not apply: any unit up to `unit_count` can be read.
5. It skips `offset` characters of the first unit; if `offset` is at or beyond that unit's
   length, the unit is left out of `units`, does not count toward `count`, and the read
   starts at the next unit with offset 0. It then returns units in order until `count`
   units are returned or their text reaches `max_chars`. A unit that would pass
   `max_chars` is cut there.
6. At most two extractions run at once in the addon. A third request waits up to 10 s for a
   slot, then gets 503 `Document reader busy`. An extraction keeps its slot until it
   finishes, even if the caller has gone.
7. Response:

   ```json
   {
     "file_id": "...",
     "unit": "page" | "slide" | "sheet" | "section" | "document",
     "unit_count": 0,
     "extractor": "pymupdf4llm" | "fitz_fallback" | "office" | "epub",
     "units": [{"number": 1, "title": "..." | null, "text": "...", "truncated": false}],
     "next": {"start": 1, "offset": 0} | null
   }
   ```

   `next` is the cursor for the following read: the unit after the last one returned with
   `offset` 0, or the cut unit with the offset where its text stopped; `null` when the last
   unit has been returned in full. `offset` counts Unicode code points. A unit cut by
   `max_chars` is followed by a `next` with a non-zero offset; `truncated` is not used for
   that.

**SPEC-CORE-019**

1. The MCP server registers `read_document` with `drive` (string), `file_id` (non-empty
   string), and optional `start` (integer, at least 1), `count` (integer, 1 to 200),
   `offset` (integer, at least 0) and `max_chars` (integer, 1 to 200000). The per-kind
   `count` maximum is checked by the endpoint.
2. It calls the endpoint through the core addon proxy with `X-Lit-Drive` (percent-encoded)
   and returns the response as compact JSON, like `search_exact`.
3. The description says which formats it reads, what a unit is per format, that `next` is
   the cursor to pass back, that a scanned page without a text layer reads as empty, that a
   slow PDF read fails and should be retried with a smaller `count`, and that
   `get_file_content` is the tool for `text/*` and JSON files.
4. `get_file_content`'s refusal for a PDF, docx, xlsx, pptx or EPUB file names
   `read_document`; its refusal for any other MIME type is unchanged. It does not check
   whether the intelligence addon is installed; without it, `read_document` returns the
   proxy's 404.
5. The server instructions gain one line pointing to `read_document`.

### 2. Failure cases

| Step | What goes wrong | What happens |
|---|---|---|
| Lookup | the file is unknown, inactive or in another drive | 404 `File not found` |
| Lookup | the MIME type is none of the five | 415 naming the supported types |
| Parameters | out of bounds, or `count` above the kind's maximum | 422 |
| Parameters | `start` above `unit_count` (including `unit_count` 0) | 200 with `units: []`, `next: null` |
| Parameters | `offset` at or beyond the first unit's length | that unit is left out; the read continues at the next unit |
| Concurrency | two extractions are running and none finishes within 10 s | 503 `Document reader busy` |
| Extraction | the file is missing on disk, over its size cap, corrupt, or password-protected | 422 `Document could not be read` |
| Extraction | an EPUB item is the navigation document, encrypted, not HTML or over 5 MB | that unit's text is empty |
| Extraction | the EPUB budget runs out mid-request | the response ends before the section; `next` points at it |
| Extraction | PyMuPDF4LLM raises on the requested pages | PyMuPDF plain text, `extractor: fitz_fallback` |
| Extraction | the extractor raises anything else | 422 `Document could not be read`, logged with the exception type |
| Proxy | the extraction outlasts the route's 25 s timeout | the core proxy's 502 `Addon service unavailable`; the extraction finishes in the addon and is discarded |
| MCP | any non-2xx | the tool's existing error text with the status and detail |

### 3. States

None. The endpoint reads; it keeps no state between calls. The cursor is the caller's.

### 4. Data read and written

- Read: `indexed_files` (drive, active, MIME, path), `document_sections` (EPUB titles), and
  the file itself from the addon's read-only drive mount.
- Written: nothing. No table, cache or file.

### 5. External services

None. No LLM, vision model or embedder is called.

### 6. Authorization

- The manifest route uses `pre_check: {type: file_access, param: file_id}`, as
  `/files/{file_id}/pdf-markdown` does: the core proxy returns 404 for a file the caller
  cannot access.
- The handler's lookup filters on the `X-Lit-Drive` drive, so a file of another drive is
  404 even if the proxy check were bypassed.
- A drive whose intelligence policy is off has no `indexed_files` rows after the startup
  purge, so its files are 404; no AI feature is involved, so no feature gate is added.

### 7. Effect on existing features

- The extractors gain functions that produce the requested units' text without chunking;
  `extract()` calls them, and its chunks, Markdown, extractor, page count and section
  titles do not change.
- `get_file_content` only changes its refusal text for the five formats.
- No existing endpoint, table or tool changes.

### 8. Error behavior

The HTTP status and `detail` above; the MCP tool shows them in its error text. The addon
logs a warning with the file id and exception type when an extraction fails. Nothing
contains file text.

### 9. User-visible behavior

A new MCP tool. No web UI change.

### 10. Non-functional

- Every hop on the MCP path gives up at about 30 s (the MCP client's request timeout and
  the Next.js rewrite proxy), so the route timeout is 25 s and a PDF read is at most 10
  pages. PyMuPDF4LLM takes roughly 0.1 to 1 s per page.
- At most two extractions run at once, so reads cannot starve indexing of CPU.
- A response carries at most 200000 characters of text.
- Privacy: text leaves the addon only to the authorised caller, as `pdf-markdown` already
  does.

## Touch points

- `addons/intelligence/app/extractors/pdf.py`, `office.py`, `epub.py`: per-unit text
  functions shared with `extract()`.
- `addons/intelligence/app/routers/` (a new module): the endpoint; `app/main.py` mounts it.
- `addons/intelligence/app/schemas.py`: the response model.
- `addons/intelligence/manifest.json`: the route with the `file_access` pre-check and a
  25 s timeout.
- `addons/intelligence/tests/`: endpoint and extractor tests.
- `addons/intelligence` submodule pointer bump in the core repository.
- `mcp-server/src/tools/` (a new `documents.ts`), `tools/index.ts`, `tools/read.ts`
  (refusal text), `src/server.ts` (instructions), `src/__tests__/` including
  `toolMetadata.test.ts` (tool list, read-only classification, instructions).
- Docs: `docs/addons/intelligence.md` (endpoint), `mcp-server/README.md` (tool).
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, addon
  drive-scope context propagation, addon policy), the intelligence event-loop discipline
  (blocking work in `asyncio.to_thread`).
- No protected path is edited.

## Invariants

I1. For a file whose `indexed_files` row is unknown, inactive or in a drive other than
`X-Lit-Drive`, the endpoint returns 404 `File not found` and opens nothing on disk.
I2. Concatenating the `text` of every unit returned by following `next` from `start=1,
offset=0` until it is `null` yields each unit's full text exactly once, in unit order, for
any `max_chars` and `count` within bounds.
I3. For a docx, xlsx, pptx or EPUB unit for which indexing builds text, and for a PDF page
whose conversion detects no headings, the unit's `text` equals the text indexing builds for
it before chunking, less the slide or sheet heading line.
I4. A unit `number` means the same unit as the `page` / `section` a search result reports
for that file (PDF page, EPUB spine section), and an EPUB unit's `title` is that section's
stored title.
I5. No response carries more than `max_chars` characters of `text` in total, and no PDF
request converts more than 10 pages.
I6. The endpoint writes nothing to any database or file, and calls no LLM, vision model or
embedder.
I7. A corrupt, missing, over-cap or password-protected file yields 422 `Document could not
be read`, never a 5xx.
I8. No more than two extractions run at once in the addon.
I9. For any file, `extract()` returns the same chunks, Markdown, extractor, page count and
section titles as before the change.
I10. `read_document` sends `X-Lit-Drive` for the `drive` argument on every call and returns
the endpoint's body unchanged in content.

## Checked, no action

- **Storing per-unit text at indexing time**: decided against by the human. It would need
  existing documents re-extracted (re-embedding them, or a separate migration) and keeps a
  second copy of text the file already holds.
- **Rebuilding the text from the stored chunks**: the 200-character overlap is cut at
  paragraph or sentence boundaries and stripped, so removing it exactly is guesswork.
- **Splitting the stored PDF Markdown on its page separator**: a page's own `---` rule is
  indistinguishable from the separator.
- **Extending `get_file_content`**: decided against by the human. It is the editing read
  (ETag, line ranges); mixing read-only extractions into it changes its arguments and
  shape by MIME type.
- **Detecting PDF heading levels over the whole file, as indexing does**: it scans every
  page on each read, which does not fit the 25 s budget for long files; the page text is
  the same either way.
- **A longer timeout for slow reads**: the MCP client and the Next.js rewrite proxy both
  stop at about 30 s; raising both for one tool widens every request's timeout. A smaller
  PDF page limit keeps reads inside it.
- **Recomputing EPUB titles from the file**: it needs the TOC and every section before the
  first TOC entry on each read; the stored titles are what search shows.
- **Paragraph or heading units for docx**: Word has no stable page numbers, and heading
  styles are optional; the character cursor pages a long document instead.
- **Legacy `.doc`/`.xls`/`.ppt`, ODF, RTF**: indexing does not extract them either.
- **OCR for scanned PDFs**: indexing has no OCR; such pages read as empty, which the tool
  description states.
- **A feature-policy gate**: reading text involves no AI feature; the drive's intelligence
  policy already removes the rows the lookup needs.
- **A dedicated error for a read that outlasts the proxy timeout**: the proxy maps every
  upstream timeout to 502; the tool description tells the agent to retry with a smaller
  `count`.
