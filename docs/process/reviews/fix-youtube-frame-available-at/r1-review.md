# Review r1: fix-youtube-frame-available-at

Commit reviewed: `96b1d43` (intelligence addon), against parent `4fda1c9`.
Threat model: personal home-LAN tool, owner is the only user, no attacker.

## Verdict on the questions asked

- **Does the fix make the reads succeed in the measured situation?** Yes. yt-dlp
  (checked in 2026.8.19, `extractor/youtube/_video.py::_get_available_at_timestamp`)
  sets `available_at = math.ceil(now) + <pre-roll ad seconds or skip offset>` when the
  player response carries a pre-roll ad, else `int(now)`, where `now` is `time.time()`
  in the yt-dlp process at the time of the player response. With no ad it is always in
  the past, so `_wait_until_available` returns at once; with a ~4 s ad the request
  sleeps ~4 s outside any ffmpeg slot and then reads. Frame route, one-file Ask (each
  of the up to 8 frames calls `ensure_youtube_frame` with its own 15 s deadline and
  shares the kept description; the ones started later find `available_at` passed) and
  the Visual Index worker (sequential scenes, first one waits, the rest reuse) all go
  through the same function, so all three are covered.
- **Clock mix.** `available_at` is produced from the same container's wall clock
  (yt-dlp runs as a child of the addon), so host clock offset cancels; only the
  difference `available_at - time.time()` is used, as a duration added to
  `time.monotonic()`. An NTP slew over <= 14 s is milliseconds. `ceil(now)` makes the
  threshold never earlier than the server-side moment. No margin problem; yt-dlp's own
  downloader waits on `available_at - int(time.time())`, i.e. no later than this code.
- **I3.** The wait is inside the single deadline (`time.monotonic() + wait > deadline - 1.0`
  raises 504 before sleeping), happens before `_slots.acquire`, so it never holds an
  ffmpeg slot and the 4-slot bound is untouched. A request never sleeps past its
  deadline.
- **I4 and the new 504 keeping the description.** Keeping it is right: dropping it
  would make the next request look up again and get a fresh `available_at` the same
  distance away, so a video whose ad wait exceeds the deadline could never be read.
  The pre-existing slot-timeout 504 already keeps it too. But it departs from the
  letter of I4 ("dropped after any ... deadline") and nothing pins it; see F2.
- **Tests.** `test_the_frame_is_read_once_the_stream_is_available` fails if the wait
  is removed (the fake server answers 403, real ffmpeg exits non-zero, route 500).
  `test_a_stream_available_after_the_deadline_is_504_without_ffmpeg` fails if the
  deadline check is removed (it would sleep 12 s, `elapsed < 3` fails). Flakiness: the
  `starts[0] >= available_at` assertion compares a time taken by the fake ffmpeg after
  process spawn with a target the code slept to; slack is tens of ms the right way, so
  not flaky. Tests were not run by this reviewer (they need the Docker test image).

## Findings

### F1. A wait longer than the deadline fails a whole Visual Index run in a burst

- Where: `app/youtube_source.py:461-462` with `app/workers/video_visual.py:911-916`
  (sequential scene loop) and `:1041-1045` (frame failure -> `_fail_scene`).
- Defect: when `available_at` is further away than the deadline allows (pre-roll ad
  wait above roughly 13 s minus the lookup time), the first scene's call answers 504
  and keeps the description. Every following scene then finds the same kept
  description, computes the same unreachable wait, and fails at once without
  sleeping, so the worker walks through the remaining pending scenes in milliseconds
  and marks each `FrameExtraction` failed before `available_at` arrives. The worker
  has no user waiting on it, yet it is bound by the 15 s interactive deadline and
  does not wait out the remainder. The run ends with every scene failed; the owner
  has to press Retry, which succeeds only if it happens inside the 5-minute
  description TTL (after that a new lookup brings a new ad wait).
- Ordinary use: queueing the Visual Index for a YouTube reference whose lookup is
  served a non-skippable pre-roll of about 15 s or more (yt-dlp counts the full
  length of a non-skippable ad; a skippable one counts only its skip offset). The
  measured case was ~4 s, so this needs a longer ad; how often the yt-dlp client is
  served one is unmeasured.
- The same condition gives Ask "unavailable" for all its frames and MCP a 504, both
  visible and recoverable by asking again a few seconds later (description kept), so
  only the worker case is reported.
- Frequency: 3 (estimate; depends on ad length distribution, unmeasured). Impact: 5
  (the run visibly fails; Retry exists). Category A.
- Possible direction (not prescribed): let the worker (no interactive caller) wait for
  `available_at` beyond the 15 s, or retry the scene once after `available_at`.

### F2. Keeping the description on the new 504 contradicts I4's wording and no test pins it

- Where: `app/youtube_source.py:461-462` (504 without `_drop_description`);
  spec `docs/specs/youtube-frames.md` I4 and the States item "dropped on an ffmpeg
  failure or deadline".
- Defect: the behaviour is the correct one (see the verdict above), but the approved
  invariant says a deadline drops the description, and neither new test asserts that
  the description survives this 504 (the second test checks only status, elapsed time,
  no ffmpeg and no cache). A later change that "restores" I4 by adding
  `_drop_description` here passes every test and turns a long `available_at` wait into
  a permanent failure: each retry looks up again and gets a fresh wait of the same
  length.
- Ordinary use: only through a future edit made in good faith from the spec text.
- Frequency: 1. Impact: 5 (frames of that video never readable, visibly). Category A.
- Suggested: record the revision of I4 (deadline-before-ffmpeg keeps the description)
  in the change's `invariants.md`, and add one assertion to the second test that a
  following request after `available_at` makes no second lookup (`youtube.lookups()`
  stays at 1).

### F3. An ffmpeg timeout after the wait drops a description that has just become usable

- Where: `app/youtube_source.py:480-483` (pre-existing drop on ffmpeg timeout), now
  reached after `_wait_until_available` has used part of the deadline.
- Defect: total time is now lookup + wait + ffmpeg. When the lookup is slow enough
  that ffmpeg starts with only a few seconds left and times out, the description is
  dropped although its `available_at` has passed; the retry performs a fresh lookup
  and pays a fresh ad wait, so it meets the same squeeze again instead of reading at
  once from the kept description.
- Ordinary use: a lookup taking more than roughly 6 to 9 s (the spec measured 1.4 to
  2.1 s on the host; the container with the Node runtime is unmeasured here) on a
  video with a ~4 s wait and a slow seek (ffmpeg measured 0.7 to 5.2 s).
- Frequency: 1. Impact: 5 (504 visible, retry may repeat). Category A. Below the fix
  threshold; listed because the wait makes the existing drop rule costlier.

### F4. No test pins that the wait happens outside an ffmpeg slot

- Where: `app/youtube_source.py:435-437`; `tests/test_spec_addon_076_youtube_frame.py:582-623`.
- Defect: moving `_wait_until_available` inside the `_slots` block passes both new
  tests. Then a one-file Ask with 4 parallel frames would hold all 4 slots while
  sleeping, and any other YouTube frame request in the process (another file, the
  Visual Index worker) would queue behind them and could reach its own deadline.
- Ordinary use: only after such a refactor.
- Frequency: 1. Impact: 3. Category A (test gap). Below threshold.

## Not findings (checked)

- Storyboard sheets: yt-dlp sets `available_at` only on stream formats
  (`_list_formats` and manifest formats), not on the `sb*` formats from
  `_extract_storyboard`, so the CLIP storyboard leg (`app/workers/clip.py:1092-1113`)
  is not affected by the same 403.
- `download_rendition` uses yt-dlp's own downloader, which already waits on
  `available_at`.
- Cancellation: an Ask whose tab closes during the sleep keeps a worker thread
  sleeping up to ~13 s; no output, no slot held. Not a defect.
- `_positive_number` rejects bool/NaN/inf/<=0 `available_at`, so malformed values
  mean "no wait" (category B anyway).

## Coverage

- `git diff 4fda1c9 96b1d43` (all three files).
- `app/youtube_source.py` at `96b1d43`: whole module except the download loop details
  (read), including `_description`, `_lookup_into`, `_drop_description`,
  `ensure_youtube_frame`, `_wait_until_available`, `_run_ffmpeg`, `pick_format`,
  `_positive_number`.
- Callers: `app/routers/files.py` (import and call site, 1755-1769),
  `app/rag/file_question.py` (`_frame_image`, `_youtube_frame_to_cache`,
  `prepare_frames`, `cut_frames`), `app/workers/video_visual.py`
  (`_read_or_extract_frame`, scene loop, `_process_scene`, `_fail_scene`),
  `app/workers/clip.py` storyboard leg.
- `tests/youtube_frame_doubles.py` (fake yt-dlp, fake ffmpeg, HTTP handler with
  `forbidden_until`); new test class and the deadline fixture constants in
  `tests/test_spec_addon_076_youtube_frame.py`.
- yt-dlp 2026.8.19 sources (Homebrew): `_get_available_at_timestamp`, where
  `available_at` is set on formats, storyboard format generation,
  `downloader/common.py` sleep on `available_at`. Production runs 2026.10.26; the
  computation was not re-checked for that version.
- Spec `docs/specs/youtube-frames.md` (all, incl. I1 to I10, failure table, Checked
  no action). `git log -5 -- app/youtube_source.py`.
- Conventions: `.claude/rules/design-decisions.md`, `.claude/rules/backend-conventions.md`
  (from the session context). `docs/process/testing-and-comments.md` not opened.
- Tests not executed.

TOTAL: 4 findings
