# Triage: r3

## Trajectory

This run:
- claude-read: Yes, the key-frame time design is being patched. r1/r2 added _ProbeError and times_failed to stop the reader from inventing times from the frame ordinal. This round replaces the packet listing with a frame listing (the packet list stamped frames one GOP early) and adds a third guard, the frame/time count check. Each round adds another branch or state around the same prediction, the key-frame time list computed apart from the decode, and each guard introduces its own gap: the new count check also discards partial reads (R1). A single source of times (taken from the decode itself) would remove the prediction, the probe error, the times_failed state and the count check together. None of the rounds removed a state, except the earlier lru_cache removal noted in r2.

Earlier runs:
- r2 / claude-read: The fixes since r1 are mostly branches for failure handling. The key-frame and rotation fixes add a _ProbeError class, a times_failed state and an _Unreadable branch, and the page reader gains unreachable checks. Each follows a spec failure case rather than a new design. One round removed state: the lru_cache on _is_video. So there is some patching of the failure branches, but I see no repeated pattern of a round adding a prediction that the round before it already added.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: A large video whose ffprobe key-frame count differs from ffmpeg's decoded count (for example with -vsync 0 dropping or duplicating frames on odd streams) is never indexed and is retried on every resume under on_index, each time after a full OCR pass.
- claude-read: A large video whose ffprobe key-frame count differs from ffmpeg's decoded count (for example with -vsync 0 dropping or duplicating frames on odd streams) is never indexed and is retried on every resume under on_index, each time after a full OCR pass.

## Findings

A: 0
B: 2
C: 0

### claude-read:R1 — bucket B, MEDIUM, open

Claim: The new post-loop check `if keyframes and result.frames != len(times): times_failed = True; return` also fires when ffmpeg stalled or exited with an error partway, so the partial read the spec says to store is discarded for videos taller than 1080 lines.
Impact: For a 4K/portrait-4K video whose ffmpeg run ends early (damaged tail, drive hiccup while still reachable, a stall kill), frames.count is smaller than the listed key frames, so nothing is written and the video stays pending. Under on_index it is fully decoded and OCRed again on every resume, so a persistently damaged large video repeats the most expensive path forever. The spec failure case says the frames decoded before the error are stored and the video is not retried; videos up to 1080p behave that way, large ones do not.
Evidence: addons/intelligence/app/workers/frame_ocr.py after the `finally` in _read_video (new lines ~310-312): the count comparison runs before the stalled/exit_status handling in index_frame_ocr, and index_frame_ocr treats times_failed as `return False` before reaching the 'keeping the frames read' branch.
Repro: not_reproduced. Mutation idea: truncate the tail of the large test clip; expect segments stored for early frames, observe no rows and flags false.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Apply the count check only when ffmpeg exited 0 and did not stall; on an early end, use the first N listed times for the N frames decoded.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: _keyframe_times now runs `ffprobe -skip_frame nokey -show_entries frame=pts_time`, which decodes every key frame of the video before the reader starts, with a 300 s timeout, whereas the cost measurement behind the 5-minutes-per-video-hour target was for the key-frame decode alone.
Impact: A long 4K HEVC video pays the key-frame decode twice. If the listing exceeds 300 s it raises _ProbeError, the read returns False with nothing written and is retried on each resume, so such a video may never get frame text. Total cost per video hour can exceed the accepted 5 minutes.
Evidence: frame_ocr.py _keyframe_times: subprocess.run([... '-skip_frame','nokey','-show_entries','frame=pts_time' ...], timeout=300); called from _read_video before Popen when keyframes is true.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Derive the times from the same ffmpeg run (for example `showinfo` or `-f image2pipe` with pts output) instead of a separate pass, or measure the double decode on the 4K HEVC excerpt.

</details>

## Not verified

- claude-read: I did not run any code or tests; ffmpeg/ffprobe behavior of -skip_frame nokey with -vsync 0 was reasoned, not observed.
- claude-read: I did not open the repository files; findings come from the diff shown, and the truncated part of the diff was not seen.
- claude-read: I did not measure the cost of the new ffprobe frame listing on a 4K HEVC file.
- claude-read: I did not check whether the negative-time key frame case also affects the fps=1 path.
- claude-verify: Did not run any code or ffprobe, so the extra decode cost in R2 is not measured.
- claude-verify: Did not read the tests, the indexer wiring or the spec text beyond what the prompt quotes.
- claude-verify: Did not check the rest of the commit outside frame_ocr.py.

TOTAL: 2 findings
