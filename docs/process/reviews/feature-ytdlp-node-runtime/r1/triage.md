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

## Read coverage

Product files:
- addons/intelligence/Dockerfile — full: Whole file read.
- addons/intelligence/Dockerfile.test — full: Whole file read.
- addons/intelligence/app/youtube_source.py — partial: Lines 60-399 read: the constant, run_lookup, and download_rendition with its argv; these enclose both changed hunks.; partial: Read lines 140-379, which cover run_lookup and download_rendition. The _JS_RUNTIME_ARGV definition (around line 71) was read from the diff hunk only.
- addons/media_import/backend/requirements.txt — full: Whole file read.
- addons/media_import/backend/service.py — partial: Lines 1-369 read: the imports, the constant and all four YoutubeDL functions; these enclose every changed hunk.; partial: Read lines 245-364 (captions and STT options) and the module-level imports. The title and metadata hunks (around 79-90 and 167-175) and the JS_RUNTIME_OPTIONS constant were read from the diff.
- addons/media_import/backend/subscription/manager.py — partial: Lines 30-119 read: the import block and _resolve_channel_id_via_yt_dlp; these enclose both hunks.; partial: Read lines 85-114 (_resolve_channel_id_via_yt_dlp). The import hunk at line 37 was read from the diff and confirmed by grep.
- addons/media_import/backend/subscription/providers/youtube.py — partial: Lines 40-239 read: the import and both yt-dlp helper functions; these enclose every hunk.; partial: Read lines 180-228 (both changed functions). The import at line 57 and the lazy imports at 262 and 271 were confirmed by grep.
- backend/Dockerfile — full: Whole file read.

Test files:
- addons/intelligence/tests/test_spec_addon_141_ytdlp_node_runtime.py — full: New file, read in full from the diff.; full: Read in full as shown in the diff (new file).
- addons/intelligence/tests/youtube_frame_doubles.py — partial: Lines 50-289 read: the fake yt-dlp script and set_ytdlp, covering both hunks.; partial: Read lines 60-99 (the fake yt-dlp script). The set_ytdlp hunk was read from the diff.
- addons/media_import/backend/tests/test_spec_addon_142_ytdlp_node_runtime.py — full: New file, read in full from the diff.; full: Read in full as shown in the diff (new file).
- tests/test_backend_dockerfile.py — full: Lines 1-80 read from the file; the new section is read in full from the diff.; partial: Read the added section (lines 82-240) and the diff context only. The earlier tests were not opened.

## Needs a human

### unspecified_behavior

Note: providers/youtube.py now imports service.py at module load (R2); Shared test double FakeYouTube gains a stderr option (R1); Both addon test suites now require Node 24 and yt-dlp-ejs in the test image (R3)
- claude-read: providers/youtube.py now imports service.py at module load (R2)
- claude-read: Shared test double FakeYouTube gains a stderr option (R1)
- claude-read: Both addon test suites now require Node 24 and yt-dlp-ejs in the test image (R3)

## Findings

A: 0
B: 4
C: 0

### claude-deep:claude-deep-1 — bucket B, INFO, open

Claim: The change modifies the shared intelligence test double addons/intelligence/tests/youtube_frame_doubles.py (new `stderr` knob on `set_ytdlp` and in the fake yt-dlp script), and this file is not in the touch-point list. The two new submodule test files are not listed either.
Impact: Nothing a user can hit. The double is shared by many intelligence suites. The new key defaults to None and the fake script writes stderr only when the key is set and only on the `-J` path after the `fail` branch, so existing tests keep their behaviour. A later reader of the touch-point list would not know that the double changed.
Evidence: addons/intelligence/tests/youtube_frame_doubles.py:85-86 (`if cfg.get("stderr"): sys.stderr.write(...)`) and :271-274 (`set_ytdlp(..., stderr=None)` writes the key to ytdlp.json). The spec's Touch points name only tests/test_backend_dockerfile.py among test files.
Repro: not_reproduced (read only). Diffed the touch-point list against the files in the core and submodule diffs: every product file in the diff is listed. Outside the implicit spec, INDEX and review records, the only unlisted paths are the three test files: youtube_frame_doubles.py (modified), test_spec_addon_141_ytdlp_node_runtime.py and test_spec_addon_142_ytdlp_node_runtime.py (new).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the shared test double, and optionally the two new spec test files, to the touch-point list in the review's invariants revision, or accept them as implicit test touch points.

</details>

### claude-read:R1 — bucket B, INFO, open

Claim: The shared intelligence test double addons/intelligence/tests/youtube_frame_doubles.py was edited (FakeYouTube.set_ytdlp gains a `stderr` argument and the fake yt-dlp script writes it to stderr on a successful -J), and no touch point names this file.
Impact: No user impact. Every intelligence test that uses FakeYouTube runs through the edited fake. The edit only adds output when `stderr` is set, and existing callers leave it at None, so the earlier behaviour is unchanged. Still, a shared fixture was changed without being planned. It is the hook the I5 test needs.
Evidence: addons/intelligence/tests/youtube_frame_doubles.py:85-86 (new `if cfg.get("stderr")` branch in _YTDLP_SCRIPT) and the set_ytdlp signature/JSON write (diff hunk at old line 266). The spec's Touch points list names no file under addons/intelligence/tests/.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add addons/intelligence/tests/youtube_frame_doubles.py (the FakeYouTube stderr option) to the touch points.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: addons/media_import/backend/subscription/providers/youtube.py now imports `...service` at module level (`from ...service import JS_RUNTIME_OPTIONS`). Before, that module imported service only lazily inside functions. This changes the provider module's import graph, which goes beyond the touch point's 'every options dict'.
Impact: No user impact is visible. service.py imports nothing from `subscription` at module level (only lazily, at lines 651 and 1187), so no import cycle exists today. But importing the YouTube provider now loads all of service.py and its core `app.*` imports. A later module-level import of the subscription package from service.py would create a cycle that the touch points do not warn about.
Evidence: providers/youtube.py:57 adds the module-level import. The same file at lines 262 and 271 keeps the earlier lazy `from ...service import _fetch_metadata_sync` / `_download_captions_sync` inside functions. service.py:35 is its only relative module-level import (`.schemas`). manager.py:37 already imported service at module level, so for manager this is not new.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the shared JS_RUNTIME_OPTIONS constant in service.py, and the new module-level import of it in providers/youtube.py, in the touch points, or define the dict locally in each of the three files.

</details>

### claude-read:R3 — bucket B, INFO, open

Claim: New test files outside the touch-point list: addons/intelligence/tests/test_spec_addon_141_ytdlp_node_runtime.py and addons/media_import/backend/tests/test_spec_addon_142_ytdlp_node_runtime.py. Also, tests/test_backend_dockerfile.py gains an I7 test, while the touch point lists that file only for I8's tests.
Impact: None for a user. These are the acceptance tests for I2-I7. Two of them, the item-1 checks in both new files, also make each addon's test suite fail when its test image has no Node 24 or no yt-dlp-ejs, which adds a test-image dependency the touch points do not list.
Evidence: test_spec_addon_141_ytdlp_node_runtime.py:149-157 and test_spec_addon_142_ytdlp_node_runtime.py:171-179 assert `node --version` starts with v24 and that yt-dlp-ejs is installed. tests/test_backend_dockerfile.py adds test_spec_addon_142_i7_... alongside the I8 tests.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the two new spec test files in the touch points, and say that tests/test_backend_dockerfile.py also carries the I7 check.

</details>

## Not verified

- claude-deep: Whether yt-dlp mutates params['js_runtimes'] in place (the shared inner dict). No yt-dlp source was available locally.
- claude-deep: Whether nodejs-wheel's `node` console script on PATH is what yt-dlp detects as node-24 in the built images (I1). The spec says this was checked in R-5, which I did not inspect.
- claude-deep: Whether the submodule commits 5449c5a and 6bf2aef are pushed to their remotes.
- claude-deep: Whether the tests pass. I could not run anything.
- claude-deep: Whether core's backend/requirements.txt pins conflict with the floors that yt-dlp[default] adds.
- claude-read: Did not run any test or build. Could not execute commands.
- claude-read: Did not check whether any import path loads providers/youtube.py before service.py in a way that could cycle at runtime. Only the module-level imports of service.py were read.
- claude-read: Did not verify the content of the submodule commits beyond the files in the provided diff (for example, whether other files changed in those submodule commits).
- claude-read: Did not verify I1 against built images.
- claude-verify: Did not run any tests; I had no command execution.
- claude-verify: Did not read the contents of the two new SPEC-ADDON-141/142 test files beyond confirming they exist.
- claude-verify: Did not check whether the media_import tests that import providers.youtube load service successfully in the test image.
- claude-verify: Did not compare against origin/develop directly. 'Before' state comes from the reviewers' descriptions and the code as it is now.

TOTAL: 4 findings
