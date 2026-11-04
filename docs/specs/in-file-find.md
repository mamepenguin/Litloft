# Find in this file, and step through where it occurs

SPEC-ID: SPEC-ADDON-061
SPEC-ID: SPEC-CORE-028

Approval:

## Summary

On a file's page, the viewer types a word and gets every place it occurs in that one
file. The places come from what the intelligence addon has already indexed:

- the spoken words;
- the text on screen in a video;
- the body text of a PDF, EPUB, Office or text file;
- the text in a picture.

The places are listed in the order they occur in the file (for example 「03:20 発話」,
「04:05 画面内の文字」, 「08:40 発話」). Choosing one moves the player or viewer there: a
video or audio file seeks to that time, and a PDF goes to that page with the word marked.
The viewer can step through the places with next and previous, and narrow them to one
kind.

The browser's own find cannot do this, because a transcript that is not on screen, and
the text inside a picture or a PDF page, are not in the page's DOM.

The change has two parts:

- The addon gains one file-scoped route that returns one row per occurrence
  (SPEC-ADDON-061).
- The core gains the find bar, the list of places, the jump to each place, and marking
  in the PDF, Markdown and text viewers (SPEC-CORE-028).

The 「このファイルの他の箇所 →」 link in the search page's Passages view starts pointing
here.

OCR of video frames and of scanned PDF pages does not exist yet. That is B2b, and it is
not part of this change.

The visual design is the Design Artifact 「資料内検索 デザイン案」,
https://claude.ai/artifact/JtakBpa3hyYPr8iFmYQfG3, approved with this spec. Where the
artifact and this text differ, this text wins.

## Required items

### 1. Normal flow

#### Addon: `GET /files/{file_id}/find?q=<term>` (SPEC-ADDON-061)

1. **The core's addon proxy checks, in order** (`addon_proxy.py`). The addon reads the
   drive from the header it forwards.
   1. If `X-Lit-Drive` names a drive the viewer cannot reach, the answer is 403.
   2. The route is matched.
   3. A missing `X-Lit-Drive` is answered 400, because the addon's scope is `drive`.
   4. `pre_check: file_access` on `file_id`: a file the viewer cannot open is 404.
   5. The route's `addon_feature: search`. It requires the drive to equal the file's
      drive, else 404, and then the drive's `search` feature to be on, else 404.
2. **Query.** `q` is stripped and must be 1–200 characters, else 422 (`_EXACT_Q_MAX`,
   as `/search/exact`). Matching is a plain substring with ASCII-only case folding,
   exactly as `/search/exact` matches:
   - `instr(lower(col), lower(:q))` in SQL;
   - `_ascii_lower` in Python.

   There is no NFKC normalisation and no tokenising.
3. **Sources.** The addon reads one file's rows only, under `f.file_id = :file_id AND
   f.drive = :drive AND f.active = 1`. It reads three sources.
   - **Text.** The file's `fts_text_content` chunks, grouped by unit:
     - a PDF page;
     - an EPUB section (`page` on an EPUB);
     - the whole text, when `page` is null.

     Within a unit, chunks are taken in `chunk_index` order, and each chunk is merged
     onto the text built so far:
     - The overlap is the longest suffix of the text so far that equals a prefix of the
       chunk, of at least 20 and at most 200 characters, and at most the chunk's
       length.
       - 200 is the larger of the two replays the extractors use today: PDF, EPUB,
         text and HTML replay `indexing.text_chunking.overlap` (default 80), while
         Office and picture OCR replay `chunk_text`'s default of 200.
       - A true replay is that many characters less the whitespace `strip()` removes,
         so it is far above 20. A suffix–prefix match shorter than 20 is taken as a
         coincidence, as between two Office slides that were chunked separately.
     - The chunk is appended without that overlap.
     - With no overlap of 20 or more, the chunk is appended after a single `\n`.

     This rebuilds each unit's text once.
   - **Transcript.** The file's `fts_transcripts` rows in `chunk_index` order. These
     are the rows `/search/exact` matches, so the two agree on the same file. Each row
     is joined to `transcript_chunks` for `timestamp_start` and `timestamp_end`.
     Transcript chunks do not overlap: they are cut from Whisper words by duration.
     Each chunk is its own unit. A row with no `transcript_chunks` match, or with a
     null `timestamp_start`, is skipped and not counted, as the passage view drops an
     utterance with no start.
   - **Screen text.** Read only when the drive's Visual Index is open, the same
     `_visual_index_open` test `/search/exact` uses. It is the `visible_text` of the
     active run's `video_visual_scenes`, each scene its own unit. `scene_label` is never
     searched: it is a description, not text on screen.
4. **Rows.** Every occurrence of the folded term in a unit becomes one row. The search
   resumes at p + len(term) after a match at position p, so occurrences do not overlap.
   An occurrence that would span two units (two pages, two transcript chunks, two
   scenes, or a `\n` join) is not found. A row has these fields:
   - `kind`: `utterance`, `scene`, `page`, `section`, `picture_text` or `text`. A text
     row is classified as the passage view classifies it (`search.py`, the
     `text_content` branch):
     - an EPUB with a page → `section`;
     - otherwise, a page → `page`;
     - an image file → `picture_text`;
     - otherwise → `text`.
   - `start` (seconds, on `utterance` and `scene`): the transcript chunk's
     `timestamp_start`, or the scene's `start_time`.
   - `end`: the chunk's `timestamp_end`, or the scene's `end_time`; either may be
     null.
   - `page`: on `page` rows. `section` and `section_title`: on `section` rows, with the
     title from `document_sections`.
   - `ordinal`: the 1-based number of this occurrence among the term's occurrences in
     its unit.
   - `snippet`: the unit's text from 80 characters before the occurrence to 80 after
     it, with 「…」 where it is cut (`_snippet` in `exact_search.py`).
   - `match_start` and `match_length`: the term's place in `snippet`, so the client
     marks it without matching again.
5. **Order.** Rows are ordered by position:
   - media: by `start`; at an equal `start`, `utterance` before `scene`; then by
     `ordinal`;
   - documents: by `page` or `section`, then `ordinal`;
   - text and picture text: by `ordinal`.

   A file yields only one of these families.
6. **Response.** `{query, indexed, total, truncated, rows[]}`:
   - `total` counts every occurrence.
   - `rows` is the first 2000 rows in the order above.
   - `truncated` is true exactly when `total` is greater than 2000.
   - `indexed` is true when the file has any searchable index: `text_indexed`,
     `whisper_indexed` or `ocr_indexed` on its `indexed_files` row, or an active Visual
     Index run while the drive's Visual Index is open. A file with no `indexed_files`
     row answers `indexed: false` with no rows.

#### Core (SPEC-CORE-028)

1. **The button.** On the file page (`RightPaneFile` → `FileDetailContent` with
   `surface="file"`), the page row gets a find button. On any other surface, such as
   the `collection` surface of `FileDetailFullScreen`, there is no button and no
   shortcut, even where that surface rides `FileDetailShell`. It has the lucide `Search` icon and the accessible name
   「このファイル内を検索」. It is shown when the drive has the intelligence addon
   enabled, read as `isSemanticSearchAvailable` reads it.
2. **Opening.** The bar opens from:
   - the button;
   - Cmd+F on macOS, Ctrl+F elsewhere (`ctrl+f` in `normalizeKey`);
   - `?find=` (step 9).

   Opening, or pressing the shortcut while the bar is already open, does all of the
   following:
   - focuses the input and selects its text;
   - selects the 「検索」 tab;
   - opens the desktop inspector if it is closed, or raises the phone sheet to half if
     it is below half. The inspector is opened as an in-memory override:
     `inspectorOpenStore`'s persisted per-drive preference is not written by the bar,
     so a reload or another file shows the inspector as the viewer last left it
     themselves;
   - remembers the inspector's open state, the sheet's state and the selected tab as
     they were before the bar was opened.

   The shortcut:
   - It is registered only on the desktop layout (`!isMobile`, as `FileDetailShell`
     registers `ctrl+\`), and only when the button is shown.
   - It goes through `useShortcuts` with its default editing rule. So it is not
     intercepted while focus is in the bar's input, where a second press opens the
     browser's own find. Nor is it intercepted in any other input, textarea or
     contenteditable (the Markdown editor, the comment box, the metadata editor, the
     PDF page input).
   - It is not intercepted while any of these is open:
     - an overlay registered with `blocksLower`: the PDF full-screen viewer, the EPUB
       full screen, the image gallery;
     - a full screen: `document.fullscreenElement` is set, or the player is in its
       pseudo-fullscreen (`useFullscreen`);
     - a modal: an element with `aria-modal="true"` is in the document, such as
       ConfirmDialog, MoveDialog or the shortcut cheat sheet.

     A `find-shortcut` from the EPUB frame is ignored under the same conditions.
3. **The EPUB reader frame.** The frame forwards the shortcut, because its keydown never
   reaches the parent document.
   - The parent tells the frame whether to intercept, as `interceptFind: boolean` in the
     `open` message it already sends and in a new `set-find-intercept` message when the
     answer changes. The value is true exactly when the shortcut is registered on the
     parent and the EPUB full screen is not open. The frame's `open` validation accepts
     the new field, and an `open` without it means false.
   - While it is true, the frame handles a keydown of `f` with the platform's primary
     modifier, and without Shift or Alt. The primary modifier is `metaKey` when
     `/Mac|iPhone|iPad|iPod/` matches the frame's `navigator.platform`, else `ctrlKey`.
     This is `isMacPlatform()` in `shortcuts.ts`, which `normalizeKey` uses. The frame calls `preventDefault()` and posts `find-shortcut`
     to the parent, and the parent opens the bar as in step 2.
   - While it is false, the frame does nothing with the key and the browser's find
     opens.
4. **The bar.** It sits at the top of the canvas, under the page row, and holds:
   - the input, capped at 200 characters;
   - the count: 「n / N」 when a place is current, 「N 件」 when none is, empty while
     fetching or when there is no answer;
   - previous and next buttons (lucide `ChevronUp` / `ChevronDown`);
   - a close button (lucide `X`).

   Under the input, a `role="status"` line carries the messages of Failure cases.
5. **Fetching.** Typing fetches `/api/addons/intelligence/files/{id}/find?q=` with
   `X-Lit-Drive`.
   - The fetch starts 300 ms after the last keystroke.
   - Each keystroke immediately clears the current place, the count, the list's rows
     and every find mark, and aborts any fetch in flight.
   - An answer to anything but the latest query is discarded.
   - An empty or whitespace-only input clears everything without a fetch.
   - **IME composition.** While a composition is in progress (`isComposing`, guarded
     as `useImeKeyGuard` guards shortcuts):
     - an input change neither clears nor schedules a fetch;
     - Enter, Shift+Enter and Escape do only what the IME does with them.

     When the composition ends, the committed value is handled as a keystroke.
   - Enter or Shift+Enter while the fetch is pending or in flight starts it at once if
     it has not started. When the answer arrives, it makes the first row (Enter) or
     the last row (Shift+Enter) current. If several presses came in that time, only the
     last one counts.
6. **The 「検索」 tab.** A core inspector tab, listed while the bar is open, placed right
   after Info. On the phone layout the inspector is the bottom sheet, as for every tab.
   - `InspectorShell` keeps its selected tab in its own state, and is mounted twice:
     once for the desktop pane and once for the phone sheet. It gains two things:
     - a request to select a tab, which both instances follow;
     - a report of the tab the viewer has selected.
   - The tab remembered on opening is the one reported by the visible instance: the
     pane on the desktop layout, the sheet on the phone layout.
   - **Chips.** At its top are the kind chips: 「すべて」, 「発話」, 「画面内の文字」,
     「本文」 and 「画像の文字」, each with its count.
     - 「本文」 covers `page`, `section` and `text`.
     - A chip is shown only for a category present in the answer.
     - No chips are shown when fewer than two categories are present. This counts chip
       categories, not raw kinds.
   - **Rows.** Each row shows a locator and the snippet, with
     `snippet[match_start, match_start + match_length)` marked `bg-highlight-bg`. The
     locator is:
     - 「mm:ss」 (「h:mm:ss」 at an hour or more) over 「発話」, for `utterance`;
     - 「mm:ss」 over 「画面内の文字」, for `scene`;
     - 「p. N」, for `page`;
     - the section title, else 「第 N 節」, for `section`;
     - 「画像の文字」, for `picture_text`;
     - 「本文」, for `text`.
   - **Paging.** The list renders its first 200 rows and adds 200 more each time it is
     scrolled near its end, or when stepping reaches a row not yet rendered.
   - **Truncation.** When `truncated` is true:
     - the count reads 「2000+ 件」, or 「n / 2000+」 with a place current;
     - a filtered count and every chip's count get the same 「+」;
     - the list ends with 「最初の 2000 件を表示しています」.
7. **Filtering.** Choosing a chip filters the list and the count to that category,
   keeping the order. 「すべて」 removes the filter. When the current place falls
   outside the filter, nothing is current until the next step.
8. **Stepping.** Choosing a row, or stepping to it, makes it current.
   - Enter in the input goes to the next visible row and Shift+Enter to the previous
     one. The buttons do the same.
   - Stepping wraps from the last visible row to the first, and back.
   - With nothing current, next goes to the first visible row and previous to the last.
   - The current row is scrolled into view in the list.

   Then the page goes there, depending on the row's kind:
   - `utterance` / `scene`: `MediaController.seek(start)`. Playing or paused stays as
     it was.
   - `page`: `DocumentController.goTo({page})`, and the page's current mark (step 10).
   - `section`: `DocumentController.goTo({section})`. Nothing is marked inside the
     book.
   - `text`, where a `MarkdownPreview` or a loaded, decorated `TextLines` shows the
     file: the current mark (step 10). This holds wherever they are drawn:
     - in the core viewer (`FilePreview` → `MarkdownFileViewer` / `TextPreview`);
     - inside the knowledge addon's editor, in its preview mode and the preview half
       of its split mode.
   - `text` anywhere else, and `picture_text`: nothing moves; the row only becomes
     current. "Anywhere else" means:
     - the editor's edit mode, or the edit half of split mode;
     - a `TextPreview` not yet loaded, or past the `TextLines` decoration limits;
     - the Office excerpt;
     - HTML.
9. **Marks.**
   - **When.** While the bar is open and the answer has rows, every occurrence of the
     term carries the plain find mark, matched with the same ASCII-only folding as the
     addon:
     - in each pdf.js text layer the inline PDF viewer has rendered, including pages
       the viewer turns to by hand;
     - in every rendered `MarkdownPreview`;
     - in every loaded, decorated `TextLines`.
   - **How it reaches the viewers.** The term and the current row reach these viewers
     through a core React context that the file page provides around its whole shell (canvas and inspector).
     `MarkdownPreview` and `TextLines` read it themselves. The knowledge editor, which
     renders those same core components inside its `knowledge-edit` slot, therefore
     needs no change: the slot is rendered inside the provider.
   - **Re-applying.** Like the citation mark, find marks are re-applied after
     `MarkdownPreview` resets its HTML, so a re-render does not drop them.

     Nothing is marked in the PDF full-screen viewer, the Markdown editor or the EPUB.
   - **Spans.** A match that spans several text-layer spans or DOM text nodes is marked
     in each of them.
   - **Citations.** Find marks are separate elements from the `?highlight=` citation
     mark (`ask-citation-highlight`, `useHighlightPassage`), and neither removes the
     other.
   - **Selection.** Text selection and copy over a marked page are unchanged.
10. **The current mark.** When a `page` or `text` row becomes current, one occurrence in
    that unit's rendered text gets the current mark and is scrolled into view. Which
    occurrence:
    1. the occurrence whose 20 characters before and 20 after, folded the same way and
       with whitespace runs collapsed to one space, equal the snippet's text at the same
       offsets from `match_start` (fewer where the snippet is cut); if several match,
       the one nearest in order to `ordinal`;
    2. else the occurrence numbered `ordinal`, if the unit has that many;
    3. else the first occurrence;
    4. else none, and the page or text is still shown.

    The current mark is the plain mark plus a 2px outline in `--accent`, as in the
    Design Artifact. It uses no new colour token.
11. **Closing.** Escape in the input, or the close button, closes the bar. Closing:
    - removes every find mark;
    - unlists the 「検索」 tab;
    - selects the remembered tab, if 「検索」 was still selected; otherwise the tab the
      viewer chose stays;
    - restores the remembered inspector open state and sheet state, unless the viewer
      opened or closed the inspector, or moved the sheet, while the bar was open.

    Closing leaves the player time, the play state, the page and the scroll where they
    are. Closing also removes `find` from the URL with a history replace, so a reload
    after closing does not reopen the bar. Reopening keeps the last query and fetches
    again.
12. **Changing files.** Moving to another file closes the bar as step 11 does,
    restoring the remembered layout, and clears its query, filter and current place. This covers next or previous file, choosing another file
    in the folder, and a new `fileId` in the two-pane layout. `find` joins
    `FILE_LOCATION_PARAMS` in `useSelectedFile.ts`, so `selectFile` strips it as it
    strips `t`, `page`, `section` and `highlight`.
13. **`?find=`.** `/files/{id}?find=<text>` opens the page with the bar open, the query
    in it and the answer listed, with no place current. The file opens where it would
    have opened without `find`.
    - `find` is added to `CARRIED_QUERY_KEYS`, so it survives the canonical redirect.
    - The value is stripped and cut to its first 200 characters.
    - A value that is empty or whitespace-only after stripping is ignored, and so is any
      value on a drive where the button is not shown.
14. **The passage view's link.** 「このファイルの他の箇所 →」 links to
    `/files/{id}?find=<term>`. `<term>`, URL-encoded, is the longest of the
    `highlight_terms` of the group's passages whose `keyword` is true, hidden passages
    included. At equal length it is the one in the earliest passage. When no passage of
    the group has `keyword` true, the link is `/files/{id}` with no `find`, as today.
    Passing the whole query is not used: the passage view matches by meaning, find by
    exact substring, and a multi-word query would often open on 「見つかりません」.

### 2. Failure cases

- **Not available.** The addon is not installed or not enabled for the drive. The
  button is not shown, Cmd/Ctrl+F is not intercepted (the EPUB frame is told
  `interceptFind: false`), and `?find=` is ignored. The browser's find works as before.
- **Unavailable.** The drive's `search` feature is off, the file is not one the viewer
  can open, or the drive was locked while the page was open. These answer 404 or 403,
  and the status line shows 「このファイルの中は検索できません」. The bar stays open and
  the shortcut keeps opening it.
- **Bad request.** An empty or too-long `q` answers 422, and a missing `X-Lit-Drive`
  400. The client never sends either: it fetches only non-empty stripped input of at
  most 200 characters, always with the header. Either one, if it happens, is shown as
  a failure.
- **Not indexed.** The answer has `indexed: false`. The status line shows
  「このファイルはまだ検索用に読み込まれていません」, never 「見つかりません」.
- **No hits.** `indexed: true` and `total: 0`: 「見つかりません」.
- **Too many.** `truncated` is true: the 「+」 counts and the trailing line of step 6.
- **Failure.** The addon is down or times out (proxy 502/504), answers 500, answers 400
  or 422, or the network fails. The status line shows 「検索できませんでした」 with a
  「再試行」 button, which fetches the same query again. No rows are shown, and in
  particular no earlier answer's rows.
- **The rendered text differs from the stored text.** Step 10's order of fallbacks
  applies. Nothing errors.
- **Viewer not ready.** A seek or page jump requested before the viewer is ready goes
  through the controllers' existing behaviour: `MediaController.seek` and
  `DocumentController.goTo` already apply on readiness, for the passage view and the
  chapters. A page's marks are applied when its text layer renders.

### 3. States

- **Bar.** Closed or open.
  - Closed → open: the button, Cmd/Ctrl+F, `?find=`, or `find-shortcut` from the EPUB
    frame.
  - Open → closed: Escape, ×, or changing files.
- **Query, while open.**

  | State | Rows, count, current place, marks | Next / previous | 「再試行」 |
  |---|---|---|---|
  | empty | none | no effect | absent |
  | pending (debounce or in flight) | none | queued, as in step 5 | absent |
  | answered: not indexed | none | no effect | absent |
  | answered: no hits | none | no effect | absent |
  | answered: hits | rows, count, marks; current place as chosen | steps | absent |
  | unavailable (404/403) | none | no effect | absent |
  | failed | none | no effect | present |

  - Every keystroke moves any state to pending, or to empty for empty input.
  - 「再試行」 moves failed to pending.
  - Unavailable is left only by a keystroke, by closing, or by changing files.
  - No state other than "answered: hits" shows a row, a count, a current place or a
    mark. A current place or a mark never survives into pending.
- **Current place.** None or one visible row. A new answer or a keystroke sets it to
  none. A filter that hides it sets it to none.
- **Filter.** A category or 「すべて」. It resets to 「すべて」 on each new answer.
- **Remembered layout.** The tab, inspector and sheet state captured on opening. It is
  cleared on closing.

Nothing persists across a file change or a reload, except a `?find=` in the URL.

### 4. Data read and written

- **Read, intelligence `search.db`:**
  - `indexed_files`;
  - `fts_text_content`;
  - `document_sections`;
  - `fts_transcripts`, `transcript_chunks`;
  - `video_visual_scenes` and the active Visual Index run.
- **Read, the core DB,** through the proxy's existing drive, file-access and policy
  checks.
- **Written: nothing.** No core table, addon table or cache is written, and there is no
  watch history beyond the existing page-open POST.

### 5. External services

None. The addon reads its own SQLite DB and calls no LLM and no outside service. A slow
or failed addon is handled under Failure cases; the proxy timeout is 30 s, as on
`/search/exact`.

### 6. Authorization

- **The core proxy** applies the checks of addon step 1, in that order:
  - the drive is accessible (403);
  - the file can be opened (404);
  - the drive equals the file's drive (404);
  - the `search` feature is on (404).

  A locked file therefore gives no existence leak.
- **The addon** adds `f.drive = :drive AND f.active = 1` to every query, so a missing or
  trashed file has no rows.
- **Scene rows** also need the drive's Visual Index to be open.

### 7. Effect on existing features

- **`/search/exact` and the MCP tool `search_exact`** are unchanged. The new route reuses
  `_ascii_lower`, `_snippet` and `_visual_index_open` as they are. The `text_content`
  kind branch of `search.py` may be factored into a helper, provided the passage view's
  kinds stay exactly as they are.
- **The passage view's 「このファイルの他の箇所 →」** gains `?find=` per core step 14.
  This revises SPEC-CORE-040 I16 (see Revises), and the existing tests that assert a
  bare `/files/{id}` change with it.
- **`CARRIED_QUERY_KEYS` and `FILE_LOCATION_PARAMS`** each gain `find`.
- **Cmd/Ctrl+F** on the desktop file page of a drive with the addon no longer opens the
  browser's find on the first press. Everywhere else it is unchanged.
- **The PDF viewer, `MarkdownPreview` and `TextLines`** gain find marks. Their
  citation mark, text selection, copy and the `TextLines` decoration limits are
  unchanged.
- **The EPUB reader frame** gains `interceptFind` on `open`, one incoming message
  (`set-find-intercept`) and one outgoing message (`find-shortcut`). Its page turns,
  other keys and other messages are unchanged.
- **The inspector** gains a core tab. Its rules still hold:
  - "One tab is no strip": a file with only Info shows a strip while the bar is open,
    because it then has two tabs.
  - "A tab with nothing to show is not a tab": the tab is listed only while the bar is
    open.

  The tab's label is a core message. Its content knows the addon by name only through
  the find client, as `semanticSearch.ts` does (Touch points, rules).

### 8. Error behavior

- **What the user sees.** The status line shows the texts given in Failure cases, in a
  `role="status"` region, so a screen reader hears them.
- **What is logged.** The addon logs nothing new for a 404, 422 or empty result. An
  unexpected exception in the route is logged by FastAPI's handler as today and answers
  500, which the client shows as a failure.

### 9. User-visible behavior

- **Opening.** The find button appears in the page row, on files in drives where
  intelligence is enabled. Cmd/Ctrl+F opens the bar on the desktop file page,
  including from inside an EPUB. A second press with the input focused opens the
  browser's find.
- **The bar and the tab.** The bar, the 「検索」 tab and the chips, with the texts above,
  as in the Design Artifact. Japanese and English are both in `messages-core`.
  Opening the bar opens the inspector, or raises the sheet, and closing puts it back.
- **Order.** The order of places is their order in the file. Utterances and screen text
  are interleaved by time.
- **Jumping.** Choosing a place moves the player or viewer as in step 8. Nothing starts
  playing.
- **The A3 link** opens the file with the bar open on the term that matched there.
- **The user guide** gains a section on finding inside a file. It says:
  - what is searched;
  - that only already-indexed content is found (no OCR of video frames or scanned PDF
    pages yet);
  - that matching is exact text, with case ignored for Latin letters only;
  - that EPUB goes to the section only;
  - that Office and picture text are listed but cannot be jumped to.
- **`keyboard-shortcuts.md`** gains Cmd/Ctrl+F, Enter, Shift+Enter and Escape for the
  find bar.

### 10. Non-functional

- **Size.** At most 2000 rows per answer, with snippets of about 160 characters. That
  is about 1.2 MB of JSON for Japanese text. The row cap is the bound; no byte limit is
  set beyond it.
- **Server time.** The route reads one file's rows. A 600-page PDF is about 1,500
  chunks, and a 3-hour video is about 1,000 transcript chunks plus scenes. Merging and
  scanning that must answer in under 1 s on the production Mac mini.
- **Client time.** On a 2000-row answer:
  - rendering the list's first 200 rows and the marks of the rendered pages must not
    delay typing;
  - a keystroke must appear in the input within one frame of the previous one.

  R-5 measures both on the largest PDF and the longest transcribed video in the test
  data.
- **Concurrency.** The route only reads, through `get_search_db_read`. A fetch in
  flight is aborted by the next keystroke.
- **Privacy.** Nothing leaves the LAN, and the query is not stored.

## Touch points

**Addon** (the intelligence repository):

- `addons/intelligence/app/routers/` — a new file-scoped route module, for example
  `file_find.py`, registered in the app.
- `addons/intelligence/app/` — a new module beside `exact_search.py` for the per-file
  scan and the overlap merge. It reuses `_ascii_lower`, `_snippet`,
  `SNIPPET_CONTEXT_CHARS` and `_visual_index_open`, which are not changed.
- `addons/intelligence/app/search.py` — the `text_content` kind branch, which is reused
  or factored out without changing its results.
- `addons/intelligence/manifest.json` — one route, `/files/{file_id}/find`, `GET`, with:
  - `pre_check {type: file_access, param: file_id}`;
  - `addon_feature: search`;
  - `response_filter: null`;
  - `timeout: 30`.
- `addons/intelligence/tests/` — the route's tests.
- `docs/addons/intelligence.md` and `docs/reference/api.md` (core repository) — the
  route.

**Core proxy:**

- `backend/app/routers/addon_proxy.py` — not edited. The route goes through its existing
  drive, `file_access` and `addon_feature` handling. This is a HIGH risk zone, read
  only.

**Core frontend:**

- `frontend/src/lib/` — a new find client beside `semanticSearch.ts`.
- `frontend/src/lib/canonicalFileUrl.ts` — `find` in `CARRIED_QUERY_KEYS`.
- `frontend/src/hooks/useSelectedFile.ts` — `find` in `FILE_LOCATION_PARAMS`.
- `frontend/src/components/FileDetail/` — the new find bar and tab (Container/Presenter,
  per `frontend-conventions.md`), plus the existing files that host them:
  - `FileDetailChrome.tsx` (the button);
  - `FileDetailContainer.tsx`, `FileDetailPresenter.tsx`, `FileDetailCanvas.tsx`;
  - `ShellLayout.tsx`, `inspector/tabs.ts` and `inspector/InspectorShell.tsx` (the
    「検索」 core tab, the select request and the selection report).
- `frontend/src/components/FileDetailShell.tsx` — the shortcut registration, and the
  inspector and sheet state that opening and closing change and restore.
- `frontend/src/components/FileDetailContent.tsx` and
  `frontend/src/components/folder/RightPaneFile.tsx` — read `?find=` and pass it down.
- `frontend/src/components/PdfPreview.tsx`, `frontend/src/lib/documentController.ts`
  and `frontend/src/lib/pdfController.ts` — find marks on the text layer, and the
  current mark.
- `frontend/src/components/MarkdownPreview.tsx`, `frontend/src/components/TextPreview.tsx`
  and `frontend/src/components/TextLines.tsx` — find marks, read from the new core
  context.
- `addons/knowledge/frontend/Editor.tsx` — read, not changed. It renders the core
  `MarkdownPreview` and `TextLines` inside the `knowledge-edit` slot, so the context
  reaches them there.
- `frontend/src/hooks/useFullscreen.ts` and the overlay registry — read, for the
  shortcut's suppression.
- `frontend/src/hooks/useHighlightPassage.ts` — read, so that find marks and citation
  marks coexist. It is not changed.
- `frontend/src/components/epub/`, `frontend/src/lib/epubReaderChannel.ts` and
  `frontend/public/epub-reader/` — `interceptFind`, `set-find-intercept` and
  `find-shortcut`.
- `frontend/src/lib/shortcuts.ts` and `useShortcuts` — the `ctrl+f` binding.
- `frontend/src/components/search/PassageList.tsx` and `frontend/src/lib/searchPassages.ts`
  — the link's `?find=`.
- `frontend/src/app/globals.css` — the find mark and current-mark classes, built from
  `--highlight-bg` and `--accent`, with no new token.
- `frontend/src/messages-core/ja.json` and `en.json` — new keys.

**Docs:**

- `DESIGN.md` §6 — a "Find in file" entry.
- `docs/user-guide/` (the file page) and `docs/user-guide/keyboard-shortcuts.md`.

**Rules passed through:**

- `design-decisions.md`:
  - the drive boundary: the route is single-file and single-drive;
  - locked → 404;
  - addon policy-off → 404 via the proxy;
  - "Addons: drive-scope context propagation";
  - "No core-to-addon dependencies". The human accepted a core find bar that calls the
    intelligence addon by name, following the precedent of `semanticSearch.ts` (A2/A3).
    The bar is shown only when the addon is enabled, and nothing of it is drawn
    otherwise. A slot cannot reach Cmd/Ctrl+F handling or the core viewers' marks.
- `frontend-conventions.md`: `DESIGN.md`, i18n in `messages-core`, Container/Presenter.
- `backend-conventions.md`: the prohibition on language-dependent rules. Matching is a
  script-neutral substring.

**Repository:**

- The `addons/intelligence` submodule pointer in the core repository, bumped after the
  addon PR merges.
- No protected path is edited. No Internal API endpoint, DB table or migration is added.

## Invariants

I1. The find answer's `total` equals the number of non-overlapping occurrences of the folded term within the file's text units, transcript chunks that have a start, and — only while the drive's Visual Index is open — scene `visible_text` (never `scene_label`); an occurrence inside the overlap of two adjacent text chunks counts once; `rows` is the first `min(total, 2000)` of them in position order, `truncated` is true exactly when `total > 2000`, and each row's `snippet[match_start:match_start+match_length]` folds to the term.
I2. The find answer holds only rows of the requested `file_id`: a file the viewer cannot open, a file outside `X-Lit-Drive`, or a missing or trashed file gets 403, 404 or no rows, never another file's rows; and a find request writes nothing: no row in the core DB or the intelligence DB changes because of it.
I3. Rows are in position order — media by `start` with `utterance` before `scene` at an equal start then `ordinal`, documents by page or section then `ordinal`, text by `ordinal` — and next, previous and every chip step through the visible rows in that order, wrapping at the ends, a chip showing only its category; chips are shown only when at least two categories are present, and when `truncated` is true every count, chip counts included, carries 「+」.
I4. Making an `utterance` or `scene` row current seeks the player to its `start` and leaves it playing or paused as it was; a `page` row shows that page; a `section` row shows that section; a `picture_text` row, or a `text` row outside a marking viewer, moves nothing.
I5. While the bar is open with rows, every occurrence of the term (ASCII-only case folding) in each rendered text layer of the inline PDF viewer, in every rendered `MarkdownPreview` (the knowledge editor's preview included) and in a decorated `TextLines` carries the find mark; when a `page` or `text` row is current, exactly one occurrence in its unit carries the current mark, chosen by context match, then `ordinal`, then the first.
I6. Only the answer to the latest query is ever shown, and only "answered: hits" shows rows, a count, a current place or marks: `indexed: false` shows the not-yet-indexed text and never 「見つかりません」, 404/403 show the unavailable text, and a failure shows 「検索できませんでした」 with 「再試行」 and no earlier rows.
I7. Cmd/Ctrl+F opens the find bar instead of the browser's find only on the desktop file page of a drive with the intelligence addon enabled, with focus outside every editable field, no `blocksLower` overlay, full screen or `aria-modal` element open — including from the EPUB reader frame, which intercepts exactly when the parent tells it to; in every other case the browser receives the key.
I8. Closing the find bar removes every find mark, leaves every `?highlight=` citation mark, leaves the player time, play state, page and scroll unchanged, unlists the 「検索」 tab, and restores the tab and the inspector or sheet state remembered on opening unless the viewer changed that one while the bar was open; it also removes `find` from the URL, and the persisted inspector preference is never written by opening or closing the bar.
I9. `/files/{id}?find=<text>` opens the file with the bar open on that query after the canonical redirect, with no place current, and moving to another file closes the bar and drops `find`; the passage view's 「このファイルの他の箇所 →」 carries the longest keyword-matched highlight term of the group, and no `find` when the group has no keyword passage.
I10. Opening the bar by any route — the button, Cmd/Ctrl+F, `?find=` or `find-shortcut` from the EPUB frame — focuses and selects the input, lists and selects the 「検索」 tab in both inspector instances, opens the desktop inspector or raises the phone sheet to at least half, and remembers the tab and layout it replaced; on any surface other than `file` there is no button and no shortcut.

## Revises

SPEC-CORE-040 I16. The 「他の箇所」 line links to `/files/{id}?find=<term>`, where `<term>` is the longest `highlight_terms` entry of the group's `keyword` passages (no `find` when the group has none), reads 「このファイルの他の箇所 →」 and is named 「{file name} の他の箇所」.

## Checked, no action

- **OCR of video frames and of scanned PDF pages.** This is B2b (hako). Until it lands,
  a scanned PDF page with no text layer has no rows, and the user guide says so.
- **Occurrences across unit boundaries.** These are not found: across two pages, two
  transcript chunks, two scenes, or a `\n` join of non-overlapping chunks. Joining
  units would put a match across a page break onto no single page. `/search/exact`,
  which matches per chunk, has the same limit.
- **Word-level times for utterances.** `transcript_words` would give the second a word
  is spoken in, rather than the chunk start (up to about 30 s earlier). It is not used:
  - a substring would have to be matched across word rows, and Japanese words have no
    spaces between them;
  - LoftRef `.vtt` transcripts have no word rows.

  The chunk start is used, as the passage view does.
- **Marking inside an EPUB section.** The reader frame has no text-position jump and no
  highlight. By the human's choice, B2 goes to the section only.
- **Positions for Office text and picture text.** Office has no viewer yet (B3,
  SPEC-CORE-029 draft), and OCR stores no boxes (SPEC-ADDON-050). These rows are listed
  without a jump.
- **Find marks in the PDF full-screen viewer and the Markdown editor.** Neither is a
  surface the bar sits over: the full-screen viewer is a `blocksLower` overlay, and the
  editor is an editable field where the shortcut belongs to the browser.
- **Marking the term in the transcript panel.** The panel already follows the player's
  time after the seek. The panel belongs to the addon, and nothing in this change needs
  the mark.
- **Extending `/search/exact` with `file_id`.** It is not extended:
  - its rows are one per chunk, with `match_count`;
  - its text chunks overlap;
  - changing that shape would change the MCP tool's answers.

  A separate route leaves `search_exact` as it is.
- **A new MCP tool.** `search_exact` already serves agents.
- **NFKC or kana-width folding.** `/search/exact` does not fold these, and folding them
  only here would make the two disagree.
- **The phone shortcut, and the iOS app with a hardware keyboard.** The phone layout has
  no Cmd/Ctrl+F and uses the button. Whether WKWebView delivers Cmd+F to the page is
  not verified; the button works there either way.
- **The full-screen collection, playlist and folder-play route**
  (`FileDetailFullScreen`). It has no inspector to hold the list. B2 is offered on the
  file page only, and `?find=` on that route is carried but not read.
- **Writing the query into the URL while typing.** Only the `?find=` that opened the
  page is read. Rewriting the URL on each keystroke would push history entries or need
  replace-state handling, for no use.
- **Repetitive text and the overlap merge.** In periodic text, such as a table whose
  rows repeat, a suffix–prefix match between 20 and 200 characters can be longer than
  the true replay, and an occurrence there may then be dropped or counted twice. The
  chunk texts carry no offsets, so the true replay cannot be known exactly. The effect
  is one place too few or too many in such a table.
- **An overlap configured above 200.** `indexing.text_chunking.overlap` above 200 would
  leave the excess replayed twice. No configuration in use sets it above 80.
- **`require_drive` in the manifest.** The proxy does not read this key. The missing
  header is refused by the addon's `drive` scope, and the drive is matched to the file
  by the `addon_feature` composition.
