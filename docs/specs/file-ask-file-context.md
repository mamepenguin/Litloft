# File Ask: tell the model what the file is, and answer from every source it has

SPEC-ID: SPEC-ADDON-179
SPEC-ID: SPEC-ADDON-180
SPEC-ID: SPEC-ADDON-181

Approval:

## Summary

A question about one file (the 質問 tab on the file page, SPEC-ADDON-053) is answered
from the file's indexed text, an image of it, and frames of a video. The model is never
told what the file is: not its name, its type or the folder it sits in. Asked "これは何の
ファイル？" about a picture whose only indexed text was "Pokémon: Since 1996", it answered
that the name and format "could not be determined from the passages". Three changes,
one per SPEC-ID:

- **SPEC-ADDON-179**: every file question tells the model the file's name, its MIME type,
  and the folder it sits in inside its drive.
- **SPEC-ADDON-180**: when a question carries an image of the file and passages of its
  text (no frames), the "say so plainly" rule names both sources, as the frames-and-passages
  rule already does, so the image is a source of the answer and not only a tie-breaker for
  exact characters.
- **SPEC-ADDON-181**: every file question tells the model not to use the prompt's own
  words for its material ("passages", "frames", "numbered") towards the viewer, and not to
  add a list of what it could not determine unless the question asks about that.

For the viewer of the file page. The answer text changes; nothing on the screen around it
does.

## Required items

### 1. Normal flow

1. The viewer asks a question in the 質問 tab. The frontend sends it to the existing file
   ask endpoint; nothing on the request changes.
2. `file_question` loads the material as today. The `indexed_files` row it already reads
   supplies `filename` (added to the select) and `mime_type`; the folder is derived from the
   stored absolute `file_path` and the drive's mount in `settings.drive_mounts`: the path
   relative to the mount, without its last segment.
3. Every path that builds a file-question prompt (text, text with image, text-only retry
   after an image rejection, frames of a text-less video, today's frames of a text video,
   the frame/transcript tool loop) passes these three values to
   `build_file_question_user_prompt`, which writes them in a short block before the
   question:
   ```
   File: <filename>
   Type: <mime_type>
   Folder: <drive-relative folder>
   ```
   The `Folder:` line is left out when the file sits at the top of its drive or when the
   folder cannot be derived (no mount recorded for the drive, or the stored path is not
   under it). The drive's mount path is never written.
4. The system prompt says, on every path, that this block describes the file, so it may be
   used to answer what the file is (SPEC-ADDON-179).
5. The image-and-passages branch (`image` and `passages`, no `frames`) gets its own rules:
   the passages and the attached image are both sources; cite passages as today; exact
   characters come from the passages where they differ; "If neither the passages nor the
   image contain the answer, say so plainly instead of guessing." The passages-only branch
   (no image) keeps its current sentence (SPEC-ADDON-180).
6. Two rules are added to every file-question system prompt, beside "Answer in short
   Markdown": refer to the material as the file's text, the image, or the moment of the
   video, never by the words "passages" or "frames"; mention what is not known only when the
   question asks for it (SPEC-ADDON-181).
7. The model streams its answer; citations, history and the frame/transcript tools work as
   today.

### 2. Failure cases

- No mount recorded for the drive, or the stored path is not under the mount: the
  `Folder:` line is left out; the question proceeds.
- `filename` empty: the `File:` line is left out. `indexed_files.filename` is `NOT NULL`, so
  this is the empty string only.
- Every other failure (image unusable, frame timeout, provider error, cancelled request)
  behaves as today; the metadata block adds no step that can fail.

### 3. States

None. No new state; the block is computed per request from rows already read.

### 4. Data read and written

- Read: `indexed_files.filename` (new in the select in `file_question`), `mime_type`,
  `file_path`, `drive` (already read); `settings.drive_mounts` (already loaded config).
- Written: nothing. The prompt is not stored.

### 5. External services

The LLM provider the routing resolves for the file question, as today. The prompt grows by
three short lines; a slow, down or wrong provider is handled as today.

### 6. Authorization

Unchanged. The file ask endpoint already checks the drive and the file (`X-Lit-Drive`,
`drive_access`, the active `indexed_files` row of the request drive); the metadata is of
that same file.

### 7. Effect on existing features

- Every path in `app/routers/rag.py` that calls `build_file_question_user_prompt` /
  `build_file_question_system_prompt` changes its prompt text.
- The golden prompt files under `tests/golden_prompts/` that pin the file-question frame
  requests are regenerated for the new text; the change to them is that text and nothing
  else.
- Drive-wide Ask (`answer_system.jinja2`, `answer_user.jinja2`, the agentic prompts) is not
  touched; its context blocks already carry `filename:`.
- Answers saved to Knowledge (origin `ask_answer`) are unchanged in shape.

### 8. Error behavior

Nothing new for the viewer. No new log line; the folder derivation does not log when it
leaves the line out.

### 9. User-visible behavior

Only the answer text, and only as the model follows the prompt:

- A question about what the file is can name the file, its format and its folder.
- With a picture that has a little indexed text, the answer draws on what the picture shows
  and does not say the answer is missing because the text lacks it.
- The answer does not say "passages" or "frames", and does not end with a list of what it
  could not find when that was not asked.

Citation numbers, the order of the answer, the 質問 tab and its controls are unchanged.

### 10. Non-functional

- Privacy: the file's name and its drive-relative folder now reach the LLM provider of the
  file question. The file's content (text, image, frames) already reaches it under the same
  `llm_cloud` policy, and drive-wide Ask already sends filenames. The drive's mount path on
  the host is never sent.
- Size: three lines of at most a filename, a MIME type and a folder path; no cap is added.
- Time and cost: no new call.

## Touch points

- `addons/intelligence/app/prompts/rag/file_question_system.jinja2`
- `addons/intelligence/app/prompts/rag/file_question_user.jinja2`
- `addons/intelligence/app/rag/prompt.py` (`build_file_question_system_prompt`,
  `build_file_question_user_prompt`)
- `addons/intelligence/app/rag/file_question.py` (`Material`, the `indexed_files` select
  that builds it)
- `addons/intelligence/app/routers/rag.py` (every caller of the two builders)
- `addons/intelligence/app/config.py` (`settings.drive_mounts`, read only)
- `addons/intelligence/tests/golden_prompts/`
- `indexed_files` table (read only)
- `.claude/rules/design-decisions.md` (LLM features: routing and `llm_cloud` policy)

## Invariants

I1. Every file-question user prompt, on each of the text, image, text-only retry, text-less
video frames, text video frames and tool paths, contains the file's `filename` and
`mime_type` from its `indexed_files` row.
I2. The `Folder:` line is the file's folder relative to its drive's mount; it is absent for
a file at the drive's top, and absent when the drive has no mount or the stored path is not
under it.
I3. No file-question prompt contains the drive's mount path or any part of the stored
absolute `file_path` outside the drive-relative folder.
I4. When a question carries an image and passages and no frames, the system prompt's "say
so plainly" rule names both the passages and the image, and no rule says the passages alone
decide whether the answer is present.
I5. When a question carries passages and no image and no frames, the system prompt keeps
the rule that the answer comes only from the passages and says so plainly when they lack it.
I6. Every file-question system prompt tells the model not to use the words "passages" or
"frames" towards the viewer, and to mention what it could not determine only when the
question asks for it.
I7. The citation rules are unchanged on every path: the numbers a prompt offers for
citation, and the rule that only those numbers may be cited, are the same as before the
change.

## Revises

SPEC-ADDON-081 I1. A file question with no `history` or an empty one sends the model the same system prompt, user prompt and chunks, ranked by the new question alone, as before SPEC-ADDON-081, with a video's repeated frame-text lines removed as SPEC-ADDON-171 states, for cut material on the tool path the system prompt and tools of SPEC-ADDON-174, and on every path the file block of SPEC-ADDON-179 and the rules of SPEC-ADDON-180 and SPEC-ADDON-181; with history and a file over budget, ranking embeds the last `history` entry's question as sent, a newline, and the new question.
SPEC-ADDON-174 I1. With cut material, every tool request offers exactly `get_frames` then `get_transcript`, and the final request lists the same two with `tool_choice` `"none"` (OpenAI-compatible) or no tools (ollama); with material that is not cut, every request, tool result and log line on the path is byte for byte SPEC-ADDON-116's apart from the file block of SPEC-ADDON-179 and the rules of SPEC-ADDON-181 in its prompts.

## Checked, no action

- **File size, duration, dates.** Duration already reaches video prompts. Size and dates
  were not part of the case and add tokens to every question; left out.
- **The drive's name.** The viewer is on that drive's page; it adds nothing a folder does
  not.
- **Reading `File.file_path` from the core DB for the folder.** `settings.drive_mounts`
  already resolves the same relative path the indexer started from, and it needs no new read
  of the core DB.
- **Drive-wide Ask prompts.** Their context blocks already name each file; the answer in
  the case came from the file question.
- **A test that the model's answer avoids "passages".** The answer is a model's output and
  varies; the tests pin the prompt. The answer itself is checked in R-5 against the case
  that prompted this spec.
- **Translating the metadata labels.** The prompt is English throughout and the output
  language is set by `llm.output_language`, as today.
