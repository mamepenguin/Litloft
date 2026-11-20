# Decisions

decision:
ran_in_app: yes
at: 1af39cba175c8bad65a57c4f79755085f561166b
by: agent
evidence: |
  Environment: the running `video_share-*` stack was left untouched (intelligence at 3755982,
  the previous code). The worktree's `addons/intelligence/app` was copied to
  `/tmp/r5-interests/app` in `video_share-intelligence-1` and the command run from
  `-w /tmp/r5-interests`; `python -c "import app; print(app.__file__)"` printed
  `/tmp/r5-interests/app/__init__.py`, so the new code was the one that ran.

  The real stack's `search.db` has no `pickup_not_interested` table (the running intelligence
  predates it; `init_search_db` creates it at startup), so the first run against the live data
  exited 1 with `OperationalError: ... no such table: pickup_not_interested` and empty stdout.
  To exercise the report, a consistent copy was made inside the container (sqlite3 backup from a
  `mode=ro` connection) into `/tmp/r5-interests/data/search.db`, and only the missing table was
  added to the copy (empty, same DDL as `models.PickupNotInterested`). `INTELLIGENCE_DATA_DIR`
  pointed at the copy; the core DB stayed `/data/data.db` (read-only mount). The copy was removed
  afterwards (`rm -rf /tmp/r5-interests`).

  Drive list (core DB, `files.drive` x `watch_history`): 動画 557 rows, テスト画像 206,
  eval-drive 6, cloudsync-test 3, 同期テスト 0.

  1. Defaults, full stdout in `shots/interests-<drive>.md`, each exit 0:
     - 動画: 4 viewers (02bb286b0179327f, 53bf8651e06eb241, 7424f0c842873587,
       b984b062497e967e, id ascending), 0.90-0.98 s.
     - テスト画像: 2 viewers (7 lanes for 02bb..., `no lanes` for 7424f0c8...), 1.00 s.
     - eval-drive: 2 viewers, 0.35 s. cloudsync-test: 1 viewer, 0.35 s.
     All run times are wall clock for `docker exec`; each is well under a second to about a
     second, so waiting is acceptable.

  2. sha256 inside the containers, before the first run and after the last:
     `data.db` 807df6b94ef909f7057d893144db684f0a1e2ed1e64b75059ea8a42a620e837d both
     times; `search.db` 4c85d1d4d33dca83262184011dfc31b9fe973397759aa916a86dbfdd9fb07892
     both times. The copy's sha (246962fd...) also did not change across a run, and its
     `search.db-wal` stayed 0 bytes. `search.db-wal` (7.2 MB) kept its 12:39:26 mtime
     throughout, i.e. the stack's indexer did not write during the session either.
     `data.db-wal` changed at 15:04:47 JST while the session was open (before the controlled
     test); a command run in between left its mtime at 15:04:47 and the main file hash
     unchanged, so that write came from the running core, not from `interests`.

  3. Layout: 307-line output for 動画, no `\n\n\n` anywhere, one trailing newline. Blocks are
     `viewer <id>`, the counts line, the 12-column table with the exact header and separator,
     then one `### <#> <type>` block per lane with `members`, item lines `- <title> (<eng>)`,
     `picks`, item lines. 21 table rows and 21 lane blocks for the big viewer, 2 and 2 for
     7424f0c842873587; every lane block had both labels and 5 members + 3 picks. Weights
     descend (1.000, .856, .799, .783, .698, .312, then 0.250 = W_MIN). Glance rates are
     `glanced/(recorded+glanced)` three decimals, `-` where both are 0; e.g. lane 1 shows
     1 recorded, 7 glanced, 0.875. Members' parenthesised values are engagement (two
     decimals), so member order (by cosine) is not visible in the output, as specified.

     Counts against the DB (read with `mode=ro` inside the container):
     - 動画 / 02bb286b0179327f: 527 watch rows, of which 298 are live videos and 229 are
       non-video (document 139, image 58, audio 17, archive 7, other 8); classes
       199+13+0+5+81 = 298, rows outside the 365-day window 0.
     - テスト画像 / 02bb...: 31 video rows, 25+0+0+1+5 = 31.
     - eval-drive / 02bb...: 1 video row, watched 1. cloudsync-test: documents only, all
       classes 0 and `no lanes`. 7424f0c842873587 in 動画: 7 video rows, 3+4 = 7.
     - `set aside` 0 is right: no row in any drive has `dismissed_at`. `marked` 0 matches the
       empty marks table (unexercised). 53bf8651e06eb241 has 5 history rows, all non-live
       non-video, so it prints zeros and `no lanes`, which the spec allows.

     Reading it as an operator: the strong lanes are each one coherent subject (a series, a
     game's guides, a product category); the small tail lanes mix two or three unrelated
     subjects. Picks match the lane's subject in roughly half the lanes and are off-subject in
     the rest, which is `score_lanes`' ranking, the input the spec fixes, not the command's
     choice. The full reports list library titles and are kept outside the repository.
     Glance rates are high (0.83-1.00) because members are almost all older than
     RECORDING_START while the attributed glances are recent; the formula is the one in I7.

  4. Option and failure runs (stderr/stdout kept under `shots/`):
     - `--titles 0 --picks 0` on 動画: exit 0, 94 lines; lane blocks are the heading only,
       no `members`/`picks` labels (`interests-動画--titles0--picks0.md`).
     - `--viewer b984b062497e967e` on 動画: exit 0, only that viewer, counts and `no lanes`.
     - `--drive no-such-drive`: exit 0, stdout `no viewers`, empty stderr.
     - `--drive 同期テスト` (no history): exit 0, `no viewers`.
     - `--drive cloudsync-test --viewer 7424f0c842873587` (no history there): exit 0,
       `no viewers`.
     - `--picks 21`: exit 2, stdout empty, argparse usage error on stderr naming the
       choices 0-20. `--titles 21` the same.
     - `INTELLIGENCE_DATA_DIR` with no `search.db`: exit 1, stdout empty,
       `FileNotFoundError: Database not found: ...` on stderr.
     - a non-SQLite `search.db`: exit 1, stdout empty, `DatabaseError: (sqlite3.DatabaseError)
       file is not a database` on stderr.

  5. Docs: `docs/addons/intelligence.md` line 846-849 documents the three read-only commands
     and the `interests` options as they behave (`--viewer`, `--titles` default 5, `--picks`
     default 3, both 0-20, one row per interest with weight/members/recency, glance rate from
     2026-11-05, titles and picks under the table).
pending: |
  - `members capped at 2000` line not produced: no viewer has 2000 history rows.
  - `- none` item not produced: every lane had at least one member and one pick at
    `--picks 20`.
  - the not-interested (`marked`) path: the table is empty in this data, so `marked` was 0
    everywhere and marks were never attributed.
  - the empty-title -> filename -> file-id fallback was not produced (no such file).
  - partial output on an exception raised after one viewer was already processed.
  - the run used a copy of `search.db` with the missing `pickup_not_interested` table added;
    on a stack carrying the new code the table comes from startup `create_all`, which this
    environment could not exercise without restarting the running stack.
