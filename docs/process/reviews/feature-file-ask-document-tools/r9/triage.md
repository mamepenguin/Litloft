# Triage: r9

## Trajectory

This run:
- claude-read: There are four rounds. r6→r7 added state and branches to PageImages: a monotonic budget, a per-call `_locked` context manager, an explicit `del`, and a daemon-thread close through `_close_locked`. r7→r8 removed all of them and put one structure in their place: one acquire in open(), held until close(). r8→r9 (fcb2c95, submodule b367ea1→7b233ee) only removes the three imports that the r8 simplification left unused (`contextlib`, `time`, `Iterator`). It adds no branch, state or prediction, and it repeats nothing an earlier round added. The last two rounds removed code; the design is not being patched.

Earlier runs:
- r7 / claude-read: There is one fix round since r6 (dd75388 moves the submodule to the fix commit; 99881c9 records r6). It adds the helper _contents_title, which reuses the existing marker removal; that adds no new state. It adds one branch to PageImages.close(): the early `return` that left the document to the collector becomes a deferred close on a daemon thread, which waits for the lock with no limit. It also adds the shared helper _close_locked. The record holds no earlier fix round, so no round repeats a branch an earlier one added. The close-path fix, however, has the same shape as the defect it fixes: it covers one exit (the success path and the timed-out close) and leaves a sibling exit (the render-failure traceback, CR7-1). The design is being patched path by path rather than by one structure that always drops MuPDF objects under the lock. Nothing was removed apart from the early return.
- r8 / claude-read: The record has three rounds. The r6→r7 fix added state and branches to PageImages: a shared monotonic budget, a `_locked` context manager taken per call, an explicit `del pixmap, page`, and in close() a timed acquire plus a daemon-thread fallback through `_close_locked`. The r8 fix (54f131c) adds no branch, state or prediction that r7 also added. It removes all of them: `_close_locked`, the daemon thread, the `_locked` context manager, the `_end` budget and the explicit `del`. In their place is one structure: one acquire in open(), held until close() in the caller's finally, with render failures handled inside that hold. This round simplifies the design rather than patching it. Its only leftovers are three unused imports (CR8-1) and an untested deallocation (CR8-2).

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/prompts/rag/file_question_system.jinja2 — full: Read every changed hunk in the diff.
- addons/intelligence/app/prompts/rag/file_question_user.jinja2 — full: Read every changed hunk in the diff.
- addons/intelligence/app/rag/file_question.py — partial: All diff hunks, including the r9 import hunk. From the worktree: lines 1-40 (imports) and 1000-1067 (_render_page and PageImages), plus a grep for every use of the remaining imports. The rest of load_material, outside its hunks, was not re-read.
- addons/intelligence/app/rag/prompt.py — full: Read every changed hunk in the diff.
- addons/intelligence/app/routers/rag.py — partial: Read every diff hunk, which includes every new function from _document_tool_answer to _document_fallback_answer and the changed branch of _file_question_stream. The shared helpers (_until_done, _answer_with_keepalive, _call_arguments) were not re-read this round, and rag.py has no change in r9.

Test files:
- addons/intelligence/tests/document_tool_doubles.py — full: Read in the diff.
- addons/intelligence/tests/file_context_doubles.py — partial: Diff hunks only.
- addons/intelligence/tests/golden_prompts/file_question_today_document-tool.json — full: Read in the diff; its content is [].
- addons/intelligence/tests/test_spec_addon_071_image_stream.py — partial: The changed hunk only.
- addons/intelligence/tests/test_spec_addon_116_frame_request_fallback.py — partial: The changed hunk only.
- addons/intelligence/tests/test_spec_addon_179_181_every_path.py — partial: Changed hunks only.
- addons/intelligence/tests/test_spec_addon_179_file_block.py — partial: The changed hunk only.
- addons/intelligence/tests/test_spec_addon_182_183_document_hygiene.py — full: New file, read whole in the diff.
- addons/intelligence/tests/test_spec_addon_182_document_tool_loop.py — full: New file, read whole in the diff.
- addons/intelligence/tests/test_spec_addon_182_document_tool_offer.py — full: New file, read whole in the diff.
- addons/intelligence/tests/test_spec_addon_182_get_text_results.py — full: New file, read whole in the diff.
- addons/intelligence/tests/test_spec_addon_183_page_images.py — full: New file, read whole in the diff.

## Unspecified behavior, recorded

- claude-read: A page request holds PYMUPDF_LOCK from opening the PDF until up to 4 pages are rendered and the document is closed, so an extraction that starts during that time waits for the whole request.
  - F1 × I1 = 1, claude-read: If someone asks about PDF pages while another PDF is being indexed, the indexing waits a few extra seconds, and the user notices nothing.
  - F2 × I1 = 2, claude-verify: Confirmed at addons/intelligence/app/rag/file_question.py:1037-1063 (PageImages.open takes PYMUPDF_LOCK, and close releases it only after the document is closed). It shows up only when a PDF extraction or page OCR job starts while a page request renders its pages (at most 4 pages of up to 1280 px each, typically a second or two). The background indexing job is then delayed by that long, which the user does not notice.

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: I ran no tests and no linter; I cannot execute commands.
- claude-read: I did not confirm that the worktree's addon checkout is exactly submodule commit 7b233ee. I read the worktree file and assumed it matches.
- claude-read: I did not search the whole addon for modules that import `time`, `contextlib` or `Iterator` from app.rag.file_question.
- claude-read: I did not re-open the touch-point test files that are untouched by this diff.
- claude-verify: Did not check whether the caller always calls PageImages.close in a finally block on every path, including exceptions and deadlines.
- claude-verify: Did not check the value of PAGE_IMAGE_LOCK_SECONDS or of PAGE_IMAGE_LONG_EDGE.
- claude-verify: Did not review the rest of the diff (rag.py tool loop, prompts, numbering, citations), because there were no findings to verify.

TOTAL: 0 findings
