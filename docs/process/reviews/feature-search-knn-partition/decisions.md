# Decisions

decision: ship (human, 2026-10-22, after r1 HUMAN_REVIEW_REQUIRED: B findings are touch-point scope only; the known-issues row was added by this branch in 939a9beee; stated by the user as "ship")
ran_in_app: yes
at: f915aeac7079442f3e45606e469c7cad34258424
by: agent
evidence: Started the stack with `docker compose up -d --build` on the main checkout's test data/. The intelligence submodule was at 085b58f, and `_CLIP_DRIVE_FETCH_MAX` and `drive=drive` were present in /app/app/search.py inside the container. The data had two drives, テスト画像 and 動画 (2,093 indexed files). The UI was driven with headless Chromium (Playwright): open the drive, click Search, type the query, press Enter, then read the page and the `/api/addons/intelligence/search` responses. The first query arrived before the SigLIP encoder had loaded, captured no search response, and was run again once the model was loaded.
  SPEC-ADDON-025, Scene search off (the default; checkbox unchecked, no include_scene_clip in the request). Per query: results in the response, then how many of the top 20 carry a CLIP match and how many matched CLIP alone:
    動画 海: 17 results (0 at 898d2a0f3), 17/17 clip_thumbnail-only, all from 動画. The page showed "19 items" (17 plus core filename matches): おでかけ子ザメ episodes with water or sea in the thumbnail, an underwater-fish video, one profile.jpg.
    動画 サメ: 1 result, clip_thumbnail+whisper (same as before).
    動画 子ども: 8 results, 0 CLIP. 動画 アニメ: 50 results, 0 CLIP in the top 20.
    テスト画像 猫: 12 results, 6 carry CLIP, 0 CLIP-only. 犬: 42, top 20 all CLIP-only. 船: 13, 13/13 CLIP-only. 海: 4, 4/4 CLIP-only. 花: 44 (31 before), top 20 all CLIP-only, flower photos (page "47 items"). 車: 3, 1 carries CLIP, 0 CLIP-only.
  Scene search on (checkbox clicked; request carried include_scene_clip=true): 動画 海 gave 8 scene ("clip") matches from おでかけ子ザメ episodes. テスト画像 海 gave the same 4 thumbnails as with Scene search off.
  GET /search/compare?q=海 with X-Lit-Drive: 動画 returned 17 in each of rrf/cosine/rrf_no_cutoff/cosine_no_cutoff, with source_counts clip_vector=17, all drive 動画. With テスト画像 it returned 4 each, clip_vector=4, all drive テスト画像.
  Every result in every search carried the requested drive.
  SPEC-ADDON-026 / Ask, through the UI: 動画 "おでかけ子ザメのあらすじ" completed in 45 s on local ollama, with citations to おでかけ子ザメ episodes 16, 13 and 41 (among others). The answer said the files carried titles only, no synopsis. The intelligence log had no ERROR or Traceback for the run.
  The Ask that never finishes after the LLM fails (テスト画像 井上円了) was not retried. It is a known defect from before this change (docs/developer-guide/known-issues.md).
  Failure cases in spec item 2 (missing partition key, NULL-keyed rows, an empty partition, a sqlite error) cannot be produced by ordinary use on this data and were not exercised. Latency is not judged (spec item 10).
  Screenshots (scratchpad, not committed): /private/tmp/claude-502/-Users-libre-Sources-video-share/9ae854e6-4c93-43ee-b483-4588256373cb/scratchpad/r5b/ douga-海-off.png, douga-サメ-off.png, douga-子ども-off.png, douga-アニメ-off.png, test-{猫,犬,船,海,花,車}-off.png, 動画-umi-scene-on.png, テスト画像-umi-scene-on.png, ask-kozame-0.png, ask-kozame-1.png.
  Stopped the stack with `docker compose down`.
production: Run by the user on 2026-10-22 after the deploy of 19c53f44b (intelligence bcc9e84), with the same read-only script and queries as on 2026-10-21. GET /search?limit=20 (precision), second request: median 0.22 s over 16 queries (drive videos 0.21-0.26 s, drive private 0.15-0.27 s), target 0.25 s or less met; 2026-10-21 was 0.50 s. First request 0.16-0.44 s except one cold start at 7.10 s. vec_clip KNN in the clip_thumbnail partition 0.016-0.020 s warm against 0.54-0.87 s for the unconstrained KNN (19,330 thumbnails of 857,362 rows).
pending: none (nothing in this change falls under agent_cannot_verify; production latency is measured by the user after deploy, as spec item 10 states)
