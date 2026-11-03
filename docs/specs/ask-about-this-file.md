# Ask about the open file

SPEC-ID: SPEC-ADDON-053
SPEC-ID: SPEC-ADDON-056
SPEC-ID: SPEC-CORE-036

Approval:

## Summary

A viewer reading a PDF, watching a lecture or skimming a long transcript wants to ask
"what does this say about X?" of that one file. Ask cannot do that: it searches the whole
drive and gives each file a small share of its context, which is the right shape for
cross-file questions and the wrong one for a single file. The 2026-05-02 decision kept
Ask cross-file and said a single-file question belongs to a separate surface, built when
it is wanted. This is that surface, for one file at a time.

- **SPEC-ADDON-053**: intelligence answers a question about one file from that file's
  indexed text: all of it when it fits a budget, otherwise the chunks of that file that
  best match the question. The answer cites positions inside the file (a time, a page, a
  section). A cheap availability route tells the page whether the file can be asked
  about.
- **SPEC-ADDON-056**: an inspector tab **質問** / **Ask** on the file page sends the
  question and shows the answer, with each cited position as a pill that moves the open
  viewer there without leaving the page.
- **SPEC-CORE-036**: the core gives addons what that tab needs and does not have today:
  an `inspector-tabs` slot for an inspector tab on any kind of file (today `player-side`
  is drawn only beside a media player), and a `documentController` file-page prop that
  moves the open PDF viewer to a page or the EPUB reader to a section. Media files
  already pass `mediaController`.

Out of scope for this first unit: asking about a selection, a page or a stretch of time;
follow-up questions; keeping a history; pictures; the collection surface, which has no
inspector. A question about the whole file is better served by the detailed summary,
which reads the file ahead of time.

The user chose the scope, the design (artifact "このファイルに質問",
https://claude.ai/artifact/YNfRRdC3GQBRqd2b1dWbvk), the in-place jump and the decisions
below on 2026-11-03. Delivery is two PRs: SPEC-CORE-036 first, then
the addon.

## Required items

### 1. Normal flow

SPEC-ADDON-053:

1. **Availability.** `GET /api/addons/intelligence/files/{file_id}/ask` with
   `X-Lit-Drive`. Through the core proxy, a file the viewer cannot access, a missing or
   trashed file, or a drive whose `rag` feature is off answers 404 before the addon runs.
   The addon itself answers `200 {"available": true}` when the file is an active
   `indexed_files` row of the request drive with at least one text chunk (3), and
   `200 {"available": false}` otherwise (another drive, not indexed, no chunk). It reads
   two small queries and nothing else.
2. **Question.** `POST /api/addons/intelligence/files/{file_id}/ask` with
   `{ "question": "...", "profile": null | "<name>" }` and `X-Lit-Drive`.
3. The file's material is its indexed chunks, read from `search.db`, never extracted
   from the file at question time:
   - `transcript_chunks` for media (text, `timestamp_start`): position `{ "seconds": n }`;
   - the `fts_text_content` rows for documents (text, `page`): for a PDF the page is
     the page number, position `{ "page": n }`; for an EPUB it is the section number the
     search results already use for `?section=`, position `{ "section": n, "title" }`
     with the stored `document_sections` title or `null`; for every other kind
     (Office, Markdown, plain text, HTML) position `null`.
   A file with both kinds uses both: transcript chunks first, by `timestamp_start`, then
   document chunks by `chunk_index` compared as an integer (the FTS column is untyped).
   Numbering `[1]`, `[2]`, … runs across both in that order.
4. **Budget.** The budget counts the chunk text only. If all chunks total at most
   `rag.file_question_max_chars` characters (default 16,000), all are sent in file order
   and `partial` is false. Otherwise:
   - The question is embedded with the search text-embedding model, and each chunk is
     ranked by the cosine similarity of its stored embedding, scanned exactly over this
     file's rows. A transcript chunk's embedding is the `whisper` row of the file with
     the same `timestamp_start` and `timestamp_end`; a document chunk's is the
     `text_content` row with the same `chunk_index`. A chunk with no such row ranks
     after every embedded chunk, in file order.
   - Chunks are taken in rank order; a chunk that would exceed the budget is skipped
     and filling continues with the next. If no chunk fits, the best-ranked chunk is
     sent cut to the budget.
   - If the question cannot be embedded, chunks are taken in file order instead, by the
     same fitting rule.
   - The chosen chunks are sent in file order with `partial: true`.
5. **Gates.** The global `features.rag` switch and the LLM gate are those of `/ask`:
   `features.rag` false → 400 as `/ask`; no LLM configured → 400 `"LLM is not
   enabled"`; a chosen `profile` that is unknown or not allowed → 400
   `"profile_unavailable"`; a policy lookup that defers → 503 `"LLM policy is
   unavailable"` (`llm_gate.require_llm`, unchanged). The LLM is resolved with
   `app.llm_routing.resolve(drive, "rag")` and honours `llm_cloud` exactly as Ask does.
   The request takes a slot of the Ask semaphore; a full semaphore answers 503 as
   `/ask` does. The slot is released on every exit: an error before the stream, the
   end of the stream, and a client disconnect.
6. **Prompt and citations.** The prompt lives beside Ask's in `app/rag/prompt.py`. It gives each sent chunk a number `[1]`, `[2]`, …
   and asks for an answer in `llm.output_language` that cites them inline as `[n]`.
   After the stream, citations naming a number that was not sent are dropped.
7. **Stream.** `text/event-stream` with `answer_chunk` (text deltas, `[n]` markers
   included verbatim), then `citations` (`[{ "n": 3, "position": … }]`, sent numbers
   only), then `meta` (`{ "partial": bool }`), then `done`. A failure after the stream
   started ends with `done` carrying `error`.

SPEC-ADDON-056:

1. The tab is the intelligence entry of the `inspector-tabs` slot, declaring an
   `i18n_key` for its label. For each `fileId` (on mount, and on a `fileId` change
   without a remount) it reports `onAvailability(false)` in the layout phase, calls the
   availability route, and reports `true` only on `200 {"available": true}`; any other
   answer or a failure leaves it `false`. For a media file it calls the route again when
   `intelligence.transcription.completed` arrives for that file, so the tab appears once
   the transcript exists. A document becomes askable on the next visit after indexing.
2. The tab holds a question box (placeholder 「このファイルについて質問」 / "Ask about
   this file", `maxLength` 1000), the model select Ask already has, with Ask's exact
   behaviour (shown only when Ask would offer a choice, the same default, and on
   `profile_unavailable` Ask's own message and a refetch of the choices), and
   **質問する** / **Ask**, disabled while the box holds fewer than 3 non-space
   characters or an answer is streaming.
   Layout: in the desktop pane (`fillHeight`) the question box and button stay pinned
   at the top of the tab and the answer scrolls below them; in the mobile sheet the
   whole tab scrolls with the sheet.
3. Sending shows the question, then the answer as it streams. While streaming, `[n]`
   markers show as typed. When `citations` arrives, each `[n]` with a citation becomes a
   pill: `28:25` (or `1:02:03` from one hour) for seconds, `p.12` for a page, the
   section title (or `§N`) for a section; an `[n]` whose citation has a `null` position,
   or that has no citation, is removed from the text. Times are `M:SS` below one hour
   and `H:MM:SS` from one hour.
4. A pill is a button only when the page can move there: seconds with a
   `mediaController` → `mediaController.seek(seconds)`; a page or section with a
   `documentController` → `documentController.goTo(…)`. Otherwise it is plain text. A
   click also calls `lowerInspector()` (CORE-036), so on a phone the sheet drops to its
   bar and the viewer is visible.
5. When `partial` is true, 「ファイルの一部を読んで答えました」 / "Answered from part of
   the file" is shown under the answer.
6. The question, the answer and an in-flight stream belong to the file: they live in a
   store keyed by `fileId` while the file page is mounted, so closing and reopening the
   mobile sheet, switching tabs, or crossing the mobile breakpoint keeps them. Moving to
   another file (a new `fileId`) or leaving the file page aborts that file's stream and
   drops its entry; returning shows an empty tab. A new question replaces the previous
   question and answer for that file. Nothing is written to storage.
7. Failure lines, shown under the question in place of or under the answer:
   - 400 (LLM not enabled, profile unavailable, or `features.rag` off):
     「この質問に使えるモデルがありません」 / "No model is available for this question";
   - 400 `profile_unavailable`: Ask's message for it, as in step 2;
   - 503 from a full semaphore (`/ask`'s busy detail): 「混み合っています。少し待ってから
     もう一度お試しください」 / "Busy. Try again in a moment";
   - any other failure, including the policy-unavailable 503, `done` with `error`, and a
     stream that closes without `done`: 「答えを作れませんでした」 / "Could not answer".
     Text received before a mid-stream failure stays, and the entry is `failed`.

SPEC-CORE-036:

1. A new slot `inspector-tabs`: one entry is one tab, drawn after the core tabs and,
   where `player-side` entries are tabs, after them, on the file page of every kind that
   has an inspector (including HTML preview). Each entry receives the file-page props
   plus `fillHeight`, `labelledByHost` and `onAvailability`, with the meaning they have
   for `player-side`. An entry that reports unavailable has no tab button but stays
   mounted. Unlike `player-side`, an `inspector-tabs` entry that has not reported is
   unavailable: it is listed only after it reports `true`. The host keys availability,
   tab ids and DOM ids by slot and entry id, so an `inspector-tabs` entry may share an id
   with a `player-side` entry or a core tab without colliding. An entry must declare an
   `i18n_key`, as `player-side` entries do. The collection surface has no inspector and
   draws none.
2. A new file-page prop `documentController`, passed to every file-page slot:
   `{ goTo(location: { page: number } | { section: number }): void } | null`.
   - It is non-null while the PDF viewer is mounted, or once the EPUB reader has posted
     `ready`, and `null` otherwise and after unmount.
   - PDF: `goTo({ page })` calls the existing `PdfController.goToPage`, so it lands
     where the Pages panel does and does nothing for a page out of range, as today.
   - EPUB: `goTo({ section })` sends a new reader command `{ type: "goToSection",
     section }` (1-based, the numbering `?section=` uses), and the reader moves to the
     start of that spine section, as opening with `?section=` does. Like opening with
     `?section=`, it writes no reading progress. A section out of range does nothing. `goTo({ page })` on an EPUB and `goTo({ section })` on a PDF
     do nothing.
   - Its identity changes only when the viewer mounts, becomes ready or unmounts, so
     existing slot entries do not re-render more often.
3. A new file-page prop `lowerInspector(): void`, passed to every file-page slot, with a
   stable identity. On a phone with the inspector sheet at half or full height it sets
   the sheet to its bar (peek); at peek, closed, or on desktop it does nothing.

### 2. Failure cases

- Availability: as in 053 step 1. The tab reports unavailable on any answer other than
  `200 {"available": true}`.
- Question: the file is not an active file of the request drive → 404. The file has no
  text chunk → 404. Gates as in 053 step 5. A policy that cannot be read → 503, nothing
  sent to the LLM. The question shorter than 3 non-space characters or longer than 1000
  → 422.
- The LLM stalls: the core proxy's stream wall-clock limit (600 s) closes the stream
  without `done`; the tab shows the generic failure line and keeps the text so far.
- `goTo` or `seek` to a position past the end: the viewer does what its own controls do
  (PDF: nothing; EPUB: nothing; media: the player clamps).

### 3. States

Per file entry in the tab's store: `idle` → `streaming` → `answered` or `failed`;
`answered` or `failed` → `streaming` on a new question. Not allowed: a second request
while `streaming`; a stream continuing after its file's entry was dropped.

### 4. Data read and written

- Read: intelligence `search.db` (`indexed_files`, `transcript_chunks`,
  `fts_text_content`, `embeddings` / `vec_text` rows of this file, `document_sections`).
- Written: nothing. No question, answer or citation is stored, in the addon, the core
  or the browser's storage.

### 5. External services

The LLM the routing resolves, which may be off-host. Nothing else; no Internal API call.

### 6. Authorization

- Manifest routes `/files/{file_id}/ask` (`GET` and `POST`): `pre_check` `{type:
  file_access, param: file_id}` and a route-level `addon_feature: "rag"` key, so the
  proxy checks the viewer's access to the file and the drive's policy.
  `response_filter: null` on both (the citations carry positions, not drives). `POST`
  is `stream: true`; no `timeout` key (the proxy does not apply one to streams).
- The addon also checks that the file belongs to the `X-Lit-Drive` drive.
- Only the file's own chunks reach the LLM.

### 7. Effect on existing features

- `/ask` and `/find` are unchanged; the new route shares their semaphore, routing entry
  and `llm_cloud` policy, so a file question in flight counts toward the same limit.
- `player-side` keeps its placement and contract.
- `documentController` changes no existing slot's behaviour. The PDF Pages tab and the
  EPUB contents list keep their own navigation and their open-time `initialPage` /
  `initialSection`.
- A file page that today shows only the Info tab gains a tab strip when the **Ask** tab
  is available.

### 8. Error behavior

As in 2 and 056 step 7. The addon logs `file question failed: <error>` at WARNING with
the file id, never the question text.

### 9. User-visible behavior

As in 1 (056). The tab appears only for files with indexed text, so a file appears a
little after its upload, once indexing has run. `docs/user-guide/search.md` (Ask section)
gets one sentence on the **Ask** tab; `docs/addons/intelligence.md` documents the routes
and `rag.file_question_max_chars`; `docs/ADDON-DEVELOPMENT.md` documents
`inspector-tabs` and `documentController`.

### 10. Non-functional

- At most `rag.file_question_max_chars` characters of chunk text per question. The key
  is an integer from 1,000 to 200,000, set in `search-config.yml` only (not on the admin
  screen). A value out of range, not an integer, or a bool logs a warning and falls back
  to 16,000, as `rag.hierarchical.exact_match_max_files` does.
- Availability answers within 100 ms; the addon's own work before the first LLM call
  (reading chunks and, when partial, embedding the question and scanning this file's
  vectors) within 2 s on a file of 2,000 chunks, measured with the model loaded.
- Privacy: file text leaves the container only to the routed LLM, under `llm_cloud`; the
  question text is not logged.

## Touch points

Core (PR 1):
- `frontend/src/components/FileDetail/ShellLayout.tsx`,
  `frontend/src/components/FileDetail/inspector/tabs.ts`, `InspectorShell`,
  `frontend/src/hooks/useSlotAvailability` (or where it lives): draw `inspector-tabs`,
  key availability and tab ids by slot.
- `frontend/src/components/FileDetail/FileDetailContainer.tsx` (builds
  `addonSlotProps`), `FileDetailCanvas.tsx`, `MediaCanvas.tsx`, `MediaPlayerBlock.tsx`,
  `frontend/src/components/FilePreview.tsx`, `frontend/src/components/PdfPreview.tsx`,
  `frontend/src/components/epub/EpubPreview.tsx`, `useEpubReader.ts`: lift and publish
  `documentController`.
- `frontend/src/lib/epubReaderChannel.ts`, `frontend/public/epub-reader/reader.js`: the
  `goToSection` command; the `frontend/e2e-epub` host fixture's message list.
- `frontend/src/lib/`: the `DocumentController` type.
- `frontend/src/components/FileDetailShell.tsx` (owns the sheet state),
  `frontend/src/components/MobileInspectorSheet.tsx`: `lowerInspector`.
- `frontend/src/__tests__/i18n-keys.test.ts`: extended to `inspector-tabs` entries.
- `docs/ADDON-DEVELOPMENT.md`.

Addon (PR 2):
- `addons/intelligence/app/routers/rag.py` (or a new module): the two routes.
- `addons/intelligence/app/rag/`: material, budget, ranking, citation parsing; the
  prompt in `app/rag/prompt.py`.
- `addons/intelligence/tests/test_llm_caller_inventory.py`: if the new module imports
  `LLMClient` for typing, it is added to the pinned set there (a named detector edit);
  it obtains clients only through `resolve()`.
- `addons/intelligence/app/config.py`, `search-config.yml.example`:
  `rag.file_question_max_chars`.
- `addons/intelligence/manifest.json`: the routes and the `inspector-tabs` entry.
- `addons/intelligence/frontend/`: the tab, its store and stream client, `messages`.
- `addons/intelligence/tests/`.
- `docs/addons/intelligence.md`, `docs/user-guide/search.md` (core repo, with the gitlink
  bump).

Rules passed through: `.claude/rules/design-decisions.md` (drive boundary; LLM routing
and `llm_cloud`; addons via slots; LLM output is not stored as a source),
`.claude/rules/internal-api-policy.md` (no new Internal API endpoint),
`.claude/rules/frontend-conventions.md`, `DESIGN.md`. Checked in a real browser (R-5),
at 1440x900 and 390x844: pill movement for a video, a PDF and an EPUB, the sheet
lowering, and that the question box and the answer are shown whole (the box pinned in
the desktop pane, the answer scrolling). No protected path is edited.

## Invariants

I1. The LLM receives chunks of the requested file only, and only when the file is an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on.
I2. When the file's chunk text totals at most `rag.file_question_max_chars`, all chunks are sent in file order and `partial` is false; otherwise the sent chunk text totals at most that many characters, chosen by the ranking and fitting rule of 053 step 4, sent in file order, and `partial` is true.
I3. Every entry of the `citations` event names a chunk number that was sent, with that chunk's position; a number that was not sent never appears.
I4. The LLM client comes from `resolve(drive, "rag")`: an off-host profile is used only when `llm_cloud` allows it, a policy that cannot be read sends nothing, and a profile the user chose is never replaced.
I5. Neither the routes nor the tab store the question, the answer or the citations anywhere, and the addon never logs the question text.
I6. The availability route answers `available: true` only for an active file of the request drive with at least one text chunk.
I7. The **Ask** tab is listed only after the availability route answered `available: true` for the file now open, including right after moving from another file without a remount.
I8. Clicking a time pill seeks the open player and a page or section pill moves the open viewer, without changing the page's URL or remounting the viewer; a position the page cannot reach, an uncited `[n]` and a null-position `[n]` leave no pill and no marker in the text.
I9. `documentController` is non-null exactly while a PDF viewer is mounted or an EPUB reader is ready on the file page, keeps its identity between those changes, and `goTo` lands where the Pages panel or `?section=` would, writing no EPUB reading progress.
I10. An `inspector-tabs` entry is drawn as a tab after the core tabs and any `player-side` tabs on every file page with an inspector, only once it has reported available, and its tab and DOM ids never collide with another slot's.
I11. While a file's answer is streaming no second request is sent for it; moving to another file or leaving the page aborts the stream and frees its semaphore slot; closing the mobile sheet or switching tabs keeps the question and answer; a stream that fails or closes without `done` keeps the text received and shows the failure line.
I12. `/ask` and `/find` return the same responses for the same requests as before; `player-side` tabs keep their order and their silence-means-available rule.

## Checked, no action

- **Extracting the file at question time.** Rejected for indexed chunks: per-page PDF
  conversion takes tens of seconds on long files, and the indexed chunks already carry
  positions. The cost is that a file is not askable until indexed.
- **Selection, page or time range as the target; follow-up questions; history.** Later
  units.
- **Pictures.** The stored caption is one sentence; answering about a picture needs a
  vision model.
- **Head/middle/tail sampling as the detailed summary does.** A question picks its own
  chunks; questions about the whole file are what the detailed summary is for.
- **Slides, sheets and Office sections as jump targets.** No viewer moves there; those
  citations show no pill.
- **The 200-character overlap of document chunks.** Counted against the budget as sent;
  not worth de-duplicating for a first unit.
- **A routing entry or an admin-screen setting of its own.** Not needed yet.
- **The collection surface.** It has no inspector.
- **Internal API.** No new core endpoint; R1–R5 not engaged.
