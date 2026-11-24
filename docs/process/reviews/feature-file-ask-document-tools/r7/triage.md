# Triage: r7

## Trajectory

This run:
- claude-read: There is one fix round since r6 (dd75388 moves the submodule to the fix commit; 99881c9 records r6). It adds the helper _contents_title, which reuses the existing marker removal; that adds no new state. It adds one branch to PageImages.close(): the early `return` that left the document to the collector becomes a deferred close on a daemon thread, which waits for the lock with no limit. It also adds the shared helper _close_locked. The record holds no earlier fix round, so no round repeats a branch an earlier one added. The close-path fix, however, has the same shape as the defect it fixes: it covers one exit (the success path and the timed-out close) and leaves a sibling exit (the render-failure traceback, CR7-1). The design is being patched path by path rather than by one structure that always drops MuPDF objects under the lock. Nothing was removed apart from the early return.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:CR7-1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/app/prompts/rag/file_question_system.jinja2 — full: Every changed hunk read in the diff.
- addons/intelligence/app/prompts/rag/file_question_user.jinja2 — full: Every changed hunk read in the diff.
- addons/intelligence/app/rag/file_question.py — partial: All diff hunks, plus worktree lines 430-730 (_without_markers, load_material, _document_material, _unit), 920-1090 (document_contents, _contents_title, page_image_path, _close_locked, PageImages) and 1380-1537 (citations_from, _fit, _document_position).
- addons/intelligence/app/rag/prompt.py — full: Every changed hunk read in the diff.
- addons/intelligence/app/routers/rag.py — partial: Every diff hunk, including all new functions (_document_tool_answer through _document_fallback_answer); the enclosing _file_question_stream and the shared helpers (_answer_with_keepalive, _until_done, _call_arguments) were not re-read this round.

Test files:
- addons/intelligence/tests/document_tool_doubles.py — full: Read in the diff.
- addons/intelligence/tests/file_context_doubles.py — partial: Diff hunks only.
- addons/intelligence/tests/golden_prompts/file_question_today_document-tool.json — full: Read in the diff; the content is [].
- addons/intelligence/tests/test_spec_addon_071_image_stream.py — partial: Changed hunk only.
- addons/intelligence/tests/test_spec_addon_116_frame_request_fallback.py — partial: Changed hunk only.
- addons/intelligence/tests/test_spec_addon_179_181_every_path.py — partial: Changed hunks only.
- addons/intelligence/tests/test_spec_addon_179_file_block.py — partial: Changed hunk only.
- addons/intelligence/tests/test_spec_addon_182_183_document_hygiene.py — full: New file, read whole in the diff.
- addons/intelligence/tests/test_spec_addon_182_document_tool_loop.py — full: Read in the diff.
- addons/intelligence/tests/test_spec_addon_182_document_tool_offer.py — full: Read in the diff.
- addons/intelligence/tests/test_spec_addon_182_get_text_results.py — full: Read in the diff.
- addons/intelligence/tests/test_spec_addon_183_page_images.py — full: Read in the diff.

## Unspecified behavior, recorded

- claude-read: When a page request's lock budget has run out, its PDF is closed by a daemon thread that waits for PYMUPDF_LOCK with no time limit, keeping the file open until the extraction holding the lock finishes.
  - F1 × I2 = 2, claude-read: Asking about PDF pages during a long extraction leaves one waiting thread and one open file per such request until the extraction ends; the user sees nothing.
  - F1 × I1 = 1, claude-verify: It happens only when a page request runs out of its 30 s lock budget during a long PDF extraction, and the only effect is a file handle that a background thread keeps open until the extraction finishes; the user sees nothing.
- claude-read: A section title cut to 60 characters after whitespace collapse may end in a space, which gives the contents line a double space before ' — '.
  - F1 × I1 = 1, claude-read: An EPUB title whose 60th character is a space adds one stray space to a prompt line; it is invisible to the user.
  - F2 × I1 = 2, claude-verify: An EPUB or PDF section title longer than 60 characters with a space at the cut point gives a contents line with a double space before ' — '; only the model sees it, and nothing changes for the user.
- claude-read: A title that is only markers or whitespace becomes None, and its contents line is written without a title, like a section with no stored title.
  - F0 × I1 = 0, claude-read: Needs a stored title made only of bracketed numbers; the model sees no title for that section.
  - F0 × I1 = 0, claude-verify: A stored title made only of citation-like markers or whitespace hardly ever occurs in real documents, and the line simply reads like an untitled section.

## Findings

A: 1
B: 1
C: 0

### claude-read:CR7-1 — bucket A, LOW, open

Claim: When rendering a page raises, PageImages.image() leaves the Page (and any Pixmap) alive in the traceback frame. They are freed when the caller's except block ends, after the lock was released, so their MuPDF finalizers run without PYMUPDF_LOCK.
Impact: A page that fails to render while an extraction or page OCR is running on another thread can make MuPDF run on two threads at once. pdf.py:60-62 says the other conversion can then fail over or return wrong text. This only happens on a render failure, which is rare.
Evidence: file_question.py:1045-1057: the `del pixmap, page` added in r7 runs only on the success path. If `page.get_pixmap(...)` or `pixmap.tobytes(...)` raises, the exception leaves `with self._locked()` (the lock is released at 1083) while `page` is still a local of the frame the traceback references. rag.py `_serve_page_request` handles it in `except Exception as exc: unavailable(page, type(exc).__name__)`; the frame, and with it `page`, is freed when `exc` is unbound at the end of that block, outside the lock. test_a_page_that_fails_to_render_takes_no_number_and_the_others_close_up exercises this path (get_pixmap raises RuntimeError) but never checks the lock.
Repro: not_reproduced. A mutation view: removing the r7 `del pixmap, page` line also survives every test, because no test records whether the lock is held when a Page or Pixmap is deallocated.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Wrap the body in try/finally inside the locked block (`page = pixmap = None` up front, `finally: del pixmap, page`) so both are dropped under the lock on every path.

</details>

### claude-read:CR7-2 — bucket B, INFO, open

Claim: _close_locked's `del document` does not drop the last reference to the Document. In the acquired branch, close()'s own local `document` keeps it alive until close() returns, after the lock was released. In the thread branch, Thread._args keeps it alive until run() finishes, also after the release. The Document's deallocation therefore always runs outside the lock, despite the docstring 'then drop it'.
Impact: After document.close() this is probably harmless, if a closed Document's dealloc no longer calls MuPDF. Still, the code and its comment claim a property ('dropped under the lock') that does not hold, and a later change could rely on it.
Evidence: file_question.py:1005-1013 (`document.close(); del document` deletes only the parameter binding); 1060-1067 (the caller's local `document` stays bound across `_close_locked(document, acquired=True)`); 1070-1072 (`threading.Thread(target=_close_locked, args=(document,))`, and CPython's Thread.run deletes `_target`/`_args` in its own finally, after the target returns). The hygiene test checks only that `Document.close` ran with the lock held, not the deallocation.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the ineffective `del document` and the 'then drop it' wording, or hand the only reference over (for example, pop it from a one-element list inside the locked block).

</details>

## Not verified

- claude-read: No tests run; I cannot execute commands.
- claude-read: Whether PyMuPDF's Page, Pixmap and closed-Document finalizers in the installed version call into MuPDF, which decides whether CR7-1 and CR7-2 matter in practice.
- claude-read: rag.py beyond the diff hunks was not re-read this round; it was unchanged by the r7 fix commit.
- claude-read: Untouched touch-point test files (test_file_question.py, test_spec_addon_072_position.py, file_question_doubles.py, file_question_vision_doubles.py) were not opened.
- claude-verify: Whether the installed PyMuPDF version's Page, Pixmap or Document __del__ actually call into MuPDF, or are no-ops after close.
- claude-verify: No code was run; the reference lifetimes were traced by reading the code and from CPython semantics (implicit del of the except variable, Thread.run's finally).
- claude-verify: Other invariants (I1-I7, I9) were not re-reviewed.

TOTAL: 2 findings
