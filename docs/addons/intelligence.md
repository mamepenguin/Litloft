# intelligence addon

The `intelligence` addon adds LLM-backed search, Q&A, summarization, and tag suggestions to Litloft. It is by far the largest addon: it runs in its own container (port 8100), maintains its own SQLite database under `data/addons/intelligence/`, and ships with ~500 MB of ML models.

## What it provides

| Feature | What | Default |
|---|---|---|
| **Indexing** | Scans drives, extracts text/frames/audio, builds embeddings | on |
| **Semantic search** | BM25 + dense vector hybrid retrieval over text, transcripts, image frames | on |
| **Auto-tags** | LLM proposes tags; Suggest → Approve workflow | manual |
| **AI summaries** | Short (1 sentence) + long (paragraph) summaries per file | manual |
| **AI chapter candidates** | LLM proposes timestamped media chapters; Suggest → Approve workflow | false |
| **Detailed summaries** | Long-form Markdown with citations | false |
| **Ask (RAG)** | Question answering over your library with cited sources | on |
| **Retrieval keywords** | LLM-generated synonyms and alternate names indexed for file search | false |
| **Transcript refine** | LLM correction of ASR output, with revert | false |
| **Vision describe** | LLM image descriptions, photo-by-photo | manual |
| **Transcription** | faster-Whisper (local) or cloud providers | local |
| **CLIP frame analysis** | Scene-aware video frame embeddings for "find a moment" | on |
| **Pickup** | A feed of files you have never opened, drawn from your whole watch history | on |

Shipped defaults are conservative — most LLM-driven features start at `"false"` or `"manual"` so an unconfigured install never makes outbound LLM calls until you turn a feature on (in the browser or in `search-config.yml`). All features are opt-out per drive via the [settings GUI](../admin-guide/settings-gui.md).

> **Image needed:** screenshot of the Ask page with a citation-linked answer. See [`IMAGES-NEEDED.md`](../IMAGES-NEEDED.md).

## Privacy at a glance

The intelligence addon can send your file content to an LLM API. Whether anything leaves your machine depends on:

- **`llm.provider`** — `"ollama"` or a local LLM means nothing leaves the host. `"openai_compatible"` pointed at a remote API means content does.
- **`features.rag`** — when on, file text/transcripts go to the LLM on every Ask.
- **`features.vision_describe`** — image bytes go to the vision model.
- **`transcription.provider`** — `"whisper_local"` keeps audio local; `"deepgram"`, `"elevenlabs_scribe"`, `"openai_compatible"` send audio to the cloud.

**Per-drive overrides** in `drives.json` let you keep specific drives strictly local:

```json
{
  "name": "Private",
  "addons": {
    "intelligence": {
      "transcription_cloud": false,
      "rag": false
    }
  }
}
```

Defence in depth: the host proxy enforces the policy *before* dispatching, and the addon worker re-checks `is_feature_enabled()` so a missed gate becomes a no-op rather than a leak.

## Installation

The addon lives under `addons/intelligence/` and is tracked as a Git submodule. The recommended path is to answer **yes** when `configure.py` prompts to enable the intelligence addon — it writes the matching service block into `docker-compose.override.yml`, mounts the configured drives read-only, seeds `search-config.yml` from the example, and generates `SEARCH_WEBHOOK_SECRET` into `.env` for both containers. Then:

```bash
docker compose up -d --build
```

For a manual install (no `configure.py`), add the blocks below to `docker-compose.override.yml`, set `SEARCH_WEBHOOK_SECRET` in `.env` (`openssl rand -hex 32`), copy `search-config.yml.example` to `search-config.yml`, and rebuild.

```yaml
services:
  backend:
    environment:
      - INTELLIGENCE_SERVICE_URL=http://intelligence:8100
      - SEARCH_WEBHOOK_SECRET=${SEARCH_WEBHOOK_SECRET:-}

  intelligence:
    build: ./addons/intelligence
    expose:
      - "8100"
    environment:
      - DRIVE_MOUNTS=default=/drives/default
      # The DB keeps its host filename under the directory mount below.
      - HOMEVAULT_DB_PATH=/data/data.db
      - HOMEVAULT_INTERNAL_URL=http://backend:8000
      - LLM_API_KEY=${LLM_API_KEY:-}
      - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY:-}
      - ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY:-}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - ASSEMBLYAI_API_KEY=${ASSEMBLYAI_API_KEY:-}
      - GEMINI_API_KEY=${GEMINI_API_KEY:-}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}
      - SEARCH_WEBHOOK_SECRET=${SEARCH_WEBHOOK_SECRET:-}
    volumes:
      - ./addons/intelligence/search-config.yml:/app/search-config.yml:ro
      - ./data/addons/intelligence:/intelligence-data
      # The data directory, not the DB file: SQLite needs data.db-wal and
      # data.db-shm beside data.db, and a per-file mount of a path SQLite
      # has checkpointed away becomes a Docker-created directory. The
      # second line masks the core's token signing key. See
      # docs/admin-guide/docker-compose.md#read-only-mounts-for-addons.
      - ./data:/data:ro
      - /dev/null:/data/.jwt_secret:ro
      - ./videos:/drives/default:ro
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

`INTELLIGENCE_SERVICE_URL` on the **backend** is what lets the core's addon proxy find the service; without it the routes 404.

`SEARCH_WEBHOOK_SECRET` has to be on **both** containers or neither. The core builds the `X-Webhook-Secret` header inside the backend container from its own environment, and the addon compares it in its own — set it on the addon alone and every lifecycle webhook 403s, so indexing quietly stops with no other symptom. Set it on the backend alone and the addon's gate simply stays a no-op. It also only does anything when `addons/intelligence/manifest.json` declares `"secret_env": "SEARCH_WEBHOOK_SECRET"` on every listener, which is what makes core attach the header at all; a submodule pinned to an older commit does not, and the secret should then be left out of both blocks.

The first boot downloads ML models (Whisper, CLIP, embeddings, optionally BLIP). Expect 1–3 GB of weights cached under `data/addons/intelligence/models/`.

---

## Features in detail

### Indexing

The addon's reconciler (default every 60 minutes — `indexing.reconciliation_interval`) walks the core DB, finds files that have not yet been indexed, and runs a per-MIME pipeline:

- **Text/Markdown/PDF/Office** — extract text, split into chunks (`indexing.text_chunking`), embed each chunk.
- **Audio/Video** — transcribe (faster-Whisper or cloud), align word timestamps, chunk transcript, embed. After transcription, extract top keywords (Janome + TF-IDF) and store a single keyword-bag embedding (`embedding_type="tfidf_keywords"`) for the *Similar Files* feature.
- **Video** — additionally extract frames (scene-detect with `indexing.frame_extraction`), embed each frame with CLIP.
- **Image** — embed with CLIP; optionally caption with BLIP for auto-tags.

The pipeline is idempotent: re-indexing a file replaces its old embeddings.

### Semantic search

`GET /api/addons/intelligence/search` runs:

1. Encode the query with the text-embedding model (`models.text_embedding`).
2. KNN over file-chunk embeddings, BM25 over the FTS5 mirrors.
3. Blend with `search.alpha` (default 0.7 — vector-heavy).
4. Filter by `search.min_score_clip` for visual hits.
5. Return up to `search.default_limit` results, capped at `search.max_limit`.

The frontend renders this as **Semantic Search** mode in the search page. **Find mode** is the same retriever, tuned for "I know roughly what" queries.

### CLIP frame search ("scene search")

A toggle in the search page enables matching against per-second video frame embeddings. Useful for *"find the part where they go to the lake"* style queries. Score floors:

- `min_score_clip` — for the representative frame stored per file (always indexed).
- `min_score_clip_thumbnail` — for individual scene-detected frames.

Both default to 0.05 because SigLIP2 produces lower absolute cosine values than older CLIP models.

### Auto-tags

When `features.auto_tags = "on_index"`, every newly indexed file gets a set of LLM-proposed tags. They are stored as **suggestions** — never auto-applied. The shipped default is `"manual"`, so suggestions are generated only when you click *Regenerate* on a file.

In the file detail page, the chip editor shows them under *Suggested*. Per chip:

- **Approve** — writes through `saveFileTags`. Retried once on `ConflictError`.
- **Dismiss** — drops the suggestion without writing.
- **Regenerate** — re-runs the LLM for this file.

Modes:

- `"false"` — disabled.
- `"manual"` — generated only when the user clicks *Regenerate*.
- `"on_index"` — generated automatically after each indexing pass.

For images, captions from BLIP (when configured) seed the LLM tag prompt.

Before the LLM runs, local pipelines assemble grounding candidates: CLIP
zero-shot scoring against a curated vocabulary plus the drive's own tag names,
tags voted for by visually similar already-tagged files, and TF-IDF keywords
from the transcript and filename. All three stay inside the file's drive — a
drive is a security boundary, so nothing another drive contains can shape the
suggestions you see. With no LLM configured, these candidates are the
suggestions.

### AI summaries

Two layers:

- **Short / long summary** (one sentence + one paragraph) — display-only, never written to the core DB. Generated via sliding windows over the transcript / text. Skipped when usable content is below `summaries.min_context_chars`.
- **Detailed summary** — long-form Markdown with embedded **citations** linking each bullet to a chunk in the source. Editable in place; the citation index re-runs after every save.

Citation accuracy is tuned by a dozen knobs in `summaries.*`:

- `citation_threshold` — cosine floor for *has_citation = true*. Below this, the UI renders *no strong source* (⚠), which doubles as a hallucination signal.
- `citation_top_k`, `citation_top_k_internal`, `citation_rrf_k` — pool sizes for hybrid retrieval.
- `citation_section_anchor_enabled` and friends — heading-aware narrowing so citations stay within the right Markdown section.
- `citation_margin_gate`, `citation_margin_bypass_score` — drop low-confidence top-1 picks when the runner-up is close.
- `citation_multi_anchor_enabled` — split compound bullets on punctuation, retrieve per fragment, union results.

Sensible defaults work for most libraries; tune up if you see ⚠ on obviously-grounded bullets, tune down if hallucinations slip through.

### AI chapter candidates

For audio and video with timestamped transcripts, `features.chapter_suggestions`
can ask the configured LLM to propose a complete chapter set. Long transcripts
are processed in bounded, time-ordered windows and consolidated hierarchically,
so generation covers the full transcript instead of truncating it to an opening
excerpt.

Granularity is semantic rather than numeric: a boundary represents a distinct
destination in a table of contents, while examples, clarifications, speaker
changes, repetitions, and brief digressions stay with their central subject.
Every result, including a single-window transcript, receives a candidate-only
editorial pass. Candidate lists are merged rather than cut to a fixed count, so
the ending cannot disappear behind a head-only cap. The provider's token setting
remains a safety ceiling, not a chapter-count or output-length control.

Malformed/empty model output is retried once with a broader-outline repair
instruction. A second failure emits a drive-scoped failure event, stops the UI's
progress state, and leaves the previous staged proposal and core chapters intact.

The file detail panel distinguishes two failures, because their remedies differ.
An output budget exhausted before the model wrote anything — the model was
thinking, or the answer outran `max_tokens` — is reported as such and points at
`llm.reasoning` and `llm.max_tokens`; anything else advises a retry. A window
that fails takes the whole file with it rather than being skipped, because
dropping one would leave a gap in the middle of the timeline.

Candidates remain staged in the Intelligence database until a user reviews the
whole set in the file detail page:

- **Approve all** replaces the file's active core chapter set. Core assigns
  dense ordering and records the promoted rows as `curated`; the addon cannot
  spoof provenance or ordering.
- **Dismiss** keeps the core chapter set unchanged and marks the staged proposal
  dismissed.
- **Create again** replaces the staged proposal only after the new generation
  succeeds.

Modes (`features.chapter_suggestions`):

- `"false"` — disabled. Default.
- `"manual"` — generated from the file detail page.
- `"on_index"` — generated after transcription; files missed while the worker
  was offline are picked up by the startup sweep.

Approval requires the same non-empty `CORE_INTERNAL_SECRET` in core and the
Intelligence container. Missing configuration fails closed and leaves the
candidate pending; generation and dismissal do not write core chapters.

### Ask (RAG)

`POST /api/addons/intelligence/ask` is question answering over your library:

- **Stage 1 (hierarchical, optional)** — coarse shortlist of files based on per-file summary embeddings. Bypassed for tiny drives (`min_drive_files_for_shortlist`) and when the top cosine is too low (`coarse_score_threshold`).
- **Stage 2** — chunk-level retrieval scoped to the shortlist; multi-query expansion via `clue_count` clues.
- **Personal-history scoping** — when enabled, weight files the calling viewer has actually opened, scoped by `max_lookback_days`. Requires a `lit_viewer` cookie; without one, falls back to the legacy viewer-agnostic path.
- **Category expansion** — opt-in: an LLM rewrite of vague terms (*SF っぽい*, *ホラー系*) into a small bag of surface forms before retrieval. Capped by `max_terms`.
- Pack `top_k` files into a context window (`max_context_chars_per_file` × `top_k`, capped by `max_total_context_chars`).
- Generate the answer with `max_tokens`. Citations are matched against the retriever's result set; anything outside is dropped (anti-hallucination).

Access control is applied **twice**: once on the internal filter (Internal API `filter-file-ids`) and once via `drive_access_nested` on the addon side.

### Pickup

A feed of files in this drive that **you have never opened**, ranked by
how well they match the interests your watch history describes. It sits
on the drive home as a carousel, with the full feed on its own page.

Nothing is sent anywhere — this feature makes no LLM calls. It reads the
embeddings indexing has already produced.

**How the ranking works**

- Your last year of watch history in this drive is clustered into a
  handful of *interests*, per embedding channel (video and image
  thumbnails, transcript keyword bags, document text). Clustering sees
  every entry in the window; recency is a weight on an interest, never a
  filter on which interests exist.
- Each interest gets a weight from its decayed mass, log-compressed so
  forty episodes do not count as eight times a five-file interest, then
  scaled so **the quietest interest keeps at least a quarter of the
  turns the loudest one gets**. An interest you have not touched for
  months stays visible instead of vanishing.
- Every interest is scored against the drive's candidates in one pass,
  and the results are woven together so each interest's share of the
  feed matches its weight.
- A file you have opened — ever, not just recently — is never a
  candidate.

**What it does not do**

Watching a lot of one series does bias the feed toward that series. The
profile reports what your history looks like, and a long-running series
splits into several interests because it genuinely contains several —
different eras, formats and openings. Telling "more of the same subject"
apart from "a related but different subject" needs a judgement the
embeddings do not carry, so the feature does not pretend to make it.

**Per drive.** A drive is a security boundary: the feed never draws on
another drive, and a locked drive contributes nothing.

**When it appears.** The carousel needs a viewer profile (a nickname) —
without one there is no watch history to read. It stays hidden until the
first sweep after you have watched something. The link to the full page
appears once the feed holds at least 40 files; below that the carousel
is already showing everything there is.

**How fast it forgets.** An interest halves in weight every week you do
not touch it. Stop watching something you had been watching heavily and
its share of the feed roughly halves within a fortnight; it clears
entirely once the last of it falls out of the year-long window. Keep
watching it a little and it keeps a proportional share indefinitely.

Interests you have not touched for months do not disappear — they hold a
floor share whatever their age. What decays is how much *more* than that
floor a current interest gets.

**Freshness.** The feed is rebuilt when a scan completes and on an
hourly sweep, and only for viewers whose history has actually changed.
The carousel shows a different twelve each day, drawn from the top of
the feed; the page itself keeps a stable order so paging through it does
not repeat or skip.

### Retrieval keywords

When enabled, the LLM reads each indexed file and predicts synonyms, abbreviations, and alternate names that users might search for. The results go into a dedicated FTS index (`fts_retrieval_keywords`) that file search and Ask UNION into their keyword channel, producing a **キーワード** chip on matching results.

**Why this matters for transcribed content.** ASR models (Whisper) frequently misrecognise proper nouns — people's names, brand names, product titles. The embeddings and FTS indexes are built from that imperfect text, so a user searching the canonical name finds nothing. Retrieval keywords close this gap: the LLM has world knowledge and infers the correct proper noun from context even when the transcript text is wrong.

The generated keywords are **tier-3 data** (LLM-generated, not human-verified). They shape retrieval scoring but are never used as citation sources. A file appearing in both the keyword and body channels gets a natural RRF boost in ranking; a keyword-only hit ranks slightly below body hits by design.

Practical notes:

- Search queries shorter than 3 characters do not match due to the trigram FTS minimum. Semantic search and body text fill in for these.
- The LLM prompt instructs it to generate words *not already in the document*, but small models occasionally echo the filename or body text. A corpus-frequency rarity filter drops statistically common tokens before storage.
- Document files (PDF, text) benefit less than transcript files because the semantic embedding already handles most vocabulary variation; the main value is for audio and video.

Modes (`features.retrieval_keywords`):

- `"false"` — disabled. Default.
- `"manual"` — regenerated only when called via the API (no regenerate UI yet).
- `"on_index"` — one LLM call per newly indexed file; the startup sweep enqueues files that have no row yet.

Per-drive opt-out:

```json
{
  "name": "Private",
  "addons": {
    "intelligence": {
      "retrieval_keywords": false
    }
  }
}
```

**Privacy:** file content (transcript text or extracted document text, up to 8 000 chars) is sent to the LLM. Use a local LLM (`llm.provider: "ollama"`) for privacy-sensitive drives.

### Transcript refine

When ASR is wrong (homophones, proper nouns, technical terms), the LLM can rewrite each chunk:

- The original text is preserved in `TranscriptChunk.text_original` so you can revert.
- Per-chunk LLM rewrite → re-aligned by WhisperX forced alignment → words rebuilt → embeddings recomputed from the refined text.
- If the aligner fails (missing audio, unsupported language, OOM), the old word rows stay (no time-proportional fallback).

Modes (`features.transcript_refine`): `"false"`, `"manual"`, `"on_index"`. Default `"false"` — the LLM never rewrites transcripts unless you explicitly enable it.

### Vision describe

Vision-LLM image descriptions for `image/*` and HEIC. The description is stored alongside the file and used for tag generation.

- Modes: `"false"`, `"manual"`, `"on_index"`. Default `"manual"`.
- Requires `llm.vision_model` **and a usable LLM client**. With either
  missing the feature is unavailable regardless of mode (graceful
  degradation): a `vision_model` set against `provider: disabled`, or an
  empty `base_url`, counts as missing.
- **`"on_index"` scales linearly with new image count** — enable carefully on large photo libraries.

#### What a file's state means

`GET /api/addons/intelligence/files/{id}/visual_description` returns
`status` and, since a failure's cause is worth acting on, a `reason`.

| `status` | `reason` | Meaning | Recoverable by retrying? |
|---|---|---|---|
| `null` | `null` | Never attempted | — (offer generate) |
| `pending` | `null` | Queued or in flight | — |
| `success` | `null` | Description stored | — |
| `unsupported` | `not_configured` | No usable vision LLM at all | No — fix the configuration |
| `unsupported` | `vision_unsupported` | The configured model was measured not to accept images | Only after changing the model |
| `unsupported` | `null` | A verdict recorded before reasons were kept, by an inference that has since been removed | **Yes — these are the ones worth re-running** |
| `failed` | `model_missing` | The model is not installed on the provider | Yes, once it is pulled |
| `failed` | `image_rejected` | The provider could not read this particular image | Yes, though the same image may fail again |
| `failed` | `token_budget` | The answer was cut off by `llm.vision_max_tokens` | Yes, after raising it |
| `failed` | `load` / `decode` / other | Read or decode failure before the LLM was reached | Yes |

A rejection from the provider is never read as a verdict on its own. A
400 means the same thing whether the model cannot see, the image could
not be read, or the request carried a field the provider does not know;
a 404 means the model was never pulled. To tell them apart the addon
sends a fixed reference image to the same model and reads the response
status, once per model, only after a real call has already failed.

#### Recovering files stuck on `unsupported`

Both trigger points are explicit user actions and both override the
"already settled, do not re-run" guard that protects background sweeps:

- The **Retry** button on the file page, for one file.
- The **folder** button, for every image in the folder. Because it
  overrides that guard, it re-describes images that already have a
  description — that is what its confirmation means by *all* — and is
  capped at 500 files per request.

Automatic paths (`on_index`, the startup sweep) never override it, so
turning the feature on does not re-spend on work that is already done.

#### Endpoints

| Endpoint | Notes |
|---|---|
| `GET /files/{id}/visual_description` | `status` + `reason` as above |
| `POST /files/{id}/visual_description/generate` | `202`-style `{"status": "accepted"}`, or `{"status": "already_queued"}` when the file is already on its way. `409` with `{"detail": {"error": "not_queued", "reason": ...}}` when the worker declines it. `404` when the feature is unavailable |
| `DELETE /files/{id}/visual_description` | Clears the description, its embeddings, and its reason |
| `POST /folders/visual_description/generate` | `413` with `{"error": "too_many_files", "max", "requested"}` above the cap |

### Transcription providers

`transcription.provider` chooses the engine:

- **`whisper_local`** — faster-Whisper (CT2). Default. Local, private, slow on CPU.
- **`openai_compatible`** — any OpenAI Whisper API or compatible (Groq, Fireworks, self-hosted). Requires `OPENAI_API_KEY`. The official `api.openai.com` endpoint enforces 25 MB file limits — for long audio, use the others.
- **`deepgram`** — Nova-3, best WER + diarisation. Requires `DEEPGRAM_API_KEY`.
- **`elevenlabs_scribe`** — Scribe v1, long-form + diarisation. Requires `ELEVENLABS_API_KEY`.
- **`assemblyai`** — Universal-2 (or `nano` for cost). Best multi-language WER + speaker diarisation + true word-level timestamps. Requires `ASSEMBLYAI_API_KEY`. 5 GB upload cap per file.
- **`gemini`** — Google Gemini 2.5 (`flash` / `pro`) via the File API + `generate_content`. Requires `GEMINI_API_KEY`. 2 GB upload cap. **Word-level timestamps are synthetic** (uniform split of segment text); **diarisation is not supported**. Pick AssemblyAI / Deepgram / ElevenLabs Scribe if you need either.

Per-drive override: `addons.intelligence.transcription_cloud: false` forces `whisper_local` for that drive even when the global provider is cloud.

`language_hint` is an ISO code (`"ja"`, `"en"`) passed to the provider. `hotwords` is a list of proper nouns honoured by providers that support hotwords — Deepgram, ElevenLabs Scribe, and AssemblyAI (mapped to `word_boost`); silently ignored elsewhere (Gemini, OpenAI Whisper API).

#### Capability matrix

| Provider | Diarisation | Word timestamps | Hotwords | File cap | Auto-detect language |
|---|---|---|---|---|---|
| `whisper_local` | ❌ | ✅ (true) | initial_prompt | host disk | ✅ |
| `openai_compatible` | ❌ | ✅ (true) | ❌ | 25 MB (OpenAI), provider-specific | ✅ |
| `deepgram` | ✅ | ✅ (true) | ✅ | provider-specific | ✅ |
| `elevenlabs_scribe` | ✅ | ✅ (true) | ❌ | provider-specific | ✅ |
| `assemblyai` | ✅ | ✅ (true) | ✅ (`word_boost`) | 5 GB | ✅ |
| `gemini` | ❌ | ⚠ synthetic | ❌ | 2 GB | ✅ (model-driven) |

---

## Configuration reference

Everything lives in `addons/intelligence/search-config.yml`. Defaults are reproduced below; comments in the example file have additional context.

### Feature flags

```yaml
features:
  indexing: true
  search: true
  auto_tags: "manual"                 # false | manual | on_index
  summaries: "manual"                 # false | manual | on_index
  chapter_suggestions: "false"        # false | manual | on_index
  detailed_summaries: "false"         # false | manual | on_index
  rag: true                           # bool
  transcript_refine: "false"          # false | manual | on_index
  vision_describe: "manual"           # false | manual | on_index
  retrieval_keywords: "false"         # false | manual | on_index
```

`auto_tags`, `summaries`, `chapter_suggestions`, `detailed_summaries`, `transcript_refine`, `vision_describe`, and `retrieval_keywords` all require `llm.provider != "disabled"`.

### LLM

```yaml
llm:
  provider: "disabled"                                  # ollama | openai_compatible | disabled
  base_url: ""                                          # provider-specific
  api_key: ""                                           # or env LLM_API_KEY (ignored for ollama)
  model: ""                                             # e.g. "gemma4:e4b", "gpt-4o-mini"
  max_tokens: 8192                                      # ceiling, not an allocation
  temperature: 0.3
  output_language: "auto"                               # auto | ja | en
  reasoning: "disabled"                                 # disabled | auto
  retry_attempts: 3
  retry_base_delay: 1.0
  retry_max_delay: 30.0
  min_request_interval_ms: 0                            # rate limit; 500-1000 for paid APIs
  request_timeout_seconds: 90.0
  request_connect_timeout_seconds: 10.0
  vision_model: ""                                      # e.g. "gemma4:e4b" or a hosted vision model
  vision_max_tokens: 1024
  vision_temperature: 0.1
```

Shipped defaults disable the LLM entirely (`provider: "disabled"`); set this in the browser at `/admin/intelligence` (or edit the file and restart) before turning on any LLM-driven feature.

**`max_tokens`** is a ceiling, not an allocation — providers bill the tokens the
model actually writes, so headroom costs nothing, while a ceiling that merely
fits the typical answer turns a legitimately long one into a body cut
mid-structure and unparseable. Chapter consolidation on a feature-length
transcript is the case that outgrew the old 2048 default. Lower it only for a
model whose context window cannot hold that many output tokens. Note that an
install created before this default changed carries the old value in its own
`search-config.yml`, where it wins over the default: raise it there to pick the
change up.

**Provider semantics:**

- `"ollama"` — uses ollama's `/api/chat`. Sends `think: false` so reasoning models (Gemma 4, DeepSeek-R1, QwQ) skip chain-of-thought. Use this for any ollama instance.
- `"openai_compatible"` — OpenAI SDK. Works with OpenAI, DeepSeek, vLLM, LM Studio. Also works with ollama, whose `/v1` layer ignores `think: false`.
- `"disabled"` — no LLM features. Indexing and search still work; summaries/auto-tags/etc. become no-ops.

**`reasoning`** controls whether the provider is asked to skip chain-of-thought,
and defaults to `"disabled"` because none of these features are better for the
thinking. It matters more than it sounds: a reasoning model spends `max_tokens`
on its thinking before writing any answer, so a budget that comfortably fits the
answer can come back empty with `finish_reason="length"`. Long inputs hit this
first — chapter generation on a full-length transcript is the usual casualty.

The request field is an OpenRouter extension. A provider that does not recognise
it answers 400; the client reads the first such rejection as "this provider does
not speak this field", re-sends the request without it, and remembers that for
the rest of the run, so the default costs such a provider one request rather
than breaking it. Set `"auto"` to never send the field. Suppression is a request
and not a guarantee — an upstream that ignores it still reasons, and the log
says so. The `"ollama"` provider is unaffected either way; its requests always
carry `think: false`.

### Summaries (citation tuning)

```yaml
summaries:
  min_context_chars: 50
  max_context_chars: 8000
  window_chars: 2500
  window_count: 3                       # odd numbers; first/middle/last
  detailed_max_context_chars: 24000
  detailed_window_count: 5

  citation_threshold: 0.55
  citation_top_k: 3
  citation_hybrid_enabled: true
  citation_top_k_internal: 10
  citation_rrf_k: 60
  citation_section_anchor_enabled: true
  citation_section_range_top_m: 12
  citation_section_narrow_threshold: 0.5
  citation_section_cluster_gap: 5
  citation_section_cluster_union_ratio: 0.8
  citation_section_discriminative_enabled: true
  citation_section_disc_margin: 0.01
  citation_section_alignment_enabled: true
  citation_section_boundary_margin: 2
  citation_margin_gate: 0.05
  citation_margin_bypass_score: 0.75
  citation_multi_anchor_enabled: true
  citation_multi_anchor_min_len: 4
```

The dozen citation_* knobs implement section anchoring, hybrid retrieval, and compound-bullet handling. See the inline comments in `search-config.yml.example` for tuning advice.

### RAG

```yaml
rag:
  top_k: 5
  max_context_chars_per_file: 3500
  max_total_context_chars: 17500
  max_tokens: 2048
  transcript_window_seconds: 60.0

  hierarchical:
    enabled: true
    coarse_top_k: 20
    coarse_score_threshold: 0.3
    min_drive_files_for_shortlist: 50
    fallback_full_search: true
    clue_count: 3                       # 1 = legacy single-keyword

  personal_history:
    enabled: true
    max_lookback_days: 365
    fallback_when_empty: "graceful"     # graceful | strict

  category_expansion:
    enabled: false
    max_terms: 8
```

### Models

```yaml
models:
  whisper: "openai/whisper-large-v3-turbo"   # faster-whisper or HF CT2 repo
  text_embedding: "cl-nagoya/ruri-v3-30m"    # 256d JP-optimised
  clip: "llm-jp/waon-siglip2-base-patch16-256"
  blip: "Salesforce/blip-image-captioning-base"   # leave empty to disable image captions
```

Whisper alternatives (multilingual, CT2 int8):

- `openai/whisper-small` — 244 M, ~500 MB int8 RAM.
- `openai/whisper-large-v3-turbo` — 809 M, ~1.0–1.2 GB. Best accuracy/speed balance.
- `openai/whisper-large-v3` — 1550 M, ~2–3 GB. Highest accuracy.

Text-embedding alternatives (re-index required on change):

- `ibm-granite/granite-embedding-97m-multilingual-r2` — 384d, ~190 MB. Multilingual default (Apache 2.0, prefix-free).
- `ibm-granite/granite-embedding-311m-multilingual-r2` — 768d, ~620 MB. Higher-quality multilingual.
- `cl-nagoya/ruri-v3-30m` — 256d, ~150 MB. Lightweight ruri model.
- `cl-nagoya/ruri-v3-130m` — 768d, ~520 MB. Higher-quality ruri model.
- `cl-nagoya/ruri-v3-310m` — 1024d, ~1.2 GB. Largest ruri option.

CLIP alternatives:

- `llm-jp/waon-siglip2-base-patch16-256` — 768d, multilingual SigLIP2 (default).
- `llm-jp/llm-jp-clip-vit-base-patch16` — 512d, llm-jp CLIP.
- `openai/clip-vit-b-32` — 512d, English. With CLIP-family models raise `min_score_clip` to 0.20.

### Search

```yaml
search:
  alpha: 0.7                              # 0=keyword only, 1=vector only
  default_limit: 20
  max_limit: 100
  min_score_clip: 0.05                    # SigLIP2 default; raise to 0.20 for CLIP
  min_score_clip_thumbnail: 0.05
```

### Transcription

```yaml
transcription:
  provider: whisper_local                 # whisper_local | openai_compatible | deepgram | elevenlabs_scribe | assemblyai | gemini
  language_hint: ""                       # ISO code; empty = auto-detect
  hotwords: []                            # list of proper nouns

  whisper_local:
    model: openai/whisper-large-v3-turbo
    initial_prompt: ""
    beam_size: 1
    batch_size: 0                         # sequential = recommended
    condition_on_previous_text: true
    compression_ratio_threshold: 2.0
    no_speech_threshold: 0.45
    log_prob_threshold: -1.0

  openai_compatible:
    base_url: https://api.openai.com/v1
    model: whisper-1
    timeout_s: 600

  deepgram:
    model: nova-3
    diarize: true
    smart_format: true
    detect_language: true
    timeout_s: 600

  elevenlabs_scribe:
    model_id: scribe_v1
    diarize: true
    timeout_s: 600

  assemblyai:
    model: best                            # "best" (Universal-2) or "nano"
    language_detection: true
    speaker_labels: true                   # diarisation
    timeout_s: 1800
    poll_interval_s: 3                     # status-poll cadence

  gemini:
    model: gemini-2.5-flash                # "gemini-2.5-flash" or "gemini-2.5-pro"
    output_language: ja                    # the prompt language steering the model
    upload_wait_sec: 300                   # File API processing wait
    timeout_s: 1800
```

**`initial_prompt`** caveats: leave blank in normal use. The addon ships per-language defaults under `app/workers/whisper_prompts.py` (ja/en/zh/ko/es/fr/de/pt/it/ru). Setting `initial_prompt` overrides the default for **all** languages. Never include filenames or proper-noun lists — Whisper latches onto them and hallucinates them into the transcript. Use a curated glossary layer for vocabulary hints.

### Indexing

```yaml
indexing:
  reconciliation_interval: 3600           # seconds between core DB reconciles

  frame_extraction:
    scene_threshold: 0.3                  # higher = fewer frames
    min_interval: 30                      # seconds
    max_frames: 500

  text_chunking:
    max_chunk_size: 400                   # ~256 tokens for 384d multilingual embedders
    overlap: 80                           # ≈20% of max_chunk_size
```

`indexing.whisper.*` is **deprecated**; use `transcription.whisper_local.*`. Old keys are read via shim until the cutover date in the comments.

### Workers and memory

```yaml
workers:
  whisper_parallel: 1
  clip_parallel: 2
  metadata_batch_size: 32
  clip_frame_batch_size: 50

memory:
  whisper_idle_unload: 300                # seconds; 0 = never
  blip_idle_unload: 300
```

Whisper and BLIP are only used during indexing, so they can be unloaded after a period of inactivity to free RAM (~500 MB each). CLIP and text_embedding stay resident because they are used by the search query path.

---

## UI surface

When enabled, the intelligence addon contributes:

- **Search modes** — *Semantic Search* and *Find* (sidebar of `/drive/<name>/search`), plus *Scene search* toggle and *Ask* input.
- **File detail sections** — a section appears once it has something in it. Until then
  there is no heading; the way to make one is the **AI** menu below.
  - *Unverified Source* (shown only on a file you have not yet ruled on — see below)
  - *Suggested Tags* (with Approve / Dismiss / Regenerate)
  - *AI Summary* (short)
  - *Detailed Summary* (long-form Markdown with citation chips)
  - *Visual Description* (vision LLM)
  - *Transcript* (with Refine button). Each line carries a quote button that adds it to
    the capture basket; it appears when you hover or focus the line, and stays visible on
    a touch screen, so several hundred of them do not read as a rule down the edge of the
    text. Its name carries the line's timestamp, so a screen reader can tell them apart.
  - *CLIP Frames* (per-second thumbnails; collapsed by default)
  - *Visual index* (collapsed by default)
  - *Similar Files* (collapsed by default; **expanding it is the request** — the search
    is heavy, so it runs for the files you ask about and no others. Placeholder cards
    hold the height while it works, and a failure says so and offers another go.
    Each result names the keywords it shares with the file you are on, taken from the
    keyword bag both files were indexed with, and names none when it shares none)
- **File action row** — **AI**, beside the like and favourite buttons. It lists what this
  file does not have yet: tag candidates, a summary, a detailed summary, chapter
  candidates, an image description. Generating one makes its section appear and removes
  it from the menu, which is where its regenerate control lives from then on. On a file
  with nothing left to generate — or nothing applicable — the button is not shown.
- **Drive home** — *Pickup*, a carousel of files you have never opened, with a link through to the full feed at `/drive/{drive}/addons/intelligence/pickup` once it holds at least 40
- **File `[...]` menu** — *Index details*, a dialog showing per-task state with a *Regenerate* button for each task (`metadata`, `clip`, `whisper`, `text`) plus recent provider stats for failure context. It sits in the overflow menu rather than in the inspector because it answers an operator's question, not a reader's.
- **Folder actions** — *Refine all transcripts in folder*, *Regenerate summaries*.
- **Dashboard widget** — *Index Status* (queue depth and model memory). The eleven per-task queues are listed only while they are moving; the idle ones sit behind a *Show N idle queues* disclosure, since the running/waiting total above already says how much work there is.
- **Dashboard alert** — a *Failed jobs* band above the drive cards, which opens the *Failed jobs* modal (per-file × per-task retry). It is absent entirely when nothing has failed.

Each section is a slot contribution; if a feature is disabled (per-drive policy), its section disappears.

### Unverified sources

Ask draws its citations only from files you have vouched for. An unverified
file — a Web Clip, or anything else that arrived from outside — stays fully
searchable but never grounds an answer. See
[trusted sources](../user-guide/file-browsing.md#trusted-sources-and-the-review-queue).

When you open such a file, this section asks you to rule on it, and offers
whatever context it can:

- Up to three of the **file's own paragraphs**, reproduced verbatim, each
  paired with a note of yours that it echoes. Only files you have already
  vouched for count as "a note of yours" — ordinary search returns unverified
  files too, and a clip is a `.md` like any note, so the extension alone
  proves nothing.
- **Trust as a source** promotes it; **Leave it unverified** records that you
  looked and decided against it, so you are not asked again. Both stamp the
  review, which is why neither wording promises a decision deferred.

What it deliberately does *not* do is summarise. The paragraphs shown are the
exact strings used as the search queries, and the matches are embedding
neighbours — **no LLM is called on this path at all**. Approving generated
text would place it in the verified tier, whose definition is content you
wrote or vouched for; a summary you waved through is neither.

To keep one passage rather than trust the whole page, select it in the
document and add it to Knowledge's quotation basket. That affordance belongs
to Knowledge and is not duplicated here.

**Retrieval note.** Because the trust filter narrows results after ranking,
grounding draws a wider candidate pool than it needs and widens it again
until the budget is filled or the index is exhausted. Without that, unverified
files that outrank verified ones would spend the budget and then be discarded,
leaving Ask with fewer sources than exist. Ordinary search is unaffected, and
so is *Find*, which presents files rather than grounding an answer.

### Re-generating indexes

There is **no global "Reindex all" button**. The addon offers two scoped paths instead (spec [`2026-05-24-intelligence-reindex-controls.md`](../superpowers/specs/2026-05-24-intelligence-reindex-controls.md)):

- **Per-file × per-task.** Open the `[...]` menu on a file's detail page, choose *Index details*, and click *Regenerate* on a specific task (`metadata`, `clip`, `whisper`, or `text`). The corresponding `*_indexed` flag is reset to `False` and the reconciler picks the file up on its next pass.
- **Failed-job retry.** A *Failed jobs* band sits above the drive cards on the admin dashboard whenever something has failed. Opening the modal lists the most recent failures (file, drive, task, provider, error class, attempt count, timestamp), with a *Retry* button per row that calls the same per-file × per-task path. Rows with `status='skipped'` (e.g. `UnsupportedMimeType`) are intentionally excluded — retrying would only re-skip.

Embedding-model switches are a different flow: editing `models.text_embedding` from the intelligence admin page sets a `reindex_pending` flag and the actual rebuild happens on container restart (see [text embedding model](#text-embedding-model-gui-managed) in the developer-guide reference). The reindex-pending flow and the per-file regeneration UI are independent.

---

## Operational notes

- **First-run cost.** Indexing a populated drive can take hours, dominated by ASR and frame extraction. Expect 1–10× real-time on CPU, 5–20× on GPU.
- **Re-index on model change.** Switching `text_embedding` or `clip` invalidates existing embeddings; the next reconcile pass re-indexes. Switching Whisper does not re-transcribe automatically — re-run transcription manually.
- **One-time document re-index on upgrade.** The upgrade that adds `embeddings.chunk_index` discards existing document embeddings so the next reconcile pass rebuilds them with the key that maps an embedding back to the text it was built from. Only text extraction and embedding re-run: transcripts are untouched, and keyword search keeps working throughout because the FTS tables are replaced per file as it comes back around.
- **DB layout.** The addon's data lives under `data/addons/intelligence/`. The core DB is **not** modified; the addon mirrors what it needs and queries the rest through the Internal API.
- **Observability.** `docker compose logs -f intelligence`. Queue depth and model memory are on the admin dashboard's *Index Status* widget; recent failures are the *Failed jobs* band above the drive cards, whose modal supports per-row retry.
- **Cold-start grace.** The addon fails open on policy lookups for the first 60 seconds; after that, missing core means the addon refuses to enqueue work.
- **Liveness.** The addon serves every endpoint from a single event loop, so a blocked loop takes them all down at once while the container still looks perfectly healthy — process up, memory flat, CPU at zero. Two things make that state visible: the `healthcheck` block `configure.py` writes into `docker-compose.override.yml` (an HTTP probe of `/health`, so `docker compose ps` reports `unhealthy`), and a watchdog inside the addon that logs every thread's stack once the loop has gone 120 seconds without running a callback. Neither restarts anything — Docker leaves an unhealthy container running, and the watchdog deliberately does not kill a process that might be mid-index. Recovery is `docker compose restart intelligence`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Search returns nothing on a freshly-added drive | Reconciler has not run yet; wait for the next reconcile (`indexing.reconciliation_interval`, default 1 hour) or open a file's `[...]` menu → *Index details* and click *Regenerate* on the relevant task |
| A handful of files consistently fail to index | Open the admin dashboard, press the *Failed jobs* band above the drive cards, and *Retry* the affected files — or jump to the file detail and regenerate the specific task that failed |
| Ask answer says *no strong source* on grounded questions | Lower `summaries.citation_threshold`, or improve transcript quality |
| Whisper transcripts drift to nonsense | Lower `compression_ratio_threshold`; never put filenames in `initial_prompt` |
| Cloud transcription returns 413 | Switch from `openai_compatible` to `deepgram`, `elevenlabs_scribe`, or `assemblyai` for files > 25 MB |
| Gemini transcript words have evenly-spaced timestamps | Expected — Gemini's word timestamps are synthetic. Switch to `assemblyai` / `deepgram` / `elevenlabs_scribe` if precise word timing matters (subtitles, citation jumps) |
| AssemblyAI upload fails on a multi-hour file | 5 GB cap per file. Phase 2B will add ffmpeg-based splitting; for now, transcode to a lower bitrate or use Deepgram |
| Gemini upload stalls then times out | Raise `transcription.gemini.upload_wait_sec`; the File API is slow on very large files |
| Tags suggest nothing | Vision describe disabled and BLIP missing for image-heavy drives; enable one |
| An image keeps saying the model does not accept images, but `llm.vision_model` is set | Open the file and press **Retry**. Verdicts recorded before the addon measured capability were inferred from a single provider rejection and are often wrong; the retry re-measures. For a whole folder, use the folder button |
| Descriptions stay *Creating description…* forever | The row was accepted by a process that then stopped. A restart re-queues them automatically; the file page also offers **Retry**. If it recurs, check that `llm.provider` is not `disabled` while `llm.vision_model` is set |
| Vision fails with `token_budget` | Raise `llm.vision_max_tokens`. A truncated description is discarded rather than stored, so nothing is left half-written |
| Every intelligence endpoint returns 502, core logs `SLOW REQUEST 15.0s` | The addon's event loop is blocked. Confirm with `docker compose ps` (`unhealthy`), read the thread dump the watchdog wrote to `docker compose logs intelligence`, then `docker compose restart intelligence` |
| Container OOM during indexing | Raise host RAM, or set `whisper_idle_unload: 60` and `blip_idle_unload: 60` |
| LLM 429s | Set `llm.min_request_interval_ms: 1000` or increase `llm.retry_max_delay` |

## See also

- [Addon overview](overview.md)
- [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy)
- [Configuration reference](../reference/configuration.md)
