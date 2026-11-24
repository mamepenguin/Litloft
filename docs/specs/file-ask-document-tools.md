# File Ask on a PDF or EPUB lets the model read more of its text and look at PDF pages

SPEC-ID: SPEC-ADDON-182
SPEC-ID: SPEC-ADDON-183

Approval:

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
  passages; a part it already has is named by its number. A result cut by the limit ends with
  the passage number to continue after, so repeated calls can reach every row of the file.
  The prompt carries the file's page or section count and, when cut, a table of contents.
- **SPEC-ADDON-183**: `get_page_images`, offered on every PDF question. The model names pages,
  or passages whose pages it wants, and gets images of up to 4 pages per call, numbered and
  citable, a cited page image jumping to its page.

Calls of both tools share a limit of 3 per question, with the 120 s window and 300 s
deadline of SPEC-ADDON-116. It is for the viewer asking about a long document or about what
a PDF page shows.

## Terms

- **Document**: a file whose `mime_type` is `application/pdf` (a PDF) or
  `application/epub+zip` (an EPUB).
- **Unit**: a PDF's page, or an EPUB's section (the number `?section=` takes), as stored in
  `fts_text_content.page` for each of the file's rows.
- **Row**: one `fts_text_content` row of the file with non-empty text, as `load_material`
  already reads them; **file order** is `chunk_index` order. Rows are chunks of at most 400
  characters, and consecutive rows share up to 80 characters (`TextChunkingConfig`).
- **Cut material** and **sent row**: as SPEC-ADDON-174. A row sent cut short by fitting is a
  sent row; its remainder is not available.
- **Given number**: a number the question has sent for a passage: an initial passage, or a
  requested passage. A page image's number is not a given number.
- **Page count** (PDF): `pdf_markdown.page_count` for the file when that row exists,
  otherwise the largest page among its rows. **Section range** (EPUB): from the smallest to
  the largest section among its rows.
- **Document tool path**: the path of normal flow step 2, taken when the profile can see
  (`profile_can_see`) and the file is a PDF, or an EPUB whose material is cut.
- **Text request**: one tool call named `get_text`. **Page request**: one tool call named
  `get_page_images`. **Tool call**: either.
- **Requested passage**: a row sent in reply to a text request. **Page image**: one image of
  one PDF page, sent in reply to a page request.
- **Contents**: lines that list the file's units, each with the start of what it says; built
  only for cut material (step 3).

## Required items

### 1. Normal flow

1. The viewer asks about a document. `load_material` reads the material as today. For a
   document it also keeps every row in file order with its unit and, for each sent row, its
   number, plus the page count (PDF) or the section range (EPUB).
2. `_file_question_stream` takes the document tool path when its Terms condition holds. A
   text video takes the frames path as today; every other file, and a document whose
   condition does not hold, takes today's text path. The tools offered:
   - PDF, material cut: `get_text`, then `get_page_images`.
   - PDF, material not cut: `get_page_images`.
   - EPUB, material cut: `get_text`.
3. The user prompt is today's passages-only prompt (file block, history, question, numbered
   passages), followed by:
   - PDF: `The document has <N> pages.` EPUB: `The book has sections <a> to <b>.`
   - When the material is cut, the contents, under the line `Contents, each with the start
     of what it says:`. The units are grouped in order into at most 40 consecutive groups of
     equal size, the last group possibly smaller (`ceil(units / 40)` per group; PDF units are
     pages 1 to N, EPUB units are the sections that have a row). Each group is one line:
     `Page <p>: <excerpt>` or `Pages <p>–<q>: <excerpt>` for a PDF; `Section <s>: <title> —
     <excerpt>` or `Sections <s>–<t>: <title> — <excerpt>` for an EPUB, where `<title>` is
     the stored title of the group's first section and is left out with its ` — ` when there
     is none. The excerpt is the group's rows in file order, citation markers removed,
     whitespace collapsed to single spaces, joined with spaces and cut to 120 characters, as
     `video_contents` makes its excerpts. A group with no row has no excerpt and no `: `.
   No number of a passage is written beside a page or section anywhere in the prompt.
4. The system prompt of the document tool path:
   - The opener: "You answer a question about a single file, using the numbered passages
     below{, the numbered passages get_text returns}{ and the numbered page images
     get_page_images returns} and the File, Type and Folder lines.", each braced part present
     when that tool is offered. With history, the sentence on what may be cited names the
     same numbered items.
   - S179 as the first rule, as SPEC-ADDON-179 states.
   - "- The passages below are {part of the file's text, the parts closest to the question
     | the file's text}." (the first when cut).
   - The passages-only citation rules of today (introduced by their number, cite inline as
     [n], cite only numbers given), with "the passages" read as "the passages and page
     images" when `get_page_images` is offered.
   - When `get_text` is offered: "- If the answer may be in a part of the file the passages
     do not include, you must call get_text for that part before answering. Never say that
     something is not in the file unless you have called get_text for the part where it
     would be."
   - When `get_page_images` is offered: "- If the answer depends on what a page shows (a
     figure, a table, the layout, a scanned page), call get_page_images for that page. Where
     a page image and a passage differ, take exact characters from the passage."
   - "- If it is still not there after that, say so plainly instead of guessing."
   - S181a, S181b, S181c, the Markdown and HTML lines and the language line, as on every path.
   - Then a section titled "More of the file:", line for line:
     - when cut: "- The passages are part of the file's text, not all of it.";
     - PDF, cut: "- The tool get_text returns the file's text from a page you name, or from
       just after a numbered passage you name, onward, up to 3,000 characters per call; a
       part you already have is named by its number instead." EPUB: the same with "a
       section you name" in place of "a page you name";
     - when cut: "- When a result says the text continues, call get_text again from where it
       says for more.";
     - PDF: "- The tool get_page_images returns images of the pages you name, or of the
       pages numbered passages are on: up to 4 pages per call.";
     - "- You may make at most 3 calls {of get_text and get_page_images together} for this
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
6. Requests are those of SPEC-ADDON-116's tool loop, with no initial image: each tool
   request is read to its end before anything is written; a reply with no tool call is
   written as the answer, in one `answer_chunk`; once 3 tool calls have been served or
   120 s have passed since the slot was taken, the next request is the final request,
   listing the same tools with `tool_choice` `"none"` (OpenAI-compatible) or no tools
   (ollama), and its answer streams. Requests go to the profile's `vision_model` through the
   frame-request calls, with thinking on and the tool `num_predict` for ollama, as
   SPEC-ADDON-116 sends them. Until the first `answer_chunk` the stream writes `: keepalive`
   at least every 5 s.
7. Tool calls of a reply are handled in the order given. The first 3 tool calls of the
   question, of either name, are served; each call after them gets "Nothing follows: this
   question has already been served its 3 tool calls."
8. A text request is served as follows (SPEC-ADDON-182):
   1. Its arguments must be an object with exactly one of `page` (PDF) or `section` (EPUB),
      an integer within the page count or the section range, and `after`, a given number.
      Otherwise the result is "No text follows: get_text takes a JSON object with either
      page, a page number from 1 to <N>, or after, the number of a passage you were
      given." (EPUB: "section, a section number from <a> to <b>"), and the call counts as
      served.
   2. The walk starts at the first row in file order whose unit is at least the named one,
      or at the row after the one the given number was sent for. When there is no such row,
      the result is "Nothing is written from page <u> on." (EPUB: "section <u>") or "The file
      ends after [<n>]."
   3. Rows are walked forward in file order. A sent row is written as the line "already sent
      as [n]". Any other row is written as the line `[n]`, then its text, then an empty line,
      with `n` the next number (step 10); it is a requested passage, and a sent row from then
      on.
   4. Before a row is written, the result so far, that row's lines and the longer of the two
      closing notes (a 3-digit number in each) must fit in 3,000 characters. When they do
      not, the walk stops, the row is not written, and the result ends with "The text
      continues: call get_text with after <m> for more.", `m` being the number on the last
      line written. A row is never cut.
   5. When the walk passes the file's last row, the result ends with "The file ends here."
   6. The empty line after the last row is dropped before a closing note is joined with a
      newline of its own, and before the result is counted.
9. A page request is served as follows (SPEC-ADDON-183):
   1. Its arguments must be an object with `pages`, `passages` or both, each a list.
      Otherwise the result is "No page image follows: get_page_images takes a JSON object
      with pages, a list of page numbers, or passages, a list of numbers of passages you
      were given; at most 4 pages in all.", and the call counts as served.
   2. The wanted pages are the `pages` values, then the pages of the `passages` values (the
      unit of the row each was sent for), in the order given. A value is not used, with a
      note, when it is not an integer (`<value>: not a page number I can read`), a `passages`
      value that is not a given number (`[<n>]: not a passage you were given`), a page
      outside 1 to the page count (`page <p>: past the end of the document`), a page whose
      image was already sent (`page <p>: already sent as [<k>]`), a page already wanted by
      this call (`page <p>: named twice in this call`), or a fifth or later page (`page <p>:
      over the limit of 4 pages for one call`).
   3. Each used page is rendered with PyMuPDF, holding `PYMUPDF_LOCK`, at the scale that makes
      its long edge 1280 px, and encoded as JPEG. A page that cannot be rendered, or whose
      lock is not taken within 30 s of the call's rendering starting, gets the note
      `page <p>: not available` and no number.
   4. The result is "<k> page image(s) follow." (`1 page image follows.`, `2 page images
      follow.`), or "No page image follows.", then one line `- <note>` per note. The images
      follow in a user message after the reply's tool results, each introduced by the label
      `[<n>] page <p>`, in the order the pages were wanted.
10. Numbers of a reply are given as its calls are served: requested passages first, in call
    order and file order, then page images, in call order and wanted order; a page that fails
    takes no number. So numbers run without a gap: passages `[1]`–`[P]`, then each reply's
    requested passages, then its page images.
11. `citations` maps each number the answer names to what it was sent with: a requested
    passage to its row's position (`{"page": p}` for a PDF, `{"section": s, "title": t}` for
    an EPUB, as a passage), a page image to `{"page": p}`. `meta` is `{"partial": <the
    material's partial>, "image": <"attached" when at least one page image was sent, else
    "none">}`; a page that could not be rendered does not make it `"unavailable"`, because
    the answer is still from everything the model asked for that could be sent.

### 2. Failure cases

- **A profile that cannot see**: no document tool path; today's text path.
- **An EPUB whose material is not cut, and every non-document file**: unchanged.
- **A call named neither offered tool**: "Nothing follows: <name> cannot be served. Only
  <the offered tools, joined with " and "> are available.", with "this call" in place of
  `<name>` when the name is empty; it counts as served.
- **A tool request, or a final request before its first `answer_chunk`, is refused, fails,
  or returns neither text nor a call; or building a tool result raises**: the request of
  today's text path for the same question (passages, no image, no tool) is sent once, its
  answer streamed, unless the total deadline has passed. It carries no requested passage and
  no page image.
- **A final request fails after its first `answer_chunk`, or the total deadline (300 s from
  the slot) passes**: `meta`, then `done` with `error: "Answer generation failed"`.
- **The PDF cannot be opened or a page cannot be rendered**: that page is `not available`
  (step 9.3); the question continues.
- **A long extraction holds `PYMUPDF_LOCK`**: pages of that call wait at most 30 s, then are
  `not available`.
- **The viewer closes the tab**: as SPEC-ADDON-116; a render in progress finishes in its
  thread and is discarded.

### 3. States

The states of SPEC-ADDON-116's tool loop, with `cutting` read as `serving` ("serving the
tool calls of a reply", rendering pages and reading rows) and no frame preparation before
the first request. Nothing is kept between questions.

### 4. Data read and written

- Read: the rows and `document_sections` titles `load_material` already reads;
  `pdf_markdown.page_count` (new); the PDF file itself, through the drive mount, for page
  images.
- Written: nothing. Page images are not cached or stored. No question, answer, tool argument,
  requested text or image is logged.

### 5. External services

The routed profile's model. At most 3 tool requests, 1 final request and 1 fallback per
question, as on the video path. A slow provider is bounded by the 120 s window and 300 s
deadline; a refusal is answered by the fallback.

### 6. Authorization

Unchanged. Requested passages are rows of the requested file and page images are pages of
that file, from material the file Ask route's checks admitted (`X-Lit-Drive`,
`drive_access`, the active `indexed_files` row of the request drive, the `rag` feature). The
PDF path is resolved from that row and the drive's mount, as page OCR resolves it.

### 7. Effect on existing features

- File Ask on a PDF, or a cut EPUB, with a profile that can see: the new path, tools,
  prompt and buffered tool replies. Its answer appears once complete when the model answers
  without a call, and streams only after the final request.
- Today's text path and its prompts are unchanged; the document tool path's fallback sends
  exactly that request.
- The video frames path, pictures, audio, other documents (Word, plain text, Markdown),
  profiles that cannot see, the normal Ask and the MCP tools: unchanged.
- `PYMUPDF_LOCK` is now also taken by question time page rendering, for at most one page at
  a time and at most 30 s of waiting per call.
- The Ask slot is held at most 300 s, as on the video path.

### 8. Error behavior

For the viewer: an answer, or "Answer generation failed" as today. Logging:

- `document_tool_fallback (file <id>)` when the fallback is sent;
  `document_tool_deadline (file <id>)` when the total deadline passes;
  `file question failed: <exception class> (file <id>)` when a request or a tool result
  fails, as the video path writes it.
- `page_image_failed: <exception class or lock_timeout> (file <id>)` once per page that is
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
  a model round (seconds to tens of seconds). This is the trade the human accepted for
  PDF page images.
- The "read part of the file" notice stays as today: `partial` is the material's.
- `docs/user-guide/search.md` says that on a PDF the model can look at pages, and on a long
  PDF or EPUB it can read more of the text, in at most 3 looks or reads.
- R-5 runs on the local stack with a profile that can see (the gemma4:e4b profile and the
  profile `rag` routes to), each question three times:
  1. a long EPUB, a question whose answer is in a section the first passages do not reach,
     naming the chapter;
  2. the same EPUB, a question asking what follows a fact the passages hold;
  3. a long PDF, "p. <n> には何が書いてある？" for a page the passages do not reach;
  4. a PDF with a figure or table, a question about the figure.
  Expected: 1–3 call `get_text` and answer from the requested passages with their
  citations; 4 calls `get_page_images` and its answer cites the page image. A run where the
  model does not call the tool is reported with the answer and recorded as a limit of the
  model (SPEC-ADDON-174's R-5 saw gemma call the tool when the question named a place and
  not when it had to search the contents). No answer pairs a page number with a citation
  number wrongly (a pill must open the page the sentence talks about).

### 10. Non-functional

- At most 3 tool calls per question. A text result is at most 3,000 characters; a page call
  adds at most 4 images of at most 1280 px on the long edge. Nothing after 300 s from the
  slot.
- About 20% of a text result is text the previous row already carried (the chunk overlap).
  It is sent as stored.
- Context on the production gemma4:e4b (32,768; figures of SPEC-ADDON-174): passages and
  history 16,000 Japanese characters (9,200 tokens), contents 40 lines of up to about 140
  characters (about 3,200), system prompt and tool definitions (about 1,500), 3 calls of
  either kind (at most 3 × 1,800 = 5,400), earlier replies (about 1,300) and `num_predict`
  8,192: about 28,800. No initial images are sent, so this is below the video worst case.
- Privacy and cost: the requested text is the file's own indexed text, and page images are
  pictures of the file's own pages, sent to the same resolved profile under `llm_cloud`, as
  the passages and a picture are. `docs/addons/intelligence.md` says page images are sent.

## Touch points

- `addons/intelligence/app/routers/rag.py`: `_file_question_stream` (the new branch), a
  document tool loop beside `_frame_tool_answer` (the request, keep-alive, deadline and
  fallback machinery shared or mirrored), serving `get_text` and `get_page_images`, the
  result texts, numbering, citations and the log lines.
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
- `addons/intelligence/app/workers/page_ocr.py`: how a PDF's path is resolved and opened,
  read only.
- `addons/intelligence/tests/` (acceptance tests for this spec). Tests that pin today's
  text path for a PDF or EPUB question with a profile that can see
  (`tests/test_spec_addon_053*`, `tests/test_spec_addon_179*`, `tests/file_question_doubles.py`)
  route such questions through a profile that cannot see, or assert the new path, without
  weakening what they check.
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

I1. (SPEC-ADDON-182) The document tool path is taken exactly when the profile can see and the file is a PDF, or an EPUB with cut material; it offers `get_text` exactly when the material is cut and `get_page_images` exactly when the file is a PDF, `get_text` first; every other question sends today's requests unchanged.
I2. (SPEC-ADDON-182) At most 3 tool calls per question are served, counting both tools together; a request is the final request once 3 have been served or 120 s have passed since the slot, it offers no callable tool, and nothing is sent after 300 s from the slot.
I3. (SPEC-ADDON-182) A text result sends only whole rows of the requested file, walking forward in file order from its start; it never sends a sent row's text again (it names it "already sent as [n]"); with its closing note it is at most 3,000 characters; and when it stops for the limit its note names the number on its last line, so a text request with `after` that number continues with the next row.
I4. (SPEC-ADDON-182) Numbers run without a gap: passages `[1]`–`[P]`, then for each reply its requested passages, then its page images; every `citations` entry names a number that was sent, with the row's position for a passage or requested passage and `{"page": p}` for a page image, and no other number appears; `meta` carries the material's `partial`, and `image` `attached` exactly when a page image was sent, otherwise `none`.
I5. (SPEC-ADDON-182) No line the prompt or a tool result writes itself pairs a page or section number with a passage number, except the page-image label `[n] page p`; contents lines carry no bracketed number.
I6. (SPEC-ADDON-182) A refusal or failure of a tool request, or of a final request before its first `answer_chunk`, is followed by exactly one request identical to today's text-path request for the same question, carrying no requested passage and no image, unless the total deadline has passed.
I7. (SPEC-ADDON-183) A page request sends at most 4 page images, each a page of the requested PDF within its page count, at most 1280 px on the long edge, none already sent for the question; a `passages` value sends the page of the row that number was sent for; a page that cannot be rendered within its 30 s lock wait takes no number and is named `not available`.
I8. (SPEC-ADDON-182) Nothing is written to any store by the document tool path, and no question, answer, tool argument, requested text or image is logged; the log line counts served calls by name and the passages and page images sent.

## Revises

SPEC-ADDON-114 I8. Pictures, audio, documents, a `.loft` that is not a text video, every request whose profile cannot see, the availability route, the normal Ask with its agentic loop and the MCP tools answer as they did before this change, except that a video's passages have their repeated frame-text lines removed as SPEC-ADDON-171 states, `search_exact` leaves out the frame-text hits SPEC-ADDON-173 leaves out, every file question carries the file block and rules of SPEC-ADDON-179, SPEC-ADDON-180 and SPEC-ADDON-181, and a PDF, or an EPUB with cut material, whose profile can see takes the document tool path of SPEC-ADDON-182; text-less videos differ only by the request layout of I11 and by SPEC-ADDON-116.
SPEC-ADDON-071 I1. A question's passages, picture, frames and page images come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on, and the only other text sent is the history the request carried, the file block of SPEC-ADDON-179, for a video on the path of SPEC-ADDON-116 its duration, contents, the definitions of its tools (`get_frames`, and `get_transcript` under SPEC-ADDON-174) and the tool results, and for a document on the path of SPEC-ADDON-182 its page count or section range, contents, the definitions of `get_text` and `get_page_images` and their results, whose requested passages are rows of the same file; a picture gets at most one image of at most 1024 px on its long edge, a video gets at most 8 initial frames and 12 requested frames of at most 1280 px, and a PDF at most 12 page images of at most 1280 px, when its profile can see.
SPEC-ADDON-071 I5. The prompt mentions an image or frames, and tells the model to take exact characters from the passages when they and the image or frames differ, only when an image or frames are attached, apart from S179 of SPEC-ADDON-179 and S181a of SPEC-ADDON-181, which name the image and frames on every path, the `Type:` line of SPEC-ADDON-179's file block, which carries a picture's MIME type, and the document tool path of SPEC-ADDON-182, whose prompt names page images and their rule whenever `get_page_images` is offered; it states a position only when `position_seconds` was sent for a video or audio file.
SPEC-ADDON-053 I1. The LLM receives passages, and for a picture one image, for a video with a profile that can see up to 8 frames plus up to 12 frames it requests (a `.loft` with a text chunk that is not a text video gets no image: its attempt ends in `"unavailable"`), for a PDF with a profile that can see up to 12 page images it requests under SPEC-ADDON-183, and on the document tool path of SPEC-ADDON-182 the requested passages it reads, of the requested file only, and only when the file is an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on.
SPEC-ADDON-053 I2. When the file's chunk text, after a video's repeated frame-text lines are removed as SPEC-ADDON-171 states, totals at most the passage budget (`rag.file_question_max_chars` minus the characters of the history turns sent), all chunks are sent in file order and `partial` is false; otherwise the passages total at most the passage budget, chosen by the ranking and fitting rule of 053 step 4 with the ranking text of SPEC-ADDON-081 step 5, sent in file order, and `partial` is true; SPEC-ADDON-174 and SPEC-ADDON-182 requested passages are not counted in that budget and are bounded by their own caps.
SPEC-ADDON-053 I3. Every entry of the `citations` event names a number that was sent: a chunk number with that chunk's position, a frame number (after the chunk numbers for a video with a text chunk, from 1 for a video with none) with that frame's time, a SPEC-ADDON-174 or SPEC-ADDON-182 requested passage's number with its row's position, or a SPEC-ADDON-183 page image's number with `{"page": p}`; a number that was not sent never appears.
SPEC-ADDON-081 I1. A file question with no `history` or an empty one sends the model the same system prompt, user prompt and chunks, ranked by the new question alone, as before SPEC-ADDON-081, with a video's repeated frame-text lines removed as SPEC-ADDON-171 states, for cut material on the tool path the system prompt and tools of SPEC-ADDON-174, on the document tool path the prompts and tools of SPEC-ADDON-182 and SPEC-ADDON-183, and on every path the file block and rules of SPEC-ADDON-179, SPEC-ADDON-180 and SPEC-ADDON-181; with history and a file over budget, ranking embeds the last `history` entry's question as sent, a newline, and the new question.
SPEC-ADDON-081 I2. For one question, the kept turns' sizes (question plus answer after marker removal and cutting) total at most half of `rag.file_question_max_chars` rounded down, turns and passages together at most `rag.file_question_max_chars` (SPEC-ADDON-174 and SPEC-ADDON-182 requested passages are bounded by their own caps), a kept turn is never older than a dropped one, and no `\[\d{1,3}\]` marker from an earlier answer reaches the model.
SPEC-ADDON-179 I7. With no history, every file-question request on every path, the text-only retry included, is today's apart from the file block, S179, the new passages-only opener, S181a, S181b, S181c and, on the passages-and-image branch, S180 in place of the passages-only sentence; no request is added, and the numbers offered for citation and the rule that only they may be cited are unchanged. A question that takes the document tool path of SPEC-ADDON-182 sends the requests that spec states instead, and its fallback is this passages-only request unchanged.

## Checked, no action

- **Addressing an EPUB by section alone.** Sections hold 18,000 characters at the median and
  121,000 at most, so three 3,000-character reads from a section's start never reach its
  middle. The human chose "start, or after a given passage, onward" with a continuation
  number, which reaches every row by chaining.
- **Splitting sections into fixed parts.** The model would have no clue which part of a long
  section holds the answer. Rejected by the human.
- **An in-file search tool.** A different tool from the agreed range read; left for a later
  change once this one's use is seen.
- **The PDF's outline (bookmarks) as contents.** None of the 18 over-budget production PDFs
  has one (2026-11-24); page excerpts serve every PDF.
- **Profiles that cannot see.** All three production profiles can see. A text-only tool
  path needs a new tool-calling request on both clients; the human chose to offer the tools
  only to profiles that can see.
- **Attaching the page the viewer has open up front.** Left out by the human; the tool is
  tried first.
- **Page images only on cut PDFs.** The human chose every PDF, accepting that every PDF
  answer appears at once rather than streaming.
- **Writing each passage's page in the prompt.** A page number beside a citation number is
  the pairing SPEC-ADDON-114 I11 keeps out because gemma confuses them; `after` and
  `passages` let the model name a place by the number it already has.
- **Removing the 80-character chunk overlap from text results.** It would change what a
  cited row holds; the 3,000-character cap and the 3-call limit already bound the cost.
- **A larger per-call text limit for documents.** The human asked for the limits of
  `get_transcript`; section 10 shows the context has room, which a later change can use.
- **Reading backwards from a passage.** The page or section start before it can be named
  directly; a "before" argument doubles the tool surface for a case the contents serve.
- **SPEC-ADDON-174 I1.** It speaks of the video frames path (its tool requests offer
  `get_frames`); a cut PDF never reaches that path, so it is not revised.
- **SPEC-ADDON-179 I1, I4 and I6.** The document tool path starts its user prompt with the
  file block, has S179 first after `Rules:`, and S181a–c immediately before the Markdown line,
  so they hold as written.
- **SPEC-ADDON-071 I3 (`meta.image`).** Kept: `attached` when a page image was sent.
- **The normal (cross-file) Ask and the MCP tools.** Not built from one file's material.
