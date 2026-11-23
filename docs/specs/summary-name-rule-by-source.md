# Summary person-name rule by source kind

SPEC-ID: SPEC-ADDON-175
SPEC-ID: SPEC-ADDON-176

Approval:

## Summary

The intelligence addon's summaries (short/long and detailed) tell the model to write a
person's name only when it appears in the filename, title or description, and to call
everyone else by a role. The rule exists because names heard only in a speech-recognition
transcript are often misrecognized. It is applied to every source, so a novel or article,
whose names are printed in the text, is summarised with "the narrator" or "the speaker"
in place of the protagonist and the other characters. This change keeps the rule for
transcripts (video, audio, `.loft`) and lifts it for documents, where names that appear
in the body may be used. The "transcript may contain mis-recognized proper nouns" premise
of the shared rules is scoped to transcripts in the same way. The choice is made by the
code from the file's context type, with no extra LLM call.

- SPEC-ADDON-175: the person-name rule depends on the context type (documents may use
  names from the body; transcripts keep the filename/title/description rule).
- SPEC-ADDON-176: the shared proper-noun handling states the misrecognition premise only
  for transcripts.

## Required items

### 1. Normal flow

1. A summary job (on-index, manual generate, or regenerate; short/long or detailed)
   resolves the file's context type with `_classify_file_type`: `video` (including
   `.loft`), `audio` or `document`.
2. The worker builds the system prompt with that context type.
   `_build_system_prompt(context_type)` and `_build_detailed_system_prompt(context_type)`
   pass a `source_kind` of `transcript` (video, audio) or `text` (document) to the
   templates.
3. The templates render one of two person-name rules:
   - `transcript`: the current rule, verbatim in meaning: a name only if it is in the
     filename, title or description, even when a speaker introduces themselves;
     otherwise a role.
   - `text`: names that appear in the content, filename, title or description may be
     used. A person (a character, a first-person narrator, an author, an interviewee) is
     referred to by name when the content gives one; a role such as "the narrator" or
     "the author" is used only when no name is given.
4. `_common_rules.jinja2` renders its proper-noun section by the same `source_kind`:
   - `transcript`: unchanged (the misrecognition premise, "actively correct" and "handle
     with care").
   - `text`: proper nouns are written as they appear in the content. The text is not
     assumed to be misrecognized; when the content spells one entity in more than one way,
     the spelling used in the filename, title or description wins, otherwise the most
     frequent spelling in the content.
5. In the detailed prompt, the attribution examples that name "the narrator" stay for
   transcripts. For text they name the person, with "the author" / "the narrator" as the
   fallback when the content gives no name.
6. The LLM is called once, as today, and the output is stored as today.

### 2. Failure cases

- An unknown context type cannot reach the prompt builders: the workers already skip
  files whose type is not in `_SUPPORTED_CONTEXT_TYPES`. A builder that receives a value
  other than `video`, `audio` or `document` renders the `transcript` rules, the stricter
  side.
- A document whose sampled excerpt never prints the protagonist's name still yields a
  role; the prompt cannot recover a name that is not in the input.
- A scanned PDF whose text came from page OCR is a `document` and gets the `text` rules.
  OCR on printed pages misreads characters but does not invent names the way speech
  recognition does; see Checked, no action.

### 3. States

None. No status, column or workflow state changes. `detailed_status` transitions are
unchanged.

### 4. Data read and written

- Read: the same `IndexedFile` fields and content tables as today.
- Written: `file_summaries` rows as today. Existing rows are not regenerated; a file
  gets the new rule when its summary is next generated or regenerated.

### 5. External services

The LLM call is unchanged in number, routing (`app.llm_routing.resolve`), token budget and
timeout. Only the system prompt text differs, by a few lines.

### 6. Authorization

Unchanged. The summary endpoints and workers keep their current checks.

### 7. Effect on existing features

- Video, audio and `.loft` summaries receive the same person-name and proper-noun rules as
  today (the rendered text for `transcript` matches today's rule sentences).
- Detailed-summary citations, the summary edit API, embeddings of summaries and Ask read
  the stored text; they are unaffected.
- `prompt_loader.render` gains no new behavior; the templates take one more variable.

### 8. Error behavior

None new. Rendering failures surface as today (the job fails and is logged by the
existing worker path).

### 9. User-visible behavior

- A newly generated or regenerated summary of a document (EPUB, PDF, text, Markdown) may
  name people from the body: "尾高春彦は高校でサッカー同好会を作った" instead of
  "語り手は…".
- Summaries of video, audio and `.loft` files behave as today.
- Existing summaries do not change until regenerated.

### 10. Non-functional

- No additional LLM call; the prompt grows or shrinks by a few lines per source kind.
- Privacy unchanged: the same content is sent to the same routed profile.

## Touch points

- `addons/intelligence/app/prompts/summaries/_common_rules.jinja2`
- `addons/intelligence/app/prompts/summaries/detailed_system.jinja2`
- `addons/intelligence/app/prompts/summaries/short_long_system.jinja2`
- `addons/intelligence/app/workers/summaries.py` (`_build_system_prompt`,
  `_build_detailed_system_prompt` and their callers)
- `addons/intelligence/tests/test_summaries.py`
- `addons/intelligence/app/prompt_loader.py` (its docstring example calls `render` on
  `short_long_system.jinja2`; read only, edited if the example no longer renders)
- `.claude/rules/design-decisions.md` (LLM features; read, not edited)

## Invariants

I1. A short/long or detailed system prompt built for a `document` contains no instruction
restricting person names to the filename, title or description.
I2. A short/long or detailed system prompt built for `video` or `audio` contains the
instruction that a person's name is written only if it appears in the filename, title or
description, and otherwise a role is used, even when a speaker introduces themselves.
I3. A system prompt built for `document` states that names appearing in the content may be
used and that a role such as "the narrator" is used only when the content gives no name.
I4. A system prompt built for `video` or `audio` states that the content comes from a
transcript and may contain misrecognized proper nouns; one built for `document` does not
state that premise.
I5. A summary job makes exactly one LLM call per summary variant, as before, for every
context type.
I6. A builder given a context type other than `video`, `audio` or `document` renders the
transcript rules of I2 and I4.

## Checked, no action

- **An LLM classification step or a content-type branch (narrative/explanatory/...)
  chosen by the model.** The detailed prompt already asks the model to identify one of
  eight content types and apply type-specific notes within the same call. The defect is
  not in that classification; it is a source-kind rule that the code can decide exactly
  from the context type.
- **Adding more person-name rules for transcripts.** hako `L0T3esoEHig19gM9t_Wg0`
  (2026-10-01) closed prompt work on transcript names after two rounds; the residual
  misheard self-introduction is accepted. This change leaves the transcript rule as it is
  and only stops applying it to text.
- **Scanned PDFs (page OCR) treated as transcripts.** OCR errors on printed pages are
  character-level and rarer than speech-recognition name errors; splitting `document` by
  text origin would need a new signal in the summary path. Revisit if OCR'd books show
  wrong names.
- **Regenerating existing document summaries.** Local LLM cost over many files; a file
  picks up the rule when its summary is regenerated, as with earlier prompt changes.
- **Separate templates per source kind.** A conditional block keeps the shared structure
  in one place; the two branches differ by a few lines.
- **Measuring output quality against a real model in tests.** Output quality is checked
  in R-5 with real documents and a video; tests check the rendered prompts.
