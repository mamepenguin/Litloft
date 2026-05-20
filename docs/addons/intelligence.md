# intelligence addon

The `intelligence` addon adds LLM-backed search, Q&A, summarization, and tag suggestions to Litloft. It is by far the largest addon: it runs in its own container (port 8100), maintains its own SQLite database under `data/addons/intelligence/`, and ships with ~500 MB of ML models.

## What it provides

| Feature | What | Default |
|---|---|---|
| **Indexing** | Scans drives, extracts text/frames/audio, builds embeddings | on |
| **Semantic search** | BM25 + dense vector hybrid retrieval over text, transcripts, image frames | on |
| **Auto-tags** | LLM proposes tags; Suggest → Approve workflow | manual |
| **AI summaries** | Short (1 sentence) + long (paragraph) summaries per file | manual |
| **Detailed summaries** | Long-form Markdown with citations | false |
| **Ask (RAG)** | Question answering over your library with cited sources | on |
| **Retrieval keywords** | LLM-generated synonyms and alternate names indexed for file search | false |
| **Transcript refine** | LLM correction of ASR output, with revert | false |
| **Vision describe** | LLM image descriptions, photo-by-photo | manual |
| **Transcription** | faster-Whisper (local) or cloud providers | local |
| **CLIP frame analysis** | Scene-aware video frame embeddings for "find a moment" | on |

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

The addon lives under `addons/intelligence/` and is tracked as a Git submodule. The recommended path is to answer **yes** when `configure.py` prompts to enable the intelligence addon — it writes the matching service block into `docker-compose.override.yml`, mounts the configured drives read-only, and seeds `search-config.yml` from the example. Then:

```bash
docker compose up -d --build
```

For a manual install (no `configure.py`), add a service block like the one below to `docker-compose.override.yml`, copy `search-config.yml.example` to `search-config.yml`, and rebuild.

```yaml
services:
  intelligence:
    build: ./addons/intelligence
    expose:
      - "8100"
    environment:
      - DRIVE_MOUNTS=default=/drives/default
      - HOMEVAULT_INTERNAL_URL=http://backend:8000
      - LLM_API_KEY=${LLM_API_KEY:-}
      - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY:-}
      - ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY:-}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - ASSEMBLYAI_API_KEY=${ASSEMBLYAI_API_KEY:-}
      - GEMINI_API_KEY=${GEMINI_API_KEY:-}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}
    volumes:
      - ./addons/intelligence/search-config.yml:/app/search-config.yml:ro
      - ./data/addons/intelligence:/intelligence-data
      - ./data/data.db:/data/litloft.db:ro
      - ./videos:/drives/default:ro
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

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

`POST /api/addons/intelligence/search` runs:

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

### Ask (RAG)

`POST /api/addons/intelligence/ask` is question answering over your library:

- **Stage 1 (hierarchical, optional)** — coarse shortlist of files based on per-file summary embeddings. Bypassed for tiny drives (`min_drive_files_for_shortlist`) and when the top cosine is too low (`coarse_score_threshold`).
- **Stage 2** — chunk-level retrieval scoped to the shortlist; multi-query expansion via `clue_count` clues.
- **Personal-history scoping** — when enabled, weight files the calling viewer has actually opened, scoped by `max_lookback_days`. Requires a `lit_viewer` cookie; without one, falls back to the legacy viewer-agnostic path.
- **Category expansion** — opt-in: an LLM rewrite of vague terms (*SF っぽい*, *ホラー系*) into a small bag of surface forms before retrieval. Capped by `max_terms`.
- Pack `top_k` files into a context window (`max_context_chars_per_file` × `top_k`, capped by `max_total_context_chars`).
- Generate the answer with `max_tokens`. Citations are matched against the retriever's result set; anything outside is dropped (anti-hallucination).

Access control is applied **twice**: once on the internal filter (Internal API `filter-file-ids`) and once via `drive_access_nested` on the addon side.

### Retrieval keywords

When enabled, the LLM reads each indexed file and predicts synonyms, abbreviations, and alternate names that users might search for. The results go into a dedicated FTS index (`fts_retrieval_keywords`) that file search and Ask UNION into their keyword channel, producing a **キーワード** chip on matching results.

**Why this matters for transcribed content.** ASR models (Whisper) frequently misrecognise proper nouns — people's names, brand names, product titles. The embeddings and FTS indexes are built from that imperfect text, so a user searching the canonical name finds nothing. Retrieval keywords close this gap: the LLM has world knowledge and infers the correct proper noun from context even when the transcript text is wrong.

The generated keywords are **tier-3 data** (LLM-generated, not human-verified). They shape retrieval scoring but are never used as citation sources. A file appearing in both the keyword and body channels gets a natural RRF boost in ranking; a keyword-only hit ranks slightly below body hits by design.

Practical notes:

- Search queries shorter than 3 characters (e.g. 2-char Japanese morphemes) do not match due to the trigram FTS minimum. Semantic search and body text fill in for these.
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
- Requires `llm.vision_model` to be set; without it the feature is unavailable regardless of mode (graceful degradation).
- **`"on_index"` scales linearly with new image count** — enable carefully on large photo libraries.

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
  detailed_summaries: "false"         # false | manual | on_index
  rag: true                           # bool
  transcript_refine: "false"          # false | manual | on_index
  vision_describe: "manual"           # false | manual | on_index
  retrieval_keywords: "false"         # false | manual | on_index
```

`auto_tags`, `summaries`, `detailed_summaries`, `transcript_refine`, `vision_describe`, and `retrieval_keywords` all require `llm.provider != "disabled"`.

### LLM

```yaml
llm:
  provider: "disabled"                                  # ollama | openai_compatible | disabled
  base_url: ""                                          # provider-specific
  api_key: ""                                           # or env LLM_API_KEY (ignored for ollama)
  model: ""                                             # e.g. "gemma4:e4b", "gpt-4o-mini"
  max_tokens: 2048
  temperature: 0.3
  output_language: "auto"                               # auto | ja | en
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

**Provider semantics:**

- `"ollama"` — uses ollama's `/api/chat`. Sends `think: false` so reasoning models (Gemma 4, DeepSeek-R1, QwQ) skip chain-of-thought. Use this for any ollama instance.
- `"openai_compatible"` — OpenAI SDK. Works with OpenAI, DeepSeek, vLLM, LM Studio. Also works with ollama but cannot disable thinking over this API.
- `"disabled"` — no LLM features. Indexing and search still work; summaries/auto-tags/etc. become no-ops.

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
- `cl-nagoya/ruri-v3-30m` — 256d, ~150 MB. Lightweight Japanese.
- `cl-nagoya/ruri-v3-130m` — 768d, ~520 MB. Recommended for Japanese accuracy.
- `cl-nagoya/ruri-v3-310m` — 1024d, ~1.2 GB. Max Japanese accuracy.

CLIP alternatives:

- `llm-jp/waon-siglip2-base-patch16-256` — 768d, JP+multilingual SigLIP2 (default).
- `llm-jp/llm-jp-clip-vit-base-patch16` — 512d, Japanese.
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
- **File detail sections** —
  - *Suggested Tags* (with Approve / Dismiss / Regenerate)
  - *AI Summary* (short)
  - *Detailed Summary* (long-form Markdown with citation chips)
  - *Visual Description* (vision LLM)
  - *Transcript* (with Refine button)
  - *CLIP Frames* (per-second thumbnails)
  - *Index Details* (technical metadata)
  - *Similar Files* (semantic neighbour list)
- **Folder actions** — *Refine all transcripts in folder*, *Regenerate summaries*.
- **Dashboard widget** — *Index Status* (queue depth, model memory).

Each section is a slot contribution; if a feature is disabled (per-drive policy), its section disappears.

---

## Operational notes

- **First-run cost.** Indexing a populated drive can take hours, dominated by ASR and frame extraction. Expect 1–10× real-time on CPU, 5–20× on GPU.
- **Re-index on model change.** Switching `text_embedding` or `clip` invalidates existing embeddings; the next reconcile pass re-indexes. Switching Whisper does not re-transcribe automatically — re-run transcription manually.
- **DB layout.** The addon's data lives under `data/addons/intelligence/`. The core DB is **not** modified; the addon mirrors what it needs and queries the rest through the Internal API.
- **Observability.** `docker compose logs -f intelligence`. Queue depth and model memory are surfaced on the admin dashboard.
- **Cold-start grace.** The addon fails open on policy lookups for the first 60 seconds; after that, missing core means the addon refuses to enqueue work.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Search returns nothing on a freshly-added drive | Reconciler has not run yet; wait ~1 hour or trigger a manual reindex |
| Ask answer says *no strong source* on grounded questions | Lower `summaries.citation_threshold`, or improve transcript quality |
| Whisper transcripts drift to nonsense | Lower `compression_ratio_threshold`; never put filenames in `initial_prompt` |
| Cloud transcription returns 413 | Switch from `openai_compatible` to `deepgram`, `elevenlabs_scribe`, or `assemblyai` for files > 25 MB |
| Gemini transcript words have evenly-spaced timestamps | Expected — Gemini's word timestamps are synthetic. Switch to `assemblyai` / `deepgram` / `elevenlabs_scribe` if precise word timing matters (subtitles, citation jumps) |
| AssemblyAI upload fails on a multi-hour file | 5 GB cap per file. Phase 2B will add ffmpeg-based splitting; for now, transcode to a lower bitrate or use Deepgram |
| Gemini upload stalls then times out | Raise `transcription.gemini.upload_wait_sec`; the File API is slow on very large files |
| Tags suggest nothing | Vision describe disabled and BLIP missing for image-heavy drives; enable one |
| Container OOM during indexing | Raise host RAM, or set `whisper_idle_unload: 60` and `blip_idle_unload: 60` |
| LLM 429s | Set `llm.min_request_interval_ms: 1000` or increase `llm.retry_max_delay` |

## See also

- [Addon overview](overview.md)
- [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy)
- [Configuration reference](../reference/configuration.md)
