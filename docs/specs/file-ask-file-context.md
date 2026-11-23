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

- **SPEC-ADDON-179**: every file question tells the model the file's name, its type, and
  the folder it sits in inside its drive, and the system prompt says what those lines are.
- **SPEC-ADDON-180**: when a question carries an image of the file and passages of its
  text (no frames), the "say so plainly" rule names both sources, as the frames-and-passages
  rule already does, so the image is a source of the answer and not only a tie-breaker for
  exact characters.
- **SPEC-ADDON-181**: every file question tells the model not to call its material by the
  prompt's own terms (passages, frames, numbered items) in any language, and not to add a
  list of other things it could not find out when the question did not ask about them.

For the viewer of the file page. The answer text changes; nothing on the screen around it
does.

## Terms

- **File block**: the lines `File: …`, `Type: …` and `Folder: …`, each on its own line, in
  that order, any of them left out under the rules below, followed by one empty line. It is
  the very start of every file-question user prompt, before the "Earlier in this
  conversation" history block and before `Question:`.
- **Mount**: `settings.drive_mounts[drive]`, compared after `os.path.normpath` (which drops a
  trailing slash).
- **Folder**: for a stored absolute `file_path` whose normalised form is inside the mount by
  whole path segments (`os.path.commonpath([mount, path]) == mount`), the directory part of
  `os.path.relpath(path, mount)`. For a stored relative `file_path`, its directory part as
  stored. Empty when the file is at the top of its drive; undefined when the drive has no
  mount or an absolute path is not inside it. The spelling is the stored one (it may be NFD).
- **Type**: the stored `mime_type`, except for a `.loft` (`mime_type` is `LOFT_MIME`):
  `video on <provider>, kept as a Litloft link file (.loft)` when its source is readable
  (`provider` as the `.loft` stores it), and `Litloft link file (.loft)` otherwise.
- **S179** (system-prompt sentence): `- The File, Type and Folder lines at the start of the
  message describe the file: its name, its format and the folder it is in. Use them when the
  question is about what the file is or where it is.`
- **S180**: `- If neither the passages nor the image contain the answer, say so plainly instead
  of guessing.`
- **S181a**: `- Never call what you were given passages, frames or numbered items, in any
  language; speak of the file, what it says and what it shows.`
- **S181b**: `- If the answer is not in what you were given, say so, but do not list other things
  you could not find out unless the question asks about them.`
- **Passages-only sentence** (today's): `- If the passages do not contain the answer, say so
  plainly instead of guessing.`

## Required items

### 1. Normal flow

1. The viewer asks a question in the 質問 tab. The frontend sends it to the existing file
   ask endpoint; nothing on the request changes.
2. `file_question` loads the material as today. The `indexed_files` select that builds
   `Material` also reads `filename`; `Material` gains `filename` as a required field (no
   default). The Folder and Type are derived as Terms states.
3. Every path that builds a file-question prompt passes the three values to
   `build_file_question_user_prompt`, which writes the file block. The paths, in
   `app/routers/rag.py`: text; text with image; text-only retry after an image rejection;
   text-only when no frame is prepared; frames of a text-less video; today's frames of a text
   video; the tool requests and the final request of the frame/transcript tool loop; the
   fallback request after a tool failure.
4. `build_file_question_system_prompt` writes S179 on every path, as the first rule after
   `Rules:` (SPEC-ADDON-179).
5. The image-and-passages branch (`image` and `passages`, no `frames`) gets its own rules: the
   passages-branch citation rules as today, then S180, and not the passages-only sentence. The
   existing image rule ("An image of the file is attached. Where the image and the passages
   differ, take exact characters from the passages.") stays. The passages-only branch (no
   image) is unchanged (SPEC-ADDON-180).
6. S181a and S181b are written on every path, right before "Answer in short Markdown"
   (SPEC-ADDON-181). The existing "say so" rules and the rules that a tool must be called
   before saying something is not shown or not said stay as they are; S181b governs only what
   is added beyond the answer to the question.
7. The model streams its answer; citations, history and the frame/transcript tools work as
   today.

### 2. Failure cases

- No mount for the drive, or the stored absolute path is not inside it: no `Folder:` line;
  the question proceeds.
- File at the top of its drive: no `Folder:` line.
- `filename` empty: no `File:` line. `mime_type` empty: no `Type:` line. (Both columns are
  `NOT NULL`, so this is the empty string only.)
- A `.loft` whose source cannot be read: Type as Terms states; no error.
- Every other failure (image unusable, frame timeout, provider error, cancelled request)
  behaves as today; the block adds no step that can fail.

### 3. States

None. The block is computed per request from rows already read.

### 4. Data read and written

- Read: `indexed_files.filename` (new in the select), `mime_type`, `file_path`, `drive`
  (already read); `settings.drive_mounts`; the `.loft` source (already read on the paths
  that need a frame source, read for Type otherwise).
- Written: nothing. The prompt is neither stored nor logged.

### 5. External services

The LLM provider the routing resolves for the file question, as today. The prompt grows by
up to three short lines and three rule lines; a slow, down or wrong provider is handled as
today.

### 6. Authorization

Unchanged. The file ask endpoint already checks the drive and the file (`X-Lit-Drive`,
`drive_access`, the active `indexed_files` row of the request drive); the block describes that
same file.

### 7. Effect on existing features

- Every caller of the two builders in `app/routers/rag.py` changes its prompt text.
- The golden prompt files `tests/golden_prompts/frame_request_today_*.json` are regenerated;
  the diff to each is the file block and the S179/S181a/S181b lines, nothing else.
- `Material` constructions in tests and doubles (`tests/file_question_vision_doubles.py`, the
  frame request doubles) supply `filename`.
- Drive-wide Ask (`answer_system.jinja2`, `answer_user.jinja2`, the agentic prompts) and the
  MCP tools are not touched.

### 8. Error behavior

Nothing new for the viewer. No new log line.

### 9. User-visible behavior

Only the answer text, and only as the model follows the prompt:

- A question about what the file is can name the file, its format and its folder; a `.loft`
  is described as a video on its provider.
- With a picture that has a little indexed text, the answer draws on what the picture shows
  and does not say the answer is missing because the text lacks it.
- The answer does not speak of passages, frames or numbered items, in English or in the
  answer's language, and does not end with a list of what it could not find when that was not
  asked. R-5 judges this by meaning, not by the English words.

Citation numbers, the order of the answer, the 質問 tab and its controls are unchanged.

### 10. Non-functional

- Privacy: the file's name and its drive-relative folder now reach the LLM provider of the
  file question, under the same `llm_cloud` policy that already governs its content (text,
  image, frames). Drive-wide Ask already sends filenames. The drive's mount path is never
  sent. `docs/addons/intelligence.md` says so.
- Size: no cap is added; a filename and a folder path are bounded by the filesystem.
- Time and cost: no new call.

## Touch points

- `addons/intelligence/app/prompts/rag/file_question_system.jinja2`
- `addons/intelligence/app/prompts/rag/file_question_user.jinja2`
- `addons/intelligence/app/rag/prompt.py` (`build_file_question_system_prompt`,
  `build_file_question_user_prompt`)
- `addons/intelligence/app/rag/file_question.py` (`Material`, the `indexed_files` select)
- `addons/intelligence/app/routers/rag.py` (every caller of the two builders)
- `addons/intelligence/app/config.py` (`settings.drive_mounts`, read only)
- `addons/intelligence/tests/golden_prompts/`
- `addons/intelligence/tests/file_question_vision_doubles.py` and the other `Material` doubles
- `docs/addons/intelligence.md` ("Ask about one file": the name and folder reach the provider)
- `indexed_files` table (read only)
- `.claude/rules/design-decisions.md` (LLM features: routing and `llm_cloud` policy)

## Invariants

I1. (SPEC-ADDON-179) On every path of Normal flow step 3, the user prompt starts with the file block, before any history and before `Question:`, and its `File:` and `Type:` lines carry the row's `filename` and the Type of Terms; a line whose value is empty is absent.
I2. (SPEC-ADDON-179) The `Folder:` line carries the Folder of Terms; it is absent for a file at its drive's top, for a drive with no mount, and for an absolute path not inside the mount by whole segments (a sibling mount sharing a name prefix, such as `/drives/videos` beside `/drives/video`, is not inside it), and a trailing slash on the mount changes nothing.
I3. (SPEC-ADDON-179) No text this change adds to a prompt contains the drive's mount path.
I4. (SPEC-ADDON-179) Every file-question system prompt contains S179 exactly once.
I5. (SPEC-ADDON-180) With an image and passages and no frames, the system prompt contains S180 and does not contain the passages-only sentence.
I6. (SPEC-ADDON-180) With passages and no image and no frames, including the text-only retry after an image rejection, the system prompt is today's apart from S179, S181a and S181b, and contains the passages-only sentence.
I7. (SPEC-ADDON-181) Every file-question system prompt contains S181a and S181b exactly once, and every "say so" rule and every rule to call `get_frames` or `get_transcript` before saying something is not shown or not said that it carried before is still there.
I8. (SPEC-ADDON-179) With no history, every file-question request on every path is today's apart from the file block in the user prompt, S179, S181a and S181b, and, on the image-and-passages branch, S180 in place of the passages-only sentence; the numbers offered for citation and the rule that only they may be cited are unchanged.

## Revises

SPEC-ADDON-081 I1. A file question with no `history` or an empty one sends the model the same system prompt, user prompt and chunks, ranked by the new question alone, as before SPEC-ADDON-081, with a video's repeated frame-text lines removed as SPEC-ADDON-171 states, for cut material on the tool path the system prompt and tools of SPEC-ADDON-174, and on every path the file block and rules of SPEC-ADDON-179, SPEC-ADDON-180 and SPEC-ADDON-181; with history and a file over budget, ranking embeds the last `history` entry's question as sent, a newline, and the new question.
SPEC-ADDON-174 I1. With cut material, every tool request offers exactly `get_frames` then `get_transcript`, and the final request lists the same two with `tool_choice` `"none"` (OpenAI-compatible) or no tools (ollama); with material that is not cut, every request, tool result and log line on the path is byte for byte SPEC-ADDON-116's apart from the file block and rules of SPEC-ADDON-179 and SPEC-ADDON-181 in its prompts.
SPEC-ADDON-071 I1. A question's passages, picture and frames come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on, and the only other text sent is the history the request carried, the file block of SPEC-ADDON-179 and, for a video on the path of SPEC-ADDON-116, its duration, contents, the definitions of its tools (`get_frames`, and `get_transcript` under SPEC-ADDON-174) and the tool results, whose requested passages are rows of the same file; a picture gets at most one image of at most 1024 px on its long edge, and a video gets at most 8 initial frames and 12 requested frames of at most 1280 px when its profile can see.
SPEC-ADDON-071 I5. The prompt mentions an image or frames, and tells the model to take exact characters from the passages when they and the image or frames differ, only when an image or frames are attached, apart from S181a of SPEC-ADDON-181, which names frames on every path; it states a position only when `position_seconds` was sent for a video or audio file.
SPEC-ADDON-114 I8. Pictures, audio, documents, a `.loft` that is not a text video, every request whose profile cannot see, the availability route, the normal Ask with its agentic loop and the MCP tools answer as they did before this change, except that a video's passages have their repeated frame-text lines removed as SPEC-ADDON-171 states, `search_exact` leaves out the frame-text hits SPEC-ADDON-173 leaves out, and every file question carries the file block and rules of SPEC-ADDON-179, SPEC-ADDON-180 and SPEC-ADDON-181; text-less videos differ only by the request layout of I11 and by SPEC-ADDON-116.

## Checked, no action

- **File size, duration, dates.** Duration already reaches video prompts. Size and dates
  were not part of the case and add tokens to every question; left out.
- **The drive's name.** The viewer is on that drive's page; it adds nothing a folder does
  not.
- **Reading `File.file_path` from the core DB for the folder.** The mount resolves the same
  relative path the indexer started from, with no new read of the core DB.
- **A name or folder that lags a rename or move in the core.** `indexed_files` is updated by
  the drift reconcile; until it runs, the block carries the old name or folder. Accepted: a
  rename is rare, the window is short, and the same lag already applies to the passages.
- **Drive-wide Ask prompts.** Their context blocks already name each file; the case came from
  the file question.
- **A test that the model's answer avoids the terms.** The answer is a model's output and
  varies; the tests pin the prompt. R-5 checks the answer against the case that prompted this
  spec, by meaning.
- **Translating the block's labels.** The prompt is English throughout and the output
  language is set by `llm.output_language`, as today.
