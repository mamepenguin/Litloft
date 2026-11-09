# Decisions

decision: continue (r1). The owner answered 「OKです」 to: rebase onto develop once the YouTube frames work is merged there and run /review again (R1, R2, R5); accept R3 and R4 as invariant revisions I11 and I12; R6 needs no action.
ran_in_app: yes
at: 1dde119a99781700a35d96cc180d4731d7334b6a
by: agent
evidence: |
  SPEC-ADDON-079..082 of `docs/specs/file-ask-thread.md`, first R-5. Core tree
  1dde119a99781700a35d96cc180d4731d7334b6a with `addons/intelligence` at
  f140b8a9a742f003ff8e777e2a5668de0859b047 and `addons/knowledge` at
  3287ffadc54521f67f82240b3e74b0922bf12615 (both submodules clean).

  Environment. `LITLOFT_PORT=3994 docker compose -p litloft-r5-thread
  -f docker-compose.yml -f .r5/override.yml up -d --build backend frontend
  intelligence knowledge` from this worktree. The scratch stack used
  `.r5/data` for the backend's /app/data, the intelligence addon's
  /intelligence-data and /data:ro, and the knowledge addon's /knowledge-data;
  `docker inspect` shows no mount of the real `data/`, only `.r5/data`.
  `drives.json` defines drive `scratch` at `.r5/drive` with the intelligence and
  knowledge addons on; `passwords.json` is `[]`. `CORE_INTERNAL_SECRET`,
  `SEARCH_WEBHOOK_SECRET` and `KNOWLEDGE_WEBHOOK_SECRET` were set on both sides.
  `event-hooks.json` (generated from the two manifests' `event_hooks`, as
  configure.py does) was mounted on the backend after the first start, so a
  note created during the run is indexed at the next `scan.complete`.
  Other stacks (`video_share-*` on :3000, `novel-generator-adminer`, etc.) were
  never stopped, restarted or touched; only `litloft-r5-thread` was started and
  stopped.

  The models were the shared Hugging Face caches copied into
  `.r5/data/addons/intelligence/models` (granite-embedding-97m, faster-whisper
  small); the addon additionally fetched whisper-large-v3-turbo and the
  SigLIP2 text encoder at first start. The LLM was a local OpenAI-compatible
  stub under `.r5/llm-stub/` on host port 3996 (profile
  `openai_compatible`, base_url `http://host.docker.internal:3996/v1`,
  `model: r5-text`, `vision_model` empty). It streams a canned answer that
  cites `[1]` and `[2]`, logs every request's system and user prompt to
  `.r5/llm-stub/requests.jsonl`, and has file switches for: fail (HTTP 500 on
  every request), long (about 3,000 characters), slow (0.25 s per chunk) and
  hold (3 s per chunk). It also returns the JSON contract the drive Ask page
  asks for. It is not a model, and nothing below is evidence about a real
  model's answer quality or about a real off-host provider.

  Fixtures in `.r5/drive` (drive `scratch`):
  - `forest-trail.md` (`2xoT1MejZ6uo`, 716 chars, one text chunk).
  - `storage-inventory.txt` (`jyP0NuQ8a2D7`, 928 chars, one text chunk).
  - `trailhead.mp4` (`w3RoCFb3U9TJ`, 10.669 s, three spoken sentences;
    whisper-local produced three transcript chunks at 0.00, 4.29 and 9.60 s).
  Scratch config deviations, recorded so the run can be repeated:
  `transcription.whisper_local.min_segment_duration: 2` (at the default 10 the
  10.7 s video became a single chunk), `text_chunking.max_chunk_size: 1000`
  with `overlap: 200`, and `rag.file_question_max_chars: 16000` for checks 1-8
  and `1000` for checks 9-11 (intelligence restarted between them).

  Screenshots are in `docs/process/reviews/feature-file-ask-thread/shots/`.
  Raw results are in `.r5/results/`; the stub log is
  `.r5/llm-stub/requests.jsonl`.

  1. Follow-up on the text file. PASS. `forest-trail.md`, 1440x900. Asked
     「Where does the first bus leave from?」: the turn appeared with a canned
     answer, the text box read `""` and sat at y=743 below the turn (the turn
     box ended at y=682). Asked 「How much does the taxi cost?」: the second
     turn appeared below the first (turn boxes y=354 and y=524, oldest first),
     the box was `""` again and stayed below. The stub log's first request had
     no `Earlier in this conversation:` block; the second had one containing
     "The viewer asked: Where does the first bus leave from?" and "You
     answered: The notes put the meeting point ... below the north gate . The
     kestrelmark ...", with zero `[n]` matches in the history block (the first
     answer's `[1]` was removed). Shots `c1-text-after-first.png`,
     `c1-text-two-turns.png`.

  2. Pills per turn on the video. PASS. `trailhead.mp4`, 1440x900. Turn 1
     (「What does the bus do in the morning?」) drew one pill `0:04`; clicking
     it set the player to `currentTime` 4.29. Turn 2 (「How much does the taxi
     cost at the station?」) drew `0:00` and `0:09`; clicking them set
     `currentTime` 0 and 9.60. Turn 1's pill still moved to 4.29 after turn 2
     existed, so each turn's pills point at that turn's own cited passages.
     Both requests carried 3 passages; the second carried history. Shots
     `c2-video-turn1.png`, `c2-video-two-turns.png`, `c2-video-after-pills.png`.

  3. A failed follow-up. FAIL. `forest-trail.md`: after one answered turn the
     stub's `fail` switch was set and 「And how much is the taxi?」 was asked.
     The addon made three HTTP requests (the OpenAI SDK's two retries), all
     500; the addon logged `LLM stream open failed (InternalServerError);
     yielding nothing`, then emitted `citations []`, `meta` and `done {}`. The
     failure never reaches the tab: the turn ends as *answered* with empty
     text. On screen it showed the question
     "And how much is the taxi?" and nothing under it, no
     「答えを作れませんでした」 line, and the text box stayed empty (the
     question was not put back). No `[role=alert]` was inside the turn; the
     only alert found was an unrelated empty one elsewhere. Shot
     `c3-stub-fail.png`.
     The second half of the check passed with a stream that really closes
     without `done`: `storage-inventory.txt`, a slow stream, the text
     "draft typed while the answer streams" typed while it streamed, then the
     intelligence container killed. The turn kept the text received ("The
     notes put the meeting point at t") and showed
     「答えを作れませんでした」 under it; the box kept the typed text. After the
     container restarted, sending the kept text produced a request whose
     history held only the earlier answered turn, not the failed question.
     Shots `c3-typed-text-kept.png`, `c3-next-after-failure.png`.
     (The kill of the container is a test instrument to produce a stream that
     closes without `done`; killing is not ordinary use.)

  4. 新しい会話. PASS. `forest-trail.md`. While the second question streamed,
     the 新しい会話 button was absent (count 0) and 質問する was disabled. With
     two answered turns it was present. The box was given
     "draft kept across the reset" (the thread had 2 turns); pressing 新しい会話
     left 0 turns, the box still read "draft kept across the reset", the button
     disappeared, and the old question was gone from the panel. Sending the
     kept text produced a request with no history block and no earlier
     question. Shots `c4-streaming-no-new-conversation.png`,
     `c4-after-new-conversation.png`, `c4-next-request.png`.

  5. Keep and forget in the mobile sheet. PASS. 390x844, isMobile, hasTouch,
     deviceScaleFactor 2. `storage-inventory.txt`, sheet opened, 質問 tab.
     Asked 「Where are the sleeping bags kept?」 and typed "phone draft kept".
     Closing the sheet (シートを下げる) and reopening it showed the same turn and
     the same box text; switching to 情報 and back to 質問 kept both. The 関連
     tab's similar-file item "forest-trail.md" switched file in place (the
     navigation entry count stayed 1, so no reload): the new file's 質問 tab
     had 0 turns and an empty box. Returning in place to storage-inventory
     through its similar-file item also showed 0 turns: the old question and
     answer were gone. `documentElement.scrollWidth` was 390 and
     `innerWidth` 390 at every point. Shots `c5-phone-thread.png`,
     `c5-phone-sheet-reopened.png`, `c5-phone-tab-switch.png`,
     `c5-phone-other-file.png`, `c5-phone-back-empty.png`.

  6. Markdownで保存. FAIL on the second save; the rest passed.
     On `trailhead.mp4`: two answered turns (「What is said about the faded
     sign?」, 「How much does the taxi cost?」), one failed turn made by
     submitting while the three Ask slots were held by other requests (the
     turn showed 「混み合っています。少し待ってからもう一度お試しください」 and its
     question returned to the box), then one more answered turn after the
     first save. The dialog proposed folder `Ask` (`保存先: /Ask`) and the
     filename `what-is-said-about-the-faded-sign.md`; confirming showed
     「Markdownを保存しました — ノートを開く」 linking to
     `/drive/scratch/addons/knowledge?edit=xuHQWmFpoP8p`. Opening that link
     (in a second tab) showed the note. Its raw content read through the app
     (`GET /api/files/xuHQWmFpoP8p/stream`) is: frontmatter
     `origin: ask_answer`, `query: "What is said about the faded sign?"`,
     `source_file_ids: ["w3RoCFb3U9TJ"]`; `# What is said about the faded
     sign?`; `[trailhead.mp4](loft://w3RoCFb3U9TJ)`; then exactly two `##`
     sections in thread order (`## What is said about the faded sign?`,
     `## How much does the taxi cost?`); the citations are
     `[0:04](loft://w3RoCFb3U9TJ?t=4)`, `[0:00](...?t=0)` and
     `[0:09](...?t=9)`; the failed question is absent and there is no `[n]`
     left. Asking one more question made the save button return and the link
     disappear, as specified. Pressing save again with the proposed filename
     `what-is-said-about-the-faded-sign.md` then failed: the dialog showed
     「Addon service unavailable」 and no link. The knowledge log shows
     `POST /notes` 500 with `sqlite3.IntegrityError: UNIQUE constraint failed:
     note_origins.drive, note_origins.note_path`, at `app/routers/notes.py:173
     db.commit()`, with the insert parameters `('scratch',
     'Ask/what-is-said-about-the-faded-sign.md', 'IMIKgE4tCEbI', ...)` even
     though core had answered 201 and renamed the file to
     `Ask/what-is-said-about-the-faded-sign (1).md`. So pressing save again
     creates a note file but not a second `note_origins` row, and the
     operation is reported as a failure. Changing the filename by hand to
     `thread-second-note.md` did save a second note (`v8WzY8reoXVl`) whose
     content held all three answered turns in order, so the note builder is
     sound; the proposed-name path is not. The note file left by the failed
     save (`IMIKgE4tCEbI`) also has no `note_origins` row (the insert was the
     thing that failed), so it stayed `trust_tier: verified` and citable by a
     later drive Ask until it was trashed; the startup pass reads
     `note_origins` rows and cannot declare it. Shots
     `c6-thread-before-save.png`, `c6-save-dialog.png`, `c6-saved-link.png`,
     `c6-note1.png`, `c6-save-dialog-second.png`, `c6-second-save-error.png`,
     `c6-note2-renamed.png`.

  7. Unverified. PASS after removing the two notes check 6's failed saves had
     left behind (see below). On `xuHQWmFpoP8p`'s file page the
     unverified-source section read 「この出典を信用しますか」 with
     「出典として信用する」 (and the tier control said 未検証);
     `GET /api/files/xuHQWmFpoP8p` answered `trust_tier: "unverified"`,
     `trust_reviewed_at: null` (`c7-note1-unverified.png`).
     A note saved from the drive Ask page (`/drive/scratch/addons/intelligence`,
     question 「What do the trail notes say about the north gate?」) linked to
     `OTa1UnvyTBhA` and its API answer was `trust_tier: "unverified"`.
     The drive question 「Does kestrelmark appear in any note?」 then sent the
     model only `w3RoCFb3U9TJ`, `2xoT1MejZ6uo` and `jyP0NuQ8a2D7`; the note's
     text was not in the passages and the page's Sources listed only those
     three files. After pressing 出典として信用する on the note
     (`trust_tier: "verified"`, `trust_reviewed_at` set), 「Where is kestrelmark
     mentioned?」 sent `xuHQWmFpoP8p` among the passages, its text
     ("the kestrelmark remark belongs to the ridge path ...") was in the
     context, the Sources listed `what-is-said-about-the-faded-sign.md`, and
     the citation card showed it. The two untracked notes that check 6's failed
     saves created were trashed first (`DELETE /api/files/{id}` 200 for
     `IMIKgE4tCEbI` and `zTCbW6p4XNDO`); before that they were verified and
     citable because no `note_origins` row was ever written for them. Shots
     `c7-note1-unverified.png`, `c7-note1-untrusted.png`,
     `c7-drive-before-trust.png`, `c7-note1-trusted.png`,
     `c7-drive-after-trust.png`, `c7-drive-note-saved.png`.

  8. The startup pass. PASS on the outcomes, with the timing limitation below.
     Knowledge stopped. `OTa1UnvyTBhA` was set to `verified` with
     `PUT /api/internal/files/OTa1UnvyTBhA/trust-tier` (204) and its
     `note_origins.trust_declared_at` set to NULL with sqlite against
     `.r5/data/addons/knowledge/knowledge.db` (the scratch data). Starting the
     container: the first successful `/health` poll was HTTP 200 1.364 s after
     the start command and that same sample already read the note's
     `trust_declared_at` as set; the file's API answer after the run was
     `trust_tier: "unverified"`. A wider run (all
     six `note_origins` rows set to NULL) declared all six in 67 ms (timestamps
     15:16:33.318-15:16:33.385); the viewer's ruling on `xuHQWmFpoP8p`
     (`verified`, `trust_reviewed_at` set) survived the pass (the core's 409 was
     accepted and the timestamp set), and `/health` answered. With a poll
     granularity of about 130-200 ms the pass always finished before the first
     sample that could connect, so `/health` answering *inside* the pass was
     not isolated; no delay to `/health` or startup was observed.

  9. Partial on a follow-up. PASS. `rag.file_question_max_chars: 1000`;
     intelligence restarted. `storage-inventory.txt` (one 927-character chunk).
     「What is on the wooden shelves?」 produced a 234-character answer with no
     partial line. The stub was switched to the long answer and
     「Who borrowed the sleeping bags on Sunday?」 was asked as a follow-up
     (history present): the 3,069-character answer showed
     「ファイルの一部を読んで答えました」. Both requests carried one passage.
     Shots `c9-first-no-partial.png`, `c9-followup-partial.png`.

  10. Layout against design A. PASS. `trailhead.mp4` at 1440x900 with three
      long answered turns and one failed turn (the busy failure). The turns
      container's `clientHeight` was 376 against `scrollHeight` 5078 with
      `overflow-y: auto`; the text box was at y=743.4 (height 89) in the
      inspector panel (y 358-884), below the turns container (which ended at
      y=734.4), and scrolling the turns to the end did not move it (same box).
      新しい会話 (x 1073.6), Markdownで保存 (x 1183.6) and 質問する (x 1336) sat
      on the same row at y=848. The submit's background was
      `rgb(181, 36, 37)` (accent); the two secondary buttons were
      `rgb(229, 229, 224)` (the app's sand secondary surface, with a border),
      so the submit is the only accent fill. The design artifact draws the
      secondaries white; that is a difference in the neutral surface colour,
      not in which button is filled with the accent. At 390 px the sheet's
      scroller was 5526/503, the text box sat at y=663 and the three buttons at
      y=768 inside the 844 px viewport, and `documentElement.scrollWidth` was
      390 = `innerWidth` (no horizontal scrolling). Saving from this thread
      produced note `s5WYJ3msUrSA` and the saved link. Shots
      `c10-desktop-layout.png`, `c10-desktop-scrolled.png`,
      `c10-phone-layout.png`, `c10-phone-layout-bottom.png`,
      `c10-saved-link.png`, `c10-three-answered.png`.

  11. The drive Ask page. PASS for the page that exists. `/ask` answers 404 in
      this build (「This page could not be found」), as in the earlier R-5s; the
      drive Ask page is `/drive/scratch/addons/intelligence`. There
      「Which bus leaves the station in the morning?」 was answered with a
      citation (trailhead.mp4, 0:00) and Sources (trailhead.mp4,
      forest-trail.md); Markdownで保存 proposed `/Ask` and
      `which-bus-leaves-the-station-in-the-morning.md` and saved
      `3EAPlmf01WJT`, whose API answer was `trust_tier: "unverified"`. Shots
      `c11-drive-ask.png`, `c11-drive-ask-saved.png`.

  Seen outside the checks: the phone page load logs minified React #418
  (the same as the earlier R-5s); the drive Ask page keeps its previous
  question's sources visible while a new one streams. Neither is attributed to
  this change.

pending: |
  - The quality and correctness of answers with a real model. The LLM was a
    canned local stub; no model reasoning was observed.
  - A real off-host provider, and the `llm_cloud` policy allowing/denying a
    drive on a real install.
  - Anything on an iPhone (a 390 px Chromium viewport with isMobile and
    hasTouch was used, not a device).
  - Audio and video as heard and seen, subtitle timing, playback over the
    home LAN and on other household devices, and calls to real third-party
    addon services (`PROJECT.md` agent_cannot_verify).

## R-5, second run (after fixes)

ran_in_app: yes
at: 247f649d5203ef94b6f34ef2b1b8bf3950f4f605
by: agent
evidence: |
  SPEC-ADDON-079..082 of `docs/specs/file-ask-thread.md`, second R-5 after
  the check 3, check 6 and D-3/D-4/D-7 fixes. Core tree
  247f649d5203ef94b6f34ef2b1b8bf3950f4f605 with `addons/intelligence` at
  3e80351deada06ed21c76057de3b798257c20f96 and `addons/knowledge` at
  63fd1a797d7ad65f8edae60c52b5e985147571ba (both clean, no local edits).

  Environment. The same scratch stack and working material as the first R-5:
  `LITLOFT_PORT=3994 docker compose -p litloft-r5-thread -f docker-compose.yml
  -f .r5/override.yml up -d --build backend frontend intelligence knowledge`
  from this worktree, rebuilding the images from the current addon trees. The
  three fixtures and the earlier Ask notes stayed in `.r5/drive`, the DBs and
  models in `.r5/data`, and the local OpenAI-compatible stub under
  `.r5/llm-stub` on host port 3996. Only `litloft-r5-thread` was started and
  stopped; the other stacks were not touched. The scratch config still
  carries the first run's deviations: `rag.file_question_max_chars: 1000`,
  `text_chunking.max_chunk_size: 1000` with `overlap: 200`,
  `transcription.whisper_local.min_segment_duration: 2`, and
  `detailed_summaries: "false"`. The stub is not a model; nothing below is
  evidence about answer quality or a real provider.

  A. Check 3, failure (PASS). `forest-trail.md`, 1440x900. Q1 「Where does
  the first bus leave from?」 answered. The stub's `fail` switch was set and
  「And how much is the taxi?」 asked: the second turn showed the question and
  the red 「答えを作れませんでした」 (a `[role=alert]` inside the turn), and the
  text box, empty since the send, held the question again. No citations were
  drawn. The switch was removed and the put-back question sent: the third
  turn answered. The last request's history block held Q1 and its answer, not
  Q2, with zero `[n]` markers. Shot `r2-a-failure.png`;
  `.r5/results/r2-a-check3.json`.

  B. Check 6, saving twice (PASS for the check; the detailed-summary half was
  not run). `forest-trail.md`: Q1 「Which gate is below the bus stop?」, Q2
  「How much is the taxi from the station?」, save with the proposed
  `which-gate-is-below-the-bus-stop.md` in `/Ask` -> note `mQhHqK1DP30T`,
  `trust_tier: unverified`, two `##` turn sections. Q3 「Where does the ridge
  path go?」, save again with the same proposed name -> the request answered
  200/201 and the note is `Ask/which-gate-is-below-the-bus-stop (1).md`
  (`COGfZmt5ymXM`), unverified, holding all three turns in order; both
  `note_origins` rows record the actual `(1)` path and a set
  `trust_declared_at`. Shots `r2-b-saved-link.png`,
  `r2-b-second-save.png`; `.r5/results/r2-b-check6.json`.
  The detailed-summary half was not run: the scratch config has
  `detailed_summaries: "false"`, and the AI menu's 「詳細要約を作成」 answers 400
  `{"detail":"Detailed summaries feature is disabled"}`, so the
  「ファイルとして保存」 action never appears (see pending).

  C. Layout (PASS). `forest-trail.md` at 1440x900 with three answered turns
  and one turn failed through the stub's 500. Four sections; the gaps between
  consecutive turns were 24, 24 and 24 px. The turns scroller was 376 px high
  against 658 px of content with `overflow-y: auto`; the text box sat at
  y=743.4 in the inspector panel (354-884), below the turns container (which
  ended at 734.4), and did not move when the turns were scrolled to the end.
  新しい会話 (x 1073), Markdownで保存 (x 1183) and 質問する (x 1336-1424) sat
  on one row at y=848, the first two on the left and the submit on the right;
  all three are the shared Button (radius 16 px, height 36 px), the submit
  the only accent fill (rgb(181, 36, 37)) and the secondaries the app's sand
  (rgb(229, 229, 224)). The turn list had 16 px bottom padding, the form
  12 px top padding and the host panel the horizontal 16 px. At 390x844
  (Chromium, isMobile, hasTouch, DSF 2) the sheet was dragged to its full
  height, the sheet scroller was 479/1136, the text box sat at y=662.8 with
  the three buttons at y=767 (x 16, 126, 286), and
  `documentElement.scrollWidth` was 390 = `innerWidth` (no horizontal
  scrolling). The saved-link state showed the link and no save button. Shots
  `r2-c10-desktop-layout.png`, `r2-c10-phone-layout.png`,
  `r2-c10-saved-link.png`; `.r5/results/r2-c-layout.json`,
  `r2-c-desktop-bottom.json`, `r2-c-phone.json`.

  D. Check 1 repeated (PASS). A fresh `forest-trail.md` page, Q1 「Where does
  the first bus leave from?」 then Q2 「How much does the taxi cost?」. The
  turns were drawn oldest first (y 354 then 536) and the text box below them
  (y 743.4), empty after each send. The Q2 request carried a history block
  with Q1 and its answer, with zero `[n]` markers (the first answer's marker
  was removed) and one passage. `.r5/results/r2-d-check1.json`.

  Seen outside the checks. The failed turn in check C also drew
  「ファイルの一部を読んで答えました」 above 「答えを作れませんでした」, because
  this scratch run's `rag.file_question_max_chars: 1000` makes the follow-up
  partial before the model call fails; check A's failed turn had no partial
  line. Separately, of the eight successful `POST /notes` in this run, four
  wrote their `note_origins`/`note_origin_sources` rows (the two check-B
  saves and two later new-name saves), while four (the check-C save, a second
  layout save, and two reproductions under a name already taken by an
  earlier note, e.g. `Ask/where-does-the-trail-begin (2).md`,
  `WQAkEbIVwyqZ`) returned 201, created the note file and set it
  `unverified`, but left no row visible in
  `.r5/data/addons/knowledge/knowledge.db`, read both on the host and inside
  the container. The notes themselves opened and held their turns. Recorded
  for the author; it is not one of checks A-D.

pending: |
  - The detailed-summary promotion (`POST /distill`) was not run because the
    scratch config has `detailed_summaries: "false"` and the backend rejects
    generation with 400; the Ask-note path the check names was exercised.
  - The quality and correctness of answers with a real model: the LLM was a
    canned local stub.
  - A real off-host provider, and the `llm_cloud` policy on a real install.
  - Anything on an iPhone: a 390 px Chromium viewport with isMobile and
    hasTouch, not a device.
  - Audio and video as heard and seen, subtitle timing, playback over the
    home LAN and on other household devices, and calls to real third-party
    addon services (`PROJECT.md` agent_cannot_verify).

## Design check decisions (owner, 2026-11-09)

Against `design-check.md` (11 findings):
- Fix: D-3 (24px between turns), D-4 (16px padding on the turn list, 12px on the form), D-7 (New conversation and Save on the left, submit on the right; radius and height stay the shared Button's).
- Accepted as drawn: D-1, D-2, D-5, D-6 and D-8 keep the existing answer, question, pill, textarea and secondary-button styles of the design system; D-9 follows the spec's visibility rules; D-10 is the host's tab strip, outside this change; D-11 has no phone artboard to compare against.

## Missing note_origins rows in the second R-5 (author's investigation, 2026-11-09)

The second R-5 found four Ask notes (`DrlHLe0nQj1R`, `mlLRVcat98v0`, `h7VTNELwp7JR`, `WQAkEbIVwyqZ`) unverified in core but with no `note_origins` row. knowledge has no code path that deletes a `note_origins` row, and `POST /notes` commits the row before it declares the tier. Reproduced on the same scratch stack and data without opening the database from the host: six saves of the same name through `POST /api/addons/knowledge/notes` gave `wal-probe.md` to `wal-probe (5).md`, six rows read inside the container, each with `trust_declared_at` set, and all six still present after restarting the knowledge container. The R-5 had read and written the live WAL database from the host through the bind mount while the container held it open; SQLite's `-shm` index is not shared across that boundary, which is the likely cause. Not a defect of the change; later R-5s read the knowledge database only inside its container.
