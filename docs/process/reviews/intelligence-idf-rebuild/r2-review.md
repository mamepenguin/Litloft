# Review of d8c4f62 (intelligence: serve the stale IDF while the rebuild runs in the background)

Scope: `git show d8c4f62` (parent c4027ca). Tests run at d8c4f62:
`tests/test_tfidf_keywords.py tests/test_z_auto_tag_drive_scope.py` -> 31 passed.
The single-flight/cache tests were run 40 times in a row: 40/40 passed, no flake.

No A findings. The single-flight logic is sound for every ordinary path:
- No lost wake-up: `_rebuild` deletes the `_corpus_builds` entry under the lock and then
  sets `done`; a waiter that captured the event before the set returns from `wait()` at once,
  and re-checks state under the lock.
- `force_reload` never takes the background path (`serve_stale` is False), so it builds inline
  or waits, as before.
- Drives are independent (event keyed by drive, thread named per drive).
- In production nothing removes a drive's cached IDF, so a waiter only ever waits on an inline
  builder; the background path only exists when a cache entry exists.
- Shutdown with a background rebuild running (measured in the test image, Python 3.12):
  concurrent.futures' atexit hook waits for the in-flight batch, then the interpreter exits
  with code 0; the next `submit` from the frozen daemon thread never runs, and the spawned
  child exits with its pool. Exit is delayed by at most one batch (200 files), which was
  equally true before this commit when the rebuild ran on the worker thread. No orphan, no hang.

## B1 - A failed `Thread.start()` leaks the `_corpus_builds` entry; the drive never rebuilds again
- app/tfidf.py:693-702
- `_corpus_builds[drive] = done` is set before `threading.Thread(...).start()`. If `start()`
  raises (RuntimeError "can't start new thread": thread/pid limit, or a call during interpreter
  shutdown), the exception propagates to the caller but the entry is never removed and `done`
  is never set. From then on every caller sees `in_flight` and `serve_stale` and returns the
  stale IDF forever; no rebuild is ever started again until the process restarts (and a
  no-cache waiter, if one ever existed, would block forever).
- Confirmed: script in the test image patched `Thread.start` to raise once, then restored it.
  Output: first call raised, `builds entry leaked: True`, the next three calls returned the old
  IDF, `build calls: []` after 0.5 s.
- Rare (resource exhaustion), hence B. Fix shape: on `start()` failure, pop the entry and set
  `done` before re-raising (or fall back to building inline).

## B2 - Rebuild concurrency is now bounded by the number of drives, not by the number of calling threads
- app/tfidf.py:695-702
- Before, a stale caller rebuilt inline, so one whisper worker thread rebuilt at most one drive
  at a time. Now each call returns immediately, so a single worker stepping through files of
  several drives whose IDFs have expired starts one background rebuild per drive, each with its
  own spawned Janome process (~100 MB + one CPU core) running at the same time. With TTL 600 s
  and multi-minute builds, a backfill across N drives keeps N tokenizer processes alive in
  parallel roughly every 10 minutes.
- Confirmed by reading the code path (each drive gets its own event and thread; nothing caps the
  number of concurrent `_tokenizer_process()` pools). Not measured on a real multi-drive corpus.
- Harmless with one or two drives; a memory spike risk on a small home server with many drives.
  A process-wide semaphore around `_build_corpus_idf` (or one shared rebuild thread) would restore
  the old bound.

## B3 - A rebuild that keeps failing is retried on every call, back to back, and the stale IDF ages without bound
- app/tfidf.py:733-741, 695-702
- After a failure the cached timestamp is unchanged, so the next `_get_corpus_idf` call (every
  transcript the whisper worker indexes, every auto-tag call) immediately starts another full
  rebuild: spawn a child, load Janome, tokenize up to the failure point. There is no backoff.
  Meanwhile callers keep getting an IDF that may be arbitrarily old, and the only signal is a
  log line per attempt.
- Retry-per-call already existed in c4027ca, but there the failure propagated to the caller
  (whisper leaves `tfidf_keywords_indexed` False for backfill retry); now it is silent to callers.
- Confirmed by reading; `test_a_failed_background_rebuild_keeps_the_stale_idf` pins exactly this
  "next call tries again" behaviour. Only matters for a persistent failure (e.g. child OOM-killed
  -> BrokenProcessPool every time), hence B. A short backoff stamp on failure would bound it.

## B4 - Background threads and `_corpus_builds` are not cleaned up by test teardown
- tests/test_tfidf_keywords.py:279-283 (fixture), app/tfidf.py:744-747 (`reset_corpus_idf_cache`)
- `reset_corpus_idf_cache()` clears `_corpus_idf_by_drive` but not `_corpus_builds`, and the
  fixture does not set `release` or join the background thread. On the passing path the tests
  themselves wait (`_wait_for_no_build`), so nothing leaks. But if an assertion in one of the
  two stale-path tests fails before `release.set()` (e.g. in
  `test_a_failed_background_rebuild_keeps_the_stale_idf`, the asserts before line 349), the
  daemon thread stays blocked in `fake_build` for up to 10 s holding a `_corpus_builds["d"]`
  entry, and later tests on drive "d" see an in-flight build and either return stale or wait,
  turning one failure into a cascade of misleading failures.
- Confirmed by reading; only affects diagnosis after a real failure, hence B. Fix: in the
  fixture teardown, set any outstanding release / wait for `_corpus_builds` to empty, or have
  `reset_corpus_idf_cache` clear `_corpus_builds` as well.

## Tests: do they pin what they claim
- Batching (`_CORPUS_BATCH_FILES=2`, 5 active files -> 3 batches), inactive file excluded,
  sub-20-char transcript dropped but filename kept, a file with no tokens not counted: the
  expected IDF values only hold if all of these are right. Pinned.
- Spawn start method: records the argument to `get_context`; a change to "fork" or default fails.
- `_compute_idf` once-per-document: pinned by the 料理 value 1.0.
- Stale-served test: an inline rebuild would block in `fake_build` until its 10 s timeout and
  fail the `assert release.wait`, so the test does distinguish background from inline (slowly).

TOTAL: 4 findings
