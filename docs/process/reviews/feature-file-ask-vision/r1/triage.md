# Triage: r1

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- open_c claude-read:F4
- unspecified_behavior
- unspecified_behavior

## Needs a human

### open_c (claude-read:F4)

Question: The diff also edits tests/file_question_doubles.py, an existing shared test fixture that is not in the touch points.
Impact: The earlier file-question tests share this helper, so their seeding now takes file_path, file_size and duration.
Evidence: addons/intelligence/tests/file_question_doubles.py: SearchDB.file gains file_path, file_size and duration parameters.
Note: The diff also edits tests/file_question_doubles.py, an existing shared test fixture that is not in the touch points.

### unspecified_behavior

Note: Global 422 handler for the whole addon.; On a generic failure the route now emits a meta event before done; before this change it did not.; The new text-only retry path sends meta.image whenever the profile can see, even when no image applies.
- claude-read: Global 422 handler for the whole addon.
- claude-read: On a generic failure the route now emits a meta event before done; before this change it did not.
- claude-read: The new text-only retry path sends meta.image whenever the profile can see, even when no image applies.
- claude-verify: App-wide RequestValidationError handler in main.py changes 422 responses for every route.
- claude-verify: New llm_routing helpers (profile_can_see, any_profile_can_see) that the touch points do not list.

### unspecified_behavior

Note: App-wide RequestValidationError handler in main.py changes 422 responses for every route.; New llm_routing helpers (profile_can_see, any_profile_can_see) that the touch points do not list.
- claude-read: Global 422 handler for the whole addon.
- claude-read: On a generic failure the route now emits a meta event before done; before this change it did not.
- claude-read: The new text-only retry path sends meta.image whenever the profile can see, even when no image applies.
- claude-verify: App-wide RequestValidationError handler in main.py changes 422 responses for every route.
- claude-verify: New llm_routing helpers (profile_can_see, any_profile_can_see) that the touch points do not list.

## Findings

A: 0
B: 3
C: 1

### claude-read:F1 — bucket B, MEDIUM, open

Claim: The diff adds an app-wide RequestValidationError exception handler in addons/intelligence/app/main.py, a place the touch-point list does not name.
Impact: Every route of the intelligence addon, not only the file-question route, now returns 422 bodies built by this handler (non-finite floats turned into repr strings). A later validation-error shape difference on any other route would come from here, and no declared invariant or test covers the other routes.
Evidence: addons/intelligence/app/main.py: new `_finite_json` and `@app.exception_handler(RequestValidationError) _invalid_body`; main.py is absent from the touch points.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add main.py to the touch points, or scope the handling to the file-ask request model.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The touch points say llm_routing.has_vision_profile is only read and that routing is unchanged, but the diff rewrites has_vision_profile onto a new _active_for helper and adds profile_can_see and any_profile_can_see.
Impact: has_vision_profile is used by the description path. Its refactor is untested by the new tests, which cover only the new functions, so a regression there would pass.
Evidence: addons/intelligence/app/llm_routing.py: _active_for added, has_vision_profile body replaced.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, LOW, open

Claim: The touch points list tests/test_llm_caller_inventory.py as registering the new streaming call, but the diff does not change it and it has no reference to generate_stream_with_image.
Impact: The inventory test that pins every LLM call to resolve does not know about the two new generate_stream_with_image methods, so the declared touch is missing and the new calls are not pinned.
Evidence: Grep of generate_stream_with_image in addons/intelligence/tests/test_llm_caller_inventory.py returns 0 matches; that file is not in the diff.
Repro: Grep the file for the method name.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket C, INFO, open

Claim: The diff also edits tests/file_question_doubles.py, an existing shared test fixture that is not in the touch points.
Impact: The earlier file-question tests share this helper, so their seeding now takes file_path, file_size and duration.
Evidence: addons/intelligence/tests/file_question_doubles.py: SearchDB.file gains file_path, file_size and duration parameters.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: C | Author bucket: 

## Not verified

- claude-read: I did not run any tests.
- claude-read: I did not check the frontend renderer against I10 line by line.
- claude-read: I did not check whether other routes depend on the previous 422 body shape.
- claude-read: I did not read the full inventory test or workers/vision.py.
- claude-verify: Behavior of invariants I1-I10
- claude-verify: The diff itself (no git access; I only checked the files at HEAD)
- claude-verify: Whether the has_vision_profile semantics changed
- claude-verify: The details of the file_question_doubles.py signature change

TOTAL: 4 findings
