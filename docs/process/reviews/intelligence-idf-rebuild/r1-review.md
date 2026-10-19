# Review of intelligence c4027ca (reviewer A)

Tests at c4027ca: tests/test_tfidf_keywords.py + tests/test_z_auto_tag_drive_scope.py -> 28 passed.

## Verified (no finding)

- IDF equivalence: ran the parent commit's `_build_corpus_idf` (saved as `app/tfidf_old.py` in a scratch copy) and the new one side by side with real Janome 0.5.0 over a synthetic DB of 470 files in two drives (376 active in drive a, so batching across 200 is exercised; files with no transcript, with a transcript under 20 chars, inactive files, and filenames that yield no token). Results were identical (`new == old`), n_docs 313/313, 78/78, and 0/0 for an empty drive.
- Spawn under the production entry point: ran `uvicorn probe:app` (uvicorn 0.34.2 console script, cwd /app, as in the Dockerfile CMD) with a lifespan that runs `_tokenizer_process()` + `_count_document_frequencies` from a worker thread using real Janome. The child started, tokenized, and returned the correct Counter. The tokenizer stayed out of the parent (`_child_tokenizer` was None there). Importing `app.tfidf` in the child pulls in `app.config.load_settings()` (it only reads YAML and override JSON) and `app.database` (engines are created lazily). Neither writes, migrates, or loads a model.
- Child death: a tokenizer that calls `os._exit(9)` makes `.result()` raise `BrokenProcessPool` in 0.15 s, the `with` block shuts the pool down, and no worker process is left. The only process left is multiprocessing's resource_tracker, of which there is one per parent, not one per build. The `finally` in `_get_corpus_idf` then clears `_corpus_builds` and sets the event, and a waiter with no cache goes round the loop and becomes the next owner.
- Single-flight: the owner registers its Event under the lock. A waiter captures the Event under the same lock, and `Event.wait()` returns at once if the event is already set, so no wake-up is lost. The owner never re-enters `_get_corpus_idf`, so it cannot deadlock. Different drives use different keys. `reset_corpus_idf_cache()` does not touch `_corpus_builds`, so the owner's `del` cannot raise KeyError.
- Callers (`extract_top_keywords`, `get_tfidf_keywords_for_file`, and `whisper._index_tfidf_keywords` / `auto_tags._safe_tfidf_candidates` above them) use the same signatures and return shapes. `_tokenize_file` and `_compute_idf` still exist with unchanged behaviour (`find_similar_by_tfidf` and `get_tfidf_keywords_for_file` still use them).

## Findings

### 1. [B] The tests do not pin batch merging or the "documents that produced a token" count
- tests/test_z_auto_tag_drive_scope.py:291-330, app/tfidf.py:661-662, 588-591
- Every corpus test has at most 4 files (fewer than `_CORPUS_BATCH_FILES` = 200), and every one of those files yields a filename token. So none of these regressions is caught:
  - M1: `doc_freq.update(batch_freq)` changed to `doc_freq = batch_freq` (only the last batch's frequencies survive)
  - M2: `n_docs += batch_docs` changed to `n_docs = batch_docs`
  - M3: count every document, including ones that produced no token (`n_docs += 1` outside `if tokens:`)
  On a real drive with more than 200 files, M1 or M2 would silently produce a wrong IDF and a wrong `min_doc_freq` bound.
- Confirmed by running each mutation against the two test files in the Docker test image: 28 passed for each of M1, M2 and M3. The scratch tree was restored afterwards. A test with more than `_CORPUS_BATCH_FILES` files (the constant can be monkeypatched down to 1 or 2), plus one file that tokenizes to nothing, would pin all three.

### 2. [B] `force_reload=True` during an in-flight build does not force a rebuild
- app/tfidf.py:693-700
- A `force_reload=True` caller that finds a build in flight waits on it and then returns that build's result, even though the build may have started before the change the caller wanted reflected. If that build fails and a stale IDF exists, the caller gets the stale IDF back (line 699: `cached is not None and _corpus_builds.get(drive) is None`) and no rebuild happens. The intent "a waiter whose build failed builds itself" therefore does not hold for force_reload callers.
- No production code passes `force_reload` (grep finds only tests), hence B. The tests do not pin this either: mutation M4, dropping `and not force_reload` from line 692 so that a force_reload caller gets the stale IDF at once, passes all 28 tests. Confirmed by reading the code and by running M4.

### 3. [B] The caller that starts a rebuild still blocks for the whole rebuild, even when a stale IDF exists (not a regression)
- app/tfidf.py:675-717, app/workers/whisper.py:1262
- Stale-while-revalidate covers only the other callers. In practice the whisper worker is the main caller. When the cache passes its 600 s TTL, the next `_index_tfidf_keywords` makes the whisper worker the owner, and that worker sits in `_build_corpus_idf` for the full 7-14 min before it can return the keywords for its own file. It does this even though a perfectly usable stale IDF is in the cache. So in steady state, transcript indexing still pauses for one full rebuild after every ~10 min of fresh cache. The GIL contention is gone (the CPU is in the child), but the pipeline stall the background describes is not. The same was true at the parent commit, so this is not a regression. Building in a background thread, and returning the stale IDF to the owner too, would remove the stall.
- Confirmed by reading the code.

TOTAL: 3 findings
