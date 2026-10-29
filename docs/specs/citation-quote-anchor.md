# Ask citations quote the passage at their location, not the context before it

SPEC-ID: SPEC-ADDON-037

Approval:

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
   `start`. `anchor` is the offset in that joined text of the first chunk whose
   `timestamp_end` is greater than `start`. On the measured file, that is the chunk
   beginning at 1682.509 s ("季節の快適さを上げるアイテムとして…").
3. **Neighbour document snippet** (`_collect_document_snippets` with `expand`): the text
   is chunks `chunk_index - 1 .. chunk_index + 1` joined with `"\n\n"`, labelled with the
   target chunk's page or `chunk N`. `anchor` is the offset of the target chunk's text in
   that joined text.
4. Every other snippet (keyword and vector chunks of transcripts and documents,
   unexpanded document chunks, metadata, captions) keeps `anchor = 0`. Its text already
   starts at its labelled passage.
5. The per-file budget (`_cap_snippets`) keeps `anchor` on a clipped snippet unchanged.
   It never changes `text` other than by clipping its tail, as today.
6. `_quote_from_contexts` picks the snippet exactly as today: the first snippet whose
   location contains the citation's location as a whole token, else the first snippet.
   It then takes the quote from `text[start:]`:
   - `start = anchor` when `anchor < len(text)`;
   - otherwise (the budget clipped the text before the anchor)
     `start = max(0, len(text) - 200)`. The quote then shows the last part of what the LLM
     actually saw, which is the text closest to the location.
   The quote is stripped and capped at 200 characters with a trailing `…`, as today.
7. A citation whose LLM output carries its own `quote` keeps that quote, as today.

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
- No documentation page describes the quote's source, so none changes.

### 10. Non-functional

- Cost: one offset computed per expanded snippet. No query, no LLM call.
- Size: one integer per snippet in memory.
- Language: offsets are computed on the joined text. There are no language rules.

## Touch points

- `addons/intelligence/app/rag/context.py`: `ContextSnippet.anchor`;
  `_collect_transcript_snippets` (time-window snippets); `_collect_document_snippets`
  (expanded neighbour snippets); `_cap_snippets` (carry `anchor` on a clipped snippet).
- `addons/intelligence/app/rag/service.py`: `_quote_from_contexts`.
- Existing tests that construct `ContextSnippet` or assert quotes. These are updated to the
  new behaviour, never loosened.
- Consumers of the quote, read and not changed: `addons/intelligence/frontend/Page.tsx`
  (`?highlight=` fallback), `addons/intelligence/frontend/askNoteFormat.ts`, the MCP
  `ask` tool.
- Core: the `addons/intelligence` submodule pointer and `docs/specs/INDEX.md`. No protected
  path is edited.

## Invariants

I1. For a time-window transcript snippet labelled `start`, a citation choosing it quotes text that begins with the text of the first chunk in the window whose `timestamp_end` is greater than `start`.
I2. For an expanded document snippet, a citation choosing it quotes text that begins with the target chunk's text, not the preceding chunk's.
I3. The prompt sent to the LLM is byte-for-byte identical to the prompt before this change, for the same retrieved candidates.
I4. For a snippet built without surrounding context (anchor 0), the quote is identical to the quote before this change.
I5. The quote never contains text that is absent from the snippet `text` the LLM received.
I6. When the per-file budget clipped a snippet's text before its anchor, the quote is the last up-to-200 characters of the clipped text, capped by the existing rule.
I7. Which snippet a citation's quote comes from, and its `segment_location`, are the same as before this change.
I8. A citation that carries its own `quote` from the LLM keeps it unchanged.
I9. The quote is at most 200 characters plus a trailing `…` when cut, stripped of surrounding whitespace, as before.

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
  boundary, so it reads as a natural start. The budget fallback is rare. A leading mark
  would also stop the `?highlight=` text from matching the page.
- **Rewriting old saved notes.** They are the user's documents. They keep what was saved.
- **Document neighbour snippets labelled `chunk N` whose highlight fails for other
  reasons** (the trailing `…`). That is existing behaviour and is unchanged here.
