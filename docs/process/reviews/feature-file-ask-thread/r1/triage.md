# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The YouTube .loft frame, scenes and storyboard indexing ship with no spec in INDEX.md.; An empty or whitespace-only model answer now ends as a failure, including for questions with no history.; Note-creating routes record core's renamed path instead of the requested one.
- claude-read: The YouTube .loft frame, scenes and storyboard indexing ship with no spec in INDEX.md.
- claude-read: An empty or whitespace-only model answer now ends as a failure, including for questions with no history.
- claude-read: Note-creating routes record core's renamed path instead of the requested one.
- claude-verify: The file Ask stream turns an empty or whitespace-only model answer into a done-with-error, with no citations.
- claude-verify: YouTube .loft frame, storyboard and Ask-frame behavior ships with no approved spec in INDEX.md.
- claude-verify: Knowledge note path recording through _created_rel_path in distill, note-from-file and notes.

### unspecified_behavior

Note: The file Ask stream turns an empty or whitespace-only model answer into a done-with-error, with no citations.; YouTube .loft frame, storyboard and Ask-frame behavior ships with no approved spec in INDEX.md.; Knowledge note path recording through _created_rel_path in distill, note-from-file and notes.
- claude-read: The YouTube .loft frame, scenes and storyboard indexing ship with no spec in INDEX.md.
- claude-read: An empty or whitespace-only model answer now ends as a failure, including for questions with no history.
- claude-read: Note-creating routes record core's renamed path instead of the requested one.
- claude-verify: The file Ask stream turns an empty or whitespace-only model answer into a done-with-error, with no citations.
- claude-verify: YouTube .loft frame, storyboard and Ask-frame behavior ships with no approved spec in INDEX.md.
- claude-verify: Knowledge note path recording through _created_rel_path in distill, note-from-file and notes.

## Findings

A: 0
B: 6
C: 0

### claude-read:R1 — bucket B, HIGH, open

Claim: The intelligence submodule bump carries a whole YouTube `.loft` frame/storyboard feature (SPEC-ADDON-076/077/078) that none of the touch points or invariants cover.
Impact: Merging this pointer ships new behaviour with no approved spec in `docs/specs/INDEX.md`: `GET /files/{id}/frame` and `/scenes` now answer for `.loft` files, the CLIP worker downloads YouTube storyboard sheets and runs `yt-dlp`, and a file question about a playing YouTube `.loft` now runs `yt-dlp` and ffmpeg against a remote stream. A user hits all of this in normal use, and no review of SPEC-079..082 is checking it.
Evidence: New files `addons/intelligence/app/youtube_source.py` and tests `test_spec_addon_076_*`, `077_*`, `078_*`, `youtube_frame_doubles.py`. Changed files: `app/frame_cache.py` (`frame_ffmpeg_argv`), `app/routers/files.py` (`_extract_loft_frame`), `app/routers/scenes.py` (`_require_youtube_loft`), `app/workers/clip.py` (`_index_clip_loft`, `_index_youtube_storyboard`), and `app/rag/file_question.py` `_frame_image` → `_youtube_frame_to_cache`. Grep finds no SPEC-ADDON-07[678] in `docs/specs/INDEX.md` and no YouTube spec under `docs/specs`.
Repro: Compare the submodule diff 1f38a24..3e80351 with the touch-point list. None of the listed files is youtube_source.py, files.py, scenes.py, clip.py or frame_cache.py, and the change to file_question.py lies outside load_material and the history trimming.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Point the intelligence submodule at a commit that holds only the SPEC-079..081 work, or declare and review SPEC-076..078 on their own first.

</details>

### claude-read:R2 — bucket B, MEDIUM, open

Claim: Both intelligence Dockerfiles now `pip install yt-dlp>=2026.8.19` with no upper bound, and these files are not touch points.
Impact: Each image build pulls whatever yt-dlp is newest, so a build can stop matching what the tests ran against. The file Ask thread does not need this.
Evidence: `addons/intelligence/Dockerfile`: `RUN pip install --no-cache-dir "yt-dlp>=2026.8.19"`; `Dockerfile.test` has the same line.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R3 — bucket B, MEDIUM, open

Claim: `_file_question_stream` now ends any answer that is empty or only whitespace with `done` carrying an error and no `citations`, and no step of SPEC-079..082 names this.
Impact: A question with no history whose model returns only whitespace used to finish as answered and now shows 'Could not answer'. This changes the stream of a no-history request, while the spec says the stream is unchanged (079 step 8, section 7).
Evidence: `addons/intelligence/app/routers/rag.py:~591`: `if not "".join(answer).strip(): logger.warning(... "EmptyAnswer" ...); yield meta; yield done{error}`. The test `test_no_answer_text_ends_as_a_failure_without_citations` cites SPEC-ADDON-080, which has no such step.
Repro: Serve `RecordingLLM(deltas=("  ",))` with no history. Before this change the stream emitted `citations`, `meta` and `done` with no error; now it emits `meta` and then `done` with `error: Answer generation failed`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R4 — bucket B, MEDIUM, open

Claim: The knowledge submodule changes how `/distill`, `/note-from-file` and `/notes` compute the recorded note path (`_created_rel_path`), and none of these is a touch point.
Impact: When core renames a file to `name (1).md`, the path stored in `note_origins` and returned now comes from core's `folder_path`/`filename`. Before, `/distill` and `/note-from-file` used the requested path, and `/notes` used `file_path`. Every note-creating route is affected, not only Ask saves.
Evidence: `addons/knowledge/app/routers/distill.py:98` adds `_created_rel_path`, used at distill.py:~199, `note_from_file.py:~96` and `notes.py:~133`. The new test is `tests/test_note_created_path.py`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R5 — bucket B, LOW, open

Claim: Unrelated frontend layout changes ride along in both submodules: AdminFeaturesSettingsSection, ClipFramesSection, VisualIndexSection, SceneCandidatesSection and knowledge's VersionHistoryPanel.
Impact: The scene and frame strips change from a horizontal scroller with arrow buttons to rows that wrap on mouse devices, the arrow buttons are removed, `.loft` scene cards no longer request frames, and the admin table and version preview now wrap long text. Users see all of this, and it is not reviewed against any spec of this change.
Evidence: Diffs of `ClipFramesSection.tsx` (removes `hasFinePointer` and the arrow buttons), `VisualIndexSection.tsx`, `SceneCandidatesSection.tsx` (`isLoft`), `AdminFeaturesSettingsSection.tsx` (`break-anywhere`), and `addons/knowledge/frontend/VersionHistoryPanel.tsx` with their tests.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R6 — bucket B, INFO, open

Claim: Some in-scope work lands in files the list does not name: a new `addons/knowledge/app/services/trust_declaration.py` (the startup pass and `ASK_INGEST_TIER`), a new `addons/intelligence/frontend/citationLabel.ts` with `AnswerMarkdown.tsx` refactored onto it, and core's `frontend/src/components/__tests__/componentFixtureParity.test.tsx`.
Impact: There is no user impact. The touch-point list names `main.py` for the startup pass, and the pass logic actually lives elsewhere. `AnswerMarkdown`'s pill labels now come from a shared module, which the touch points do not mention.
Evidence: New file `services/trust_declaration.py`, imported by `main.py` and `routers/notes.py`. New `citationLabel.ts`; `AnswerMarkdown.tsx` drops its local `formatSeconds` and `citationLabel`. `componentFixtureParity.test.tsx` adds 'ask-thread'.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Whether the YouTube commits are already on the intelligence submodule's develop, which would make them reachable from the base by another route; I could not run git.
- claude-read: Whether SPEC-ADDON-076..078 exist on another branch or in an approved spec outside this worktree.
- claude-read: That the commit's own diff matches the branch diff supplied; I reviewed the supplied diff.
- claude-verify: I did not diff against origin/develop (no git or shell access), so whether each file is new or changed in this commit, rather than already present at the base, comes from the readers' diff evidence.
- claude-verify: I did not read VisualIndexSection.tsx or VersionHistoryPanel.tsx to see their changes.
- claude-verify: I did not run any tests.

TOTAL: 6 findings
