# Triage: intelligence corpus IDF rebuild (addon PR #109)

Commits: c4027ca (child process + single-flight), d8c4f62 (background rebuild + tests).

## r1 (c4027ca): review 3 B, mutation 12 survivors with ordinary-use impact

Fixed in d8c4f62:
- Batch merging, no-token documents, inactive files, the 20-char transcript threshold, filename tokens: one test over two batches of 2 with an inactive file and a no-token file. Mutants B3, B6, B7, B8/C2, D3, D5, B2 now fail it.
- spawn vs fork (P1): the test records the start method.
- `_compute_idf` per-document counting (I4): unit test.
- The caller that found the IDF stale rebuilt inline, pausing the whisper worker for a whole rebuild (review finding 3): rebuild now runs on a background thread while the stale IDF is served.

Not acted on:
- `force_reload` during an in-flight build (review 2, mutants G6-G8): only tests pass it.
- Busy-wait instead of `Event.wait()` (G10): not a plausible edit; no test.

## r2 (d8c4f62): 4 B, none acted on

- Thread start failure leaves the build entry registered: needs the interpreter to refuse a thread.
- Up to one child per drive at once (3 drives in production, ~100MB and one core each): within the host's budget, and the rebuilds previously ran per caller thread too.
- No backoff for a rebuild that keeps failing: each call is minutes apart (one per indexed transcript); the failure is logged.
- A failing stale-path test can leave its blocked thread for up to 10 s: only affects the diagnosis of an already failing run.
