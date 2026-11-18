# Show where a frame-text search hit sits on the frame

SPEC-ID: SPEC-ADDON-136
SPEC-ID: SPEC-ADDON-137
SPEC-ID: SPEC-CORE-134
SPEC-ID: SPEC-CORE-135

Approval: sha256:31fb372117d1650a8ec53185cfef4886a816d2d0b8d9e78d0ca1f26900d8c2fd Yuichi Senga 2026-11-18

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

When a search matches text shown in a video (frame text, SPEC-ADDON-066), the result is a
`screen_text` passage. Its row shows the whole frame at the segment's start as an 88×50
thumbnail, and opens the video at that second (SPEC-CORE-048). On a slide or a busy screen,
the matched words are a few pixels tall in that thumbnail. In the player, the viewer still
has to find them on the screen.

SPEC-ADDON-134 now keeps every frame-text line with its box (`video_frame_lines`). This
change uses those boxes:

- **136** (intelligence)
  - For a keyword-matched `screen_text` passage, the addon answers the box of the line the
    match falls on.
  - For find in this file, each frame-text row carries the boxes of the lines its
    occurrence overlaps, as picture rows already do (SPEC-ADDON-075).
  - The frame reader also stores the pixel size of the frame each segment's boxes came
    from. The YouTube embed needs it, because it cannot report its video size.
- **134** (core)
  - The search result row shows the frame cropped around that line instead of the whole
    frame.
  - A keyword `screen_text` row links to the video at the segment's start, with find in
    this file opened on the matched term.
- **135** (core)
  - When the file opens from that link, the find row at that time becomes current.
  - While the playhead is inside that row's segment, the player outlines the matched lines
    on the picture, for a native video and for a YouTube `.loft`.
- **137** (media_import)
  - The YouTube embed draws a layer the core hands it over its picture, inside its own
    full-screen frame. This is so the outline also shows in full screen.

It is for the person who searches for the words on a slide, a terminal or a burned-in
caption, and wants to see which screen held them and where on it.

Production has only started re-reading videos at rule 3 (SPEC-ADDON-134 item 6), so most
videos have no boxes yet. A passage or find row without usable boxes looks and behaves as
it does today, except for the link in step 14. No new state is shown for it.

The agreed design is the Design Artifact https://claude.ai/artifact/AwPrSrK1AgEQ7LSpjHGEU3,
saved with its `canvas.json` in `docs/process/reviews/feature-frame-ocr-hit-place/design/`
(`Main`, `Phone`, `Player` and `Loft`). It checks the following:

- The crop keeps the slot's size and its time label, and has no outline inside it.
- The player draws the outlines with the existing `.find-box` and `.find-box-current`
  styles, unchanged.
- The outlines sit under the Litloft controls.
- On YouTube, the outlines fit both a 16:9 video and a pillarboxed vertical one.
- Nothing is drawn during an advertisement.

### Owner decisions (2026-11-18)

1. The player outlines go through find in this file (`?find=`), the path picture outlines
   already use, so stepping to the next frame-text hit outlines it too. Seek-bar marks and
   crops in the find list stay out of scope.
2. The outline stays while the playhead is inside the segment, playing or paused. It goes
   when the playhead leaves the segment, when the current row changes, or when find
   closes.
3. When the term falls on several lines, the search crop centres on the first of them;
   the player outlines every one.
4. A YouTube `.loft` gets the player outlines. Its search row is unchanged (no frame and
   no crop), because a YouTube frame is taken through the embedded player, one at a time.
5. The YouTube outline is drawn by the media_import embed, through a generic capability
   on `LoftEmbedProps`, so that it shows in full screen.
6. Where the controls are drawn inside the picture (browser controls, the YouTube-UI
   mode), the outline is drawn over them; it takes no pointer events. In a full screen the
   page cannot draw into (the `<video>` element's own full screen, iPhone's native full
   screen), there is no outline.

## Required items

### 1. Normal flow

Terms used below:

- **segment**: one `video_frame_lines` row, together with the `video_frame_texts` chunks
  that have the same `file_id`, `start_time` and `end_time`.
- **joined text**: the segment's line texts joined by `\n`, in `lines_json` order.
- **usable lines**: the segment's lines are usable when:
  - `ContentExtractor.chunk_text` of the joined text equals the segment's chunk texts, in
    `chunk_index` order (the reader rule of SPEC-ADDON-134, item 3); and
  - every line has a quad of eight finite numbers.

  For find, one more condition applies: the text that find merges from those chunks
  (`_merge_chunks`) must also equal the joined text. Find's offsets are then offsets in
  the joined text.
- **fold**: ASCII-only lower-casing, the folding `file_find.py` uses. Every length is
  kept.
- **line range** and **overlap**: as SPEC-ADDON-075 defines them for picture lines.
  - Line `i` occupies `[s_i, s_i + len(text_i))` of the joined text, with `s_0 = 0` and
    `s_(i+1) = s_i + len(text_i) + 1`.
  - An occurrence `[a, b)` overlaps line `i` when `s_i < b`, `a < s_i + len(text_i)` and
    `text_i` is not empty.
- **first occurrence**: among the occurrences of a set of terms in a text, the one that
  starts first. When two start at the same place, the longer one; when they are also the
  same length, the term that comes earlier in the set.
- **link term** of a passage: the term of the first occurrence of its folded
  `highlight_terms` in its folded excerpt (`text`), unfolded (as it appears in
  `highlight_terms`). If none of them occurs in the excerpt, the passage has no link term.
- **start text**: a segment's start written with exactly three decimals (`f"{start:.3f}"`,
  so `725` → `725.000`, `12.48` → `12.480`).

#### A. Frame size (SPEC-ADDON-136)

1. `video_frame_lines` gains two nullable integer columns, `frame_width` and
   `frame_height`.
   - The migration adds them only when they are absent.
   - It leaves every existing row with NULL in both.
2. The store step of the frame reader (SPEC-ADDON-134 item 4) writes both columns on each
   row it writes.
   - The values are the width and height, in pixels, of the image given to the engine
     (`_ocr_image`, after any downscale) for the frame that opened the segment.
   - These are the dimensions the segment's quads were normalised by.
3. Nothing else writes the two columns. Rows written before this change keep NULL until
   the video is read again.

#### B. The search passage's line (SPEC-ADDON-136)

4. `SearchPassage` gains three fields:
   - `line_box`: a quad, or null;
   - `line_match`: two numbers, or null;
   - `line_frame_url`: a string, or null.

   All three are null except in step 5, where they are set together or not at all. The
   `/search` answer and the image-query answer (`image_query.py`, which builds the same
   schema) both carry the three fields. The image-query answer never sets them.
5. Step 5 applies to a `screen_text` passage that has `keyword` true and whose file is not
   a `.loft`.
   - **Segment.** Take the segment by the passage's `start` and `end`. If the segment has
     no `video_frame_lines` row, or its lines are not usable, all three fields stay null.
   - **Occurrence.** Take the first occurrence of the passage's folded `highlight_terms` in
     the folded joined text. If no term occurs, all three fields stay null.
   - **`line_box`.** The first line, in line order, that this occurrence overlaps gives
     `line_box`: its quad, as stored. If the occurrence overlaps no line (it lies on a
     `\n`), all three fields stay null.
   - **`line_match`.** The part of that line the occurrence covers, as two fractions of
     the line's length in code points:
     `[(max(a, s_i) - s_i) / len_i, (min(b, s_i + len_i) - s_i) / len_i]`, each rounded to
     4 decimals.
   - **`line_frame_url`.**
     `/api/addons/intelligence/files/{file_id}/frame?t=<start text>&size=large`.
6. The search router passes the three fields through. The answer is otherwise unchanged:
   every other field, the order of the passages and their number are what they would be
   without this change.

#### C. Find rows (SPEC-ADDON-136)

7. A frame-text find row is a `scene` row from `_frame_occurrences`.
   - It gains `boxes` when its segment's lines are usable and its occurrence overlaps at
     least one line.
   - `boxes` then holds the quads, in line order, of exactly the overlapped lines.
   - Otherwise the row has no `boxes`. `boxes` is never an empty list.
8. A frame-text row that has `boxes` also has `frame_size: [frame_width, frame_height]`,
   when both columns of its segment are set. A row without `boxes` has no `frame_size`.
9. The rest of the find answer is unchanged:
   - Visual Index scene rows, transcript rows and every other row are as they were.
   - The answer's `total`, `truncated`, rows, order, snippets and offsets are what they
     would be without the lines.

#### D. The search result row (SPEC-CORE-134)

10. A `screen_text` passage is **croppable** when all of these hold:
    - its `line_box` is eight finite numbers;
    - its `line_match` is two finite numbers with `0 ≤ m0 ≤ m1 ≤ 1`;
    - its `line_frame_url` and `frame_url` are both set.

    The row's picture slot keeps its size: 64×36 on a phone, 88×50 from `sm`.
11. The slot of a croppable passage moves through these states, and never goes back to an
    earlier one:
    - **frame**: the whole small frame (`frame_url`) with the time label, exactly as today.
      The large frame is requested at the same time, lazily (`loading="lazy"` on the
      element that loads it).
    - **crop**: the slot enters this state once the large frame has loaded and has a
      positive natural width and height. It shows the crop region (step 12) with the time
      label over it.

    The slot falls back as follows:
    - If the large frame fails, or loads with a zero size, the slot stays in **frame**.
    - If the small frame fails while the slot is in **frame**, the slot goes to the
      file's thumbnail, then to the type icon, as today, and never enters **crop**, even
      if the large frame loads later.
    - In **crop** the small frame is no longer drawn, and its failure changes nothing.
    - The large frame may load before the small one; the slot then goes from **frame** to
      **crop** at once.

    A passage that is not croppable starts at `frame_url`, exactly as today.
12. The **crop region** is measured in the large frame's natural pixels. It is sized by
    the line's height, not its length, so the words stay readable in the slot whatever
    the line's length.
    - Let the line's box be the axis-aligned bounding box of the quad, with height `h`, top
      `y0`, left `x0` and width `w`, scaled to the large frame's natural size.
    - **Shape.** The region has the slot's aspect ratio: 64:36 on a phone, 88:50 from `sm`.
    - **Size.** The region's height is the larger of two values: `3 × h`, and the height
      that a width of a quarter of the frame's width gives at that aspect. It is at most
      the frame's height, and its width is at most the frame's width. When one of these
      limits applies, the other side is reduced to keep the aspect.
    - **Centre.** Vertically, the region is centred on the box's centre. Horizontally, it is
      centred on `x0 + w × (m0 + m1) / 2`, the middle of `line_match` along the box. This
      assumes the line's characters are of even width; it frames the words, it does not
      mark them.
    - **Placement.** The region is then moved the least distance needed to lie inside the
      frame.

    The slot draws exactly that region, scaled to fill it, with no outline.
13. The time label, the locator, the file name and the excerpt are unchanged.
14. A `screen_text` passage that has `keyword` true and a link term links to
    `/files/{id}?t=<start text>&find=<link term URL-encoded>`, encoded with
    `encodeURIComponent` (a space is `%20`). Every other passage links
    exactly as today; this includes a `screen_text` passage with `keyword` false, or with
    no link term (`?t=<floor(start)>`).

#### E. The place in the player (SPEC-CORE-135)

15. The file page opens with both `find` and `t` (the canonical surface: `RightPaneFile` →
    `FileDetailContainer`, which receives `initialTime` and passes it to find).
    - The find bar opens on the query, as today (SPEC-CORE-028 I9). The player lands at
      `t` through its own `initialTime`, as today.
    - **Which row.** The rule applies to the first hits answer to that URL query, including
      one reached by 再試行 after a failed answer. In that answer, the first row in answer
      order that meets all of these becomes current:
      - its `kind` is `scene`;
      - it has `boxes`;
      - `|start − t| < 0.001`. The link writes `start` rounded to three decimals, and a
        start exactly half a millisecond off (12.0625 written `12.062`) is still its own row.
    - **No seek.** Making this row current does not seek. The landing is the player's own
      `initialTime` landing at `t`, as today, so one seek decides where the playhead lands.
      Every later change of the current row (next, previous, a click) seeks as today.
    - **The viewer's step wins.** If the viewer pressed Enter (or Shift+Enter) before the
      first answer arrived, that pending step decides the current row, as today, and this
      rule does not apply.
    - **No row.** If no row qualifies, no place is current, as today.
    - **Later answers.** Once the query changes (typed, cleared), no later answer applies
      this rule.
16. The player draws outlines while all of these hold:
    - find has a term, and its current row has `boxes`;
    - the media's current time `t` satisfies `start − 0.5 ≤ t < end` of the current row.
      The half second absorbs a seek that lands just before `start`;
    - the media has not ended. For a native video this is the element's `ended` being
      false and `t` below its duration. For the embed, which reports no ended state, it is
      `t` below `getDuration()` when that is positive; the YouTube player holds
      `getCurrentTime()` at the duration once it ends;
    - the media is not interrupted: `MediaController.isInterrupted()` is not true;
    - the player is not in the mini player box, and the native video is not in the
      browser's Picture in Picture window (`document.pictureInPictureElement`);
    - the **painted video rectangle** is known.
17. The outlines are the distinct quads of every row in the answer that has `boxes` and the
    same `start` and `end` as the current row.
    - A quad of the current row is drawn in the current style (`.find-box-current`).
    - Any other quad is drawn in the mark style (`.find-box`).
    - Each quad is placed at its fractions of the painted video rectangle.
18. The **painted video rectangle** is the contain fit of the video's size into the
    picture box.
    - **Native video.** The picture box is the `<video>` element's box, and the size is its
      `videoWidth` × `videoHeight`. The element is `object-contain`. Both values must be
      positive.
    - **YouTube `.loft`.** The picture box is the box the embed gives the layer
      (step 22), and the size is the current row's `frame_size`. A `frame_size` is usable
      when it is two finite numbers, both above 0. Anything else is treated as absent, and
      the rectangle is then unknown.
    - In both, a picture box of zero width or height leaves the rectangle unknown.
    - **Other `.loft` providers.** Their embeds do not render the layer, and they have no
      frame text, so nothing is drawn.
19. The outlines follow the time. They appear when the playhead enters the window of
    step 16, and go when it leaves, whether by playing, seeking, ending or an
    advertisement.
    - **Native video.** The layer follows `timeupdate`, `seeked`, `ended` and
      `loadedmetadata`.
    - **Embed.** The layer reads the time from the shared media clock
      (`frontend/src/lib/mediaClock.ts`), which polls each controller once for all its
      consumers: every 250 ms while playing, every 1000 ms while paused. The layer
      subscribes only while find has a current row with `boxes`. After a step that seeks a
      paused embed, the outline can therefore lag the seek by up to a second; this is
      accepted.
    - **Re-rendering.** The time updates re-render only the layer, never the player or the
      embed. The embed's iframe is never re-parented.
20. The outlines go in any of these cases:
    - the current row changes to one without `boxes`, or to a row of another segment. The
      new segment's outlines are then drawn when the playhead is in it;
    - a new query is typed;
    - the answer is not hits;
    - find closes;
    - another file opens.
21. **Native layer.** The outline layer is drawn over the picture, inside the player's
    frame, so it shows in normal playback and in the Litloft full screen.
    - **Litloft controls.** The layer sits under the controls and the gesture overlay.
    - **Browser controls** (`playerUi === "browser"`). The layer is drawn over the picture,
      controls included.
    - **No outline** in the `<video>` element's own full screen, or in iPhone's native full
      screen.
    - **Layer properties.** The layer takes no pointer events and is `aria-hidden`. It
      follows the picture box when the player resizes, rotates or enters full screen.

#### F. The embed's picture layer (SPEC-ADDON-137, SPEC-CORE-135)

22. `LoftEmbedProps` gains an optional `pictureOverlay` (a React node).
    - **What an embed does with it.** An embed that supports the prop renders the node
      inside its own full-screen frame. The node fills the box its picture is drawn in (for
      YouTube, the iframe's box, which becomes the full-screen box in full screen), and it
      sits above the iframe.
    - **What an embed that ignores it does.** It draws nothing, as with any optional
      capability of `LoftEmbedProps`.
    - **Stacking.** When the embed draws its own controls (the Litloft-UI mode), the node
      sits under those controls, under its gesture overlay and under its poster image.
      When the provider's own controls are inside the picture (the YouTube-UI mode), the
      node sits over the iframe and so over those controls.
    - **Where the node lives.** The embed adds no wrapper that takes pointer events, and it
      does not re-create the iframe when the node changes.
23. The core's `.loft` player passes the outline layer of step 16 as `pictureOverlay` to
    every embed, without looking at the provider. Whether anything is drawn then depends
    only on find (which has a term only on the file page), on a usable `frame_size`, and
    on whether the embed renders the prop. Only media_import's YouTube embed renders it,
    and only YouTube `.loft`s have frame text with sizes. The layer computes the painted
    rectangle from its own box and the row's `frame_size`.
24. The media_import YouTube embed renders `pictureOverlay` in every UI mode, the
    YouTube-UI mode included, where the layer is drawn over YouTube's controls.

### 2. Failure cases

1. `video_frame_lines` cannot be read (an exception, or `lines_json` that is not valid
   JSON). Valid JSON of another shape (not a list, an element without a string `text` or
   without a quad) is case 2.
   - **Search.** The passage gets null `line_box`, `line_match` and `line_frame_url`. One
     warning per file per search request names the file id. The search answer is
     otherwise unchanged.
   - **Find.** The rows get no `boxes` and no `frame_size`. One warning names the file id.
     The answer is otherwise unchanged, as SPEC-ADDON-075 I6 does for picture lines.
2. The lines are not usable. This covers:
   - a segment re-read and then written by an older build;
   - a corrected or partly read video;
   - rows left by an older build's purge (SPEC-ADDON-134, item 3).

   The passage and the rows behave as if there were no lines.
3. The store step cannot get the image size for a segment. This cannot happen: the quads
   are normalised by that size, and a segment with unusable quads gets no row
   (SPEC-ADDON-134 item 2.2).
4. The large frame route fails (an ffmpeg timeout, an unreachable file, a 4xx or 5xx
   response), or returns an image of zero size. The slot stays on the whole frame
   (step 11). Nothing is retried by the row.
5. The file page opens with `t` and `find`, but the answer is not hits, or no row
   qualifies. No place is current, and the bar shows what it shows today.
6. A `t` of `0.000` (a segment at the very start, the usual place of a title slide): the
   player lands where it lands today for `t=0`. A native video and a `.loft` both treat
   0 as "no position" and may resume from the saved progress instead. Nothing in this
   change seeks, so there is no race; the outline appears when the playhead is in the
   segment. This is accepted.
7. The native video has not loaded its metadata (`videoWidth` is 0), or the embed has not
   laid out its box yet. Nothing is drawn until both are known.
8. The YouTube embed is playing an advertisement (`isInterrupted()`). Nothing is drawn
   until the advertisement ends.
9. The picture moves inside a segment (a camera pan, a scrolling terminal). The outline
   stays where the segment's opening frame had the line. This is accepted (decision 2);
   the segment closes when the text changes.
10. An embed that does not support `pictureOverlay` (any provider other than media_import's
    YouTube, or an older media_import): no outline is drawn for that `.loft`.

### 3. States

Per segment:

| State | Search row | Find row | Player |
|---|---|---|---|
| No `video_frame_lines` row (not re-read at rule 3, or an incomplete re-read) | whole frame, as today | no `boxes` | nothing |
| Lines present, but not usable | as above | as above | as above |
| Lines usable, and a keyword match overlaps a line | frame → crop (native only) | `boxes` | outlines while in the segment (native; a YouTube `.loft` needs `frame_size`) |
| Lines usable, but the match is vector-only | whole frame, link without `find` | — | — |
| Lines usable, but `frame_width` / `frame_height` NULL | as the third row, for native video | `boxes`, no `frame_size` | native: outlines; YouTube `.loft`: nothing |

A video moves between these states only through a frame read (the store step), a purge,
or an older build writing it. Nothing in this change writes a row.

Search row slot of a croppable passage: **frame** → **crop**, and **frame** → thumbnail →
icon (step 11). **crop** is final, and no transition goes back.

Player, while find is open on a video: **no outline** ↔ **outlines drawn**, by the
conditions in step 16. They are evaluated again on each time update, each change of the
current row or the answer, each resize, and each entry to or exit from the mini player.

### 4. Data read and written

| Store | Read / written | By |
|---|---|---|
| intelligence `video_frame_lines` | read; two columns added and written | search passages and find read it; the frame reader's store step writes it |
| intelligence `video_frame_texts` | read | search passages (already), find (already) |
| intelligence frame cache `frames/{file_id}/{ms}.large.webp` | written on a cache miss, read | the existing frame route, now also asked for large frames by result rows |
| core | nothing | — |
| browser | nothing stored | — |

Search and find write nothing.

### 5. External services

- **YouTube IFrame API**, in the browser, through media_import's embed: `getCurrentTime`,
  `getDuration` and the ad state, read through `MediaController`.
  - If they are slow or wrong (an ad, a stall), the outline follows what they report.
  - An interruption hides the outline.
  - This change sends nothing to YouTube.
- There is no other outside call. The large frame of a native video comes from local
  ffmpeg.

### 6. Authorization

Unchanged:

- Search answers only from the drives the viewer can open (`X-Lit-Drive`, through the core
  proxy).
- The frame route goes through the host's `file_access` pre-check.
- Find checks the drive and access of the requested file before it reads the file's lines
  (SPEC-ADDON-075 I7).

### 7. Effect on existing features

- **Search answer** (`/search` passages) and **the image-query answer**: three new fields.
  The core passage view, the image-query view and the MCP `semantic_search` tool read the
  answers; unknown fields are ignored by all of them.
- **Exact search, Ask, citations and the single-file question**: they read
  `video_frame_texts` only, and are unchanged.
- **Find in this file**: frame-text `scene` rows gain `boxes` and `frame_size`.
  - The picture outline layer (`ImageCanvas`) draws only on picture pages, so video rows
    never reach it.
  - The find list itself shows the same rows.
- **The passage view's 「このファイルの他の箇所 →」**: unchanged (SPEC-CORE-028 I9).
- **The frame reader**: the store step writes two more values per row. Which frames are
  read, the text, the chunks, the flags and the rule are unchanged (SPEC-ADDON-134 I1–I7).
- **The frame route**: unchanged. It now receives more requests for large frames.
- **Players**:
  - A layer is added inside `VideoPlayer`'s frame, and inside the media_import YouTube
    embed's frame.
  - The mini player box draws nothing (step 16).
  - The iOS app's native player and Picture in Picture draw nothing.
- **The `.loft` embed contract** (`LoftEmbedProps`): one new optional prop. Embeds that
  ignore it are unaffected. `docs/ADDON-DEVELOPMENT.md` records it.

### 8. Error behavior

- The viewer sees no error for any failure here.
  - A crop that cannot load leaves the whole frame (or the thumbnail, or the icon).
  - A place that cannot be drawn is not drawn.
- One warning is logged per file per request when `video_frame_lines` cannot be read in
  search or in find (failure case 1). Nothing else is logged.

### 9. User-visible behavior

- **Search results.** In the passage view, a keyword hit in a native video's frame text
  whose segment has usable lines first shows the whole frame, as today. Once the large
  frame has loaded, it shows the line cropped, with the time label over it.
- **Opening a result.** Clicking a keyword frame-text row whose excerpt holds a term
  opens the video at the segment's start, with the find bar open on that term (the
  inspector's 検索 tab, as `?find=` does today).
  - When the row has boxes, it is the current find place.
  - The line is outlined on the picture while the playhead is in its segment, playing or
    paused.
- **Stepping in find.** Stepping to another frame-text find row (next, previous, or a
  click) seeks there and outlines its line. Stepping to a transcript row removes the
  outline.
- **Without usable lines.** Everything looks as it does today, except that a keyword
  frame-text row now also opens the find bar and links to the exact start.
- **YouTube `.loft`.** It is outlined when its frame size is known, in full screen too,
  and over YouTube's own controls in the YouTube-UI mode.
- No new text, control or setting.

### 10. Non-functional

- **Transfer.**
  - One large frame (long edge at most 1280 px, WebP q80, typically 40–150 KB) per
    visible croppable row, loaded lazily.
  - It is cached by the browser, and on disk by the frame route.
  - A passage view shows at most 3 rows per file (`MAX_ROWS_PER_FILE`).
- **Server time.** A cache miss runs one ffmpeg extraction (15 s timeout), as the small
  frame does today. There is no new concurrency limit; the small frames already work this
  way.
- **Search latency.** One `video_frame_lines` read per keyword `screen_text` passage
  returned, looked up by `file_id` and times (indexed by `file_id`). There is no new read
  for any other passage.
- **Player.** The embed's time comes from the shared media clock, which adds no poller;
  the layer subscribes only while find has a current row with `boxes`, and re-renders
  alone.
- **Privacy.** No new data leaves the LAN.
- **Where geometry is measured.** jsdom lays nothing out, so these are measured on the real
  components in a real browser (`frontend/e2e-components/`):
  - the slot keeping 64×36 and 88×50 in the crop state, and the crop region drawn;
  - the quads at their fractions of the contain-fitted rectangle, for a letterboxed and a
    pillarboxed native video, and inside the Litloft full screen;
  - the layer sitting under the Litloft controls.

  The YouTube embed's layer is measured with a stub controller, not the real IFrame API.

## Touch points

- `addons/intelligence/app/database.py` — the migration adding `frame_width` and
  `frame_height` to `video_frame_lines`.
- `addons/intelligence/app/models.py` — the `VideoFrameLine` columns.
- `addons/intelligence/app/workers/frame_ocr.py` — the store step writes the frame size
  (SPEC-ADDON-134 I1, I6).
- `addons/intelligence/app/search.py` — `SearchPassage`, `_finish_passage`, and a lines
  reader for a segment.
- `addons/intelligence/app/schemas.py`, `addons/intelligence/app/routers/search.py`,
  `addons/intelligence/app/image_query.py` — the passage schema and its pass-through.
- `addons/intelligence/app/file_find.py` — `_frame_occurrences` gains `boxes` and
  `frame_size`.
- `addons/media_import/frontend/players/YouTubeEmbed.tsx` — renders `pictureOverlay`.
- `frontend/src/components/loft/types.ts` — `LoftEmbedProps.pictureOverlay`.
- `frontend/src/components/loft/LoftPlayer.tsx` — passes the layer.
- `frontend/src/components/VideoPlayer.tsx` — the native layer inside the player frame.
- A new shared outline-layer component under `frontend/src/components/player/`.
- `frontend/src/components/MiniPlayerContainer.tsx`, `frontend/src/hooks/useMiniPlayer.ts`
  — the mini state the layer reads.
- `frontend/src/lib/mediaClock.ts` — read by the embed layer (unchanged).
- `frontend/e2e-components/` — the geometry tests.
- `frontend/src/lib/searchMerge.ts` — the `SearchPassage` type.
- `frontend/src/lib/searchPassages.ts` — `passageHref` and the link term.
- `frontend/src/components/search/PassageList.tsx` — the crop in `PassagePicture`.
- `frontend/src/lib/fileFind.ts` — `FindRow.frame_size`, and reading it.
- `frontend/src/components/FileDetail/FileDetailContainer.tsx` and
  `frontend/src/components/FileDetail/find/useFindInFile.ts` — the initial current row
  from `t`. `FileDetailContainer` already receives `initialTime` from `RightPaneFile`.
  The collection surface (`FileDetailFullScreen`) has find disabled and is not touched.
- `docs/ADDON-DEVELOPMENT.md` — the new `LoftEmbedProps` capability.
- `docs/user-guide/` (the search page) and `docs/addons/intelligence.md` — what a
  frame-text hit shows.
- The submodule pointers `addons/intelligence` and `addons/media_import`.
- The agreed design: `docs/process/reviews/feature-frame-ocr-hit-place/design/`.
- Rules this change passes through:
  - `.claude/rules/design-decisions.md`: the drive boundary, and the addon discipline (no
    core-to-addon dependency; the core reads only generic answer fields and offers a
    generic embed capability);
  - `.claude/rules/backend-conventions.md`: migrations only add;
  - `DESIGN.md`: find marks.
- No protected path is edited.

## Invariants

I1. A `screen_text` passage has a non-null `line_box` exactly when four conditions hold:
it is keyword-matched; its file is not a `.loft`; its segment's lines are usable; and the
first occurrence of its folded highlight terms in the folded joined text overlaps a
non-empty line. Then `line_box` is the stored quad of the first such line, `line_match` is
the fractions of that line's code points the occurrence covers, and `line_frame_url` is
`/api/addons/intelligence/files/{id}/frame?t=<start with three decimals>&size=large`. Every
other passage, the image-query answer's included, has all three null. Every other field,
the order of the passages and their number are as without this change.

I2. A frame-text find row has `boxes` exactly when its segment's lines are usable (the
chunks rebuild from the joined text, and the merged text equals it) and its occurrence
overlaps at least one non-empty line. Then `boxes` holds exactly the overlapped lines'
quads, in line order, and is never an empty list. `frame_size` is present only on a row
with `boxes`, and only when both stored sizes are set. Every other row, `total`,
`truncated`, the order, the snippets and the offsets are as without the lines. A failure
to read the lines returns the answer without `boxes`.

I3. The store step writes, on every `video_frame_lines` row it writes, the pixel width and
height of the image the engine read for the segment's opening frame. Nothing else writes
them. The migration can run twice, and leaves existing rows' values unchanged.

I4. The slot of a croppable passage first shows the whole small frame. It shows exactly
the crop region of step 12 only after the large frame has loaded with a positive size,
and it never goes back. The time label is over both. When the large frame fails, the slot
keeps the whole frame. When the small frame fails before the crop is shown, the slot
shows the thumbnail and then the icon, and never the crop. A row that is not croppable renders exactly as before this change.

I5. A keyword `screen_text` passage with a link term links to
`?t=<start with three decimals>&find=<link term>`, where the link term is the term of the
first occurrence of its highlight terms in its excerpt. Every other passage, a keyword
`screen_text` passage with no link term included, links exactly as before this change.

I6. Opening a file with `find` and `t` makes current, on the first hits answer to that
URL query (a retry included), the first `scene` row with `boxes` whose `start` is within
0.001 of `t`, and no row otherwise, without seeking. A step the viewer requested before
that answer decides the current row instead. Opening with `find` alone still makes no
place current. A changed query never applies the rule.

I7. The player draws outlines only while all of these hold:
- find has a term, and its current row has `boxes`;
- the media time is in `[start − 0.5, end)` of that row;
- the media has not ended, and the time is below the known duration;
- the media is not interrupted, the player is not in the mini player box, and the native
  video is not in Picture in Picture;
- the painted rectangle is known.

It then draws the distinct quads of the rows that have the current row's `start` and
`end`: the current row's in the current style, and the rest in the mark style. They sit
at their fractions of the contain-fitted rectangle: native, `videoWidth` × `videoHeight`;
YouTube `.loft`, a `frame_size` of two positive finite numbers, and nothing without one.
In every other case it draws nothing.

I8. The outline layer takes no pointer events and is `aria-hidden`. With the Litloft
controls it sits under the controls and the gesture overlay. It follows the picture box
through resize and the Litloft full screen. Its time updates re-render neither the player
nor the embed, and never re-create the iframe. It changes no playback state, control,
seek or size. A video page with no qualifying row renders and plays exactly as before
this change.

I9. An embed that supports `pictureOverlay` renders it over its picture box, inside its
full-screen frame, in every UI mode: under its own controls, gesture overlay and poster in
the Litloft-UI mode, and over the iframe in the YouTube-UI mode. An embed without the prop
renders exactly as before this change. The core passes the prop without naming a
provider.

I10. Search, find and the result rows write nothing to the core DB or the intelligence
DB.

## Revises

SPEC-CORE-048 I10. A `text_content` match on a video becomes a `screen_text` passage with its segment's `start` and `end`, `frame_url` at `floor(start)`, and a link to `?t=<floor(start)>`, or, for a keyword-matched passage with a link term, to `?t=<start with three decimals>&find=<link term>` (SPEC-CORE-134), shown as 「mm:ss」 over 「画面内の文字」 with its excerpt; no video becomes a `text` or `picture_text` passage, search by image returns no video, a video's text hit in `/search/exact` carries its segment's `start_time` and `end_time`, and no detailed-summary citation of a video points at its `text_content` rows; Ask's context for a video places its frame text after the transcript snippets, or first when only frame text matched, an Ask citation of frame text carries its segment's `m:ss`, and the single-file question gives it `{"seconds": start_time}`.
SPEC-CORE-040 I11. Each row links to its file at `?t=<floor(start)>` for utterances, scenes and screen text, except that a keyword-matched screen-text row with a link term links to `?t=<start with three decimals>&find=<link term>` (SPEC-CORE-134), `?page=` for pages, `?section=` for sections, and with no locator for picture text and text.
SPEC-CORE-040 I18. A row's picture is `frame_url` when set, replaced by the crop of its large frame once that has loaded for a croppable screen-text row (SPEC-CORE-134); when it is unset or fails to load, the file's thumbnail; when that is missing or fails, the file-type icon.
SPEC-CORE-028 I9. `/files/{id}?find=<text>` opens the file with the bar open on that query after the canonical redirect, with no place current unless `t` is also given and the first hits answer has a `scene` row with `boxes` at that time (SPEC-CORE-135), and moving to another file closes the bar and drops `find`; the passage view's 「このファイルの他の箇所 →」 carries the longest keyword-matched highlight term of the group, and no `find` when the group has no keyword passage.
SPEC-ADDON-075 I5. A `picture_text` find row has `boxes` exactly when the picture's lines are usable (the stored picture text and the text merged from its `fts_text_content` chunks both equal the lines' texts joined by `\n`) and at least one non-empty line is overlapped by its occurrence; then `boxes` holds the quads, in line order, of exactly the overlapped lines, with a touch of an edge or a `\n` overlapping nothing. A frame-text `scene` row has `boxes` as SPEC-ADDON-136 states. A row of any other kind, and a row of a picture with unusable or no lines, has no `boxes`, and `boxes` is never an empty list; a corrected picture's rows therefore have none, and after a restore puts the machine text back they have them again.
SPEC-ADDON-075 I6. A find answer with the lines present equals the answer without them in every field except `boxes` and, on frame-text rows, `frame_size`: the same `total`, `truncated`, rows, order, snippets and offsets; a find request writes nothing; and a failure to read the lines returns the answer without `boxes` or `frame_size` rather than an error.

## Checked, no action

- **A crop for a YouTube `.loft` search row**: not done (decision 4). Its row has no frame
  today, and a YouTube frame is taken through the embedded player, one at a time.
- **A crop for a vector-only (semantic) frame-text hit**: no line is known to have caused
  the match, so the row keeps the whole frame and the link has no `find`.
- **Choosing the line inside the passage's own chunk**, rather than the segment's first
  occurrence: a segment's text is split into chunks only above 1000 characters, and in
  every other case both give the same line. Not done.
- **The crop line and the link term can differ** when a query has several terms. The crop
  takes the first occurrence in the segment, and the link takes the first occurrence in
  the excerpt. The excerpt is windowed around the chunk's first occurrence, so the two
  coincide in a single-chunk segment. Not resolved further.
- **The longest highlight term as the link term**: `highlight_terms` holds each term's
  hiragana and katakana variants at equal length, so "the longest" picks a variant that
  may not be on the screen, and find then opens on 「見つかりません」. The link term is
  therefore taken from an occurrence in the excerpt.
- **Outlining inside the crop**: the crop is centred on the line, and at 88×50 an outline
  would cover the words (design).
- **Seek-bar marks and crops in the find list**: out of scope (decision 1).
- **Treating rows that share a segment as one place, and per-line spans**: out of scope
  (SPEC-ADDON-134 Checked, no action).
- **Using the find term for the crop**, instead of the passage's highlight terms: the crop
  is drawn before find runs, from the search answer alone.
- **The size of a native video from `frame_width` / `frame_height`**: the `<video>`
  element reports its own size, which is what it paints. The stored size is used only
  where the player cannot report it.
- **Re-reading native videos to fill the new columns**: not done. A native video does not
  need them, and every native video is being re-read at rule 3 anyway. The 47 YouTube
  `.loft`s get them when the operator reindexes them (SPEC-ADDON-134 item 7), if that runs
  after this change ships. Otherwise each one needs one more reindex.
- **The collection surface** (`FileDetailFullScreen`, `surface="collection"`): find is
  disabled there, so `t` with `find` does nothing new.
- **Outlines in the mini player**: hidden (step 16). The box is 320×180, and the viewer
  has left the page whose find put them there.
- **The outline in the `<video>` element's own full screen and in iPhone's native full
  screen**: the page cannot draw there (decision 6).
- **A tolerance after `end`**: none. The segment ends when the next read frame shows other
  text, so an outline lingering past `end` would sit over different text.
- **A sharper source than the 1280-px large frame**: the region is at least 320 px wide in
  a 1280-px frame, which fills an 88-px slot at more than 2× density.
- **A wider slot for frame-text rows**: the slot keeps the size every passage row has, so
  the rows stay aligned. The crop is sized so the words are readable at that size.
- **Cropping to the whole line**: a long line fitted into 88 px leaves its words about
  4 px tall, so the region follows the line's height instead.
- **A concurrency limit on large-frame extraction**: the small frames have none either.
  Revisit if a passage view is seen to stall the backend.
