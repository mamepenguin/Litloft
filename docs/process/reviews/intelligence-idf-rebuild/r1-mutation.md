# Mutation check: intelligence c4027ca (app/tfidf.py)

Baseline: 31 passed. Each mutant applied alone to app/tfidf.py in a worktree, image rebuilt, the three test files run, file restored.

| id | location / change | result | killing test |
|---|---|---|---|
| G1 | fresh: TTL comparison inverted (never fresh) | KILLED | TestCorpusIdfCache::test_each_drive_gets_its_own_idf; TestCorpusIdfCache::test_reuses_cached_idf_within_ttl; TestCorpusIdfRebuildIsSingleFlight::test_a_stale_idf_is_served_while_another_caller_rebuilds |
| G2 | fresh: drop `not force_reload` | KILLED | TestCorpusIdfCache::test_force_reload_rebuilds |
| G3 | fresh: always False | KILLED | TestCorpusIdfCache::test_each_drive_gets_its_own_idf; TestCorpusIdfCache::test_reuses_cached_idf_within_ttl |
| G4 | in-flight check ignored (always start own build) | KILLED | TestCorpusIdfRebuildIsSingleFlight::test_a_caller_with_no_idf_waits_for_the_build_in_flight; TestCorpusIdfRebuildIsSingleFlight::test_a_stale_idf_is_served_while_another_caller_rebuilds; TestCorpusIdfRebuildIsSingleFlight::test_a_waiter_builds_itself_when_the_build_it_waited_for_failed |
| G5 | stale-serving disabled (always wait) | KILLED | TestCorpusIdfRebuildIsSingleFlight::test_a_stale_idf_is_served_while_another_caller_rebuilds |
| G6 | stale-serving: drop `not force_reload` | SURVIVED |  |
| G7 | post-wait: drop `_corpus_builds.get(drive) is None` | SURVIVED |  |
| G8 | post-wait: never return (loop back to top) | SURVIVED |  |
| G9 | post-wait: raise instead of retrying when nothing cached | KILLED | TestCorpusIdfRebuildIsSingleFlight::test_a_waiter_builds_itself_when_the_build_it_waited_for_failed |
| G10 | no wait (busy loop) | SURVIVED |  |
| G11 | finally: no done.set() | KILLED | timeout (suite hung >240s) |
| G12 | finally: no del _corpus_builds[drive] | KILLED | timeout (suite hung >240s) |
| G13 | finally: done.set() before del | SURVIVED |  |
| G14 | build result not cached | KILLED | TestCorpusIdfCache::test_each_drive_gets_its_own_idf; TestCorpusIdfCache::test_reuses_cached_idf_within_ttl; TestCorpusIdfRebuildIsSingleFlight::test_a_caller_with_no_idf_waits_for_the_build_in_flight |
| G15 | cache timestamp 0 (always stale) | KILLED | TestCorpusIdfCache::test_each_drive_gets_its_own_idf; TestCorpusIdfCache::test_reuses_cached_idf_within_ttl |
| G16 | in-flight keyed globally instead of per drive | KILLED | TestCorpusIdfCache::test_each_drive_gets_its_own_idf; TestCorpusIdfCache::test_force_reload_rebuilds; TestCorpusIdfCache::test_reuses_cached_idf_within_ttl; TestCorpusIdfRebuildIsSingleFlight::test_a_caller_with_no_idf_waits_for_the_build_in_flight; TestCorpusIdfRebuildIsSingleFlight::test_a_stale_idf_is_served_while_another_caller_rebuilds; TestCorpusIdfRebuildIsSingleFlight::test_a_waiter_builds_itself_when_the_build_it_waited_for_failed; TestCorpusIdfRebuildIsSingleFlight::test_drives_rebuild_independently |
| G17 | in-flight lookup keyed globally | KILLED | TestCorpusIdfRebuildIsSingleFlight::test_a_caller_with_no_idf_waits_for_the_build_in_flight; TestCorpusIdfRebuildIsSingleFlight::test_a_stale_idf_is_served_while_another_caller_rebuilds; TestCorpusIdfRebuildIsSingleFlight::test_a_waiter_builds_itself_when_the_build_it_waited_for_failed |
| G18 | stale-serving returns cached n_docs wrong slot | KILLED | TestCorpusIdfRebuildIsSingleFlight::test_a_stale_idf_is_served_while_another_caller_rebuilds |
| B1 | _build_corpus_idf: drive filter removed | KILLED | test_document_frequency_counts_only_the_drives_own_files |
| B2 | _build_corpus_idf: active filter removed | SURVIVED |  |
| B3 | batch slice drops last file of each batch | SURVIVED |  |
| B4 | range stops one file early | KILLED | test_document_frequency_counts_only_the_drives_own_files; test_the_corpus_is_tokenized_outside_this_process |
| B5 | batch size 1 (equivalence probe) | SURVIVED |  |
| B6 | merge: keep only last batch counts | SURVIVED |  |
| B7 | merge: n_docs keeps last batch only | SURVIVED |  |
| B8 | n_docs = len(files) instead of docs with tokens | SURVIVED |  |
| B9 | transcript not read (empty) | KILLED | test_document_frequency_counts_only_the_drives_own_files; test_the_corpus_is_tokenized_outside_this_process |
| B10 | returned n_docs off by one | KILLED | test_document_frequency_counts_only_the_drives_own_files |
| B11 | empty-drive early return removed | SURVIVED |  |
| C1 | per-doc set -> list (term freq) | KILLED | test_document_frequency_counts_only_the_drives_own_files |
| C2 | count every doc, even tokenless | SURVIVED |  |
| C3 | n_docs never incremented | KILLED | test_document_frequency_counts_only_the_drives_own_files; test_the_corpus_is_tokenized_outside_this_process |
| C4 | condition inverted | KILLED | test_document_frequency_counts_only_the_drives_own_files; test_the_corpus_is_tokenized_outside_this_process |
| D1 | transcript threshold >= 20 -> > 20 | SURVIVED |  |
| D2 | transcript threshold 20 -> 50 | KILLED | test_document_frequency_counts_only_the_drives_own_files; test_the_corpus_is_tokenized_outside_this_process |
| D3 | transcript threshold 20 -> 0 | SURVIVED |  |
| D4 | filename boost dropped (x1) | SURVIVED |  |
| D5 | filename tokens dropped | SURVIVED |  |
| D6 | transcript tokens dropped | KILLED | test_document_frequency_counts_only_the_drives_own_files; test_the_corpus_is_tokenized_outside_this_process |
| I1 | n_docs==0 guard removed | SURVIVED |  |
| I2 | +1.0 -> +0.0 | KILLED | test_document_frequency_counts_only_the_drives_own_files |
| I3 | n_docs+1 in numerator | KILLED | test_document_frequency_counts_only_the_drives_own_files |
| I4 | _compute_idf: set -> list | SURVIVED |  |
| P1 | spawn -> fork | SURVIVED |  |
| P2 | initializer removed | KILLED | test_document_frequency_counts_only_the_drives_own_files; test_the_corpus_is_tokenized_outside_this_process |
| P3 | in-process thread pool instead of child process | KILLED | test_the_corpus_is_tokenized_outside_this_process |
| P4 | initargs bound to Janome factory (ignores override) | KILLED | test_document_frequency_counts_only_the_drives_own_files; test_the_corpus_is_tokenized_outside_this_process |
| P5 | pool never shut down | SURVIVED |  |
| P6 | max_workers=2 | SURVIVED |  |
| P7 | child tokenizer not stored globally (local assign) | KILLED | test_document_frequency_counts_only_the_drives_own_files; test_the_corpus_is_tokenized_outside_this_process |

Totals: 52 mutants, 31 killed, 21 survived. B1/B2 were re-applied with a unique anchor (the filter text occurs three times in the file).

## Survivors

Facts the judgements below rely on: no production caller passes `force_reload` to `_get_corpus_idf` (grep over `app/`). A caller waits only when the drive has no cached IDF. Every test corpus has at most 3 files, all with tokens. `_document_tokens` is also the per-file TF path (`_tokenize_file` -> `get_tfidf_keywords_for_file`), and the tests for that path stub the tokens.

Equivalent or not observable in ordinary use:
- G6 (stale-serving ignores `force_reload`): only a `force_reload` caller would see a difference, and there is none in production.
- G7 (post-wait check drops "no build in flight"): a waiter exists only when nothing was cached. So a non-None cache after the wait means a build succeeded and the IDF is fresh, and the loop would return the same value. The only difference is for `force_reload`.
- G8 (post-wait never returns, loops instead): the top of the loop returns the fresh value. Only a `force_reload` waiter would rebuild again.
- G13 (`done.set()` before the `del`): at worst the waiter loops for a few microseconds until the owner deletes the entry, then returns the same result.
- B5 (batch size 1): equivalence probe; the result is the same.
- B11 (empty-drive early return removed): spawns a child for nothing and still returns `({}, 0)`. Costs one process spawn.
- D1 (`>= 20` becomes `> 20`): only a transcript of exactly 20 characters changes. Negligible.
- I1 (`n_docs == 0` guard removed): `n_docs == 0` implies empty counts, so the result is `{}` either way.
- P5 (pool never shut down): the executor's weakref cleanup reaps the worker once the pool is collected. Janome's memory may stay alive a little longer, which nobody would notice.
- P6 (`max_workers=2`): only one future is ever outstanding, so a second worker is never needed.

Findings (change behaviour a user would see in ordinary use):
1. G10: replacing `in_flight.wait()` with a busy loop survives. A caller with no IDF then spins on the lock and the GIL for the whole multi-minute rebuild, which is the starvation the commit exists to remove. It hits the first rebuild after a restart when two jobs need the same drive. Nothing checks that a waiter blocks instead of spinning.
2. B3: the batch slice can drop the last file of each 200-file batch. Every drive with more than 199 files gets an IDF that differs from the old in-process computation. Not caught because no test spans two batches.
3. B6: the merge can keep only the last batch's document frequencies. On a drive with more than 200 files, most of the corpus vanishes from the IDF. Same gap: no multi-batch test.
4. B7: `n_docs` can keep only the last batch's count. That gives wrong IDF values and a wrong `min_doc_freq` bound on drives with more than 200 files. Same gap.
5. B8: `n_docs` can be `len(files)`, which counts tokenless files. Photo or camera-named files with no transcript (for example `20240101_123456.jpg`, whose date and digits the noise filter removes) inflate N, so every IDF value and the `min_doc_freq` bound drift. No test has a tokenless file in the corpus.
6. C2: same effect as B8, but inside `_count_document_frequencies` (every doc counted, tokenless or not).
7. D3: transcript threshold 20 can become 0. Short hallucinated transcripts (the typical Whisper output on silent media is under 20 characters) then enter both the IDF and per-file keywords. Every test transcript is 40 or more characters.
8. D4: the filename boost can drop from `_FILENAME_BOOST` to 1. That is equivalent for the IDF (set per doc), but it changes per-file TF-IDF keyword ranking via `_tokenize_file`, which is untested with real tokens.
9. D5: filename tokens can be dropped from `_document_tokens`. Filename words then disappear from the IDF and from per-file keywords. Test filenames like `a1.mp4` give no word the assertions look at.
10. B2: the `active` filter can be removed from `_build_corpus_idf`. Trashed or missing files then keep counting in the drive's IDF. This line predates the commit, but it was in scope and nothing pins it.
11. I4: `_compute_idf` (the find-similar-files path, `_compute_idf(all_tokens)`) can count term frequency instead of document frequency (set changed to list). This changes the similar-files ranking. The commit rewrote this line and no test covers it.
12. P1: the `spawn` context can become `fork` and nothing notices; the PID test passes with fork too. The docstring's reason is real: a fork can copy a lock that a model or DB thread holds. If that happens, the child hangs, `.result()` never returns, and the drive's in-flight event is never set. Every later caller with no IDF for that drive then waits forever. It is intermittent, but it is a user-visible hang in ordinary use.

Notes: G11 and G12 were KILLED only by a hung suite (stopped at 240 s), not by a failing assertion. The tests use unbounded waits on the paths those mutants break. That is a weak kill, not a survivor.

TOTAL: 12 findings
