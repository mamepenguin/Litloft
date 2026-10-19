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

Note: The addons/intelligence pointer bump changes the addon's chunk and cue splitting at colons between digits, the admin transcription summary key, and search-config.yml.example. No spec in this repository declares any of these.
- claude-read: The addons/intelligence pointer bump changes the addon's chunk and cue splitting at colons between digits, the admin transcription summary key, and search-config.yml.example. No spec in this repository declares any of these.
- claude-verify: The addons/intelligence pointer bump brings in addon behaviour (digit separators now include ':' and the fullwidth colon, plus an admin whisper model summary) that has no spec or ledger entry in this repository.

### unspecified_behavior

Note: The addons/intelligence pointer bump brings in addon behaviour (digit separators now include ':' and the fullwidth colon, plus an admin whisper model summary) that has no spec or ledger entry in this repository.
- claude-read: The addons/intelligence pointer bump changes the addon's chunk and cue splitting at colons between digits, the admin transcription summary key, and search-config.yml.example. No spec in this repository declares any of these.
- claude-verify: The addons/intelligence pointer bump brings in addon behaviour (digit separators now include ':' and the fullwidth colon, plus an admin whisper model summary) that has no spec or ledger entry in this repository.

## Findings

A: 0
B: 2
C: 0

### claude-read:R1-unplanned-submodule-bump — bucket B, MEDIUM, open

Claim: The diff moves the addons/intelligence gitlink from ba498037 to fe978f81, which is not in the touch-point list and carries addon behaviour changes for SPEC-ADDON-015 and SPEC-ADDON-016 that have no spec or ledger entry in this repository.
Impact: Merging this configure.py fix also ships unrelated intelligence-addon changes. Transcript chunking and cue or line breaking now treat ASCII and fullwidth colons between digits as part of a number, the admin transcription summary key changes from whisper_local.model to whisper_local['models.whisper'], and search-config.yml.example changes, which is the file configure.py copies under I5. None of these is declared or reviewed against this change's invariants. docs/specs/INDEX.md has no SPEC-ADDON-015/016 rows.
Evidence: In the diff, addons/intelligence goes from Subproject commit ba498037d573ed99960cdca2f1df1645af118968 to fe978f81f21769de4787eb11bf1803e0d4e64c54. The submodule diff changes app/digit_separator.py (_SEPARATORS now includes ':' and the fullwidth colon), app/routers/admin.py (_frozen_subconfig_summary), frontend/AdminTranscriptionSettingsSection.tsx and search-config.yml.example, and adds tests/test_admin_whisper_model_summary.py. docs/process/reviews/fix-configure-preserve-gui-config/r1/classification.json lists addons/intelligence as a touched zone (MEDIUM). The Touch points section of docs/specs/configure-keeps-gui-config.md does not name it. CLAUDE.md:72-79 and docs/process/PROJECT.md:81 treat a pointer bump as a tracked edit. Grep for SPEC-ADDON-01[56] under docs/ returns no files.
Repro: Compare the changed paths in the diff with the spec's Touch points list: addons/intelligence is changed and not listed. Grep 'SPEC-ADDON-01[56]' in docs/ finds nothing.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Restore the addons/intelligence gitlink to the develop pin in this branch and land the SPEC-ADDON-015/016 bump in its own change with its spec and ledger rows. Alternatively, add addons/intelligence to the touch points with a reason.

</details>

### claude-read:R2-unplanned-new-test-file — bucket B, LOW, open

Claim: The diff adds tests/test_configure_keeps_gui_config.py, which the touch-point list does not name. The list names tests/test_configure.py, tests/test_configure_presentation.py, tests/configure_scenarios.py and tests/fixtures/configure/.
Impact: No user impact. The acceptance tests for I1 to I11 sit in a file the plan did not declare, while the declared test files and fixtures are untouched. A reader of the touch points would look for the new scenarios in the wrong place.
Evidence: The diff adds a new file, tests/test_configure_keeps_gui_config.py (272 lines). r1/classification.json lists it under zones_touched (MEDIUM). Nothing under tests/test_configure.py, tests/test_configure_presentation.py or tests/fixtures/configure/ changes in the diff.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add tests/test_configure_keeps_gui_config.py to the touch-point list.

</details>

## Not verified

- claude-read: Did not run any tests; I had no command execution.
- claude-read: Did not inspect the addon submodule's working tree or confirm that fe978f81 is merged on the addon's main branch.
- claude-read: Did not confirm that the diff shown equals commit 076d601ee alone rather than the branch against origin/develop.
- claude-verify: Exact gitlink SHAs ba498037 -> fe978f81 at commit 076d601ee (no git access; inferred from classification.json and the checked-out addon contents)
- claude-verify: Whether fe978f81 is merged into the addon's main branch upstream
- claude-verify: The diff contents of configure.py against invariants I1-I11

TOTAL: 2 findings
