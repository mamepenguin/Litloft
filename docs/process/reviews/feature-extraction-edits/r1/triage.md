# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Module-global process flag text_embedding_model_rebuilt carries state between the migration and the follow-up worker.; The shared aligner loader now classifies ValueError as unsupported, which affects Refine as well.
- claude-read: Module-global process flag text_embedding_model_rebuilt carries state between the migration and the follow-up worker.
- claude-read: The shared aligner loader now classifies ValueError as unsupported, which affects Refine as well.
- claude-verify: New shared module app/extraction.py is not in the touch points.
- claude-verify: The process-global flag database.text_embedding_model_rebuilt couples the migration to the follow-up worker.
- claude-verify: The core test ime-enter-guard.test.ts is edited.

### unspecified_behavior

Note: New shared module app/extraction.py is not in the touch points.; The process-global flag database.text_embedding_model_rebuilt couples the migration to the follow-up worker.; The core test ime-enter-guard.test.ts is edited.
- claude-read: Module-global process flag text_embedding_model_rebuilt carries state between the migration and the follow-up worker.
- claude-read: The shared aligner loader now classifies ValueError as unsupported, which affects Refine as well.
- claude-verify: New shared module app/extraction.py is not in the touch points.
- claude-verify: The process-global flag database.text_embedding_model_rebuilt couples the migration to the follow-up worker.
- claude-verify: The core test ime-enter-guard.test.ts is edited.

## Findings

A: 0
B: 6
C: 0

### claude-read:F1 — bucket B, MEDIUM, open

Claim: The diff adds a new module addons/intelligence/app/extraction.py (about 520 lines) that is absent from the touch-point list. It holds the shared definitions of corrected, busy, stale and restore, and it is imported by routers/files.py, routers/refine.py, routers/admin.py, workers/ocr.py, workers/followup.py and main.py.
Impact: The core rules (busy, restore, redo-mark clearing at startup, snapshot/restore of chunks and words) live outside the declared reach. A reviewer working from the touch-point list would not look at them, yet most of I4, I5, I8 and I10 depend on them.
Evidence: addons/intelligence/app/extraction.py (new file). The touch points name followup.py's directory ("a new follow-up worker in app/workers/") but no shared state module.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F2 — bucket B, LOW, open

Claim: The commit edits a core test file, frontend/src/__tests__/ime-enter-guard.test.ts, which is not in the touch points. The touch points say only the addon and docs are reached, and that no core path is edited.
Impact: A core frontend test now hard-codes addon file names and a count of 8. Adding or renaming an addon Enter handler elsewhere breaks a core test. The test is a gate-like check, so its list is a silent-pass risk if it is edited without review.
Evidence: frontend/src/__tests__/ime-enter-guard.test.ts: adds TranscriptSection.tsx and PictureTextSection.tsx and changes toHaveLength(6) to toHaveLength(8).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, LOW, open

Claim: database.py gains a process-global flag text_embedding_model_rebuilt, set inside _migrate_vec_text_if_needed (the embedding-model rebuild). The touch points describe database.py only as idempotent column and table migrations, and the spec says the rebuild is unchanged.
Impact: The startup sweep in followup.startup_sweep reads and resets this flag to decide whether to rebuild pictures' search rows from stored text. This couples the rebuild migration to the new worker through module state. If the migration runs but the worker starts later or fails, the flag is consumed or lost, and uncorrected pictures stay with ocr_indexed false. They would then be re-read by OCR, not rebuilt from stored text, which is the decision 18 behaviour.
Evidence: database.py: `global text_embedding_model_rebuilt; text_embedding_model_rebuilt = True` after nested.commit(); workers/followup.py startup_sweep.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket B, LOW, open

Claim: aligner._load_align_model, which Refine's realign_words_for_chunk uses, is reworked through the new _load_align_model_detailed. It now catches ValueError separately and returns an `unsupported` outcome. The touch points list only the single-utterance span call for aligner.py, and the Refine path only as 'treats every non-success outcome as None'.
Impact: The model-load path shared with Refine changes its logging and its return handling. A regression there would reach I14 (Refine keeps old words on any non-success) without a listed touch point for the loader.
Evidence: workers/aligner.py: _load_align_model now delegates to _load_align_model_detailed; a new except ValueError branch was added.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, LOW, open

Claim: routers/files.py reindex_file gains a new `manager` Depends(get_index_manager) parameter and a fallback re-fetch. The diff also corrupts an existing comment: '404 (not cross-drive / soft-deleted ...'. Neither is in the touch points beyond 'gains overwrite_corrections'.
Impact: The route's dependency signature changes. Tests that call it directly or override dependencies see different behaviour. The mangled comment misleads a reader.
Evidence: routers/files.py reindex_file signature and the line `# 404 (not cross-drive / soft-deleted / unknown — keeps the`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Restore the original comment text.

</details>

### claude-read:F6 — bucket B, INFO, open

Claim: The new follow-up worker and routes import private helpers from modules that are not in the touch points: workers/metadata.py (_store_embedding, _remove_embeddings), workers/embedder.py, file_find.py (_merge_chunks, _replay_limit), idf_backfill.py, processing_events.py, extractors/base.py and whisper._index_tfidf_keywords. The diff does not modify them but depends on their internal signatures.
Impact: Any later change to these private helpers silently breaks correction, rebuild and restore. The embedding id shapes of I12 are produced through _store_embedding calls whose behaviour is not pinned by the listed scope.
Evidence: workers/followup.py and routers/files.py import `_store_embedding`, `_remove_embeddings`, `_merge_chunks`, `_replay_limit` and `_index_tfidf_keywords`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: The truncated part of the diff: whisper.py, workers/refine.py, the rest of ocr.py, addon_events.py, manifest.json, the frontend files and the tests.
- claude-read: Whether the invariants hold in behaviour.
- claude-read: Whether the helper modules named in F6 changed their signatures.
- claude-read: Whether any unlisted frontend or message file was touched.
- claude-verify: I did not verify any invariant I1-I15 behaviourally; I could not run anything.
- claude-verify: I did not diff against the base, so I could not tell whether the comment at routers/files.py:937 was damaged by this commit.
- claude-verify: I did not read the full length or contents of extraction.py.
- claude-verify: I did not check idf_backfill, processing_events or extractors/base imports.

TOTAL: 6 findings
