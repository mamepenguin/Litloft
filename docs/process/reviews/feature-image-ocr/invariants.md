spec: docs/specs/image-ocr.md

## Revisions

I11. (r1) When Ask or the single-file question builds context for a picture, it includes the picture's recognised-text chunks that match the question, chosen as for a document, together with the caption and metadata it already sends; a picture with no OCR rows gets the caption and metadata only, as before. Touch points add `addons/intelligence/app/rag/context.py` (`build_file_context`, `_collect_image_snippets`).
I12. (r1) A search hit on a picture whose evidence includes recognised-text matches shows the best match as its excerpt, the way a plain-text file does, with no page locator. Touch points add `frontend/src/lib/searchCapture.ts` (`buildSearchSnippet`) in the core; the summary's "the core is untouched except docs and the gitlink" no longer holds.
