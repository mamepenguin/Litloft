# Search by an image

SPEC-ID: SPEC-ADDON-049
SPEC-ID: SPEC-CORE-046

Approval: sha256:d551cf9af55039fc9951695bd2669d767ef70e8f6138d50abe010df006b4d9f6 Yuichi Senga 2026-11-05

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
entries; adding a sixth drops the least recently used and revokes its object URL. An
entry counts as used when it is created and each time the image query view is entered
for its id, so the image the viewer is looking at is never the one dropped. *Read
text*: the OCR engine's recognised lines joined with `\n`. *Read length*: the number of
non-whitespace characters in the read text.

SPEC-CORE-046, giving an image:

0. **Availability.** The route is served when the addon proxy lets the drive's `search`
   feature through, and `/api/addons/status` does not report that feature (it filters
   addons on `index`). So the frontend asks the route's own gate: `GET
   /api/addons/intelligence/search/by-image/available` with `X-Lit-Drive` (addon step
   9a). *Image search is available* for a drive exactly when that request answered 200
   and its body is not `{available: false}` (the proxy answers 200 `{available: false}`
   when the addon call raises).
   It is asked once per drive per page load and the answer is kept in module memory for
   that drive. While the answer is pending, failed, not 200, or `{available: false}`,
   image search is unavailable, and the modal and the results page behave exactly as
   before this change:
   - no image button or pill is rendered;
   - a paste is left to today's handling (text inserts as today; an image-only paste
     inserts nothing);
   - the modal registers no drop handler;
   - every drop on the results page goes to the upload zone as today.
1. **Modal.** While the modal has a drive (`drive` set), image search is available for
   it, and the modal is neither scoped (a scope chip is shown) nor browsing a folder (the
   browse chip is shown) (pending human confirmation), it accepts an image in three ways;
   while scoped or browsing it behaves as when image search is unavailable (step 0):
   - Paste in the modal's input: when the paste's `clipboardData` holds a file whose type
     starts with `image/` and holds no non-blank `text/plain`, the image is taken and the
     paste inserts no text. When it also holds non-blank `text/plain` (copying text from an
     office app puts a picture of it on the clipboard too), the paste inserts the text as
     today and the image is ignored. A paste with no non-blank text and more than one
     image file starts nothing and shows 「画像は1枚だけ選んでください」 where the size
     message goes (pending human confirmation).
   - Drop on the modal panel (desktop) or sheet (phone). The modal's drop handler calls
     `preventDefault` and `stopPropagation` on every `dragenter`, `dragover` and `drop`
     inside it, so no drop on the modal reaches an upload zone or the browser's default.
     The drag is classified as in step 2; a drop classified *one image* starts an image
     query; a drop of several files shows 「画像は1枚だけ選んでください」 (pending human
     confirmation); any other drop on the modal does nothing.
   - The image button in the input row (desktop: a 32 px icon button named 「画像で探す」;
     phone: a labelled pill 「画像で探す」 in the row under the input, before the operator
     chips), which opens `<input type="file" accept="image/*">`.
   Taking an image creates a query id, puts the image in the image store, closes the modal
   and navigates with `router.push` to `/drive/<drive>/search?img=<id>` with no other
   parameter (no `q`, `type`, `sort`, `order`, `show`, `smart_folder_id` or
   `include_scene_clip`). The text the input held is dropped, and nothing is added to the
   search history.
   *Preparation*: from the moment an image is given until the navigation, the modal stays
   open, the image button (desktop) or pill (phone) shows a 16 px spinner in place of its
   icon with `aria-busy="true"`, and the input stays editable. Only the latest image is
   prepared: a later image given, closing the modal, or Enter on text (a text search as
   today) cancels the pending one, which then neither navigates nor enters the store.
   When step 3 refuses the file, the modal stays open and the size message appears in one
   muted line under the input row (`role="alert"`); it clears on the next image given, the
   next edit of the input, or closing the modal.
2. **Results page with a text query (`FolderBrowser`).** While image search is available
   for the drive, the same three ways:
   - Paste while focus is in the query field, as in 1.
   - Drop on the page. `FolderBrowser` renders the page's `UploadZone` and the header's
     `SearchQueryHeader`. `search/page.tsx` passes `FolderBrowser` an
     `onImageQuery(file)` callback only while image search is available, and
     `FolderBrowser` passes it on to both: to `UploadZone` as a new optional prop (the
     drop) and to `SearchQueryHeader` (the image button and the field's paste). Without
     the prop (every other page, and the search page while image search is unavailable)
     both behave exactly as today.
     *Classification*: on the first `dragenter`, the drag is classified once from
     `dataTransfer.items` and the class is kept until the drag leaves or drops: *one
     image* when there is exactly one item, of kind `file`, whose reported type starts
     with `image/`; *upload* otherwise (several items, a folder, a non-image, or an item
     whose type the browser does not report). The overlay shows 「ドロップして画像で探す」
     for *one image* and today's upload text for *upload*. On drop the action follows the
     kept class and is never re-derived: *upload* runs today's upload; *one image* calls
     `onImageQuery` with `dataTransfer.files[0]` when the drop holds exactly one file
     whose type starts with `image/`, and otherwise does nothing. A *one image* drop never
     falls back to an upload, so the drop does what the overlay said, or nothing.
   - The image button at the field's trailing edge (desktop: 32 px icon button named
     「画像で探す」; phone: a labelled pill 「画像で探す」 in the row under the field).
   Each navigates with `router.push` to `/drive/<drive>/search?img=<new id>` with no other
   parameter. Preparation is as in step 1, on the field's image button or pill: a later
   image or Enter on text cancels the pending image. A refused file (step 3) shows the
   size message in one muted line under the field (`role="alert"`), cleared by the next
   image given or the next edit of the field.
3. **Before sending.** The limit is 20,971,520 bytes (20 × 1024 × 1024), the number the
   addon enforces (step 9). A file of at most that many bytes is sent byte for byte, so a
   screenshot keeps the resolution its small text needs. A larger file is decoded with
   `createImageBitmap` and re-encoded as JPEG (quality 0.9) with its long edge scaled to at
   most 4096 px; a phone photo of 48 MP saved as JPEG is the case this is for. If the
   browser cannot decode it (HEIC in a browser without HEIC support), or the re-encoded
   bytes still exceed the limit, the file is refused with the size message (8): nothing is
   sent and nothing navigates. A file whose type is empty or not one of the seven types the
   addon accepts (step 9; for example AVIF, TIFF) is decoded with `createImageBitmap` and
   re-encoded as JPEG the same way whatever its size; if the browser cannot decode it,
   it is refused with 「この画像は読み込めませんでした」 (pending human confirmation).

SPEC-CORE-046, the results page with `img`:

4. `search/page.tsx` renders the image query view when the URL has `img`, whatever else it
   holds; `q`, `type`, `sort`, `order`, `show`, `smart_folder_id` and
   `include_scene_clip` are ignored by the view and left in the URL untouched. The view
   replaces `FolderBrowser` and the Scene search toggle and `search-results-top` slot
   above it.
5. The header is `PageHeader` with `SearchQueryHeader` in its field slot (A2's), the field
   holding an *image chip* at its leading edge: a 28 × 28 `rounded-lg` `object-cover`
   picture of the image (its object URL), the label 「画像」, and a ✕ named 「画像を外す」.
   The field is otherwise empty and editable. The operator chip row, 「＋ 条件」, the
   Smart Folder button and the `search-modes` slot are not rendered. The visually hidden
   `<h1>` reads 「画像で検索」.
6. **Drop on the image query view.** The view handles drops itself (it has no
   `UploadZone`): it classifies a drag as in step 2, shows 「ドロップして画像で探す」 for *one
   image* and starts a new image query on its drop; for any other drag it shows no
   overlay, sets `dropEffect` to `none`, calls `preventDefault` so the browser does not
   open the file, and does nothing on drop (pending human confirmation: no upload is
   offered on this view). Paste in the field and the image button work as in step 2.
   All three are gated on availability (step 0) like the other entry points: while image
   search is unavailable for the drive, the view renders no image button, leaves paste to
   today's handling, and its drop handler only calls `preventDefault` (the browser does not
   open the file) and shows no overlay. The *gone* state then shows
   「このドライブでは画像で探せません」 with no button instead of 「画像をもう一度選んでください」;
   while availability is still pending it shows the gone message without the button.
   *Overlay*, on the text-query page and on this view alike (§Search passage rows' rule of
   no accent fill): a full-viewport `fixed inset-0 z-50` layer of `bg-bg-primary/75` with
   `backdrop-blur-sm`, holding a centred box `rounded-2xl border-2 border-dashed
   border-warm-silver bg-bg-card/90 px-12 py-10` with a 48 px lucide `ImagePlus` in
   `text-text-muted` above 「ドロップして画像で探す」 (`text-lg font-medium
   text-text-primary`). The upload overlay keeps its current look.
7. **The request and its life.** Each image store entry carries a *state*: `pending`
   (never sent, or its request was aborted), `loading`, `answered` (with the answer) or
   `failed` (with the HTTP status or `network`).
   - Entering the view for an id the store does not hold shows the *gone* state and sends
     nothing.
   - Entering for a `pending` entry sends the request and moves the entry to `loading`.
   - Entering for a `loading` entry (the same id re-rendered while its request is in
     flight) attaches to that request and sends nothing.
   - Entering for an `answered` or `failed` entry renders the stored answer or failure and
     sends nothing; 再試行 on a retryable failure (8) sends one request.
   - Leaving the view (any navigation, including a new image or a text submission) aborts
     its in-flight request through its `AbortController` and returns the entry to
     `pending`, so coming back sends one request again.
   - An answer or failure is written only to the entry of the id it was sent for, and only
     while that request was not aborted; the view renders only the entry of the URL's
     current id, so a late answer never appears under another id.
   The request is `POST /api/addons/intelligence/search/by-image` with header
   `X-Lit-Drive`, `Content-Type` the file's type (`image/jpeg` after step 3's
   re-encoding), and the bytes as the body.
8. **Leaving by the header.** Enter in the field with non-blank text pushes
   `/drive/<drive>/search?q=<text>` and nothing else (no `img`, `type`, `sort`, `order`,
   `show`, `smart_folder_id` or `include_scene_clip`); the text search then runs as A2's.
   Enter on blank text does nothing. Back returns to the image query view, which renders
   from the store as in 7. ✕ on the image chip pushes `/drive/<drive>` with no parameter,
   the drive's library view, as A2's removal of the last operator does (pending human
   confirmation).

SPEC-ADDON-049, `POST /search/by-image`:

9. The route reads `X-Lit-Drive` through `require_drive`. Before it reads any of the
   body, it checks the `Content-Type` (parameters ignored): `image/jpeg`, `image/png`,
   `image/webp`, `image/gif`, `image/bmp`, `image/heic` or `image/heif`; any other is 415.
   It then waits for the image query semaphore (11). Holding it, it reads the body as a
   stream and answers 413 as soon as more than 20,971,520 bytes (20 × 1024 × 1024) have
   arrived. The body is held in memory only; nothing of the request is written to any
   file, temporary files included (Starlette's `request.stream()` does not spool, and the
   decode reads from a `BytesIO`).
   9a. `GET /search/by-image/available` reads `X-Lit-Drive` and answers 200 `{}`. It does
   nothing else; its manifest entry carries the same `pre_check` as the POST route
   (step 14), so the proxy answers it exactly when it would let the POST through.
10. It decodes the bytes in memory with Pillow. HEIC and HEIF need `pillow_heif`'s opener,
    which the OCR worker registers only inside its own `_load_picture`; the new module
    `app/image_query.py` registers it itself (`pillow_heif.register_heif_opener()`, once,
    at import) so the route decodes HEIC whether or not OCR indexing has run. It checks `width × height` against 50,000,000 before
    loading the pixels (413 above it), applies the EXIF orientation, takes the first frame
    of an animated image, and converts to RGB with transparency flattened onto white (the
    OCR worker's `_to_rgb`). Undecodable bytes are 422.
11. **One at a time.** An `asyncio.Semaphore(1)` per process covers everything after the
    `Content-Type` check: reading the body, the decode, the embedding, both parts and the
    hydration. So at most one body (20 MB) and one decoded image (at most 50 MP, about
    150 MB as RGB) are in memory for image queries at any time; a second request waits
    with its body unread. The wait counts toward the proxy's 28 s (14).
    **Disconnects.** The browser aborting does not reach the addon: the core proxy keeps
    its upstream request open until the addon answers. The core proxy's own 28 s timeout
    does: httpx closes the connection. So right after acquiring the semaphore, and again
    after the embedding, the route checks `await request.is_disconnected()`; when true it
    releases the semaphore and returns without reading further, running nothing more and
    logging one INFO line `image query skipped: client gone`. A request already inside a
    part runs that part to its end.
12. Order of work, after the decode:
    1. `clip.embed_image(image)` on a worker thread gives one L2-normalised SigLIP vector.
       If it raises, the route answers 503 `Embedding unavailable`; nothing else has run
       (no OCR, no KNN, no hydration).
    2. Then two parts run concurrently on worker threads. A failure is handled per part:
       an exception in the images or the scenes ranking fails the whole request with 500
       `Search failed` (the visual groups are the answer's core, and a half answer would
       read as "nothing similar"); an exception anywhere in the text part (OCR, the text
       embedding, the documents KNN or its grouping) sets `text.status = "failed"` and
       leaves `documents` empty, and the visual groups answer as usual.
    - **Visual part**, on the vector:
      - *Images*: `search_images(vector, file_type="image", drive=drive, floor=F, limit=24)`,
        where `floor` and `limit` are new keyword arguments of `search_images` whose
        defaults are today's values (`min_score_clip_thumbnail`, `_IMAGE_SEARCH_LIMIT`), so
        every existing caller is unchanged. `F` is `search.min_score_image_query`, a new
        setting, default 0.70 (pending human confirmation; see 10). An `ImageHit.score` is
        the cosine similarity (`_l2_to_cosine_similarity` of the L2 distance) between the
        query vector and the file's `clip_thumbnail` vector, unrounded when compared with
        the floor and rounded to 4 places on the wire.
      - *Scenes*: when `scene_segments.count_frames(drive)` is not 0,
        `find_segments(vector, "", drive, 20, frames, floor=F)`, where `floor` is a new
        keyword argument, default `None` (today's behaviour), that drops every seed scoring
        below it before the relative threshold and the grouping are computed. With
        `floor` set, `partial` is true exactly when the KNN returned all
        `_CLIP_DRIVE_FETCH_MAX` (4096) rows and its last row scored at or above `floor`,
        that is, when frames of this drive above the floor may lie beyond the global
        cap; the answer carries it as `scenes_partial` (pending human confirmation). A
        `SceneHit.score` is the segment's peak frame's cosine similarity, compared with
        the floor unrounded and rounded to 4 places on the wire, as `find_segments`
        already rounds it. This is one KNN fetch of 4096 rows (`_seeds`), as today.
    - **Text part**, on the decoded image. Skipped, with `text.status = "off"`, when
      `features.image_ocr` is `"false"` (pending human confirmation). Otherwise the OCR
      engine (`ocr._get_engine()`, the process's shared engine, created on demand and
      released by the existing idle release) reads the image. The engine object is shared
      with OCR indexing, and nothing shows that RapidOCR's wrapper is safe to call from two
      threads at once, so `ocr.py` gains a `run_engine(engine, image, timeout)` that holds
      a new `threading.Lock` around `engine(image)`; indexing calls it with no timeout,
      this route with 10 s. The route therefore waits for at most the picture the indexer
      is reading (0.5–1.6 s measured) and gives up after 10 s with `text.status =
      "failed"`; the wait counts toward the 28 s. With no engine, `text.status
      = "failed"`. With a read length under 20 (pending human confirmation; see 10),
      `text.status = "too_short"` and no text search runs. Otherwise `text.status =
      "read"` and the documents group is ranked:
      1. The query text is the first 1000 characters of the read text (the chunk size the
         indexer uses for `text_content`), embedded with the query prefix through
         `embedder.embed_texts`. Neither `embed_query` nor `embed_text_clip`, both of which
         keep their last 512 inputs in an LRU cache, is called with it.
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
    `{ images: [ImageHit], scenes: [SceneHit], scenes_partial: bool,
    documents: [DocumentHit], text: { status: "read" | "too_short" | "off" | "failed",
    excerpt: str | null } }`:
    - `ImageHit` is `SearchResultItem` without `segments` and `passages`:
      `{ file_id, drive, filename, file_type, score, match_types: ["clip_thumbnail"], file }`.
    - `SceneHit` is `{ file_id, drive, filename, start, end, peak, score, frame_url, file }`
      with `frame_url` = `/api/addons/intelligence/files/{file_id}/frame?t=<floor(peak)>`.
    - `scenes_partial` is false when the drive has no scene frames.
    - `DocumentHit` is `{ file_id, drive, filename, file_type, score, passages, file }`.
    - `file` is the hydrated `FileItem` from one `hydrate_files` call over every id of the
      three groups; a failed hydration leaves `file` null, as `/search` degrades.
    - `text.excerpt` is the read text with every run of whitespace replaced by one space,
      cut to 200 characters with `…` appended when longer, when `status` is `read` or
      `too_short` with a read length over 0; null otherwise.
    - Each group is ordered best first. `drive` on every hit is the request drive.
14. The manifest declares both routes with `pre_check: {type: addon_feature, feature:
    search}`: `GET /search/by-image/available` (`response_filter: null`, default
    timeout) and `POST /search/by-image` (`response_filter: {type:
    current_drive_only_nested, paths: {images: drive, scenes: drive, documents: drive}}`,
    `timeout: 28`). The 28 s keeps the proxy's own 502 ahead of the Next.js rewrite's
    30 s cut (10).

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
    (pending human confirmation). A group with no hit is not rendered, with two
    exceptions, each a *slot without hits*: when `text.status` is `failed`, the documents
    slot shows its heading and the muted line 「画像の文字を読み取れませんでした」; when
    `scenes_partial` is true, the scenes slot shows its heading and the partial line (17).
    A documents slot without hits sits last, after images and scenes (the "documents
    first" rule needs a hit); a scenes slot without hits sits in the scenes position.
17. Each group has an `<h2>` heading. A group with hits has its count after the heading in
    `text-text-muted`: documents count files, images count pictures, scenes count
    segments (「同じ文字を含む文書 3」, 「似ている画像 12」, 「似ている場面 8」). A slot without
    hits shows the heading with no number.
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
      thumbnail, then the icon. When `scenes_partial` is true, a muted line under the
      heading reads Scene candidates' existing sentence 「このドライブのシーンを見逃している
      可能性があります」 (pending human confirmation).
18. The scope line (A2's count position) lists the groups that have hits, in the rendered
    order, each with the count of 17: 「文書 2・画像 8・場面 3」. Slots without hits are not
    in it. With no group with hits (the empty state, or only slots without hits) it reads
    「0 件」. It is hidden while loading, failed and gone.
19. Nothing of an image query is written to the search history (`searchHistory.ts`), the
    modal's search cache (`searchCache.ts`), `localStorage`, `sessionStorage` or
    IndexedDB, and no Smart Folder can be saved from it.

### 2. Failure cases

- **Image search unavailable for the drive** (the availability request pending, failed or
  not 200): no image entry point; paste and drop behave as before this change (step 0).
- **The image store does not hold the id** (reload, new tab, a copied link, the store
  dropped it after five newer image queries): the gone state; no request.
- **The browser cannot read the dropped or pasted data** (an empty file, a clipboard item
  whose `getAsFile()` is null): nothing happens; no navigation.
- **Several files dropped**: in the modal and on the image query view, nothing happens; on
  the results page with a text query, today's upload (step 2).
- **Refused before sending** (step 3): the size message where step 1 or 2 places it; no
  request, no navigation.
- **Status from the proxy or the addon**, with the message and whether 再試行 is offered in
  8:
  - 400 `Drive context required` (no `X-Lit-Drive`; the frontend always sends it): not
    retryable.
  - 403 `Drive not accessible` (the drive is locked, or was locked again since the page
    opened): not retryable.
  - 404 (the drive's `search` policy was switched off, or the addon's route is missing):
    not retryable.
  - 413, 415, 422 (over 20 MB or 50 MP, a type the addon refuses, undecodable): not
    retryable, because the same bytes would fail again.
  - 502, 503 (the addon is down, the proxy's 28 s timeout, the image model failed), 500
    (the Next.js rewrite's 30 s cut), a network error, or 200 `{available: false}`:
    retryable.
- **The OCR engine is missing** (`_get_engine()` returns None) **or raises on this
  image**, or **the text embedding fails**: `text.status = "failed"`; the visual groups
  still answer.
- **The images or scenes ranking raises**: 500 `Search failed`; the failed state with
  再試行. **The documents ranking raises**: `text.status = "failed"`; the documents slot
  without hits and its line; the other groups as usual.
- **The OCR engine is busy with indexing for more than 10 s**: `text.status = "failed"`.
- **The viewer leaves while the request waits for the semaphore**: the browser aborts, but
  the addon still runs the request when its turn comes, unless the core proxy's 28 s
  timeout closed the connection first, in which case the route skips it (11).
- **Hydration fails**: hits keep `file` null and render with `filename` and the
  `/api/files/{id}/thumbnail` fallback, as A3's rows do.
- **The drive has no scene frames**: no scene group, no KNN, `scenes_partial` false.
- **Other drives fill the global scene KNN cap**: `scenes_partial` true; the scene group
  shows what was found and the partial line.
- **A file in the answer is trashed or missing by the time it is opened**: the file page's
  own 404, as for any search hit.
- **The image model was released while the request waited**: `embed_image` loads it again
  (step 15); the load counts toward the 28 s.

### 3. States

Image store entry, per query id:

| From | To | When |
|---|---|---|
| (absent) | pending | an image is given (steps 1, 2, 6) |
| pending | loading | the view is entered for the id |
| loading | answered | 200 with an answer |
| loading | failed | non-200, a network error, or 200 `{available: false}` |
| loading | pending | the view is left while the request is in flight (aborted) |
| failed | loading | 再試行 on a retryable failure |
| any | (absent) | evicted as the sixth entry |

Image query view (results page with `img`), rendered from the entry of the URL's id:
*gone* (no entry), *loading* (`pending` being sent, or `loading`), *answered* (an answer
with at least one rendered group), *empty* (an answer with no rendered group), *failed*.

Forbidden: a request for an absent id; a second request while one is `loading` for the
same id; a request for an `answered` id; `empty` for a failure; an answer written to an
entry other than the one it was sent for, or written after its request was aborted.

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
  drive is 403 `Drive not accessible`; a missing header is 400) and applies the drive's
  `search` policy (`pre_check`, 404 when off), as for `/search`. The availability route
  carries the same `pre_check`, so the frontend offers image search exactly where the
  POST route would be let through.
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
- **The results page's upload on drop**: unchanged for every drag except one classified
  *one image* while image search is available (step 2); that drag now searches instead of
  uploading into the drive root. With image search unavailable, unchanged for every drag.
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
| 403 | 「このドライブはロックされています」 / "This drive is locked" | none |
| 400 or 404 | 「このドライブでは画像で探せません」 / "Image search isn't available on this drive" | none |
| 500, 502, 503, network, `{available: false}` | 「画像で探せませんでした」 / "Couldn't search by this image" | 「再試行」 |
| Gone | 「画像をもう一度選んでください」 / "Choose the image again" | the image button, and the view accepts paste and drop |
| Empty | `EmptyState` `no-results` with 「似ているものは見つかりませんでした」 / "Nothing similar was found" | none |
| Text part failed (`text.status` `failed`; in the documents slot) | 「画像の文字を読み取れませんでした」 / "Couldn't read the text in this image" | none |
| Several images (paste or modal drop) | 「画像は1枚だけ選んでください」 / "Choose one image" | none |
| Unavailable, in the gone state | 「このドライブでは画像で探せません」 | none |

The failure messages are `role="alert"`. The size message before sending sits under the
modal's input row or the results page's field, as steps 1 and 2 say, and clears as they
say.

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
  image model and the OCR engine are both cold, inside the 30 s limit (10).
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
  `docs/addons/intelligence.md`: `POST /search/by-image` (body, types, limits, answer)
  and `GET /search/by-image/available`,
  `search.min_score_image_query`, `memory.clip_image_idle_unload`.
  `docs/reference/configuration.md`: the `memory` row names the image model's idle
  release, and `features.image_ocr` says it also decides whether a searched image is
  read.
- `DESIGN.md` §6 gains a short "Image query chip" entry beside §Page Header's search-field
  rule (pending human confirmation).

### 10. Non-functional

- **Limits**: 20,971,520 bytes of body (client and addon), 50,000,000 pixels (addon, the
  OCR worker's value), one image query at a time per addon process. Time: the Next.js
  rewrite that carries every `/api/*` request cuts a proxied request at 30 s and answers
  500 (`next` 16.2.1 `proxy-request.js`, `proxyTimeout || 30000`; measured 2026-11-05 by
  running that function against a server that answered after 40 s: 500 after 30.0 s).
  `next.config.ts` sets no `proxyTimeout`, so the route's real limit is 30 s; its proxy
  timeout is 28 s so the core proxy's 502 arrives first. The cold path (model load, OCR
  engine creation) measured about 10 s.
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
  embedding, the existing exact `clip_thumbnail` scan of the drive, one scene KNN fetch of
  4096 rows, and at most four text KNN fetches of up to 4096 rows.

## Touch points

Addon (`addons/intelligence`, its own PR, then the pointer bump):
- `app/routers/search.py`: `POST /search/by-image` and `GET /search/by-image/available`.
- `app/image_query.py` (new): the HEIF opener registration at import, the semaphore, the
  disconnect checks, the body cap, the decode, the order of work and per-part failure
  handling, the answer.
- `app/schemas.py`: `ImageQueryResponse`, `ImageHit`, `SceneHit`, `DocumentHit`,
  `ImageQueryText`.
- `app/search.py`: `search_images` gains `floor` and `limit`; the drive-scoped widened KNN
  over the `text_content` partition and the documents grouping (a new function reusing
  `_drive_thumbnail_neighbours`' widening and A3's passage kinds).
- `app/scene_segments.py`: `find_segments` gains `floor`.
- `app/workers/clip.py`: the in-flight count in `embed_image`, `unload_full_model`,
  `check_idle_unload`.
- `app/workers/ocr.py`: `run_engine` with a lock around `engine(image)` and an optional
  timeout; `index_ocr` calls it in place of `engine(image)`. `_get_engine` and `_to_rgb`
  are called, not changed.
- `app/workers/embedder.py`: `embed_texts` called with the query prefix, not changed.
- `app/indexer.py`: `_idle_unload_worker` calls `clip.check_idle_unload`.
- `app/config.py`: `SearchConfig.min_score_image_query`,
  `MemoryConfig.clip_image_idle_unload`; `search-config.yml.example`.
- `manifest.json`: both routes (step 14).
- `tests/`: route limits (415 before the body is read, 413 by bytes and by pixels, 422),
  HEIC decoding without OCR having run, the answer shape and scores, drive scoping of all
  three groups, the floors, `scenes_partial`, `features.image_ocr = "false"`, the
  read-length gate, per-part failures (500 for the visual part, `failed` for the text
  part), the semaphore (one body and one decode at a time) and the disconnect skip, the
  OCR lock's 10 s give-up, no write to any table or file, no log of the read text, no LRU
  cache entry, the idle release and its in-flight guard, `search_images` and
  `find_segments` unchanged without the new arguments, and a manifest check that both
  routes carry the same `pre_check`.
- `docs/addons/intelligence.md` and `docs/reference/configuration.md` (in the core
  repository; the latter's `memory` row gains the image model, and its
  `features.image_ocr` section says the setting also governs reading a searched image).
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
- `frontend/src/components/FolderBrowser.tsx`: passes `onImageQuery` from the page to its
  `UploadZone` (the drop) and to its `SearchQueryHeader` (the image button and paste).
- `frontend/src/components/UploadZone.tsx`: the optional `onImageQuery` prop, the
  drag-time classification and the one-image overlay; without the prop, unchanged.
- `frontend/src/lib/imageQuery.ts` also holds the per-drive availability answer (step 0).
- `frontend/src/messages-core/ja.json`, `en.json`.
- Frontend tests beside the existing search tests; a `frontend/e2e-layout/` fixture of the
  image query view and the modal's phone row at 390 px and at desktop width.
- `docs/user-guide/search.md`, `docs/user-guide/keyboard-shortcuts.md`,
  `docs/reference/configuration.md` (see the addon list), `DESIGN.md` §6 (pending human
  confirmation).

Rules passed through: `.claude/rules/design-decisions.md` (the drive boundary; the addon
reads `X-Lit-Drive` and does not validate it; the proxy's two-layer policy; SPA navigation
through `router`), `.claude/rules/frontend-conventions.md` (`DESIGN.md`, `messages-core`
only, Container/Presenter for the new view), `.claude/rules/backend-conventions.md` (no
language-dependent rule: the read-length gate counts characters and names no vocabulary),
`DESIGN.md` §2.2, §3.6, §Inputs, §Page Header, §Editable Tag Chips, §Search passage rows,
§Justified thumbnail rows, §Over-video chrome. No Internal API endpoint, no HIGH zone and no
protected path is touched; `UploadZone.tsx` is not a risk zone but its upload path is
existing behaviour that must not change (I7, I8).

## Invariants

I1. `POST /search/by-image` answers 415 for a `Content-Type` outside the seven image types before reading the body, 413 once the body passes 20,971,520 bytes or the image passes 50,000,000 pixels, 422 for bytes Pillow cannot decode, and 503 when `embed_image` fails, and in none of these cases runs OCR, a KNN or hydration; an exception in the images or scenes ranking answers 500, and one in the text part answers 200 with `text.status` `failed`, empty `documents` and the visual groups unchanged; HEIC and HEIF decode whether or not OCR indexing has run.
I2. Nothing of an image query is kept: a request writes no row to any table of the addon's database, creates no file on any filesystem (temporary files included), and writes no log line containing the read text or the image's bytes; it adds no entry to `embed_query`'s or `embed_text_clip`'s LRU cache; in the browser no image, id, read text or answer is written to the search history, the search cache, `localStorage`, `sessionStorage` or IndexedDB, and the image store never holds more than 5 entries.
I3. Every hit in `images`, `scenes` and `documents` is a file of the request drive, active in the index, and `documents` never holds a file whose `file_type` is `image`.
I4. Every `ImageHit.score` and `SceneHit.score` is the raw cosine similarity rounded to 4 places, and the unrounded value of every returned image and scene is at or above `min_score_image_query`; documents below `min_score_text`, or more than `score_cutoff_margin` below the best document row, are never returned; at most 24 images, 20 scene segments and 10 documents with at most 3 passages each are returned; `scenes_partial` is true exactly when the scene KNN returned 4096 rows and its last row scored at or above the floor.
I5. With `features.image_ocr` `"false"` the OCR engine is not called and `text.status` is `off`; with a read length under 20 no text embedding or text KNN runs and `text.status` is `too_short`; a failure of the text part never removes or changes the visual groups.
I6. `search_images` and `find_segments` called without the new arguments return the same results, in the same order with the same scores, as before this change, and `/search`, `/search/images` and `/search/scene-segments` answer exactly as before; the SigLIP full model is released after `clip_image_idle_unload` idle seconds and never while an `embed_image` call runs, the next `embed_image` after a release returns a vector equal to the one before it for the same image, and the text encoder is never released by it.
I7. `GET /search/by-image/available` and `POST /search/by-image` carry the same `pre_check` in the manifest, so the first answers 200 for a drive exactly when the proxy would let the second through. While image search is not available for the drive (the availability request pending, failed, not 200, or `{available: false}`), on the modal, the text-query page and the image query view, no image entry point is rendered and paste, drop and upload behave exactly as before this change; while it is available, a paste whose clipboard holds non-blank `text/plain` inserts that text and starts no image query, a paste of exactly one image with no plain text starts one image query and inserts nothing, a later image, closing the modal or Enter on text cancels an image still being prepared, and no drop or paste in the modal ever starts an upload.
I8. On the results page with a text query and on the image query view, the action of a drop is the class the drag was given at `dragenter`: a drag classed *upload* uploads exactly as before this change on the text-query page and does nothing on the image query view; a drag classed *one image* starts an image query when the drop holds exactly one image file and otherwise does nothing, and never uploads.
I9. For one query id the view sends a request only when the entry is `pending` or on 再試行 of a retryable failure; entering an `answered`, `failed` or `loading` entry sends nothing; leaving the view aborts its in-flight request and returns the entry to `pending`; an answer is written only to the entry it was sent for and never after its abort; an absent id shows the gone state and sends nothing.
I10. A file of one of the seven types and at most 20,971,520 bytes is sent byte for byte; a file of another or no type is re-encoded to JPEG; a larger one is re-encoded to JPEG with a long edge of at most 4096 px; a file still over that limit, or undecodable while over it, sends no request and navigates nowhere, and shows the size message under the modal's input row or the results page's field until the next image given, the next edit of the input or field, or the modal closing.
I11. The groups render in the order documents (when it has a hit), images, scenes; a group without hits is not rendered, except the documents slot when `text.status` is `failed` (then last) and the scenes slot when `scenes_partial` is true; heading counts and the scope line count only groups with hits (files, pictures, segments), the scope line reads 「0 件」 when none has hits and is hidden while loading, failed and gone; Enter on non-blank text pushes `/drive/<drive>/search?q=<text>` with no other parameter, and ✕ on the image chip pushes `/drive/<drive>` with none.
I12. At most one image query per addon process holds a body, a decoded image or an embedding at a time, a second waiting with its body unread; a request whose connection is closed when it takes the semaphore, or after its embedding, runs nothing further; the route's OCR call waits for the indexer's at most 10 s and then reports `text.status` `failed`.
I13. At 390 px wide, measured in a real browser by `frontend/e2e-layout/`, the modal's 「画像で探す」 pill and the results page's pill are at least 44 px tall, the image chip and the field fit the content width, and nothing scrolls horizontally; at desktop width the image button sits inside the field's row.

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
- **A cap in the core proxy.** The addon enforces 20,971,520 bytes; the Next.js rewrite
  already caps bodies at 128 MB (`proxyClientMaxBodySize`). Changing `addon_proxy.py`
  (HIGH zone) for one route is not needed under the personal-tool threat model.
- **Raising the Next.js rewrite timeout** (`experimental.proxyTimeout` in
  `next.config.ts`). It applies to every rewrite of the app, and the measured cold path
  fits in 30 s. Existing addon routes that declare 60 or 90 s in their manifests are
  also cut at 30 s by it today; that is outside this change.
- **Gating the image button on `isSemanticSearchAvailable`.** It reads
  `/api/addons/status`, which filters on `index`, not on the `search` feature that
  serves the route; the availability route asks the real gate.
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

- **Route shape.** `POST /search/by-image`, raw body, the seven image types, 20,971,520
  bytes and 50 MP, behind the `search` policy, with `GET /search/by-image/available` as
  its gate. Recommended: no new dependency, no core backend change, and the frontend asks
  the gate that actually serves the route.
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
- **On the results page with a text query, a drop of exactly one image searches instead of
  uploading** into the drive root. Recommended: on a search page an upload into the root
  is rarely meant, every other drop still uploads, and the overlay says which will happen.
- **No upload on the image query view.** A drop there either searches by one image or
  does nothing. Recommended: the view has no folder to upload into, and an upload into
  the root from an image search is even less likely to be meant than from a text search.
- **`scenes_partial` is carried and shown** as the muted line Scene candidates already
  uses. Recommended: the cap is global across drives, so on a large library a drive's
  frames can be cut silently; the existing sentence tells the viewer without new wording.
- **iOS: no camera claim in this change.** The picker is `accept="image/*"`; the app's
  `Info.plist` has no `NSCameraUsageDescription`, so whether the in-app picker offers
  Take Photo, and what choosing it does, is unverified. Recommended: claim the photo
  library and files only; add `NSCameraUsageDescription` in a separate IOS-domain change
  if the camera is wanted, verified by the human on a device (`agent_cannot_verify`). The
  same exposure exists today for the upload picker.
- **✕ on the image chip opens the drive's library view**, as removing A2's last operator
  does. Recommended for consistency.
- **Files over 20,971,520 bytes are downscaled in the browser** to a 4096 px long edge.
  Recommended: it lets large phone photos through without losing a screenshot's small
  text.
- **The Next.js rewrite's 30 s cut stays**, and the route's proxy timeout is 28 s.
  Recommended: raising `experimental.proxyTimeout` changes every rewrite of the app; the
  cold path measured about 10 s.
- **No image entry points while the modal is scoped or browsing a folder.** Recommended:
  an image query ignores the scope, so offering it there would silently drop the scope;
  the viewer removes the chip first, as a scoped modal has no meaning search today either.
- **A paste or modal drop of several images starts nothing** and shows 「画像は1枚だけ選んで
  ください」. Recommended: picking one of them by order would search an image the viewer
  may not have meant.
- **A file of an empty or unlisted type (AVIF, TIFF and the like) is re-encoded to JPEG**
  in the browser, and refused with 「この画像は読み込めませんでした」 when the browser cannot
  decode it. Recommended: the addon keeps its seven types, and anything the browser can
  show still works.
- **No MCP tool in this change.** Recommended: its own spec when an agent workflow needs it.
- **`DESIGN.md` §6 gains an "Image query chip" entry** in this change. Recommended.