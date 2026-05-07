# Search

Litloft has search at three layers, increasing in capability:

1. **Built-in keyword search** — always available; matches filename, title, and description.
2. **Filters** — type, tag, date range; combine with keyword.
3. **Semantic and Ask** — provided by the [intelligence addon](../addons/intelligence.md); embeddings over text, transcripts, and images, plus RAG question answering.

Search is **drive-scoped** — it never crosses drive boundaries. Open the search page from a drive's home page or via the keyboard.

## Built-in keyword search

`/drive/<name>/search?q=<query>`

- Matches the filename, the user-set title, and the description fields. For Markdown files, frontmatter `title` is included.
- Case-insensitive, substring match. No fuzzy matching by default.
- Results are returned as a flat list of files; sort by relevance, name, or date.

## Filters

Above the result grid you find:

- **Type filter** — video / audio / image / document / archive / other (multi-select).
- **Tag filter** — auto-completes from the drive's tag set. Multi-select acts as AND.
- **Sort** — relevance (default for searches), name, created, modified, size, duration.

Filters are reflected in the URL so a link is shareable.

## Saving as a Smart Folder

When you have a query and filter combination you want to keep:

- Click **Save** → name the Smart Folder.
- Smart Folders appear on the drive home page.
- They re-evaluate live: a Smart Folder defined as `tag=todo type=document` always shows the current matching files.

Smart Folders are drive-scoped and shared across viewers.

## Tag filtering

For non-Markdown files, tags live in the `Tag` table and are applied through the file detail page.

For Markdown files, tags live in the YAML frontmatter (`tags: [a, b]`). The backend mirrors them into `File.tags` whenever the file is saved, so a tag filter sees both kinds the same way.

See [tags and relations](tags-and-relations.md) for the canonical-store split.

## Semantic search (intelligence addon)

When the [intelligence addon](../addons/intelligence.md) is enabled for a drive, two extra search modes appear:

- **Semantic Search** — embeddings over text, transcripts, and a representative CLIP frame per video. Hybrid retrieval: BM25 + dense vectors blended with `search.alpha` (default 0.5).
- **Find mode** — a unified mode that mixes keyword and embedding for an "I know roughly what I want" feel.

Both modes return scored results; the score is shown on hover.

### Scene-search toggle

For "find a moment" queries (e.g., *the part where the cat jumps off the table*) you can flip the **Scene search** toggle. The retriever then includes per-frame CLIP embeddings extracted by the indexer, returning a list of timestamps within video files. Clicking jumps the player to that timestamp.

This is gated by `search.min_score_clip` (representative frames) and `search.min_score_clip_thumbnail` (per-second frames) to keep low-confidence noise out.

## Ask (RAG)

When `features.rag: true` in `addons/intelligence/search-config.yml`, an **Ask** input appears in the search modes. It is question answering over your library:

- Type a natural-language question.
- The intelligence addon retrieves relevant chunks (BM25 + dense), packs them into an LLM prompt, and returns the answer with **citations** linking back to the source files (and timestamps for video).
- A *no strong source* warning appears when retrieval did not find supporting context.

Ask is **stateless** — it does not write to the core DB or the addon DB. Each question is its own retrieval and generation.

### Privacy of Ask

When Ask is enabled, the LLM provider receives the contents of retrieved chunks. For sensitive drives:

- Use a **local LLM** (e.g. ollama) so nothing leaves the machine.
- Or **disable Ask per drive** via `drives.json`:

  ```json
  { "addons": { "intelligence": { "rag": false } } }
  ```

The intelligence addon enforces this both pre-call (in the host proxy) and inside the worker.

### Hierarchical retrieval

For drives with many files, the retriever runs in two stages:

1. **Coarse**: rank files by their short summaries to find candidates.
2. **Fine**: retrieve chunks within the top candidates.

The threshold and shortlist size are tunable in `rag.hierarchical`. See the [intelligence addon docs](../addons/intelligence.md#configuration).

### Personal history scoping

If `rag.personal_history.enabled` is on, Ask weights files the current viewer has watched recently — useful for queries like *what was the name of that thing in the talk I watched last week?*

## Duplicate detection

A separate page lists files with the same content hash:

- Computed on first index; stored in `File.file_hash`.
- Grouped per hash, sorted by descending group size.
- Useful when consolidating after a bulk import.

## API

If you script Litloft, the search endpoints are:

- `GET /api/files/search?drive=<name>&q=<query>&type=...&tag=...&limit=...`
- `POST /api/addons/intelligence/search` (semantic; addon path differs by version)
- `POST /api/addons/intelligence/ask` (RAG)

See the [HTTP API reference](../reference/api.md).

> **Image needed:** screenshot of search page with semantic + scene search toggles, results with citations.
