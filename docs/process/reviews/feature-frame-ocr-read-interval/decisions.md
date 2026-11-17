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
at: 03e28cccd8a0a5ebc332a3f4bdbc4a1eb3631fea
by: agent
evidence: Core 03e28cc with addons/intelligence at 14734050c9df74b34d5a47e0387281bb531299b7 (READ_HASH_BITS 8, READ_GAP_SECONDS 3.0, FRAME_OCR_RULE 2 confirmed in the running container). Stack on its own clone (r5_stack clone --with-drives, up), opened at http://video-share-ocr-interval.localhost:3101 in headless Chromium (Playwright); video_frame_ocr on_index (from /status). DB values read inside the intelligence container, read-only. (1) Upgrade path: after the migration the cloned search.db held 156 active native videos at (frame_ocr_read, frame_ocr_indexed, frame_ocr_rule) = (1,1,NULL) and 506 unclassified .loft at (0,0,NULL). With the queue paused, /status gave indexed.frame_ocr 0, pending.frame_ocr 662 (156 + 506), frame_ocr tasks waiting 156; the dashboard showed "Text in video 0 / 662". Index details for XWaAfBpieroY returned status.frame_ocr false and showed "Text in video: Pending". After Resume: 2x5kYuD3K8-r (1,1,NULL), 4 rows, unchanged while processing from 11:24:32; at 11:24:41 it was (1,0,2) with 12 rows; at 11:24:42 it was (1,1,2), with indexed.frame_ocr 0→1 and pending 663→662. Background re-reads followed at -10: 67J5hS5_if8b, d1GP9UcuGH8a, sample.mp4, sample2.mp4, all ending at (1,1,2). d1GP9UcuGH8a (30 min) ran from 11:26:45 to 11:32:46. Its 112 earlier rows and (1,1,NULL) were unchanged throughout. A search for its earlier frame text 「えびなやすのり」 found it every second throughout. It returned NOT FOUND once, at 11:32:46, between store (1,0,2) and build. It was found again at 11:32:49, with 301 rows and (1,1,2). 2x5kYuD3K8-r showed the same single gap at 11:24:42 for "CINEBENCH" (spec §7: out of search between store and build). The dashboard showed "Text in video" 5/663 and then 8/663. No warning lines were logged. (2) While paused, Regenerate "Text in video" on outdated, queued 2x5kYuD3K8-r returned {"status":"already_queued","tasks_reset":[]}. The addon logged 202; the browser saw 200 through the proxy. Its flags stayed (1,1,NULL) with 4 rows, and frame_ocr waiting stayed 157. After Resume it was the first frame task processed, ahead of the new upload at priority 0 and the -10 backlog. Index details then showed status.frame_ocr true. Regenerate on BHKDCMS3D0YW at rule 2 returned accepted with tasks_reset [frame_ocr]. The row went to (0,0,2) and then back to (1,1,2) after the read, with the same 4 segments. (3) A 30 s clip was made with PIL and ffmpeg in the backend container: a title card for 0–10 s, another for 10–13 s, "ZQXVORTEX 4821" on a white frame from 13–17 s, then credits. It was uploaded through Add > Upload files as BHKDCMS3D0YW. Before the read, a search for ZQXVORTEX had no text match. After the read it held segments 0–10, 10–13, 13–17 "ZQXVORTEX 4821" and 17–30, and the search page listed it first with match_types text_content and time_range [13.0, 17.0]. Screenshots (scratchpad, not committed): /private/tmp/claude-502/-Users-libre-Sources-video-share/74f46cdd-5c8d-4a3b-a20e-3926f52f1ff3/scratchpad/shots/01_admin_baseline.png, 02_index_details_outdated_XWaAfBpieroY.png, 05_regen_outdated_queued_confirm.png, 06_admin_after_resume.png, 07_search_ZQXVORTEX_after_read.png, 08_index_details_after_reread_2x5k.png, 09_admin_during_backlog.png, 10_regen_done_clip_confirm.png, 11_admin_after_rereads.png. Stack down and destroyed afterwards.
pending: none (no agent_cannot_verify part is touched; the item 10 timing gate on the production Mac mini is the implementing session's step and was not run here)

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
