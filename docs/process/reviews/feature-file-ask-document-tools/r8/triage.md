# Triage: r8

## Trajectory

This run:
- claude-read: The record has three rounds. The r6→r7 fix added state and branches to PageImages: a shared monotonic budget, a `_locked` context manager taken per call, an explicit `del pixmap, page`, and in close() a timed acquire plus a daemon-thread fallback through `_close_locked`. The r8 fix (54f131c) adds no branch, state or prediction that r7 also added. It removes all of them: `_close_locked`, the daemon thread, the `_locked` context manager, the `_end` budget and the explicit `del`. In their place is one structure: one acquire in open(), held until close() in the caller's finally, with render failures handled inside that hold. This round simplifies the design rather than patching it. Its only leftovers are three unused imports (CR8-1) and an untested deallocation (CR8-2).

Earlier runs:
- r7 / claude-read: There is one fix round since r6 (dd75388 moves the submodule to the fix commit; 99881c9 records r6). It adds the helper _contents_title, which reuses the existing marker removal; that adds no new state. It adds one branch to PageImages.close(): the early `return` that left the document to the collector becomes a deferred close on a daemon thread, which waits for the lock with no limit. It also adds the shared helper _close_locked. The record holds no earlier fix round, so no round repeats a branch an earlier one added. The close-path fix, however, has the same shape as the defect it fixes: it covers one exit (the success path and the timed-out close) and leaves a sibling exit (the render-failure traceback, CR7-1). The design is being patched path by path rather than by one structure that always drops MuPDF objects under the lock. Nothing was removed apart from the early return.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/prompts/rag/file_question_system.jinja2 — full: Every changed hunk read in the diff.
- addons/intelligence/app/prompts/rag/file_question_user.jinja2 — full: Every changed hunk read in the diff.
- addons/intelligence/app/rag/file_question.py — partial: All diff hunks, plus worktree lines 985-1069 (page_image_path, _render_page, PageImages) and an import grep.
- addons/intelligence/app/rag/prompt.py — full: Every changed hunk read in the diff.
- addons/intelligence/app/routers/rag.py — partial: Every diff hunk, plus worktree lines 2277-2356 (_serve_page_request).

Test files:
- addons/intelligence/tests/document_tool_doubles.py — full: Read in the diff.
- addons/intelligence/tests/file_context_doubles.py — partial: Diff hunks only.
- addons/intelligence/tests/golden_prompts/file_question_today_document-tool.json — full: Read in the diff; the content is [].
- addons/intelligence/tests/test_spec_addon_071_image_stream.py — partial: Changed hunk only.
- addons/intelligence/tests/test_spec_addon_116_frame_request_fallback.py — partial: Changed hunk only.
- addons/intelligence/tests/test_spec_addon_179_181_every_path.py — partial: Changed hunks only.
- addons/intelligence/tests/test_spec_addon_179_file_block.py — partial: Changed hunk only.
- addons/intelligence/tests/test_spec_addon_182_183_document_hygiene.py — full: Read whole in the diff, including the r8 change.
- addons/intelligence/tests/test_spec_addon_182_document_tool_loop.py — full: Read in the diff.
- addons/intelligence/tests/test_spec_addon_182_document_tool_offer.py — full: Read in the diff.
- addons/intelligence/tests/test_spec_addon_182_get_text_results.py — full: Read in the diff.
- addons/intelligence/tests/test_spec_addon_183_page_images.py — full: Read in the diff.

## Unspecified behavior, recorded

- claude-read: A page request now holds PYMUPDF_LOCK for its whole run, from the first page-count need through rendering up to 4 pages, instead of taking it once per PyMuPDF call.
  - F1 × I1 = 1, claude-read: An extraction or OCR that starts while a page request runs waits a few seconds more for the lock. The user sees nothing.
  - F3 × I1 = 3, claude-verify: When a vision-capable profile asks for PDF page images while an extraction is running, the extraction or the page request waits a few seconds longer for the shared lock (the page request gives up after 30 s and the page is named not available); the user sees nothing beyond a slight delay.

## Findings

A: 0
B: 2
C: 0

### claude-read:CR8-1 — bucket B, INFO, open

Claim: The r8 rewrite of PageImages leaves the imports `contextlib`, `time` and `Iterator` unused in file_question.py. The `_locked` context manager and the `time.monotonic()` budget were their only users.
Impact: There is no runtime effect. If the addon's lint step runs pyflakes or ruff F401, it fails on these imports.
Evidence: addons/intelligence/app/rag/file_question.py:14 `import contextlib`, :20 `import time`, :21 `Iterator`. A grep of the file finds no other use of `contextlib`, `time.` or `Iterator` (the only `time` match is `by_time` at :598).
Repro: not_reproduced. I could not find the lint config in the addon directory.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Remove `import contextlib`, `import time` and `Iterator` from the imports.

</details>

### claude-read:CR8-2 — bucket B, INFO, open

Claim: No test checks that the Document object is deallocated while the lock is held. The hygiene test records only when `Document.close` is called, so removing `self._document = None` in PageImages.close() would pass every test. The last reference would then go when `source` leaves _serve_page_request, which is after the release.
Impact: No user impact now. The code drops the reference under the lock (file_question.py:1060-1065). A later edit could move the drop outside the lock without any test failing.
Evidence: tests/test_spec_addon_182_183_document_hygiene.py: `_close` appends ("document", locked) when close() is called, and no weakref.finalize is put on the Document. rag.py:2277 binds `source`, and rag.py:2352 calls `source.close()` in the finally.
Repro: Mutation: delete `self._document = None` at file_question.py:1062. Expected result: survives, by reading the test.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Put a weakref.finalize on the Document in the hygiene test, as is done for Page and Pixmap.

</details>

## Not verified

- claude-read: I ran no tests; I cannot execute commands.
- claude-read: I did not check whether the installed PyMuPDF Page supports weakref, or whether Page.parent is a weak or strong reference to the Document.
- claude-read: I could not find the addon's lint configuration, so I did not check whether F401 is enforced.
- claude-read: I did not re-read the untouched touch-point test files.
- claude-verify: I did not run the tests or a linter; the unused imports were confirmed by grep only.
- claude-verify: I did not check whether freeing a closed pymupdf Document outside the lock actually calls into MuPDF.

TOTAL: 2 findings
