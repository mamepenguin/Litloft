# Litloft feature map

A bird's-eye view of "what this system can do".
Internal implementation details (file names, function names, module names, etc.) are out of scope.

---

## 1. Big picture

Behind a single browser-facing entry point sit the core and a set of addons.
The core handles file management, playback, and basic search. AI, notes, sync, and other extra features
are plugged in as independent addons.

```mermaid
flowchart LR
  U[User<br/>Browser / PWA]
  U --> FE[Litloft core<br/>file listing & playback<br/>search & uploads<br/>tags & favorites<br/>watch history]

  FE <--> D[(Drives<br/>Family videos / Work / ...)]
  FE <--> S[(File metadata<br/>tags / comments / history)]

  FE -.extension.-> I[intelligence<br/>AI search / summary / Ask]
  FE -.extension.-> K[knowledge<br/>Markdown notes<br/>Web clippings]
  FE -.extension.-> DL[downloader<br/>URL ingest]
  FE -.extension.-> P[podcast<br/>RSS distribution]
  FE -.extension.-> C[cloud-sync<br/>cloud backup]

  classDef core fill:#dbeafe,stroke:#2563eb
  classDef addon fill:#fef3c7,stroke:#d97706
  classDef data fill:#d1fae5,stroke:#059669
  class FE core
  class I,K,DL,P,C addon
  class D,S data
```

- **Drive**: the unit of content. Each drive is fully independent — access control and the AI on/off state are configured per drive.
- **Addon**: an independent module that extends the core. Right after cloning, every addon is disabled; you opt in to the ones you need. Whether to use AI features is a per-drive choice.

---

## 2. User-flow axis map

A mind map laid out along "what the user wants to do".
Use it to spot missing or duplicated features.

```mermaid
mindmap
  root((User flows))
    Browse
      Choose drive
      Folder navigation
      File listing Grid/List with lazy preview for documents
      Media playback video / audio / image
      Preview Text / Markdown / PDF / Office / ZIP
      Image viewer swipe / tap zones / spread split LTR / RTL
      Auto-resume of playback position
    Upload
      Drag & drop
      Chunked uploads for large files
      Whole-folder upload
      Realtime progress
    Search & discover
      Keyword search
      Tag search
      Duplicate detection
      Semantic Search
      Ask (natural-language Q&A)
      Find (file-listing query, chip editing)
    Organize
      Tagging single / bulk
      Playlists
      Favorites / pin
      Rename / move single / bulk; hash matching carries AI data forward on move
      Create / edit text files
      Trash with 30-day auto-delete
      Manual deletion of Missing
      AutoTags suggest / approve
    Share & collaborate
      Comments
      Like / Dislike
      Per-profile watch history
    Admin
      Password authentication
      Per-drive access control
      Dashboard stats / scan / health
      Manual scan
    AI extensions
      AI summary short / long
      Detailed Summary Markdown
        Auto-attached citations strong / weak tier
        Paragraphs without a single source remain unmarked (noise avoidance)
        Per-section edit / revert
      AutoTags image / video / document
      Ask with citations
      Transcript Refine fix / revert
      Transcription Whisper
      Frame Caption BLIP
      Knowledge notes / Web clippings / loft:// file links / save Ask answers
      Downloader URL ingest
      LoftRef external URL sources
      Cloud Sync cloud backup
      Podcast RSS feed
    Settings
      Settings page /settings
        Profile nickname
        Theme light / dark / system
        Language ja / en
      Lock / Unlock
      Keyboard shortcuts ⌘ or Ctrl
```

---

## 3. File-state model

A file is shaped by both the FS and user actions, so it has three states.
AI-generated data (transcripts, embedding vectors, captions) cannot be regenerated from the FS,
so even when a file temporarily disappears from the FS the system does not delete immediately.

```mermaid
stateDiagram-v2
  [*] --> Active: Upload / discovered by scan
  Active --> Trash: User deletes
  Active --> Missing: Not found on FS during scan
  Missing --> Active: Reappears on FS (recovered)
  Missing --> [*]: User explicitly purges
  Trash --> Active: Restore
  Trash --> [*]: Auto-purge after 30 days, or manual purge

  note right of Missing
    Watch history, tags, AI-generated data are kept.
    No auto-deletion.
  end note
  note right of Trash
    File on FS stays in place.
    Physical delete happens only on purge.
  end note
```

---

## 4. Intelligence addon — how search works

Below is the engineer-facing detail. The `intelligence` addon is the heart of Litloft's AI axis,
providing a 5-channel parallel search with score fusion and Ask-style answers with citations.
The diagrams below describe the internal flow and the technologies used, for outside engineers and onboarding.

### 4-1. Indexing flow

When a file is scanned by Litloft, a webhook drops a task into intelligence,
which is processed by a priority queue plus per-kind workers.

```mermaid
flowchart TD
  A[Litloft scan complete] -->|scan-complete webhook| B[reconcile diff extraction]
  B --> Q[Priority Queue]

  Q --> M[metadata_worker]
  Q --> W[whisper_worker semaphore=1]
  Q --> C[clip_worker x N]
  Q --> T[text_content_worker]

  M -->|title/description/size| DB1[(indexed_files / fts_files)]

  W -->|faster-whisper| WR[transcript_chunks]
  WR -->|embed_passages| V1[(vec_text)]
  WR --> DB2[(fts_transcripts)]

  C -->|ffmpeg + scenedetect| F[key frames]
  F -->|CLIP ViT| V2[(vec_clip)]
  F -.BLIP optional.-> CAP[caption] --> DB3[(fts_clip_analysis)]

  T -->|extract from PDF / text / subtitles| TS[segments]
  TS -->|embed_passages| V1
  TS --> DB4[(fts_text_content)]

  classDef model fill:#fef3c7,stroke:#d97706
  classDef db fill:#dbeafe,stroke:#2563eb
  class M,W,C,T,F model
  class DB1,DB2,DB3,DB4,V1,V2 db
```

**Related files**: `addons/intelligence/app/indexer.py`, `workers/whisper.py`, `workers/clip.py`, `workers/metadata.py`, `database.py`

### 4-2. Search flow (/search)

A query is vectorized two ways and run through three FTS indexes in parallel; scores are fused per mode.

```mermaid
flowchart TD
  Q[User Query] --> H{X-Lit-Drive header}
  H --> E[embed_query]
  E --> ET[Text Embedding<br/>multilingual-e5 / Ruri]
  E --> EC[CLIP Embedding<br/>OpenAI/llm-jp CLIP]

  ET --> S1[Vector Search text<br/>sqlite-vec L2]
  EC --> S2[Vector Search clip<br/>sqlite-vec L2]
  Q --> S3[FTS5 metadata]
  Q --> S4[FTS5 transcript]
  Q --> S5[FTS5 text_content]

  S1 & S2 & S3 & S4 & S5 --> MODE{mode?}
  MODE -->|precision for UI| P[Weighted cosine fusion<br/>strict cutoff]
  MODE -->|recall for RAG| R[Weighted RRF<br/>text 1.0 / transcript 1.5 / clip 0.2]

  P & R --> G[file-level grouping]
  G --> F[drive scope filter]
  F --> OUT[SearchResponse]

  classDef vec fill:#ede9fe,stroke:#7c3aed
  classDef fts fill:#d1fae5,stroke:#059669
  class S1,S2 vec
  class S3,S4,S5 fts
```

**Related files**: `addons/intelligence/app/search.py`, `embedder.py`

### 4-3. Ask / Find flow (/ask, /find)

Both reuse `/search` recall mode internally and share the Stage A-D pipeline (query decompose → personal history filter → category expand → scoped retrieve), with two output paths:

- **E_ask (`POST /ask`)**: feeds the Stage A-D retrieve into the LLM and streams an answer with citations (existing).
- **E_find (`POST /find`)**: returns the Stage A-D retrieve as a file-card list plus transparent chips (no LLM text generation, no SSE; a single JSON response).

Find mode handles file-listing intent ("Which of the movies I watched last week were sci-fi?") by returning a ranked file list rather than an Ask-style narrative answer. The LLM's interpretation is exposed to the user as chips; clicking × on a chip relaxes that one axis and re-retrieves (stateless — just re-POST with `overrides`). See spec [`2026-04-30-intelligence-find-mode.md`](superpowers/specs/2026-04-30-intelligence-find-mode.md) for details.

The sequence below is for Ask (E_ask). Find replaces everything from "LLM Stream" onward with "format the retrieve result as JSON and return"; citation validation does not run (the tier-1 retrieve hit chunk is shown directly).

Citations always go through whitelist validation to block hallucinations.

```mermaid
flowchart TD
  U[User Question] --> QT[Query Transform<br/>extract keywords via LLM]
  QT --> RT[retrieve_with_keywords<br/>= search recall mode]
  RT --> AF[Access Filter<br/>core Internal API<br/>POST /filter-file-ids]
  AF --> CA[Context Assembly<br/>transcript ±30s / BLIP caption<br/>drop overflow beyond budget]
  CA --> PR[Prompt assembly<br/>system + file blocks + question]
  PR --> LLM[LLM Stream<br/>AsyncOpenAI compatible]
  LLM --> SSE[SSE token stream]
  LLM --> JSON[answer + citations JSON]
  JSON --> CV{Citation Validator}
  CV -->|file_id in whitelist| OK[relevance clamp 0-1]
  CV -->|unknown file_id| DROP[drop]
  OK --> RESP[Response with<br/>drive / filename / quote / segment]

  classDef ext fill:#fee2e2,stroke:#dc2626
  classDef safe fill:#fef3c7,stroke:#d97706
  class LLM,QT ext
  class AF,CV safe
```

**Two layers of safety**:
1. Internal filter: `access_token` cookie → permission check via the core's `/api/internal/filter-file-ids`.
2. Citation validation: any LLM-fabricated file_id absent from the retriever's result set is dropped.

**Related files**: `addons/intelligence/app/rag/service.py` (`stream_answer` for Ask, `find_files` for Find), `addons/intelligence/app/routers/rag.py` (`/ask`, `/find`), `retriever.py`, `query_transform.py`, `query_decomposer.py`, `category_expander.py`, `history_client.py`, `parser.py`, `context.py`, `prompt.py`. Frontend: `addons/intelligence/frontend/pages/find.tsx`, `FindModeSlot.tsx`, `FindChip.tsx`, `api.ts`

### 4-4. Building blocks

| Kind | Tech | Purpose |
|---|---|---|
| Text embedding | multilingual-e5 / Ruri | Shared vector space for queries and documents |
| Image embedding | CLIP ViT (OpenAI / llm-jp) | Search over images and video frames |
| Image description (optional) | BLIP | Improves auto-tag accuracy, augments Ask context |
| Speech transcription | faster-whisper (CTranslate2) | Transcript with timestamps |
| Frame extraction | ffmpeg + scenedetect | Picks representative frames |
| Vector search | sqlite-vec (L2 distance) | In-process, low-dependency |
| Full-text search | SQLite FTS5 | metadata / transcript / text_content |
| Score fusion | Weighted RRF / cosine fusion | recall / precision modes |
| LLM | OpenAI-compatible API (ollama / vLLM / OpenAI / DeepSeek) | Ask answers, query transform |
| Permission boundary | Core Internal API + addon_proxy | Two-layer access control |

---

## How to use this document

- **Want to know what this system can do**: sections 1 and 2 are enough.
- **Want to understand AI search (engineers, onboarding)**: see section 4.
- **Adding a new feature**: check section 2 (the user-flow axis) for overlap with what already exists; if there's no overlap, add a single leaf.

Maintenance tip: the structure (the branches) rarely changes. When you add a feature, just append one leaf.
Implementation details belong in `docs/FEATURES.md` / `docs/ADDON-DEVELOPMENT.md`.
