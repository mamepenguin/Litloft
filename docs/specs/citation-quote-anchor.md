# Ask citations quote the passage at their location, not the context before it

SPEC-ID: SPEC-ADDON-037

Approval: sha256:7d0af8ae6e923834a44530ddf96355f69f8e2887ddf50d9095290e878228cdc5 Yuichi Senga 2026-10-30

## Summary

When Ask cites a file, the citation card shows a quote: the first 200 characters of the
context snippet whose location label matches the citation's location. Two kinds of
snippet carry surrounding context in front of the labelled passage:

- A video or audio **time-window snippet** is labelled with the start of a search-matched
  segment. Its text starts `rag.transcript_window_seconds` (60 s) earlier.
- A document **neighbour snippet** is labelled with the page (or chunk) of the matched
  chunk. Its text starts with the chunk before it.

So the quote shows what was said about a minute before the cited moment, or the paragraph
before the cited one.

Measured on production on 2026-10-30, drive `main`, file `Dd048AV_lAwZ`, question
"お勧めされているパネルヒーターは？":

- The citation at `28:02` (the panel heater segment, 1682.5–1738.3 s) quoted
  "続いてこちら布団乾燥機ですね…". That is the futon dryer passage at about 27:04.
- The citation at `27:04` quoted the HDD price passage from about 26:0x.
- The seek target (`segment_location`) was correct in both cases. Only the quote was
  wrong.

The quote is also what a saved Ask note records, what the MCP `ask` tool returns, and the
text the file page highlights when a citation has no seekable location. This change makes
a snippet remember where its labelled passage starts, and starts the quote there. The text
sent to the LLM does not change.

## Required items

### 1. Normal flow

1. Context assembly builds snippets as today. Each `ContextSnippet` gains
   `anchor: int`, the character offset in `text` where the passage named by `location`
   begins. The default is 0.
2. **Time-window transcript snippet** (`_collect_transcript_snippets`, strategy 3): the
   text is the chunks of `[start - window, end + window]` joined with `" "`, labelled
   `start`. `anchor` is the position, in that joined text, of the first chunk whose
   `timestamp_end` is greater than `start`. On the measured file, that is the chunk
   beginning at 1682.509 s ("季節の快適さを上げるアイテムとして…").
3. **Neighbour document snippet** (`_collect_document_snippets` with `expand`): the text
   is chunks `chunk_index - 1 .. chunk_index + 1` joined with `"\n\n"`, labelled with the
   target chunk's page or `chunk N`. `anchor` is the position of the target chunk in that
   joined text.
4. The positions in steps 2 and 3 are computed while joining: the sum of the lengths of
   the non-empty chunks placed before it, plus their separators. They are never found by
   searching the joined text, because adjacent chunks can have identical text (`[音楽]`,
   boilerplate) and a search would land on an earlier copy.
5. Every other snippet (keyword and vector chunks of transcripts and documents,
   unexpanded document chunks, metadata, captions) keeps `anchor = 0`. Its text already
   starts at its labelled passage.
6. The per-file budget (`_cap_snippets`) clips the overflowing snippet with
   `trim_to_sentence_boundary(text[:remaining])`. That trims the tail, and it can also drop
   a leading fragment and surrounding whitespace. `removed` is the number of characters
   the trim removed from the front of its input. The trim reports this number itself (a
   companion function returning `(trimmed, removed)`, which `trim_to_sentence_boundary`
   delegates to). It is never found by searching the text, for the reason in step 4.
   - In the normal branch, `removed` is `leading_cut` plus the leading whitespace that
     `.strip()` drops after it.
   - In the fallback branch, where the trimmed result is empty and the function returns
     `snippet.strip()`, `removed` is the snippet's leading whitespace.

   The clipped snippet's `anchor` becomes:
   - `anchor - removed` when `removed <= anchor` and that is less than the clipped length:
     the cited passage starts inside the clipped text;
   - `0` when `removed > anchor`: the clipped text begins inside or after the cited
     passage's start, so its own start is the closest point;
   - `len(clipped text)` when `anchor - removed` is at or beyond the clipped length: the
     cited passage did not survive the budget ("lost").

   So `anchor` is always an `int` with `0 <= anchor <= len(text)`, and `anchor == len(text)`
   means the passage was lost. Snippets that are kept whole keep their anchor.
7. `_quote_from_contexts` picks the snippet exactly as today: the first snippet whose
   location contains the citation's location as a whole token, else the first snippet.
   The quote is today's rule applied to `text[anchor:]` instead of `text`: stripped, then
   capped at 200 characters with a trailing `…` when cut. When the passage was lost,
   `text[anchor:]` is empty and so is the quote. The text before the cited moment is not
   shown as if it were the citation, and text the LLM never saw is not shown either.
8. A citation whose LLM output carries its own `quote` keeps that quote, as today.
9. `_to_citation_dict` uses this quote everywhere it uses the quote today. A location is
   "accepted" when `_to_citation_dict` uses it as given: a recognised marker that is not
   distrusted (a `page N` on an EPUB or a `section N` on anything else is distrusted).
   Accepted locations keep their `segment_location`. For any other location,
   `segment_location` is chosen from the quote (`_segment_location_for`), as today. It is
   now chosen from the cited passage instead of the lead-in, and it can differ from before.
   When the passage was lost, the quote is empty, and `_segment_location_for` falls back
   to the candidate's first match, as it does for an empty quote today.

### 2. Failure cases

- No chunk of a time-window snippet ends after `start` (cannot happen for a matched
  segment, but the data is not constrained): `anchor = 0`, today's behaviour.
- The target chunk is missing from a neighbour fetch (deleted between search and
  assembly): `anchor = 0`.
- The text from `start` is empty after stripping: the quote is the empty string, and the
  card shows no quote, as for an empty snippet today.

### 3. States

None. Snippets are built per request and not stored.

### 4. Data read and written

- Read: `transcript_chunks` and `fts_text_content`, as today. No new query.
- Written: nothing.

### 5. External services

The LLM: the prompt is unchanged byte for byte. Snippet `text`, order and location labels
are not altered, and `anchor` is never rendered into the prompt.

### 6. Authorization

Unchanged. Quotes come from snippets of retrieved, access-filtered files only.

### 7. Effect on existing features

- Ask web UI citation cards: the quote text changes. The `?highlight=` fallback in
  `addons/intelligence/frontend/Page.tsx` uses the quote when the location is not a
  timestamp, page or section (for example `chunk N`). It now highlights the cited chunk
  rather than the one before it. The frontend code does not change.
- Saved Ask notes (`askNoteFormat.ts`) record the new quote. Notes saved earlier keep
  their old text.
- The MCP `ask` tool returns the new quote. It reads the field as is.
- The agentic Ask loop does not build quotes from contexts and is unaffected.
- `segment_location` for citations whose LLM location is not a marker (step 9), and with
  it the eval metric `citation_segment_match` (`app/evals/stages.py`), can move. Citations
  with a marker location keep their `segment_location`.
- The progressive `citation` SSE event and the final `citations` event both go through
  `_to_citation_dict`, so they carry the same quote.
- Everything else that reads `ContextSnippet` sees the same `text` and `location`. That
  is prompt building in `app/rag/prompt.py`, plus duplicate detection and the per-file
  budget in `app/rag/context.py`.

### 8. Error behavior

Nothing new. No new failure path, no new log line.

### 9. User-visible behavior

- A citation at `m:ss` on a video or audio file quotes the words spoken from that moment,
  not those a minute earlier.
- A citation at `page N` or `chunk N` on a document quotes the cited chunk, not the one
  before it.
- Citations whose snippet has no surrounding context are unchanged.
- A citation whose cited passage was cut off by the per-file budget shows no quote, where
  it used to show the lead-in.
  - With an accepted location, its seek target is unchanged.
  - With any other location, it seeks to the file's first match.
  - A `chunk N` citation also loses its `?highlight=` and opens the file at the top.
- A citation whose location is not accepted can seek to a different, closer moment,
  because its target is chosen from the anchored quote.
- No documentation page describes the quote's source, so none changes.

### 10. Non-functional

- Cost: one offset computed per expanded snippet. No query, no LLM call.
- Size: one integer per snippet in memory.
- Language: offsets are computed on the joined text. There are no language rules.

## Touch points

- `addons/intelligence/app/rag/context.py`: `ContextSnippet.anchor`;
  `_collect_transcript_snippets` (time-window snippets); `_collect_document_snippets`
  (expanded neighbour snippets); `_cap_snippets` (carry `anchor` on a clipped snippet).
- `addons/intelligence/app/rag/service.py`: `_quote_from_contexts`; `_to_citation_dict`
  and `_segment_location_for` read the new quote (not edited unless needed to pass it).
- `addons/intelligence/app/text_utils.py`: `trim_to_sentence_boundary`, read to compute
  `removed` in step 6. It may be given a way to report the leading cut, and its existing
  return value and callers must not change.
- `addons/intelligence/app/evals/stages.py` (`citation_segment_match`): read, not changed.
- Existing tests that construct `ContextSnippet` or assert quotes. These are updated to the
  new behaviour, never loosened.
- Consumers of the quote, read and not changed: `addons/intelligence/frontend/Page.tsx`
  (`?highlight=` fallback), `addons/intelligence/frontend/askNoteFormat.ts`, the MCP
  `ask` tool.
- Core: the `addons/intelligence` submodule pointer and `docs/specs/INDEX.md`. No protected
  path is edited.

## Invariants

I1. For an unclipped time-window transcript snippet labelled `start`, the quote of a citation choosing it equals today's quote rule (strip, then cap at 200 with `…`) applied to the joined text from the position of the first chunk whose `timestamp_end` is greater than `start`. This holds even when an earlier chunk in the window has identical text.
I2. For an unclipped expanded document snippet, the quote of a citation choosing it equals today's quote rule applied to the joined text from the target chunk's position, not the preceding chunk's. This holds even when the two chunks have identical text.
I3. The prompt sent to the LLM is byte-for-byte identical to the prompt before this change, for the same retrieved candidates.
I4. For a snippet built without surrounding context (anchor 0, unclipped), the quote is identical to the quote before this change.
I5. The quote never contains text that is absent from the snippet `text` the LLM received, and never contains text from before the anchor.
I6. When the per-file budget clipped a snippet so that its cited passage did not survive, a citation choosing it has an empty quote. When the passage survived, the quote begins where the passage begins in the clipped text, or at the clipped text's start if the clip cut into the passage.
I7. Which snippet a citation's quote comes from is the same as before this change, and a citation whose location is accepted (a recognised, not distrusted marker) keeps the same `segment_location`.
I8. A citation that carries its own `quote` from the LLM keeps it unchanged.
I9. The quote is at most 200 characters plus a trailing `…` when cut, stripped of surrounding whitespace, as before.
I10. `trim_to_sentence_boundary` returns the same string as before this change for every input, so the summaries worker and every other caller see no difference.

## Checked, no action

- **Relabelling the window snippet at `start - window`.** That would move the seek target
  a minute early and would change the prompt.
- **Trimming the window text so it starts at `start`.** This removes the context the LLM
  uses to understand the match, which is why the window exists.
- **The LLM choosing an unrelated location.** In the measured case, the `27:04` citation
  points at the futon dryer passage. After this change it quotes that passage faithfully.
  It does not quote the heater. Choosing the location is the LLM's job and is out of scope.
- **Duplicate citations of the same location.** The measured run repeated one location
  three times. This is unchanged and a separate concern.
- **A leading `…` on quotes that start mid-snippet.** The anchored start is a chunk
  boundary, so it reads as a natural start. A leading mark would also stop the
  `?highlight=` text from matching the page.
- **When the budget lost the cited passage: other quotes.**
  - The tail of the clipped text before the anchor is the lead-in, which is the defect
    being fixed.
  - The cited passage taken from the unclipped text would show words the LLM never read,
    under a claim it made from other words.
  - An empty quote keeps the seek target and hides nothing true. The time-window snippets
    come last in a file's budget, so this case is not rare.
- **A very short quote** when the clip lands just after the anchor. It is the true start of
  the cited passage. It is shown as is.
- **Rewriting old saved notes.** They are the user's documents. They keep what was saved.
- **Document neighbour snippets labelled `chunk N` whose highlight fails for other
  reasons** (the trailing `…`). That is existing behaviour and is unchanged here.
