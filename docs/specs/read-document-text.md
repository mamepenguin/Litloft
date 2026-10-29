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

Nothing is stored; the text always matches the file as it is now.

## Required items

### 1. Normal flow

**SPEC-ADDON-036**

1. The caller sends `GET /api/addons/intelligence/files/{file_id}/document-text` with
   `X-Lit-Drive` and optional `start` (unit number, default 1, at least 1), `count` (units,
   default and maximum below), `offset` (characters to skip in the first unit, default 0,
   at least 0) and `max_chars` (default 50000, 1 to 200000).
2. The handler finds the file's active `indexed_files` row in that drive (404 otherwise)
   and decides the unit kind from its MIME type:

   | MIME | Unit | `count` default / maximum | Title |
   |---|---|---|---|
   | `application/pdf` | page, 1-based | 10 / 20 | none |
   | pptx | slide, 1-based, every slide in the deck | 50 / 200 | the slide title, when it has one |
   | xlsx | sheet, 1-based, workbook order | 5 / 50 | the sheet name |
   | `application/epub+zip` | spine section, the numbering search results use as `section` | 10 / 100 | the section title search results use as `section_title` |
   | docx | the whole document, one unit | 1 / 1 | none |

3. It extracts only the units `start` to `start + count - 1` (clamped to the last unit),
   off the event loop, with at most two extractions running at once in the addon. A
   unit's text is the text indexing builds for it before chunking it:
   - PDF: the page's PyMuPDF4LLM Markdown; if PyMuPDF4LLM fails on the file, the page's
     plain text from PyMuPDF (`extractor` says which).
   - docx: headings as `#` lines and paragraphs in document order, then the tables, one row
     per line with cells joined by ` | `.
   - xlsx: the sheet's non-empty rows, cells joined by spaces, up to the 1000-row cap
     indexing applies; a sheet cut at the cap is marked `truncated: true`.
   - pptx: the slide's text frames other than the title, one paragraph per line.
   - EPUB: the section's Markdown with ruby annotations dropped and links removed; a
     section that is not HTML, is encrypted, or is unreadable has empty text.
   The per-file size caps indexing applies (PDF 200 MB, docx/xlsx 50 MB, pptx 100 MB, EPUB
   20 MB of decompressed reads) apply here too. The 500-page PDF cap, the 2000-section EPUB
   cap and the 2-million-character EPUB text cap do not: any unit up to `unit_count` can be
   read.
4. It skips `offset` characters of the first unit, then returns units in order until
   `count` units are returned or their text reaches `max_chars`. A unit that would pass
   `max_chars` is cut there.
5. Response:

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
   unit has been returned in full. `offset` counts Unicode code points.

**SPEC-CORE-019**

1. The MCP server registers `read_document` with `file_id`, `drive`, and optional `start`,
   `count`, `offset`, `max_chars`, validated with the same bounds as the endpoint (its
   per-kind `count` maximum is checked by the endpoint).
2. It calls the endpoint through the core addon proxy with `X-Lit-Drive` (percent-encoded)
   and returns the response as compact JSON, like `search_exact`.
3. The description says which formats it reads, what a unit is per format, that `next` is
   the cursor to pass back, that a scanned page without a text layer reads as empty, and
   that `get_file_content` is the tool for `text/*` and JSON files.
4. `get_file_content`'s refusal for other MIME types names `read_document` for these five
   formats.
5. The server instructions gain one line pointing to `read_document`.

### 2. Failure cases

| Step | What goes wrong | What happens |
|---|---|---|
| Lookup | the file is unknown, inactive or in another drive | 404 `File not found` |
| Lookup | the MIME type is none of the five | 415 naming the supported types |
| Parameters | out of bounds, or `count` above the kind's maximum | 422 |
| Parameters | `start` above `unit_count` (or `unit_count` is 0 and `start` is 1) | 200 with `units: []`, `next: null` |
| Parameters | `offset` at or beyond the first unit's length | that unit is skipped; the read continues at the next unit |
| Extraction | the file is missing on disk, over its size cap, corrupt or password-protected | 422 `Document could not be read` |
| Extraction | an EPUB section is encrypted (DRM) or not HTML | that unit's text is empty |
| Extraction | PyMuPDF4LLM raises | PyMuPDF plain text, `extractor: fitz_fallback` |
| Extraction | the extractor raises anything else | 422, logged with the exception type |
| Proxy | the extraction outlasts the proxy timeout (60 s) | the proxy's error; the extraction finishes and is discarded |
| MCP | any non-2xx | the tool's existing error text with the status and detail |

### 3. States

None. The endpoint reads; it keeps no state between calls. The cursor is the caller's.

### 4. Data read and written

- Read: `indexed_files` (drive, active, MIME, path) and the file itself from the addon's
  read-only drive mount.
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

- The extractors gain a way to produce one unit's text without chunking it; indexing keeps
  calling `extract()` and its chunks, Markdown and titles do not change.
- `get_file_content` only changes its refusal text.
- No existing endpoint, table or tool changes.

### 8. Error behavior

The HTTP status and `detail` above; the MCP tool shows them in its error text. The addon
logs a warning with the file id and exception type when an extraction fails. Nothing
contains file text.

### 9. User-visible behavior

A new MCP tool. No web UI change.

### 10. Non-functional

- One request extracts at most 20 PDF pages, or one Office/EPUB file, bounded by the caps
  above. PyMuPDF4LLM takes roughly 0.1 to 1 s per page, so a 20-page read fits the 60 s
  proxy timeout.
- At most two extractions run at once, so reads cannot starve indexing of CPU.
- A response carries at most 200000 characters of text.
- Privacy: text leaves the addon only to the authorised caller, as `pdf-markdown` already
  does.

## Touch points

- `addons/intelligence/app/extractors/pdf.py`, `office.py`, `epub.py`: per-unit text
  functions shared with `extract()`.
- `addons/intelligence/app/routers/files.py` (or a new router module): the endpoint.
- `addons/intelligence/app/schemas.py`: the response model.
- `addons/intelligence/manifest.json`: the route with `file_access` pre-check and a 60 s
  timeout.
- `addons/intelligence/tests/`: endpoint and extractor tests.
- `addons/intelligence` submodule pointer bump in the core repository.
- `mcp-server/src/tools/` (a new `documents.ts` or `search.ts`), `tools/index.ts`,
  `tools/read.ts` (refusal text), `server.ts` (instructions), `mcp-server/__tests__/`.
- Docs: `docs/addons/intelligence.md` (endpoint), `mcp-server/README.md` (tool).
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, addon
  drive-scope context propagation, addon policy), the intelligence event-loop discipline
  (blocking work in `asyncio.to_thread`).
- No protected path is edited.

## Invariants

I1. For a file whose `indexed_files` row is inactive or belongs to a drive other than
`X-Lit-Drive`, the endpoint returns 404 and reads nothing from disk.
I2. Concatenating the `text` of every unit returned by following `next` from `start=1,
offset=0` until it is `null` yields each unit's full text exactly once, in unit order, for
any `max_chars` and `count` within bounds.
I3. A unit's `text` equals the text indexing builds for that unit before chunking (for a PDF
on the PyMuPDF4LLM path, the page's Markdown), less the `## Slide N` / `## Sheet` heading
line indexing prepends, whose name is the unit's `title`; so what search found is in it.
I4. A unit `number` means the same unit as the `page` / `section` a search result reports
for that file (PDF page, EPUB spine section).
I5. No response carries more than `max_chars` characters of `text` in total, and no PDF
request extracts more than 20 pages.
I6. The endpoint writes nothing to any database or file, and calls no LLM, vision model or
embedder.
I7. A corrupt, missing or over-cap file yields a 4xx with `Document could not be read`, never
a 5xx.
I8. `read_document` sends `X-Lit-Drive` for the `drive` argument on every call and returns
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
- **Paragraph or heading units for docx**: Word has no stable page numbers, and heading
  styles are optional; the character cursor pages a long document instead.
- **Legacy `.doc`/`.xls`/`.ppt`, ODF, RTF**: indexing does not extract them either.
- **OCR for scanned PDFs**: indexing has no OCR; such pages read as empty, which the tool
  description states.
- **A feature-policy gate**: reading text involves no AI feature; the drive's intelligence
  policy already removes the rows the lookup needs.
