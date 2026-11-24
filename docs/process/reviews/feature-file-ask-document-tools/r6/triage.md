# Triage: r6

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:CR-1 is bucket A or BLOCKER
- open finding claude-read:CR-5 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/app/prompts/rag/file_question_system.jinja2 — full: Every changed hunk read in the diff.
- addons/intelligence/app/prompts/rag/file_question_user.jinja2 — full: Every changed hunk read in the diff.
- addons/intelligence/app/rag/file_question.py — partial: Diff hunks, plus lines 380-800 (load_material, _document_material, _unit), 1352-1515 (citations, _fit, _document_position) and the PageImages class from the worktree.
- addons/intelligence/app/rag/prompt.py — full: Every changed hunk read in the diff.
- addons/intelligence/app/routers/rag.py — partial: Every diff hunk, plus _text_question_stream (549-725), constants (728-760), _keepalive_answer, _until_done, _call_arguments and _answer_with_keepalive from the worktree.

Test files:
- addons/intelligence/tests/document_tool_doubles.py — full: Read in the diff.
- addons/intelligence/tests/file_context_doubles.py — partial: Diff hunks and the golden loader (lines 60-176).
- addons/intelligence/tests/golden_prompts/file_question_today_document-tool.json — full: Read in the diff; the content is [].
- addons/intelligence/tests/test_spec_addon_071_image_stream.py — partial: Changed hunk only.
- addons/intelligence/tests/test_spec_addon_116_frame_request_fallback.py — partial: Changed hunk only.
- addons/intelligence/tests/test_spec_addon_179_181_every_path.py — partial: Changed hunks only.
- addons/intelligence/tests/test_spec_addon_179_file_block.py — partial: Changed hunk only.
- addons/intelligence/tests/test_spec_addon_182_document_tool_loop.py — full: Read in the diff.
- addons/intelligence/tests/test_spec_addon_182_document_tool_offer.py — full: Read in the diff.
- addons/intelligence/tests/test_spec_addon_182_get_text_results.py — full: Read in the diff.
- addons/intelligence/tests/test_spec_addon_183_page_images.py — full: Read in the diff.

## Unspecified behavior, recorded

- claude-read: When the lock cannot be retaken within the budget, the opened PDF is left to the garbage collector to close, outside PYMUPDF_LOCK.
  - F1 × I6 = 6, claude-read: A page request during a long PDF extraction can make the other PDF's extraction silently return wrong text.
  - F1 × I3 = 3, claude-verify: Only when a page request's lock wait times out while an extraction holds the lock does the PDF get finalized outside the lock; the user would at most see a rare failed extraction or a wrong render.
- claude-read: A relative stored path is resolved to its on-disk NFC/NFD spelling; an absolute one is not.
  - F1 × I3 = 3, claude-read: An absolute-path PDF with a decomposed name gets every page 'not available'.
  - F0 × I2 = 0, claude-verify: Stored absolute paths are already the on-disk spelling (config.py:1297-1299), so no ordinary condition gives the user a different result.
- claude-read: Keep-alives stop on the final request after a whitespace-only first delta, until visible text arrives.
  - F1 × I4 = 4, claude-read: A model that pauses after a leading newline can leave the line silent past a proxy timeout, and the answer fails.
  - F2 × I2 = 4, claude-verify: A model that starts its final answer with whitespace and then pauses leaves the stream silent; the user sees a brief stall, or a proxy timeout only if the pause is long.
- claude-read: A PDF whose rows store no readable page gets contents lines that are ranges only, and get_text by page answers 'Nothing is written from page N on.' although text exists.
  - F1 × I3 = 3, claude-read: For such a PDF, the model can read more only through `after`.
  - F2 × I5 = 10, claude-verify: For a PDF whose indexed rows carry no page, the contents show bare page ranges and get_text by page says nothing is written, so the model cannot read further text and the user gets a weaker answer.
- claude-read: EPUB section titles enter the contents with their bracketed numbers and line breaks kept.
  - F1 × I3 = 3, claude-read: A title like '[1] Intro' places a citation-like number beside a section.
  - F1 × I3 = 3, claude-verify: An EPUB whose section title holds a bracketed number or a line break puts it into the contents, which can mislead the model's citations or break a line; the user sees an odd citation at worst.
- claude-read: A cut PDF with neither a pdf_markdown row nor any page unit tells the model 'a page number from 1 to 0' and states no page count.
  - F0 × I2 = 0, claude-read: It needs rows with no page and no markdown row; the model can still use `after`.
  - F1 × I4 = 4, claude-verify: A cut PDF without a pdf_markdown row or page units gets a get_text definition reading 'from 1 to 0' and no page count, so page-based reading fails and the answer rests on passages alone.
- claude-verify: A contents group whose rows all reduce to empty text after marker removal is written as the range alone, the same as a group with no row.
  - F1 × I1 = 1, claude-verify: Rare rows made only of markers or whitespace make the contents show a bare range; the model sees no excerpt for that group.
  - single-scored

## Findings

A: 2
B: 3
C: 0

### claude-read:CR-1 — bucket A, MEDIUM, open

Claim: PageImages.close() gives up when PYMUPDF_LOCK cannot be acquired within the remaining budget and drops the open pymupdf Document, so its finalizer (fz_drop_document) runs outside the lock while another thread (the extraction holding the lock) is using MuPDF.
Impact: When a page request coincides with a long PDF extraction or page OCR (uploading or reindexing PDFs while asking), MuPDF runs from two threads at once. pdf.py:60-62 says this makes a conversion fail over to plain text or return wrong text, so the indexed text of the other PDF can be silently wrong.
Evidence: addons/intelligence/app/rag/file_question.py:1038-1051: `if not PYMUPDF_LOCK.acquire(timeout=max(0.0, self._end - time.monotonic())): return` and the comment says 'the garbage collector closes the document'. `document` is a local, so CPython drops it when close() returns, in the worker thread and without the lock. The case is reached whenever open() succeeded and an extraction took the lock afterwards: for example image() raises lock_timeout, the budget is then spent, and acquire(timeout=0) fails at once. Also file_question.py:1026-1032: `return pixmap.tobytes("jpeg")` inside `with self._locked()` releases the lock before the Page and Pixmap locals are freed, so their MuPDF drops also run unlocked on every render. page_ocr.py:158-162 already leaves `page` outside its lock, so that half of the pattern is pre-existing in the addon.
Repro: not_reproduced. Mutation view: test_every_pymupdf_call_for_a_page_image_holds_the_lock patches only Document.__init__ and Page.get_pixmap, and test_a_lock_held_past_thirty_seconds holds the lock before open(), so no Document exists and close() returns early. No test opens the document, takes the lock away and then checks close or deallocation, so a close() with no lock at all would also pass.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Wait for the lock without a timeout in close(), or hand the Document to a holder that drops it under the lock. Free page and pixmap (`del page, pixmap` after computing the bytes) before leaving the locked block.

</details>

### claude-read:CR-5 — bucket A, LOW, open

Claim: An EPUB contents line writes the stored section title cut to 60 characters with no removal of `[n]` markers or line breaks, so a title such as '[1] Introduction' puts a bracketed number on a line that names a section.
Impact: The prompt pairs a section with a passage-like number, which is the confusion I5 and SPEC-ADDON-114 I11 keep out, so the model may cite [1] for the wrong place. A title with a newline also splits a contents line.
Evidence: addons/intelligence/app/rag/file_question.py document_contents: `f"{label}: {title[:DOCUMENT_TITLE_CHARS]} — {excerpt}"`. Only the excerpt goes through _without_markers (in _document_excerpt).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Remove `[1-3 digits]` markers and collapse whitespace in the title before cutting it, as the excerpt does.

</details>

### claude-read:CR-3 — bucket B, LOW, open

Claim: page_image_path calls config.resolve_stored_path (NFC/NFD on-disk spelling) as well as joining settings.drive_mounts. config.py is listed only for `settings.drive_mounts`, and a stored absolute path is returned without that normalisation.
Impact: A PDF stored with an absolute path whose on-disk name is NFD-decomposed cannot be opened, so every page is 'not available', while the same file stored relative is found.
Evidence: addons/intelligence/app/rag/file_question.py:987-996: `if os.path.isabs(material.file_path): return material.file_path` and `return config.resolve_stored_path(config.resolve_file_path(...))`. config.py:1294 resolve_stored_path explains why the join alone is not enough.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Pass the absolute path through config.resolve_stored_path too.

</details>

### claude-read:CR-4 — bucket B, LOW, open

Claim: On the final request, once a whitespace-only first delta arrives, _answer_with_keepalive stops writing keep-alives (first=False), and the document loop holds that delta without writing an answer_chunk. The stream can then stay silent past 5 s before the first answer_chunk.
Impact: A reasoning model that emits a leading newline and then pauses can leave the SSE line silent long enough for a proxy idle timeout to close it. The viewer then sees the answer fail.
Evidence: addons/intelligence/app/routers/rag.py:2864-2875 (`first = False` after any delta; then `timeout=None`); the final branch of _document_tool_answer holds whitespace deltas (`held = [*held, delta]; if not "".join(held).strip(): continue`), so no answer_chunk and no keep-alive is written.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In the held state, read with a keep-alive timeout as well, for example by tracking 'first visible chunk written' in place of 'first delta'.

</details>

### claude-read:CR-2 — bucket B, INFO, open

Claim: The diff adds a new golden file, tests/golden_prompts/file_question_today_document-tool.json (content `[]`), that the touch-point list does not name. The only golden it names is file_question_today_passages-only.json.
Impact: No user impact. The golden is an empty placeholder because the scenario is excluded from the byte-for-byte I7 test (TODAYS_PATHS), so a reader might think a golden pins the document-tool requests when nothing does.
Evidence: diff: new file addons/intelligence/tests/golden_prompts/file_question_today_document-tool.json = `[]`; tests/file_context_doubles.py:174 `today(name)` reads `file_question_today_{name}.json`; test_spec_addon_179_181_every_path.py now parametrizes I7 over TODAYS_PATHS, which leaves out document-tool.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the empty golden if no test reads it for document-tool, or name it in the touch points.

</details>

## Not verified

- claude-read: Tests were not run; I cannot execute commands.
- claude-read: Whether pymupdf Document/Page/Pixmap finalizers call MuPDF in the installed version.
- claude-read: llm.reply_with_frames/stream_with_frames request shapes with an empty initial frame list.
- claude-read: Whether the untouched test files listed in the touch points still pass with seeing profiles on PDFs.
- claude-read: The intelligence submodule commit hash matches the reviewed worktree contents.
- claude-verify: I did not run any test or exercise PyMuPDF finalizers concurrently, so whether an unlocked drop actually corrupts an extraction is unconfirmed.
- claude-verify: I did not inspect the git diff itself to confirm the golden file is new in this commit.
- claude-verify: I did not check whether the final-request keep-alive gap can exceed a real proxy timeout.

TOTAL: 5 findings
