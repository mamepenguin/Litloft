# Ask: rare exact-match files join the hierarchical shortlist

SPEC-ID: SPEC-ADDON-035

Approval:

## Summary

Ask's hierarchical retrieval picks a shortlist of `rag.hierarchical.coarse_top_k` (20)
files by embedding similarity between the question and each file's title and summary.
After that, every clue search runs inside the shortlist. A file that only mentions the asked-about
thing in passing (one product among dozens in a sale round-up video) has a summary that
never names it, so it misses the shortlist and Ask answers as if the library knew nothing
about it.

Measured on production on 2026-10-29, drive `main` (6052 files), question
"お勧めされているパネルヒーターは？":

- The transform produced the keywords `パネルヒーター お勧め`.
- Only two files contain `パネルヒーター` (`Dd048AV_lAwZ`, `yMo4c841DCTC`). Neither is in
  the coarse top 80.
- An unscoped recall search with the same keywords ranks them #1 and #2.
- Ask answered with an unrelated ceramic fan heater.

This change adds to the shortlist the files whose transcript or text content matches a
rare keyword token as an FTS phrase (the matching rule is defined in step 4). Rare means
the token matches at most `rag.hierarchical.exact_match_max_files` files of the drive.
The two-file count above was measured with that rule, over the four tables of step 4. A query about a topic is not
affected. A query naming a specific thing that only a few files mention no longer loses
those files.

The change is for the single household user who asks Ask about something they remember
hearing or reading.

## Required items

### 1. Normal flow

1. The viewer asks a question in drive D. The structured transform produces the
   space-separated `keywords` string, as it does today.
2. `_run_hierarchical_retrieval` runs the coarse retrieval, the personal-history
   intersection and the bypass checks (small drive, empty shortlist, low confidence)
   exactly as today. On a bypass nothing below happens; the bypass search is already
   unscoped (or scoped to the personal-history set) and can find the files on its own.
3. When the scoped path continues, the `keywords` string that `_run_hierarchical_retrieval`
   receives is split on Unicode whitespace into tokens. That string is the flat
   `raw_keywords` of the transform. On a transform passthrough it is the question itself:
   a Japanese question without spaces then becomes one long token that matches nothing,
   and the step adds nothing. A multi-word required term (`Vision Pro`) is looked up word
   by word, and its aliases are not looked up. Each token is cleaned in this order:
   1. Double quotes are removed.
   2. Surrounding whitespace is stripped.
   3. A cleaned token shorter than 2 characters is skipped.
   4. Duplicates are dropped by cleaned value, keeping the first occurrence.
4. The matching rule: for each cleaned token, the set of distinct files of drive D whose
   rows match the FTS5 query `text : "<token>"` (the phrase, restricted to the `text`
   column) in any of `fts_transcripts`, `fts_text_content`, `fts_transcripts_word` and
   `fts_text_content_word`. The `file_id`, `chunk_index` and `page` columns of those tables
   are indexed too, so an unrestricted MATCH would let `LED` hit a file id or `150` hit a
   chunk number. Only files with
   `indexed_files.active = 1` count. This rule defines both "contains the token" and the
   file count in this spec. It inherits the tables' own limits: trigram tables cannot match
   fewer than 3 characters, and word tables match whole words with case and diacritic
   folding. It is not the substring rule of `app/exact_search.py`. Filenames and titles
   (`fts_files*`) are not searched, because the coarse retrieval already embeds the title.
   The request's `file_type` is ignored here, as it is by the coarse retrieval.
5. A token whose set has between 1 and `exact_match_max_files` files contributes the whole
   set. A token with an empty set, or with more files than the cap, contributes nothing.
6. When `pre_scope_file_ids` is set (personal history composed with the shortlist), only
   contributed files that are in it are kept.
7. Contributed files already in the coarse shortlist are dropped. The rest are appended
   after the coarse files, in token order and then by `file_id` ascending within a token.
   Each file is added once. These are the "exact-match files".
8. The union (coarse files, then exact-match files) goes through the existing access-filter
   call `_filter_file_ids_via_internal_api`, once. If no **coarse** file survives, the
   existing access-filter-empty bypass runs, exactly as before this change: drive-wide (or
   over `pre_scope_file_ids`), with no `shortlist` or `clues` event. That bypass search is
   unscoped, so it can still find the exact-match files. Otherwise the surviving coarse
   files and the surviving exact-match files form the shortlist.
9. The clue generator receives the summaries of the surviving **coarse** files only. Its
   input is the same as without this change.
10. Every clue search runs with `file_id_scope` equal to the surviving coarse files
    followed by the surviving exact-match files. The RRF merge, the `len(scoped) < 2`
    full-search fallback and the answer stage are unchanged.
11. `ShortlistResult` keeps `file_ids`, `scores`, `top_score` and `drive_file_count` for
    the coarse files only (`scores` stays parallel to `file_ids`). It gains
    `exact_match_file_ids: tuple[str, ...]`, which is empty by default. The return shape of
    `_run_hierarchical_retrieval` is unchanged.
12. The `shortlist` SSE event sends `file_ids` as the surviving coarse ids followed by
    `exact_match_file_ids`. It also sends `exact_match_file_ids` itself (an empty list when
    none). `top_score` is the best surviving coarse score, as before.
13. The lookup is a synchronous function that reads the search DB. It is called only
    through `asyncio.to_thread`, as `coarse_retrieve` and `fetch_long_summaries` are, so
    it never runs on the event-loop thread. `tests/test_event_loop_discipline.py` stays
    unmodified and passes. That guard sees only the session factories and not
    `get_search_engine().connect()`, so I5 is checked by its own test.
14. With `exact_match_max_files: 0` the lookup is not called at all.

Measured on production with the 20-file shortlist of the failing question plus the two
target files as scope: all three LLM clues from that run (`パネルヒーター おすすめ`,
`無印良品 パネルヒーター`, `セラミックファンヒーター おすすめ`) rank `Dd048AV_lAwZ` #1 and
`yMo4c841DCTC` #2. That is why step 9 leaves the clue generator alone.

### 2. Failure cases

- The FTS lookup raises for one table for a token (syntax, locked DB, missing table): that
  **token** contributes nothing, because a count from fewer tables could fall under the cap
  by accident. The error is logged at WARNING with the table and the token. The other
  tokens still run.
- The whole lookup fails, for example because the search DB engine is unavailable: no
  exact-match files are added, a WARNING is logged, and Ask continues with the coarse
  shortlist. The answer does not fail because of this step, and no error event is sent.
- A token made only of quotes or whitespace is empty after cleaning (step 3) and is
  skipped without a lookup.
- `exact_match_max_files` is absent or YAML `null`: the default of 10 applies with no log.
  It is present but not an integer ≥ 0 (negative, float, string, bool): one WARNING is
  logged per config load, and the default of 10 applies. The check lives where
  `rag.hierarchical` is parsed from the YAML.
- The access filter fails closed (it returns an empty set): the existing
  access-filter-empty bypass runs, as today.

### 3. States

None. The step is stateless: it reads the index on every question and keeps no cache.

### 4. Data read and written

- Read: the search DB tables `fts_transcripts`, `fts_text_content`,
  `fts_transcripts_word`, `fts_text_content_word` and `indexed_files` (`drive`,
  `active`).
- Written: nothing. No table, file or cache is written.
- Config read: the new key `rag.hierarchical.exact_match_max_files` (integer ≥ 0, default
  10). `0` turns the step off.

### 5. External services

- The LLM: none added. No new LLM call, and the clue generator's input does not change.
- The core Internal API `POST /api/internal/filter-file-ids`: the existing call, now with
  up to `coarse_top_k + (number of tokens × exact_match_max_files)` ids instead of
  `coarse_top_k`. When it is slow or down, the existing behaviour applies (it fails
  closed, and the access-filter-empty bypass runs).

### 6. Authorization

- The drive boundary is enforced in the lookup itself: the SQL joins `indexed_files` and
  keeps only `drive = D AND active = 1`. A file of another drive never enters the union,
  so it is never sent to the access filter either.
- The viewer's access is enforced by the existing access-filter call in step 8, which
  now covers the exact-match files too. `retrieve_with_keywords` applies its access and
  trust filters again downstream, unchanged.
- `_fts_lookup_required` (the required-term hard filter) is not modified. It stays
  drive-agnostic and is narrowed later by the caller's scope.

### 7. Effect on existing features

- The `/ask` streaming path (used by the web UI and the MCP `ask` tool) and
  `answer_question` (non-streaming, used by the eval harness in `app/evals/stages.py`)
  both call `_run_hierarchical_retrieval`, so both get the change. Eval baselines for Ask
  can move.
- Find (`_find_files`) does not call `_run_hierarchical_retrieval` and is unaffected.
- The agentic Ask loop searches through `app/rag/tools/search_files.py`, which calls
  `retrieve_with_keywords` directly, without a shortlist. It is unaffected.
- The legacy path (`rag.hierarchical.enabled: false`) and every bypass branch are unchanged.
- The `shortlist` SSE event gains one field. The intelligence frontend does not read the
  `shortlist` event, and neither does the MCP server.

### 8. Error behavior

- The viewer sees nothing new on failure: Ask answers from the coarse shortlist as it does
  today.
- The operator sees a WARNING log line naming the table, the token and the error when a
  lookup fails, and one WARNING when the config value is invalid.
- When exact-match files are added, one DEBUG line records the token, the file count of
  each token, and which tokens were over the cap.

### 9. User-visible behavior

- An Ask question naming a rare word that appears in a transcript or document can now cite
  that file, where before it answered from unrelated files.
- A question whose words are all common (each in more than `exact_match_max_files` files)
  is answered exactly as before.
- SSE: `shortlist.file_ids` can be longer than `coarse_top_k`, and it carries the new
  `exact_match_file_ids` list.
- `docs/addons/intelligence.md`: the Ask steps and the `rag.hierarchical` config block
  name the new key and what it does. `search-config.yml.example` gains the key with its
  default.

### 10. Non-functional

- Cost: no LLM call. At most 4 FTS queries per token. The transform emits a handful of
  tokens.
- Size: the shortlist grows by at most `tokens × exact_match_max_files` files. At the
  default of 10 and a typical 2–4 tokens that is 20–40 files. Clue searches are scoped
  searches and their cost does not grow meaningfully with the scope size.
- Latency: no measurable addition expected next to the 12–15 s an Ask takes today on
  production. The R-5 run records Ask's `took_ms` before and after on the failing
  question.
- Privacy: no new data leaves the container. Exact-match files reach the LLM only if they
  rank in the final `top_k`, like any other candidate.
- Language: phrase match against the existing trigram and word FTS tables. There are no
  language-specific rules.

## Touch points

- `addons/intelligence/app/rag/service.py`: `_run_hierarchical_retrieval` (the union
  before the access filter; scope of the clue searches) and the `shortlist` SSE event
  payload in the streaming path.
- `addons/intelligence/app/rag/coarse_retriever.py`: `ShortlistResult` gains
  `exact_match_file_ids`. The drive-scoped exact-match lookup lives here or in a new
  module beside it.
- Existing tests whose expectations move with the change: `tests/test_rag_hierarchical.py`
  and `tests/test_rag_hierarchical_personal_history.py`. They cover the access-filter
  argument, the `fetch_long_summaries` ids, `file_id_scope` and the `shortlist` payload.
  They are updated to the new behaviour, never loosened.
- `tests/test_event_loop_discipline.py`: must pass unmodified.
- `addons/intelligence/app/config.py`: `HierarchicalRagConfig.exact_match_max_files`
  and its loading from `search-config.yml`.
- `addons/intelligence/search-config.yml.example`: the new key.
- Search DB tables read: `fts_transcripts`, `fts_text_content`,
  `fts_transcripts_word`, `fts_text_content_word`, `indexed_files`.
- Core Internal API `POST /api/internal/filter-file-ids` (called, not changed).
- SSE event `shortlist` from `/ask` (a field added).
- `docs/addons/intelligence.md` (Ask steps, config block).
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, the
  active-file rule, "Ask applies access control twice"), `.claude/rules/backend-conventions.md`
  (no language-dependent rules).
- Core: the `addons/intelligence` submodule pointer and `docs/specs/INDEX.md`. No protected
  path is edited.

## Invariants

I1. On the scoped hierarchical path, if a cleaned keyword token matches (by the step 4 rule) at least 1 and at most `exact_match_max_files` active files of drive D, every one of those files is inside the `file_id_scope` of every clue search, unless the personal-history scope or the access filter excludes it.
I2. A token adds no file when it matches more than `exact_match_max_files` files of D, when it is shorter than 2 characters after quote removal, or when it matches only in filename or title tables (`fts_files*`).
I3. No file of another drive, no file with `active = 0`, and (when `pre_scope_file_ids` is set) no file outside it is ever added to the shortlist. Neither is a file whose only match is in the `file_id`, `chunk_index` or `page` column.
I4. An exact-match file appears in the clue scope and in the `shortlist` SSE event only after the same access filter as the coarse files has passed it. A file the caller cannot access appears in no event.
I5. The exact-match lookup never runs on the event-loop thread.
I6. The clue generator receives exactly the summaries of the access-filtered coarse files, in coarse order, whether or not exact-match files were added.
I7. When one table's lookup raises for a token, that token adds no file and the other tokens still run. When the whole lookup fails, Ask answers from the coarse shortlist. In both cases no error event is sent, and a WARNING is logged.
I8. With `exact_match_max_files: 0`, no exact-match lookup is made, and the access-filter argument, the clue scopes, the clues and the sources are identical to the behaviour before this change. With the key absent, `null` or invalid, the cap is 10.
I9. Every branch that does not reach the clue searches runs the same search with the same scope as before this change. The branches are: `rag.hierarchical.enabled: false` or no drive, small drive, empty shortlist or intersection, low confidence, and no coarse file surviving the access filter. The first four make no exact-match lookup. The `fallback_full_search` pass keeps `pre_scope_file_ids` as its scope.
I10. In the `shortlist` SSE event, `file_ids` lists the surviving coarse files in coarse order, then the exact-match files. `exact_match_file_ids` equals that tail: token order, then `file_id` ascending within a token, each file once, and no file that is also a coarse file. `top_score` is the best surviving coarse score.

## Checked, no action

- **Feeding the exact-match files' summaries to the clue generator.** Their summaries do
  not name the term (the round-up summary describes a sale, not a heater), so they would
  only dilute the prompt. All three clues from the failing run already rank the targets
  #1 and #2 once the files are in scope.
- **Raising `coarse_top_k`.** The targets are not in the coarse top 80, and a wider
  shortlist weakens the narrowing for every other question.
- **Always running an unscoped search alongside and merging it.** This doubles the
  retrieval cost on every question and lets unrelated hits back in. That trade is broader
  than this defect.
- **Making `_fts_lookup_required` drive-scoped.** Its result is intersected with the
  caller's scope downstream, and changing it touches the required-term ladder, which is
  out of scope. The new lookup is drive-scoped on its own.
- **Synonyms, spelling variants and transcription errors** (`パネルヒータ`, `パネル型ヒーター`).
  Exact match cannot cover them. Those questions behave as today.
- **Two-character CJK tokens.** The trigram tables cannot match fewer than 3 characters,
  and the word tables keep a CJK run as one token, so `電気` will not match inside
  `電気毛布`. Such a token adds nothing, which is today's behaviour.
- **Filename and title matches.** The coarse retrieval embeds the title, and the hybrid
  search's filename channel already ranks title hits. Searching `fts_files*` here would
  add files that the shortlist already favours.
- **A cap on the total number of added files.** The per-token cap bounds the total by
  token count, and the transform emits few tokens. No measured question has needed more.
- **Caching the per-token counts.** The lookups are indexed FTS queries, and the index
  changes as files are scanned. A cache would add invalidation for no measured gain.
- **The `len(scoped) < 2` full-search fallback.** It is left as is; this change addresses
  the case where the scoped pass returns plenty of wrong files.
- **Looking up `structured.required` canonicals and aliases as whole phrases** instead of
  splitting the flat keyword string. That would cover multi-word terms and cross-script
  aliases. It is a wider change to which questions the step covers; the flat string is
  what every clue search already receives.
- **Skipping the step on a transform passthrough.** The passthrough string makes one long
  Japanese token that matches nothing. An English passthrough yields function words,
  which exceed the cap, and content words, which can legitimately add files. A special
  case buys nothing.
- **Measurement column scope.** The two-file count for `パネルヒーター` was taken with an
  unrestricted MATCH. A 7-character katakana token cannot occur in a file id, chunk
  number or page number, so the `text`-only count is the same.
- **Respecting `file_type` in the lookup.** The coarse retrieval ignores it too, and the
  clue searches apply it, so a file of another type in the scope is never retrieved. The
  cost is that such files count toward the cap. That is rare, and it errs toward adding
  nothing.
- **Being in scope is not being retrieved.** `search()` applies `file_id_scope` after each
  channel has chosen its top candidates drive-wide, so with very common clue terms an
  exact-match file can still drop out. For the measured question it ranks #1 and #2 under
  every clue. The R-5 run checks the failing question end to end.
- **The `required` hard filter inside clue searches** can remove an exact-match file whose
  text does not match the required aliases. This is unchanged behaviour and a separate
  concern.
- **Unverified files.** The access filter applies `trust_tier="verified"`, so an unverified
  file with the rare token is not added. This is consistent with "Ask cites only verified
  files".
- **A list cap on `POST /api/internal/filter-file-ids`.** There is none today. The ids grow
  by at most `tokens × 10`.
- **Reverting to the scoped path over exact-match files when no coarse file survives the
  access filter.** That would change a bypass that exists today. The drive-wide bypass
  search can find the exact-match files anyway (step 8).
