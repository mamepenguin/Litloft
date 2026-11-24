# Review: frames answer disconnect fix (intelligence `9d47ffe..0f7a5e7`)

Reviewed: `git diff 9d47ffe 0f7a5e7` in `addons/intelligence` (`578bd1b` tests, `0f7a5e7` fix in `app/routers/rag.py` `_answer_with_keepalive`). Nothing after `0f7a5e7`.

Environment: test image built from `0f7a5e7` (`Dockerfile.test`), Python 3.12.14, starlette 1.10.0, anyio 4.16.0, openai 3.45.0, httpx 0.28.1. Production pins fastapi 0.115.12 (starlette 0.46.2) and uvicorn 0.34.2; I checked both: uvicorn 0.34.2 HTTP scopes carry `spec_version: "2.3"`, and starlette 0.46.2 and 1.10.0 handle 2.3 identically (task group: `stream_response` + `listen_for_disconnect`, cancel the scope on `http.disconnect`). The new tests drive the same 2.3 branch, so they exercise the production disconnect path.

## Answers to the questions

**Clean end on disconnect, before and after the first token.** Yes, on the path production takes in ordinary use. On `http.disconnect` anyio cancels the `stream_response` task. That task is almost always suspended inside the generator chain (`queue.get()` in `_answer_with_keepalive`), because uvicorn's `send()` only awaits when the transport's writes are paused. The `CancelledError` unwinds `_answer_with_keepalive`. Its `finally` cancels the pump and waits for it, so the provider async generator is finished before `_frames_question_stream`'s `finally` calls `stream.aclose()`, which is then a no-op. The slot is released by `_file_question_stream`'s `finally`. Measured in both new tests: `_HeldOpen.closed == True` and `cancelled == True` (the httpx response really closed, not just cancelled), and the slot was back at MAX. The one exception, a cancel that lands at `send`, is F1.

**Can `await task` hang?** Only if the pump suppresses cancellation. The pump runs the provider generator, which runs openai `AsyncStream` over httpx, and none of these swallow `CancelledError`. I could not construct an ordinary-use hang. Note that awaiting a Task forwards an outer cancel into the awaited task (`fut_waiter.cancel()`), and the outer task keeps waiting until the pump finishes. So anyio's cancel redelivery cannot make the `finally` return early while the pump is still inside the stream.

**Can it swallow an outer cancellation?** No. On the disconnect path the outer `CancelledError` is already in flight through the `finally`. If the inner `except` swallowed the pump's `CancelledError`, the in-flight one would still propagate when the `finally` completes. On the normal exits (`end`, `error`), the pump has already returned by the time the consumer reads the item: `put_nowait` is followed by `return` with no await between them. So `await task` does not suspend, and no outer cancel can arrive during it. On 3.12, `cancelling()` is incremented by `Task.cancel()` even when the cancel is forwarded to `fut_waiter`. `asyncio.wait_for` timeouts (the keep-alive) `uncancel()` on exit, so earlier keep-alive timeouts do not leave a stale count. The `cancelling()` check is correct, but on the ordinary paths it is close to unreachable (see F2).

**Can it swallow a real pump exception?** No. The pump catches `Exception` itself and enqueues it, so `await task` only ever returns `None` or raises `CancelledError`. An exception raised during the pump's cancel-unwind is also caught by the pump and discarded together with the queue. That loses nothing a reader would see.

**Do the tests exercise production, and do they catch the bug?** They run the real router, the real `LLMClient`, and openai/httpx over `MockTransport`, with ASGI spec 2.3, which is what production uses. Reverting the fix makes 2 of the 3 tests fail with `RuntimeError: aclose(): asynchronous generator is already running` at `rag.py:841`. Forcing `timeout=None` for the first token makes the keep-alive test fail. Removing `task.cancel()` does not make any test fail (F2). I ran them 3 times under `--cpus=0.3`, and all passed (about 4 s each). The keep-alive test is not timing-fragile: it needs one 0.05 s tick inside a 0.5 s window, and if the loop stalls, the earlier keep-alive deadline still fires before the late token's sleep.

## Findings

### F1. A disconnect that lands at `send` still closes the provider stream under the running pump; the slot and model request stay held until a GC pass
- Bucket: A (resource held, error logged; ordinary use but rare)
- Location: `app/routers/rag.py:776` (consumer does not own `_answer_with_keepalive`), `app/routers/rag.py:841`
- Claim: `_frames_question_stream` iterates `_answer_with_keepalive(stream)` with a bare `async for`. If the response task is cancelled while it is suspended outside the generator chain (in `await send(...)`), every generator is left suspended at a `yield`, and nothing closes them in order. Python's async-generator finalizer later closes `_frames_question_stream` with `aclose()`. Its `finally` runs `stream.aclose()` while `_answer_with_keepalive` is still open and its pump is still inside the provider generator, and that raises the same `RuntimeError` this fix targets. Until that finalizer runs, the Ask slot is held and the model request stays open (the model keeps generating).
- How it happens: uvicorn's `send()` awaits only when the transport's writes are paused (`flow.drain()`), so the tab would have to be closed at a moment when the core proxy has stopped reading from the intelligence container. On a LAN with small SSE chunks, that is rare.
- Frequency: 1. Impact: 5 (slot and model request held until cyclic GC, then a "Task exception was never retrieved" RuntimeError in the log; the user sees nothing wrong).
- Evidence: reproduced. I made a copy of `_hang_up_after` whose `send` blocks forever after the first `answer_chunk` (standing in for paused writes), then sent the disconnect. Right after the disconnect: `closed=False cancelled=False slot=2` (MAX 3). After `gc.collect()`: `closed=True cancelled=True slot=3`, and the loop exception handler logged `Task exception was never retrieved RuntimeError('aclose(): asynchronous generator is already running')`.
- Note: the slot being held until GC is not specific to frames. Any Ask stream whose cancel lands at `send` has an outer generator that Starlette never closes. Wrapping the iteration in `contextlib.aclosing(_answer_with_keepalive(stream))` would fix the ordering (the RuntimeError) but not the GC-dependent release. Score 5 < 15, so under the threshold. Reported for the record.

### F2. `task.cancel()` and the `cancelling()` branch are not pinned by any test
- Bucket: B (test gap; the missed defect is not reachable in ordinary use)
- Location: `app/routers/rag.py:882`, `app/routers/rag.py:886-889`
- Claim: three mutants survive the new tests: removing `task.cancel()`, replacing `if cancelling(): raise` with `pass`, and replacing it with an unconditional `raise`. On the production disconnect path these lines are not load-bearing. With `task.cancel()` removed, anyio's redelivered cancel reaches the pump through `fut_waiter`. A swallowed `CancelledError` is overridden by the one already in flight. An unconditional `raise` re-raises an equivalent `CancelledError`. They would matter only if `_answer_with_keepalive` were closed by `aclose()` while the pump is still running, which today happens only through the GC-finalizer route in F1. In that case, without `task.cancel()`, the `finally` would wait on a stream that never ends.
- How it happens: no ordinary path today. It would become reachable if a caller started closing this generator early (`aclosing`, `break`).
- Frequency: 0. Impact: 3.
- Evidence: the mutation runs below.

## Mutation results

Each mutant was applied to `app/routers/rag.py` in my worktree, then I ran `tests/test_spec_addon_108_frames_disconnect.py` and restored the file.

| Mutant | Result |
|---|---|
| Revert the fix (only `task.cancel()` in `finally`) | killed: 2 failed, `RuntimeError: aclose(): asynchronous generator is already running` at `rag.py:841` |
| Drop `task.cancel()` (keep `await task`) | survived (F2) |
| `except CancelledError: pass` | survived (F2) |
| `except CancelledError: raise` unconditionally | survived (F2) |
| First-token wait without timeout (`timeout=None`) | killed: keep-alive test fails, no keep-alive between request and first chunk |

Wider run: every `tests/test_*frames*`, `test_*file_question*`, `test_*rag*` and `test_spec_addon_108*` file at `0f7a5e7`: 835 passed.

## Not verified

- I did not run the change against real uvicorn plus the core proxy (Next.js → core `addon_proxy` → intelligence). How often the cancel lands at `send` (F1) in production is an inference from uvicorn's `send()` source, not a measurement.
- The Ollama client's `generate_stream_with_images` (`app/llm.py:2024`, `async with self._http.stream(...)`): I reasoned about it but did not exercise it. Only the OpenAI-compatible client was tested.
- The test image installs unpinned fastapi/starlette (1.10.0) while production pins 0.46.2. I compared the 2.3 disconnect branch by source and did not run the suite on 0.46.2.
- I did not run the full intelligence suite.

TOTAL: 2 findings
