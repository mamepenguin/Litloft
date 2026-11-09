# Triage: r1

## Warnings

- R-5 ran at 187cea80768d7325fdc5df86c781c06c2e50b6d7, and these files changed since: docs/addons/intelligence.md; run R-5 again if any of them changes what a user sees

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

Note: Scene candidate cards for any filename ending in .loft are always blank (SceneCandidatesSection.tsx:48,62). The spec states no UI change.; The httpx logger globally drops records matching YouTube host names or 'sigh='/'sqp=' (youtube_source.py:39-55).
- claude-read: Scene candidate cards for any filename ending in .loft are always blank (SceneCandidatesSection.tsx:48,62). The spec states no UI change.
- claude-read: The httpx logger globally drops records matching YouTube host names or 'sigh='/'sqp=' (youtube_source.py:39-55).
- claude-verify: Any httpx log record in the process whose message contains youtube.com, ytimg.com, googlevideo.com, sigh= or sqp= is now dropped, whichever caller produced it.
- claude-verify: Scene candidate cards for any file whose name ends in .loft, case-insensitively, are always blank, including YouTube references whose frame route works.

### unspecified_behavior

Note: Any httpx log record in the process whose message contains youtube.com, ytimg.com, googlevideo.com, sigh= or sqp= is now dropped, whichever caller produced it.; Scene candidate cards for any file whose name ends in .loft, case-insensitively, are always blank, including YouTube references whose frame route works.
- claude-read: Scene candidate cards for any filename ending in .loft are always blank (SceneCandidatesSection.tsx:48,62). The spec states no UI change.
- claude-read: The httpx logger globally drops records matching YouTube host names or 'sigh='/'sqp=' (youtube_source.py:39-55).
- claude-verify: Any httpx log record in the process whose message contains youtube.com, ytimg.com, googlevideo.com, sigh= or sqp= is now dropped, whichever caller produced it.
- claude-verify: Scene candidate cards for any file whose name ends in .loft, case-insensitively, are always blank, including YouTube references whose frame route works.

## Findings

A: 0
B: 3
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The change modifies addons/intelligence/frontend/SceneCandidatesSection.tsx (and its test), a frontend place absent from the touch-point list, while the spec states no UI change is planned.
Impact: In the Scene candidates grid, any candidate whose filename ends in .loft now always shows a blank card and never requests its frame. This UI behaviour is not covered by any declared invariant, and the approved spec says the opposite ('the UI never requests a .loft frame, so no new UI'; Checked, no action: 'no UI change is planned').
Evidence: addons/intelligence/frontend/SceneCandidatesSection.tsx:48 `const isLoft = segment.filename.toLowerCase().endsWith(".loft")` and :62 `frameFailed || isLoft ? <div .../> : <img src={getFrameUrl(...)}>`. The new test SceneCandidatesSection.test.tsx asserts no <img> for ref.loft / ref.LOFT. The touch-point list names no frontend file. decisions.md (second R-5 run) records two blank cards for nn-youtube.loft with no /frame request.
Repro: Read the diff: the submodule change adds the isLoft branch. Mutation: remove `|| isLoft` and the new SceneCandidatesSection test fails (it expects no img for a .loft candidate); no backend test notices.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name addons/intelligence/frontend/SceneCandidatesSection.tsx in the change's touch points (via invariants.md revision or the review record), or drop the frontend change.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: The new user-guide paragraph in docs/user-guide/search.md says a YouTube candidate's picture is read from YouTube when the candidates load and stays blank only when YouTube cannot be read, but the code never requests a frame for a .loft candidate.
Impact: A reader who trusts the user guide would treat the always-blank card as a bug and remove the isLoft gate. That change would make every YouTube candidate fire a 2-7 s YouTube lookup and frame read when the search page loads, which is the cost the spec rejected ('frame_url for YouTube scene passages' in Checked, no action).
Evidence: docs/user-guide/search.md (new paragraph after line 113): 'Its picture is read from YouTube when the candidates load, so it can appear a few seconds after the others and stays blank when YouTube cannot be read.' The code at addons/intelligence/frontend/SceneCandidatesSection.tsx:62 always renders the blank div for .loft. docs/addons/intelligence.md (new 'YouTube references' paragraph) correctly says 'shows a blank card rather than asking the frame route'.
Repro: Compare the two documents with SceneCandidatesSection.tsx:48-72. The R-5 record in decisions.md shows only /thumbnail requested and no /frame.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the sentence 'Its picture is read from YouTube when the candidates load, so it can appear a few seconds after the others and stays blank when YouTube cannot be read.' Keeping only that the reference can be found by a moment and opens at that time is enough.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: Importing app.youtube_source installs a filter on the process-wide 'httpx' logger, which is shared logging configuration and not in the touch-point list.
Impact: Every httpx log record in the intelligence process whose message matches youtube.com, ytimg.com, googlevideo.com, 'sigh=' or 'sqp=' is now dropped, whoever logs it. No other addon code contacts those hosts today (grep of addons/intelligence/app finds only this module), so a user sees no change now. A future httpx caller would silently lose matching log lines.
Evidence: addons/intelligence/app/youtube_source.py:39-55: `_SIGNED_FETCH` regex, `_SignedFetchFilter`, and `_drop_signed_fetches()`, which adds the filter to `logging.getLogger("httpx")` at module import. The module is imported by clip.py, scenes.py and file_question.py at import time.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the httpx logger filter among the touch points, or confine the suppression to the storyboard fetch (e.g. a dedicated httpx.Client with event hooks or a scoped logger level) so the shared logger is not altered.

</details>

## Not verified

- claude-read: Did not run any test; all conclusions are from reading the diff and the repository.
- claude-read: Did not read CLAUDE.md, risk-zones.conf or the rules documents in full for touch-point conventions.
- claude-read: Did not check whether VisualIndexSection or the clip-timestamps route expose YouTube clip rows elsewhere in the core frontend beyond the grep for getFrameUrl and frame_url.
- claude-read: Did not verify the submodule commit order required by CLAUDE.md (Git).
- claude-verify: Whether SceneCandidatesSection.tsx and its test are actually in the diff against origin/develop: git diff could not be run, and the claim that the code is new rests on reasoning and decisions.md.
- claude-verify: Whether the httpx library logs to the 'httpx' logger itself rather than a child logger in the pinned version, which decides whether the filter takes effect.
- claude-verify: The rest of the change's invariants (I1-I10) beyond these three findings.

TOTAL: 3 findings
