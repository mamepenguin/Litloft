# File Ask: tell the model what the file is, and answer from every source it has

SPEC-ID: SPEC-ADDON-179
SPEC-ID: SPEC-ADDON-180
SPEC-ID: SPEC-ADDON-181

Approval: sha256:e720b8f938d0835e60066d3a353bf0fe5f5a14cb5b1b42423be7309790c7dcc1 Yuichi Senga 2026-11-24

## Summary

A question about one file (the 質問 tab on the file page, SPEC-ADDON-053) is answered
from the file's indexed text, an image of it, and frames of a video. The model is never
told what the file is: not its name, its type or the folder it sits in. Asked "これは何の
ファイル？" about a picture whose only indexed text was "Pokémon: Since 1996", it answered
that the name and format "could not be determined from the passages". Three changes,
one per SPEC-ID:

- **SPEC-ADDON-179**: every file question tells the model the file's name, its type, and
  the folder it sits in inside its drive; the system prompt counts those lines among what the
  model was given.
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
  conversation" history block and before `Question:`. When all three lines are left out,
  nothing is written, not even the empty line.
- **Mount**: `settings.drive_mounts[drive]`, compared after `os.path.normpath` (which drops a
  trailing slash).
- **Folder**: for a stored relative `file_path`, its directory part as stored, whether or not
  the drive has a mount. For a stored absolute `file_path` whose normalised form is inside the
  mount by whole path segments (`os.path.commonpath([mount, path]) == mount`), the directory
  part of `os.path.relpath(path, mount)`. When the directory part is empty in either case (the file is at the
  top of its drive), the Folder is `(top of the drive)`. Undefined, and the line left out, for an
  absolute path when the drive has no mount or the path is not inside it. The spelling is the
  stored one (it may be NFD).
- **Type**: the stored `mime_type`, except for a `.loft` (`mime_type` is `LOFT_MIME`), where
  `source` is `_loft_source(file_path, drive)`:
  - `source` is `None` (unreadable, or readable with no provider or URL):
    `Litloft link file (.loft)`;
  - `source.provider` is `youtube`: `YouTube video, kept as a Litloft link file (.loft)`;
  - any other provider, `generic` included: `web link (<provider>), kept as a Litloft link
    file (.loft)`.

  Type is computed inside `load_material`, which already runs off the event loop, and stored on
  `Material`; no route reads the `.loft` for it.
- **S179** (system-prompt rule): `- The File, Type and Folder lines at the start of the
  message, those that are there, describe the file: its name, its format and the folder it is
  in. They are part of what you were given. A question about the file itself (what it is, its
  name, its format, where it is) is answered from them; the rules below about passages, the
  image and frames are about what the file says and shows.`
- **S180**: `- If neither the passages nor the image contain the answer, say so plainly instead
  of guessing.`
- **S181a**: `- Never call what you were given passages, frames or numbered items, in any
  language; speak of the file, what it says and what it shows.`
- **S181b**: `- If the answer is not in what you were given, say so, but do not list other things
  you could not find out unless the question asks about them.`
- **S181c**: `- Use square brackets only around a number you were given. Speak of a moment of a
  video as the video at its time.`
- **Passages-only sentence** (today's): `- If the passages do not contain the answer, say so
  plainly instead of guessing.`
- **Passages-only opener** (today's): `You answer a question about a single file, using only the
  numbered passages below.` It becomes `You answer a question about a single file, using only the
  numbered passages below and the File, Type and Folder lines.`

## Required items

### 1. Normal flow

1. The viewer asks a question in the 質問 tab. The frontend sends it to the existing file
   ask endpoint; nothing on the request changes.
2. `load_material` reads the material as today. The `indexed_files` select that builds
   `Material` also reads `filename`, with the other columns' order and values unchanged.
   `Material` gains `filename`, `folder` and `type_label` as required fields (no default),
   filled as Terms states on every return of `load_material`.
3. Every path that builds a file-question prompt passes the three values to
   `build_file_question_user_prompt`, which writes the file block. The paths, in
   `app/routers/rag.py` (branch names as `file_question_system.jinja2` has them):
   - passages only (text, no image);
   - passages and image (a picture with indexed text, and any other file whose question
     reaches this branch);
   - image only (a picture with no indexed text);
   - the text-only retry after an image rejection, and the text-only answer when no frame is
     prepared (passages only);
   - frames only, without and with the tool (a text-less video);
   - passages and frames, without and with the tool (a text video's frame set);
   - every tool request, the final request, and the fallback request after a tool failure,
     which is the same request as the matching path without the tool.
4. `build_file_question_system_prompt` writes S179 on every path as the first line after
   `Rules:`. The passages-only opener names the file block beside the passages
   (SPEC-ADDON-179).
5. On the passages-and-image branch, S180 is written where the passages-only sentence stands
   today, and the passages-only sentence is not written. The existing image rule ("An image of
   the file is attached. Where the image and the passages differ, take exact characters from
   the passages.") stays. The passages-only branch keeps the passages-only sentence
   (SPEC-ADDON-180).
6. S181a, S181b then S181c are written on every path immediately before the "Answer in short
   Markdown" line (SPEC-ADDON-181). The existing "say so" rules and the rules that a tool must
   be called before saying something is not shown or not said stay as they are; S181b governs
   only what is added beyond the answer to the question.
7. The model streams its answer; citations, history and the frame/transcript tools work as
   today.

### 2. Failure cases

- Absolute stored path, and no mount for the drive or the path not inside it: no `Folder:`
  line; the question proceeds.
- File at the top of its drive: `Folder: (top of the drive)`.
- `filename` empty: no `File:` line. `mime_type` empty and not a `.loft`: no `Type:` line.
  (Both columns are `NOT NULL`, so this is the empty string only.)
- A `.loft` whose source cannot be read: Type as Terms states; no error, nothing logged.
- Every other failure (image unusable, frame timeout, provider error, cancelled request)
  behaves as today; the block adds no step that can fail.

### 3. States

None. The block is computed per request from rows already read.

### 4. Data read and written

- Read: `indexed_files.filename` (new in the select), `mime_type`, `file_path`, `drive`
  (already read); `settings.drive_mounts`; the `.loft` file itself for a `.loft`, through
  `_loft_source` (a read of at most 64 KB, already done today on the frame paths).
- Written: nothing. The prompt is neither stored nor logged.

### 5. External services

The LLM provider the routing resolves for the file question, as today. No request is added;
the prompt grows by up to three short lines and three rule lines. A slow, down or wrong
provider is handled as today.

### 6. Authorization

Unchanged. The file ask endpoint already checks the drive and the file (`X-Lit-Drive`,
`drive_access`, the active `indexed_files` row of the request drive); the block describes that
same file, and rides only on requests the route already sends under the `llm_cloud` policy.

### 7. Effect on existing features

- Every caller of the two builders in `app/routers/rag.py` changes its prompt text.
- The golden prompt files `tests/golden_prompts/frame_request_today_*.json` (recorded from
  the addon at 895d334) are not re-recorded. `frame_request_doubles.todays_request` returns the
  golden with the file block of its fixture (`File: vid000000216.bin`, `Type: video/mp4`, no
  `Folder:` line, since the test's `drive_mounts` is empty) and the S179/S181a/S181b/S181c lines
  inserted at the positions this spec states, so the fallback tests of SPEC-ADDON-116 and
  SPEC-ADDON-174 still compare the new code with the old request plus exactly these lines.
- `tests/test_spec_addon_071_image_stream.py` asserts `"image" not in` the text-only retry
  prompt and the prompts of profiles that cannot see. A picture's `Type:` line now carries its
  MIME (`image/png`) and every system prompt carries S179 and S181a, so those assertions
  become: "image" does not appear in the prompts outside the file block, the S179 line and the
  S181a line.
- `tests/file_question_doubles.py` and `tests/frame_request_doubles.py` seed `IndexedFile`
  rows, which already carry `filename`.
- Drive-wide Ask (`answer_system.jinja2`, `answer_user.jinja2`, the agentic prompts) and the
  MCP tools are not touched.

### 8. Error behavior

Nothing new for the viewer. No new log line.

### 9. User-visible behavior

Only the answer text, and only as the model follows the prompt:

- A question about what the file is can name the file, its format and its folder; a YouTube
  `.loft` is described as a YouTube video, any other `.loft` as a web link.
- With a picture that has a little indexed text, the answer draws on what the picture shows
  and does not say the answer is missing because the text lacks it.
- The answer does not speak of passages, frames or numbered items, in English or in the
  answer's language, puts no bracketed label such as `[画像]` in its text, and does not end
  with a list of what it could not find when that was not asked.

Citation numbers, the order of the answer, the 質問 tab and its controls are unchanged.

R-5 runs on the local stack with the profile it routes `rag` to, each question three times:

1. "これは何のファイル？" about a picture with a little indexed text (passages and image);
2. "これは何のファイル？" about a PDF (passages only);
3. a question about a PDF whose answer is not in it (passages only);
4. a question about a video whose answer is not in it (frames).

Every run must pass: answer 1 says the file is a picture and what it shows; answer 2 says what
kind of document it is, by its name or its kind (for example a manual); answers 3 and 4 say the
answer is not there, without listing other unknowns and without answering from general
knowledge; no answer speaks of passages, frames or numbered items in any language, and no
answer has a square-bracketed label other than a citation number. A list of what the file does
say, added after "it is not there", is not a list of unknowns. A miss is reported to the human
with the answer and recorded in the PR as a limit of the model; it does not lead to another
change of the prompt's wording.

### 10. Non-functional

- Privacy: the file's name and its drive-relative folder now reach the LLM provider of the
  file question, under the same `llm_cloud` policy that already governs its content (text,
  image, frames). Drive-wide Ask already sends filenames. The drive's mount path is never
  sent. `docs/addons/intelligence.md` says so.
- Size: no cap is added; a filename and a folder path are bounded by the filesystem.
- Time: the `.loft` read for Type is the same bounded read the frame paths already make, done
  in `load_material` before the slot's first request; no new call.

## Touch points

- `addons/intelligence/app/prompts/rag/file_question_system.jinja2`
- `addons/intelligence/app/prompts/rag/file_question_user.jinja2`
- `addons/intelligence/app/rag/prompt.py` (`build_file_question_system_prompt`,
  `build_file_question_user_prompt`)
- `addons/intelligence/app/rag/file_question.py` (`Material`, `load_material`, the
  `indexed_files` select, `_loft_source`)
- `addons/intelligence/app/routers/rag.py` (every caller of the two builders)
- `addons/intelligence/app/config.py` (`settings.drive_mounts`, read only)
- `addons/intelligence/tests/golden_prompts/frame_request_today_*.json`
- `addons/intelligence/tests/file_question_doubles.py`,
  `addons/intelligence/tests/frame_request_doubles.py`
- `addons/intelligence/tests/test_spec_addon_071_image_stream.py` (the `"image" not in`
  assertions)
- `docs/addons/intelligence.md` ("Ask about one file": the name and folder reach the provider)
- `indexed_files` table (read only)
- `.claude/rules/design-decisions.md` (LLM features: routing and `llm_cloud` policy)

## Invariants

I1. (SPEC-ADDON-179) On every path of Normal flow step 3, the user prompt starts with the file block, before any history and before `Question:`; its `File:` line carries the row's `filename` and its `Type:` line the Type of Terms; a line whose value is empty is absent, and with all three absent the prompt starts as it does today.
I2. (SPEC-ADDON-179) The `Folder:` line carries the Folder of Terms, `(top of the drive)` for a file at its drive's top; for an absolute stored path it is absent for a drive with no mount and for a path not inside the mount by whole segments (a sibling mount sharing a name prefix, such as `/drives/videos` beside `/drives/video`, is not inside it); a trailing slash on the mount changes nothing; a relative stored path gives its directory part with or without a mount.
I3. (SPEC-ADDON-179) No text this change adds to a prompt contains the drive's mount path.
I4. (SPEC-ADDON-179) Every file-question system prompt has S179 as the first line after `Rules:`, once, and the passages-only branch's opener is the new passages-only opener of Terms.
I5. (SPEC-ADDON-180) With an image and passages and no frames, the system prompt contains S180 in the place the passages-only sentence holds on the passages-only branch, does not contain the passages-only sentence, and still contains the image rule.
I6. (SPEC-ADDON-181) Every file-question system prompt contains S181a, S181b then S181c, once each, immediately before the "Answer in short Markdown" line, and every "say so" rule and every rule to call `get_frames` or `get_transcript` before saying something is not shown or not said that it carried before is still there.
I7. (SPEC-ADDON-179) With no history, every file-question request on every path, the text-only retry included, is today's apart from the file block, S179, the new passages-only opener, S181a, S181b, S181c and, on the passages-and-image branch, S180 in place of the passages-only sentence; no request is added, and the numbers offered for citation and the rule that only they may be cited are unchanged.

## Revises

SPEC-ADDON-081 I1. A file question with no `history` or an empty one sends the model the same system prompt, user prompt and chunks, ranked by the new question alone, as before SPEC-ADDON-081, with a video's repeated frame-text lines removed as SPEC-ADDON-171 states, for cut material on the tool path the system prompt and tools of SPEC-ADDON-174, and on every path the file block and rules of SPEC-ADDON-179, SPEC-ADDON-180 and SPEC-ADDON-181; with history and a file over budget, ranking embeds the last `history` entry's question as sent, a newline, and the new question.
SPEC-ADDON-174 I1. With cut material, every tool request offers exactly `get_frames` then `get_transcript`, and the final request lists the same two with `tool_choice` `"none"` (OpenAI-compatible) or no tools (ollama); with material that is not cut, every request, tool result and log line on the path is byte for byte SPEC-ADDON-116's apart from the file block and rules of SPEC-ADDON-179 and SPEC-ADDON-181 in its prompts.
SPEC-ADDON-071 I1. A question's passages, picture and frames come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on, and the only other text sent is the history the request carried, the file block of SPEC-ADDON-179 and, for a video on the path of SPEC-ADDON-116, its duration, contents, the definitions of its tools (`get_frames`, and `get_transcript` under SPEC-ADDON-174) and the tool results, whose requested passages are rows of the same file; a picture gets at most one image of at most 1024 px on its long edge, and a video gets at most 8 initial frames and 12 requested frames of at most 1280 px when its profile can see.
SPEC-ADDON-071 I5. The prompt mentions an image or frames, and tells the model to take exact characters from the passages when they and the image or frames differ, only when an image or frames are attached, apart from S179 of SPEC-ADDON-179 and S181a of SPEC-ADDON-181, which name the image and frames on every path, and the `Type:` line of SPEC-ADDON-179's file block, which carries a picture's MIME type; it states a position only when `position_seconds` was sent for a video or audio file.
SPEC-ADDON-114 I8. Pictures, audio, documents, a `.loft` that is not a text video, every request whose profile cannot see, the availability route, the normal Ask with its agentic loop and the MCP tools answer as they did before this change, except that a video's passages have their repeated frame-text lines removed as SPEC-ADDON-171 states, `search_exact` leaves out the frame-text hits SPEC-ADDON-173 leaves out, and every file question carries the file block and rules of SPEC-ADDON-179, SPEC-ADDON-180 and SPEC-ADDON-181; text-less videos differ only by the request layout of I11 and by SPEC-ADDON-116.
SPEC-ADDON-076 I6. Ask on a YouTube `.loft` that has a text chunk, with a profile that can see, sends the frame set of SPEC-ADDON-114 read through the `large` frame route, under every invariant of SPEC-ADDON-071 (profile, `llm_cloud`, one slot, nothing stored or logged but the `large` cache entries); any frame failure leaves that frame out, and when none is sent the answer is from the text with `"unavailable"`; a YouTube `.loft` with no text chunk is answered from frames by SPEC-ADDON-108; Ask on a `.loft` of another provider is unchanged apart from the file block and rules of SPEC-ADDON-179, SPEC-ADDON-180 and SPEC-ADDON-181.

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
- **A bracketed number in a filename or folder (`Show [01].mkv`).** Sent as it is. An answer
  that repeats the name gains a citation pill to that passage number. Accepted: renaming the
  value would make the model name the file wrongly, and the pill misleads only as far as
  opening a passage.
- **An invariant for `docs/addons/intelligence.md`.** Prose; the doc edit is checked in review.
  The `llm_cloud` touch point is held by I7 (no request is added).
- **A test that the model's answer avoids the terms.** The answer is a model's output and
  varies; the tests pin the prompt, and R-5 (section 9) checks the answer.
- **Drive-wide Ask prompts.** Their context blocks already name each file; the case came from
  the file question.
- **Translating the block's labels.** The prompt is English throughout and the output
  language is set by `llm.output_language`, as today.
