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
in place of the protagonist and the other characters. This change keeps the prompts for
transcripts (video, audio, `.loft`) byte-identical to today and gives documents a text
variant, where names that appear in the body may be used and the "misrecognized proper
nouns" premise is not stated. The choice is made by the code from the file's context
type, with no extra LLM call.

- SPEC-ADDON-175: the person-name rule and its attribution examples depend on the context
  type. Invariants I1, I2, I3, I5, I6, I7.
- SPEC-ADDON-176: the shared proper-noun handling states the misrecognition premise only
  for transcripts. Invariants I1, I4, I6, I7.

## Required items

### 1. Normal flow

1. A summary job (on-index, manual generate, or regenerate; short/long or detailed)
   resolves the file's context type with `_classify_file_type`: `video` (including
   `.loft`), `audio` or `document`.
2. The worker passes that same context type to both the user-prompt builder (as today) and
   the system-prompt builder. `_build_system_prompt(context_type=None)` and
   `_build_detailed_system_prompt(context_type=None)` take it as an optional argument and
   pass `source_kind` to the templates: `text` for `document`, `transcript` for every other
   value, `None` and the no-argument call included.
3. Every template that reads `source_kind` treats a missing value as `transcript`
   (`source_kind | default("transcript")`), so `_common_rules.jinja2` rendered on its own
   with no variables gives exactly today's text.
4. For `transcript`, every system prompt is byte-identical to today's for every
   `output_language`. Nothing in the transcript branch is reworded, including the premise
   "(speech recognition or text extraction)".
5. For `text`, these parts differ and nothing else. Each substitution replaces exactly the
   named line or span; no blank line is added or removed around it, and every other line,
   blank lines included, is the same as the transcript prompt:

   **`_common_rules.jinja2`, the whole `## Handling proper nouns` section**: the span from
   the line `## Handling proper nouns` through the last bullet under `### Handle with care`
   is replaced by the block below. The blank line after that span, before
   `## Handling numeric information`, stays.

   ```
   ## Handling proper nouns

   This content is text, so proper nouns are written as they appear in it.

   - When the content spells one entity in more than one way, use the spelling in the filename, title or description; otherwise use the most frequent spelling in the content
   - Do not substitute a different spelling, character or reading by guesswork
   ```

   **`_common_rules.jinja2`, Procedural notes**: the bullet beginning "For culinary names,
   technique names, and operation names that ASR tends to distort" is removed as a whole
   line, leaving no line in its place. The numeric-information section is the same in
   both branches.

   **`short_long_system.jinja2`**: the bullet beginning "In both short and long, write a
   person's name only if" is replaced by:

   ```
   - In both short and long, use a person's name when it appears in the content, filename, title or description (a character, a first-person narrator, an author, an interviewee); use a role such as the narrator, the author or the speaker only when the content gives no name
   ```

   **`detailed_system.jinja2`, Common rules**:
   - "Maintain the narrator's tone and energy but write from an observer (third-person)
     perspective" becomes "Maintain the source's tone and energy but write from an
     observer (third-person) perspective; a first-person narrator is referred to by name
     when the content gives one". The indented `e.g. "states that ...", ...` line under it
     stays unchanged.
   - In the Speculation, Evaluation and evaluative-words examples, the words "the
     narrator" become "the author" ("the author speculates that ...", "the author
     evaluates ... positively", "the author describes it as ..."); the rest of each line is
     unchanged. "the author calls it ..." stays.
   - The bullet beginning "Write a person's name only if it appears in the filename" is
     replaced by:

     ```
     - Use a person's name when it appears in the content, filename, title or description (a character, a first-person narrator, an author, an interviewee). Use a role such as the narrator or the author only when the content gives no name
     ```
6. The LLM is called once per summary variant, as today, and the output is stored as today.

### 2. Failure cases

- A context type other than `video`, `audio` or `document` cannot reach the builders
  through the workers (they skip unsupported types); if one does, it gets the transcript
  prompt, the stricter side.
- A document whose sampled excerpt never prints the protagonist's name still yields a
  role; the prompt cannot recover a name that is not in the input.
- A scanned PDF whose text came from page OCR is a `document` and gets the text prompt.
  See Checked, no action.
- A Markdown note whose text came from a transcript is a `document` and gets the text
  prompt. See Checked, no action.

### 3. States

None. No status, column or workflow state changes. `detailed_status` transitions are
unchanged.

### 4. Data read and written

- Read: the same `IndexedFile` fields and content tables as today.
- Written: `file_summaries` rows as today. Existing rows are not regenerated; a file
  gets the new prompt when its summary is next generated or regenerated.

### 5. External services

The LLM call is unchanged in number, routing (`app.llm_routing.resolve`), token budget and
timeout. Only the system prompt text for documents differs.

### 6. Authorization

Unchanged.

### 7. Effect on existing features

- Video, audio and `.loft` summaries receive byte-identical system prompts.
- `scripts/poc_hierarchical_summary.py` calls `_build_detailed_system_prompt()` for its
  "existing detailed prompt" baseline on PDF documents. It is changed to pass
  `"document"`, so its baseline stays the prompt production uses for documents.
- Detailed-summary citations, the summary edit API, embeddings of summaries and Ask read
  the stored text; they are unaffected.
- Goldens: before any template is edited, the full system prompts of both builders are
  captured from the unchanged templates for `output_language` `ja`, `en`, `auto` and `fr`
  (a value outside the table), as `summaries_short_long_system_<lang>.txt` and
  `summaries_detailed_system_<lang>.txt`, and `_baseline.py` is extended to write them
  (building the transcript prompt). The existing `summaries_common_rules.txt` stays as it
  is. These goldens are the "before" reference for I1. The document expectation is not a
  golden: the test derives it from the transcript golden by applying step 5's
  substitutions.

### 8. Error behavior

None new. Rendering failures surface as today.

### 9. User-visible behavior

- A newly generated or regenerated summary of a document (EPUB, PDF, text, Markdown) may
  name people from the body: "尾高春彦は高校でサッカー同好会を作った" instead of
  "語り手は…".
- Summaries of video, audio and `.loft` files behave as today.
- Existing summaries do not change until regenerated.

### 10. Non-functional

- No additional LLM call.
- Privacy unchanged: the same content is sent to the same routed profile.

## Touch points

- `addons/intelligence/app/prompts/summaries/_common_rules.jinja2`
- `addons/intelligence/app/prompts/summaries/detailed_system.jinja2`
- `addons/intelligence/app/prompts/summaries/short_long_system.jinja2`
- `addons/intelligence/app/workers/summaries.py` (`_build_system_prompt`,
  `_build_detailed_system_prompt` and their callers)
- `addons/intelligence/tests/test_summaries.py`
- `addons/intelligence/tests/test_prompt_loader.py`
- `addons/intelligence/tests/golden_prompts/_baseline.py`
- `addons/intelligence/tests/golden_prompts/summaries_common_rules.txt` (kept unchanged)
- `addons/intelligence/tests/golden_prompts/summaries_short_long_system_{ja,en,auto,fr}.txt` (new)
- `addons/intelligence/tests/golden_prompts/summaries_detailed_system_{ja,en,auto,fr}.txt` (new)
- `addons/intelligence/scripts/poc_hierarchical_summary.py` (passes `"document"`)
- `.claude/rules/design-decisions.md` (LLM features; read, not edited)

## Invariants

I1. For `output_language` `ja`, `en`, `auto` and `fr`, the short/long and detailed system
prompts built for `video`, for `audio`, for `None`, with no argument, and for `text` (a raw
file type, not a context type) are byte-identical to the goldens captured from the
unchanged templates, and `_common_rules.jinja2` rendered with
no variables equals `tests/golden_prompts/summaries_common_rules.txt`.
I2. The short/long and detailed system prompts built for `document` contain neither
"Names heard only in a transcript are often misrecognized" nor "even when a speaker
introduces themselves by name in the transcript".
I3. The short/long and detailed system prompts built for `document` contain "only when the
content gives no name".
I4. The short/long and detailed system prompts built for `document` contain "This content
is text, so proper nouns are written as they appear in it." and do not contain "This
content originates from a transcript" or "ASR tends to distort".
I5. The detailed system prompt built for `document` contains none of "the narrator
speculates", "the narrator evaluates", "the narrator describes it as" and "Maintain the
narrator's tone", and still contains "the author calls it".
I6. In the worker path, a document job's LLM call receives the system prompt built for
`document` and a video, audio or `.loft` job's receives the transcript prompt, with exactly
one LLM call per summary variant.
I7. For `output_language` `ja`, `en`, `auto` and `fr`, each builder's system prompt for
`document` equals its transcript golden with exactly the substitutions of step 5 applied,
so the topic-boundary, numeric and type-specific sections other than the removed bullet
are present unchanged.

## Checked, no action

- **An LLM classification step, or switching on a content type the model chooses.** The
  detailed prompt already asks the model to identify one of eight content types and apply
  type-specific notes within the same call. The defect is a source-kind rule that the code
  can decide exactly from the context type.
- **Adding more person-name rules for transcripts.** hako `L0T3esoEHig19gM9t_Wg0`
  (2026-10-01) closed prompt work on transcript names after two rounds; the residual
  misheard self-introduction is accepted. The transcript prompts stay byte-identical.
- **Scanned PDFs (page OCR) treated as transcripts.** OCR errors on printed pages are
  character-level and rarer than speech-recognition name errors; splitting `document` by
  text origin would need a new signal in the summary path. Revisit if OCR'd books show
  wrong names.
- **Markdown notes whose text came from a transcript** (knowledge notes made from a video
  or audio file). They are classified `document` and get the text prompt, so a misheard
  name in the note is used as written. Notes are written or edited by the user, and a
  note generated by an LLM from a transcript has already passed the transcript name rule.
- **The short/long reviewer and host examples** ("The reviewer gives it 77 points", "the
  reviewer, the host, a person's name") stay in both branches; they show attribution, not
  how to refer to a narrator.
- **Regenerating existing document summaries.** Local LLM cost over many files; a file
  picks up the prompt when its summary is regenerated, as with earlier prompt changes.
- **Separate templates per source kind.** Conditional blocks keep the shared structure in
  one place.
- **Measuring output quality against a real model in tests.** Output quality is checked
  in R-5 with a real novel, an article and a video; tests check the rendered prompts.
