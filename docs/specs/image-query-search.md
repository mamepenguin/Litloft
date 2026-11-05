# Search by an image

SPEC-ID: SPEC-ADDON-049
SPEC-ID: SPEC-CORE-046

Approval:

## Summary

Today every search starts from words. A viewer holding a screenshot or a photo (a slide
someone shared, a frame of a video, a page of a document) has to guess words for it. This
change lets the viewer give the search an image instead: paste it, drop it, or choose a
file in the search modal or on the search results page, or, on a phone, press
「画像で探す」 and pick a photo. The results page then shows three groups:

- **似ている画像**: pictures of the drive that look like it.
- **似ている場面**: places in the drive's videos where a similar scene appears.
- **同じ文字を含む文書**: documents whose text matches the text read from the image. The
  image is read with the OCR engine the addon already has, so a screenshot of a PDF page
  finds that PDF.

The image is not stored anywhere: the addon reads it in memory for the one request, the
browser keeps it in the tab's memory only, and nothing derived from it is written.

- **SPEC-ADDON-049**: intelligence gains `POST /search/by-image`, which takes the image as
  the raw request body and answers the three groups and what the text reading found. The
  SigLIP image model it needs, which the indexer already loads and never releases, gains
  an idle release shared by indexing and this route.
- **SPEC-CORE-046**: the search modal and the results page accept an image (paste, drop,
  choose, the phone button), the results page shows an image query as a chip in the query
  field and the three groups below it, and the URL carries only a short id that points at
  the image held in the tab.

Decided by the user on 2026-11-05 and not reopened here: the entry points (paste, drop,
choose in the modal's and the results page's search field; a 「画像で探す」 button on a
phone); the image is not stored; the three result groups; OCR plus text search for the
documents group, so that a screenshot finds its source PDF.

## Required items

### 1. Normal flow

Terms. *Image query*: one image the viewer gave the search. *Query id*: 12 lowercase hex
characters from `crypto.getRandomValues` (the app is served over plain HTTP on the LAN,
where `crypto.randomUUID` does not exist). *Image store*: a module-level, in-memory map in
the browser tab from query id to `{ blob, objectUrl, answer | null }`, holding at most 5
entries; adding a sixth drops the least recently used and revokes its object URL. *Read
text*: the OCR engine's recognised lines joined with `\n`. *Read length*: the number of
non-whitespace characters in the read text.

SPEC-CORE-046, giving an image:

1. **Modal.** While the modal has a drive (`drive` set), it accepts an image in three ways:
   - Paste in the modal's input: when the paste's `clipboardData` holds a file whose type
     starts with `image/` and holds no non-blank `text/plain`, the image is taken and the
     paste inserts no text. When it also holds non-blank `text/plain` (copying text from an
     office app puts a picture of it on the clipboard too), the paste inserts the text as
     today and the image is ignored.
   - Drop on the modal panel (desktop) or sheet (phone) of exactly one file whose type
     starts with `image/`. The drop does not reach the page's upload zone.
   - The image button in the input row (desktop: a 32 px icon button named 「画像で探す」;
     phone: a labelled pill 「画像で探す」 in the row under the input, before the operator
     chips), which opens `<input type="file" accept="image/*">`. On iOS the picker offers
     the photo library and the camera.
   Taking an image creates a query id, puts the image in the image store, closes the modal
   and navigates with `router.push` to `/drive/<drive>/search?img=<id>`. Nothing else is
   carried: no `q`, `type`, `show` or `include_scene_clip`. The text the input held is
   dropped, and nothing is added to the search history.
2. **Results page.** The same three ways, on the page:
   - Paste while focus is in the query field, as in 1.
   - Drop anywhere on the page of exactly one file whose type starts with `image/`. During
     the drag the page overlay reads 「ドロップして画像で探す」 instead of the upload
     overlay's text when the dragged items are exactly one item of kind `file` whose type
     starts with `image/`; any other drag (several files, a folder, a non-image, or an
     item whose type the browser does not report) keeps today's upload overlay and upload
     on drop.
   - The image button at the field's trailing edge (desktop: 32 px icon button named
     「画像で探す」; phone: a labelled pill 「画像で探す」 in the row under the field).
   Each navigates with `router.push` to `/drive/<drive>/search?img=<new id>`.
3. **Before sending.** The browser checks the file. Over 20 MB, it decodes the file with
   `createImageBitmap` and re-encodes it as JPEG (quality 0.9) with its long edge scaled
   to 4096 px, and sends that; a phone photo of 48 MP saved as JPEG is the case this is
   for. A file of 20 MB or less is sent as it is, so a screenshot keeps the resolution its
   small text needs. A file over 20 MB that the browser cannot decode (HEIC in a browser
   without HEIC support) is refused with the size message (8) without a request.

SPEC-CORE-046, the results page with `img`:

4. `search/page.tsx` renders the image query view when the URL has `img`, whatever `q`
   says; `q`, `type`, `show` and `include_scene_clip` are ignored and left in the URL
   untouched. The view replaces `FolderBrowser` and the Scene search toggle and
   `search-results-top` slot above it.
5. The header is `PageHeader` with `SearchQueryHeader` in its field slot (A2's), the field
   holding an *image chip* at its leading edge: a 28 × 28 `rounded-lg` `object-cover`
   picture of the image (its object URL), the label 「画像」, and a ✕ named 「画像を外す」.
   The field is otherwise empty and editable. The operator chip row, 「＋ 条件」, the
   Smart Folder button and the `search-modes` slot are not rendered. The visually hidden
   `<h1>` reads 「画像で検索」.
6. When the image store holds the id with an answer, the view renders that answer with no
   request. When it holds the id without an answer, the view sends one request (step 7)
   and stores the answer under the id. When it does not hold the id (a reload, a new tab,
   a link opened elsewhere), the view shows the *gone* state (3) and sends nothing.
7. The request is `POST /api/addons/intelligence/search/by-image` with header
   `X-Lit-Drive`, `Content-Type` the file's type (`image/jpeg` after step 3's
   re-encoding), and the bytes as the body; one request per query id, plus one per
   再試行 press in the failed state.
8. Typing text in the field and pressing Enter submits a text search exactly as A2 does,
   pushing `/drive/<drive>/search?q=<text>` without `img`; Back returns to the image query
   view, which renders from the store. ✕ on the image chip pushes `/drive/<drive>`, the
   drive's library view, as A2's removal of the last operator does (pending human
   confirmation).

SPEC-ADDON-049, `POST /search/by-image`:

9. The route reads `X-Lit-Drive` through `require_drive`. It accepts a `Content-Type`
   (parameters ignored) of `image/jpeg`, `image/png`, `image/webp`, `image/gif`,
   `image/bmp`, `image/heic` or `image/heif`; any other is 415. It reads the body as a
   stream and stops with 413 as soon as more than 20 MB (20 × 1024 × 1024 bytes) arrived.
   The body is never written to disk.
10. It decodes the bytes in memory with Pillow (HEIC and HEIF through `pillow_heif`, which
    the OCR worker already registers), checks `width × height` against 50,000,000 before
    loading the pixels (413 above it), applies the EXIF orientation, takes the first frame
    of an animated image, and converts to RGB with transparency flattened onto white (the
    OCR worker's `_to_rgb`). Undecodable bytes are 422.
11. At most one image query runs at a time in the process (an `asyncio.Semaphore(1)`); a
    second waits, and its wait counts toward the proxy's timeout.
12. Two parts run concurrently on worker threads, each on the decoded image:
    - **Visual part.** `clip.embed_image(image)` gives one L2-normalised SigLIP vector.
      - *Images*: `search_images(vector, file_type="image", drive=drive, floor=F, limit=24)`,
        where `floor` and `limit` are new keyword arguments of `search_images` whose
        defaults are today's values (`min_score_clip_thumbnail`, `_IMAGE_SEARCH_LIMIT`), so
        every existing caller is unchanged. `F` is `search.min_score_image_query`, a new
        setting, default 0.70 (pending human confirmation; see 10).
      - *Scenes*: when `scene_segments.count_frames(drive)` is not 0,
        `find_segments(vector, "", drive, 20, frames, floor=F)`, where `floor` is a new
        keyword argument, default `None` (today's behaviour), that drops every seed scoring
        below it before the relative threshold and the grouping are computed.
    - **Text part.** Skipped, with `text.status = "off"`, when `features.image_ocr` is
      `"false"` (pending human confirmation). Otherwise the OCR engine
      (`ocr._get_engine()`, the process's shared engine, created on demand and released by
      the existing idle release) reads the image. With no engine, `text.status =
      "failed"`. With a read length under 20 (pending human confirmation; see 10),
      `text.status = "too_short"` and no text search runs. Otherwise `text.status =
      "read"` and the documents group is ranked:
      1. The query text is the first 1000 characters of the read text (the chunk size the
         indexer uses for `text_content`), embedded with the query prefix through
         `embedder.embed_texts`, not the cached `embed_query` (see 10, privacy).
      2. Candidates are the nearest rows of the `text_content` partition of `vec_text`,
         fetched as `_drive_thumbnail_neighbours` widens a KNN (k = min(50 × f, 4096) for f
         in 4, 16, 64, then 4096), keeping rows whose file is active, of the request drive,
         and whose `file_type` is not `image`, until 50 rows are kept or a fetch returns
         fewer rows than asked.
      3. Rows under `search.min_score_text` are dropped, then rows more than
         `search.score_cutoff_margin` below the best remaining row.
      4. Rows are grouped by file; files are ordered by their best row's score (ties by
         file id) and the first 10 are kept; each keeps its 3 best rows as passages, sorted
         by score, ties by `chunk_index`.
      5. Each passage is an A3 `SearchPassage` built from the stored row: kind `section`
         (EPUB, with `section` and `section_title`), `page` (a row with `page` set) or
         `text`; `text` is the stored `content_preview`; `keyword` false;
         `highlight_terms` `[]`; `frame_url` null; `score` the row's cosine similarity
         rounded to 4 places.
13. The answer is
    `{ images: [ImageHit], scenes: [SceneHit], documents: [DocumentHit],
    text: { status: "read" | "too_short" | "off" | "failed", excerpt: str | null } }`:
    - `ImageHit` is `SearchResultItem` without `segments` and `passages`:
      `{ file_id, drive, filename, file_type, score, match_types: ["clip_thumbnail"], file }`.
    - `SceneHit` is `{ file_id, drive, filename, start, end, peak, score, frame_url, file }`
      with `frame_url` = `/api/addons/intelligence/files/{file_id}/frame?t=<floor(peak)>`.
    - `DocumentHit` is `{ file_id, drive, filename, file_type, score, passages, file }`.
    - `file` is the hydrated `FileItem` from one `hydrate_files` call over every id of the
      three groups; a failed hydration leaves `file` null, as `/search` degrades.
    - `text.excerpt` is the read text with every run of whitespace replaced by one space,
      cut to 200 characters with `…` appended when longer, when `status` is `read` or
      `too_short` with a read length over 0; null otherwise.
    - Each group is ordered best first. `drive` on every hit is the request drive.
14. The manifest declares the route: `methods: ["POST"]`, `pre_check: {type:
    addon_feature, feature: search}`, `response_filter: {type: current_drive_only_nested,
    paths: {images: drive, scenes: drive, documents: drive}}`, `timeout: 60`.

SPEC-ADDON-049, the image model's memory:

15. `clip.py` releases the SigLIP full model (`_siglip_full_model`, vision and text
    towers) after `memory.clip_image_idle_unload` seconds without an image embedding,
    default 600, `0` meaning never, checked by the indexer's existing `_idle_unload_worker`
    beside the other models. The text encoder used by text search stays resident as today.
    A release happens only while no `embed_image` call is running: `embed_image` counts
    itself in and out under `_lock`, and the release takes `_lock` and does nothing while
    the count is above 0. The next `embed_image` loads the model again. The open_clip
    backend (non-SigLIP models) is unchanged.

SPEC-CORE-046, the result groups:

16. The groups render in this order: **同じ文字を含む文書** first when it has at least one
    hit, then **似ている画像**, then **似ている場面**; with no document hit, 画像 then 場面
    (pending human confirmation). A group with no hit is not rendered, with one exception:
    when `text.status` is `failed`, the documents slot shows its heading and the muted line
    「画像の文字を読み取れませんでした」.
17. Each group has an `<h2>` heading with its count after it in `text-text-muted`: 「同じ文字を
    含む文書 3」, 「似ている画像 12」, 「似ている場面 8」.
    - **Documents**: under the heading, the read text's `excerpt` in one muted line,
      truncated with the full excerpt in `title`, in 「」. Then one block per file: its
      passages as A3 passage rows (the 88 × 50 picture is the file's thumbnail, else the
      type icon; the locator per A3's table for `page`, `section` and `text`; the file name;
      the excerpt in full, no marks), each linking where A3's rows link
      (`?page=N`, `?section=N`, or the file).
    - **Images**: §Justified thumbnail rows (120 px rows under `40rem` of grid width,
      200 px at or above), each picture a link to `/files/{id}`, its accessible name the
      file name.
    - **Scenes**: one row per segment in the A3 passage row shape: the frame
      (`frame_url`) with `formatDuration(start)` over it, the locator
      `formatDuration(start)–formatDuration(end)`, the file name; the row links to
      `/files/{id}?t=<floor(start)>`. A frame that fails falls back to the file's
      thumbnail, then the icon.
18. The scope line (A2's count position) reads 「文書 N・画像 M・場面 K」 counting the
    rendered groups only, in the rendered order; it is hidden while loading and failed.
19. Nothing of an image query is written to the search history (`searchHistory.ts`), the
    modal's search cache (`searchCache.ts`), `localStorage`, `sessionStorage` or
    IndexedDB, and no Smart Folder can be saved from it.

### 2. Failure cases

- **The image store does not hold the id** (reload, new tab, a copied link, the store
  dropped it after five newer image queries): the gone state; no request.
- **The browser cannot read the dropped or pasted data** (an empty file, a clipboard item
  whose `getAsFile()` is null): nothing happens; no navigation.
- **Several files dropped**: in the modal, nothing happens; on the results page, today's
  upload (step 2).
- **Too large after step 3**, or undecodable by the browser while over 20 MB: the size
  message, no request, no navigation.
- **415, 413 or 422 from the addon** (a type the browser reported but the addon refuses,
  over 50 MP, undecodable): the failed state with the message for that status (8); 再試行
  is not offered, because the same bytes would fail again.
- **The addon is down, answers 5xx, the proxy times out (60 s), or the proxy answers 200
  `{available: false}`**: the failed state with 再試行.
- **The drive's `search` policy is off**: the proxy answers 404; the image buttons are not
  rendered, because they are rendered only while `isSemanticSearchAvailable(drive)` is
  true, the same condition as meaning search. A URL with `img` opened anyway shows the
  failed state without 再試行.
- **The image model fails to load or to embed**: the route answers 503 `Embedding
  unavailable` and runs no part; the failed state with 再試行.
- **OCR engine missing** (`_get_engine()` returns None): `text.status = "failed"`; the
  visual groups still answer.
- **OCR raises on this image**: as an engine failure for this request only.
- **Text embedding fails**: `text.status = "failed"`; the visual groups still answer.
- **Hydration fails**: hits keep `file` null and render with `filename` and the
  `/api/files/{id}/thumbnail` fallback, as A3's rows do.
- **The drive has no scene frames**: no scene group, no KNN.
- **A file in the answer is trashed or missing by the time it is opened**: the file page's
  own 404, as for any search hit.
- **The image model is released while a request waits for it**: the request loads it again
  (step 15); the wait counts toward the 60 s timeout.

### 3. States

Image query view (results page with `img`):

| From | To | When |
|---|---|---|
| (enter) | loading | the store holds the id without an answer |
| (enter) | answered / empty | the store holds the id with an answer |
| (enter) | gone | the store does not hold the id |
| loading | answered | 200 with at least one hit in any group, or `text.status` `failed` |
| loading | empty | 200 with no hit in any group and `text.status` not `failed` |
| loading | failed | non-200, a network error, or 200 `{available: false}` |
| failed | loading | 再試行 (offered only for the retryable failures in 2) |
| any | (leave) | a new image, a text submission, ✕ on the chip, or any navigation |

Forbidden: a request in `gone`; a second request for the same id outside 再試行; `empty`
for a failure; an answer for one id rendered under another id.

Image model (addon process): `unloaded` → `loaded` on the first `embed_image` (indexing
or this route); `loaded` → `unloaded` only by the idle release with no call in flight.
Forbidden: a release while an `embed_image` call runs.

Text part of one request: `off` (mode `false`), `failed`, `too_short`, `read`, each final
for that request.

### 4. Data read and written

- **Intelligence, read**: `indexed_files`, `embeddings`, `vec_clip` (`clip_thumbnail` and
  `clip` partitions), `vec_text` (`text_content` partition), settings. Through the core's
  `POST /api/internal/files/bulk` (existing): file metadata for hydration.
- **Intelligence, written**: nothing. No table, file, frame cache entry or log line holds
  the image, its vector or its read text. The OCR engine and the image model are process
  memory (loaded, released).
- **Core backend**: nothing new; the generic addon proxy buffers the body in memory for the
  one forwarded request, as it does for every POST.
- **Browser**: the image store (tab memory only; gone on reload); the URL's `img` id.
  Nothing in `localStorage`, `sessionStorage`, IndexedDB, the search history or the search
  cache.

### 5. External services

None outside the Docker network. No LLM is called; OCR and both embedding models are
local. The route's own calls are the core's `/files/bulk` (5 s, existing) for hydration.

### 6. Authorization

- The addon proxy validates `X-Lit-Drive` against the viewer's accessible drives (a locked
  drive is 404) and applies the drive's `search` policy (`pre_check`), as for `/search`.
- The route ranks only rows of the request drive, and the proxy's
  `current_drive_only_nested` filter drops any hit of another drive from each group.
- Frames go through the existing `/files/{file_id}/frame` route and its `file_access`
  check; thumbnails through the core's `/api/files/{id}/thumbnail`.
- No Internal API endpoint is added or changed, so `.claude/rules/internal-api-policy.md`
  R1–R5 do not apply; the route is an addon route behind the generic proxy, the
  precedent of `semanticSearch.ts` calling intelligence by name.

### 7. Effect on existing features

- `/search`, `/search/images`, `/search/scene-segments`, `/similar/{id}`: unchanged; the new
  keyword arguments of `search_images` and `find_segments` default to today's behaviour.
- **Indexing**: image and scene-frame embedding now load the SigLIP full model again after
  an idle release (about 0.3 s from the page cache, about 6 s cold); the vectors are those
  of the same model and code path, so stored and query vectors stay comparable.
- **OCR indexing**: shares its engine with this route; a query during an OCR batch runs on
  the same engine object and contends for the same CPU.
- **The results page's upload on drop**: unchanged for every drag except exactly one image
  (step 2); that one drag now searches instead of uploading into the drive root.
- **The modal**: unchanged apart from the image button, the paste of an image without text
  and the drop on the panel.
- **A2 (`SearchQueryHeader`, `SearchFilterChips`) and A3 (`PassageList` rows)**: reused;
  `SearchQueryHeader` gains an optional image chip, and without it renders exactly as
  today. SPEC-CORE-043 (`path:` / `in:`, approved, not yet merged) also edits
  `SearchQueryHeader.tsx`; whichever merges second rebases onto the other.
- **MCP**: unchanged (Checked, no action).

### 8. Error behavior

Viewer-facing strings (ja / en, in `messages-core`):

| Case | Message | Action |
|---|---|---|
| Too large (client) or 413 | 「画像が大きすぎます（20 MB・5000 万画素まで）」 / "This image is too large (up to 20 MB and 50 megapixels)" | none |
| 415 or 422 | 「この画像は読み込めませんでした」 / "This image couldn't be read" | none |
| Other failure | 「画像で探せませんでした」 / "Couldn't search by this image" | 「再試行」 |
| Gone | 「画像をもう一度選んでください」 / "Choose the image again" | the image button, and the page accepts paste and drop |
| Empty | `EmptyState` `no-results` with 「似ているものは見つかりませんでした」 / "Nothing similar was found" | none |
| OCR failed (in the documents slot) | 「画像の文字を読み取れませんでした」 / "Couldn't read the text in this image" | none |

The failure messages are `role="alert"`; the size message in the modal sits under the
input row.

Logs (addon): one INFO line per request with the byte count, the pixel size, the read
length, the three group sizes and the elapsed milliseconds; a WARNING with the exception
class only for a decode, OCR or embedding failure. The image, its vector and its read text
are never logged at any level. The core logs nothing new.

### 9. User-visible behavior

Layout (mockup `a4-design/index.html`; `DESIGN.md` values):

- **Modal, desktop**: the image button is the 32 px ghost icon button (lucide `ImagePlus`,
  `text-text-muted`, `hover:bg-bg-elevated`) between the clear ✕ and `ESC`. During a drag
  of one image over the panel, the panel shows a dashed `border-2 border-warm-silver`
  inset frame (`rounded-2xl`) with an `ImagePlus` icon and 「ドロップして画像で探す」;
  no accent fill.
- **Modal, phone**: the pill 「画像で探す」 (`ImagePlus` + label, `bg-sand
  rounded-full px-3 py-1.5 text-sm`, 44 px touch height) starts the row under the input;
  the operator chips follow it.
- **Results page header**: the field (§Inputs) holds the image chip (`bg-sand
  rounded-full`, the 28 px picture, 「画像」 `text-xs font-semibold`, the ✕ a small round
  `hover:bg-bg-elevated` button, as §Editable Tag Chips). The image button sits at the
  field's trailing edge on `sm` and wider; below `sm` the pill sits in the row under the
  field with the scope line at the row's end.
- **Groups**: `<h2>` `text-lg font-bold` with the count `text-text-muted font-normal`;
  `mt-8` between groups; documents and scenes rows in one column at `max-w-list-row`
  (§3.6); images full content width. No accent fill anywhere in the view.
- **Loading**: under the header, a skeleton in the shape of an image row and three passage
  rows (`bg-bg-elevated animate-pulse`). The scope line is hidden.
- **Timing**: one request; about 1–3 s with the models warm (0.28 s image embedding, 0.5–
  1.6 s OCR, both measured; the KNNs are the existing ones), up to about 10 s when the
  image model and the OCR engine are both cold.
- **Keyboard**: Tab order in the header is the image chip's ✕, the field, the image
  button; then each document row, each image, each scene row. Enter on a row or image
  opens it. The image button opens the file picker on Enter or Space. Cmd/Ctrl+V in the
  field pastes an image as in 1.
- **Screen reader**: the image chip reads 「画像」 and its ✕ 「画像を外す」 / "Remove image";
  the chip's picture is `alt=""`. Each group is a `<section>` labelled by its heading;
  document and scene lists are `<ol>`; a row link reads its locator, file name and
  excerpt in that order. The drop overlay text is in an `aria-live="polite"` region.
- **Strings** (ja / en): 「画像で探す」/"Search by image", 「画像」/"Image",
  「画像を外す」/"Remove image", 「画像で検索」/"Image search",
  「ドロップして画像で探す」/"Drop to search by this image", the three group headings
  「同じ文字を含む文書」/"Documents with this text", 「似ている画像」/"Similar pictures",
  「似ている場面」/"Similar scenes in videos", the scope line, and the messages in 8.
- **Docs**: `docs/user-guide/search.md` gains "Searching by an image": how to give one
  (paste, drop, the button, the phone button), the three groups, that the image is not
  saved so a reload asks for it again, and that the documents group needs readable text
  (about 20 characters) and picture-text reading switched on.
  `docs/user-guide/keyboard-shortcuts.md`: Cmd/Ctrl+V of an image in the search field.
  `docs/addons/intelligence.md`: `POST /search/by-image` (body, types, limits, answer),
  `search.min_score_image_query`, `memory.clip_image_idle_unload`.
- `DESIGN.md` §6 gains a short "Image query chip" entry beside §Page Header's search-field
  rule (pending human confirmation).

### 10. Non-functional

- **Limits**: 20 MB body (client and addon), 50,000,000 pixels (addon, the OCR worker's
  value), one image query at a time per addon process, 60 s proxy timeout.
- **Thresholds** (pending human confirmation; re-measure on production before shipping):
  - `min_score_image_query` 0.70 for images and scenes. Measured 2026-11-05 on the local
    test index (1,699 `clip_thumbnail` rows, 8,712 `clip` rows, 156 videos): between
    unrelated pictures the cosine is p50 0.40, p99 0.69, p99.9 0.81; each picture's
    nearest other picture p50 0.76. A library picture given back cropped to 80 % scored
    p10 0.95 against itself and ranked first 24/25 times; scaled to a third and saved as
    JPEG q50, p10 0.93, first 25/25; shrunk inside a grey frame (a photo of a screen),
    p10 0.79, first 24/25. Between unrelated pictures and video frames the cosine is p99
    0.57, p99.9 0.63. A video frame given back cropped scored about 0.87 against its own
    frames; in this index, whose videos look alike, its video ranked within the first 4
    files 7 times in 12 and within the scene group's 30 files 9 times in 12.
  - Read length 20 for the documents group. Measured with the local text model
    (`cl-nagoya/ruri-v3-30m`, 26,430 `text_content` rows) by querying with windows of
    stored PDF text: a 200-character window ranked its own file first 12/19 and within 3
    in 19/19 (own score p10 0.92); a 40-character window first 11/19, one at rank 83.
    Shorter text finds its source less reliably; the floor and the margin still apply.
  - Documents use the existing `min_score_text` and `score_cutoff_margin`, so a text
    embedding model change keeps its own calibrated floor.
- **Memory**: the SigLIP checkpoint is 375 M parameters in float32 (1.50 GB): text tower
  282 M (1.13 GB), vision tower 93 M (0.37 GB). Text search keeps the text encoder resident
  today; `_ensure_siglip_full_loaded` loads the whole model a second time, so image
  embedding adds about 1.5 GB. Today the indexer loads it on the first image or video
  embedded after a start and never releases it (local log: loaded 2026-11-03 01:18 and
  still held; the container's peak resident set 2.83 GB). A fresh process loading both
  peaked at 1.5 GB after the first embedding and 1.78 GB after 75; cold load plus the
  first embedding took 6.1 s, a warm embedding 0.28 s (p50). The OCR engine adds about
  0.9 GB while reading (SPEC-ADDON-050's R-5: 1.2 GB before, 2.2 GB reading, 1.2 GB after
  its idle release). The idle release (step 15) returns the 1.5 GB after 10 idle minutes,
  for this route and for indexing alike.
- **Privacy**: the image crosses the browser → frontend → core proxy → addon path inside
  the home network and the Docker network only. The addon holds it in memory for one
  request; the read text is embedded through the uncached path so it does not sit in
  `embed_query`'s LRU cache; nothing derived from it is written or logged. The browser
  holds it in tab memory only. The answer carries at most 200 characters of the read text
  back to the viewer who gave the image.
- **Cost**: per request one image embedding, at most one OCR pass, at most one text
  embedding, the existing exact `clip_thumbnail` scan of the drive, at most four scene KNN
  and four text KNN fetches of up to 4096 rows.

## Touch points

Addon (`addons/intelligence`, its own PR, then the pointer bump):
- `app/routers/search.py`: `POST /search/by-image` (body cap, type check, decode, the
  semaphore, both parts, the answer).
- `app/schemas.py`: `ImageQueryResponse`, `ImageHit`, `SceneHit`, `DocumentHit`,
  `ImageQueryText`.
- `app/search.py`: `search_images` gains `floor` and `limit`; the drive-scoped widened KNN
  over the `text_content` partition and the documents grouping (a new function reusing
  `_drive_thumbnail_neighbours`' widening and A3's passage kinds).
- `app/scene_segments.py`: `find_segments` gains `floor`.
- `app/workers/clip.py`: the in-flight count in `embed_image`, `unload_full_model`,
  `check_idle_unload`.
- `app/workers/ocr.py`: called (`_get_engine`, `_to_rgb`), not changed.
- `app/workers/embedder.py`: `embed_texts` called with the query prefix, not changed.
- `app/indexer.py`: `_idle_unload_worker` calls `clip.check_idle_unload`.
- `app/config.py`: `SearchConfig.min_score_image_query`,
  `MemoryConfig.clip_image_idle_unload`; `search-config.yml.example`.
- `manifest.json`: the route (step 14).
- `tests/`: route limits (415, 413 by bytes and by pixels, 422), the answer shape, drive
  scoping of all three groups, the floors, `features.image_ocr = "false"`, the read-length
  gate, no write to any table, no log of the read text, the idle release and its in-flight
  guard, `search_images` and `find_segments` unchanged without the new arguments.
- `docs/addons/intelligence.md` (in the core repository).
- The gitlink bump of `addons/intelligence` in the core repository.

Core:
- `frontend/src/lib/imageQuery.ts` (new): the image store, query ids, the size check and
  re-encoding, the request.
- `frontend/src/components/search/ImageQueryView.tsx` (new, Container/Presenter): the
  header with the chip, the three groups, loading, failed, empty and gone.
- `frontend/src/components/search/useImageInput.ts` (new): paste, drop and file-picker
  handling shared by the modal and the results page.
- `frontend/src/components/search/SearchQueryHeader.tsx`: the optional image chip and
  image button.
- `frontend/src/components/search/PassageList.tsx`: its row reused for document and scene
  rows (extracted if needed, behaviour unchanged).
- `frontend/src/components/GlobalSearch.tsx`: the image button, paste, drop on the panel
  and sheet, the navigation.
- `frontend/src/app/drive/[name]/search/page.tsx`: `img` selects the image query view.
- `frontend/src/components/UploadZone.tsx`: on the search results page, a drag of exactly
  one image shows the search overlay and is handed to image search; everything else as
  today.
- `frontend/src/messages-core/ja.json`, `en.json`.
- Frontend tests beside the existing search tests; a `frontend/e2e-layout/` fixture of the
  image query view and the modal's phone row at 390 px and at desktop width.
- `docs/user-guide/search.md`, `docs/user-guide/keyboard-shortcuts.md`, `DESIGN.md` §6
  (pending human confirmation).

Rules passed through: `.claude/rules/design-decisions.md` (the drive boundary; the addon
reads `X-Lit-Drive` and does not validate it; the proxy's two-layer policy; SPA navigation
through `router`), `.claude/rules/frontend-conventions.md` (`DESIGN.md`, `messages-core`
only, Container/Presenter for the new view), `.claude/rules/backend-conventions.md` (no
language-dependent rule: the read-length gate counts characters and names no vocabulary),
`DESIGN.md` §2.2, §3.6, §Inputs, §Page Header, §Editable Tag Chips, §Search passage rows,
§Justified thumbnail rows, §Over-video chrome. No Internal API endpoint, no HIGH zone and no
protected path is touched; `UploadZone.tsx` is not a risk zone but its upload path is
existing behaviour that must not change (I9).

## Invariants

I1. `POST /search/by-image` answers 415 for a `Content-Type` outside the seven image types, 413 once the body passes 20 MB or the image passes 50,000,000 pixels, and 422 for bytes Pillow cannot decode, and in none of these cases runs an embedding, OCR or KNN.
I2. A request writes no row to any table of the addon's database, no file under its data directory, and no log line containing the read text or any of the image's bytes.
I3. Every hit in `images`, `scenes` and `documents` is a file of the request drive, active in the index, and `documents` never holds a file whose `file_type` is `image`.
I4. Images and scenes below `min_score_image_query` are never returned; documents below `min_score_text`, or more than `score_cutoff_margin` below the best document row, are never returned; at most 24 images, 20 scene segments and 10 documents with at most 3 passages each are returned.
I5. With `features.image_ocr` `"false"` the OCR engine is not called and `text.status` is `off`; with a read length under 20 no text embedding or text KNN runs and `text.status` is `too_short`; a failure of the text part never removes or changes the visual groups.
I6. `search_images` and `find_segments` called without the new arguments return the same results, in the same order with the same scores, as before this change; `/search`, `/search/images` and `/search/scene-segments` answer exactly as before.
I7. The SigLIP full model is released after `clip_image_idle_unload` idle seconds and never while an `embed_image` call is running; after a release the next `embed_image` returns a vector equal to the one before the release for the same image; the text encoder is never released by it.
I8. A paste whose clipboard holds non-blank `text/plain` inserts that text and starts no image query, in the modal and on the results page; a paste of an image with no plain text starts one image query and inserts nothing.
I9. On the results page, a drag of exactly one image item searches by it; a drag of several files, a folder, a non-image, or an item without a reported type uploads exactly as before this change.
I10. The results page with `img` sends exactly one request per query id, plus one per 再試行 press in a retryable failed state; reopening the same id from Back or Forward renders the stored answer with no request; an id missing from the image store shows the gone state and sends nothing.
I11. No image query, its id, its read text or its answer is written to the search history, the search cache, `localStorage`, `sessionStorage` or IndexedDB, and the image store never holds more than 5 entries.
I12. The groups render in the order documents (when it has a hit), images, scenes; a group without hits is not rendered except the documents slot when `text.status` is `failed`; the scope line counts exactly the rendered groups and is hidden while loading and failed.
I13. A file over 20 MB is re-encoded in the browser to JPEG with a long edge of at most 4096 px before sending, a file of 20 MB or less is sent byte for byte, and a file still over 20 MB, or undecodable while over 20 MB, sends no request and shows the size message.
I14. At 390 px wide, measured in a real browser by `frontend/e2e-layout/`, the modal's 「画像で探す」 pill and the results page's pill are at least 44 px tall, the image chip and the field fit the content width, and nothing scrolls horizontally; at desktop width the image button sits inside the field's row.

## Checked, no action

- **Multipart upload.** `python-multipart` is not in the addon's requirements, and the
  generic proxy forwards a raw body with its `Content-Type` already. A raw image body
  needs no new dependency and no proxy change.
- **Base64 in JSON.** A third larger on the wire and a second copy in memory, for no gain
  over the raw body.
- **A short-lived server-side token for the URL.** It would store the image, or its vector
  and read text, on the server for minutes, against the decision that the image is not
  stored. The URL holds a tab-local id instead; a reload asks for the image again.
- **Keeping the image in IndexedDB so a reload works.** It would store the image in the
  browser beyond the tab's life; same reason. Recommended against; the human may choose
  it.
- **Combining an image query with operators, the type filter or text.** Not in this
  change: the three groups are ranked by the image alone, and the header hides the chip
  row and 「＋ 条件」. `search_images` already takes `file_id_constraint`, so A2's filter
  can follow in a later spec for images; scenes and documents would each need a scope.
- **The Files / Passages control, Scene search toggle and Scene candidates.** They belong
  to a text query; the image query view has its own groups.
- **Visual Index scenes (`/search/scenes`).** They rank text embeddings of scene
  descriptions; an image vector cannot query them. The `clip` frames already cover every
  video with scene frames.
- **PDF pages as pictures.** PDF pages are not CLIP-embedded; a screenshot of a PDF is
  found through its text (the documents group).
- **Transcripts in the documents group.** The decision names documents; a screenshot of a
  video's subtitles is found by the scenes group.
- **A keyword channel for the read text.** `_build_fts_query` joins every
  whitespace-separated term with AND, so a read text of many lines would need every line
  verbatim, and OCR's single-character errors would make it match nothing. The text
  vector channel found the source within the first 3 files for every 200-character window
  measured.
- **Loading only the vision tower (`SiglipVisionModel`, 0.37 GB) instead of the full
  model.** It would save about 1.1 GB while loaded, but changes the indexing path that
  produces stored vectors. A separate change, with a test that the vectors are equal.
- **A cap in the core proxy.** The addon enforces 20 MB; the Next.js rewrite already caps
  bodies at 128 MB (`proxyClientMaxBodySize`). Changing `addon_proxy.py` (HIGH zone) for
  one route is not needed under the personal-tool threat model.
- **An MCP tool.** `upload_file` shows an agent can send base64 up to 10 MB, but no agent
  workflow asks for image search yet, and the answer shape would need its own tool
  contract. Recommended: later, as its own spec.
- **「この文字で検索」 from the read text.** Not decided; the excerpt is shown for context
  only.
- **Showing the image query in the modal.** The modal hands off to the results page at
  once; three groups do not fit its list.
- **Language of the read text.** The OCR models are the Japanese PP-OCRv6 set chosen in
  SPEC-ADDON-050; Latin text is read by the same models. No language rule is added.

## Pending human confirmation

Each with the recommendation.

- **Route shape.** `POST /search/by-image`, raw body, the seven image types, 20 MB and
  50 MP, behind the `search` policy. Recommended: no new dependency, no core change.
- **OCR follows `features.image_ocr`.** With `"false"` the documents group is never
  produced; `"manual"` and `"on_index"` both allow it (they schedule indexing, not
  reading on request). Recommended: a viewer who switched picture-text reading off does
  not expect an image to be read.
- **Memory: an idle release of the SigLIP full model after 600 s**, shared by indexing and
  image queries (`memory.clip_image_idle_unload`, `0` = never). Recommended over always
  resident: it frees about 1.5 GB that today stays held after any indexing, and a reload
  costs 0.3–6 s.
- **Score floor 0.70** for images and scenes (`search.min_score_image_query`), with 24
  images and 20 scene segments at most. Recommended from the local measurement; about 1 %
  of unrelated picture pairs pass it, which the caps bound. Re-measure on production.
- **Read length 20** non-whitespace characters before the documents group runs.
  Recommended: shorter text found its source less reliably.
- **Group order**: documents first when they have a hit, else images then scenes.
  Recommended: an image with enough text to find a document is most likely a capture of
  that document.
- **The URL holds a tab-local id only**; reload or a shared link shows 「画像をもう一度選んで
  ください」. Recommended: it is the only shape that keeps "the image is not stored".
- **An image query does not combine with operators, the type filter or text** in this
  change. Recommended: later, images first.
- **On the results page a drop of exactly one image searches instead of uploading** into
  the drive root. Recommended: on a search page an upload into the root is rarely meant,
  and every other drop still uploads.
- **✕ on the image chip opens the drive's library view**, as removing A2's last operator
  does. Recommended for consistency.
- **Files over 20 MB are downscaled in the browser** to a 4096 px long edge.
  Recommended: it lets large phone photos through without losing a screenshot's small
  text.
- **No MCP tool in this change.** Recommended: its own spec when an agent workflow needs it.
- **`DESIGN.md` §6 gains an "Image query chip" entry** in this change. Recommended.
