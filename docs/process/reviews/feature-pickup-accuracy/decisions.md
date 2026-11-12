# Decisions

decision:
ran_in_app: yes
at: 6424c982b78b0983347a0b9df8df35ffeb25a645
by: agent
evidence: |
  Environment: compose project `litloft-r5-pickup`, port 3997, built from this
  commit. Backend/frontend/intelligence from docker-compose.yml + .r5/override.yml
  (core DB and the intelligence search.db are copies under .r5/data). The other
  stack (`video_share`) was never touched. Browser: Playwright/Chromium at
  1440x900, driven by scripts under .r5/ (frontend/node_modules).

  Profile: new nickname `r5pickup1017` set in /settings (UI), viewer id
  88e96f181c1ac7fe.

  History created as a user would (each via the file page and its player):
  - 26n_RDXe6Bvv  watched to the end (position 427.027027 / duration 427.027027)
  - pckH0H1NCUGJ  watched to the end (position 424.758089 / duration 424.758089)
  - aFaoWIXz-Ewy  opened and left after 2 s (position 0 / duration 0)
  - JhhL_iA4XF2Q  a text document opened and left (position 0 / duration 0)

  1 PASS. Rebuilt feed (restart of intelligence, sweep at 2026-11-11 18:56:04Z):
     drive home Pickup row (`/drive/動画?view=home`) 4 cards
     u3_93i912dLv, RmHD-Xu9IT0e, aR3bI3tKavvh, KtVKUiry6S_d; Pickup page first 80
     cards in stored rank order; video app Recommended 3 cards tHks_TcZZwfR,
     4JlurlUQ3OV1, UOOLYc0sHDex. Every card's file type read from
     `GET /api/files/<id>`: all `video` (`video/mp4` or the `.loft` mime).
     Stored feed checked directly: all 186 `pickup_item` ids are live
     `file_type='video'` rows in the core DB, none missing.
     Shots: shots/10-home-pickup-{ja,en}.png, shots/11-pickup-page-{ja,en}.png,
     shots/11b-pickup-page-top-{ja,en}.png,
     shots/12-video-app-recommended-{ja,en}.png.
  2 PASS. Pickup page description, read out of the rendered page in both
     languages (NEXT_LOCALE cookie switched in the UI settings):
     ja 「視聴履歴から見つけた、まだ開いていない動画です。」
     en "Videos you have not opened yet, drawn from what you have been watching."
     Shots: shots/11b-pickup-page-top-ja.png, shots/11b-pickup-page-top-en.png.
  3 PASS. None of 26n_RDXe6Bvv (watched), pckH0H1NCUGJ (watched),
     aFaoWIXz-Ewy (2 s) appears in the home row, the first 80 rows of the Pickup
     page, Recommended, the 186 stored `pickup_item` rows, or any
     `pickup_feed_log` row of any viewer. The Pickup page's own "最近見た"
     history does show them, as expected.
  4 PASS. Inside the intelligence container: `pickup_profile` for
     動画/88e96f181c1ac7fe = total 186, computed_at `2026-11-11 18:56:04.464810`,
     checkpoint `b65d586b484eb303fcbfb1b3efd0f190`. `pickup_feed_log` has one row
     for that viewer and drive: computed_at `2026-11-11 18:56:04.464810` (equal
     to the profile's), profile_version 3, 40 ids, and those 40 ids equal
     `pickup_item` rank 1..40 exactly, in the same order.
  5 PASS. Liked 26n_RDXe6Bvv in the UI (`liked_at` 2026-11-11T19:02:15Z), then
     restarted intelligence. `pickup_profile.computed_at` moved
     18:56:04.464810 -> 19:02:30.158867 and a second `pickup_feed_log` row
     appeared with the new computed_at (total stayed 186; the first two cards of
     the paged feed changed). Shot: shots/20-liked.png.
  6 PASS. Both commands run in the intelligence container, output pasted in the
     R-5 report:
     `python -m app.pickup.evaluate replay --drive 動画` exit 0, 60 cut points,
     4 viewers (02bb286b0179327f 41 cuts / 19 skipped, 53bf8651e06eb241 0,
     7424f0c842873587 3/57, 88e96f181c1ac7fe 0).
     `python -m app.pickup.evaluate online --drive 動画` exit 0.
     Replay took 3 s (5 s on a first run a minute earlier).
     Neither database file changed:
       /intelligence-data/search.db md5 9ec2f57a25eed56d0672a1084a3003b1,
         size 1122656256, before and after both commands.
       /data/data.db md5 3665800f7740893548c9607645444120,
         size 7958528, before and after both commands.
     No -wal/-shm file appeared beside either: both were already there before the
     commands and kept the same size and mtime (search.db-wal 1231912, -shm
     32768; data.db-wal 280192, -shm 32768) before and after.
     Raw log: docs/process/reviews/feature-pickup-accuracy/eval-output.txt.
  7 PASS. `python -m app.pickup.evaluate replay --drive no-such-drive` printed
     `no viewers` to stdout and exited 0.

  Not part of R-5, recorded as an observation: on this test-data copy, viewer
  02bb286b0179327f has 41 evaluated cut points and `after` recall@40 0.461 sits
  below `before` 0.467 and `video` 0.511. The shipping bar is defined on copies
  of the production databases and is run by the user, so this run cannot decide
  it.
pending: |
  The spec's shipping bar (item 10) `replay` on copies of the production
  databases, run by the user. Nothing else: the change's user-visible path was
  all driven in a real browser.

## Shipping bar (2026-11-12)

Drive: `main`, not `videos` as the spec names. The human chose it before the run:
`videos` holds a few anime series, so they could not tell whether its
recommendations are sensible, and they do not watch a video there because it was
recommended. `videos` was run as well, for reference and for the command time.

Procedure as the spec states: copies taken with the sqlite3 backup API inside the
running production `backend` and `intelligence` containers, switched to
`journal_mode=DELETE`, image built from the addon branch at d949f61, `docker run --rm`
with the copies mounted read-only. Copies, clone and image removed afterwards.

`main` (bar), 11 s:

| config | cuts | skipped | targets | recall@12 | recall@40 | hit@40 |
| --- | --- | --- | --- | --- | --- | --- |
| before | 55 | 5 | 397 | 0.006 | 0.046 | 0.182 |
| depth | 55 | 5 | 397 | 0.017 | 0.055 | 0.218 |
| video | 55 | 5 | 397 | 0.014 | 0.057 | 0.255 |
| after | 55 | 5 | 397 | 0.041 | 0.098 | 0.364 |
| random | 55 | 5 | 397 | 0.006 | 0.012 | 0.109 |
| newest | 55 | 5 | 397 | 0.060 | 0.127 | 0.455 |

One viewer (02bb286b0179327f), 55 cut points. `after` recall@40 0.098 >= `before`
0.046 and `video` 0.057: PASS.

`videos` (reference), 17 s:

| config | cuts | skipped | targets | recall@12 | recall@40 | hit@40 |
| --- | --- | --- | --- | --- | --- | --- |
| before | 49 | 11 | 129 | 0.080 | 0.202 | 0.327 |
| depth | 49 | 11 | 129 | 0.036 | 0.220 | 0.327 |
| video | 49 | 11 | 129 | 0.080 | 0.202 | 0.327 |
| after | 49 | 11 | 129 | 0.036 | 0.225 | 0.327 |
| random | 49 | 11 | 129 | 0.000 | 0.010 | 0.020 |
| newest | 49 | 11 | 129 | 0.094 | 0.094 | 0.224 |
