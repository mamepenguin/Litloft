# Show where a frame-text search hit sits on the frame

SPEC-ID: SPEC-ADDON-136
SPEC-ID: SPEC-CORE-134
SPEC-ID: SPEC-CORE-135

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

A search that matches text shown in a video (frame text, SPEC-ADDON-066) gives a
`screen_text` passage. Its row shows the whole frame at the segment's start as an 88×50
thumbnail, and opens the video at that second (SPEC-CORE-048). On a slide or a busy screen
the matched words are a few pixels tall in that thumbnail, and in the player the viewer
still has to find them on the screen.

SPEC-ADDON-134 now keeps every frame-text line with its box (`video_frame_lines`). This
change uses those boxes in two places:

- **136** The addon answers, for a keyword-matched `screen_text` passage, the box of the
  first line the match falls on. For find in this file, each frame-text row carries the
  boxes of the lines its occurrence overlaps, as picture rows already do (SPEC-ADDON-075).
  The frame reader also stores the pixel size of the frame each segment's boxes came from,
  so that a player that cannot report its video size (the YouTube embed) can place them.
- **134** The search result row shows the frame cropped around that line instead of the
  whole frame. A keyword `screen_text` row links to the video with find in this file
  opened on the matched term.
- **135** Opened that way, the find row at that time is made current. While the video is
  inside that row's segment, the player outlines the matched lines on the picture, for a
  native video and for a YouTube `.loft`.

For the person who searches the words on a slide, a terminal or a burned-in caption, and
wants to see which screen held them and where on it.

Production has only started re-reading videos at rule 3 (SPEC-ADDON-134 item 6), so most
videos have no boxes yet. A passage or find row without usable boxes looks and behaves
exactly as it does today; no new state is shown for it.

Owner decisions (2026-11-18):

1. The player outlines go through find in this file (`?find=`), the path picture outlines
   already use. A viewer can then step to the next frame-text hit and see its outline too.
   Seek-bar marks and crops in the find list stay out of scope.
2. The outline stays while the playhead is inside the segment, playing or paused, and goes
   when the playhead leaves it, the current row changes, or find closes.
3. When the term falls on several lines, the search crop centres on the first of them;
   the player outlines every one.
4. A YouTube `.loft` gets the player outlines. Its search row is unchanged (no frame, no
   crop), because a YouTube frame is taken through the embedded player one at a time.

## Required items

### 1. Normal flow

Terms used below:

- **segment**: one `video_frame_lines` row and the `video_frame_texts` chunks with the same
  `file_id`, `start_time` and `end_time`.
- **joined text**: the segment's line texts joined by `\n`, in `lines_json` order.
- **usable lines**: `ContentExtractor.chunk_text` of the joined text equals the segment's
  chunk texts in `chunk_index` order (the reader rule of SPEC-ADDON-134, item 3), and
  every line has a quad of eight finite numbers. For find, the text find merges from those
  chunks (`_merge_chunks`) must also equal the joined text, so that its offsets are
  offsets in the joined text.
- **fold**: ASCII-only lower-casing, the folding `file_find.py` uses. Every length is
  kept.
- **line range** and **overlap**: as SPEC-ADDON-075 defines them for picture lines. Line
  `i` occupies `[s_i, s_i + len(text_i))` of the joined text, with `s_0 = 0` and
  `s_(i+1) = s_i + len(text_i) + 1`. An occurrence `[a, b)` overlaps line `i` when
  `s_i < b`, `a < s_i + len(text_i)` and `text_i` is not empty.

#### A. Frame size (SPEC-ADDON-136)

1. `video_frame_lines` gains two nullable integer columns, `frame_width` and
   `frame_height`. The migration adds them only when absent, and leaves every existing row
   with NULL in both.
2. The store step of the frame reader (SPEC-ADDON-134 item 4) writes, on each row it
   writes, the width and height in pixels of the image given to the engine (`_ocr_image`)
   for the frame that opened the segment. These are the dimensions the segment's quads
   were normalised by.
3. Nothing else writes the two columns. Native rows written before this change keep NULL
   until the video is read again.

#### B. The search passage's line (SPEC-ADDON-136)

4. `SearchPassage` gains two fields, `line_box` (a quad, or null) and `line_frame_url` (a
   string, or null). Both are null except in step 5.
5. For a `screen_text` passage with `keyword` true, of a file that is not a `.loft`:
   - Take the segment by the passage's `start` and `end`. If it has no
     `video_frame_lines` row, or its lines are not usable, both fields stay null.
   - Find, in the folded joined text, every occurrence of every folded term of the
     passage's `highlight_terms`. Take the occurrence that starts first; on equal starts,
     the longer one.
   - The first line, in line order, that this occurrence overlaps gives `line_box`, its
     quad as stored. If it overlaps no line (it lies on a `\n`), both fields stay null.
   - `line_frame_url` is the frame route at the segment's start in milliseconds, size
     large: `/api/addons/intelligence/files/{file_id}/frame?t=<start>&size=large`, with
     `<start>` the start rounded to 3 decimals.
6. The search router passes both fields through. Every other field of the answer, the
   passages' order and their number are what they would be without this change.

#### C. Find rows (SPEC-ADDON-136)

7. A find row of frame text (a `scene` row from `_frame_occurrences`) gains `boxes` when
   its segment's lines are usable and its occurrence overlaps at least one line. `boxes`
   holds the quads, in line order, of exactly the overlapped lines. Otherwise the row has
   no `boxes`, and `boxes` is never an empty list.
8. A frame-text row that has `boxes` also has `frame_size: [frame_width, frame_height]`
   when both columns of its segment are set. A row without `boxes` has no `frame_size`.
9. Visual Index scene rows, transcript rows and every other row are unchanged. The
   answer's `total`, `truncated`, rows, order, snippets and offsets are what they would be
   without the lines.

#### D. The search result row (SPEC-CORE-134)

10. A `screen_text` passage with a `line_box` that is eight finite numbers and a
    `line_frame_url` shows, in the row's picture slot, the large frame cropped to the
    **crop region**. The slot keeps its size (64×36 on a phone, 88×50 from `sm`).
11. The **crop region**, in the large frame's pixels (its natural size once loaded):
    - Let the line's box be the axis-aligned bounding box of its quad.
    - The region has the slot's aspect ratio.
    - Its width is the larger of: the box's width plus 20 % of it, the width needed for the
      box's height plus 150 % of it at that aspect, and a quarter of the frame's width. It
      is at most the frame's width, and its height at most the frame's height (the width
      is reduced to keep the aspect when the height is the limit).
    - It is centred on the box's centre, then moved the least distance needed to lie
      inside the frame.
    The slot draws exactly that region, scaled to fill it.
12. The time label in the slot's corner (today drawn over the frame) is drawn over the
    crop as well. The locator, file name and excerpt are unchanged.
13. If the large frame fails to load, the slot falls back as it does today from
    `frame_url`: the whole frame, then the file's thumbnail, then the type icon. A
    passage with no usable `line_box` or no `line_frame_url` starts at `frame_url`, exactly
    as today.
14. A `screen_text` passage with `keyword` true links to
    `/files/{id}?t=<floor(start)>&find=<term>`, where `<term>` is the longest of its
    `highlight_terms`, the earliest on equal lengths, URL-encoded. A `screen_text` passage
    with `keyword` false, or with no non-empty term, links as today
    (`?t=<floor(start)>`). Every other passage's link is unchanged.

#### E. The place in the player (SPEC-CORE-135)

15. When the file page opens with both `find` and `t`, the find bar opens on the query as
    today (SPEC-CORE-028 I9). When the first answer to that query is hits, the first row in
    answer order whose `kind` is `scene`, which has `boxes`, and whose `floor(start)`
    equals `t` (as a number), becomes current. Making it current seeks to its `start`, as
    making any `scene` row current does. If no row qualifies, no place is current, as
    today. Later answers (another query, a retry) do not apply this rule.
16. While all of these hold, the player draws outlines:
    - find has a term and its current row has `boxes`;
    - the media's current time `t` satisfies `start ≤ t < end` of the current row;
    - the media is not interrupted (`MediaController.isInterrupted()` is not true);
    - the **painted video rectangle** is known.
17. The outlines are the distinct quads of every row in the answer whose `start` and `end`
    equal the current row's and which has `boxes`. A quad of the current row is drawn in
    the current style (`.find-box-current`), any other in the mark style (`.find-box`), at
    the quad's fractions of the painted video rectangle.
18. The **painted video rectangle** is the contain fit of the video's size into the
    player's picture box:
    - a native video: the `<video>` element's box and its `videoWidth` × `videoHeight`
      (the element is `object-contain`);
    - a YouTube `.loft`: the embed's box and the current row's `frame_size`. Without
      `frame_size` it is unknown and nothing is drawn.
    No other `.loft` provider draws outlines.
19. The outlines follow the time: they appear when the playhead enters the segment and go
    when it leaves, by playing, seeking or the end of the video. For a native video this
    follows `timeupdate`, `seeked` and `loadedmetadata`; for the embed, a read of the
    current time at least every 250 ms while find has a current row with `boxes`.
20. The outlines go when the current row changes to one without `boxes` or with another
    segment (then the new segment's outlines are drawn when the playhead is in it), when a
    new query is typed, when the answer is not hits, when find closes, and when another
    file opens.
21. The outline layer is drawn over the picture, under the player's controls, in normal
    and full-screen playback. It takes no pointer events and is `aria-hidden`. It follows
    the picture box when the player resizes, rotates or enters full screen.

### 2. Failure cases

1. `video_frame_lines` cannot be read (an exception, malformed `lines_json`). Search: the
   passage gets null `line_box` and `line_frame_url`, one warning names the file id, and
   the search answer is otherwise unchanged. Find: the rows get no `boxes`, one warning
   names the file id, and the answer is otherwise unchanged (as SPEC-ADDON-075 I6 does for
   picture lines).
2. The lines are not usable: a segment re-read under rule 2 and then written by an older
   build, a corrected or partly read video, or rows left by an older build's purge
   (SPEC-ADDON-134, item 3). The passage and the rows behave as if there were no lines.
3. The store step cannot get the image size for a segment. That cannot happen: the quads
   are normalised by it, and a segment with unusable quads gets no row (SPEC-ADDON-134
   item 2.2).
4. The large frame route fails (ffmpeg timeout, the file is unreachable, 4xx/5xx). The
   crop slot falls back (step 13). Nothing is retried by the row.
5. The large frame loads but has a zero natural size. Treated as a load failure.
6. The file page is opened with `t` and `find`, and the answer is not hits, or no row
   qualifies: no place is current; the bar shows what it shows today.
7. The native video has not loaded metadata (`videoWidth` 0), or the embed has no box yet:
   nothing is drawn until both are known.
8. The YouTube embed plays an advertisement (`isInterrupted()`): nothing is drawn until it
   ends.
9. The video's picture moves inside a segment (a camera pan, a scrolling terminal). The
   outline stays where the segment's opening frame had the line. This is accepted
   (decision 2); the segment closes when the text changes.

### 3. States

Per segment, for this change:

| State | What shows |
|---|---|
| No `video_frame_lines` row (not re-read at rule 3, or an incomplete re-read) | Search row: whole frame, as today. Find row: no `boxes`. Player: nothing. |
| Lines present, not usable | As above. |
| Lines usable, keyword match overlaps a line | Search row: crop (native only). Find row: `boxes`. Player: outlines while in the segment (native; `.loft` only with `frame_size`). |
| Lines usable, vector-only search match | Search row: whole frame, link without `find`. |
| Lines usable, `frame_width`/`frame_height` NULL | Native: as the row above. YouTube `.loft`: no outlines. |

A video moves between these only by a frame read (the store step), a purge, or an older
build writing it; nothing in this change writes a row.

Per player, while find is open on a video: **no outline** ↔ **outlines drawn**, by the
conditions in step 16, re-evaluated on each time update, each change of the current row or
answer, and each resize.

### 4. Data read and written

| Store | Read / written | By |
|---|---|---|
| intelligence `video_frame_lines` | read; two columns added and written | search passages, find; the frame reader's store step |
| intelligence `video_frame_texts` | read | search passages (already), find (already) |
| intelligence frame cache `frames/{file_id}/{ms}.large.webp` | written on a miss, read | the existing frame route, now asked for large frames by result rows |
| core | nothing | — |
| browser | nothing stored | — |

Search and find write nothing.

### 5. External services

- **YouTube IFrame API** (in the browser, media_import's embed): `getCurrentTime` through
  `MediaController`. If it is slow or wrong (an ad, a stall), the outline follows what it
  reports; an interruption hides the outline. Nothing is sent to YouTube by this change.
- No other outside call. The large frame of a native video comes from local ffmpeg.

### 6. Authorization

Unchanged. Search answers only the drives the viewer can open (`X-Lit-Drive`, the core
proxy). The frame route goes through the host's `file_access` pre-check. Find checks the
drive and access of the requested file before reading its lines (SPEC-ADDON-075 I7).

### 7. Effect on existing features

- **Search answer** (`/search` passages): two new fields. The core passage view and the
  MCP `semantic_search` tool read the answer; unknown fields are ignored by both.
- **Exact search, Ask, citations, the single-file question**: read `video_frame_texts`
  only; unchanged.
- **Find in this file**: frame-text `scene` rows gain `boxes` and `frame_size`. The
  picture outline layer (`ImageCanvas`) draws only on picture pages, so video rows never
  reach it. The find list itself shows the same rows.
- **The passage view's 「このファイルの他の箇所 →」**: unchanged (SPEC-CORE-028 I9).
- **The frame reader**: the store step writes two more values per row; which frames are
  read, the text, chunks, flags and rule are unchanged (SPEC-ADDON-134 I1–I7).
- **The frame route**: unchanged; more large frames are requested.
- **Players**: a layer is added over the picture of `VideoPlayer` and of the `.loft`
  player on the file page. Mini player, Picture in Picture and the iOS app's native
  player draw nothing.

### 8. Error behavior

- The viewer sees no error for any failure here: a crop that cannot load shows the whole
  frame (or the thumbnail, or the icon), and a place that cannot be drawn is not drawn.
- Logged: one warning per file when `video_frame_lines` cannot be read in search or in
  find (failure case 1). Nothing else is logged.

### 9. User-visible behavior

- In the search results' passage view, a keyword hit in a native video's frame text whose
  segment has usable lines shows the cropped line instead of the whole frame, with the
  time label over it.
- Clicking that row, or any keyword frame-text row, opens the video at the time with the
  find bar open on the matched term (the inspector's 検索 tab, as `?find=` does today).
  When that row has boxes it is the current find place, and the line is outlined on the
  picture while the playhead is in its segment.
- Stepping to another frame-text find row (next, previous, click) seeks there and outlines
  its line. Stepping to a transcript row removes the outline.
- Without usable lines everything looks as it does today, except that a keyword
  frame-text row now also opens the find bar.
- No new text, control or setting.

### 10. Non-functional

- **Transfer**: one large frame (long edge at most 1280 px, WebP q80, typically 40–150 KB)
  per visible keyword frame-text row with a box, loaded lazily (`loading="lazy"`), cached
  by the browser and on disk by the frame route. A passage view shows at most 3 rows per
  file (`MAX_ROWS_PER_FILE`).
- **Server time**: a cache miss runs one ffmpeg extraction (15 s timeout), as the small
  frame does today. No new concurrency limit.
- **Search latency**: one `video_frame_lines` read per keyword `screen_text` passage
  returned, by `file_id` and times (indexed by `file_id`). No new read for any other
  passage.
- **Player**: the embed time read is at most 4 times a second, only while find has a
  current row with `boxes`.
- **Privacy**: no new data leaves the LAN.

## Touch points

- `addons/intelligence/app/database.py` — migration adding `frame_width`, `frame_height` to
  `video_frame_lines`.
- `addons/intelligence/app/models.py` — `VideoFrameLine` columns.
- `addons/intelligence/app/workers/frame_ocr.py` — the store step writes the frame size
  (SPEC-ADDON-134 I1, I6).
- `addons/intelligence/app/search.py` — `SearchPassage`, `_finish_passage`, a lines reader
  for a segment.
- `addons/intelligence/app/schemas.py`, `addons/intelligence/app/routers/search.py` — the
  passage schema and its pass-through.
- `addons/intelligence/app/file_find.py` — `_frame_occurrences` gains `boxes` and
  `frame_size`.
- `frontend/src/lib/searchMerge.ts` — `SearchPassage` type.
- `frontend/src/lib/searchPassages.ts` — `passageHref`.
- `frontend/src/components/search/PassageList.tsx` — `PassagePicture` crop.
- `frontend/src/lib/fileFind.ts` — `FindRow.frame_size`, reading it.
- `frontend/src/components/FileDetail/find/useFindInFile.ts` — the initial current row
  from `t`.
- The file page's wiring of `t` into find: `frontend/src/components/FileDetailFullScreen.tsx`,
  `frontend/src/components/folder/RightPaneFile.tsx`.
- `frontend/src/components/VideoPlayer.tsx`, `frontend/src/components/loft/LoftPlayer.tsx`
  — the outline layer, and a new shared layer component.
- `frontend/src/app/globals.css` — `.find-box` styles over video, if the design changes
  them.
- `docs/user-guide/` (search page), `docs/addons/intelligence.md` — what a frame-text hit
  shows.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, addon
  discipline: no core-to-addon dependency — the core reads only generic answer fields),
  `.claude/rules/backend-conventions.md` (migrations only add), `DESIGN.md` (find marks).
- The submodule pointer `addons/intelligence`.
- No protected path is edited.

## Invariants

I1. A `screen_text` passage has a non-null `line_box` exactly when it is keyword-matched, its file is not a `.loft`, its segment's lines are usable, and the first occurrence (earliest start, then longest) of its folded highlight terms in the folded joined text overlaps a non-empty line; then `line_box` is the stored quad of the first such line and `line_frame_url` is the large frame at the segment's start rounded to 3 decimals; every other passage has both null, and every other field, the order and the number of passages are as without this change.
I2. A frame-text find row has `boxes` exactly when its segment's lines are usable (chunks rebuild from the joined text, and the merged text equals it) and its occurrence overlaps at least one non-empty line; then `boxes` holds exactly the overlapped lines' quads in line order, never an empty list; `frame_size` is present only on a row with `boxes` and only when both stored sizes are set; every other row, `total`, `truncated`, order, snippets and offsets are as without the lines, and a failure to read the lines returns the answer without `boxes`.
I3. The store step writes, on every `video_frame_lines` row it writes, the pixel width and height of the image the engine read for the segment's opening frame, and nothing else writes them; the migration can run twice and leaves existing rows' values unchanged.
I4. A search row with a usable `line_box` and `line_frame_url` draws exactly the crop region of the large frame (slot aspect, containing the line's bounding box with the stated padding, at least a quarter of the frame's width, inside the frame); when the large frame fails or has no size it draws the whole frame, then the thumbnail, then the icon; a row without them renders exactly as before this change.
I5. A keyword `screen_text` passage links to `?t=<floor(start)>&find=<its longest highlight term>`; every other passage links exactly as before this change.
I6. Opening a file with `find` and `t` makes current, on the first hits answer only, the first `scene` row with `boxes` whose `floor(start)` equals `t`, and otherwise no row; opening with `find` alone still makes no place current.
I7. The player draws outlines only while find has a term, its current row has `boxes`, the media time is in `[start, end)` of that row and not interrupted, and the painted rectangle is known; then it draws the distinct quads of the rows with the current row's `start` and `end`, the current row's in the current style and the rest in the mark style, at their fractions of the contain-fitted rectangle (native: `videoWidth`×`videoHeight`; YouTube `.loft`: `frame_size`, none without it); in every other case it draws nothing.
I8. The outline layer takes no pointer events, is `aria-hidden`, follows the picture box through resize and full screen, and changes no playback state, control, seek or size; a video page with no qualifying row renders and plays exactly as before this change.
I9. Search, find and the result rows write nothing to the core DB or the intelligence DB.

## Revises

SPEC-CORE-048 I10. A `text_content` match on a video becomes a `screen_text` passage with its segment's `start` and `end`, `frame_url` at `floor(start)`, and a link to `?t=<floor(start)>`, to which a keyword-matched passage adds `&find=<its longest highlight term>` (SPEC-CORE-134), shown as 「mm:ss」 over 「画面内の文字」 with its excerpt; no video becomes a `text` or `picture_text` passage, search by image returns no video, a video's text hit in `/search/exact` carries its segment's `start_time` and `end_time`, and no detailed-summary citation of a video points at its `text_content` rows; Ask's context for a video places its frame text after the transcript snippets, or first when only frame text matched, an Ask citation of frame text carries its segment's `m:ss`, and the single-file question gives it `{"seconds": start_time}`.
SPEC-CORE-028 I9. `/files/{id}?find=<text>` opens the file with the bar open on that query after the canonical redirect, with no place current unless `t` is also given and the first hits answer has a `scene` row with `boxes` at that second (SPEC-CORE-135), and moving to another file closes the bar and drops `find`; the passage view's 「このファイルの他の箇所 →」 carries the longest keyword-matched highlight term of the group, and no `find` when the group has no keyword passage.
SPEC-ADDON-075 I5. A `picture_text` find row has `boxes` exactly when the picture's lines are usable (the stored picture text and the text merged from its `fts_text_content` chunks both equal the lines' texts joined by `\n`) and at least one non-empty line is overlapped by its occurrence; then `boxes` holds the quads, in line order, of exactly the overlapped lines, with a touch of an edge or a `\n` overlapping nothing. A frame-text `scene` row has `boxes` as SPEC-ADDON-136 states. A row of any other kind, and a row of a picture with unusable or no lines, has no `boxes`, and `boxes` is never an empty list; a corrected picture's rows therefore have none, and after a restore puts the machine text back they have them again.

## Checked, no action

- **A crop for a YouTube `.loft` search row**: not done (decision 4). Its row has no frame
  today; a YouTube frame is taken through the embedded player, one at a time.
- **A crop for a vector-only (semantic) frame-text hit**: no line is known to have caused
  the match, so the row keeps the whole frame and the link keeps no `find`.
- **Choosing the line inside the passage's own chunk** rather than the segment's first
  occurrence: a segment's text is split into chunks only above 1000 characters, and both
  give the same line in every other case. Not done.
- **Outlining in the crop**: the crop is centred on the line, and at 88×50 an outline
  would cover the words. The design decides; this spec draws none.
- **Seek-bar marks and crops in the find list**: out of scope (decision 1).
- **Rows sharing a segment as one place, per-line spans**: out of scope (SPEC-ADDON-134
  Checked, no action).
- **Using the find term for the crop** instead of the passage's highlight terms: the crop
  is drawn before find runs, from the search answer alone.
- **`t` with milliseconds in the link**: `floor(start)` is kept, and the row is matched
  by `floor(start)`. Two frame-text segments starting in the same second do not occur at
  one read per second; with key-frame reads above 1080p (SPEC-ADDON-066) they can, and the
  first in answer order wins.
- **The size of a native video from `frame_width`/`frame_height`**: the `<video>` element
  reports its own size, which is what it paints; the stored size is used only where the
  player cannot report it.
- **Re-reading native videos to fill the new columns**: not done. A native video does not
  need them, and every native video is being re-read at rule 3 anyway. The 47 YouTube
  `.loft`s get them when the operator reindexes them (SPEC-ADDON-134 item 7) if that runs
  after this change ships.
- **Outlines in the mini player, Picture in Picture and the iOS native player**: find
  does not run there.
- **A sharper source than the 1280-px large frame**: the boxes are normalised, and 1280 px
  is enough for the line to fill an 88-px-wide slot at 2× density.
