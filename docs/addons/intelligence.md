# intelligence addon

The `intelligence` addon adds meaning-based search, Ask (question answering over your files), transcripts, summaries, tag and chapter candidates, and image descriptions. It runs as its own container (port 8100) and keeps its data under `data/addons/intelligence/`.

## What it provides

| Feature | What | Default | Needs an LLM |
|---|---|---|---|
| **Indexing** | Extracts text, transcripts and video frames, and builds embeddings | on | no |
| **Semantic search** | Mixes meaning-based results into the search page | on | no |
| **Auto-tags** | Tag candidates you approve one by one | manual | no (better with one) |
| **AI summaries** | A one-sentence and a one-paragraph summary per file | manual | yes |
| **Detailed summaries** | Long Markdown summary with source citations | off | yes |
| **AI chapter candidates** | Timestamped chapters for audio and video, applied only when you approve | off | yes |
| **Ask** | Answers questions from your files, with citations | on | yes |
| **Retrieval keywords** | Synonyms and alternate names added to the search index | off | yes |
| **Transcript refine** | Corrects transcripts with an LLM | off | yes |
| **Vision describe** | Image descriptions | manual | yes, with `llm.vision_model` |
| **Visual index** | A list of described scenes in a video, each one seekable | off | yes, with `llm.vision_model` |
| **Transcription** | Local faster-Whisper or a cloud provider | local | no |
| **Pickup** | A feed of files you have never opened, ranked by your watch history | always | no |

The LLM itself ships disabled (`llm.provider: "disabled"`), so a new install makes no LLM calls until you configure a provider. Features marked "manual" run only when you press a button.

## Privacy at a glance

The addon can send your file content to outside services. Whether it does depends on:

- `llm.provider`: `"ollama"` or another model on your own network keeps content at home. `"openai_compatible"` pointed at a remote API sends it out.
- **Ask** (`features.rag`) sends transcripts and text of the files it retrieves on every question.
- Vision describe and the visual index send image bytes (and, for the visual index, nearby transcript text) to the vision model.
- `transcription.provider`: `"whisper_local"` keeps audio local; every other provider sends audio to the cloud.

### Per-drive policy

Each drive can switch features off in its `addons.intelligence` entry in `drives.json`. `"intelligence": false` turns off everything for that drive. Otherwise, set a key to `false`:

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

| Key | Off means |
|---|---|
| `index` | The drive is not indexed, and has no Pickup |
| `search` | No meaning-based search |
| `rag` | No Ask or Find |
| `auto_tags`, `summaries`, `detailed_summaries` | The generate buttons for that feature are closed |
| `chapter_suggestions` | No chapter candidates |
| `transcript_refine` | No transcript refine |
| `retrieval_keywords` | No retrieval keywords |
| `vision_describe` | No image descriptions; existing ones are deleted at the next addon start |
| `video_visual_index` | No visual index; existing ones are deleted at the next addon start |
| `transcription_cloud` | The drive uses `whisper_local` even when a cloud provider is configured |

A missing key means on. The [settings GUI](../admin-guide/settings-gui.md#addon-policy) shows only `transcription_cloud` and `chapter_suggestions`; set the others by editing `drives.json`. A change saved in the GUI reaches this addon within about 30 seconds; a hand edit of `drives.json` needs a backend restart.

## Installation

The addon is a Git submodule under `addons/intelligence/`. Answer yes when `configure.py` asks to enable it. It writes the service into `docker-compose.override.yml`, mounts your drives read-only, copies `search-config.yml.example` to `search-config.yml`, and generates `SEARCH_WEBHOOK_SECRET` in `.env`. Then:

```bash
docker compose up -d --build
```

For a manual install, add the blocks below to `docker-compose.override.yml`, set `SEARCH_WEBHOOK_SECRET` in `.env` (`openssl rand -hex 32`), copy `addons/intelligence/search-config.yml.example` to `addons/intelligence/search-config.yml`, and rebuild.

```yaml
services:
  backend:
    environment:
      - INTELLIGENCE_SERVICE_URL=http://intelligence:8100
      - SEARCH_WEBHOOK_SECRET=${SEARCH_WEBHOOK_SECRET:-}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}

  intelligence:
    build: ./addons/intelligence
    expose:
      - "8100"
    environment:
      - DRIVE_MOUNTS=default=/drives/default
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
      # Mount the data directory, never data.db on its own.
      - ./data:/data:ro
      # Hides the core's token signing key from the addon.
      - /dev/null:/data/.jwt_secret:ro
      - ./videos:/drives/default:ro
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/health', timeout=5)"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

Why the data directory is mounted this way: [read-only mounts for addons](../admin-guide/docker-compose.md#read-only-mounts-for-addons).

- `INTELLIGENCE_SERVICE_URL` on the backend lets the core find the addon. Without it every addon route returns 404.
- `SEARCH_WEBHOOK_SECRET` must be on both containers or on neither. Set on the addon alone, every file-change notification from the core is rejected and indexing silently stops.
- `CORE_INTERNAL_SECRET` must be the same non-empty value on both containers for **Approve all** on chapter candidates to work. `configure.py` generates it only when the Knowledge addon is also enabled; otherwise add it to `.env` yourself (`openssl rand -hex 32`).

The first start downloads the ML models (Whisper, CLIP, text embeddings, BLIP) into `data/addons/intelligence/models/`. Expect 1 to 3 GB.

## Settings in the browser

An administrator can change most settings at **Settings** → **Intelligence** (`/admin/settings`):

- **Feature toggles**: every `features.*` flag. The three-way flags read **Off**, **Manual only** and **Auto (on index)**.
- **LLM provider**: provider, base URL, text model, vision model and output language. The API key comes only from the `LLM_API_KEY` environment variable.
- **Text embedding model**: see [re-generating indexes](#re-generating-indexes).
- **Transcription provider**: provider, language hint and hotwords. Cloud providers need their API key in the environment.
- **Ask (question answering) behaviour**: **Use viewing history** and **Expand semantic categories**.

Settings saved here are stored in `data/addons/intelligence/*-overrides.json` and take priority over `search-config.yml`. **Reset screen settings** removes them, so the file applies again. Every change needs a container restart.

## Features in detail

### Indexing

Every hour (`indexing.reconciliation_interval`) the addon looks for files it has not indexed yet. Changes the core reports (new, moved, deleted files, a finished scan) are picked up without waiting.

- Text, Markdown, HTML, PDF and Office files: the text is extracted, split into chunks (`indexing.text_chunking`) and embedded.
- Audio and video are transcribed, split into chunks and embedded. Keywords from the transcript are stored for **Similar files**.
- For video, frames are picked at scene changes (`indexing.frame_extraction`) and embedded with CLIP.
- Images are embedded with CLIP, and captioned with BLIP when `models.blip` is set.

Re-indexing a file replaces its old index.

### Semantic search

Meaning-based results are mixed into the ordinary search results. What a viewer sees is described in [searching by meaning](../user-guide/search.md#searching-by-meaning-intelligence-addon).

The query is embedded with `models.text_embedding`, matched against the vectors and against keyword indexes, and the two are blended with `search.alpha` (0 = keywords only, 1 = vectors only). Results are capped by `search.default_limit` and `search.max_limit`.

### Scene search

**Scene search** above the search results matches your words against the stored video frames. `search.min_score_clip` and `search.min_score_clip_thumbnail` are the score floors. Both default to 0.05, which suits the default SigLIP2 model; use 0.20 with CLIP-family models.

### Auto-tags

A file's page can show **AI tag candidates**. Nothing is applied until someone adds a tag. How viewers use them: [suggested tags](../user-guide/tags-and-relations.md#suggested-tags-intelligence-addon).

Candidates come from three sources inside the file's own drive: CLIP scores against a built-in vocabulary and the drive's existing tags, tags on visually similar files that are already tagged, and keywords from the transcript and filename. With an LLM configured, it picks the final candidates from these. Without one, these are the candidates.

Modes (`features.auto_tags`):

- `"false"`: off.
- `"manual"`: created when someone presses **Create AI tag candidates**. Default.
- `"on_index"`: created for every newly indexed file.

### AI summaries

- **AI summary**: one sentence and one paragraph. Shown on the file's page only; never written into the file or the core database. Skipped when the file has less usable text than `summaries.min_context_chars`.
- **AI detailed summary**: long Markdown. Each point carries a citation to the passage it came from. You can edit it (**Edit**), go back to the generated version (**Restore created version**), download it (**Download as Markdown**), or with the Knowledge addon save it as a note (**Save as file**). Citations are recomputed after every save.

A point gets a citation only when the best matching passage scores at least `summaries.citation_threshold` (default 0.55). A citation with a weaker match is marked **Needs review - weaker source match**. The other `summaries.citation_*` keys tune how the passage is found; the comments in `search-config.yml.example` explain them.

`features.summaries` and `features.detailed_summaries` take the same three modes as auto-tags. `summaries` defaults to `"manual"`, `detailed_summaries` to `"false"`.

### AI chapter candidates

For audio and video with a transcript, the LLM proposes a full set of chapters. Long transcripts are processed in parts and merged, so the chapters cover the whole file.

The set waits under **AI chapter candidates** on the file's page:

- **Approve all** replaces the file's chapters with the candidates.
- **Dismiss** discards the candidates and leaves the chapters as they were.
- **Create again** replaces the candidates, but only once the new set has been created.

If generation fails, the previous candidates and chapters stay. When the model ran out of output tokens before writing anything, the page says so: raise `llm.max_tokens`, or check `llm.reasoning`.

Modes (`features.chapter_suggestions`): `"false"` (default), `"manual"`, `"on_index"` (after transcription).

**Approve all** needs `CORE_INTERNAL_SECRET` on both containers (see [installation](#installation)). Without it approval fails and the candidates stay.

### Ask (RAG)

**Ask** is the sidebar entry that opens `/drive/<name>/addons/intelligence`. Its header names the drive and how many files the drive holds. That count is every file in the drive, not only the indexed ones. The **Find** tab beside **Ask** returns a list of files instead of a written answer. How viewers use them: [Ask and Find](../user-guide/search.md#ask-and-find-intelligence-addon).

How an answer is built (keys under `rag.*`):

1. Shortlist (`rag.hierarchical`): picks up to `coarse_top_k` likely files first. Skipped on drives with fewer than `min_drive_files_for_shortlist` files, or when no file scores above `coarse_score_threshold`.
2. Retrieval: finds matching passages, searching with up to `clue_count` rewrites of the question.
3. Viewing history (`rag.personal_history`): questions like *"what I watched last week"* are limited to files the viewer opened, up to `max_lookback_days` back. Needs a [profile](../user-guide/profile-preferences.md).
4. Category expansion (`rag.category_expansion`, off by default): the LLM turns vague words like *"sci-fi-ish"* into up to `max_terms` search terms.
5. Answer: the top `top_k` files are passed to the LLM within `max_context_chars_per_file` each and `max_total_context_chars` in total. Citations to files outside the retrieved set are dropped.

Ask cites only files that are verified. See [unverified sources](#unverified-sources).

Ask can also run as a multi-step loop with a tool-calling model: set `llm.agentic_mode: "auto"`, use `provider: "openai_compatible"`, and list the model in `llm.agentic_models` with its `context_window`. Any other model uses the single-step path. Default `"off"`.

### Pickup

A row on the drive home of files you have never opened, ranked by how well they match your watch history in that drive. **See all** opens the full feed at `/drive/<name>/addons/intelligence/pickup`.

- It needs a [profile](../user-guide/profile-preferences.md) and some watch history. It appears after the next rebuild once you have watched something.
- It makes no LLM calls. It uses the embeddings indexing already made.
- The last year of history is grouped into interests. An interest loses half its weight for each week you do not touch it, but never drops below a quarter of the strongest one's share.
- The row shows a different twelve files each day. The full feed keeps a stable order.
- A file you have opened, ever, is never in the feed. Nothing from another drive is used.
- It is rebuilt when a scan finishes and every hour, for viewers whose history changed.

Watching many episodes of one series pulls the feed toward that series, which is expected.

### Retrieval keywords

The LLM reads each indexed file and writes up to 20 words people might search for instead: synonyms, abbreviations, alternate names, and the correct spelling of names a transcript got wrong. They go into their own search index. A result found this way carries the **Keyword** badge. They are never used as Ask citations.

- The first 8,000 characters of the transcript or text are sent to the LLM.
- Search terms shorter than 3 characters do not match these keywords.
- Transcribed audio and video gain the most.

Modes (`features.retrieval_keywords`):

- `"false"`: off. Default.
- `"manual"`: nothing in the app starts it. Use `"on_index"` to create keywords.
- `"on_index"`: created for each newly indexed file. At startup, indexed files without keywords are queued.

### Transcript refine

**Clean up with AI** in the transcript asks the LLM to fix punctuation, homophones and names, chunk by chunk. The words are then re-timed against the audio and the embeddings rebuilt. If re-timing fails (audio missing, language not supported, out of memory), the old word timings stay.

Refine replaces the transcript text, and there is no undo. To get the original back, transcribe the file again: **Index details** → **Regenerate** on the `whisper` task.

Modes (`features.transcript_refine`): `"false"` (default), `"manual"`, `"on_index"`.

### Vision describe

The vision model describes each image (including HEIC). The description is shown under **AI image description**, used for search, and fed to tag candidates.

- Modes (`features.vision_describe`): `"false"`, `"manual"` (default), `"on_index"`.
- It needs `llm.vision_model` and a working LLM provider. With either missing, the feature is unavailable.
- `"on_index"` sends every new image, so the cost grows with your photo library.

#### What a file's state means

`GET /api/addons/intelligence/files/{id}/visual_description` returns `status` and `reason`:

| `status` | `reason` | Meaning | Worth retrying? |
|---|---|---|---|
| `null` | `null` | Never attempted | — |
| `pending` | `null` | Queued or running | — |
| `success` | `null` | Description stored | — |
| `unsupported` | `not_configured` | No usable vision model is configured | No. Fix the configuration |
| `unsupported` | `vision_unsupported` | The configured model does not accept images | Only after changing the model |
| `unsupported` | `null` | Marked unsupported without a recorded cause | Yes |
| `failed` | `model_missing` | The model is not installed on the provider | Yes, once it is pulled |
| `failed` | `image_rejected` | The provider could not read this image | Yes, though it may fail again |
| `failed` | `token_budget` | The description hit `llm.vision_max_tokens` | Yes, after raising it |
| `failed` | `load` / `decode` / other | The image could not be read before the model was called | Yes |

When the provider rejects a request, the addon sends a fixed test image to the same model, once per model, to tell "this model cannot see" apart from "this image could not be read".

#### Retrying

- **Retry** on a file's page, for one file.
- **Create image descriptions…** in a folder's **AI** menu, for the images the folder has loaded (up to 500). It describes them again even when they already have a description.

Automatic runs never redo an image that already has a result.

#### Endpoints

| Endpoint | Notes |
|---|---|
| `GET /files/{id}/visual_description` | `status` and `reason` as above |
| `POST /files/{id}/visual_description/generate` | `{"status": "accepted"}`, or `{"status": "already_queued"}`. `409` with `{"detail": {"error": "not_queued", "reason": ...}}` when the worker declines it. `404` when the feature is unavailable |
| `DELETE /files/{id}/visual_description` | Removes the description, its embeddings and its reason |
| `POST /folders/visual_description/generate` | `413` with `{"error": "too_many_files", "max", "requested"}` above 500 files |

### Visual index

For video, the vision model describes representative scenes. The **Visual index** section lists them with their timestamps; click one to play from there. **Generate** starts it, **Retry failed scenes** redoes the scenes that failed. It waits until the video's frames have been indexed.

Modes (`features.video_visual_index`): `"false"` (default), `"manual"`, `"on_index"`. It needs `llm.vision_model`. Frame images and nearby transcript text are sent to the vision model.

### Transcription providers

`transcription.provider` chooses the engine:

| Provider | API key | Speakers | Word timestamps | Hotwords |
|---|---|---|---|---|
| `whisper_local` (default) | — | no | yes | no |
| `openai_compatible` (OpenAI, Groq, Fireworks, self-hosted) | `OPENAI_API_KEY` | no | yes | no |
| `deepgram` | `DEEPGRAM_API_KEY` | yes | yes | no |
| `elevenlabs_scribe` | `ELEVENLABS_API_KEY` | yes | yes | yes |
| `assemblyai` | `ASSEMBLYAI_API_KEY` | yes | yes | yes |
| `gemini` | `GEMINI_API_KEY` | no | evenly spaced, not measured | yes, through the prompt |

- `whisper_local` runs on your machine. Everything else sends audio to the cloud.
- Large files are converted and split at silences before they are sent, so no provider's upload limit applies. The split size is the provider's limit or 64 MB, whichever is smaller. Change the 64 MB with the `TRANSCRIPTION_MAX_INPUT_MEMORY_BYTES` environment variable on the intelligence container.
- `transcription.hotwords` is a list of names and terms for providers that support it.
- `transcription.language_hint` is a language code (`"ja"`, `"en"`) passed to cloud providers. Empty means detect. `whisper_local` always detects.
- A drive with `transcription_cloud: false` uses `whisper_local` whatever the provider.

## Configuration reference

All settings live in `addons/intelligence/search-config.yml`. The blocks below are the shipped defaults. Settings saved in the browser override the file (see [settings in the browser](#settings-in-the-browser)). Every field of the dataclasses in `addons/intelligence/app/config.py` is also accepted; the ones not listed here are tuning values.

### Feature flags

```yaml
features:
  indexing: true
  search: true
  auto_tags: "manual"                 # false | manual | on_index
  summaries: "manual"                 # false | manual | on_index
  detailed_summaries: "false"         # false | manual | on_index
  rag: true                           # Ask and Find
  transcript_refine: "false"          # false | manual | on_index
  vision_describe: "manual"           # false | manual | on_index
  retrieval_keywords: "false"         # false | manual | on_index
  chapter_suggestions: "false"        # false | manual | on_index
  video_visual_index: "false"         # false | manual | on_index
```

Every flag except `indexing`, `search` and `auto_tags` does nothing while `llm.provider` is `"disabled"`.

### LLM

```yaml
llm:
  provider: "disabled"                # ollama | openai_compatible | disabled
  base_url: ""                        # ollama: "http://host.docker.internal:11434"
  api_key: ""                         # or env LLM_API_KEY (ignored for ollama)
  model: ""                           # e.g. "gemma4:e4b", "gpt-4o-mini"
  max_tokens: 8192
  temperature: 0.3
  output_language: "auto"             # "auto" or a language tag such as "ja", "en"
  retry_attempts: 3
  retry_base_delay: 1.0
  retry_max_delay: 30.0
  min_request_interval_ms: 0          # 500-1000 for paid APIs
  request_timeout_seconds: 90.0
  request_connect_timeout_seconds: 10.0
  reasoning: "disabled"               # disabled | auto
  vision_model: ""                    # e.g. "llava:13b", "gpt-4o-mini"
  vision_max_tokens: 1024
  vision_temperature: 0.1
  agentic_mode: "off"                 # off | auto
  agentic_models: []                  # - name: "gpt-4o"
                                      #   context_window: 128000
```

- `"ollama"`: uses ollama's own API and always asks the model not to reason (`think: false`).
- `"openai_compatible"`: OpenAI, DeepSeek, vLLM, LM Studio, or ollama's `/v1` endpoint.
- `"disabled"`: no LLM features. Indexing, search and local tag candidates still work.

`max_tokens` is an upper limit, not a reservation. Providers bill only the tokens the model writes, so a high value costs nothing, and a low one cuts long answers off. Chapter candidates for a long video need the room. An existing `search-config.yml` keeps the value it was created with; raise it there if it is lower.

About `reasoning`: a reasoning model spends `max_tokens` on thinking before it answers, and can come back empty. `"disabled"` asks the provider to skip the thinking. A provider that rejects the request field gets it once, and the addon stops sending it for the rest of the run. `"auto"` never sends the field. Some providers reason anyway; the log says so.

### Summaries

```yaml
summaries:
  min_context_chars: 50
  max_context_chars: 8000
  window_chars: 2500
  window_count: 3
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
    clue_count: 3

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
  whisper: "openai/whisper-large-v3-turbo"
  text_embedding: "ibm-granite/granite-embedding-97m-multilingual-r2"
  clip: "llm-jp/waon-siglip2-base-patch16-256"
  blip: "Salesforce/blip-image-captioning-base"   # empty = no image captions
```

`text_embedding` accepts only these models:

| Model | Size | Notes |
|---|---|---|
| `ibm-granite/granite-embedding-97m-multilingual-r2` | 384d, ~190 MB | Multilingual. Default |
| `ibm-granite/granite-embedding-311m-multilingual-r2` | 768d, ~620 MB | Multilingual, higher quality |
| `cl-nagoya/ruri-v3-30m` | 256d, ~150 MB | Japanese |
| `cl-nagoya/ruri-v3-130m` | 768d, ~520 MB | Japanese |
| `cl-nagoya/ruri-v3-310m` | 1024d, ~1.2 GB | Japanese, most accurate |

Other CLIP models: `llm-jp/llm-jp-clip-vit-base-patch16` (Japanese) and `openai/clip-vit-b-32` (English). With either, raise `search.min_score_clip` to 0.20.

Other Whisper models: `openai/whisper-small` (smaller, less accurate), `openai/whisper-large-v3` (most accurate, 2 to 3 GB of memory), or any faster-whisper size or CTranslate2 repository on Hugging Face.

### Search

```yaml
search:
  alpha: 0.7                              # 0 = keywords only, 1 = vectors only
  default_limit: 20
  max_limit: 100
  min_score_clip: 0.05                    # 0.20 for CLIP-family models
  min_score_clip_thumbnail: 0.05
```

### Transcription

```yaml
transcription:
  provider: whisper_local   # whisper_local | openai_compatible | deepgram | elevenlabs_scribe | assemblyai | gemini
  language_hint: ""         # empty = detect
  hotwords: []

  whisper_local:
    model: openai/whisper-large-v3-turbo
    initial_prompt: ""
    beam_size: 1
    batch_size: 0
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
    model_id: scribe_v2                    # scribe_v1 | scribe_v2
    diarize: true
    no_verbatim: false                     # drop filler words; scribe_v2 only
    timeout_s: 600

  assemblyai:
    model: best                            # best | nano
    language_detection: true
    speaker_labels: true
    timeout_s: 1800
    poll_interval_s: 3

  gemini:
    model: gemini-2.5-flash                # gemini-2.5-flash | gemini-2.5-pro
    output_language: ja
    upload_wait_sec: 300
    timeout_s: 1800
```

Leave `initial_prompt` empty. The addon has a built-in prompt per language, and a value here replaces it for every language. Never put filenames or lists of names in it: Whisper then writes them into the transcript where nobody said them.

### Indexing

```yaml
indexing:
  reconciliation_interval: 3600           # seconds

  frame_extraction:
    scene_threshold: 0.3                  # higher = fewer frames
    min_interval: 30                      # seconds
    max_frames: 500

  text_chunking:
    max_chunk_size: 400
    overlap: 80
```

`indexing.whisper.*` is the old place for the `whisper_local` settings. It is still read, but `transcription.whisper_local.*` wins where both are set.

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
  clip_concepts_idle_unload: 600
```

Whisper, BLIP and the tag vocabulary model are unloaded after this many idle seconds. CLIP and the text embedding model stay loaded because search uses them.

## UI surface

- **Search**: meaning-based results in the ordinary search, and the **Scene search** switch.
- **Ask** in the sidebar, with the **Ask** and **Find** tabs.
- Sections on the file page, each shown once it has something in it: **Do you trust this source?**, **AI tag candidates**, **AI chapter candidates**, **AI summary**, **AI detailed summary**, **AI image description**, **Visual index**, **CLIP Frames**.
- **AI** button in the file's action row. It lists what the file does not have yet (tag candidates, a summary, a detailed summary, chapter candidates, an image description). It is hidden when there is nothing left to create.
- **Transcript** tab in the inspector, for files that have a transcript. It has **Clean up with AI**, a switch between **Text chunks**, **Words** and **External** when there is more than one source, and a button on each line that adds it to the capture basket. Where it sits: [chapters and the transcript](../user-guide/viewers-and-players.md#chapters-and-the-transcript-beside-or-below).
- **Similar files** under the inspector's **Related** tab. It searches only when you expand it, and each result shows keywords it shares with the current file.
- **Pickup** on the drive home.
- **Index details** in the file's `…` menu (see below).
- **AI** in the folder's `…` menu: **Create AI tag candidates…**, **Create AI summaries…** and **Create image descriptions…**. Each asks first and says how many files. That count is the files the folder has loaded so far, which may not be the whole folder.
- On the admin dashboard, the **Index Status** widget (queues, models, **Pause** / **Resume**) and, when something failed, a **N failed jobs** band whose **View** opens the **Failed jobs** list, with **Retry** and **Exclude** per row.

A section disappears on drives where its feature is off.

### Unverified sources

Ask cites only files you have verified. An unverified file (a web clip, or anything else from outside) is still found by search but is never used to answer. See [trusted sources](../user-guide/file-browsing.md#trusted-sources-and-the-review-queue).

On such a file, **Do you trust this source?** asks you to decide:

- Up to three of the file's own paragraphs are shown, each next to a verified note of yours that it resembles. No LLM is called.
- **Trust as a source** verifies it. **Leave it unverified** records that you looked, so you are not asked again.

To keep one passage rather than the whole file, select it and add it to the Knowledge addon's quotation basket.

### Re-generating indexes

There is no "reindex everything" button. Instead:

- For one task on one file, choose **Index details** in the file's `…` menu, then **Regenerate** on a task (`metadata`, `clip`, `whisper` or `text`). The file is indexed again on the next pass.
- For failed jobs, on the admin dashboard press **View** on the **N failed jobs** band and **Retry** a row. Files skipped because their type is not supported are not listed.

Changing the text embedding model in the browser (or `models.text_embedding` in the file) rebuilds the whole text index at the next restart. Ask and text search are unavailable until it finishes. Detailed-summary citations are not rebuilt; run `backfill_detailed_citations --force` for that.

Changing `models.clip` rebuilds CLIP embeddings at restart only if the new model's vector size differs. Changing the Whisper model does not re-transcribe anything; use **Regenerate** on the `whisper` task.

## Operational notes

- The first indexing of a full drive can take hours. Transcription and frame extraction take most of it.
- Everything the addon stores is in `data/addons/intelligence/` (its database `search.db`, the models, the settings saved in the browser). It never writes to the core database.
- The addon's log: `docker compose logs -f intelligence`.
- In the first 60 seconds after the addon starts, a job that cannot reach the core is retried instead of recorded as failed.
- If the addon hangs (stops responding while its container still runs), `docker compose ps` shows it `unhealthy` (from the healthcheck), and the log contains a stack dump of every thread once it has been stuck for 120 seconds (`INTELLIGENCE_WATCHDOG_THRESHOLD`). Nothing restarts it automatically: run `docker compose restart intelligence`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| A new drive finds nothing by meaning | It has not been indexed yet. Wait for the next pass (hourly), or use **Index details** → **Regenerate** on one file |
| Indexing never happens | `SEARCH_WEBHOOK_SECRET` is set on the addon but not on the backend |
| Some files keep failing | Admin dashboard → **View** on the failed-jobs band → **Retry**, or **Regenerate** the failed task from the file's **Index details** |
| Detailed-summary points have no citation although the source says it | Lower `summaries.citation_threshold` |
| Whisper transcripts drift into nonsense | Lower `compression_ratio_threshold`; never put filenames in `initial_prompt` |
| Gemini word timestamps are evenly spaced | Expected. Use `assemblyai`, `deepgram` or `elevenlabs_scribe` when word timing matters |
| Gemini upload times out | Raise `transcription.gemini.upload_wait_sec` |
| **Approve all** on chapter candidates fails | `CORE_INTERNAL_SECRET` is missing or differs between the backend and the addon |
| Chapter candidates fail with an output-budget message | Raise `llm.max_tokens`, or keep `llm.reasoning: "disabled"` |
| An image says the model does not accept images, but `llm.vision_model` is set | Press **Retry** on the file, or **Create image descriptions…** for a folder. A state without a recorded cause is re-checked |
| Descriptions stay at *Creating description…* | The addon stopped while working. A restart queues them again; the file also offers **Retry**. Check that `llm.provider` is not `"disabled"` |
| Vision fails with `token_budget` | Raise `llm.vision_max_tokens`. Cut-off descriptions are not stored |
| Every intelligence request fails and the core logs `SLOW REQUEST` | The addon is hung. See [Operational notes](#operational-notes) |
| Container runs out of memory while indexing | Add memory, lower `whisper_idle_unload` and `blip_idle_unload` (e.g. 60), or lower `TRANSCRIPTION_MAX_INPUT_MEMORY_BYTES` |
| The LLM returns 429 | Set `llm.min_request_interval_ms: 1000` or raise `llm.retry_max_delay` |

## See also

- [Addon overview](overview.md)
- [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy)
- [Configuration reference](../reference/configuration.md)
