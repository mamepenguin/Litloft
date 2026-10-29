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

This change adds the files that contain a rare keyword token, as an exact substring of
their transcript or text content, to the shortlist. Rare means the token occurs in at most
`rag.hierarchical.exact_match_max_files` files of the drive. A query about a topic is not
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
3. When the scoped path continues, the keywords are split on Unicode whitespace into
   tokens. Duplicates are dropped and the first occurrence is kept. A token shorter than 2
   characters is skipped.
4. For each token, the set of distinct files of drive D is looked up. Only files with
   `indexed_files.active = 1` count. A file is in the set when its transcript chunks or
   its text-content chunks contain the token as a phrase. The lookup uses the FTS tables
   `fts_transcripts`, `fts_text_content`, `fts_transcripts_word` and
   `fts_text_content_word`. Filenames and titles (`fts_files*`) are not searched, because
   the coarse retrieval already embeds the title.
5. A token whose set has between 1 and `exact_match_max_files` files contributes the whole
   set. A token with an empty set, or with more files than the cap, contributes nothing.
6. When `pre_scope_file_ids` is set (personal history composed with the shortlist), only
   contributed files that are in it are kept.
7. Contributed files already in the coarse shortlist are dropped. The rest are appended
   after the coarse files, in token order and then by `file_id` ascending within a token.
   Each file is added once. These are the "exact-match files".
8. The union (coarse files, then exact-match files) goes through the existing access-filter
   call `_filter_file_ids_via_internal_api`. What survives is the shortlist. If nothing
   survives, the existing access-filter-empty bypass runs.
9. The clue generator receives the summaries of the surviving **coarse** files only. Its
   input is the same as without this change.
10. Every clue search runs with `file_id_scope` equal to the whole surviving shortlist,
    exact-match files included. The RRF merge, the `len(scoped) < 2` full-search fallback
    and the answer stage are unchanged.
11. The `shortlist` SSE event lists the surviving shortlist in `file_ids`, coarse files
    first. It also carries `exact_match_file_ids`, the surviving exact-match files in
    their order (empty list when none).

Measured on production with the 20-file shortlist of the failing question plus the two
target files as scope: all three LLM clues from that run (`パネルヒーター おすすめ`,
`無印良品 パネルヒーター`, `セラミックファンヒーター おすすめ`) rank `Dd048AV_lAwZ` #1 and
`yMo4c841DCTC` #2. That is why step 9 leaves the clue generator alone.

### 2. Failure cases

- The FTS lookup raises for one table (syntax, locked DB, missing table): that table
  contributes nothing for that token, the error is logged at WARNING, and the remaining
  tables and tokens still run. This is the same safety net `_fts_lookup_required` uses.
- The whole lookup fails, for example because the search DB engine is unavailable: no
  exact-match files are added, a WARNING is logged, and Ask continues with the coarse
  shortlist. The answer does not fail because of this step.
- A token contains a double quote: the quote is removed before the phrase is built. A token
  left empty is skipped.
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
- The operator sees a WARNING log line naming the table and the error when a lookup fails.
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
- `addons/intelligence/app/rag/coarse_retriever.py` or a new module beside it: the
  drive-scoped exact-match lookup.
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

I1. On the scoped hierarchical path, an active file of drive D that has a keyword token in its transcript or text content, where that token is in at most `exact_match_max_files` such files of D, is inside the `file_id_scope` of every clue search, unless the personal-history scope or the access filter excludes it.
I2. A token found in more than `exact_match_max_files` files of drive D adds no file to the shortlist.
I3. No file of another drive, and no file with `active = 0`, is ever added to the shortlist.
I4. An exact-match file appears in the clue scope and in the `shortlist` SSE event only after the same access filter as the coarse files has passed it. A file the caller cannot access appears in no event.
I5. When `pre_scope_file_ids` is set, no file outside it is added.
I6. The clue generator receives exactly the summaries of the access-filtered coarse files, in coarse order, whether or not exact-match files were added.
I7. A failure of the exact-match lookup leaves Ask answering from the coarse shortlist, with no error event and a WARNING in the log.
I8. With `exact_match_max_files: 0` the shortlist, the clues and the sources are identical to the behaviour before this change.
I9. Every bypass branch (small drive, empty shortlist, low confidence, access-filter empty) runs the same search with the same scope as before this change.
I10. In the `shortlist` SSE event, `file_ids` lists the coarse files first in coarse order, then the exact-match files. `exact_match_file_ids` equals that tail. `top_score` is the best score among the surviving coarse files (0.0 when none survive).

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
