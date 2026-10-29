# Exact-text search and scene search for agents

SPEC-ID: SPEC-ADDON-032
SPEC-ID: SPEC-ADDON-033
SPEC-ID: SPEC-CORE-017
SPEC-ID: SPEC-CORE-018

Approval: sha256:66254005533f7c28ac2cfb9e6d720b72e7085e738b2346145cbe8701e3923752 Yuichi Senga 2026-10-29

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

`semantic_search` ranks files and drops weak matches, so an agent cannot use it to find
every place a word or phrase appears, the way it would grep local files. And the text the
Video Visual Index writes for each scene (a short label and the on-screen text) is
embedded but never searched: default search excludes it by design, and nothing opts in.
This change adds two intelligence endpoints and two MCP tools over the indexes that already
exist:

- SPEC-ADDON-032: `GET /search/exact` lists every indexed segment of the drive whose text
  contains a given string: document text chunks, transcript chunks, and Visual Index scene
  fields (label, on-screen text).
- SPEC-ADDON-033: `GET /search/scenes` ranks the drive's Visual Index scenes by meaning.
- SPEC-CORE-017: MCP tool `search_exact`.
- SPEC-CORE-018: MCP tool `search_video_scenes`.

No index, table or extractor changes; nothing is written.

## Required items

### 1. Normal flow

**`GET /search/exact?q=&sources=&limit=&offset=`** (SPEC-ADDON-032), drive from
`X-Lit-Drive`.

1. `q` is stripped of surrounding whitespace and must then be 1 to 200 characters.
   `sources` is a comma-separated, non-empty subset of `text`, `transcript`, `scene`
   (default all three). `limit` is an integer 1 to 200 (default 50), `offset` an integer
   ≥ 0 (default 0).
2. **The comparison.** A text contains `q` when `instr(lower(text), lower(q)) > 0` in
   SQLite. SQLite's `lower()` folds only ASCII letters, so ASCII letters compare
   case-insensitively and every other character, including non-ASCII letters, compares
   exactly. No character of `q` is a wildcard. The same rule decides matching, counting and
   the snippet position everywhere in this endpoint.
3. **Segments searched**, all restricted to files whose `indexed_files.drive` equals the
   request's drive and whose `indexed_files.active` is true:
   - `text`: each row of `fts_text_content` (chunks of Markdown, plain text, HTML, PDF,
     Office and EPUB files).
   - `transcript`: each row of `fts_transcripts`; its start and end times come from the
     `transcript_chunks` row with the same `file_id` and `chunk_index`, or are null when
     there is none.
   - `scene`: for each scene of a file's active Visual Index run
     (`video_visual_runs.is_active`), its `scene_label` and its `visible_text` are two
     separate segments; each is listed when it contains `q`. The `scene` source contributes
     nothing when `features.video_visual_index` is `"false"` or when the drive's
     `video_visual_index` policy is off or cannot be read (the same fail-closed check the
     Visual Index routes use); the other sources are still searched.
   - Nothing else is searched: not file descriptions or tags, not AI image descriptions, not
     a scene's `transcript_excerpt` (its text is already a transcript segment). The tool
     description says which three kinds of text it covers.
4. **Order**, which `offset` and `limit` page through: the file's `filename` (SQLite
   default BINARY collation), then `file_id`, then source (`text`, `transcript`, `scene`),
   then position: `CAST(chunk_index AS INTEGER)` for text and transcript; `start_time`,
   then the scene's `ordering`, then field (`scene_label` before `visible_text`) for scenes.
5. **Response:** `{"query": <the stripped q>, "sources": [...], "total": <all matching
   segments>, "offset", "segments": [...]}`. `sources` is echoed deduplicated in the
   canonical order `text`, `transcript`, `scene` (all three when omitted); duplicates in the
   request are accepted. Each segment has `file_id`, `filename`, `source`, and:
   - `text`: `chunk_index` (integer); for an EPUB file (`mime_type` the EPUB mime) `page`
     is null and `section` is the stored chunk page number as an integer (null when the
     stored value is empty) with `section_title` from `document_sections` (or null); for any
     other file `page` is the stored page as an integer, or null when the stored value is
     empty, and `section`/`section_title` are null. This is the same `page`/`section` split
     `/search` uses.
   - `transcript`: `chunk_index` (integer), `start_time`, `end_time`.
   - `scene`: `start_time`, `end_time`, `field` (`"scene_label"` or `"visible_text"`).
   - every segment: `match_count`, the non-overlapping occurrences of `q` in the segment's
     text counted left to right under the comparison; and `snippet`, the segment's text
     from at most 80 characters before the first occurrence to at most 80 characters after
     its end, with `…` added at each end that was cut.
   Keys not listed for a source are present with null.
6. Document chunks overlap by the configured `text_chunking.overlap` (80 characters by
   default), so an occurrence inside an overlap is listed in both consecutive text
   segments. The endpoint does not merge them.
7. No search-DB read runs on the event loop: the handler is a sync `def`, or an async
   handler (needed for the async policy check) that runs its reads through
   `asyncio.to_thread`. The route is declared in `manifest.json` with
   `pre_check: {type: addon_feature, feature: search}` (as `/search`), `"timeout": 30`, no
   `drive_optional`, and `response_filter: null`: the handler's own drive filter is what
   keeps other drives out.

**`GET /search/scenes?q=&limit=`** (SPEC-ADDON-033), drive from `X-Lit-Drive`.

1. `q` stripped, 1 to 1000 characters; `limit` an integer 1 to 50 (default 20).
   The route answers 404 when `features.video_visual_index` is `"false"` or the drive's
   `video_visual_index` policy is off or cannot be read, as the Visual Index routes do.
2. The candidate scenes are those of active Visual Index runs of active files in the
   request's drive that have a `video_visual_scene` embedding (resolved through the
   embedding id `vvs_<scene_id>_<suffix>` of `embeddings` rows of that type and file).
3. The query is embedded with `embed_query`, the embedder `/search` uses. Each candidate's
   vector is read from `vec_text` by its embedding id, and its score is the cosine
   similarity to the query vector. Filtering happens before ranking, so the result is the
   true nearest `limit` scenes of the drive. A scene whose embedding has no vector is
   skipped; a scene with more than one embedding is listed once, with its highest score.
4. Results, highest score first (ties by `file_id`, then `start_time`): `{"query": <the
   stripped q>, "results": [{"file_id", "filename", "start_time", "end_time",
   "scene_label", "visible_text", "score"}]}`, at most `limit`; `score` is rounded to 4
   decimal places, as in `/search`. No score threshold is applied.
5. The event-loop rule and the manifest declaration are as for `/search/exact`.

**MCP tools** (SPEC-CORE-017, SPEC-CORE-018)

- `search_exact(drive, q, sources?, limit?, offset?)`: zod requires `q` 1 to 200
  characters, `sources` a non-empty array of `text`/`transcript`/`scene`, `limit` an
  integer 1 to 200, `offset` an integer ≥ 0. It sends `GET
  /api/addons/intelligence/search/exact` with `q`, `sources` joined with commas, `limit`
  and `offset` as given (omitted when not given), and `X-Lit-Drive: encodeURIComponent(drive)`.
- `search_video_scenes(drive, q, limit?)`: zod requires `q` 1 to 1000 characters and
  `limit` an integer 1 to 50; it sends `GET /api/addons/intelligence/search/scenes` the same
  way.
- Both return the response as compact JSON without the proxy-added `available` key, and are
  read-only, non-destructive, idempotent, closed-world.
- Descriptions: `search_exact` lists every segment containing the string (ASCII
  case-insensitive, otherwise exact), is paged with `offset`, may list an occurrence twice
  when it falls in the overlap of two document chunks, and gives EPUB positions as
  `section`; `search_video_scenes` covers only videos whose Visual Index was generated, and
  a hit can be opened with `get_video_frame` at `start_time`.
- `SERVER_INSTRUCTIONS` names both tools: `search_exact` for "every place X appears",
  `semantic_search` for "files about X", `search_video_scenes` for "where is X shown".

### 2. Failure cases

| Step | What goes wrong | What happens |
|---|---|---|
| Either endpoint | `q` empty after stripping, or too long | 422 |
| `/search/exact` | an unknown or empty `sources`, `limit` or `offset` out of range | 422 |
| `/search/scenes` | `limit` out of range | 422 |
| Either endpoint | `X-Lit-Drive` missing | 400 (`require_drive`) |
| Either endpoint | the drive is not accessible to the caller | proxy 403 |
| Either endpoint | the drive's `search` policy is off | proxy 404 (`addon_feature` pre_check) |
| `/search/exact` | no segment matches | 200, `total: 0`, `segments: []` |
| `/search/exact` | `offset` at or past `total` | 200, `segments: []`, the real `total` |
| `/search/scenes` | the drive has no scene with an embedding | 200, `results: []` |
| `/search/scenes` | `video_visual_index` off globally, or for the drive, or its policy unreadable | 404 |
| `/search/exact` | the same, with `scene` among the sources | 200; the `scene` source contributes nothing |
| Either endpoint | a search-DB or vector read fails (any exception other than the embedder's) | 500 `Search failed`, logged with the exception, as `/search` does; the proxy turns it into 502 |
| `/search/scenes` | the embedder cannot load or fails | the handler answers 503; the proxy turns any addon 5xx into 502 `Addon service unavailable`, which is what the caller sees; the addon logs a warning |
| Either endpoint | slower than 30 s (a first call loading the embedder, a scan of a very large drive) | proxy 502 `Addon service unavailable` |
| MCP tools | a backend failure | `isError` with `Litloft API error (<status>): <detail>` |
| MCP tools | arguments outside the zod bounds above | rejected; no request |

### 3. States

None. Both endpoints read the current indexes; a file re-indexed, purged or deactivated
stops appearing because its rows are replaced or it is no longer active.

### 4. Data read and written

- Read: `indexed_files`, `fts_text_content`, `fts_transcripts`, `transcript_chunks`,
  `document_sections`, `video_visual_runs`, `video_visual_scenes`, `embeddings`, `vec_text`.
- Written: nothing.

### 5. External services

None. The query embedding runs in-process with the configured local text embedder.

### 6. Authorization

The addon proxy checks drive access (403) and the drive's `search` feature policy (404)
before the request reaches the addon, through the manifest entries above. Each handler
filters every row by `indexed_files.drive == <X-Lit-Drive>` itself, so no row of another
drive is returned even if the proxy's checks were missing. Both routes are declared without
`drive_optional`.

### 7. Effect on existing features

- `/search`, `semantic_search`, Ask and the default search channels are unchanged:
  `include_video_visual_scene` stays false everywhere it is today.
- The Visual Index pipeline is unchanged; the endpoints only read its rows.
- The MCP tool list gains two tools.

### 8. Error behavior

The agent sees `Litloft API error (<status>): <detail>`; an addon 5xx or timeout arrives as
`502 Addon service unavailable` (proxy behaviour). The addon logs an embedder failure as a
warning with the exception type; 400/422 are not logged by the handlers.

### 9. User-visible behavior

Only through the MCP tools; the web UI does not change.

### 10. Non-functional

- `/search/exact` scans the selected tables of the drive with `instr`; no index is used. A
  personal library scans in well under the 30 s proxy timeout.
- At most 200 segments and 50 scene hits per call. Scene search reads one vector per
  candidate scene of the drive.
- Privacy: no text leaves the addon except to the caller, who already has access to the
  drive.

## Touch points

- `addons/intelligence/app/routers/` (a new module, e.g. `exact_search.py`): the two
  endpoints; `addons/intelligence/app/main.py`: registration.
- `addons/intelligence/app/` (a new module for the queries, or `app/search.py`): the
  exact-match scan and the scene ranking.
- `addons/intelligence/app/schemas.py`: response models.
- `addons/intelligence/manifest.json`: two route entries.
- `addons/intelligence/tests/`: endpoint tests.
- `mcp-server/src/tools/` (a new `search.ts`): `search_exact`, `search_video_scenes`;
  `index.ts`; `server.ts` (`SERVER_INSTRUCTIONS`); `README.md`.
- `mcp-server/src/__tests__/`: tool tests, `toolMetadata.test.ts`.
- `docs/addons/intelligence.md`: one sentence each under Semantic search / Visual index.
- `addons/intelligence` submodule pointer bump in the core repository.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary; addons policy
  two-layer defence; addon drive-scope context propagation), the intelligence event-loop
  discipline (`tests/test_event_loop_discipline.py`).
- No protected path is edited; `backend/app/routers/addon_proxy.py` is not changed.

## Invariants

I1. Neither endpoint returns a segment, scene or file of a drive other than the request's
`X-Lit-Drive`, nor of a file whose `indexed_files.active` is false.
I2. `/search/exact` returns exactly the segments of the requested sources whose text
contains `q` under the stated comparison, for every length of `q`: `total` equals their
number, and paging by `offset` in steps of `limit` visits each once, in the stated order;
no character of `q` acts as a wildcard (`%`, `_` and `\` match only themselves).
I3. Each exact-search segment's `match_count` equals the non-overlapping occurrences of `q`
in its text, and its `snippet` contains the first occurrence with at most 80 characters on
each side and `…` only at a cut end.
I4. `/search/scenes` returns only scenes of active runs of the drive's active files, the
nearest `limit` of them by cosine similarity in descending `score`, and never a row of
another embedding type.
I5. Neither endpoint writes to any table or file, and neither calls an LLM.
I6. `/search`, Ask and every existing caller keep `include_video_visual_scene` false; their
results are unchanged.
I7. Both routes answer 404 through the proxy when the drive's `search` feature policy is off.
I8. Each exact-search segment carries the location of its own row: an EPUB text segment
has `page` null and its section in `section`, any other text segment its page in `page`;
a transcript segment has the times of the `transcript_chunks` row with the same
`chunk_index` (null when there is none); a scene segment names the field that matched.
I9. With `video_visual_index` off globally or for the drive, no scene appears in either
endpoint.
I10. The MCP tools send `X-Lit-Drive` percent-encoded and exactly the parameters given, drop
the `available` key, and make no request for arguments outside their zod bounds.

## Checked, no action

- **Merging overlapping document chunks**: the overlap is a chunking parameter; merging would
  need the original text, which is not stored. Listing twice is stated to the agent.
- **Filename / title matches in `search_exact`**: `search_files` already matches names and
  folder paths.
- **Using the trigram index**: whether `LIKE ... ESCAPE` reaches the FTS5 index, and how
  its case folding compares with `LIKE`, is not established; a scan with `instr` and
  `lower` is exact and predictable, and fast enough for a personal library.
- **Case-folding beyond ASCII and Unicode normalization**: the rule is predictable and
  stated; normalizing would hide the difference between forms the user wrote.
- **Regular expressions**: substring covers "where does X appear"; the agent can filter the
  snippets.
- **A score threshold for scene search**: an explicit scene query wants the nearest scenes
  even when weak; the score is returned for the agent to judge.
- **Adding scenes to `semantic_search`**: the Visual Index design keeps scene evidence out of
  file ranking so a long video does not rank as "about" an incidental object.
- **Legacy pipeline-v1 `visual_description`**: kept in storage but not exposed by the API or
  UI by design; exact search reads the current fields only. A v1 run is stale and is
  regenerated by `on_index`.
- **Other stored text** (file descriptions and tags, AI image descriptions, a scene's
  `transcript_excerpt`): out of scope; the tool description names the three kinds of text
  covered so a miss is not taken for an absence. Tags are filterable with `search_files`.
- **Tool annotations and `SERVER_INSTRUCTIONS` wording**: annotations are pinned by
  `toolMetadata.test.ts`; instruction wording is prose checked in review.
- **Passing the addon's 503 through the proxy**: changing `addon_proxy.py` (a HIGH-risk
  zone) for one status is out of scope; the agent sees 502.
- **Reading PDF / Office / EPUB text**: a separate spec.
