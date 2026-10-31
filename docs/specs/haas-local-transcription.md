# Haas: a local Japanese transcription provider

SPEC-ID: SPEC-ADDON-039

Approval:

## Summary

The intelligence addon gains a transcription provider `haas_local`. It runs the
quantized ONNX conversion of Haas-ja-v1.0 (`oboroge0/Haas-ja-v1.0-onnx-quantized`,
Apache 2.0, an unofficial community conversion) through `sherpa-onnx` on the CPU, on
the Litloft host. It is for an operator whose library is Japanese and who wants local
transcription about six times faster than `whisper_local`, without sending audio out.

It is opt-in: the default stays `whisper_local`. The operator selects it in the admin
transcription section or with `transcription.provider`, restarts as for any provider
change, and it applies to files transcribed from then on. Nothing is re-transcribed
automatically; **Regenerate** on the `whisper` task re-runs one file.

Measured on 2026-10-31 in a Linux arm64 container, 4 threads, against
large-v3-turbo int8 given the same decoded samples, on two 5-minute Japanese clips with
hand-corrected references, by reading CER with fillers stripped (conversational /
narration):

| Engine | CER | Speed | Peak RSS |
|---|---|---|---|
| large-v3-turbo | 2.11% / 0.38% | ~5x realtime | 1.65 GB |
| Haas, segments up to 45 s | 2.42% / 0.71% | ~30x | 1.3–1.5 GB |
| Haas, segments up to 25 s | 4.98% / 0.71% | ~30x | 1.1–1.3 GB |

## Required items

### 1. Normal flow

SPEC-ADDON-039:

1. The operator selects `haas_local` in the admin transcription section (or sets
   `transcription.provider: haas_local`) and restarts, as for any provider change.
2. A file reaches the transcription worker. `get_provider("haas_local")` returns the
   provider wrapped in `SplittingTranscriber`. Its capabilities are
   `sends_audio_offhost=False`, `supports_diarization=False`, `supports_hotwords=False`,
   `supports_word_timestamps=True`, `max_input_bytes` = 50 MB (the same as
   `whisper_local`), `accepts_initial_prompt=False`, `handles_own_retry=False`.
3. `transcribe` does all its blocking work on a worker thread, not on the event loop.
4. The provider decodes the audio to 16 kHz mono float32 samples by piping `ffmpeg`
   (`-vn -ac 1 -ar 16000 -f f32le`). It does not use `faster_whisper.decode_audio`, which
   raises `TypeError` with the PyAV version the image resolves to (av 19.0.1,
   faster-whisper 1.1.0, measured).
5. It finds speech with `faster_whisper.vad.get_speech_timestamps`, with
   `max_speech_duration_s` = `transcription.haas_local.max_segment_seconds` (default 45),
   `min_silence_duration_ms=300`, `speech_pad_ms=200`, other options at their defaults. A
   file with no spans ends here with an empty list: it never fetches or loads the model.
6. Under the module lock, when at least one span exists and no recognizer is loaded, the
   provider resolves the model with `huggingface_hub.snapshot_download` at the pinned commit
   `7f5ab0a4b1bf39db78afd6691eeecbc4f9d42e39` in `settings.model_cache_dir`, for
   `encoder.quantized.onnx`, `encoder.data`, `decoder.onnx`, `joiner.onnx`, `tokens.txt`,
   `LICENSE` and `NOTICE`. It first calls with `local_files_only=True`; only if that fails or
   one of those files is missing does it call again with network access. It then builds one
   recognizer:
   `sherpa_onnx.OfflineRecognizer.from_transducer(encoder, decoder, joiner, tokens,
   num_threads=<config>, model_type="nemo_transducer", feature_dim=128)`, every other
   argument at its default.
7. Each speech span is decoded separately, under the module lock, one at a time. A span
   whose words are non-empty becomes one `TranscriptionSegment`:
   - `language` is `"ja"`. `text` is the concatenated word texts. `start` is the first
     word's start and `end` the last word's end.
   - Word texts come from the recognizer's tokens, each with surrounding whitespace removed;
     a token left empty is dropped. In the measurement such whitespace occurred only on a
     span's first tokens, and Latin text arrives as one token per letter. Latin words spoken
     in a row run together in chunks, as `ja` joins words with no separator.
   - A maximal run of byte tokens such as `<0xE7><0x84><0x9A>` becomes one word holding the
     UTF-8 text it encodes (`焚`), from the run's first token start to its last token end.
     Bytes that do not form valid UTF-8 are dropped; a run that leaves nothing yields no word.
   - A word's `start` is `span start + token timestamp`, raised if needed to the previous
     word's `end`. Its `end` is `start + token duration`, or the next token's start or the
     span end when no duration is given, lowered if needed to the next token's start and
     to the span end, and never below `start`.
8. The existing pipeline builds chunks, embeddings and subtitles from those words,
   unchanged, and records `JobRecord.provider = "haas_local"`.

### 2. Failure cases

- `sherpa_onnx` cannot be imported, or the fetched files do not load: `FatalError`, no
  retry. A failed load leaves the recognizer not loaded, and the next job tries again.
- The model fetch fails (network, Hugging Face down, disk full, a partial snapshot with no
  network): `TransientError`. `SplittingTranscriber` makes three attempts in total with
  backoff and then fails the job. The circuit breaker does not count it, so during an outage
  each queued file makes its attempts and writes its own failed `JobRecord`.
- The repository, commit or a named file no longer exists on Hugging Face: `FatalError`, with
  no retry. A model already in the cache keeps working, because a complete cache makes no
  network call.
- `ffmpeg` called by the provider exits with a positive status, as measured for a video with
  no audio stream and for a corrupt file: one WARNING and an empty list, a zero-segment
  success. This is what `whisper_local` does with undecodable input (it catches and returns
  `[]`). The status cannot separate a bad file from a read error, so a read error on a good
  file also closes it this way, with only the WARNING to show; **Regenerate** re-runs it.
- `ffmpeg` killed by a signal (a negative status): `TransientError`.
- A file over the 50 MB cap goes through `SplittingTranscriber` first, whose own normalising
  `ffmpeg` raises `FatalError` on failure, as for every provider. So a corrupt or no-audio file
  over 50 MB is a failed job and is retried on later passes, while the same file under 50 MB
  is a zero-segment success.
- `ffmpeg` missing from the image: `FatalError`.
- VAD finds nothing, or raises `IndexError` (the existing code records this for very short,
  silent or corrupted audio; not reproduced on those inputs through ffmpeg, which returned
  no spans): an empty list.
- Any other VAD exception, or an exception from the recognizer on a span: `FatalError` for
  this file or chunk. The rest of its spans are not kept, because a transcript missing a
  stretch with no signal is worse than a failed job.
- No span yields words: an empty list, which the pipeline treats as a zero-segment success.
- Non-Japanese audio: not detected and not an error. It yields meaningless text (measured:
  English speech gave `queay back up sky kizden`). See item 7.
- Each case above that raises leaves a normal file not indexed, so a later pass or **Retry**
  tries again; each case that returns an empty list marks it indexed. Exception: Media Import temp audio (`.loft`) is one-shot for every provider.
  `_mark_loft_stt_temp_consumed` closes it after any provider failure, so a first-use fetch
  failure consumes that attempt, as it would for a cloud outage today.

### 3. States

Recognizer:

- `not loaded` → `loaded` on a job's first span.
- `loaded` → `not loaded` when idle for `memory.whisper_idle_unload` seconds, with that
  setting above 0. The clock starts when a load completes and restarts at the end of every span decode.
- A release never happens while a `transcribe` call is in progress, including one waiting
  on the lock.
- A failed load stays `not loaded`, and the next job tries again.
- `loaded` → `not loaded` on a recognizer exception, because the native state is unknown; the
  next job loads it again.
- There is at most one recognizer in the process.

Model files: `absent` → `present` once all seven named files exist at the pinned commit. A failed fetch leaves them
`absent` or partial, and the next attempt resumes. They do not leave `present` on their own:
they stay after the provider is deselected, and files that fail to load keep failing with
`FatalError` until the operator deletes that model directory, which the next job re-fetches.
The failure message names the directory.

A job's own states are unchanged.

### 4. Data read and written

- Writes `settings.model_cache_dir` (model files, about 460 MB, in the Hugging Face cache
  layout, as `whisper_local` does).
- Writes the search DB through the existing `_do_transcribe_and_index` only: transcript
  words, chunks, embeddings, `JobRecord`. No schema change.
- Reads the media file and `search-config.yml` / `transcription-overrides.json`.
- Does not touch the core DB or the filesystem of a drive.

### 5. External services

Hugging Face, to fetch the model at the pinned commit, once per install; the audio stays on
the host. There is no overall time limit, and the dispatch has none around a provider call.
While the fetch runs the job shows as running and, with `whisper_parallel` at its default of
1, other transcription waits. A stalled connection ends at `huggingface_hub`'s own read
timeout (not measured) and becomes `TransientError`. Down: `TransientError`. Contents wrong:
a load failure, `FatalError`. Once fetched, no network is needed.

### 6. Authorization

Unchanged. Selecting the provider goes through the existing `/admin/transcription`
endpoints behind the admin gate. `sends_audio_offhost=False`, so the per-drive
`transcription_cloud` policy does not apply; the `intelligence.index` check still does.

### 7. Effect on existing features

- `ALL_PROVIDERS` in `routers/admin.py` gains the name directly after `whisper_local`, so the
  GUI lists it second. `evals_transcription/runner.py` accepts it by name, but a run that names
  no providers does not include it, because it would download the model and score every case,
  non-Japanese ones included. `_PROVIDER_API_KEY_ENV` gains
  it with no key, and `_frozen_subconfig_summary` gains
  `"haas_local": {"model": "oboroge0/Haas-ja-v1.0-onnx-quantized"}`.
- A drive with `transcription_cloud: false` uses `haas_local` when it is selected, because
  it is local. Only off-host providers fall back to `whisper_local`.
- `language_hint`, `hotwords` and `initial_prompt` are accepted and ignored.
- Existing transcripts stay as they are until the file is re-indexed. **Regenerate** only
  flips the flag and enqueues; the old transcript stays until a provider call returns words,
  so a failed fetch does not lose it. A call returning an empty list also leaves it: the job
  shows as succeeded with `haas_local` while the old transcript stays, as for every provider
  today.
- Downstream of a non-Japanese file: the job succeeds, so its meaningless text is embedded,
  tagged `language="ja"`, wakes the LLM workers (summaries, auto tags) and is searched and
  read by Ask, like any transcript. The provider is process-wide, so this applies to every
  drive. The latest `JobRecord.provider` is the only hint of which engine produced a transcript.
- Transcript refine calls no provider: it realigns with WhisperX and rebuilds chunks from
  words with the `whisper_local` min and max durations. Whether it restores Haas's missing
  punctuation has not been measured (R-5 runs it).
- Every other provider behaves as before. `onnxruntime==1.21.0`, `faster-whisper==1.1.0` and
  `numpy==2.2.4` were measured importing alongside `sherpa-onnx==2.0.1` on arm64. A Linux
  x86_64 wheel for Python 3.12 exists on PyPI but was not run. `torch` / `whisperx` in the
  same process is covered by R-5.

### 8. Error behavior

The existing paths: a failed job appears under **N failed jobs** on the admin dashboard with
its error class and message, and in the `intelligence.transcription.failed` event. A fetch or
load failure message names the model repository and directory. Logs: one INFO line when the
recognizer loads and when it unloads; one WARNING for an `ffmpeg` failure; the existing
per-job lines otherwise.

### 9. User-visible behavior

- The admin transcription section lists one more radio, second in the list, labelled
  "Haas local (Japanese only)" / "Haas local（日本語専用）", with the line
  `model=oboroge0/Haas-ja-v1.0-onnx-quantized` and no API key row.
- The task label "Transcription (Whisper)" stays: it names the task and already shows for every
  cloud provider.
- The drive policy help for `transcription_cloud` currently says OFF "uses local Whisper
  only"; it changes to say a local engine.
- The first job after selecting it takes longer while the model downloads.
- Transcripts of files processed by it: in conversational speech far fewer punctuation marks
  than Whisper (measured 13 vs 114 in 5 minutes), so transcript chunks run closer to the 20 s
  ceiling (median 20 s vs 13 s in that clip) and subtitle cues break less naturally. Narration
  is the same as Whisper (106 vs 111). Numerals come out as digits; fillers tend to be dropped.
- `docs/addons/intelligence.md` states: Japanese only, and that other languages produce
  meaningless text without an error; an unofficial conversion; the punctuation above; that
  lowering `max_segment_seconds` lost a clause with no error in measurement, and raising it
  uses more memory (2.66 GB at 120 s); that the model stays on disk after deselecting it, and
  where.

### 10. Non-functional

- Peak memory stays near 1.5 GB at the default segment length on the 5-minute clips. A 50 MB
  chunk is about 33 minutes, which adds about 130 MB of decoded samples; R-5 measures it.
- A compressed file under 50 MB skips the splitter and is decoded whole: 49 MB at 32 kbps is
  about 3.4 hours, or about 780 MB of samples on top of the above. `whisper_local` has the same
  exposure, and this spec adds no duration limit.
- Decoding is serialised across concurrent jobs by the module lock, so `whisper_parallel`
  above 1 does not multiply recognizer memory. Decoded samples of waiting jobs are held
  outside it.
- `transcription.haas_local.num_threads`: an integer of at least 1, default 4.
  `transcription.haas_local.max_segment_seconds`: an integer from 15 to 120 (the measured
  range), default 45. A value outside these logs one WARNING and falls back to the default,
  like `_checked_hierarchical`.
- `sherpa-onnx==2.0.1` is pinned exactly: the conversion reaches sherpa-onnx's Parakeet TDT
  path through its metadata (`pred_hidden=20480`, `#tdt` in `url`), so a version bump needs
  re-measuring. The wheel adds about 37 MB to every image. The model is not in the image.
- Privacy: audio stays on the host.
- Speed on the production Mac Mini CPU has not been measured.

## Touch points

Addon repository `addons/intelligence` (SPEC-ADDON-039 tests go there, cited through the
pointer bump):

- `app/workers/transcription/haas_local.py`: new provider.
- `app/workers/transcription/__init__.py`: the factory arm.
- `app/config.py`: `HaasLocalProviderConfig`, `TranscriptionConfig.haas_local`, parsing and
  range checks.
- `app/routers/admin.py`: `ALL_PROVIDERS`, `_PROVIDER_API_KEY_ENV`,
  `_frozen_subconfig_summary`.
- `app/evals_transcription/runner.py`: `ALL_PROVIDERS`.
- `app/indexer.py`: calls the provider's idle check after the existing checks, so a failure in
  it does not skip them. The check runs on the event loop, so it never waits on the module lock:
  if the lock is held it does nothing this round.
- `requirements.txt`: `sherpa-onnx==2.0.1`.
- `search-config.yml.example`: the `transcription.haas_local` section, the provider list, the
  `transcription_cloud` comment and the `memory.whisper_idle_unload` comment.
- `frontend/AdminTranscriptionSettingsSection.tsx`: `PROVIDER_KEY_ENV`, `SearchConfigSummary`.
- `frontend/messages/{ja,en}.json`: `providers.haas_local`, the `transcription_cloud` policy
  help.
- `frontend/AdminTranscriptionSettingsSection.test.tsx`: the radio.
- `tests/`: new tests; existing tests that pin the provider list are extended
  (`test_admin_router.py`, `test_admin_whisper_model_summary.py`,
  `test_transcription_memory_cap.py`, `test_evals_transcription_runner.py`).

Core repository:

- `addons/intelligence`: the pointer bump.
- `docs/addons/intelligence.md`: the provider table, the local-versus-cloud sentences, the
  `transcription_cloud` sentences, the configuration example, the
  `memory.whisper_idle_unload` entry, the limits in item 9.
- `docs/reference/configuration.md`: the provider list and the `memory` row.
- `docs/specs/INDEX.md`, `docs/specs/haas-local-transcription.md`.
- `docs/process/reviews/feature-haas-local-transcription/`.

Rules passed through: `.claude/rules/design-decisions.md` (Addons, Transcript Refine),
`.claude/rules/backend-conventions.md` (the language-dependent rule prohibition),
`.claude/rules/frontend-conventions.md` (translation file policy). No protected path is
edited. No endpoint, table, or WebSocket event is added.

## Invariants

I1. No word or segment text from `haas_local` contains a literal byte token such as `<0xE7>` or a replacement character: a valid run yields the character it encodes, invalid bytes yield nothing, and a segment's text equals its concatenated word texts.
I2. Within a segment every word satisfies `span start <= start <= end <= span end` and `end <= next word's start`, even when the recognizer's times overlap or omit durations, and times are offsets into the file, not into the span.
I3. VAD is called with `max_speech_duration_s` equal to `max_segment_seconds`, whose default is 45, and the recognizer is built with the configured `num_threads`; a setting outside its range falls back to the default with one WARNING.
I4. A segment always has at least one word and `language == "ja"`; a span yielding no words produces no segment; no speech, a positive `ffmpeg` exit status, or a VAD `IndexError` returns an empty list without fetching or loading the model, and the job counts as a zero-segment success, with `JobRecord.provider == "haas_local"`.
I5. `transcription.provider` defaults to `whisper_local`, and while another provider is selected nothing imports `sherpa_onnx`, loads a recognizer or fetches the model, including the indexer's idle check.
I6. `haas_local` declares `sends_audio_offhost=False` and `max_input_bytes` of 50 MB, and a drive with `transcription_cloud: false` transcribes with `haas_local` when it is selected, without constructing `whisper_local`.
I7. The model fetch names the pinned commit, never a moving ref, and a complete cache makes no network call. A fetch failure raises `TransientError`, except a repository, commit or file that no longer exists, which raises `FatalError`. A `sherpa_onnx` import failure, a load failure, a missing `ffmpeg`, a non-`IndexError` VAD exception and a recognizer exception raise `FatalError`, with a fetch or load message naming the repository. Each leaves a normal (non-`.loft`) file not indexed and its previous transcript in place.
I8. There is at most one recognizer in the process; fetch, load, unload and recognizer decode never overlap across concurrent `transcribe` calls; and neither a `transcribe` call nor the idle check blocks the event loop, including while the lock is held.
I9. With `memory.whisper_idle_unload` above 0, the recognizer is released after that many seconds since the last span decode, never during a `transcribe` call, and the next job loads it again and succeeds; at 0 or below it is never released by the idle check; a recognizer exception releases it.
I10. The admin transcription endpoints list `haas_local` second, accept saving it without any API key and report its model repository in `search_config_summary`; the eval harness accepts it by name and leaves it out of a run that names no providers; and the settings section renders the radio with the label in both locales and no API key row.

## Checked, no action

- **Detecting the language and routing non-Japanese files elsewhere.** Asked as a question at
  approval. Default in this spec: none. The operator chose a Japanese-only engine, and
  detection would load Whisper alongside it, which removes much of the gain. The label and the
  docs state the limit, and item 7 states the reach.
- **`whisper_local`'s failure with the same PyAV version.** Separate defect, separate fix: this
  spec neither depends on it nor changes it.
- **The language-dependent rule prohibition.** `language="ja"` is a fact about this model, not
  one language's vocabulary standing in for a concept, and no string rule branches on it.
- **The official `haas-asr` package.** It requires Linux and an NVIDIA GPU (flash-linear-
  attention needs Triton and CUDA), so it cannot run in this CPU container. Its `Vocabulary`
  uses NeMo's GPU phrase boosting, so `hotwords` are not available here.
- **Restoring punctuation in the provider.** That would be a new model or rule. Transcript
  refine exists for this and is the operator's choice.
- **Segment length as measured.** 45 s was chosen on the same two clips it was measured on. At
  25 s a clause of about 40 characters disappeared next to a segment boundary, with no error;
  at 45 s it survived. The cause is not isolated, so the setting is exposed, and this spec makes
  no claim that 45 s never loses text.
- **Word timing accuracy.** The sampled chunk starts were within 0.05–0.35 s of Whisper's, and
  there is no timing reference. Subtitle timing as seen is on the `agent_cannot_verify` list, so
  the human judges it when trying the provider.
- **A time limit or a queue stop on the model fetch.** A first-use download once per install on
  a home network; item 5 states what happens meanwhile. A stop-the-queue path would be new
  dispatch behaviour for a one-time event.
- **What runs where.** `Dockerfile.test` installs neither `sherpa_onnx` nor `faster_whisper`,
  and `conftest.py` stubs `faster_whisper`. CI verifies the provider with a fake recognizer, VAD
  and decoder: I3 there means the argument passed. R-5 exercises the real path in the running
  stack and must cover: real VAD spans within the limit; `ffmpeg` decode; a byte-token word (the
  `焚`, `梱` clip) in chunks and subtitles; a file over 33 minutes, reporting peak memory; a no-audio
  video under 50 MB and one over it; transcript refine in the same process after a Haas job. If
  R-5 finds `sherpa_onnx` cannot share the process with `torch` / `whisperx`, the work stops and
  returns to the human. `Dockerfile.test` is a CRITICAL
  zone and stays unchanged.
- **Exact-pin and label text as invariants.** Reviewed in the diff; a test on a requirements line
  checks nothing the review does not.
- **Generalising to any sherpa-onnx model.** No second model exists to justify a model repository
  setting; the commit is pinned on purpose.
- **Pre-downloading at startup or from the GUI.** Lazy fetch on first use matches how the Whisper
  model arrives.
- **A new idle-unload setting.** `memory.whisper_idle_unload` is reused for the one local engine
  in use, and its comment and doc entry say so.
