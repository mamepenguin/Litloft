# Intelligence Addon — Operations Guide

Operator-facing reference for the `intelligence` addon. For the developer reference, see [ADDON-DEVELOPMENT.md](ADDON-DEVELOPMENT.md#intelligence-addon-reference); for drive-level enable/disable, see [DRIVE-POLICY.md](DRIVE-POLICY.md).

## What it does

External Docker service (`./addons/intelligence/`, port 8100). Scope: `drive`. Provides:

| Feature | Mode flag | Default | Output |
|---------|-----------|---------|--------|
| **Indexing** | `features.indexing: true/false` | on | Whisper transcripts, CLIP vectors, metadata + text FTS |
| **Semantic Search** | `features.search: true/false` | on | 5-channel retrieval with two fusion modes |
| **Auto Tags** | `features.auto_tags: "false" / "manual" / "on_index"` | `"false"` | Suggested tags with approve/dismiss |
| **Summaries** | `features.summaries: "false" / "manual" / "on_index"` | `"false"` | Short sentence + paragraph |
| **Detailed Summaries** | `features.detailed_summaries: "false" / "manual"` | `"false"` | Long-form Markdown with auto-linked citations and per-section editing |
| **Ask (RAG)** | `features.rag: true/false` | `false` | Natural-language Q&A with citations |
| **Transcript Refine** | `features.transcript_refine: "false" / "manual" / "on_index"` | `"false"` | LLM-corrected transcripts with revert |

All LLM-dependent features require `llm.provider != "disabled"`.

## Feature flag semantics

Three-mode string flags (`auto_tags`, `summaries`, `transcript_refine`):

| Value | Behavior |
|-------|----------|
| `"false"` | Feature fully off |
| `"manual"` | Generation only on explicit user action (UI button, folder batch) |
| `"on_index"` | Generated automatically whenever the file completes indexing |

Boolean flags (`rag`, `indexing`, `search`, `detailed_summaries`) are plain on/off.

## Setup

### docker-compose.override.yml

```yaml
services:
  backend:
    environment:
      - INTELLIGENCE_SERVICE_URL=http://intelligence:8100

  intelligence:
    build: ./addons/intelligence
    expose: ["8100"]
    mem_limit: 4096m      # raise if using large Whisper + BLIP
    cpus: 8
    volumes:
      - ./data:/data:ro
      - ./data/addons/intelligence:/intelligence-data
      - ./addons/intelligence/search-config.yml:/app/search-config.yml:ro
      - /path/to/videos:/drives/videos:ro
    environment:
      - HOMEVAULT_DB_PATH=/data/videos.db
      - SEARCH_CONFIG_PATH=/app/search-config.yml
      - ALLOWED_BASE_DIRS=/drives/
      - DRIVE_MOUNTS=Videos=/drives/videos
      - LLM_API_KEY=                       # optional, for non-ollama providers
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

`DRIVE_MOUNTS` maps HomeVault drive names (as they appear in `drives.json`) to paths inside the addon container. Use one entry per drive, comma-separated. Unmapped drives are indexed from the core DB only (no transcripts/CLIP).

### event-hooks.json

```json
{
  "hooks": {
    "scan.complete":   [{"url": "http://intelligence:8100/webhook/scan-complete"}],
    "files.deleted":   [{"url": "http://intelligence:8100/webhook/files-deleted"}],
    "files.restored":  [{"url": "http://intelligence:8100/webhook/files-restored"}],
    "files.missing":   [{"url": "http://intelligence:8100/webhook/files-missing"}],
    "files.recovered": [{"url": "http://intelligence:8100/webhook/files-recovered"}],
    "files.purged":    [{"url": "http://intelligence:8100/webhook/files-purged"}]
  }
}
```

For drive-aware filtering, add `"addon": "intelligence"` and `"feature": "index"` to each listener — the core then drops events for drives whose policy disables indexing.

### search-config.yml

Copy `addons/intelligence/search-config.yml.example` → `search-config.yml` and customize. Key sections below.

## LLM providers

```yaml
llm:
  provider: "ollama"        # "ollama" | "openai_compatible" | "disabled"
  base_url: "http://host.docker.internal:11434"
  api_key: ""               # or env LLM_API_KEY
  model: "gemma4:e4b"
  max_tokens: 2048
  temperature: 0.3
  output_language: "auto"   # "auto" | "ja" | "en" | ...
  retry_attempts: 3
  retry_base_delay: 1.0
  retry_max_delay: 30.0
  min_request_interval_ms: 0
  request_timeout_seconds: 90.0
  request_connect_timeout_seconds: 10.0
```

| Provider | Endpoint | Notes |
|----------|----------|-------|
| `ollama` | Native `/api/chat` | Sends `think: false` to skip chain-of-thought on reasoning models (Gemma 4, DeepSeek-R1, QwQ). Preferred for local deployments |
| `openai_compatible` | OpenAI SDK | Works with OpenAI, DeepSeek, vLLM, LM Studio. Also works with ollama but cannot disable thinking |
| `disabled` | — | All LLM features no-op regardless of feature flags |

**Security**: LLM features send file content (transcripts, captions, extracted text) to the configured LLM endpoint. For private content, use a local provider (ollama or vLLM).

## Memory guidance

| Configuration | Recommended `mem_limit` |
|---------------|-------------------------|
| Whisper `small` + CLIP only | 3–4 GB |
| Whisper `large-v3-turbo` + CLIP | 5–6 GB |
| + BLIP captioning | +1 GB |
| + LLM running alongside (ollama host) | see LLM RAM needs |

Whisper and BLIP are only used during indexing and can be unloaded on idle:

```yaml
memory:
  whisper_idle_unload: 300   # seconds; 0 = never unload
  blip_idle_unload: 300
```

Lower these (60–120s) if running an LLM on the same host.

## Whisper tuning

```yaml
models:
  whisper: "openai/whisper-small"   # or .../whisper-large-v3-turbo, .../whisper-large-v3

indexing:
  whisper:
    min_segment_duration: 30
    max_segment_duration: 60
    beam_size: 1                    # 5 = slightly more accurate, slower
    batch_size: 16                  # 0 = sequential
    condition_on_previous_text: false
    compression_ratio_threshold: 2.0  # catch looping hallucinations
    no_speech_threshold: 0.45         # default 0.6 is too strict with BGM
    log_prob_threshold: -1.0
    initial_prompt: ""                # short punctuation hint only; DO NOT list names
```

Watch out for `initial_prompt` — it biases output and can inject unrelated words. Keep to 1–2 short example sentences for punctuation guidance.

## Ask (RAG) configuration

```yaml
rag:
  top_k: 5
  max_context_chars_per_file: 2000
  max_total_context_chars: 10000
  max_tokens: 1024
  transcript_window_seconds: 30.0
```

Safety considerations:
- Feature is off by default. Enable only on drives where sending content to the LLM is acceptable.
- Citations are validated against the retriever's candidate set; hallucinated file IDs are dropped before the response reaches the user.
- Accessible-drive filtering runs before citation validation — users cannot see citations from drives they can't access.
- The core addon proxy enforces a 15s browser-side timeout; long-running LLM calls are bounded by `request_timeout_seconds` on the addon side.

## Summaries

```yaml
summaries:
  min_context_chars: 50        # skip files with less usable content
  max_context_chars: 8000      # threshold: smaller contexts are sent in full
  window_chars: 2500           # per-window size when sampling long content
  window_count: 3              # first / middle / last (odd numbers recommended)
  citation_threshold: 0.55     # detailed-summary citation similarity floor
  citation_top_k: 3            # detailed-summary citation candidates per segment
```

Detailed summaries (`detailed_summaries`) are generated asynchronously and polled via `GET /files/{id}/summary/detailed` (status `generating` → `generated`). The generated Markdown is also downloadable at `/files/{id}/summary/detailed.md`.

### Detailed-summary citations (hallucination guard)

Every detailed summary is parsed into bullets / paragraphs and each segment is embedded and matched against transcript / document chunks of the **same file** using the existing `text_embedding` model:

- Top-1 cosine similarity `>= citation_threshold` → surfaced as a clickable link badge in the UI; the hover-card shows a ±100 char excerpt (served from `GET /files/{id}/chunks/{chunk_id}/excerpt`) and a "jump" control that reuses the existing transcript seek integration for video/audio
- Top-1 `< citation_threshold` → rendered with a ⚠ "no strong source" marker, giving the user a visible hallucination warning
- `citation_top_k` (default 3) candidates are stored per segment; the UI can cycle through them

Tuning tips: if ⚠ appears on obviously grounded bullets, lower `citation_threshold`; if hallucinated bullets have no warning, raise it. The threshold is embedding-model dependent — re-tune when swapping `models.text_embedding`.

A one-off backfill script (`addons/intelligence/scripts/backfill_detailed_citations.py`) regenerates citations for summaries created before this feature shipped.

### Detailed-summary section editing

Each `## ` heading section is editable inline in the UI. The addon stores the AI-generated version in `detailed_original` on the first edit so the user can restore the full AI draft (`POST /files/{id}/summary/detailed/revert`) at any time. Key behaviors:

- Edit endpoint: `PUT /files/{id}/summary/detailed/section` with `{section_heading, new_content}` — replaces the content between `## <heading>` and the next `##`, re-runs citation linking, and broadcasts `intelligence.detailed_summary.updated` + `intelligence.detailed_summary.citations_ready`
- Regenerate guard: when `detailed_edited_at` is set, `POST /files/{id}/summary/detailed/regenerate` returns **409 Conflict** unless the body contains `{"force": true}`. The frontend prompts the user before retrying with the force flag, preventing accidental loss of hand-edits
- Policy: both endpoints are gated by the existing `features.detailed_summaries` per-drive flag (via `addon_feature` pre-check in the addon manifest). Turning the umbrella feature off purges edited content along with the rest of the summary cache
- The three-state model (`deleted_at` / `missing_since`) is unaffected — edits live purely in the intelligence addon's own DB, never in the core

## Transcript Refine

LLM-corrects Whisper/HvLink transcripts chunk-by-chunk. Word-level timings are re-derived via WhisperX wav2vec2 forced alignment (CJK per-character, others per-word). Embeddings are recomputed on corrected text.

On alignment failure (audio missing, unsupported language, OOM) the addon preserves the prior word rows rather than producing time-proportional fallbacks — revert is always available because originals are kept in `text_original`.

## Eval harness

Use the `/eval-rag` slash command (also `addons/intelligence/evals/` directly) to run a regression harness against `evals/test-drive`. The harness scores retrieval + answer quality against ground truth and writes a report to `evals/reports/`. Use before/after any prompt, retriever, or LLM change to catch quality regressions.

## Operations

### Inspect queue / status

```bash
# Service status (admin-gated)
curl -b "hv_token=..." http://localhost:3000/api/addons/intelligence/status

# Index details across drives
curl -b "hv_token=..." http://localhost:3000/api/addons/intelligence/index-details
```

### Control queue

```bash
# Pause / resume indexing
curl -X POST -b "hv_token=..." http://localhost:3000/api/addons/intelligence/queue/pause
curl -X POST -b "hv_token=..." http://localhost:3000/api/addons/intelligence/queue/resume

# Full reindex for the current drive
curl -X POST -b "hv_token=..." \
  -H "X-HV-Drive: Videos" \
  http://localhost:3000/api/addons/intelligence/queue/reindex

# Prioritize a single file
curl -X POST -b "hv_token=..." \
  -H "X-HV-Drive: Videos" \
  -d '{"file_id": "..."}' \
  http://localhost:3000/api/addons/intelligence/queue/prioritize
```

All queue endpoints require every protected `access_group` in `drives.json` to be unlocked (owner-only).

### Restore from failure

The addon's index lives in `data/addons/intelligence/`. Delete the directory and restart to force a full rebuild:

```bash
docker compose stop intelligence
rm -rf data/addons/intelligence
docker compose up -d intelligence
```

Core DB (`data/videos.db`) is never modified by the addon, so corrupting the addon's index cannot damage the core.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Ask returns an empty citation list | Feature flag off, or the user has no accessible drives | Check `features.rag`, re-unlock drives |
| Ask answers "I don't know" for everything | Retrieval works but LLM is over-guarded | Raise `rag.top_k` or widen `max_context_chars_per_file` |
| Auto-tags suggest nothing useful | Model too small, or `output_language` set incorrectly | Switch to a stronger LLM or explicitly set `output_language` |
| Transcripts full of looping gibberish | Compression-ratio threshold too lenient | Lower `compression_ratio_threshold` to 1.8 |
| Transcripts miss speech during BGM | `no_speech_threshold` too strict | Lower to 0.4 |
| Whisper OOM on startup | Model too large for `mem_limit` | Raise `mem_limit` or switch to a smaller Whisper model |
| Queue stuck | Worker crashed, semaphore leaked | Restart the `intelligence` container |
| 404 on `/api/addons/intelligence/*` | Drive has `intelligence: false` in `drives.json`, or scope mismatch | Check [DRIVE-POLICY.md](DRIVE-POLICY.md) and make sure the URL uses `/drive/{drive}/addons/intelligence/...` |
