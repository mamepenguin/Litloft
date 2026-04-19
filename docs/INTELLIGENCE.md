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
  citation_hybrid_enabled: true  # BM25 rerank over dense KNN candidates
  citation_top_k_internal: 10    # candidate pool size for hybrid retrieval
  citation_rrf_k: 60             # RRF fusion constant (standard IR value)
  citation_section_anchor_enabled: true   # hierarchical top-down narrowing via section content
  citation_section_range_top_m: 12        # chunks defining the range at each level
  citation_section_narrow_threshold: 0.5  # cosine floor for narrowing deeper
  citation_section_cluster_gap: 5         # split top-M into clusters by this index gap
  citation_section_cluster_union_ratio: 0.8  # union runner-up cluster when this close
  citation_section_discriminative_enabled: true  # rank chunks by edge over sibling sections
  citation_section_disc_margin: 0.01      # minimum edge over best sibling to keep a chunk
  citation_section_alignment_enabled: true  # Viterbi monotonic DP for 2+ sibling sections
  citation_section_boundary_margin: 2     # expand each DP section range by N chunks each side
  citation_margin_gate: 0.05              # flip ⚠ when top1-top2 gap is this small
  citation_margin_bypass_score: 0.75      # top1 >= this skips margin gate
```

Detailed summaries (`detailed_summaries`) are generated asynchronously and polled via `GET /files/{id}/summary/detailed` (status `generating` → `generated`). The generated Markdown is also downloadable at `/files/{id}/summary/detailed.md`.

### Detailed-summary citations (hallucination guard)

Every detailed summary is parsed into bullets / paragraphs / table rows and each segment is matched against transcript / document chunks of the **same file** using a three-layer hybrid retrieval:

1. **Section anchoring (DP alignment + discriminative scoring)** — when `citation_section_anchor_enabled: true`, every `##` / `###` prefix above the segment defines a section. For each prefix the embeddings of all segments under it are pooled. Each chunk's score for that section is then computed as **discriminative cosine** (`citation_section_discriminative_enabled: true`): `cos(chunk, this_pool) - max(cos(chunk, sibling_pool))`. This is the fix for "the whole video shares one topic" (e.g. a recipe video where every chunk mentions cooking): absolute cosine can't distinguish sibling recipes, but the relative edge over the best sibling can. When a parent prefix has **two or more sibling prefixes with usable pools** (`citation_section_alignment_enabled: true`), the discriminative emissions feed a **monotonic Viterbi DP** that assigns each chunk to exactly one section subject to the summary's section order (no backward, no skip). Each section's range is `[min, max]` of its DP-assigned chunks, expanded by `citation_section_boundary_margin` on each side so transition chunks are shared with neighbors. For single-sibling or disabled DP, the code falls back to pool + cluster detection: surviving top-M chunks are split into contiguous clusters by `citation_section_cluster_gap`; the strongest cluster by total score defines the range, with runners-up within `citation_section_cluster_union_ratio` merged. Each prefix resolves **independently of its parent** — a parent prefix does not constrain its children. This keeps a structural parent like `## 詳細内容` (a container of unrelated recipe H3s) from dragging every child section into whichever zone its average pool happens to score on. Segments look up the deepest prefix's range directly; prefixes don't inherit from one another. A prefix whose pool fails to match distinctively maps to `None` (full-file search for its segments). Files without `##` / `###` structure degrade gracefully to full-file retrieval.
2. **Dense candidate pool** — the segment is embedded with the shared `text_embedding` model and a pool of `citation_top_k_internal` (default 10) chunks is pulled via sqlite-vec KNN, limited to the anchored chunk range when one is available. Table rows with two or more cells pool per-cell embeddings so header labels don't drown out numeric values (the "保存期間 | 3 日" case). If the anchored range produces zero candidates (heading anchored wrong), retry without the range so no segment is dropped solely because of bad anchoring.
3. **BM25 rerank** — when `citation_hybrid_enabled: true`, salient tokens from the segment (kanji runs, katakana, proper nouns, `<number><unit>` pairs) are fed to FTS5 over `fts_transcripts` / `fts_text_content`, same anchored range. The BM25 ranks are RRF-fused with the dense ranks (constant `citation_rrf_k`) and the dense pool is reordered; BM25-only candidates are dropped so the stored `top_score` is still the dense cosine.

**Margin gate**: after fusion, if `top1_score - top2_score < citation_margin_gate` (and `top1_score < citation_margin_bypass_score`), the segment flips to `has_citation = False`. This catches low-confidence picks where several candidates look comparably close — typical when an abstract bullet doesn't really match any single chunk, or when a table row's content spans multiple transcript locations (material mentioned at 5:30, storage at 12:40, variation at 18:00) and no single chunk covers the whole row. Showing ⚠ is more honest than pointing at one of them confidently.

Final interpretation:

- Top-1 cosine similarity `>= citation_threshold` → surfaced as a clickable link badge in the UI; the hover-card shows a ±100 char excerpt (served from `GET /files/{id}/chunks/{chunk_id}/excerpt`) and a "jump" control that reuses the existing transcript seek integration for video/audio
- Top-1 `< citation_threshold` → rendered with a ⚠ "no strong source" marker, giving the user a visible hallucination warning
- `citation_top_k` (default 3) candidates are stored per segment; the UI can cycle through them

Tuning tips: if ⚠ appears on obviously grounded bullets, lower `citation_threshold`; if hallucinated bullets have no warning, raise it. The threshold is embedding-model dependent — re-tune when swapping `models.text_embedding`. Disable `citation_hybrid_enabled` if BM25 introduces lexically-close-but-semantically-wrong hits on a specific corpus.

Precision is measurable via the citation eval harness: `python -m app.evals_citations` scores curated ground-truth cases and reports per-segment-type top-1 accuracy + recall@3 + has_citation precision. See `addons/intelligence/evals/citations/README.md`.

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
