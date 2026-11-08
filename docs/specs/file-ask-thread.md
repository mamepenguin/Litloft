# Follow-up questions on a file, and saving the thread

SPEC-ID: SPEC-ADDON-079
SPEC-ID: SPEC-ADDON-080
SPEC-ID: SPEC-ADDON-081
SPEC-ID: SPEC-ADDON-082

Approval:

## Summary

The **質問** / **Ask** tab on a file page answers one question at a time today
(SPEC-ADDON-053, -056, -071 to -074): a second question replaces the first, and the model
sees nothing of what was asked before. This change lets the viewer keep asking about the
same file, and save the conversation as a note.

- **SPEC-ADDON-079**: `POST /files/{file_id}/ask` accepts the earlier turns of the
  conversation and gives them to the model with the new question.
- **SPEC-ADDON-080**: the tab keeps a thread of turns per file in the browser, sends the
  answered ones with each new question, and offers **新しい会話** to start over. The thread
  lives exactly as long as today's single answer does.
- **SPEC-ADDON-081**: the tab offers **Markdownで保存** for the thread, through the same
  Knowledge save the drive Ask page uses.
- **SPEC-ADDON-082**: every note saved through the Ask save (`origin: ask_answer`), from the
  drive Ask page or from the tab, lands **unverified**, so a later Ask never cites an LLM's
  answer back as evidence until the viewer vouches for it. Notes saved before this change
  are declared unverified at the next knowledge startup.

It is for the owner reading or watching one file who wants to ask "and then?" or "why?"
without restating the context, and to keep the useful exchanges.

The conversation is not stored by the addon. Ask stays stateless on the server
(`.claude/rules/design-decisions.md`, LLM features): the thread exists only in the open
page, and the only durable copy is a note the viewer chooses to save.

## Required items

### 1. Normal flow

**079, the route.**

1. The tab sends `POST /api/addons/intelligence/files/{file_id}/ask` with `X-Lit-Drive`
   and a body that may now carry `history`: a list of earlier turns, oldest first, each
   `{"question": str, "answer": str}`. A body without `history`, or with `[]`, is answered
   exactly as today.
2. The route validates the body before any gate (field limits in 10). Unknown keys in a
   turn are rejected.
3. The route builds the history block from the turns:
   - every `[n]` marker (the pattern `file_question.py` already uses for citations,
     `\[(\d{1,3})\]`) is removed from each earlier answer, code included, because it
     numbered passages of an earlier request;
   - a turn's size is the characters of its question plus its answer after marker
     removal; the history block's labels and separators are not counted;
   - turns are taken newest first while the sum of their sizes fits the history budget,
     half of `rag.file_question_max_chars` rounded down; the first turn that does not
     fit, and every older turn, is left out;
   - when the newest turn alone does not fit, it is kept cut: its question is cut to the
     history budget, then its answer to the characters that remain, each keeping its
     beginning;
   - the kept turns are written oldest first.
4. The passage budget for this request is `rag.file_question_max_chars` minus the sum of
   the kept turns' sizes after cutting. Chunks are chosen as SPEC-ADDON-053 step 4
   chooses them, against this budget, so a follow-up can be answered from fewer chunks
   than the first question and come back `partial`.
5. When the chunks do not all fit, ranking embeds the question of the last entry of
   `history` as the request carried it (before any cutting), a newline, and the new
   question, instead of the new question alone. With no history it embeds the new
   question alone, as today.
6. The user prompt carries the history block before the question: each kept turn as the
   viewer's question and the earlier answer, then the new question, the position line,
   the image line and the numbered passages as today. The system prompt tells the model
   that the earlier turns are context for the new question, that their answers may be
   wrong, and that only the numbered passages may be cited.
7. The image rules (SPEC-ADDON-071 to -074) apply to the new question only: a picture is
   attached again on every turn as today, a playing video's frame is the one at this
   request's `position_seconds`, and nothing about an earlier turn's image is sent.
8. The stream is unchanged: `answer_chunk`, `citations` (numbers of this request's
   passages only), `meta`, `done`.

**080, the tab.**

1. The tab holds, per file id, a thread: a list of turns, each with the question as
   sent, the answer text, citations, `partial`, `image`, a status (`streaming`,
   `answered`, `failed`) and a failure kind; plus the text being typed and the
   in-flight request's controller.
2. Sending a question appends a new `streaming` turn at the end, clears the text box, and
   sends with `history` set to the thread's `answered` turns before it, oldest first, at
   most the last 10, each as `{question, answer}` with the answer text as received, cut
   to its first 20,000 characters.
3. The turns are drawn oldest first. The text box and its controls sit below the last
   turn; in the inspector's full-height layout they stay at the bottom of the tab and the
   turns scroll above them. When a turn is appended, the tab scrolls so that its question
   is in view.
4. Each turn's answer is drawn by `AnswerMarkdown` with that turn's citations, so its
   pills move the open player or viewer as today (SPEC-ADDON-056 I8). The partial and
   failure lines appear under the turn they belong to; the image line appears only under
   an `answered` turn whose `image` is `"unavailable"`, as today.
5. **新しい会話** (New conversation) is shown while the thread has at least one turn and
   no turn is streaming. It empties the thread, including its saved-note link, and keeps
   the text box's contents.
6. Moving to another file or leaving the page aborts a streaming turn and forgets the
   thread (today's `dropAskEntry` and `FILE_PAGE_CLOSED_EVENT` paths). Closing the mobile
   sheet or switching inspector tabs keeps the thread.

**081, saving the thread.**

1. **Markdownで保存** is shown next to **新しい会話** while the thread has at least one
   `answered` turn and no turn is streaming.
2. It opens `AskSaveDialog` with folder `Ask` and a filename from the first answered
   turn's question (`queryToFilename`).
3. On confirm, the note is posted to `POST /api/addons/knowledge/notes` with
   `origin: "ask_answer"` and `source_file_ids: [file_id]`. Its content:

   ```markdown
   ---
   origin: ask_answer
   query: "<first answered question>"
   source_file_ids: ["<file_id>"]
   saved_at: <ISO 8601 UTC>
   ---

   # <first answered question>

   <source line>

   ## <question of answered turn 1>

   <answer of turn 1, markers rewritten>

   ## <question of answered turn 2>

   ...
   ```

   - The source line is `[[<basename>]]` for a `.md` file and
     `[<filename>](loft://<file_id>)` otherwise, the same two forms
     `formatCitationListItem` uses.
   - Every answered turn is written in thread order; failed and streaming turns are not.
   - `query:` is the first answered question through `JSON.stringify`, as on the drive
     Ask page. In the `#` and `##` headings, each run of whitespace in a question,
     newlines included, becomes one space.
   - In each answer, a `[n]` that the turn's `citations` gives a position becomes a link
     `[<label>](loft://<file_id>?t=<seconds>)`, `?page=<page>` or
     `?section=<section>`, with the label the pill shows (`m:ss` or `h:mm:ss`, `p.<n>`,
     the section title or `§<n>`); `<seconds>` is the position rounded down to an
     integer, as `citationToLoftUrl` writes it. Any other `[n]` is removed. Text inside
     an inline code span or a fenced code block is written as received, `[n]` included,
     by the same code rule the pills follow (SPEC-ADDON-071 I10). The answer's own
     Markdown, headings included, is written as received.
4. After a successful save the button is replaced by **Markdownを保存しました — ノートを
   開く**, linking to the note in the Knowledge editor as the drive Ask page does. The
   thread in `askStore` keeps the saved note's id and the number of answered turns at
   the moment of the save, so closing and reopening the mobile sheet keeps the link.
   The link stays while a new turn streams and after that turn fails. Only when the
   thread has more answered turns than at the save is the link replaced by the button
   again; saving again creates a second note holding every answered turn of the thread.
5. The button is shown whether or not the knowledge addon is installed or on for the
   drive, as on the drive Ask page; without it the dialog shows the proxy's 404 error.

**082, saved answers are unverified.**

1. `POST /notes` in the knowledge addon, after it wrote the `note_origins` row and
   before it answers, calls `declare_trust_tier(note_file_id, "unverified")` when
   `origin` is `ask_answer`. A 204 or a 409 (the viewer already ruled) sets the row's new
   `trust_declared_at` column to now. A 404 leaves it null: core answers 404 for a
   trashed or missing file as well as a purged one, and a trashed note restored later
   must still be declared. For `source_capture` (the capture routes call `create_note`
   in the same process) the call is not made and the column stays null.
2. On knowledge startup, after migrations: every `note_origins` row with
   `origin = 'ask_answer'` and `trust_declared_at` null is declared the same way, one
   call each, and gets `trust_declared_at` on a 204 or 409. A row whose call answers
   anything else, 404 included, or raises a transport error (connection, timeout),
   keeps null and is tried again at the next startup; the pass goes on to the next row.
   The pass runs as a background task after startup, so `/health` and the routes answer
   while it runs, and an unreachable core neither blocks nor stops startup. This covers
   the notes saved before this change (the migration adds the column as null) and any
   note whose declaration failed at save time. A note in the trash, missing, or purged
   answers 404 and is retried at every start: one internal call each, logged at debug
   level, accepted because knowledge keeps a purged note's `note_origins` row and a
   restored note must still be declared. Only rows whose `origin` is `ask_answer` are
   read by the pass.
3. From then on Ask's retriever leaves those notes out as evidence through the existing
   trust filter (`filter-file-ids` with `trust_tier: "verified"`), search still finds
   them, and the note's file page shows the existing unverified-source section with
   **Trust as a source**.

### 2. Failure cases

- **079.** A body that breaks a limit in 10 answers 422 before any gate, LLM or slot. A
  turn whose answer is empty after marker removal is still sent (its question is
  context). Every other failure is today's: 404, 409 `picture_needs_vision`, 503 busy,
  `done` with an error.
- **080.** A failed turn keeps its question, the text it received and its failure line,
  and is not sent as history. When it fails and the text box is empty, its question is
  put back into the box, so the viewer resends it with one press; text the viewer typed
  meanwhile is left alone. The failed turn stays where it is in the thread. A request
  aborted by moving away leaves no turn.
- **081.** A save that fails shows the error inside `FileSaveDialog`, as on the drive Ask
  page, and the thread is unchanged. A read-only drive answers 403 there. After 082's
  502 the note exists although the dialog shows an error; saving again writes a second
  note (`name (1).md`). Both are accepted: the 502 needs a backend without
  `CORE_INTERNAL_SECRET`, which the current `configure.py` does not produce; an override
  written by an older one can lack it (`docs/addons/intelligence.md`), and the upgrade
  note in the docs tells that operator to run `configure.py` again.
- **082.** When core rejects the declaration for any reason but 409 (no
  `CORE_INTERNAL_SECRET`, 403, 404), or the call raises a transport error (connection,
  timeout), `POST /notes` answers 502 with a detail saying the note was saved but could
  not be marked unverified; the note stays where it was written. This follows the clip
  route (`clips.py`), which answers 502 for a status and does not catch a transport
  error; this route catches both. The `note_origins` row
  is committed and `knowledge.note.created` is emitted before the declaration, so open
  Knowledge views refresh either way. The row keeps `trust_declared_at` null, so the
  startup pass declares it at the next start; until then Ask can cite that note.
  The startup pass logs each failure with the file id and the status, never the content,
  and does not delay startup on failure (it runs after the app is serving).

### 3. States

- **A turn:** `streaming` → `answered` (stream ended with `done` and no error) or
  `failed` (any error, or the stream closed without `done`). A turn never leaves
  `answered` or `failed`.
- **A thread:** empty → has turns (a question was sent) → empty (**新しい会話**, or the
  file page closed or changed). At most one turn is `streaming`, and it is the last.
- **The save button:** hidden (no answered turn, or a turn is streaming, with no save
  yet) → offered → saved (link shown; it stays while a later turn streams or fails) →
  offered again (the thread holds more answered turns than at the save). **新しい会話**
  returns it to hidden, since the thread is then empty.
- **A saved Ask note's trust tier:** `unverified` from creation or from the startup pass →
  `verified` only when the viewer presses **Trust as a source**; the viewer's ruling is
  never overwritten by either path.
- **A note_origins row's `trust_declared_at`:** null (`ask_answer` not yet declared,
  or any `source_capture` row) → set (core answered 204 or 409). It is never cleared.

### 4. Data read and written

- **Browser memory:** `askStore.ts` holds the threads, each with its turns, its text
  box and the id of the note last saved from it. Nothing is written to `localStorage`,
  `sessionStorage` or a cookie.
- **search.db:** read as today for chunks and embeddings.
- **Core files:** a saved note is written by core through the knowledge addon
  (`POST /api/drives/{drive}/files`), as today.
- **Core `files.trust_tier`:** written through `PUT /api/internal/files/{id}/trust-tier`
  (existing, write secret required) for new Ask notes and by the startup pass. It never
  touches a file whose `trust_reviewed_at` is set.
- **Knowledge DB:** `note_origins` and `note_origin_sources` written as today;
  `note_origins` gains a nullable `trust_declared_at` column, added by an
  `ALTER TABLE ... ADD COLUMN` migration like `tags_synced_at`, written by the save route
  and the startup pass.
- **The addon's logs:** never contain a question, an answer or a history turn.

### 5. External services

The routed LLM, as today. A longer prompt takes longer; the total characters sent are
bounded by `rag.file_question_max_chars` as before (10). A slow, failing or wrong model
behaves as in SPEC-ADDON-053. The embedding model is called once per question as today.

### 6. Authorization

Unchanged. The core proxy checks drive access and the `rag` feature for the route;
`load_material` reads only the requested active file of the request drive. The history is
text the viewer sent; it reads no other file. The note save goes through the proxy with
`X-Lit-Drive`; the trust declaration is the addon's internal call with the write secret.

### 7. Effect on existing features

- `/ask` and `/find` (drive Ask) are not changed, apart from the notes they save landing
  unverified (082).
- A question without `history` gets the same prompt, the same chunks and the same stream
  as before.
- The MCP server's `ask` tool calls drive Ask and is unchanged. It gets no history
  parameter: an MCP agent holds its own conversation and can restate context in its
  question. The MCP server has no file-question tool today, and this change adds none.
- Clips keep their own declaration; `source_capture` notes (from `captures.py`, which
  calls `create_note` directly) and `/distill` notes stay verified.
- New Ask notes, and old ones after the startup pass, appear wherever unverified or
  unreviewed files are listed: the drive listing's `trust` filter and the
  `TrustTierControl` in the properties panel.
- A question that was answered from the whole file can, as a follow-up, be answered from
  part of it, because the history takes from the same budget.
- `AskSaveDialog`, `queryToFilename`, `formatCitationListItem` and `knowledgeBridge` gain
  a second caller; their behaviour for the drive Ask page is unchanged except that the
  request now names `origin: "ask_answer"` explicitly (the schema default today).

### 8. Error behavior

- The tab shows today's failure lines, under the turn that failed.
- The save dialog shows the save error text; for 082's 502 that is the knowledge
  route's detail.
- Logs: the route logs failure classes and file ids as today; knowledge logs the
  declaration failure with file id and status; the startup pass logs one line per failed
  file and one summary line with counts.

### 9. User-visible behavior

- After an answer, the text box is empty and below the answer; a second question appears
  under the first answer, and so on.
- **新しい会話** and **Markdownで保存** sit with the text box controls, secondary style;
  the submit button stays the only accent fill.
- The model's answer to a follow-up can refer to the earlier answers. Pills only ever
  point at the passages of the turn they are in.
- A saved Ask note, from either Ask surface, is not used as evidence by Ask until the
  viewer presses **Trust as a source** on its page, where the unverified-source section
  now appears. Search finds it as before, and the drive listing's unverified filter lists
  it.
- A follow-up can show 「ファイルの一部を読んで答えました」 where the first question did
  not; the user guide says why (the earlier conversation shares the room).
- English: **New conversation**, **Save as Markdown** (existing key).

### 10. Non-functional

- `history`: at most 10 turns; each `question` 1 to 1,000 characters; each `answer` 0 to
  20,000 characters.
- The history turns sent to the model total at most half of
  `rag.file_question_max_chars` (8,000 characters at the default 16,000), and history
  plus passages at most `rag.file_question_max_chars`, so the prompt is no longer than
  today's.
- One semaphore slot per request, as today.
- Privacy: earlier questions and answers about the file go to the same model the new
  question goes to, and to no other; the `llm_cloud` gate is unchanged.
- The startup pass makes one internal call per Ask note whose declaration has not
  succeeded: after the first start, only notes in the trash, missing or purged.

## Touch points

- `addons/intelligence/app/schemas.py`: `FileQuestionRequest` gains `history`; new
  `FileQuestionTurn`.
- `addons/intelligence/app/routers/rag.py`: `file_ask_endpoint`, `_file_question_stream`.
- `addons/intelligence/app/rag/file_question.py`: `load_material` (budget, ranking
  text), the history trimming and marker removal.
- `addons/intelligence/app/rag/prompt.py`: `build_file_question_user_prompt`,
  `build_file_question_system_prompt`.
- `addons/intelligence/app/prompts/rag/file_question_user.jinja2`,
  `file_question_system.jinja2`.
- `addons/intelligence/frontend/askStore.ts`, `AskTab.tsx`, `askStream.ts`.
- `addons/intelligence/frontend/askNoteFormat.ts` (thread note builder),
  `AskSaveDialog.tsx`, `knowledgeBridge.ts`, `Page.tsx` (sends `origin` explicitly).
- `addons/intelligence/frontend/messages/{ja,en}.json` (`askTab` keys).
- `addons/knowledge/app/routers/notes.py` (declaration), knowledge startup in
  `addons/knowledge/app/main.py` (the startup pass), `addons/knowledge/app/models.py`
  and `addons/knowledge/app/database.py` (`note_origins.trust_declared_at` and its
  migration).
- Core `PUT /api/internal/files/{id}/trust-tier`: called, not changed.
- Rules passed through: `.claude/rules/design-decisions.md` (LLM features: Ask is
  stateless; every LLM call through `resolve`), `.claude/rules/internal-api-policy.md`
  (no new Internal API endpoint), `.claude/rules/frontend-conventions.md` (i18n in the
  addon's messages; `DESIGN.md`).
- Docs: `docs/addons/intelligence.md` (the `history` field, saving a file thread),
  `docs/reference/api.md` (the `history` field of `POST .../files/{id}/ask`),
  `docs/addons/knowledge.md` (Ask notes are unverified, beside "Clips are unverified",
  and the `CORE_INTERNAL_SECRET` row), `docs/reference/env-variables.md`
  (`CORE_INTERNAL_SECRET` is also needed to save an Ask answer; an older override is
  fixed by running `configure.py` again), `docs/user-guide/search.md` (follow-up
  questions, why a follow-up can be partial, saving, saved answers not cited until
  trusted).
- `frontend/e2e-layout/`: one case that, in the inspector's full-height layout with a
  thread taller than the panel, the text box stays at the bottom in view and the turns
  scroll above it.
- Two submodule PRs (intelligence, knowledge) and a core PR with the spec, docs and the
  pointer bumps. No protected path is edited. The `note_origins` migration is a schema
  change (HIGH in `risk-zones.conf`).

## Invariants

I1. A file question with no `history` or an empty one sends the model the same system prompt, user prompt and chunks, ranked by the new question alone, as before this change; with history and a file over budget, ranking embeds the last `history` entry's question as sent, a newline, and the new question.
I2. For one question, the kept turns' sizes (question plus answer after marker removal and cutting) total at most half of `rag.file_question_max_chars` rounded down, turns and passages together at most `rag.file_question_max_chars`, a kept turn is never older than a dropped one, and no `\[\d{1,3}\]` marker from an earlier answer reaches the model.
I3. A body with more than 10 turns, a turn question outside 1 to 1,000 characters, a turn answer over 20,000 characters, or an unknown key in a turn is rejected with 422 before any model, embedding or semaphore slot is used.
I4. The tab sends as `history` only the thread's `answered` turns before the new one, oldest first, at most the last 10, each answer at most 20,000 characters; a failed or streaming turn is never sent.
I5. **新しい会話** and **Markdownで保存** are never offered while a turn streams; **新しい会話** empties the thread and its saved-note link and leaves the text box as it was; a turn that fails while the text box is empty puts its question back into it and never overwrites typed text; after a save, only a thread holding more answered turns than at the save offers the button again.
I6. In the inspector's full-height layout, with a thread taller than the panel, the text box stays at the bottom of the tab in view and the turns scroll above it; each turn's pills move the viewer to that turn's own cited positions.
I7. A note saved from the tab contains every answered turn in thread order and no failed one, and outside code spans and fenced blocks each `[n]` in it is either a `loft://` link to the cited position of this file, with an integer `t`, or removed; inside them the text is as received.
I8. `POST /notes` with `origin: "ask_answer"` either leaves the note unverified, or answers 201 with the tier a viewer already ruled, or answers a non-2xx status; with any other origin it never calls the trust declaration.
I9. Only `note_origins` rows with `origin = 'ask_answer'` are ever declared; such a row gets `trust_declared_at` only after core answered 204 or 409, every such row still null is declared again at the next knowledge startup, and that pass never delays `/health`.
I10. The migration adds `note_origins.trust_declared_at` as null to every existing row, keeps every existing `note_origins` and `note_origin_sources` row and value, and changes nothing when the column already exists.

## Revises

SPEC-ADDON-053 I2. When the file's chunk text totals at most the passage budget (`rag.file_question_max_chars` minus the characters of the history turns sent), all chunks are sent in file order and `partial` is false; otherwise the sent chunk text totals at most the passage budget, chosen by the ranking and fitting rule of 053 step 4 with the ranking text of SPEC-ADDON-079 step 5, sent in file order, and `partial` is true.
SPEC-ADDON-053 I5. Neither the routes nor the tab store the questions, answers, history or citations anywhere other than the open page's memory, except the note the viewer saves with **Markdownで保存**, and the addon never logs question, answer or history text.
SPEC-ADDON-053 I12. `/ask` and `/find` return the same responses for the same requests as before, except that a note saved through the Ask save is no longer cited while it is unverified; `player-side` tabs keep their order and their silence-means-available rule.
SPEC-ADDON-056 I11. While a file's turn is streaming no second request is sent for it; moving to another file or leaving the page aborts the stream and frees its semaphore slot; closing the mobile sheet or switching tabs keeps the whole thread; a stream that fails or closes without `done` keeps the text received in its turn and shows the failure line under it.
SPEC-ADDON-071 I1. A question's passages, picture and frame come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on, and the only other text sent is the history the request carried; the frame is the one at the request's `position_seconds`, and at most one image is sent, a picture of at most 1024 px on its long edge or a frame of at most 1280 px.
SPEC-ADDON-071 I8. The questions, the answers, the history and every image byte are neither stored nor logged by the route or the tab, apart from the `large` frame cache entry that `get_video_frame` also writes and the note the viewer saves.

## Checked, no action

- **SPEC-ADDON-071 I5 and an earlier answer that mentions an image.** I5 is about the
  instructions the prompt gives; an earlier answer is the viewer's history, not an
  instruction, so I5 holds as written.
- **Marker removal inside code in the history.** The history rule removes every `[n]`,
  code included; only the model sees it, and an earlier answer's code is context, not
  something it cites. The saved note keeps code as received (I7).
- **Overlap with SPEC-ADDON-053 I3 and I8.** Citations naming only this request's
  passages, and pills never changing the URL or remounting the viewer, are 053's and
  hold unchanged; this spec states only the per-turn part.
- **Follow-up questions on the drive Ask page.** A follow-up there has to be rewritten
  into a standalone question before retrieval, ahead of query transform, hierarchical
  retrieval, the agentic loop, personal history and scope. That is a larger unit with
  its own latency and local-model quality questions. Opening a cited file and asking
  there covers "tell me more about this source".
- **Storing conversations in the addon DB, or in `localStorage`.** Either breaks "Ask is
  stateless" or brings back stale answers across sessions, which the drive Ask page's
  `sessionStorage` cache was built to avoid. The saved note is the durable copy, and it
  inherits the drive boundary, trash and search.
- **A history parameter on the MCP `ask` tool, or a file-question MCP tool.** An MCP
  agent keeps its own context; see 7.
- **Sending earlier turns as chat messages.** The LLM client takes one system and one
  user prompt (`generate_stream`, `generate_stream_with_image`); a block inside the user
  prompt works for every provider without changing the client.
- **Keeping earlier citation numbers usable.** Passages are re-chosen per question when
  the file is over budget, so an earlier `[n]` can name a different chunk. Markers are
  removed instead of renumbered.
- **Telling the viewer that old turns were dropped from the model's context.** At the
  default budget this takes several long answers; the answers above stay on screen.
- **Rewriting the follow-up before ranking with the LLM.** Joining the previous question
  is free and covers "それはなぜ？"-style follow-ups; an extra LLM call per question is
  not.
- **Retrying a failed declaration before the next startup** (in the hourly scanner,
  or by answering 201 with a warning). Chosen by the owner: a failure needs a core
  without the write secret, and the clip route accepts the same window.
- **A failed save's duplicate on retry.** Chosen by the owner, for the same reason.
- **Updating the first note when a thread is saved again.** Chosen by the owner: a
  second save creates a new note, so edits made to the first are never overwritten.
- **An answer's own `#` headings next to the turn headings.** Written as received; the
  note is the viewer's to edit.
- **Rolling back the note when the declaration fails.** The internal client has no
  delete, and the clip route already settles this as 502 with the file left; the
  startup pass then repairs the tier at the next start.
- **Detailed summaries promoted through `/distill`, and `source_capture` notes.** Both
  hold text the viewer edited or chose; they stay verified.
- **A cap on the number of turns shown.** The thread lives only while the page is open;
  the note body cap (1 MB) bounds what can be saved.
