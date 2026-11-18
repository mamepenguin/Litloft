# Decisions: feature/frame-ocr-read-interval

## Early end of a re-read follows the spec, not the container duration

- Addon commit: `1473405` (on top of `7244cee`, `c903eeb`).
- The implementation first treated a re-read as ended early when the last decoded
  frame was more than `max(1.0, frame_gap)` before the container duration. The
  approved spec (§2, I8) defines an early end as an ffmpeg error or stall only, so the
  check was removed.
- The check was also unsafe for complete files. On 284 production videos (sample of
  300; 16 had no stream duration), the video stream ended up to 0.62 s before the
  container. On the 1 fps path the last sampled frame can be close to 1 s before the
  stream ends. Together these can exceed the 1.0 s threshold on a complete file.
- The acceptance case `test_spec_addon_122_i8_an_incomplete_reread_that_read_text_keeps_the_earlier_read[ended-early]`
  used `large_tail`, a truncated clip. In the test image ffmpeg decodes it with exit
  0, stopping at 8.2 s of 12 s. That is not an early end under the spec. The case now
  runs the real decode of `landscape` wrapped to exit 1 after its last frame. Every
  assertion is unchanged.
- RED seen twice:
  - the old input fails with the duration check removed;
  - the new input fails with the re-read's ffmpeg-exit branch disabled.
- Consequence accepted under the spec: a truncated file that ffmpeg ends cleanly is
  re-read as complete, and its shorter read replaces the earlier one.

## R-5

decision:
ran_in_app: yes
at: 26821078cc4b11a6a144692319250447e8ca97af
by: agent
evidence: Second run, segment times only. Core 26821078c with addons/intelligence at c7ef2fa7a534d043ebf69779f65169efe5c365af; the running container's app/workers/frame_ocr.py was byte-identical to the worktree's (READ_HASH_BITS 8, READ_GAP_SECONDS 3.0, FRAME_OCR_RULE 2). Own stack (r5_stack clone --port 3107 --with-drives, up) at http://video-share-ocr-interval.localhost:3107 in headless Chrome (Playwright). DB read inside the intelligence container, read-only. (1) A 40 s 1280x720 clip was rendered with PIL and ffmpeg in the backend container: "ZQXALPHA 1111" on a white band 0-25 s, "ZQXBETA 2222" 25-40 s, over a background whose colour changes every second plus a moving block. Uploaded through Add > Upload files as -60EYzHMqKsu. The reader's own gate (its _frame_command, _dhash and thresholds, replayed in the container) lets reads through at 0,3,...,24 s (9 reads on ALPHA, 19-27 bits apart) and 27,30,...,39 s (5 on BETA); the old restart rule would therefore have stored ALPHA 24-27 and BETA 39-40. After the read the file was (1,1,2) with two rows: chunk 0 0.0-27.0 "ZQXALPHA 1111", chunk 1 27.0-40.0 "ZQXBETA 2222". The switch is stored at 27 s, not 25 s, because the first read after 24 s is at 27 s. Search page, Passages tab: ZQXALPHA showed one passage "0:00 Text in video r5b_titles.mp4" linking /files/-60EYzHMqKsu?t=0; clicking it opened the player at currentTime 0 (readyState 4). ZQXBETA showed "0:27 Text in video" linking ?t=27; clicking it opened the player at currentTime 27 with the BETA title on screen. The UI shows only the start time; the range comes from the API passage (start 0 end 27; start 27 end 40). The Files tab card shows no time and its link carries no t=, so clicking it opens at 0 for either word. (2) Background re-read of d1GP9UcuGH8a (30 min TV episode with a persistent "BS11" logo beside changing credits and captions), finished 16:09:31 UTC at (1,1,2). Rows before 112, of which 112 had end-start <= 15 s (all 10 s windows; longest 15 s). After 301, of which 298 <= 15 s; longest after: 326-350 "BS11" (24 s), 428-446 (18 s), 1202-1219 (17 s). Other re-reads finished during the run (rows / <=15 s, before -> after): 2x5kYuD3K8-r 4/4 -> 12/12, MW3LoXNHDrUq 8/8 -> 18/17 (45-63 s row), 67J5hS5_if8b 3/2 -> 3/2. No re-read file had two adjacent rows with equal text where one ends where the next starts. Screenshots (scratchpad, not committed): /private/tmp/claude-502/-Users-libre-Sources-video-share/74f46cdd-5c8d-4a3b-a20e-3926f52f1ff3/scratchpad/shots-r5b/03_after_upload.png, 10_alpha_search.png, 11_alpha_passages.png, 11_alpha_player.png, 12_beta_passages.png, 12_beta_player.png. Stack down and destroyed afterwards. Earlier run (at 03e28cccd, addon 1473405, still applies to the unchanged parts): upgrade path from rule NULL to rule 2 with old rows searchable throughout and one NOT FOUND gap between store and build; Regenerate on a queued outdated file returned already_queued and was processed first after Resume; the earlier ZQXVORTEX clip was stored as 13-17 s and found with time_range [13.0, 17.0]; its screenshots were under scratchpad/shots/.
pending: none (no agent_cannot_verify part is touched)

## Shipping gate (spec item 10)

- Image: `litloft-intelligence:ocr-gate`, built on the production host from addon commit `1473405`.
- The harness ran in one-off containers with no `data/` mounted.
- The first timing run is void. The production intelligence container restarted partway and its queue resumed, so it used about 290 % CPU alongside the measurement. Caught shares do not depend on load and agreed with the rerun.
- Timings below are from a rerun with the queue paused. The intelligence container was at 0.2 % CPU before each clip.

| Clip | min/h (table) | min/h (measured) | caught (table) | caught (measured) |
|---|---|---|---|---|
| cooking | 4.8 | 4.71 | 1.00 | 1.000 |
| anime | 3.9 | 3.87 | 0.70 | 0.718 |
| home | 9.2 | 9.21 | 0.40 | 0.402 |
| subtitled | 9.4 | 9.65 | 0.49 | 0.487 |
| pitch | 9.0 | 8.99 | 0.81 | 0.795 |
| slides | 5.6 | 6.41 | 0.86 | 0.857 |
| code | 14.3 | **15.79** | 0.69 | 0.691 |

- Every caught share is within 0.05 of the table.
- The code clip exceeds 15 min/h. Its breakdown, from a separate run on the same host whose load was not recorded:
  - 127 frames read in 600 s;
  - detection 58.6 s, recognition 112.9 s;
  - 4,410 of 6,246 detected boxes recognised, so 29 % were reused.
- I2 on real RapidOCR held on all 7 clips: 388 frames, 0 differ. The first harness run stopped on frames with no box, because it called recognition with an empty list. The reader never does that, since it skips recognition when nothing is left to recognise. The harness was fixed and the four affected clips were rerun.
- Human decision (2026-11-17): ship with the code clip at 15.79 min/h. It is the densest kind of video, and the overrun is 5 %. `docs/addons/intelligence.md` quotes the measured numbers.

## Review r1 (HUMAN_REVIEW_REQUIRED)

- Run: `r1/` (review.sh at core `eb2884d44`, addon `1473405`). Findings R1 to R5, all bucket B; Needs a human: unspecified_behavior x2.
- decision: continue (human, 2026-11-18: "continue")
- Fixes agreed for this round:
  - R2: a failed re-read lookup no longer drops the frame task; a test covers a running re-read, before and after its store step, against the `.loft` gate.
  - R5: a reindex raises a queued re-read to 100 whatever else it requests.
  - R3: the unused `frame_gap` is deleted.
  - `scripts/dev/frame_ocr_bench/run.sh` no longer hides lines containing "warn" or discards the I2 check's exit status.
  - Segments follow SPEC-ADDON-066 I2: a read with text equal to the open segment's continues it. Before, every such read restarted the segment at its own time, so a persistent title kept only its last read span. Found in production on a YouTube video (H1VP7QmJAIkw): a chapter title on screen 260-482 s was stored as 472-482 s. A local run on the same 720p rendition, with the one-line fix, gave 262-482 s (old rule) and 260-482 s (new rule).
- Not changed: R1 and R4 note files outside the touch-point list (shared test fixtures; extra keys from `_get_indexed_file_or_404`). Neither changes behaviour.

## Review r2 (HUMAN_REVIEW_REQUIRED)

- Run: `r2/` (review.sh at core `43b7f4bf2`, addon `c7ef2fa`). Findings R1 and R2, bucket B. Needs a human: unspecified_behavior (a backlog `.loft` task dropped when the outdated-read lookup fails).
- Mutation review at `c7ef2fa`: `mutation-review.md`. 34 mutants, 28 killed, 6 survived. A surviving mutant that sets `READ_HASH_BITS` to 16 was not among them: that mutant was killed, so r2's R2 holds only for thresholds between 9 and 15 (F2).
- decision: continue (human, 2026-11-18: "continue")
- Fixes agreed for this round:
  - r2 R1: a failed lookup in the `.loft` fetch gate counts as busy, so the task goes back to the queue.
  - F1: the I8 acceptance parametrisation gains a re-read that decodes no frame (ffmpeg exits 0). Expected values are unchanged.
  - r2 R2 / F2: a test reads a frame whose hash moved by 8 to 15 bits.
- Not changed (impact 3 or less): F3 (a reused box the engine dropped can become an empty string), F4 (no test that a native frame scan holds back the `.loft` backlog), F5 and F6 (not observable in normal use).

## Renumbered to SPEC-ADDON-133

- develop took SPEC-ADDON-122 for the vertical PDF spec (`docs/specs/pdf-vertical-text.md`) while this branch was open, and both specs' addon tests cited 122. The human chose to renumber this spec's 122 to 133 (2026-11-18); 123 was unique and stays. The human approved the new content hash `sha256:ce242fcb…` (2026-11-18, 「承認します」).
- Review records r1 to r3 and `mutation-review.md` keep the old number as written.
