# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/prompts/rag/file_question_system.jinja2 — full: Read the whole file.
- addons/intelligence/app/prompts/rag/file_question_user.jinja2 — partial: Only the changed hunk (lines 1-5) in the diff.
- addons/intelligence/app/rag/file_question.py — partial: Lines 11-39 (imports via grep), 120-280 and 385-610; covers every changed hunk and its enclosing function.
- addons/intelligence/app/rag/prompt.py — partial: The changed hunk of build_file_question_user_prompt in the diff (around lines 168-210).
- addons/intelligence/app/routers/rag.py — partial: The five changed call-site hunks in the diff; caller lines located by grep.

Test files:
- addons/intelligence/tests/file_context_doubles.py — full: New file, read whole in the diff.
- addons/intelligence/tests/file_context_rules.py — full: New file, read whole in the diff.
- addons/intelligence/tests/frame_request_doubles.py — partial: The changed hunks in the diff (import and todays_request/with_file_context).
- addons/intelligence/tests/golden_prompts/file_question_today_cut-material-ollama.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_cut-material-openai_compatible.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_frames-fallback-ollama-text-less-video.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_frames-fallback-ollama-text-video.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_frames-fallback-openai_compatible-text-less-video.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_frames-fallback-openai_compatible-text-video.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_frames-refused-ollama.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_frames-refused-openai_compatible.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_frames-tool-ollama-text-less-video.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_frames-tool-ollama-text-video.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_frames-tool-openai_compatible-text-less-video.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_frames-tool-openai_compatible-text-video.json — full: New file in the diff; skimmed.
- addons/intelligence/tests/golden_prompts/file_question_today_image-only.json — full: New file in the diff.
- addons/intelligence/tests/golden_prompts/file_question_today_no-frame-prepared-ollama.json — full: New file in the diff.
- addons/intelligence/tests/golden_prompts/file_question_today_no-frame-prepared-openai_compatible.json — full: New file in the diff.
- addons/intelligence/tests/golden_prompts/file_question_today_passages-and-image.json — full: New file in the diff.
- addons/intelligence/tests/golden_prompts/file_question_today_passages-only.json — full: New file in the diff.
- addons/intelligence/tests/golden_prompts/file_question_today_text-only-retry.json — full: New file in the diff.
- addons/intelligence/tests/test_spec_addon_071_image_stream.py — partial: The changed hunks in the diff only.
- addons/intelligence/tests/test_spec_addon_179_181_every_path.py — full: New file, read whole in the diff.
- addons/intelligence/tests/test_spec_addon_179_file_block.py — full: New file, read whole in the diff.
- addons/intelligence/tests/test_spec_addon_180_image_and_passages.py — full: New file, read whole in the diff.

## Unspecified behavior, recorded

- claude-read: _type_label reads the .loft file (through _loft_source) for every .loft whatever its file_type, while the indexed_files read session is still open and before load_material may return None for a file with no rows.
  - F3 × I1 = 3, claude-read: Any question on a .loft triggers one extra bounded read of up to 64 KB; the user sees no difference except a negligible delay.
  - F4 × I1 = 4, claude-verify: Every Ask on a .loft reads the small local .loft file once more for the Type line (file_question.py:419 -> _type_label:252) while the read session is open; the user sees nothing beyond a negligible extra read, and the label is correct.
- claude-read: A stored file_path that is empty or None gives no Folder line; Terms defines Folder only for relative and absolute paths.
  - F0 × I1 = 0, claude-read: Only hand-edited or malformed index rows have no file_path; the prompt then just lacks the Folder line.
  - F0 × I1 = 0, claude-verify: An indexed row with an empty or NULL file_path only arises from hand-edited or corrupt data; the user would just see no Folder line (file_question.py:228-229), which is harmless.
- claude-read: A drive whose mount is '/' places every absolute path inside it, so the Folder line carries the full host directory without its leading slash.
  - F0 × I2 = 0, claude-read: It needs a mount configured at the filesystem root, which an ordinary setup does not use.
  - F0 × I2 = 0, claude-verify: A drive configured with mount '/' is not an ordinary Litloft setup; if it were, the Folder line would carry the full directory without its leading slash (commonpath gives '/', relpath at file_question.py:244), which is still the folder inside that drive, so the effect is minor.

## Findings

A: 0
B: 3
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff adds two new test helper modules, addons/intelligence/tests/file_context_doubles.py and addons/intelligence/tests/file_context_rules.py, and neither is in the spec's touch-point list.
Impact: No user impact. The touch-point list understates where the change reaches. frame_request_doubles.py now imports S179/S181a/S181b/S181c and block() from file_context_rules.py, so the existing SPEC-ADDON-116/174 fallback tests depend on a module the spec never names.
Evidence: tests/frame_request_doubles.py:17 imports from tests.file_context_rules. Both modules are new files in the diff. The spec's Touch points list tests/file_question_doubles.py and tests/frame_request_doubles.py only, and file_question_doubles.py is not changed by this diff.
Repro: Compare the paths in the diff with the spec's '## Touch points' section.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add tests/file_context_doubles.py and tests/file_context_rules.py to the touch points, or replace the file_question_doubles.py entry, which this change does not touch.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: The diff adds 21 new golden files, tests/golden_prompts/file_question_today_*.json, that are not in the touch-point list. The list names only frame_request_today_*.json, and this diff does not change those.
Impact: No user impact. These goldens are the baseline the I7 test (test_spec_addon_179_i7_every_request_is_todays_apart_from_the_additions) compares against. They are said to be recorded from d9b7daf, but the spec neither plans nor names them, so a reviewer of the touch points never sees that the I7 baseline is new data written by this same change.
Evidence: New files tests/golden_prompts/file_question_today_{passages-only,passages-and-image,image-only,text-only-retry,frames-tool-*,frames-fallback-*,frames-refused-*,no-frame-prepared-*,cut-material-*}.json. file_context_doubles.today() reads them (tests/file_context_doubles.py, function today). The spec's Touch points list tests/golden_prompts/frame_request_today_*.json.
Repro: Compare the paths in the diff with the spec's '## Touch points' section.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add tests/golden_prompts/file_question_today_*.json to the touch points as the recorded pre-change baseline.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: The diff adds three new test modules, test_spec_addon_179_181_every_path.py, test_spec_addon_179_file_block.py and test_spec_addon_180_image_and_passages.py, which are not in the touch-point list.
Impact: No user impact. Spec tests for new SPEC-IDs are expected. The repository's implicit touch points (spec, INDEX, review records) do not include tests, so these count as reach the list does not name.
Evidence: All three are new files in the diff. The spec's Touch points name only test_spec_addon_071_image_stream.py among test modules.
Repro: Compare the paths in the diff with the spec's '## Touch points' section.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Whether the 21 file_question_today_*.json goldens actually match what d9b7daf sends; I could not run the code.
- claude-read: Whether the test suite passes; no commands could be run.
- claude-read: The full bodies of build_file_question_user_prompt and the router functions outside the changed hunks.
- claude-read: The rest of file_question_user.jinja2 beyond the changed first lines.
- claude-read: Whether the R-5 manual check was run.
- claude-verify: I could not run git, so I did not diff against origin/develop; that the files are new was taken from r1/test-files.txt.
- claude-verify: I did not read or run the new test modules or the golden JSON contents.
- claude-verify: I did not check the prompt templates or prompt.py against I4, I5 and I6.

TOTAL: 3 findings
