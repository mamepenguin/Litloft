# Refine accepts the refined text under the input's key

SPEC-ID: SPEC-ADDON-020

Approval:

## Summary

Transcript refine sends each window as JSON items `{"id", "text"}` and asks for
`{"items": [{"id", "text_refined"}]}` back. `_parse_llm_response` (`workers/refine.py`)
rejects the whole window when an item lacks `text_refined`. Local models copy the input's
key instead: measured 2026-10-11 against this machine's ollama with the production prompts
and 10 real chunks per call, the configured `transcript_refine` model
(`Qwen3.5-27B-Uncensored` Q4_K_M) answered with `text` in 3 of 3 calls and `gemma4:26b` in
2 of 2, each with every id present and the text refined. Every window is therefore
rejected and refine changes nothing; the job still reports completion. After this change an
item without `text_refined` is read from its `text` key, so refine works with these models.
Prompts and LLM clients do not change. For anyone who runs refine on a local model.

## Required items

### 1. Normal flow

SPEC-ADDON-020:

1. Refine sends the window and receives the response exactly as today.
2. `_parse_llm_response` reads each item's refined text from `text_refined` when the item
   has that key, and otherwise from `text`. Presence of the key decides: an item that has
   `text_refined` uses it even when its value is not a string (and is then rejected by
   step 3), and an item that has both uses `text_refined`.
3. Everything else about the parse is unchanged: the `{"items": [...]}` wrapper or a bare
   list, `id` coerced to int, the value must be a string, and the set of ids must equal the
   window's ids exactly.
4. The job applies the window as today (text, `text_refined_at`, `refined_model`, word
   realignment, embeddings, re-chunk, keyword index).

### 2. Failure cases

- An item with neither `text_refined` nor `text`, or whose chosen value is not a string:
  the window is rejected and its chunks keep their text, as today.
- A model that echoes the input unchanged under `text`: the chunk is stored with the same
  text and stamped as refined (`text_refined_at`, `refined_model`), the words are realigned,
  and the file is re-chunked and re-embedded. The transcript panel then marks those lines
  as refined, chunk boundaries may move, the text reads as before, and the
  `intelligence.refine.completed` event counts the chunks as refined. Nothing tells the
  user the model changed nothing. Accepted: measured responses changed the text
  (punctuation added), and the words a viewer reads are the same as after today's
  rejection.
- Ids missing or extra: the window is rejected, as today.

### 3. States

None new. A chunk is refined or not, as today.

### 4. Data read and written

Unchanged in kind: for windows that were rejected only for the key, `transcript_chunks`,
`transcript_words`, embeddings and the keyword index are now written as for any refined
window. Nothing else.

### 5. External services

The LLM call is unchanged (same prompts, same `format: "json"` request). A provider that
already answers with `text_refined` (the `claude` profile in R-5 of SPEC-ADDON-019) is read
as today.

### 6. Authorization

Unchanged: refine's feature gate and drive policy check.

### 7. Effect on existing features

- Refine with a model that answers with `text` now changes transcripts. Refine is
  destructive with no undo (`.claude/rules/design-decisions.md`, Transcript Refine); this
  is the behaviour the operator asked for by choosing that model.
- Refine runs only on a request: one file (`POST /refine/files/{id}`, **Clean up with AI**)
  or a folder (`POST /refine/folders`, the folder action, up to `MAX_FOLDER_FILES` files).
  No indexing path starts it, whatever `features.transcript_refine` says. A folder request
  with such a model now rewrites every transcript in it, with no undo; that is what the
  operator asks for by pressing it.
- No other caller uses `_parse_llm_response`.

### 8. Error behavior

None new. A rejected window is logged as today
(`refine: window offset=%d rejected (malformed / id mismatch)`).

### 9. User-visible behavior

With a local model that answers with `text`, **Clean up with AI** on a file, and the
folder refine action on every transcript in the folder, now correct the transcript
(punctuation, names, digits) instead of finishing with nothing changed.

### 10. Non-functional

None: one more dictionary lookup per item. LLM cost per window is unchanged; windows that
were wasted are now used.

## Touch points

- `addons/intelligence/app/workers/refine.py`: `_parse_llm_response`.
- Read, not changed: `_run_refine_job`, `refine_chunks`, `app/prompts/refine/*.jinja2`,
  `app/llm.py` (`generate_json`).
- Tests: new tests citing SPEC-ADDON-020 in `addons/intelligence/tests/`.
- The addon change is committed in the addon repository; the core bumps the
  `addons/intelligence` pointer.
- Docs: none; `docs/addons/intelligence.md` does not describe the response format.
- Review topic: `docs/process/reviews/fix-refine-response-key/`.
- No protected path.

## Invariants

I1. An item with a string `text_refined` yields that value, whether or not it also has
`text`.
I2. An item without `text_refined` and with a string `text` yields that `text` value.
I3. A window is rejected (its chunks keep their text and are not stamped, and the job
counts them as skipped) when any item has neither key, when an item's `text_refined` is
present but not a string (even if it also has a string `text`), or when an item without
`text_refined` has a `text` that is not a string.
I4. A window whose ids differ from the window's ids, by a missing or an extra id, is
rejected, whichever key the items use.
I5. A window whose items mix the two keys is accepted when every item has a string under
one of them.
I6. Given the response shape measured from the local model (`{"items": [{"id", "text"}]}`
with every id) for a file with no word rows (so re-chunking produces nothing),
`_run_refine_job` leaves each chunk holding its item's text, with `text_refined_at` set and
`refined_model` equal to the profile's model, and the `intelligence.refine.completed`
event reports `refined_count` equal to the number of chunks.
I7. This change edits neither `app/prompts/refine/*.jinja2` nor `_PUNCTUATION_INSTRUCTIONS`,
`_build_system_prompt` or `_build_user_prompt` in `workers/refine.py`, so the prompts sent
to the LLM are those the measurement used (a review check).

## Checked, no action

- **Passing a JSON schema to ollama (`format: <schema>`).** Measured: it makes both models
  answer with `text_refined` (5 of 5). It needs a schema parameter through `generate_json`
  and every client, and OpenAI-compatible local servers need their own form; the human
  chose the parse change.
- **Asking for `text` in the prompt instead.** Changes the prompt sent to every provider,
  including the Claude profile whose output was measured; the human chose the parse change.
- **Other features that ask for JSON.** No other prompt sends items under one key and asks
  for another: chapter consolidation sends candidates in the shape it asks back, and the
  rest send prose or plain values.
- **Whether local-model refine is good enough to use.** Quality is the operator's call when
  choosing the model; this change only stops a correct answer from being discarded.
