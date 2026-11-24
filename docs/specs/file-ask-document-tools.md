# File Ask on a PDF or EPUB lets the model read more of its text and look at PDF pages

SPEC-ID: SPEC-ADDON-182
SPEC-ID: SPEC-ADDON-183

Approval: sha256:8f6e7278df77a63cfe832bea67d0458f8a27c7504bd58c27589b48e272c51dfe Yuichi Senga 2026-11-24

## Summary

A question about one PDF or EPUB in the file Ask tab (SPEC-ADDON-053) sends the file's
text whole when it fits `rag.file_question_max_chars` (16,000). Otherwise only the chunks
closest to the question are sent and the answer says it read part of the file
(`partial`). In production (2026-11-24) 18 of 30 PDFs and all 6 EPUBs are over the
budget; the EPUBs' sections hold 18,000 characters at the median and 121,000 at most. The
model can reach nothing beyond the chunks first sent, and it never sees a PDF page, so a
figure, a table laid out on the page or a scanned page reaches it only as extracted text.

The video path already lets the model ask for more (SPEC-ADDON-116, SPEC-ADDON-174). This
change gives PDF and EPUB questions a path of their own with two tools, on a profile that
can see:

- **SPEC-ADDON-182**: `get_text`, offered when the material is cut. The model names where to
  start: a PDF page, an EPUB section, or "after" a passage number it was given. It gets the
  file's text from there onward, up to 3,000 characters, numbered and citable like the
  passages, with a line where each page or section begins; a part it already has is named by
  its number. A result cut by the limit ends with the passage number to continue after. With
  3 calls per question, one question reaches about 7,000 new characters past a starting
  point (3 × 3,000, less the "already sent" lines and the chunk overlap).
- **SPEC-ADDON-183**: `get_page_images`, offered on every PDF question. The model names pages,
  or passages whose pages it wants, and gets images of up to 4 pages per call, numbered and
  citable, a cited page image opening its page.

Calls of both tools share a limit of 3 per question, with the 120 s window and 300 s
deadline of SPEC-ADDON-116. It is for the viewer asking about a long document or about what
a PDF page shows. A PDF or EPUB with no indexed text stays outside file Ask, as today.

## Terms

- **Document**: a file whose `mime_type` is `application/pdf` (a PDF) or
  `application/epub+zip` (an EPUB).
- **Row**: one `fts_text_content` row of the file with non-empty text, as `load_material`
  already reads them; **file order** is `chunk_index` order (numeric). Rows are chunks of at
  most 400 characters, and consecutive rows share up to 80 characters (`TextChunkingConfig`).
- **Unit** of a row: its stored `page` read as an integer, a PDF's page or an EPUB's section
  (the number `?section=` takes). A row whose `page` cannot be read as an integer has no
  unit.
- **First row of a unit**: a row with a unit whose previous row in file order has no unit or
  another unit, or which is the file's first row.
- **Cut material** and **sent row**: as SPEC-ADDON-174. A row sent cut short by fitting is a
  sent row; its remainder is not available.
- **Given number**: a number the question has sent for a passage: an initial passage, or a
  requested passage. A page image's number is not a given number.
- **Page count** (PDF): the larger of `pdf_markdown.page_count` for the file (when that row
  exists) and the largest unit among its rows. **Section range** (EPUB): from the smallest to
  the largest unit among its rows.
- **Integer argument**: a JSON integer, a JSON number with no fractional part (`12.0`), or a
  string that is one or more ASCII digits after trimming whitespace (`"12"`); never a
  boolean. A key whose value is `null` is treated as absent; keys other than those a tool
  defines are ignored.
- **Document tool path**: the path of normal flow step 2, taken when the profile can see
  (`profile_can_see`) and the file is a PDF, or an EPUB whose material is cut.
- **Text request**: one tool call named `get_text`. **Page request**: one tool call named
  `get_page_images`. **Tool call**: any call of a reply, whatever its name.
- **Requested passage**: a row sent in reply to a text request. **Page image**: one image of
  one PDF page, sent in reply to a page request.
- **Unit marker**: a line `Page <u> begins.` (PDF) or `Section <u> begins.` (EPUB), or the
  line `Continuing page <u>.` / `Continuing section <u>.`; it carries no bracketed number.
- **Today's text request**: the request `_text_question_stream` sends for the same question
  with no image (passages-only system and user prompts of SPEC-ADDON-179, the text `model`,
  `rag.max_tokens`, streamed).

## Required items

### 1. Normal flow

1. The viewer asks about a document. `load_material` reads the material as today. For a
   document it also keeps every row in file order with its unit and, for each sent row, its
   number, plus the page count (PDF) or the section range (EPUB).
2. `_file_question_stream` takes the document tool path when its Terms condition holds. A
   text video takes the frames path as today; every other file, and a document whose
   condition does not hold, takes today's text path. The tools offered, in this order:
   - PDF, material cut: `get_text`, `get_page_images`.
   - PDF, material not cut: `get_page_images`.
   - EPUB, material cut: `get_text`.
3. The user prompt is today's passages-only user prompt (file block, history, `Question:`,
   `Passages from the file:` and the numbered passages), followed by an empty line and then,
   each on its own line:
   - PDF: `The document has <N> pages.`; EPUB: `The book has sections <a> to <b>.`
   - When the material is cut: the line `Contents, each with the start of what it says:`,
     then the contents lines. The units (PDF: pages 1 to N; EPUB: the units that some row
     has, ascending) are split in order into consecutive groups of `ceil(units / 40)` units,
     so there are at most 40 groups. Each group is one line: `Page <p>: <excerpt>` or
     `Pages <p>–<q>: <excerpt>` for a PDF; `Section <s>: <title> — <excerpt>` or
     `Sections <s>–<t>: <title> — <excerpt>` for an EPUB, where `<title>` is the stored
     `document_sections` title of the group's first section, cut to 60 characters, and is
     left out with its ` — ` when there is none. The excerpt: the text of the group's rows in
     file order with every `[<1–3 digits>]` removed, each row's whitespace runs collapsed to
     one space and trimmed, rows joined with one space, cut to its first 120 characters and
     trailing whitespace removed. A group with no row is the range alone, with no `: `. A row
     with no unit is in no group.
   No number of a passage is written beside a page or section anywhere in the prompt.
4. The system prompt of the document tool path, line for line, `{…}` present only under the
   condition stated in it. `<items>` is "the numbered passages below{, the numbered passages
   get_text returns (when get_text is offered)}{ and the numbered page images
   get_page_images returns (when get_page_images is offered)}"; `<cited>` is "passages" or,
   when `get_page_images` is offered, "passages and page images".
   - Opener: "You answer a question about a single file, using <items> and the File, Type and
     Folder lines." With history, it continues: " The earlier turns of this conversation are
     context for the new question, and their answers may be wrong; only <items> may be
     cited."
   - An empty line, then `Rules:`, then:
     - S179 (SPEC-ADDON-179).
     - "- The passages below are part of the file's text, the parts closest to the
       question." when cut; "- The passages below are the file's text." otherwise.
     - "- Each passage{ and each page image (when get_page_images is offered)} is introduced by
       its number in square brackets, e.g. [1]."
     - "- Cite the <cited> your answer uses inline as [n], right after the sentence they
       support."
     - "- Cite only numbers that appear among the <cited>; never invent one."
     - When `get_text` is offered: "- If the answer may be in a part of the file the
       passages do not include, you must call get_text for that part before answering.
       Never say that something is not in the file unless you have called get_text for the
       part where it would be."
     - When `get_page_images` is offered: "- If the answer depends on what a page shows (a
       figure, a table, the layout, a scanned page), call get_page_images for that page.
       Where a page image and a passage differ, take exact characters from the passage."
     - "- If it is still not there after that, say so plainly instead of guessing."
     - S181a, S181b, S181c, the "Answer in short Markdown" line, the raw HTML line and the
       language line, as on every path.
   - An empty line, then `More of the file:`, then:
     - when cut: "- The passages are part of the file's text, not all of it.";
     - when `get_text` is offered: "- The tool get_text returns the file's text from a
       {page | section} you name, or from just after a numbered passage you name, onward, up
       to 3,000 characters per call; a part you already have is named by its number
       instead." and "- When a result says the text continues, call get_text again from
       where it says for more.";
     - when `get_page_images` is offered: "- The tool get_page_images returns images of the
       pages you name, or of the pages numbered passages are on: up to 4 pages per call.";
     - "- You may make at most 3 calls{ of get_text and get_page_images together} for this
       question." (the braced part when both are offered);
     - "- Never ask the viewer for pages or places; choose them yourself from what the prompt
       gives you.";
     - "- What these tools return is numbered and cited exactly as the passages you already
       have: [n], right after the sentence it supports."
5. Tool definitions:
   - `get_text` (PDF): parameters an object with `page` (integer, "A page number of this
     document") and `after` (integer, "The number of a passage you were given; the text
     after it is returned"), neither required; description "Return this file's text onward
     from a page, or from just after a passage you were given, apart from what you already
     have. Give either page or after." EPUB: `section` ("A section number of this book") in
     place of `page`, and "section" in place of "page" in the description.
   - `get_page_images`: parameters an object with `pages` (array of integers, "Page numbers
     of this document") and `passages` (array of integers, "Numbers of passages whose pages
     you want"), neither required; description "Return images of pages of this document:
     the pages you name and the pages the passages you name are on, up to 4 pages."
6. The loop is SPEC-ADDON-116's, with no initial image and no frame preparation:
   - Each request goes to the profile's `vision_model` through `reply_with_frames` (tool
     request) or `stream_with_frames` (final request), exactly as the video path sends them
     today: ollama with `think: true` and `num_predict` 8192 (`OLLAMA_FRAME_TOOL_NUM_PREDICT`),
     OpenAI-compatible with the max-tokens field of 16384 (`FRAME_TOOL_MAX_TOKENS`). This holds
     for every question on the path, including one where the model calls no tool.
   - A tool request is read to its end before anything is written. A reply with no call
     whose text is not blank is written as the answer, in one `answer_chunk`, then
     `citations`, `meta` and `done`. A reply with no call and blank text goes to the
     fallback.
   - Once 3 tool calls have been served or 120 s have passed since the slot was taken, the
     next request is the final request, listing the same tools with `tool_choice` `"none"`
     (OpenAI-compatible) or no tools (ollama); its answer streams. A final answer that is
     blank goes to the fallback.
   - Until the first `answer_chunk` the stream writes `: keepalive` at least every 5 s,
     through the fallback request too.
7. Tool calls of a reply are handled in the order given. The first 3 tool calls of the
   question, whatever their names, are served and spend one of the 3; each call after them
   gets "Nothing follows: this question has already been served its 3 tool calls." and
   spends nothing. A served call named neither offered tool gets "Nothing follows: <name>
   cannot be served. Only <the offered tools, joined with " and "> are available.", with
   "this call" in place of `<name>` when the name is empty.
8. A text request is served as follows (SPEC-ADDON-182):
   1. Its arguments must be an object holding exactly one of the two keys (`page` or
      `section` as the file's kind has it, or `after`) as an integer argument, `page` within
      1 to the page count, `section` within the section range, `after` a given number.
      Otherwise the result is "No text follows: get_text takes a JSON object with either
      page, a page number from 1 to <N>, or after, the number of a passage you were given."
      (EPUB: "section, a section number from <a> to <b>"), and the call is still served.
   2. The walk starts at the first row in file order whose unit is at least the named one
      (rows with no unit are passed over in this search), or at the row after the one the
      given number was sent for. When there is no such row, the result is "Nothing is written
      from page <u> on." (EPUB: "section <u>") or "The file ends after [<n>]."
   3. Rows are walked forward in file order. Before a walked row that is the first row of its
      unit, the unit marker `Page <u> begins.` is written; when the walk's first row is not
      the first row of its unit, the result starts with `Continuing page <u>.` instead (EPUB:
      "section"); a row with no unit gets no marker. Then a sent row is written as the line
      "already sent as [n]". Any other row is written as the line `[n]`, then its text, then
      an empty line, with `n` the next number (step 10); it is a requested passage, and a sent
      row from then on.
   4. Before a row is written, the result so far, that row's lines (its marker included) and
      the reserve must fit in 3,000 characters; the reserve is one newline plus the length of
      "The text continues: call get_text with after 999 for more." When they do not fit, the
      walk stops, the row and its marker are not written, and the result ends with "The text
      continues: call get_text with after <m> for more.", `m` being the number on the last
      `[n]` or "already sent as [n]" line written. A row is never cut. The walk's first row is
      always written, with its marker, even when its lines and the reserve alone exceed 3,000
      characters (a chunk size far above the default 400); the limit then applies from the
      next row.
   5. When the walk writes the file's last row, the result ends with "The file ends here."
   6. A trailing empty line is dropped before a closing note is joined with a newline of its
      own, and before the result is counted.
9. A page request is served as follows (SPEC-ADDON-183):
   1. Its arguments must be an object holding `pages`, `passages` or both as lists.
      Otherwise the result is "No page image follows: get_page_images takes a JSON object
      with pages, a list of page numbers, or passages, a list of numbers of passages you
      were given; at most 4 pages in all.", and the call is still served.
   2. The values are taken in order, `pages` first, then `passages` (a passage value stands
      for the unit of the row that number was sent for). For each value the first rule that
      applies decides it:
      1. not an integer argument: note `<value as JSON, cut to 40 characters>: not a number
         I can read`;
      2. a `passages` value that is not a given number: `[<n>]: not a passage you were
         given`;
      3. a `passages` value whose row has no unit: `[<n>]: its page is not known`;
      4. a page below 1 or above the PDF's own page count (read when it is opened, step 9.3):
         `page <p>: past the end of the document`;
      5. a page whose image was sent earlier in the question: `page <p>: already sent as
         [<k>]`;
      6. a page already taken by this call or by an earlier call of the same reply: `page
         <p>: named twice in this reply`;
      7. a fifth or later page taken by this call: `page <p>: over the limit of 4 pages for
         one call`;
      8. otherwise the page is taken.
   3. The PDF is opened from `indexed_files.file_path` when it is absolute, or from that path
      joined to `settings.drive_mounts[drive]` when it is relative. Every PyMuPDF call (open,
      page count, render) runs while holding `PYMUPDF_LOCK`, whose acquisition waits at most
      30 s from the start of the call's rendering; the PDF is opened once per page request.
      Each taken page is rendered at the scale that makes its long edge 1280 px and encoded
      as JPEG. A taken page that cannot be rendered (the file cannot be opened, the lock
      wait ran out, rendering raised) gets the note `page <p>: not available` and no number.
      When the PDF cannot be opened, rule 9.2.4 cannot be judged and every page that passed
      rules 1–3 and 5–7 is `not available`.
   4. The result is `<k> page image follows.` (k = 1) or `<k> page images follow.`, or `No
      page image follows.`, then one line `- <note>` per note, in value order. The images
      follow the reply's tool results, each preceded by its label `[<n>] page <p>`, in taken
      order, laid out per provider as `llm.py` lays out frames: one user message of
      alternating label and image parts (OpenAI-compatible), or one user message per label
      with its image (ollama).
10. Numbers of a reply are given as its calls are served: requested passages first, in call
    order and walk order, then page images, in call order and taken order; a page that is
    `not available` takes no number. So numbers run without a gap: passages `[1]`–`[P]`,
    then each reply's requested passages, then its page images.
11. On an answer of the path (a reply written as the answer, or the final request's), the
    `citations` event maps each number the answer names to what it was sent with: a passage
    or requested passage to its row's position (`{"page": p}` for a PDF, `{"section": s,
    "title": t}` for an EPUB, as SPEC-ADDON-053 gives passages), a page image to `{"page":
    p}`. `meta` is `{"partial": <the material's partial>, "image": <image>}`, where `<image>`
    is `"attached"` when at least one page image was sent, `"unavailable"` when at least one
    page was taken and none was sent, and `"none"` otherwise. The deadline and failure ends
    (section 2) send the same `meta`. Every end reached through the fallback (answered,
    failed or deadline) sends `image` `"unavailable"` when a page was taken earlier in the
    question, since its answer is from the text alone, and `"none"` otherwise.

### 2. Failure cases

- **A profile that cannot see**: no document tool path; today's text path.
- **An EPUB whose material is not cut, and every non-document file**: unchanged.
- **A document with no indexed text**: `load_material` returns nothing, as today (404); file
  Ask is not offered for it.
- **A tool request is refused or fails, returns a reply with no call and blank text, a final
  request fails or is blank before its first `answer_chunk`, or building a tool result
  raises**: the fallback. It sends today's text request once and streams its events as
  today's text path writes them (its own `citations` over `[1]`–`[P]`), with the keep-alive of
  step 6 and the `meta` of step 11, unless the total deadline has passed. It carries no requested
  passage and no page image. A refusal never writes the vision-unsupported verdict.
- **A final request fails after its first `answer_chunk`, or the total deadline (300 s from
  the slot) passes**: `meta` (step 11), then `done` with `error: "Answer generation
  failed"`.
- **The PDF cannot be opened, a page cannot be rendered, or a long extraction holds
  `PYMUPDF_LOCK` for 30 s**: those pages are `not available` (step 9.3); the question
  continues.
- **The viewer closes the tab**: as SPEC-ADDON-116; a render in progress finishes in its
  thread and is discarded.

### 3. States

- `tool`: entered when the slot is taken (there is no preparation). A tool request is in
  flight. → `serving` when the reply holds a call of any name; → `answered` when it holds no
  call and non-blank text; → `fallback` on a refusal, a failure or a blank reply with no call.
- `serving`: the reply's calls are served (rows read, pages rendered). → `tool` while fewer
  than 3 calls have been served and less than 120 s have passed since the slot; → `final`
  otherwise; → `fallback` when building a result raises.
- `final`: the final request streams. → `answered`; → `fallback` on a failure or a blank
  answer before its first `answer_chunk`; → `failed` on a failure after it.
- `fallback`: today's text request, once. → `answered` or `failed`.
- Any state → `failed` when the total deadline passes.
- Not allowed: `final` → `tool`; a second `fallback`; `serving` once 3 calls have been
  served; any request after `answered` or `failed`.

Nothing is kept between questions.

### 4. Data read and written

- Read: the rows and `document_sections` titles `load_material` already reads;
  `pdf_markdown.page_count` (new); the PDF file itself for page images.
- Written: nothing. Page images are not cached or stored. No question, answer, tool argument,
  requested text or image is logged.

### 5. External services

The routed profile's model. At most 3 tool requests, 1 final request and 1 fallback per
question, as on the video path. A slow provider is bounded by the 120 s window and 300 s
deadline; a refusal is answered by the fallback.

### 6. Authorization

Unchanged. Requested passages are rows of the requested file and page images are pages of
that file, from material the file Ask route's checks admitted (`X-Lit-Drive`,
`drive_access`, the active `indexed_files` row of the request drive, the `rag` feature).

### 7. Effect on existing features

- File Ask on a PDF, or a cut EPUB, with a profile that can see is answered on the new path:
  by the profile's `vision_model` rather than its `model`, with thinking on (ollama) and the
  tool token limits, with tool replies buffered. This applies even when the model calls no
  tool. In production every profile's `vision_model` is its `model`. A vision model that
  refuses tools pays one refused request on every such question before the fallback. The
  human accepted both.
- Today's text path and its prompts are unchanged; the fallback sends exactly today's text
  request.
- The video frames path and its texts (`_tool_plan`, `_limit_text`, `_bad_call_text`, its
  log lines) are unchanged byte for byte. Pictures, audio, other documents (Word, plain
  text, Markdown), profiles that cannot see, the normal Ask and the MCP tools: unchanged.
- `PYMUPDF_LOCK` is now also taken at question time, by one page request at a time, waiting
  at most 30 s.
- The Ask slot is held at most 300 s, as on the video path.

### 8. Error behavior

For the viewer: an answer, or "Answer generation failed" as today; `meta.image`
`"unavailable"` shows the existing "the image could not be used" line. Logging, each line
once where stated:

- `document_tool_fallback (file <id>)` when the fallback is sent.
- `document_tool_deadline (file <id>)` when the total deadline passes.
- `file question document tools failed: <exception class> (file <id>)` when a tool request
  fails or building a tool result raises.
- `file question failed: <exception class> (file <id>)` when a final request fails after its
  first `answer_chunk`, and `file question failed: EmptyAnswer (file <id>)` when the fallback
  is taken for a blank reply or a blank final answer.
- `page_image_failed: <exception class, or lock_timeout> (file <id>)` once per page that is
  `not available`.
- Once per question that served a tool call: `document tool requests: <a> text calls, <b>
  passages, <c> page calls, <d> pages (file <id>)`, where `a` and `c` count served calls
  named `get_text` and `get_page_images` (bad arguments included), and `b` and `d` the
  requested passages and page images sent.

### 9. User-visible behavior

- On a PDF and on a cut EPUB, an answer can cite passages beyond those first sent; their
  pills open the page or section, as passage pills do. A cited page image opens its page.
- Every PDF question, and every cut EPUB question, on a profile that can see shows its
  answer at once rather than token by token unless the model makes a call, and a call adds
  a model round (seconds to tens of seconds).
- The "read part of the file" notice stays as today: `partial` is the material's.
- `docs/user-guide/search.md` says that on a PDF the model can look at pages, and on a long
  PDF or EPUB it can read more of the text, in at most 3 looks or reads.
- R-5 runs on the local stack with a profile that can see (the gemma4:e4b profile, and the
  profile `rag` routes to), each question three times:
  1. a long EPUB, a question whose answer lies in a named chapter within about 7,000
     characters of that chapter's start, which the first passages do not reach;
  2. the same EPUB, a question asking what follows a fact the passages hold;
  3. a long PDF, "p. <n> には何が書いてある？" for a page the passages do not reach;
  4. a PDF with a figure or table, a question about the figure.
  Expected: 1–3 call `get_text` and answer from the requested passages with their
  citations, and 3 describes page n and not the next page; 4 calls `get_page_images` and its
  answer cites the page image. A run where the model does not call the tool is reported with
  the answer and recorded as a limit of the model (SPEC-ADDON-174's R-5 saw gemma call the
  tool when the question named a place, not when it had to search the contents). A pill
  that opens a page other than the one its sentence speaks of is a failure.

### 10. Non-functional

- At most 3 tool calls per question. A text result is at most 3,000 characters; a page call
  adds at most 4 images of at most 1280 px on the long edge. Nothing after 300 s from the
  slot.
- About 20% of a text result is text the previous row already carried (the chunk overlap).
  It is sent as stored.
- Context on the production gemma4:e4b (32,768; figures of SPEC-ADDON-174): passages and
  history 16,000 Japanese characters (9,200 tokens), contents 40 lines of up to about 200
  characters (about 4,600), system prompt and tool definitions (about 1,500), 3 calls of
  either kind (at most 3 × 1,800 = 5,400), earlier replies (about 1,300) and `num_predict`
  8,192: about 30,200. No initial images are sent.
- Privacy and cost: the requested text is the file's own indexed text, and page images are
  pictures of the file's own pages, sent to the same resolved profile under `llm_cloud`, as
  the passages and a picture are. `docs/addons/intelligence.md` says page images are sent.

## Touch points

- `addons/intelligence/app/routers/rag.py`: `_file_question_stream` (the new branch), a
  document tool loop beside `_frame_tool_answer`, serving `get_text` and `get_page_images`,
  their result texts, numbering, citations, `meta`, the fallback to today's text request and
  the log lines. The video path's functions and texts are not changed.
- `addons/intelligence/app/rag/file_question.py`: `Material` and `load_material` (a
  document's rows with units and sent numbers, page count, section range), the contents,
  page rendering.
- `addons/intelligence/app/rag/prompt.py`: `GET_TEXT_TOOL` (PDF and EPUB forms),
  `GET_PAGE_IMAGES_TOOL`, the system and user prompt builders' document flags.
- `addons/intelligence/app/prompts/rag/file_question_system.jinja2`,
  `addons/intelligence/app/prompts/rag/file_question_user.jinja2`
- `addons/intelligence/app/llm.py`: read only; `reply_with_frames` and `stream_with_frames`
  are called with no initial frame and the document's rounds.
- `addons/intelligence/app/extractors/pdf.py`: `PYMUPDF_LOCK`, read only.
- `addons/intelligence/app/config.py`: `settings.drive_mounts`, read only.
- `addons/intelligence/tests/`: acceptance tests for this spec, and
  `tests/test_spec_addon_179_181_every_path.py` gains the document tool path in its registry.
  These existing files ask about a PDF or EPUB with a profile that can see and change to pin
  today's text path with a profile that cannot see, or the new path, without weakening what
  they check: `tests/test_file_question.py`, `tests/test_spec_addon_072_position.py`,
  `tests/test_spec_addon_179_file_block.py`, `tests/file_question_doubles.py`,
  `tests/file_question_vision_doubles.py` (`seed_document`), `tests/file_context_doubles.py`
  (`passages_only`, with `tests/test_spec_addon_180_image_and_passages.py` and
  `tests/golden_prompts/file_question_today_passages-only.json`, which keep today's text path
  through a profile that cannot see so the golden is unchanged),
  `tests/test_spec_addon_071_image_stream.py` (`test_a_pdf_gets_no_image` pins today's path
  with a profile that cannot see), and
  `tests/test_spec_addon_116_frame_request_fallback.py` (its `document` subject moves to a
  Word or text file, which keeps "never offered the tool" true).
- Tables read: `indexed_files`, `fts_text_content`, `document_sections`, `pdf_markdown`.
- The addon files above are committed in the intelligence addon repository; in the core
  repository the `addons/intelligence` gitlink moves to the merged addon commit.
- `docs/addons/intelligence.md`, `docs/reference/api.md` (the file ask row),
  `docs/user-guide/search.md`
- `docs/specs/INDEX.md`
- Rules passed through: `.claude/rules/design-decisions.md` (LLM features: every call through
  `resolve(drive, feature)`, `llm_cloud`); `.claude/rules/backend-conventions.md` (no
  language-dependent rules).

## Invariants

I1. (SPEC-ADDON-182) The document tool path is taken exactly when the profile can see and the file is a PDF, or an EPUB with cut material; it offers `get_text` exactly when the material is cut and `get_page_images` exactly when the file is a PDF, `get_text` first; every other question, and every video question, sends today's requests unchanged.
I2. (SPEC-ADDON-182) At most 3 tool calls per question are served, of any names together; a request is the final request once 3 have been served or 120 s have passed since the slot, it offers no callable tool, nothing is sent after 300 s from the slot, and no text of a tool request's reply is written before that reply is complete and known to hold no call.
I3. (SPEC-ADDON-182) A text result sends only whole rows of the requested file, walking forward in file order from its start; it never sends a sent row's text again (it names it "already sent as [n]"); with its markers and closing note it is at most 3,000 characters unless its first row alone exceeds that; and when it stops for the limit its note names the number of its last numbered line, so a text request with `after` that number continues with the next row.
I4. (SPEC-ADDON-182) Numbers run without a gap: passages `[1]`–`[P]`, then for each reply its requested passages, then its page images; every `citations` entry of an answer of the path names a number that was sent, with the row's position for a passage or requested passage and `{"page": p}` for a page image, and no other number appears; `meta.image` is `attached` when a page image was sent and the answer is not the fallback's, `unavailable` when a page was taken and either none was sent or the answer is the fallback's, and `none` otherwise.
I5. (SPEC-ADDON-182) Every line the prompt or a tool result writes itself that names a page or section carries no bracketed number, except the page-image label `[n] page p` and the note `page <p>: already sent as [<k>]`; every row a text result writes after a unit change is preceded by that unit's marker; contents have at most 40 lines, each excerpt at most 120 characters.
I6. (SPEC-ADDON-182) A refusal, failure or blank reply of a tool request, an exception while building a tool result, or a failure or blank answer of a final request before its first `answer_chunk`, is followed by exactly one request identical to today's text request for the same question, carrying no requested passage and no image, unless the total deadline has passed; a refusal never writes the vision-unsupported verdict.
I7. (SPEC-ADDON-183) A page request sends at most 4 page images, each a page of the requested PDF within its own page count, at most 1280 px on the long edge, no page twice in one question; a `passages` value sends the page of the row that number was sent for; a page that cannot be rendered, or whose lock wait passes 30 s, takes no number and is named `not available`.
I8. (SPEC-ADDON-183) Every PyMuPDF call made to render page images runs while holding `PYMUPDF_LOCK`.
I9. (SPEC-ADDON-182) Nothing is written to any store by the document tool path, and no question, answer, tool argument, requested text or image is logged; the summary log line counts served calls by name and the passages and page images sent.

## Revises

SPEC-ADDON-114 I8. Pictures, audio, documents, a `.loft` that is not a text video, every request whose profile cannot see, the availability route, the normal Ask with its agentic loop and the MCP tools answer as they did before this change, except that a video's passages have their repeated frame-text lines removed as SPEC-ADDON-171 states, `search_exact` leaves out the frame-text hits SPEC-ADDON-173 leaves out, every file question carries the file block and rules of SPEC-ADDON-179, SPEC-ADDON-180 and SPEC-ADDON-181, and a PDF, or an EPUB with cut material, whose profile can see takes the document tool path of SPEC-ADDON-182; text-less videos differ only by the request layout of I11 and by SPEC-ADDON-116.
SPEC-ADDON-071 I1. A question's passages, picture, frames and page images come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on, and the only other text sent is the history the request carried, the file block of SPEC-ADDON-179, for a video on the path of SPEC-ADDON-116 its duration, contents, the definitions of its tools (`get_frames`, and `get_transcript` under SPEC-ADDON-174) and the tool results, and for a document on the path of SPEC-ADDON-182 its page count or section range, contents, the definitions of `get_text` and `get_page_images` and their results, whose requested passages are rows of the same file; a picture gets at most one image of at most 1024 px on its long edge, a video gets at most 8 initial frames and 12 requested frames of at most 1280 px, and a PDF at most 12 page images of at most 1280 px, when its profile can see.
SPEC-ADDON-071 I4. The passages sent for a question are the same, by the budget and ranking of SPEC-ADDON-053, whether or not an image is attached, and the text-only retry and the SPEC-ADDON-182 fallback send those same passages and no SPEC-ADDON-174 or SPEC-ADDON-182 requested passage.
SPEC-ADDON-071 I5. The prompt mentions an image or frames, and tells the model to take exact characters from the passages when they and the image or frames differ, only when an image or frames are attached, apart from S179 of SPEC-ADDON-179 and S181a of SPEC-ADDON-181, which name the image and frames on every path, the `Type:` line of SPEC-ADDON-179's file block, which carries a picture's MIME type, and the document tool path of SPEC-ADDON-182, whose prompt names page images and their rule whenever `get_page_images` is offered; it states a position only when `position_seconds` was sent for a video or audio file.
SPEC-ADDON-053 I1. The LLM receives passages, and for a picture one image, for a video with a profile that can see up to 8 frames plus up to 12 frames it requests (a `.loft` with a text chunk that is not a text video gets no image: its attempt ends in `"unavailable"`), for a PDF with a profile that can see up to 12 page images it requests under SPEC-ADDON-183, and on the document tool path of SPEC-ADDON-182 the requested passages it reads, of the requested file only, and only when the file is an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on.
SPEC-ADDON-053 I2. When the file's chunk text, after a video's repeated frame-text lines are removed as SPEC-ADDON-171 states, totals at most the passage budget (`rag.file_question_max_chars` minus the characters of the history turns sent), all chunks are sent in file order and `partial` is false; otherwise the passages total at most the passage budget, chosen by the ranking and fitting rule of 053 step 4 with the ranking text of SPEC-ADDON-081 step 5, sent in file order, and `partial` is true; SPEC-ADDON-174 and SPEC-ADDON-182 requested passages are not counted in that budget and are bounded by their own caps.
SPEC-ADDON-053 I3. Every entry of the `citations` event names a number that was sent: a chunk number with that chunk's position, a frame number (after the chunk numbers for a video with a text chunk, from 1 for a video with none) with that frame's time, a SPEC-ADDON-174 or SPEC-ADDON-182 requested passage's number with its row's position, or a SPEC-ADDON-183 page image's number with `{"page": p}`; a number that was not sent never appears.
SPEC-ADDON-081 I1. A file question with no `history` or an empty one sends the model the same system prompt, user prompt and chunks, ranked by the new question alone, as before SPEC-ADDON-081, with a video's repeated frame-text lines removed as SPEC-ADDON-171 states, for cut material on the tool path the system prompt and tools of SPEC-ADDON-174, on the document tool path the prompts and tools of SPEC-ADDON-182 and SPEC-ADDON-183, and on every path the file block and rules of SPEC-ADDON-179, SPEC-ADDON-180 and SPEC-ADDON-181; with history and a file over budget, ranking embeds the last `history` entry's question as sent, a newline, and the new question.
SPEC-ADDON-081 I2. For one question, the kept turns' sizes (question plus answer after marker removal and cutting) total at most half of `rag.file_question_max_chars` rounded down, turns and passages together at most `rag.file_question_max_chars` (SPEC-ADDON-174 and SPEC-ADDON-182 requested passages are bounded by their own caps), a kept turn is never older than a dropped one, and no `\[\d{1,3}\]` marker from an earlier answer reaches the model.
SPEC-ADDON-171 I3. Ask numbers the passages it sends consecutively in file order, frames follow from that count, SPEC-ADDON-174 requested passages and requested frames follow as SPEC-ADDON-174 I4 states, SPEC-ADDON-182 requested passages and SPEC-ADDON-183 page images follow as SPEC-ADDON-182 I4 states, and every `citations` entry names a number that was sent, with that passage's position.
SPEC-ADDON-179 I4. Every file-question system prompt has S179 as the first line after `Rules:`, once, and the passages-only branch's opener is the new passages-only opener of Terms; the document tool path of SPEC-ADDON-182 has its own opener, stated there.
SPEC-ADDON-179 I7. With no history, every file-question request on every path, the text-only retry included, is today's apart from the file block, S179, the new passages-only opener, S181a, S181b, S181c and, on the passages-and-image branch, S180 in place of the passages-only sentence; no request is added, and the numbers offered for citation and the rule that only they may be cited are unchanged. A question that takes the document tool path of SPEC-ADDON-182 sends the requests that spec states instead, and its fallback is this passages-only request unchanged.
SPEC-ADDON-180 I5. With an image and passages and no frames, the system prompt contains S180 in the place the passages-only sentence holds on the passages-only branch, does not contain the passages-only sentence, and still contains the image rule; the document tool path of SPEC-ADDON-182, whose page images arrive after the first request, carries its own say-so and page-image rules instead.
SPEC-ADDON-181 I6. Every file-question system prompt contains S181a, S181b then S181c, once each, immediately before the "Answer in short Markdown" line, and every "say so" rule and every rule to call `get_frames` or `get_transcript` before saying something is not shown or not said that it carried before is still there; on the document tool path of SPEC-ADDON-182 the say-so rule is that spec's "If it is still not there after that" line.

## Checked, no action

- **Addressing an EPUB by section alone.** Sections hold 18,000 characters at the median and
  121,000 at most, so three 3,000-character reads from a section's start never reach its
  middle. The human chose "start, or after a given passage, onward" with a continuation
  number. Within one question the reach is still about 7,000 new characters past a start
  point (3 calls); the passages ranked by the question are what reach deep into a section,
  and `after` extends from them.
- **Splitting sections into fixed parts.** The model would have no clue which part of a long
  section holds the answer. Rejected by the human.
- **An in-file search tool.** A different tool from the agreed range read; left for a later
  change once this one's use is seen.
- **The PDF's outline (bookmarks) as contents.** None of the 18 over-budget production PDFs
  has one (2026-11-24); page excerpts serve every PDF.
- **Profiles that cannot see.** All three production profiles can see. A text-only tool
  path needs a new tool-calling request on both clients; the human chose to offer the tools
  only to profiles that can see.
- **Answers without a tool call on the text model, streamed.** It needs a buffered first
  request and then a second, streamed one; the human accepted the vision model and buffered
  reply for every question on the path.
- **PDFs with no indexed text.** They stay outside file Ask (the human's choice); making them
  askable by page images alone changes availability and the 409 rules.
- **Attaching the page the viewer has open up front.** Left out by the human; the tool is
  tried first.
- **Page images only on cut PDFs.** The human chose every PDF, accepting that every PDF
  answer appears at once rather than streaming.
- **Writing each passage's page in the prompt.** A page number beside a citation number is
  the pairing SPEC-ADDON-114 I11 keeps out because gemma confuses them; `after` and
  `passages` let the model name a place by the number it already has. Unit markers in a text
  result stand on their own lines with no number, and R-5 checks the pairing.
- **The prompt's page count for a PDF over 500 pages.** `pdf_markdown.page_count` is capped
  at `MAX_PAGES` (500) by extraction; the prompt then understates, but a page image is judged
  against the PDF's own count. The largest production PDF has 422 pages.
- **Removing the 80-character chunk overlap from text results.** It would change what a
  cited row holds; the 3,000-character cap and the 3-call limit already bound the cost.
- **A larger per-call text limit for documents.** The human kept the limits of
  `get_transcript`; 6,000 characters per call would come to about 34,000 tokens on the
  production gemma, over its 32,768.
- **Reading backwards from a passage.** The page or section start before it can be named
  directly; a "before" argument doubles the tool surface.
- **SPEC-ADDON-174 I1, I8 and I9.** They speak of the video frames path, whose tool requests
  offer `get_frames` and `get_transcript` (SPEC-ADDON-174 normal flow 2); a cut PDF or EPUB
  never reaches that path, and the document tool path states its own prompt rules and log
  line here.
- **SPEC-ADDON-179 I1.** The document tool path starts its user prompt with the file block.
- **SPEC-ADDON-071 I3 (`meta.image`).** Held: `attached` when a page image was sent and
  answered with, `unavailable` when pages were taken and none could be sent or the provider's
  refusal sent the question to the text-only fallback, so the viewer sees the existing notice.
- **A dedicated invariant for the keep-alive interval and the exact prompt lines.** They are
  required items above and are checked by the acceptance tests; the invariants keep the
  properties a mutation would break silently.
- **The normal (cross-file) Ask and the MCP tools.** Not built from one file's material.
