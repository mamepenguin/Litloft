# Extra review: concurrency and failure paths (video Ask frames)

Reviewed: intelligence addon `9d47ffe` (diff `c03844e..9d47ffe`), spec
`docs/specs/video-ask-frames.md` at core `37a27855d`. Scope: I1, I6, I7, I8,
leaks. Threat model: personal tool, owner only, no adversary.

Reproductions ran in a private worktree of `9d47ffe` with the addon's
`Dockerfile.test` image (Python 3.12; Starlette from the unpinned `fastapi` in
that image). Production uvicorn 0.34.2 sends ASGI `spec_version` "2.3", so
Starlette's disconnect path is the task-group cancel path, the same path the
reproductions use.

## Findings

### F1. Closing the tab while the model is answering raises `RuntimeError: aclose(): asynchronous generator is already running`

- Bucket: A
- Where: `app/routers/rag.py:839-841` (`_frames_question_stream` finally,
  `await stream.aclose()`) together with `app/routers/rag.py:844-882`
  (`_answer_with_keepalive`: the pump task iterates `stream`; its finally only
  calls `task.cancel()` and does not await the task).
- Claim: on a disconnect after the model request was sent (before or after the
  first token), the cancellation reaches `_answer_with_keepalive` first; it
  requests the pump's cancel but returns before the pump has unwound, so the
  pump is still suspended inside `stream.__anext__`. The frames path's finally
  then calls `stream.aclose()` on that running generator, which raises
  `RuntimeError`. The `RuntimeError` replaces the `CancelledError`, so the
  response task ends with an exception instead of being cancelled; Starlette
  re-raises it out of the task group and uvicorn logs "Exception in ASGI
  application" with a traceback.
- What still works (measured): the slot is released (outer `finally`), and
  the pump's cancel does reach the provider stream a moment later (the stream's
  own `finally` ran, `CancelledError` was delivered inside it).
- Ordinary use: ask about a silent clip, close the tab or navigate away while
  the answer streams, or while a slow local model is still processing 8 frames.
- Frequency: 5 (every tab close mid-answer on the frames path).
- Impact: 3 (no wrong answer, no leaked slot; an error traceback in the addon log
  for every such close, which looks like a server fault and hides real ones).
- Evidence: reproduced. Scratch test (not committed) with a vision client whose
  `generate_stream_with_images` yields 0 or 1 tokens and then sleeps; raw ASGI
  call, `http.disconnect` sent after the first `answer_chunk` (or after two
  keep-alives once the model started):
  `OUTCOME 2.3 0 raised RuntimeError: aclose(): asynchronous generator is already running model_closed True cancelled_inside True slots 3`
  `OUTCOME 2.3 1 raised RuntimeError: aclose(): asynchronous generator is already running model_closed True cancelled_inside True slots 3`
  Re-run on the shipped stack (`pip install fastapi==0.115.12`, Starlette
  0.46.2) with the same result, and with the real `LLMClient` (OpenAI SDK over
  `httpx.MockTransport`) and the real `OllamaLLMClient`, each answering one
  chunk and then hanging:
  `REAL openai raised RuntimeError: aclose(): asynchronous generator is already running response_closed 1 slots 3`
  `REAL ollama raised RuntimeError: ... response_closed 1 slots 3`
  So the provider HTTP response is closed and the slot is freed; the defect is
  the exception, not a leak.
  Fix shape, tested against the same reproduction (all four cases then end
  cleanly, provider response closed, slot freed): in `_answer_with_keepalive`'s
  finally, after `task.cancel()`, await the pump (`try: await task / except
  asyncio.CancelledError: pass`) so the generator is no longer running when the
  caller closes it. Whoever fixes it should make sure that `except` does not
  also swallow a cancellation aimed at the outer task (for example await via
  `asyncio.gather(task, return_exceptions=True)` and re-raise if the current task
  is cancelling). No acceptance test disconnects after the model request was
  sent (mutation table, M15).

### F2. The keep-alive timer restarts at the hand-off from frame preparation to the model, so the silence there can reach just under 10 s plus the prompt build

- Bucket: B
- Where: `app/routers/rag.py:720-726` (preparation loop, 5 s waits) and
  `app/routers/rag.py:867-873` (`_answer_with_keepalive`, a fresh 5 s wait).
- Claim: if preparation finishes just before its next 5 s tick, the next byte is
  the first tick of `_answer_with_keepalive`, 5 s later. The silence is
  `(time since last keep-alive) + 5 s + prompt build/base64 of the frames`,
  which is below 10 s except by the few milliseconds of that build. I8 says
  "no 10 s passes without a byte"; in practice the bound is met to within
  milliseconds, and the proxy limit it protects is 30 s.
- Frequency: 0 (exceeding 10 s needs the preparation to end within
  milliseconds of a tick). Impact: 1.
- Evidence: code reading; not reproduced. The I8 test only measures the
  preparation phase and allows 10.5 s.

### F3. A YouTube frame preparation queued on the process-wide ffmpeg slots still starts ffmpeg after a disconnect or after the 45 s wait

- Bucket: B
- Where: `app/rag/file_question.py:505-510` checks `cancelled` before
  `ensure_youtube_frame`; `app/youtube_source.py:301-313` then does the
  description lookup and blocks on the process-wide `_slots` (4) with no further
  check.
- Claim: a preparation thread that is inside `ensure_youtube_frame` waiting for
  `_slots` (held by scene tiles or `get_video_frame`) runs its ffmpeg seek after
  the tab closed or the route stopped waiting, for a frame nobody will send.
  The result is a correct cache entry (atomic write, right key), so nothing is
  wrong, only up to 4 wasted seeks that delay the other users of the same slots.
  The spec's failure table accepts "frame work already running finishes within
  its own bound"; whether a thread blocked before its ffmpeg counts as running
  is a reading of the spec, so this is recorded rather than flagged.
- Frequency: 1. Impact: 2.
- Evidence: code reading; not reproduced.

### F4. Test gap: no test covers the keep-alive while the model is working toward its first token (I8)

- Bucket: A (test gap)
- Where: `app/routers/rag.py:869` (`timeout=_KEEPALIVE_SECONDS if first else None`);
  tests: `tests/test_spec_addon_108_video_frames.py::TestTheWaitBound` only
  measures the preparation phase with a model that is never called.
- Claim: the implementation is correct today. The F1 reproduction saw
  keep-alives after the model had started and before any token. But mutant M13
  (never time out while waiting for the first token) passes every test.
- The defect it would let through: a local vision model reading 8 frames
  (about 10,000 input tokens) can take more than 30 s to its first token. With
  no keep-alive the Next.js rewrite proxy closes the request at 30 s of silence,
  and the question fails every time on that model.
- Frequency (of the escaped defect): 8 for an owner on a slow local model.
  Impact: 5 (Ask on a silent video is unusable, but the failure is visible).
- Evidence: mutation M13 survived (59 passed).
- Suggested test: a vision double that waits more than 10 s (or a patched
  `_KEEPALIVE_SECONDS`) before its first token, asserting a `: keepalive` line
  between the request being sent and the first `answer_chunk`.

### F5. Test gap: no test disconnects after the model request was sent

- Bucket: A (test gap)
- Where: `app/routers/rag.py:844-882` (`_answer_with_keepalive`, pump task);
  tests: the only disconnect test
  (`TestPreparation::test_a_disconnect_starts_no_more_frames_or_model_and_frees_the_slot`)
  hangs up during frame preparation.
- Claim: mutant M15 (the pump task is never cancelled) passes every test. That
  is the path where F1 lives, and nothing exercises it.
- The defect it would let through: after the tab closes, the pump keeps reading
  the provider stream to its end, so a local GPU keeps generating (and delays
  the next question) or a cloud model keeps billing for an answer nobody reads.
  The slot is still released, so it is silent.
- Frequency (of the escaped defect): 5 (every tab close mid-answer).
  Impact: 5 (wasted GPU time or cost, not noticed).
- Evidence: mutation M15 survived (59 passed). The F1 reproduction
  (disconnect after the first `answer_chunk`, and after the model started but
  before a token, with the real OpenAI-compatible and Ollama clients) would
  serve as the test: assert the provider response is closed, the slot is
  free, and the response task does not end in an exception.

## Mutation table

All mutants ran in a private worktree of `9d47ffe` against
`tests/test_spec_addon_108_video_frames.py` and
`tests/test_spec_addon_109_frame_citations.py`, 4 containers in parallel.
Unmutated baseline under the same load: 59 passed. Every kill that came from
the timing-sensitive tests (the four-at-once test and `TestTheWaitBound`) was
re-run alone and failed again.

| # | Mutation | Result |
|---|---|---|
| M01 | slot released only on a normal end (no `finally`) | killed by `TestPreparation::test_a_disconnect_starts_no_more_frames_or_model_and_frees_the_slot` |
| M02 | no `cancelled.set()` on disconnect | survived (masked by task cancellation, see M27) |
| M03 | no `prepare.cancel()` / await on disconnect (event still set) | survived (masked by the event; the orphaned task runs on until 45 s but starts no ffmpeg) |
| M04 | 8 preparations at once | killed by `TestPreparation::test_at_most_four_run_at_once_position_first_then_time_order` (re-run alone: killed) |
| M05 | 5 preparations at once | killed by the same test (re-run alone: killed) |
| M06 | position frame started last | killed by the same test (re-run alone: killed) |
| M07 | scene frames started in reverse time order | killed by the same test (re-run alone: killed) |
| M08 | no `loop.time() >= deadline` guard inside `prepare` | survived; equivalent in practice, because pending tasks are cancelled synchronously right after `asyncio.wait` times out, so no task gets past the slot in between |
| M09 | `asyncio.wait` with no timeout | killed by `TestTheWaitBound::test_the_route_stops_waiting_by_45_seconds_and_keeps_the_line_alive` (re-run alone: ended at 60 s) |
| M10 | wait 60 s instead of 45 s | killed by the same test (re-run alone: ended at 60 s) |
| M11 | keep-alive every 10 s | survived; on the spec's own 10 s boundary, so treated as equivalent |
| M12 | keep-alive every 12 s | killed by the same test (gaps 12.0 s) |
| M13 | no keep-alive while waiting for the model's first token | **survived** — F4 |
| M14 | no keep-alive during preparation | killed by the same test (no `: keepalive` in the body) |
| M15 | pump task never cancelled | **survived** — F5 |
| M16 | OpenAI-compatible multi-image call records the verdict on 400/404 | killed by `TestTheProvidersAnswer::test_a_refusal_is_frames_rejected_and_writes_no_verdict[400-openai_compatible]` |
| M17 | Ollama multi-image call records the verdict | killed by `...writes_no_verdict[400-ollama]` |
| M18 | no `cancelled` check in `extract_frame_to_cache` | survived (masked, see M02) |
| M19 | no `cancelled` checks in `_frame_image` | survived (masked) |
| M18+M19 | both cancel checks in the worker removed | survived (masked by task cancellation) |
| M20 | `prepare_frames` does not cancel its child tasks when cancelled | survived (masked by the event) |
| M02+M20 | neither the event nor the child-task cancel | killed by the disconnect test |
| M27 | no disconnect handling at all in the frames path's `finally` | killed by the disconnect test |
| M21 | pending tasks not cancelled at the deadline | killed by `TestTheWaitBound` (re-run alone: ended at 60 s) |
| M22 | text-less test ignores `material.chunks` (I1) | killed by `TestWhenTextArrives::test_the_next_question_after_a_transcript_lands_takes_the_text_path` |
| M23 | an exception from the frame preparation escapes instead of ending in `frames_unusable` | survived. Escaped defect: the stream would die without `done`. `prepare_frames` catches nearly everything itself, so the path needs a bug elsewhere first; frequency about 0, impact 3 |
| M24 | deadline taken when the stream starts instead of at the slot | survived; equivalent (the generator starts at once after the slot is taken) |
| M25 | `ImageRejected` not caught (refusal becomes the generic failure) | killed by `test_a_refusal_is_frames_rejected_and_writes_no_verdict` (4 parametrizations) |
| M26 | no timeout on the scene-candidate read | survived. Escaped defect: a scene-candidate read slower than 45 s (a locked or very large `search.db`) holds the question past I8's bound; frequency 1, impact 3 |

The cancel layers: the disconnect test catches losing both layers (M02+M20,
M27), but not either one alone. The event's own job is a preparation already
handed to a worker thread but not yet at ffmpeg. That happens only when the
default executor is saturated, and no test reaches it.

## Not verified

- ASGI spec_version 2.4 (Starlette's no-listener branch). In the scratch run a
  disconnect during the model wait raised `ClientDisconnect` with the slot still
  held 2 s later. Uvicorn 0.34.2 (the pinned server) sends "2.3", so this branch
  does not run in production; not pursued.
- A disconnect before Starlette first iterates the generator, which would leave
  the slot held. The text path has the same shape (not new), and the window is
  microseconds; not reproduced.
- Behaviour with a saturated default thread pool (many questions plus other
  `to_thread` work): not measured.
- `min_request_interval_ms` can delay the model request inside the pump past
  45 s after the slot. It is opt-in config and a shared client behaviour, and
  keep-alives continue meanwhile; not measured.
- Keep-alive "while waiting for the slot": does not apply. The slot is taken
  without waiting (`wait_for(..., 0.001)`, otherwise 503) before the stream
  starts.
- I6 beyond the tests: by reading, no other code on the frames path writes the
  verdict. `ImageRejected(FAILURE_REQUEST_FAILED)` for a missing
  `vision_model` writes nothing.
- The real YouTube path (yt-dlp, network): only the test doubles ran.

TOTAL: 5 findings
