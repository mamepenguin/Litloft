# Decisions

decision:
ran_in_app: yes
at: bca41ab8947b8fbf0756a4a2b1cdeb091404898d
by: agent
evidence: Full stack (`docker compose up -d --build` in the worktree: backend, frontend, intelligence at 52d2a51d, knowledge; main checkout's test data) driven by headless Chromium (Playwright) at 1280x900, and at 375 for layout. Drive 動画; drive テスト画像 only where noted. Stack taken down afterwards. This commit differs from the earlier run's 6f8070eb only in the intelligence pointer (c4b0e382 to 52d2a51d: the encoder import fix). Re-run at this commit: D1, D2's measurement, normal-flow steps 1 to 5, the cold and warm times. The other observations below were made at 6f8070eb on the same core and were not repeated. Shots from this run are under `/private/tmp/claude-502/-Users-libre-Sources-video-share/e07d56d0-4d22-46f4-8b2f-3b3ef523d27d/scratchpad/r5/shots2/` (SHOTS2 below); from the earlier run under `/private/tmp/claude-502/-Users-libre-Sources-video-share/e07d56d0-4d22-46f4-8b2f-3b3ef523d27d/scratchpad/r5/shots/` (SHOTS below).

  DIFFERENCES FROM THE SPEC

  D1 (reported at 6f8070eb: on a cold encoder with the flag on, `/search` and this route raced, and `/search` answered 502 with the list silently reduced to `2件`). Did not reproduce at this commit. Each run below followed `docker compose restart intelligence` and a wait for healthy. The addon log was searched for `cannot import name`, `Failed to load` and `Search failed` after each run and over the last container's whole run: 0 lines. The encoders were cold in these runs: the log shows the SigLIP and ruri encoders loading during the request, and the first search took about 6 s against 0.23 s once warm.
  - Browser, `/drive/動画/search?q=海&include_scene_clip=true`, 10 cold loads, each with one reload: both routes 200 in all 20 loads; list `15件` and 20 candidates every time, no failure line (SHOTS2/d1-run5-cold.png). The warm count is also `15件`. Earlier run: `/search` 502 in 3 of 6, the route 502 in 1 of 6.
  - Two simultaneous requests by script: 13 cold runs, both 200, 20 segments. Earlier run: `/search` 502 in 6 of 7. The last 3 of these, and the staggered and three-at-once runs below, compared `/search`'s file ids and order to a baseline taken from an uncached first `海` on a warmed process: identical. The first 10 compared only with a repeat of the same query.
  - Staggered, the route starting 0.1, 0.5 or 2 s after `/search`, 3 cold runs each: both 200, ids identical.
  - Three at once with `/search/scenes`, 4 cold runs: all 200, ids identical. Alone: `/search` 200 in 2 of 2; the route 200 in 2 of 2.
  - Toggling on 2.5 s after a cold flag-off load, while that load's `/search` was still running (walk below): section filled, 0 error lines.
  - D1 was not re-run on the earlier addon commit in this session; the before figures are the earlier run's.
  D2. Unchanged at this commit. At 375 wide, the `partial` line wraps below the heading: section 248.3 px against 230.3 px without it (re-measured here, 248.30 and 230.30, SHOTS2/d2-375-partial-true.png), so the list moves 18 px when the line appears. The spec places the line in the heading row. At 1280 it stays on one row at 230.3 px. Shot: SHOTS/16-layout-375-partial20.png. The partial state here was a mocked response.

  NORMAL FLOW AT THIS COMMIT (short walk, started on a freshly restarted addon)
  - Flag off, `?q=海`: unchecked, no heading, 0 route requests. Toggle on: URL gains `include_scene_clip=true`, heading shown, 1 request; candidates arrive when the cold encoder finishes (SHOTS2/walk-02-on.png).
  - First candidate: `href=/files/hh_45I_sgMVC?t=52`; lands on the detail page with `t=52`; `video.currentTime` 52, paused (SHOTS2/walk-03-detail.png).
  - Back: flag kept, checked, 20 candidates, `15件`, 1 new request (SHOTS2/walk-04-back.png). Reload: the same. Toggle off: flag gone, section gone, no request.
  - Observed, not compared with a pre-change build: for `海`, the list is `20件` with the flag off and `15件` with it on, stable over repeats; the addon's `/search` itself returns 18 and 13 results. Against the previous pin (c8fc75b) `app/routers/search.py` has only added lines.

  NORMAL FLOW AND ITEM 9 (at 6f8070eb)
  1. Flag off, `?q=海`: toggle unchecked, no section, 0 route requests.
  2. Toggle on: URL gains `include_scene_clip=true`; heading シーン候補, 20 candidates, 1 request, no score shown (SHOTS/02-toggle-on-ja-umi.png). Toggle off: flag gone, section gone, no request.
  3. Click first candidate: `href=/files/hh_45I_sgMVC?t=52` (start 52.6), lands on the detail page with `t=52`; `video.currentTime` 52, paused, player reads 0:52 (SHOTS/03-candidate-opened.png). Enter on a focused card: `t=507`, `currentTime` 507. Frame rate, picture and sync as seen are pending below.
  4. Back from a candidate, and after keyboard open: flag kept, checked, 20 candidates, 1 new request.
  5. Reload: flag kept, checked, 20 candidates.
  6. Sort to newest and back: flag kept, list stayed, route request count unchanged.
  7. Type: video keeps flag and section (1 refetch). Image keeps flag, section gone, no request (SHOTS/08-type-image-hidden.png). All: section back (1 refetch).
  8. Header query from a flagged search page, by Enter and by the palette's "全N件を表示" link: flag kept (`?q=森&include_scene_clip=true`, SHOTS/09-header-keeps-flag.png). From an unflagged search page: off. From a file detail page: off (`?q=山`). From the drive home: off.
  9. Header query with operators from a flagged page (`type:video 海`): no toggle row, no section, no request (SHOTS/10-operators.png). The flag stays in the URL.
  10. Smart folder: saving while flagged drops the flag and shows no section. Turning the toggle on inside it (`smart_folder_id` plus flag): no section, 0 requests (SHOTS/25-sf-on.png). The test folder was deleted afterwards.
  11. Empty query with the flag: no section, no request.
  12. Stale query (real responses held back by a route delay): slow query, then `forest` from the header. The slow request was aborted and the list stayed `forest`'s after its reply window. Slow query then toggle off: stayed idle.
  13. Loading: heading, シーンを探しています / `Searching for scenes`, six placeholders, `aria-busy=true`, SHOTS/13-loading.png. The list heading was at y=350.3 in both loading and loaded.
  14. English locale: `Scene candidates`, `Couldn't search scenes`, `Searching for scenes`, `This drive has no scene index` (SHOTS/21-en-the-sea.png).
  15. Layout, real page (1 and 0 candidates and partial by trimming the real response): at 375 and 1280, document scrollWidth equals the viewport; row 190 px and section 230.3 px while loading and with 1 or 20 candidates. Empty collapses to 62.3 px; partial with none shows only the partial line, 58.3 px at 375 and 40.3 px at 1280. Shots: SHOTS/16-layout-*.png.
  16. Lazy frames: 13 of 20 frame requests on first view, 20 after scrolling the row to its end.
  17. Times: `0:52-1:01`, `4:03:00-4:03:30`.

  WHAT THE SEGMENTS SHOWED (one judge, peak frames only, 動画 drive; mostly animation)
  - `forest` (SHOTS/20-q-forest.png): all visible frames are forests or wooded scenes.
  - `桜` (SHOTS/20-q-sakura.png): all visible frames show pink blossom trees.
  - `cat` (SHOTS/20-q-cat.png): of the first 10, 7 show cats, 1 shows the shark character with cat-like figures, and 2 show a sky and a window with no cat visible.
  - `夜の街` (SHOTS/20-q-yoru.png): all visible frames are night townscapes or night streets.
  - `dog running` (SHOTS/20-q-dog.png): of the first 10, 5 show dogs, mostly on a lead rather than running, and 1 a person in a dog costume; the others are a title card over an aerial shot, a dance video, a squirrel-like animal and an indoor shot. Weak on the action, as the spec expects.
  - `料理をしている` (SHOTS/20-q-eat.png): food and cooking scenes; one hands-on real footage; the same omelette shot repeats from two videos.
  - `海` (SHOTS/02-toggle-on-ja-umi.png): underwater light first, then a shore and a sun over a flat horizon, then a shark on a teal background. The same sun shot repeats from two videos, the repeated-candidates case the spec names.
  - English `the sea` and `forest` and Japanese `海`, `森` all returned 20.

  ENDPOINT THROUGH THE PROXY
  - `q` empty, blank or 201 characters: 422. 200 characters: 200. `limit` 0, 51, `abc`: 422. `limit` 1: 1 segment. `limit` 50: 33 for `sea`.
  - No `X-Lit-Drive`: 400. Unknown drive: 403.
  - Addon stopped: 502; section shows the failure line, list shows its filename matches (SHOTS/40-addon-stopped.png).
  - Policy off on テスト画像 (`drives.json`, backend restart): 404 on that drive, section absent (SHOTS/40-policy-off.png); 動画 unaffected.
  - テスト画像 locked by a password group, unauthenticated: 403, and the page makes no route request (SHOTS/40-locked.png); 動画 unaffected. `drives.json` and `passwords.json` were restored and diffed clean.
  - Frame image failing (aborted in the browser): card keeps its text and opens the file at `t=52` (SHOTS/15-frame-failed.png).
  - 446 segments across 12 queries at `limit=50`, checked against the DB: active and in 動画, `start < end`, `start <= peak < end`, `start` and `peak` are stored timestamps, at most 2 per file, ordered by score. 0 violations. `partial` false in all.
  - テスト画像 (192 active frames in 3 files, beside 8520 in 動画) gave 2 to 3 segments for 7 queries, `partial` false (SHOTS/11-other-drive.png).

  NOT PRODUCED BY ORDINARY USE ON THIS DATA
  - `partial: true`, and a drive with no frames: no such state exists here and adding a drive was excluded. Their UI lines were checked with mocked responses only (steps 14, 15, D2).
  - 502 and 404 in steps 14 and the frame failure use browser-side interception where noted; addon down and policy off were also produced for real.
  - Text encoder failure as a clean 503 and table read failure: not produced, at either commit.
  - I8 was not compared against a pre-change build.

  ITEM 10, TIMES. LOCAL TEST DATA, NOT PRODUCTION; production's size is unmeasured here, so this does not settle production's timing.
  - Data: `vec_clip` `clip` partition 9214 rows (10909 in the table). 動画 has 8520 eligible frames in 153 files. Docker on a 16-CPU Mac, 16 GB for Docker. Times through the proxy from the host. Data sizes are from the earlier run.
  - Warm, this commit, 20 queries each, seconds, one round. Another session's stack (`litloft-r5h-*`, its own data directory, started 00:37:12Z) may overlap this round.
    - `/search/scene-segments` alone: median 0.157, max 0.251.
    - `/search?limit=50&include_scene_clip=true` alone: median 0.139, max 0.292.
    - Together: route median 0.191, max 0.294; `/search` median 0.170, max 0.202; wall median 0.192, max 0.295.
  - Warm at 6f8070eb, three rounds, for comparison: route alone median 0.081 (0.072, 0.173), max 0.276; `/search` alone median 0.141 (0.145), max 0.253, except one 2.98 straight after a restart; together route 0.190 (0.200), max 0.338, `/search` 0.176 (0.180), max 0.230, wall 0.191 (0.200), max 0.338.
  - Cold encoder, this commit: the route alone 5.33 and 5.55 (3.58 at 6f8070eb). `/search` alone 8.22 and 8.53 (8.0 to 8.3). Together, route start equal: 5.67 to 6.02 for both in the 13 runs. Started 2 s apart: route 3.69 to 4.01, `/search` 5.72 to 6.02. Three at once: 5.54 to 6.89. In the browser, both responses received 5.92 to 6.93 after navigation.
  - Neither route reached its timeout (30 s and 15 s) here. Whether they do on production remains unmeasured.

  OTHER THINGS SEEN, NOT TIED TO THE FLAG
  - React error #418 (hydration, text) on a full load of the search page after visiting the drive home, with the flag off and `sort=created_at` added to the URL. Not seen with the flag on in the same sequence. Not compared with develop.
  - At 375 the search heading has width 0 and the count renders one character per line, with the toggle off as well as on (SHOTS/50-375-off.png, SHOTS/50-375-on.png). Not compared with develop.
pending: Audio and video as heard and seen at the candidate's start time (picture quality, sync), per agent_cannot_verify. The iOS app on a real device and playback over the home LAN. Timing on production-sized data (spec item 10) needs the human: this run measured local test data only.
