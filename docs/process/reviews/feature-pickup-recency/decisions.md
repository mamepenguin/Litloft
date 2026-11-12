# Decisions: feature-pickup-recency

## Ship bar (2026-11-12)

Procedure: copies of the production core DB and `search.db` taken with the sqlite3
backup API inside the running production `intelligence` container (read-only source,
`journal_mode=DELETE` on the copy), copied to the development machine, and read by
`python -m app.pickup.evaluate replay` in the addon test image with the branch's
`app/` and the copies mounted read-only. The copy of the core DB had the same md5
before and after.

Code: intelligence `2edc8a1` (constants `HALF_LIFE_DAYS = 30`, `FLOOR = 0.5`, so
`fresh_h30_f0.5` carries the mark).

`main` (bar), viewer 02bb286b0179327f, candidate videos 1347 .. 2924:

| config | cuts | skipped | targets | recall@12 | recall@40 | hit@40 |
| --- | --- | --- | --- | --- | --- | --- |
| before | 55 | 5 | 397 | 0.006 | 0.046 | 0.182 |
| depth | 55 | 5 | 397 | 0.017 | 0.055 | 0.218 |
| video | 55 | 5 | 397 | 0.014 | 0.057 | 0.255 |
| after | 55 | 5 | 397 | 0.041 | 0.098 | 0.364 |
| fresh_h7_f0 | 55 | 5 | 397 | 0.040 | 0.082 | 0.455 |
| fresh_h7_f0.5 | 55 | 5 | 397 | 0.034 | 0.070 | 0.436 |
| fresh_h30_f0 | 55 | 5 | 397 | 0.018 | 0.054 | 0.345 |
| fresh_h30_f0.5* | 55 | 5 | 397 | 0.018 | 0.059 | 0.418 |
| fresh_h90_f0 | 55 | 5 | 397 | 0.033 | 0.078 | 0.455 |
| fresh_h90_f0.5 | 55 | 5 | 397 | 0.028 | 0.075 | 0.436 |
| fresh_h365_f0 | 55 | 5 | 397 | 0.060 | 0.101 | 0.473 |
| fresh_h365_f0.5 | 55 | 5 | 397 | 0.042 | 0.084 | 0.382 |
| random | 55 | 5 | 397 | 0.006 | 0.012 | 0.109 |
| newest | 55 | 5 | 397 | 0.060 | 0.127 | 0.455 |

Result: `fresh_h365_f0` 0.101 > `after` 0.098, the only grid row above it. It ships:
`HALF_LIFE_DAYS = 365`, `FLOOR = 0` (intelligence `3f38919`). The margin is small for
one viewer; the user knows that much of their viewing happens on YouTube directly and
never reaches this history. `online` (version 4 against version 3 log rows) is the
check after shipping.

`videos` (reference only):

| config | cuts | skipped | targets | recall@12 | recall@40 | hit@40 |
| --- | --- | --- | --- | --- | --- | --- |
| after | 49 | 11 | 129 | 0.036 | 0.225 | 0.327 |
| fresh_h365_f0 | 49 | 11 | 129 | 0.087 | 0.199 | 0.388 |
| newest | 49 | 11 | 129 | 0.094 | 0.094 | 0.224 |

## Timing (main drive, production copy, development machine)

- `arrival_stamp`: 0.066 s first call, 0.035 s second (bar 1 s). No index added.
- One rebuilding computation's reads and scoring (stamp, three candidate loads, live
  videos, freshness, every viewer's profile and scoring): 2.1 s (bar 2 minutes). Writes
  to `pickup_item` are not included.
- `replay` on `main`: the whole run (main, videos and the timing script in sequence)
  finished within a few minutes; `replay` alone was not timed separately.

## R-5 (2026-11-12)

```
ran_in_app: yes
at: e7874b64dc6f2520955193e2e2aaec21e808b489
by: agent
pending: none
```

Nothing under `agent_cannot_verify` bears on this change. Playback was driven muted in
headless Chromium, so audio and picture quality were not judged.

### Environment

- Compose project `litloft-r5-recency`, base `docker-compose.yml` plus `.r5/override.yml`,
  app at `http://localhost:3997`. The other stack (`video_share`, port 3000) was not
  touched.
- Core DB, thumbnails, sentinels and the intelligence `search.db` were the prepared
  copies under `.r5/data/`; `passwords.json` is `[]` (no password gate).
- `動画` is mounted from `.r5/drive-video/`, which holds copies of the 63 videos of
  `YouTube/おでかけ子ザメ/` in their original folder layout. The rest of the real drive
  (781 files) was not copied, so the startup scan marked those 781 missing; the drive
  ended with 63 live videos. The numbers below are for that 63-video drive.
- Viewer: nickname `r5recency` set in Settings → Profile, which is viewer id
  `31659880d4570580`. History made as a viewer: `第10話`, `第11話`, `第12話` opened from
  the folder, seeked near the end and played to the end (each `playback_position ==
  duration`, ~17 s of counted playback per file).
- Screenshots: `docs/process/reviews/feature-pickup-recency/shots/`.

### 1. Normal flow and the three surfaces — PASS

A restart of `intelligence` (forced computation) produced
`pickup_profile(drive_id='動画', viewer_id='31659880d4570580')` =
`total=60, computed_at=2026-11-12 13:49:42.516542,
watch_history_checkpoint=e99b093058025e9295512fa9f4f64022`, and a new
`pickup_feed_log` row at the same `computed_at` with `profile_version = 4` (the copy also
holds 33 older version-3 rows, so the new row is distinguishable).

First 40 `pickup_item` rows by rank, with `files.created_at` from the core DB:

| rank | file | created_at | score |
| --- | --- | --- | --- |
| 1 | アニメ『おでかけ子ザメ』第36話「3D」.mp4 | 2026-04-08 10:23:57.265703 | 0.629102 |
| 2 | アニメ『おでかけ子ザメ』第30話「工作」.mp4 | 2026-04-08 10:23:45.182626 | 0.638341 |
| 3 | アニメ『おでかけ子ザメ』第22話「かさじぞう」.mp4 | 2026-04-08 10:23:31.308784 | 0.629074 |
| 4 | アニメ『おでかけ子ザメ』第23話「おとし玉」.mp4 | 2026-04-08 10:23:33.064077 | 0.638283 |
| 5 | アニメ『おでかけ子ザメ』第7話「海みたいなところ」.mp4 | 2026-04-08 10:22:46.643639 | 0.628765 |
| 6 | アニメ『おでかけ子ザメ』第6話「かき氷」.mp4 | 2026-04-08 10:22:45.144574 | 0.637518 |
| 7 | アニメ『おでかけ子ザメ』×『GAMERA -Rebirth-』SPコラボ「ガメラVS子ザメラ」.mp4 | 2026-04-08 10:24:49.006536 | 0.628206 |
| 8 | アニメ『おでかけ子ザメ』第8話「雨やどり」.mp4 | 2026-04-08 10:22:48.093782 | 0.634089 |
| 9 | アニメ『おでかけ子ザメ』第26話「雪あそび」.mp4 | 2026-04-08 10:23:37.576302 | 0.628190 |
| 10 | アニメ『おでかけ子ザメ』第13話「大公園」.mp4 | 2026-04-08 10:22:58.147865 | 0.633139 |
| 11 | アニメ『おでかけ子ザメ』第18話「ふわふわ」.mp4 | 2026-04-08 10:23:06.403000 | 0.627985 |
| 12 | アニメ『おでかけ子ザメ』第33話「グリンピース」.mp4 | 2026-04-08 10:23:51.626783 | 0.632701 |
| 13 | アニメ『おでかけ子ザメ』第56話「おばけやしき」.mp4 | 2026-04-08 10:24:38.069253 | 0.627902 |
| 14 | アニメ『おでかけ子ザメ』第21話「ふゆの夜」.mp4 | 2026-04-08 10:23:12.393388 | 0.632068 |
| 15 | アニメ『おでかけ子ザメ』第57話「かりものパン食い競走」.mp4 | 2026-04-08 10:24:40.217655 | 0.627358 |
| 16 | アニメ『おでかけ子ザメ』第15話「お池でぷかぷか」.mp4 | 2026-04-08 10:23:01.167631 | 0.631859 |
| 17 | アニメ『おでかけ子ザメ』第14話「ハロウィン会」.mp4 | 2026-04-08 10:22:59.703654 | 0.627291 |
| 18 | アニメ『おでかけ子ザメ』第25話「ダイナソー」.mp4 | 2026-04-08 10:23:36.084754 | 0.631521 |
| 19 | 『おでかけ子ザメ』エピソード人気投票 結果発表配信.mp4 | 2026-04-08 10:24:54.987108 | 0.626219 |
| 20 | アニメ『おでかけ子ザメ』第4話「チューチューアイス」.mp4 | 2026-04-08 10:22:41.588837 | 0.628993 |
| 21 | アニメ『おでかけ子ザメ』第59話「笑顔でいれば」-後編-.mp4 | 2026-04-08 10:24:43.968217 | 0.624839 |
| 22 | アニメ『おでかけ子ザメ』第34話「プリントシール」.mp4 | 2026-04-08 10:23:53.135684 | 0.628775 |
| 23 | アニメ『おでかけ子ザメ』第32話「子ザメと桃太郎」.mp4 | 2026-04-08 10:23:50.029459 | 0.624839 |
| 24 | アニメ『おでかけ子ザメ』第50話「春が来た」.mp4 | 2026-04-08 10:24:24.985265 | 0.628520 |
| 25 | アニメ『おでかけ子ザメ』第17話「星見が丘」.mp4 | 2026-04-08 10:23:04.795675 | 0.624219 |
| 26 | アニメ『おでかけ子ザメ』第19話「春になったら」-前編-.mp4 | 2026-04-08 10:23:08.367443 | 0.626967 |
| 27 | アニメ『おでかけ子ザメ』第16話「おでかけ大ザメ」.mp4 | 2026-04-08 10:23:02.787674 | 0.624157 |
| 28 | アニメ『おでかけ子ザメ』第20話「春になったら」-後編-.mp4 | 2026-04-08 10:23:09.984289 | 0.626905 |
| 29 | アニメ『おでかけ子ザメ』第54話「おやつとリュック」.mp4 | 2026-04-08 10:24:34.025966 | 0.623656 |
| 30 | アニメ『おでかけ子ザメ』第27話「友達の家」.mp4 | 2026-04-08 10:23:39.801179 | 0.626180 |
| 31 | アニメ『おでかけ子ザメ』第35話「あこがれのコーヒー」.mp4 | 2026-04-08 10:23:55.567358 | 0.623022 |
| 32 | アニメ『おでかけ子ザメ』第41話「子ザメときこりの出水」.mp4 | 2026-04-08 10:24:08.176725 | 0.625739 |
| 33 | アニメ『おでかけ子ザメ』第40話「ひな祭り」.mp4 | 2026-04-08 10:24:06.912795 | 0.623005 |
| 34 | アニメ『おでかけ子ザメ』第48話「ふうせん」.mp4 | 2026-04-08 10:24:21.268182 | 0.624581 |
| 35 | アニメ『おでかけ子ザメ』第51話「小さなダム」.mp4 | 2026-04-08 10:24:27.282080 | 0.621993 |
| 36 | アニメ『おでかけ子ザメ』第53話「すなば」.mp4 | 2026-04-08 10:24:31.990102 | 0.623747 |
| 37 | アニメ『おでかけ子ザメ』第24話「おもちパン」.mp4 | 2026-04-08 10:23:34.652247 | 0.621620 |
| 38 | アニメ『おでかけ子ザメ』第5話「ラジオで体操」.mp4 | 2026-04-08 10:22:43.202013 | 0.620970 |
| 39 | アニメ『おでかけ子ザメ』第60話「一日のはじまり」.mp4 | 2026-04-08 10:24:46.652438 | 0.621115 |
| 40 | アニメ『おでかけ子ザメ』第55話「おでかけチビーバー」.mp4 | 2026-04-08 10:24:35.864695 | 0.620597 |

Every row is a video, every row is unwatched, and no watched file (`第10/11/12話`)
appears. The stored score is the ranking score: the same similarity (0.952 for `第36話`)
times freshness ~0.66 for these 2026-04-08 files. Stride over lanes, not a global sort, is
visible in the row order (rank 1 0.62910 then rank 2 0.63834). Surfaces
(`shots/13-drive-home-pickup-check1.png`, `shots/11-pickup-page-check1.png`,
`shots/12-video-recommended-check1.png`): the drive-home Pickup row showed 4 cards with
"See all (60)", the Pickup page showed the feed in rank order, and Video → Discover →
Recommended showed 3 cards; all three surfaces showed only videos.

### 2. Quiet computation — PASS

`intelligence` restarted with nothing changed. `computed_at` stayed
`2026-11-12 13:49:42.516542`, the checkpoint stayed
`e99b093058025e9295512fa9f4f64022`, `total` stayed 60, `pickup_item` stayed 60 rows and no
new `pickup_feed_log` row was written. A quiet sweep does not rebuild.

### 3. New arrival — PASS

`第36話「3D」` (rank 1, unwatched) was copied byte-identically (md5
`7d1fcf5bce37098dfe95205c3b0a64c5`) to
`YouTube/おでかけ子ザメ/アニメ『おでかけ子ザメ』第36話「3D」_r5copy.mp4`, new file id
`BOoNhSoKiNcm`, core `created_at = 2026-11-12 13:53:41.603549`. Rescanned from the
folder's **⋯ → Rescan** (UI): `added=1, total=64`.

The intelligence addon only reconciles on its own hourly tick (this install has no
`event-hooks.json`, so `scan.complete` reaches no addon), so it was restarted to pick the
file up: it then held `blip_caption, clip(17), clip_thumbnail, metadata, text_content(5),
tfidf_keywords, whisper` — the same channel set the original has.

- History did not move (same 3 `watch_history` rows, newest `last_played_at`
  13:49:17.278763).
- The checkpoint and `computed_at` moved anyway: at the restart that saw the new video
  row, `computed_at` 13:55:27.263628, checkpoint
  `1196e70e36ee3eee984d852d2ee79c41`; after its embeddings were written and a second
  restart computed, `computed_at` 13:56:42.548559, checkpoint
  `7bc7fec2ee8868490f1e08063709f779`, `total` 61. Three `pickup_feed_log` rows now, all
  version 4.
- Ranking: copy `rank 1, score 0.951986`; original `第36話「3D」` `rank 3, score
  0.629096` (rank 2 is `第30話` at 0.638335). Same similarity, newer `created_at`:
  `0.952 x 1.0` against `0.952 x 0.66`.
- `shots/16-pickup-page-check3.png` shows the copy first ("4 minutes ago"), the original
  third.

### 4. An image arrival — PASS

`r5-image-check4.png` (a PNG) was copied into the drive root, rescanned from the UI
(`added=1, total=65`, file id `MDVkQWX9Pdz2`), and the addon was restarted so it indexed
it (`blip_caption, clip_thumbnail, metadata`). Two further forced computations left
`computed_at = 2026-11-12 13:56:42.548559` and checkpoint
`7bc7fec2ee8868490f1e08063709f779` unchanged, `total` still 61, no new log row. An image
does not move the stamp.

### 5. `replay` — PASS

`docker exec … python -m app.pickup.evaluate replay --drive 動画` (full output in
`.r5/replay.txt`). The columns are `before, depth, video, after, fresh_h7_f0,
fresh_h7_f0.5, fresh_h30_f0, fresh_h30_f0.5, fresh_h90_f0, fresh_h90_f0.5,
fresh_h365_f0*, fresh_h365_f0.5, random, newest`, in that order, and `*` is on
`fresh_h365_f0` — the shipped `HALF_LIFE_DAYS = 365`, `FLOOR = 0`. Viewer `02bb` (15
cuts, 95 targets): `before 0.995`, `after 1.000`, `fresh_h365_f0 1.000`,
`newest 1.000` at recall@40 — coarse because this drive holds 63 videos. Viewer
`31659880d4570580` has no cut point before its history (all 60 skipped), so its rows are
`-`. md5 before and after the run:
`bf839cab279ea37f2961bf171291f26d  /intelligence-data/search.db` and
`38277bc890fa12883e1dde0bd22a9e00  /data/data.db`, both unchanged.

### 6. Documentation against what was seen — PASS

`docs/user-guide/video.md` (Recommended) says "Among videos that match equally, newer
ones come first, and the picks can change during the day while new videos are being
added" — matches check 3 (the identical, newer copy went from absent to rank 1, the
original stayed with its similarity) and check 1 (the shelf draws from the feed's top).
`docs/addons/intelligence.md` (Pickup) says newer videos come first among videos that
match about as well, videos only, a new video can appear within an hour of being indexed,
and up to 12 picks for the day whose selection can change as videos arrive — all
consistent with checks 1–4; the drive-home row, the Pickup page and Recommended showed
videos only, and the new copy appeared on the next computation after its embeddings were
written.
