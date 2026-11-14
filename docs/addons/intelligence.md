# intelligence addon

The `intelligence` addon adds meaning-based search, Ask (question answering over your files), transcripts, summaries, tag and chapter candidates, and image descriptions. It runs as its own container (port 8100) and keeps its data under `data/addons/intelligence/`.

## What it provides

| Feature | What | Default | Needs an LLM |
|---|---|---|---|
| **Indexing** | Extracts text, transcripts and video frames, and builds embeddings | on | no |
| **Semantic search** | Mixes meaning-based results into the search page | on | no |
| **Auto-tags** | Tag candidates you approve one by one | manual | no (better with one) |
| **AI summaries** | A one-sentence summary and a short list of key points per file | manual | yes |
| **Detailed summaries** | Long Markdown summary with source citations | off | yes |
| **AI chapter candidates** | Timestamped chapters for audio and video, applied only when you approve | off | yes |
| **Ask** | Answers questions from your files, with citations | on | yes |
| **Retrieval keywords** | Synonyms and alternate names added to the search index | off | yes |
| **Transcript refine** | Corrects transcripts with an LLM | off | yes |
| **Vision describe** | Image descriptions | manual | yes, with `llm.vision_model` |
| **Visual index** | Described scenes marked on a video's Scenes timeline, each one seekable | off | yes, with `llm.vision_model` |
| **Text in pictures** | Reads the words in pictures with a local OCR engine so search and Ask find them | on | no |
| **Transcription** | Local faster-Whisper, the local Japanese-only Haas engine, or a cloud provider | local | no |
| **Pickup** | A feed of videos you have never opened, ranked by your watch history, newer ones first among equal matches | always | no |

The LLM itself ships disabled (`llm.provider: "disabled"`), so a new install makes no LLM calls until you configure a provider. Features marked "manual" run only when you press a button.

## Privacy at a glance

The addon can send your file content to outside services. Whether it does depends on:

- Which [LLM profile](#llm-profiles-and-routing) a feature uses. A profile on your own machine (ollama, or another model on your network) keeps content at home. A profile marked **External server** sends it to that server, and only on drives that allow it (`llm_cloud` below).
- Indexing a YouTube `.loft`, and reading a frame of one, contacts YouTube from the container for a video you already saved. Nothing is sent but the address of that video.
- **Ask** (`features.rag`) sends transcripts and text of the files it retrieves on every question. A question about one file sends that file's picture, or the frame of a playing video, when the model can read images.
- Vision describe and the visual index send image bytes (and, for the visual index, nearby transcript text) to the vision model.
- **Text in pictures** reads each picture inside the container with a local engine; nothing leaves the machine for the reading itself. The recognised text is then handled like a document's text (see [text in pictures](#text-in-pictures)).
- `transcription.provider`: `"whisper_local"` and `"haas_local"` keep audio local; every other provider sends audio to the cloud.

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
| `transcription_cloud` | The drive uses a local engine: the configured provider when it is local, otherwise `whisper_local` |
| `llm_cloud` | No content from the drive goes to an **External server** profile. A feature routed to one uses the local fallback profile instead, or does not run when there is none |

A missing key means on. The [settings GUI](../admin-guide/settings-gui.md#addon-policy) shows only `transcription_cloud`, `chapter_suggestions` and `llm_cloud`; set the others by editing `drives.json`. A change saved in the GUI reaches this addon within about 30 seconds; a hand edit of `drives.json` needs a backend restart.

## Installation

The addon is a Git submodule under `addons/intelligence/`. Answer yes when `configure.py` asks to enable it. It writes the service into `docker-compose.override.yml`, mounts your drives read-only, copies `search-config.yml.example` to `search-config.yml` if it does not exist yet, and generates `SEARCH_WEBHOOK_SECRET` in `.env`. Then:

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
- `CORE_INTERNAL_SECRET` must be the same non-empty value on both containers for **Approve all** on chapter candidates to work. `configure.py` generates it and wires it into both services. An override written by an older `configure.py` may lack it on the backend; run `configure.py` again to add it.

The first start downloads the ML models (Whisper, CLIP, text embeddings, BLIP) into `data/addons/intelligence/models/`. Expect 1 to 3 GB.

The first start after an upgrade that changes how keywords are counted tokenizes every file once in the background, which takes minutes on a large library. Until it finishes, keyword-based tag suggestions are missing or less precise. Pausing the index queue also pauses this work.

The first start after the upgrade that splits the vector tables by embedding type rebuilds both tables before the addon answers. On a large library this takes several minutes. The log shows `vec partition migration: start` when the rebuild begins and `vec partition migration: done` when it ends. `docker compose ps` may show the addon `unhealthy` until then. Do not restart it: a restart throws the rebuild away and starts it over. The rebuild needs free disk of four times the vector data, and the addon refuses to start with `not enough free disk` when less is free. Most of it returns once the rebuild ends. `search.db` stays larger by about the size of the vectors, and later indexing reuses that space.

## Settings in the browser

An administrator can change most settings at **Settings** → **Intelligence** (`/admin/settings`):

- **Feature toggles**: every `features.*` flag. The three-way flags read **Off**, **Manual only** and **Auto (on index)**.
- **LLM profiles**: the models the addon can use, which one each feature uses (**Routing**), the local fallback for drives that do not allow external servers, and the output language. See [LLM profiles and routing](#llm-profiles-and-routing).
- **Text embedding model**: see [re-generating indexes](#re-generating-indexes).
- **Transcription provider**: provider, language hint and hotwords. Cloud providers need their API key in the environment.
- **Ask (question answering) behaviour**: **Use viewing history** and **Expand semantic categories**.

Settings saved here are stored in `data/addons/intelligence/*-overrides.json` and take priority over `search-config.yml`. **Reset screen settings** removes them, so the file applies again. LLM profiles and routing apply to the next job as soon as they are saved; every other change, including the output language, needs a container restart. Each section marks which of its settings apply at once.

## Features in detail

### Indexing

Every hour (`indexing.reconciliation_interval`) the addon looks for files it has not indexed yet. Changes the core reports (new, moved, deleted files, a finished scan) are picked up without waiting.

- Text, Markdown, HTML, PDF and Office files: the text is extracted, split into chunks (`indexing.text_chunking`) and embedded.
- EPUB books: the text of each chapter file in the reading order is indexed, and a match names its chapter. Ruby readings (furigana) are left out and the text they annotate is kept.
  - A book protected by DRM, or made only of page images, is indexed with no text. So is any chapter listed in the book's `META-INF/encryption.xml`.
  - Limits per book: the first 2,000 chapter files, 2,000,000 characters of text and 20 MB of unpacked data. A chapter file over 5 MB, or a package, navigation or table-of-contents file over 1 MB, is skipped and the rest of the book is still indexed.
  - A book whose zip is corrupt is not indexed at all.
- Audio and video are transcribed, split into chunks and embedded. Keywords from the transcript are stored for **Similar files**.
- For video, frames are picked at scene changes (`indexing.frame_extraction`) and embedded with CLIP.
- Images are embedded with CLIP, and captioned with BLIP when `models.blip` is set.
- Pictures are also read for the words in them with a local OCR engine when `features.image_ocr` is not off; see [text in pictures](#text-in-pictures).
- Videos are read for the words shown on screen, and scanned PDF pages for their text, while `features.video_frame_ocr` / `features.scanned_pdf_ocr` are not off; see [text in videos and scanned pages](#text-in-videos-and-scanned-pages).

Re-indexing a file replaces its old index.

#### PDF page edges

A PDF page keeps the text inside the page, plus the lines that overlap the top and bottom 50 points of the page. From those two bands, page numbers (a line with no letter) and later copies of a line that repeats on three or more pages — a running header or footer — are left out; the first copy is kept. A line the PDF converter already kept is not added a second time. The kept lines join the page's own text, the top ones before it and the bottom ones after it, so semantic search, exact search, Ask, excerpts and `read_document` find them and report that page.

The first start after the addon is upgraded to these rules re-extracts every PDF once, in the background and at a lower priority than new uploads. Until its turn comes, a PDF keeps the text it already had. A later start with the same rules changes nothing.

### Semantic search

Meaning-based results are mixed into the ordinary search results. What a viewer sees is described in [searching by meaning](../user-guide/search.md#searching-by-meaning-intelligence-addon).

The query is embedded with `models.text_embedding`, matched against the vectors and against keyword indexes, and the two are blended with `search.alpha` (0 = keywords only, 1 = vectors only). Results are capped by `search.default_limit` and `search.max_limit`.

`GET /search?q=&limit=` accepts `limit` from 1 to 1000. With Scene search off, the image channel takes as many of the drive's nearest representative frames as the effective limit (never fewer than its previous 50) before the score cutoff applies, so a subject with many pictures is listed past the first fifty.

Both routes accept an optional `filter` query parameter: one JSON object with optional `tags` (strings), `kinds` (the eight kinds, with `markdown` accepted as `text`), `favorite` and `liked` (booleans), `folders` (drive-relative folder paths), `collections` (collection names), `sizes` and `durations` (comparisons). The addon resolves it to the request drive's file ids through `POST /api/internal/files/matching` and ranks only within them; every channel and every relative cutoff sees the filtered set only. Empty tag strings are dropped, tags and kinds are deduplicated case-insensitively (kinds after the `markdown` alias), folders are NFC-normalised and trimmed of `/`, collection names are trimmed with blanks dropped, and at most 20 tags of up to 200 characters, 8 kinds, 10 folders of up to 1024 characters and 10 collections of up to 100 characters apply. A size or duration is a comparison in the wire form `gt:`, `gte:`, `lt:` or `lte:` followed by a plain number: a size is whole bytes from 0 to 2⁵³ − 1, a duration is seconds from 0 to 10,000,000 with at most three decimals. At most 4 distinct comparisons of each apply, counted after deduplication; every one must hold. A key the addon does not know is `422`, and so is a malformed folder, size or duration or a value outside these caps. `filter` cannot be combined with `type`, `include_scene_clip=true` or `mode=recall` on `/search`, or with `type` on `/search/images` (422). If the core cannot resolve the filter, the route answers 503 and runs no unfiltered search. Without `filter`, both routes behave exactly as before.

`/search` also accepts `passages=true`. Each result then carries `passages`: the places in that file the search matched, one per place, sorted by their own score. Each passage has `kind` (`utterance`, `scene`, `page`, `section`, `picture_text`, `text` or `screen_text`), a locator (`start`/`end` seconds, `page`, or `section` with `section_title`), `chunk_index`, `text` (the stored excerpt, or a 200-character window around a keyword match), `score`, `keyword` (a keyword match is among its matches), `highlight_terms` (the query terms and their kana variants, empty when `keyword` is false) and `frame_url` for video utterances, scenes and frame text. A video's frame text is `screen_text`: its `start`/`end` are the stored segment's, its `chunk_index` is the text chunk's, and a chunk with no stored segment makes no passage. Scenes appear only with `include_scene_clip=true`. Without `passages=true` the response is unchanged and has no `passages` key; `/search/images` never carries it. The results page's 箇所 view is built on it.

`GET /search/images?q=&type=` ranks every active file of the request drive by how closely its representative frame matches the query and returns the first 2000, with no score cutoff. `type` takes the same values as `/search`, the drive comes from `X-Lit-Drive`, and it needs the `search` policy. The response has `/search`'s shape (`results`, `total`, `indexed_files`, `service_version`), and each result is the single `clip_thumbnail` match with the score and segments `/search` would give that frame. The search page uses it for **Show more by similarity**.

### Search by an image

`POST /search/by-image` ranks a drive by a picture instead of words. The body is the image itself, with `Content-Type` one of `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/bmp`, `image/heic` or `image/heif`; any other type answers 415 before the body is read. The body may be up to 20,971,520 bytes (413 past that) and the decoded picture up to 50,000,000 pixels (413), and bytes Pillow cannot decode answer 422. The drive comes from `X-Lit-Drive` and the route needs the `search` policy. It reads the body in memory and writes nothing: no table row, no temporary file, and no log line holds the image, its vector or the text read from it.

The answer is `{images, scenes, scenes_partial, documents, text}`:

- `images`: up to 24 pictures of the drive, best first, each `{file_id, drive, filename, file_type, score, match_types: ["clip_thumbnail"], file}`. `score` is the raw cosine similarity to the picture, rounded to four places; pictures below `search.min_score_image_query` are dropped.
- `scenes`: up to 20 video segments, each `{file_id, drive, filename, start, end, peak, score, frame_url, file}`, from the stored scene frames that score at least `search.min_score_image_query`. `scenes_partial` is true when a full 4096-row scene search ended at or above the floor, so other drives may have pushed this drive's frames past the cap.
- `documents`: up to 10 files whose text matches the words read from the picture, each with up to three `passages` in the same shape `/search?passages=true` returns. The text part is the OCR engine: with `features.image_ocr` `"false"` it is not run (`text.status` `"off"`), fewer than 20 non-whitespace characters read as `"too_short"`, a read text is embedded and searched through the text index (`"read"`), and a failure of the reading or of the text search is `"failed"` while the pictures and scenes still answer. `text.excerpt` is up to 200 characters of the recognised text.
- `file` is the hydrated file from the core, or null when the core could not be reached.
- An error in the picture or scene ranking answers 500; an error in the text part leaves `documents` empty and `text.status` `"failed"`.

`GET /search/by-image/available` answers 200 `{}` and does nothing else. It carries the same `pre_check` as the POST route, so the search UI asks it once per drive to learn whether the route is served rather than reading `/api/addons/status`, which filters on `index`.

One image query runs at a time per addon process; a second waits with its body unread. The route's proxy timeout is 28 seconds, inside the 30-second cut the core's Next.js rewrite applies to every `/api/*` request. The SigLIP vision tower is released after `memory.clip_image_idle_unload` idle seconds and loaded again on the next picture; the text encoder used by ordinary search stays resident.

`GET /files/{file_id}/find?q=` lists every occurrence of `q` (1–200 characters, matched as `/search/exact` matches) in one file, for the file page's find bar. It needs file access and the `search` policy, and the drive comes from `X-Lit-Drive`. It reads the file's text chunks (overlapping chunks are merged so an occurrence counts once), its transcript, a video's frame-text segments (each segment one unit, with its start and end), and its scene `visible_text` when the drive's Visual Index is on. The answer is `{query, indexed, total, truncated, rows}`. Each row has `kind` (`utterance`, `scene`, `page`, `section`, `picture_text` or `text`), `start`/`end`, `page`, `section`/`section_title`, `ordinal` (its number among the occurrences in its page, section, chunk or scene), `snippet`, and `match_start`/`match_length` inside the snippet. A video's frame text is a `scene` row with the segment's time, listed whether or not the Visual Index is open; at an equal start, utterances come first, then Visual Index scenes, then frame text. Rows are in position order, at most 2000; `total` counts them all and `truncated` says the list was cut. `indexed` is false when the file has nothing the route can search; for a video it is true when its transcript or its frame text is indexed. It writes nothing.

Search drops results scoring below half the top result, except those with a CLIP match: image cosines sit far below keyword scores, so the rule would hide every picture as soon as one document mentions the word.

### Scene search

**Scene search** in the search results bar matches your words against the stored video frames. `search.min_score_clip` and `search.min_score_clip_thumbnail` are the score floors. Both default to 0.05, which suits the default SigLIP2 model; use 0.20 with CLIP-family models.

`GET /search/scene-segments?q=&limit=` returns time ranges of the drive's videos closest to a query, built from the same stored frame vectors without reading or writing anything else. `q` is 1 to 200 characters and `limit` is 1 to 50 (default 20). Each segment is `{file_id, filename, start, end, peak, score}`, ordered by score, at most two per file. It always returns the closest segments the drive has, so the score says how they compare with each other, not whether the scene exists. `partial` is true when other drives' frames filled the search and the drive's own frames may have been missed. It needs the `search` policy and takes the drive from `X-Lit-Drive`. The search page draws these as **Scene candidates** above the results while **Scene search** is on.

**YouTube references.** A `.loft` that points at a YouTube video has no file to take frames from, so the addon reads them from YouTube without downloading the video. When it indexes the `.loft`, it reads the storyboard YouTube publishes for the video (small preview tiles, one every 1 to 10 seconds depending on the video's length), keeps every tile when they fit under `indexing.frame_extraction.max_frames` and otherwise spreads at most `max_frames` tiles over the whole length of a long video, and stores each as a scene frame. The reference then appears in scene search and `GET /search/scene-segments` with times (its search passages carry no `frame_url`), and `GET /files/{file_id}/scenes` lists its scenes. Each kept tile is also stored under the file's frame cache and shown in the file page's Scenes section and in the Scene candidates grid through `GET /files/{file_id}/scene-tile?t=`, which reads the stored tile without contacting YouTube or running ffmpeg. A reference indexed earlier shows blank pictures until its **Image analysis (CLIP)** task is regenerated from **Index details**. Scene frames of YouTube references join the drive's frame vectors, so on a drive that holds one, the scene-segment threshold taken from the top share of the drive's frames, and similar-files and concept tagging, see them too. When reading a reference's storyboard fails, the addon does not try it again until it restarts, unless its **Image analysis (CLIP)** is regenerated from **Index details**, which tries once more.

`GET /files/{file_id}/frame?t=&size=` reads a single frame of a YouTube reference on request: `yt-dlp` names the video's streams, and `ffmpeg` reads one frame from the 720p-or-lower video stream. Frames are cached with those of other videos. The lookup is kept for 5 minutes per file, at most 4 frame reads run at once, and one request has 15 seconds in all (504 after that). A reference that is not from YouTube answers 400 `No frame source`; a video `yt-dlp` cannot read (private, removed, age-restricted, live) answers 502 `Frame source unavailable`. No other frame is ever returned in place of the one asked for. Ask about one file and the MCP tools use the same route.

`GET /files/{file_id}/scene-tile?t=` returns the stored storyboard tile at that time as WebP, with the frame route's cache header. It answers 404 when no tile is stored at that time, and 400 `Not a video file` for a file that is not a video; it never contacts YouTube and never runs ffmpeg.

The container needs outbound access to `youtube.com`, `i.ytimg.com` and `googlevideo.com`, and `yt-dlp` installed by the image build (`yt-dlp>=2026.8.19`). YouTube changes often; if every YouTube frame starts to answer 502, rebuild the image without the layer cache (`docker compose build --no-cache intelligence`, then `docker compose up -d intelligence`) to pick up a newer `yt-dlp`; an ordinary `up -d --build` reuses the cached install. No cookie or credential is sent, and the video is not stored.

An agent can also list every place a string appears in a drive's document text, transcripts, text shown in video frames (each hit carries its time) and Visual Index scenes (`search_exact`, a plain substring match rather than a ranking), and rank Visual Index scenes by what they show (`search_video_scenes`); both need the `search` policy, and scenes also need the Visual index enabled for the drive.

An agent can read the text of a PDF, Word, Excel, PowerPoint or EPUB file a page, slide, sheet or EPUB section at a time (`read_document`, backed by `GET /files/{file_id}/document-text`). The text is extracted from the file on each call with the same extractors indexing uses, and nothing is stored. A response stops at `max_chars` and returns a `next` cursor to continue. A PDF read covers at most 10 pages. At most two reads extract at once, and PDF conversions (reads and indexing) run one at a time; a read that cannot start within 10 seconds gets 429. The file must already be indexed by the addon.

An agent connected through the [MCP server](../../mcp-server/README.md) can look at the same frames: `list_video_scenes` returns representative scenes picked from them, with a small frame each, and `get_video_frame` returns a large frame at any time. Neither needs the Visual index or a vision model.

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

With two or more profiles the drive can use, the **▾** beside **Create again** lists them, so one summary can be made on another model. The plain button uses the routing. See [Choosing a model for one request](#choosing-a-model-for-one-request).

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

1. Shortlist (`rag.hierarchical`): picks up to `coarse_top_k` likely files first, judged by title and summary. Skipped on drives with fewer than `min_drive_files_for_shortlist` files, or when no file scores above `coarse_score_threshold`. A file whose transcript or text contains a word from the question is added as well, when that word appears in at most `exact_match_max_files` files of the drive. This keeps a product mentioned once inside a long round-up video from being lost. `0` turns the addition off.
2. Retrieval: finds matching passages, searching with up to `clue_count` rewrites of the question.
3. Viewing history (`rag.personal_history`): questions like *"what I watched last week"* are limited to files the viewer opened, up to `max_lookback_days` back. Needs a [profile](../user-guide/profile-preferences.md).
4. Category expansion (`rag.category_expansion`, off by default): the LLM turns vague words like *"sci-fi-ish"* into up to `max_terms` search terms.
5. Answer: the top `top_k` files are passed to the LLM within `max_context_chars_per_file` each and `max_total_context_chars` in total. Citations to files outside the retrieved set are dropped.

Ask cites only files that are verified. See [unverified sources](#unverified-sources).

**Narrowing Ask to a scope.** `POST /api/addons/intelligence/ask` accepts `scope`, an object with any of `folders` (a folder and everything under it), `collections` (by name), `tags`, and `kinds`; conditions combine with AND. It is resolved by the same core call as a semantic search filter (`POST /api/internal/files/matching`), so a scope and a search filter holding the same values name the same files. Every retrieval stage, the multi-step agentic loop included, ranks and cites only inside the resolved set. A scoped stream begins with one `scope` event carrying the four normalised lists and `matched_file_count`; an empty scope answers "no files" (`done.scope_empty: true`) without calling the LLM. A resolution failure answers HTTP 503 with `{"detail": {"code": "scope_unavailable", ...}}` before any stream byte. Unknown keys in the body or inside `scope` answer 422, so a field a later version adds fails closed. The Ask page's **＋ 範囲** menu and chips send it; the folder `…` menu's **ここに質問** and the collection page's **ここに質問** open the page with that folder or collection already in the scope. The scope is never written to an LLM prompt.

Ask can also run as a multi-step loop with a tool-calling model: set `llm.agentic_mode: "auto"`, use `provider: "openai_compatible"`, and list the model in `llm.agentic_models` with its `context_window`. Any other model uses the single-step path. Default `"off"`.


**Ask about one file.** A file page shows an **Ask** tab in its inspector once the file has indexed text: a transcript, or text read from a document or picture. A picture or a video with no text can be asked about too, when some profile has a `vision_model`. The question is answered from that file's indexed chunks only, through the core proxy, so a file the viewer cannot open, a trashed file and a drive with Ask off answer 404. Routes, both with `X-Lit-Drive`:

- `GET /api/addons/intelligence/files/{file_id}/ask` returns `{"available": true}` when the file has at least one indexed chunk in that drive, or when it is a picture or a video with no text and some profile has a `vision_model`, `false` otherwise.
- `POST /api/addons/intelligence/files/{file_id}/ask` with `{"question": "...", "profile": null, "position_seconds": null, "history": []}` streams the answer. The tab sends `position_seconds` while a video or audio file plays, and `history` with the earlier answered turns of the tab's conversation, oldest first, at most the last 10, each `{question, answer}` with a question of 1 to 1,000 characters and an answer of 0 to 20,000. Citations carry a position (`seconds`, `page`, or an EPUB `section`), and the tab turns them into links that move the open player or viewer.

The tab keeps one conversation per file: each new question carries the earlier ones, and the answer takes them into account. **新しい会話** (New conversation) starts over, and the conversation lives only while the page is open. **Markdownで保存** (Save as Markdown) saves the answered turns as a note in the drive, one `##` section per turn, through the same Knowledge save the drive's Ask page uses; see [Ask notes are unverified](knowledge.md#notes-saved-from-ask-are-unverified).

A question about a picture, or about a video while it plays, sends one image with the passages when the profile can read images. For a YouTube reference the image is the frame the video is showing, read from YouTube as above, so the answer starts up to 15 seconds later than a text-only one. The image goes to the profile's `vision_model` instead of its `model`, only through the profile the question resolves to, and only where the drive's `llm_cloud` policy allows that profile. A profile without a `vision_model` cannot answer from a picture, and a video with no text needs one that can.

A video with no text is answered from up to eight frames of at most 1280 px on the long edge, with no passages: the scenes picked for the file, filled with evenly spaced times when they are fewer, and the frame at the playing position among them when the player is past the start. Reading the frames can delay the first token by up to 45 seconds. The frames go to the `vision_model` of the profile the question resolves to, and only where the drive's `llm_cloud` policy allows that profile, as the text of any other question does.

When the file's chunk text exceeds `rag.file_question_max_chars` (default 16,000, from 1,000 to 200,000), the chunks closest to the question are sent and the answer says it read part of the file. The earlier turns share this limit with the passages, at most half of it, so a follow-up can be answered from part of a file the first question read whole.
### Pickup

A row on the drive home of videos you have never opened, ranked by how well they match your watch history in that drive, with newer videos ahead of older ones that match about as well. Pickup lists videos only, and only your video history shapes it. A newly added video can appear within an hour of being indexed. **See all** opens the full feed at `/drive/<name>/addons/intelligence/pickup`.

Pickup also feeds **Recommended** on the [Video](../user-guide/video.md) page: of the feed's top entries that match the app's target and are still unwatched, up to 12 are picked for the day. While new videos are being added, the picks can change during the day. **See all** opens the same list in the video app, the day's picks first and then the rest of the feed, all at once. Recommended is absent when that leaves nothing.

- It needs a [profile](../user-guide/profile-preferences.md) and some watch history. It appears after the next rebuild once you have watched something.
- It makes no LLM calls. It uses the embeddings indexing already made.
- A video counts by how much of it you watched: half or more counts fully, less counts less, and a video you closed before a tenth of it, or removed from **Continue**, does not count. A video you liked or marked as a favourite always counts fully. An embedded video (`.loft`) whose player reports no length counts half.
- The last year of history is grouped into interests. An interest loses half its weight for each week you do not touch it, but never drops below a quarter of the strongest one's share.
- The row shows a different twelve videos each day. The full feed keeps a stable order.
- A file you have opened, ever, is never in the feed. Nothing from another drive is used.
- It is rebuilt when a scan finishes and every hour, for viewers whose history changed. Liking, favouriting or removing a video from **Continue** counts as a change.

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

Refine writes numbers as digits (`2025年`, `1万5000円`) whichever engine transcribed the file. Keyword search, semantic search, the transcript and subtitles use the refined text. A file refined by an earlier version, before refine updated keyword search, keeps matching its text from before refine in keyword search until it is transcribed again.

The first Refine of a file stores the transcript as it was before that run, so **元の結果に戻す** (Restore original) is offered afterwards. See [correcting a transcript or a picture's text](#correcting-a-transcript-or-a-pictures-text). Refine never rewrites a corrected utterance that has no word timings, and a corrected file asks for confirmation before it is refined.

Modes (`features.transcript_refine`): `"false"` (default), `"manual"`, `"on_index"`.

### Text in pictures

Pictures are read for the words in them: screenshots, slides, photos of signs and documents. The engine is RapidOCR with its PP-OCRv6 small models, which ship inside the package, so the picture is read inside the container and nothing is downloaded or sent out for it. It reads JPEG, PNG, WebP, GIF, BMP, HEIC and HEIF files, taking the first frame of a GIF and applying the EXIF orientation.

- A file over 50 MB or over 50 million pixels is not read; it is closed with no text.
- Pictures are read one at a time, in about 1 to 2 seconds each.
- The loaded engine adds about 65 MB; reading a 1600×1200 screenshot peaked at about 440 MB of resident memory in total. `memory.ocr_idle_unload` (default 300 seconds) releases it once it has been idle.

The recognised lines are joined with newlines and stored as the picture's text, then chunked as its text chunks, the same rows a document's text uses, so search, exact search and Ask find and quote them. From there the text follows a document's rules: Ask may send it to the routed LLM, and to an off-host profile only on drives whose `llm_cloud` policy allows it.

Each picture also has one `picture_lines` row, written in the same transaction as its text: the kept lines in the engine's order, each with its text, the four corners of its box as fractions of the picture, and the engine's score. A correction and a restore never edit it. Find in this file carries the boxes of the lines a hit overlaps only while the stored text still equals the lines joined by newlines, and the picture page then outlines those lines over the picture, in the find mark's style with the current hit's line in the current style. A picture read before its lines were kept, or one whose text was corrected, shows its hits with no outline until it is read again or its original text is restored.

Modes (`features.image_ocr`):

- `"on_index"`: read when a picture is indexed. Default. Pictures already indexed with no reading are queued in the background at startup and after each hourly pass, behind new work.
- `"manual"`: read only when it is queued from the reindex or prioritize path.
- `"false"`: never read.

With `"on_index"`, a new picture's OCR task shares the queue with CLIP at normal priority, while the backlog of existing pictures is queued lower so it runs after new work. A reindex runs ahead of both. The OCR worker honours the queue's **Pause**, like the others.

In **Index details** a picture has a **Text in image** row (「画像の文字」 in the Japanese UI) while the mode is not `"false"`, with its status and **Regenerate**. The per-file reindex accepts `ocr` as a task, answering 422 when the mode is `"false"` or the file is not a picture, and prioritize queues OCR for a picture that has not been read.

A change takes effect after an intelligence restart. Turning the mode off keeps the text already stored, which stays searchable until the picture is reindexed or leaves the index.

### Text in videos and scanned pages

Two more local OCR passes use the same engine, settings and queue as text in pictures:

- **Text in video** (`features.video_frame_ocr`): the words shown on screen — slides, terminal output, captions burned into the picture.
- **Text in scanned pages** (`features.scanned_pdf_ocr`): the words on a PDF page that has no text layer.

Both default to `"on_index"`, take `"manual"` and `"false"` the same way, and are set in `search-config.yml` or on the **Settings → Features** screen. A change takes effect after a restart and raises the restart banner. Turning either off keeps the text already stored, which stays searchable.

**Video.** The video is decoded at one frame per second and the first frame is read. A later frame is read when its 256-bit difference hash differs from the last read frame by at least 16 bits and at least 10 seconds have passed. A video taller than 1080 lines decodes only key frames (no full decode of every frame) and reads a selected frame scaled down to 1080 lines; videos up to 1080p use the full-decode method. The recognised lines are kept in the engine's order. Consecutive frames with the same text form one segment, and a segment carries the time it was on screen. The segment text is chunked at 1000 characters with a 200-character overlap and stored as the video's `text_content` rows, so search, Ask, the single-file question and `/search/exact` find it. Find in file lists it under 「画面内の文字」 with its time, and a search passage of kind `screen_text` shows the time, the label and the frame, and opens the video at that second.

What is missed: text that is being written or changed and is gone within the gap (recall about 0.5 on handwriting lectures), and a very dense screen that changes every 10 seconds is read about once every 10 seconds. The measured cost is 2.1–2.8 minutes per video hour on 720p lectures with the gap on; a 1080p excerpt measured 4.9 and a 4K HEVC excerpt 4.8–5.3 minutes per video hour (about 12 minutes per hour is the accepted worst case). Reading happens inside the container; the stored text is sent to the LLM only when Ask, a summary or another LLM feature uses it, under the drive's `llm_cloud` policy.

**Scanned PDFs.** A page is read when `page.get_text("text")` is empty after stripping whitespace; a page with any text, even a page number, keeps its own text. A scanned page is rendered in RGB at 300 dpi (or the highest resolution within 50 megapixels) and read. The text is stored per page and a text-content task re-extracts the PDF with it, so the page behaves like any other page: search hits on it, find rows 「p. N」 open it, and Ask, summaries and `read_document` see it. A page that stores or removes non-empty text resets `text_indexed` until that text task finishes; its existing search rows stay meanwhile. Cost is about 2.6 seconds per page at 300 dpi, so a 500-page scanned PDF takes about 22 minutes. The pdf.js text layer of a scanned page is empty, so choosing a find row shows the page without a mark.

**Index details** lists a **Text in video** row (「動画内の文字」) for a video while `features.video_frame_ocr` is not `"false"`, and a **Text in scanned pages** row (「スキャンしたページの文字」) for a PDF while `features.scanned_pdf_ocr` is not `"false"`, each with its status and **Regenerate**. The per-file reindex accepts `frame_ocr` and `page_ocr`; it answers 422 when the mode is `"false"` or the file is of the wrong type. `prioritize` queues them when they are pending.

### Correcting a transcript or a picture's text

The engine's text is not always right. A name or a term can be transcribed or read wrongly, and search then misses the word the file actually contains.

**A transcript.** On a video or audio file's page, open the transcript and choose **分割テキスト** (Text chunks). Each row offers **修正** (Edit). Save with **保存** (Save) or Enter; cancel with Escape. An emptied row disappears, and at most one row is edited at a time. Corrected rows carry **修正済み** (Edited) next to **AI整形済み** (AI cleaned) when both apply. The **単語** and external-subtitle views are not editable.

**A picture's text.** A picture with stored text shows a **画像の文字** (Text in image) section on its page, whatever `features.image_ocr` is. **修正** opens a multi-line field; Cmd/Ctrl+Enter saves and Escape cancels. The section keeps showing an emptied text so the original can be restored.

**The original.** A file keeps exactly one machine-produced original per kind: the transcript or picture text as it was immediately before the first correction, or before the first Refine of a transcript, whichever came first. **元の結果に戻す** (Restore original) in the transcript header's 分割テキスト view or in the 画像の文字 section puts the whole file back to it. There is no edit history.

**Protection.** A file with a saved correction is not transcribed or read again by the automatic paths: startup recovery, reconciliation, the `.loft` reset, the OCR backlog, the embedding-model rebuild and the startup clean-up of interrupted jobs. Their search rows are rebuilt from the stored text instead. Only an explicit **Index details** → **再生成** or **再試行**, or Refine, replaces a correction, and each asks for confirmation first and sends `overwrite_corrections`. Folder Refine skips corrected files and reports the count. A confirmed regenerate that fails, finds nothing or is cut by a restart keeps the correction.

**Subtitles.** A corrected utterance whose word timings are still pending, or whose alignment failed, is shown as one cue over its own span. The player loads its subtitle file once per page, so it shows a correction the next time the page is opened.

Routes, all with `X-Lit-Drive` and answering 404 for a file outside that drive:

- `PUT /api/addons/intelligence/files/{id}/transcript/utterances/{index}` with `{text, expected_text, expected_start}` saves one utterance.
- `POST /api/addons/intelligence/files/{id}/transcript/restore` restores the transcript.
- `GET` / `PUT /api/addons/intelligence/files/{id}/picture-text` reads and saves a picture's text.
- `POST /api/addons/intelligence/files/{id}/picture-text/restore` restores it.

Coded errors arrive as `{"detail": {"code": "<code>"}}`: `busy`, `changed` and `corrected` (409), and `line_break`, `too_long` and `last_utterance` (422). `GET /files/{id}/transcript` and `/picture-text` carry `corrected`, `has_original` and `busy`; `/index-details` carries `corrected` and `redo_ended_without_result`.

Events, drive-scoped:

- `intelligence.transcript.updated` with `reason` `corrected`, `replaced`, `rebuilt`, `ended` or `restored`.
- `intelligence.picture_text.updated` with `reason` `corrected`, `replaced`, `rebuilt`, `ended` or `restored`.

Turning a drive's `index` policy off, and removing or renaming a drive, purges its corrections and kept originals with the rest of its intelligence data.

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

For video, the vision model describes representative scenes. The **Scenes** panel marks every described scene on its frame timeline and on the tile of the frame it starts at, and the card under the grid describes the last described scene at or before the point you are looking at; click the card to play from there. **Create scenes** starts it, **Regenerate scenes** runs it again, and **Retry the N failed** redoes the scenes that failed. It waits until the video's frames have been indexed.

Modes (`features.video_visual_index`): `"false"` (default), `"manual"`, `"on_index"`. It needs `llm.vision_model`. Frame images and nearby transcript text are sent to the vision model.

### Transcription providers

`transcription.provider` chooses the engine:

| Provider | API key | Speakers | Word timestamps | Hotwords |
|---|---|---|---|---|
| `whisper_local` (default) | — | no | yes | no |
| `haas_local` (Japanese only) | — | no | yes | no |
| `openai_compatible` (OpenAI, Groq, Fireworks, self-hosted) | `OPENAI_API_KEY` | no | yes | no |
| `deepgram` | `DEEPGRAM_API_KEY` | yes | yes | no |
| `elevenlabs_scribe` | `ELEVENLABS_API_KEY` | yes | yes | yes |
| `assemblyai` | `ASSEMBLYAI_API_KEY` | yes | yes | yes |
| `gemini` | `GEMINI_API_KEY` | no | evenly spaced, not measured | yes, through the prompt |

- `whisper_local` and `haas_local` run on your machine. Everything else sends audio to the cloud.
- Large files are converted and split at silences before they are sent, so no provider's upload limit applies. The split size is the provider's limit or 64 MB, whichever is smaller. Change the 64 MB with the `TRANSCRIPTION_MAX_INPUT_MEMORY_BYTES` environment variable on the intelligence container.
- `transcription.hotwords` is a list of names and terms for providers that support it.
- `transcription.language_hint` is a language code (`"ja"`, `"en"`) passed to cloud providers. Empty means detect. `whisper_local` always detects; `haas_local` ignores it.
- A drive with `transcription_cloud: false` uses `haas_local` when it is the provider, and `whisper_local` when the provider is a cloud one.

#### `haas_local`

An unofficial community ONNX conversion of Haas-ja-v1.0 (`oboroge0/Haas-ja-v1.0-onnx-quantized`, Apache 2.0), run on the CPU through `sherpa-onnx`. It is several times faster than `whisper_local` on Japanese and sends no audio out. Select it in **Admin > Settings** or with `transcription.provider`, restart, and it applies to files transcribed from then on. Nothing is re-transcribed automatically; use **Regenerate** on the `whisper` task for one file.

- **Japanese only.** Audio in another language is not detected and does not fail: it produces meaningless text, which is indexed, embedded and searched like any transcript. The provider applies to every drive.
- The model (about 460 MB) downloads from Hugging Face the first time a file is transcribed, so that job takes longer and other transcription waits. It then needs no network. The model stays in `data/addons/intelligence/models/` after you select another provider; delete the `models--oboroge0--Haas-ja-v1.0-onnx-quantized` folder there to fetch it again.
- Conversational speech comes out with far fewer punctuation marks than Whisper writes, so transcript chunks run longer and subtitle cues break less naturally. Numerals are written as digits and fillers tend to be dropped.
- `transcription.haas_local.max_segment_seconds` (15 to 120, default 45) is the longest stretch of speech decoded at once. Lowering it lost a clause without any error in measurement; raising it uses more memory (2.66 GB at 120).
- `transcription.haas_local.num_threads` (at least 1, default 4) is the CPU threads the recognizer uses. A value outside either range is logged and replaced by the default.
- Memory grows with how long a file is, because the audio is decoded whole and voice detection runs over all of it. Peak for the whole addon process, measured on Linux arm64 at the default settings: about 2.6 GB for 5 minutes, 3.6 GB for 35 minutes, and 7.7 GB for a 3.4-hour file small enough (49 MB) to skip splitting. Files over 50 MB are split, which held a 40-minute file to about 3.3 GB. Memory can stay high after a long job even once the recognizer is released.
- `memory.whisper_idle_unload` releases the recognizer too.

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
  image_ocr: "on_index"               # false | manual | on_index
  video_frame_ocr: "on_index"         # false | manual | on_index
  scanned_pdf_ocr: "on_index"         # false | manual | on_index
```

Every flag except `indexing`, `search`, `auto_tags`, `image_ocr`, `video_frame_ocr` and `scanned_pdf_ocr` does nothing while `llm.provider` is `"disabled"`. `features.image_ocr` also decides whether the text in a picture given to [search by an image](#search-by-an-image) is read.

### LLM

```yaml
llm:
  provider: "disabled"                # ollama | openai_compatible | disabled
  base_url: ""                        # ollama: "http://host.docker.internal:11434"
  api_key: ""                         # or env LLM_API_KEY (ignored for ollama); keep the quotes, a bare number is ignored
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

Without `profiles`, this whole section is one profile named `default`, used by every feature, and treated as an **External server** unless it says `offhost: false`. That is how an install from before profiles keeps working unchanged; see [LLM profiles and routing](#llm-profiles-and-routing) to split it.

- `"ollama"`: uses ollama's own API and always asks the model not to reason (`think: false`).
- `"openai_compatible"`: OpenAI, DeepSeek, vLLM, LM Studio, or ollama's `/v1` endpoint, or Anthropic's OpenAI-compatible endpoint (`https://api.anthropic.com/v1`).
- `"disabled"`: no LLM features. Indexing, search and local tag candidates still work.

`max_tokens` is an upper limit, not a reservation. Providers bill only the tokens the model writes, so a high value costs nothing, and a low one cuts long answers off. Chapter candidates for a long video need the room. An existing `search-config.yml` keeps the value it was created with; raise it there if it is lower.

About `reasoning`: a reasoning model spends `max_tokens` on thinking before it answers, and can come back empty. `"disabled"` asks the provider to skip the thinking. A provider that rejects the request field gets it once, and the addon stops sending it for the rest of the run. JSON mode (`response_format`) is handled the same way: a provider that rejects it, as Anthropic's endpoint does, gets the request again without it, and once that answer comes back the addon stops asking for JSON mode for the rest of the run. The prompts still ask for JSON in words. `"auto"` never sends the field. Some providers reason anyway; the log says so.

### LLM profiles and routing

Several models can be configured side by side, and each feature picks one:

```yaml
llm:
  temperature: 0.3                    # tuning knobs here are inherited by every profile
  profiles:
    local:
      provider: ollama
      base_url: "http://host.docker.internal:11434"
      model: "qwen3:14b"
      vision_model: "gemma3:12b"
      offhost: false                  # runs on this machine
    claude:
      provider: openai_compatible
      base_url: "https://openrouter.ai/api/v1"
      model: "anthropic/claude-sonnet-5"
      api_key_env: LLM_API_KEY_CLAUDE # the key's environment variable
      offhost: true                   # an external server
      agentic: true                   # may run the multi-step Ask
  routing:
    default: local                    # features not listed below
    local_fallback: local             # used on drives with llm_cloud: false
    features:
      rag: claude
      summaries: claude
```

- A profile names its own endpoint and model; only tuning knobs (`temperature`, `max_tokens`, retries, timeouts, `reasoning`, vision limits) are inherited from the top of `llm`. The output language is global and cannot be set per profile.
- `offhost` says the model runs on a server outside this machine. A profile without it counts as one. Such a profile is used only on drives whose `llm_cloud` policy is on; elsewhere the feature runs on `local_fallback`, or does not run. If the policy cannot be read, nothing is sent and the job is picked up again later.
- `api_key_env` must be `LLM_API_KEY` or `LLM_API_KEY_<NAME>`. Any other name turns every LLM feature off until it is corrected. Leave it out for a profile that needs no key. Add the variable to the `intelligence` service in `docker-compose.override.yml`; a new variable needs a container restart.
- Features: `rag` (Ask and Find), `summaries`, `detailed_summaries`, `auto_tags`, `transcript_refine`, `retrieval_keywords`, `chapter_suggestions`, `vision_describe`, `video_visual_index`. A vision feature needs a profile with a `vision_model`.
- The multi-step Ask runs on a profile with `agentic: true`, or, for the single `default` profile, a model listed in `agentic_models`. `agentic_mode: "off"` stops it for every profile.
- A mistake in `profiles` or `routing` (an unknown profile or feature, a fallback that is an external server, an invalid key variable) turns every LLM feature off and shows the reason in the settings page.
- Generated summaries, tags, chapters and descriptions record the model that produced them; the file page shows it. Changing the routing does not regenerate anything.

#### Choosing a model for one request

A viewer can pick the profile for one AI summary, one AI detailed summary or one Ask: the **▾** beside the regenerate button, and the model select beside the **Ask** button on the Ask page. Anyone who can press the button can choose; nothing is saved, and the Ask page goes back to **Auto** when it is reopened or the drive changes.

- The list holds only profiles the drive can use: an external server appears only where `llm_cloud` is on, and a profile without a working client or key does not appear. It is shown when there are two or more, or one when the routing serves nothing on that drive.
- A chosen profile is never replaced: if it cannot be used when the request arrives, the request fails (`400 profile_unavailable`) instead of running on the routing or `local_fallback`.
- Indexing, folder actions and the other AI features always use the routing.
- `GET /api/addons/intelligence/llm/choices/{summaries|detailed_summaries|rag}` returns `{auto, choices: [{name, model, offhost}]}` for the `X-Lit-Drive` drive; the regenerate endpoints and `POST /ask` take an optional `profile`.

Once profiles are saved from the settings page they replace `profiles` and `routing` in `search-config.yml` entirely. A key written directly as `llm.api_key` in the yaml is not carried into saved profiles; move it to `LLM_API_KEY` first.

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
  file_question_max_chars: 16000   # Ask tab on a file page: chunk text sent per question

  hierarchical:
    enabled: true
    coarse_top_k: 20
    coarse_score_threshold: 0.3
    min_drive_files_for_shortlist: 50
    fallback_full_search: true
    clue_count: 3
    exact_match_max_files: 10

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
  max_limit: 1000                         # upper bound for a request's limit
  min_score_clip: 0.05                    # 0.20 for CLIP-family models
  min_score_clip_thumbnail: 0.05
  min_score_image_query: 0.70             # floor for similar pictures and scenes
```

### Transcription

```yaml
transcription:
  provider: whisper_local   # whisper_local | haas_local | openai_compatible | deepgram | elevenlabs_scribe | assemblyai | gemini
  language_hint: ""         # empty = detect
  hotwords: []

  whisper_local:
    initial_prompt: ""
    beam_size: 1
    batch_size: 0
    condition_on_previous_text: true
    compression_ratio_threshold: 2.0
    no_speech_threshold: 0.45
    log_prob_threshold: -1.0

  haas_local:
    num_threads: 4
    max_segment_seconds: 45   # 15 to 120

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
  ocr_idle_unload: 300
  clip_image_idle_unload: 600             # SigLIP vision tower; 0 = never
```

Whisper (or the `haas_local` recognizer, when that is the provider), BLIP, the OCR engine and the tag vocabulary model are unloaded after this many idle seconds. CLIP's text encoder and the text embedding model stay loaded because search uses them; the SigLIP vision tower used to embed a picture is released after `clip_image_idle_unload`, shared by indexing and [search by an image](#search-by-an-image).

## UI surface

- **Search**: meaning-based results in the ordinary search, and the **Scene search** switch.
- **Ask** in the sidebar, with the **Ask** and **Find** tabs.
- Sections on the file page, each shown once it has something in it: **Do you trust this source?**, **AI tag candidates**, **AI chapter candidates**, **AI summary**, **AI image description**.
- **AI** button in the file's action row. It lists what the file does not have yet (tag candidates, a summary, a detailed summary, chapter candidates, an image description). It is hidden when there is nothing left to create.
- On a player file, **Transcript**, **Scenes** and **Detailed summary** are [panels under the player](../user-guide/viewers-and-players.md#panels-under-the-player); in a narrow window and on a phone they are tabs in the inspector. **Transcript** has **Clean up with AI**, a switch between **Text chunks**, **Words** and **External** when there is more than one source, and a button on each line that adds it to the capture basket. **Detailed summary**'s **Save as file** also makes the note the file's summary note, which appears in the **Note** panel. On a file without a player, **Detailed summary** is a section in **Info** instead.
- **Similar files** under the inspector's **Related** tab. It searches when the file opens, or when you open the inspector (on a phone, the sheet), so the results are usually there by the time you open the tab, and each result shows keywords it shares with the current file.
- **Pickup** on the drive home.
- **Index details** in the file's `…` menu (see below).
- **AI** in the folder's `…` menu: **Create AI tag candidates…**, **Create AI summaries…** and **Create image descriptions…**. Each asks first and says how many files. That count is the files the folder has loaded so far, which may not be the whole folder.
- On the admin dashboard, the **Index Status** widget (queues, models, **Pause** / **Resume**) and, when something failed, a **N failed jobs** band whose **View** opens the **Failed jobs** list, with **Retry** and **Exclude** per row. It counts OCR tasks in the queue and shows **Text in image**, **Text in video** and **Text in scanned pages** progress bars.

A section disappears on drives where its feature is off.

### Unverified sources

Ask cites only files you have verified. An unverified file (a web clip, or anything else from outside) is still found by search but is never used to answer. See [trusted sources](../user-guide/file-browsing.md#trusted-sources-and-the-review-queue).

On such a file, **Do you trust this source?** asks you to decide:

- Up to three of the file's own paragraphs are shown, each next to a verified note of yours that it resembles. No LLM is called.
- **Trust as a source** verifies it. **Leave it unverified** records that you looked, so you are not asked again.

To keep one passage rather than the whole file, select it and add it to the Knowledge addon's quotation basket.

### Re-generating indexes

There is no "reindex everything" button. Instead:

- For one task on one file, choose **Index details** in the file's `…` menu, then **Regenerate** on a task (`metadata`, `clip`, `whisper`, `text`, `ocr`, `frame_ocr` or `page_ocr`). The file is indexed again on the next pass. A picture shows the `ocr` row while `features.image_ocr` is not `"false"`; a video shows `frame_ocr` while `features.video_frame_ocr` is not `"false"`, and a PDF shows `page_ocr` while `features.scanned_pdf_ocr` is not `"false"`.
- For failed jobs, on the admin dashboard press **View** on the **N failed jobs** band and **Retry** a row. Files skipped because their type is not supported are not listed.

Changing the text embedding model in the browser (or `models.text_embedding` in the file) rebuilds the whole text index at the next restart. Ask and text search are unavailable until it finishes. Detailed-summary citations are not rebuilt; run `backfill_detailed_citations --force` for that.

Changing `models.clip` rebuilds CLIP embeddings at restart only if the new model's vector size differs. Changing the Whisper model does not re-transcribe anything; use **Regenerate** on the `whisper` task.

## Operational notes

- The first indexing of a full drive can take hours. Transcription and frame extraction take most of it.
- Everything the addon stores is in `data/addons/intelligence/` (its database `search.db`, the models, the settings saved in the browser). It never writes to the core database.
- The addon's log: `docker compose logs -f intelligence`.
- Files copied onto a drive from outside Litloft (for example from an iOS device) can carry the decomposed form of a name such as `が`. The addon opens such files under the name they have on disk, and corrects the path it stored for a file it indexed earlier on the next pass. A file whose earlier attempts failed with "Cannot stat audio file" is picked up again by that pass.
- In the first 60 seconds after the addon starts, a job that cannot reach the core is retried instead of recorded as failed.
- Each rebuilt Pickup feed's first 40 videos are recorded in `search.db` (`pickup_feed_log`) and kept for 180 days, so Pickup's accuracy can be measured. Two read-only commands report it per viewer; neither writes to either database:
  - `docker compose exec intelligence python -m app.pickup.evaluate replay --drive <name>` replays the last 60 days of history (`--days`, `--horizon` for the 7-day target window, `--viewer`) and compares the current ranking (marked `*`) with earlier variants, the `fresh_h<days>_f<floor>` recency settings, random order and newest first, by recall at 12 and 40.
  - `docker compose exec intelligence python -m app.pickup.evaluate online --drive <name>` checks, for each video you watched in the last 30 days (`--days`, `--viewer`), whether a recorded feed from the 48 hours before listed it, by week.
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
| LLM features do nothing on one drive | The drive has `llm_cloud` off and the feature's profile is an external server with no local fallback. Mark a local profile `offhost: false`, or set **Use instead on drives without cloud** |
| Every LLM feature stopped after editing `search-config.yml` | The settings page shows the error in `profiles` or `routing`. Fix the yaml and restart, or save from the page |

## See also

- [Addon overview](overview.md)
- [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy)
- [Configuration reference](../reference/configuration.md)
