# Triage: r4

## Trajectory

This run:
- claude-read: This round removed state rather than adding it. The separate ffprobe frame listing, _keyframe_times, _is_float, _ProbeError and the post-loop frame/time count check are gone, and the times now come from the same ffmpeg run through showinfo. That removes the double key-frame decode and the discarded partial reads from r3. It adds a stderr thread, a queue and two sentinels (_BAD, _END), but these serve one source of times and replace the earlier prediction. The earlier rounds did patch the design, each adding a branch or state around the separately computed time list (_ProbeError and times_failed in r1/r2, the count check in r3). This round is the first that removed that prediction. times_failed remains for a missing or unparsable time, with the retry cost noted in R1.

Earlier runs:
- r2 / claude-read: The fixes since r1 are mostly branches for failure handling. The key-frame and rotation fixes add a _ProbeError class, a times_failed state and an _Unreadable branch, and the page reader gains unreachable checks. Each follows a spec failure case rather than a new design. One round removed state: the lru_cache on _is_video. So there is some patching of the failure branches, but I see no repeated pattern of a round adding a prediction that the round before it already added.
- r3 / claude-read: Yes, the key-frame time design is being patched. r1/r2 added _ProbeError and times_failed to stop the reader from inventing times from the frame ordinal. This round replaces the packet listing with a frame listing (the packet list stamped frames one GOP early) and adds a third guard, the frame/time count check. Each round adds another branch or state around the same prediction, the key-frame time list computed apart from the decode, and each guard introduces its own gap: the new count check also discards partial reads (R1). A single source of times (taken from the decode itself) would remove the prediction, the probe error, the times_failed state and the count check together. None of the rounds removed a state, except the earlier lru_cache removal noted in r2.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 2
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: A key-frame video whose showinfo line has no parsable pts_time (for example pts_time:N/A on a stream without timestamps) sets times_failed, so nothing is written and the video stays pending.
Impact: Under on_index such a video is decoded and OCRed in full and discarded on every resume, and it never gets frame text. This needs an unusual stream with missing PTS, so it is rare in normal use.
Evidence: addons/intelligence/app/workers/frame_ocr.py: _showinfo_time returns None when the regex does not match, _drain_showinfo puts _BAD, and _read_video then sets times_failed and returns. index_frame_ocr returns False on times_failed.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Fall back to the previous frame's time plus the median key-frame spacing, or close the video as read after the first failure, instead of retrying forever.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: The only test of the showinfo reader that exercises the missing-time branch replaces Popen with a fake process fed by temp files, and no test runs a real large video through the new stderr-thread path with an odd-sized frame (needs_scale true).
Impact: A regression in the thread, queue and sentinel handling, or in the scale filter that is now added only for odd sizes, would be caught only by the existing real-clip tests for even sizes.
Evidence: tests/test_frame_page_ocr_readers.py: test_spec_addon_066_a4_a_missing_showinfo_time_writes_nothing uses _FakeProcess; the media fixtures have no odd-dimension clip.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add an odd-width clip to the media fixtures.

</details>

## Not verified

- claude-read: I ran no code or tests, so the behaviour of ffmpeg's showinfo and -fps_mode passthrough was reasoned, not observed.
- claude-read: I did not confirm the ffmpeg version installed in the image.
- claude-read: I did not re-read the whole diff, which was truncated, and I did not re-check the rest of the change against I5 to I10.
- claude-read: I did not measure the new single-decode cost on a 4K HEVC excerpt.
- claude-verify: Did not run any code or tests.
- claude-verify: Did not check invariants I1-I3 or I5-I10.
- claude-verify: Did not search for odd-dimension fixtures outside the one test file.
- claude-verify: Did not check whether the kept items are retried indefinitely by the queue.

TOTAL: 2 findings
