# Pickup: interest report

SPEC-ID: SPEC-ADDON-156

Approval:

## Summary

A read-only operator command that prints, per viewer, the interests Pickup learned from their
watch history and how the viewer has treated each one:
`python -m app.pickup.evaluate interests --drive <name>`. It exists to measure before deciding.
Two later changes depend on what it shows: showing learned interests to the viewer with a way to
reject one, and using videos the viewer abandons as a negative signal. Pickup's lanes are
k-means clusters per embedding type (thumbnail, keywords, text), and whether they match what the
viewer would call an interest, and whether "glanced and left" concentrates in some of them, is
not known today. The command changes nothing Pickup does.

Per-channel (uploader) statistics are out of scope: the channel is known only to Media Import's
database and needs its own design.

Names below are those of the intelligence addon at the commit the core pins
(`21834152`): `watch_rows`, `watch_state`, `profile_history`, `build_lanes`,
`representative_vectors`, `live_videos`, `RECORDING_START`, `PROFILE_WINDOW_DAYS`,
`PROFILE_VECTOR_CAP`, `_FUTURE_TOLERANCE_DAYS` in `app/pickup/profile.py`; `load_candidates`,
`restrict_candidates`, `score_lanes` in `app/pickup/retrieval.py`; `reference_now`, `freshness`
in `app/pickup/freshness.py`.

## Required items

### 1. Normal flow

1. The operator runs
   `docker compose exec intelligence python -m app.pickup.evaluate interests --drive <name>`
   with optional `--viewer <id>`, `--titles <n>` (default 5, 0 to 20) and `--picks <n>`
   (default 3, 0 to 20).
2. The command opens both databases read-only (`init_readonly_databases`, as `replay` and
   `online` do) and uses only read sessions.
3. The viewers are those with watch history in the drive, sorted by id ascending (as `replay`
   and `online` order them), or only the one given by `--viewer`.
4. **One instant.** The command takes `now = reference_now()` once per run and uses it for
   everything below: the window, the lanes, the ages and freshness.
5. **Lanes.** For each viewer it builds the lanes with the worker's own path:
   `profile_history(drive, viewer, now=now)` and `build_lanes(history,
   key=f"{drive}\x1f{viewer}", now=now)`. To list members, `profile.py` gains
   `cluster_lanes(history, *, key, now=None, vectors=representative_vectors)`, with the same
   parameters as `build_lanes`, returning `list[tuple[Lane, dict[str, np.ndarray]]]`: the lanes
   in `build_lanes`' order, each with its members' file ids mapped to the unit vectors of the
   lane's type that the clustering used. `build_lanes(...)` becomes
   `[lane for lane, _ in cluster_lanes(...)]` with every argument passed through, `vectors`
   included. `Lane` itself is not changed. The worker keeps calling `build_lanes`, and the
   command reads member vectors from `cluster_lanes` rather than loading them again.
6. **Row classes.** The viewer's rows from `watch_rows(drive, viewer)` pass the same filters
   `profile_history` applies before weighting: live, `file_type` video, a parseable
   `last_played_at`, not more than `_FUTURE_TOLERANCE_DAYS` in the future, and not older than
   `PROFILE_WINDOW_DAYS`, all measured from `now`. No cap applies to this classification. Each
   kept row is in exactly one class, the first that matches:
   1. liked or favourite → **watched**;
   2. `last_played_at` before `RECORDING_START` → **watched** if `watch_state(row).engagement`
      is above 0, else **legacy zero**;
   3. dismissed (the core's reading: `dismissed_at` not earlier than `last_played_at`) →
      **set aside**;
   4. no known duration (the reported duration is absent or not positive) → **no length**;
   5. `watch_state(row).watched` → **watched**;
   6. otherwise → **glanced**.

   **Marked** is counted separately: the viewer's not-interested marks in the drive whose file
   is a live video. A marked file can also be in a row class.
7. **Attribution.** For each embedding type that has at least one lane, every glanced row,
   set-aside row and Marked file (step 6: live videos only) whose
   `representative_vectors(..., type)` has a vector is
   attributed to the one lane of that type whose centroid has the highest cosine with that
   vector (ties: the lane listed first). In a type with no lane, or where the file has no
   vector, it is attributed to nothing.
8. **Picks.** Candidates are loaded per type with `load_candidates` and restricted to
   `live_videos(drive)` with `restrict_candidates`, as the worker does. Freshness is
   `freshness(created_at, now)` over `live_videos(drive)`. The exclusion set is the worker's:
   every non-video row of the viewer in the drive, every video whose `watch_state` is watched,
   and all of the viewer's marks in the drive (not only the Marked set of step 6). A lane's picks are the first `--picks` entries of `score_lanes` for
   that lane with those inputs, in `score_lanes`' order (before the feed's interleave).
9. **Members.** A lane's listed members are its members ordered by cosine with its centroid in
   that lane's type (highest first, ties: file id ascending), first `--titles` of them.
10. The report is built for all viewers and printed once at the end, then the command exits 0.

### 2. Failure cases

| Step | What goes wrong | What the system does |
|---|---|---|
| 2 | A database cannot be opened | Exits 1 with `<ErrorType>: <message>` on stderr, stdout empty. |
| 3 | No viewer has history in the drive, or `--viewer` has none there | Prints `no viewers`, exits 0. |
| 5 | The viewer's history yields no lanes (too little history, or no vectors) | The viewer's section prints its counts and then `no lanes`. |
| 3–9 | Any exception: a failed read (marks, history, vectors, candidates), `load_candidates`' or `score_lanes`' width check, a width mismatch in attribution or member ordering after an embedding model change | Exits 1 with `<ErrorType>: <message>` on stderr; stdout empty, also for viewers already processed. |
| 9 | A file's title is empty | The filename is printed; if that is empty too, the file id. |
| 1 | `--titles` or `--picks` is not an integer from 0 to 20 | argparse's usage error, exit 2. |

### 3. States

None. The command holds no state between runs and writes none.

### 4. Data read and written

- Read, core DB: `files`, `watch_history`, `played_segments`.
- Read, addon DB: `embeddings` and the vector tables, `indexed_files` (through
  `load_candidates`), `pickup_not_interested`.
- Written: nothing. Output goes to stdout and stderr only. `pickup_feed_log`, `pickup_items`,
  `pickup_profiles` and the worker's checkpoint are untouched.

### 5. External services

None. No LLM call.

### 6. Authorization

Whoever can run `docker compose exec` on the host, as for `replay` and `online`. It prints
titles of files in the named drive only.

### 7. Effect on existing features

- `profile.py`: `cluster_lanes` added; `build_lanes` delegates to it and returns the same lanes
  in the same order. `Lane`, the worker, the feed and `PROFILE_VERSION` do not change.
- `evaluate.py`: `main` dispatches the three subcommands by name; `replay` and `online` are
  unchanged.
- Docs: `docs/addons/intelligence.md`, next to the two existing commands.

### 8. Error behavior

As in item 2. The command logs nothing; errors go to stderr.

### 9. User-visible behavior

Operator only. Nothing changes in any screen.

A viewer's report is a sequence of blocks joined by exactly one blank line; the viewers' reports
are joined by exactly one blank line too, as in `replay` and `online` (`"\n\n".join`). Inside a
block, lines are joined by a single newline. The blocks, in order:

1. `viewer <id>`
2. The counts line, followed on the next line (same block) by
   `members capped at <PROFILE_VECTOR_CAP>` only when `profile_history` returned that many rows:

   ```
   watched <n>, glanced <n>, set aside <n>, no length <n>, legacy zero <n>, marked <n>
   ```

3. Either the single line `no lanes` (and the viewer's report ends), or the lane table:

```
| # | type | weight | members | 14d | 90d | median age | recorded | glanced | glance rate | set aside | marked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

| column | value |
|---|---|
| `#` | 1-based position in `build_lanes`' order (heaviest first) |
| `type` | the stored embedding type: `clip_thumbnail`, `tfidf_keywords` or `text_content` |
| `weight` | the normalised weight, three decimals |
| `members` | the lane's member count |
| `14d` / `90d` | members whose age is at most 14 / 90 days |
| `median age` | the members' median age in days, one decimal (even count: mean of the middle two) |
| `recorded` | members last played at or after `RECORDING_START` |
| `glanced` | glanced rows attributed to the lane |
| `glance rate` | `glanced / (recorded + glanced)`, three decimals; `-` when both are 0 |
| `set aside` | set-aside rows attributed to the lane |
| `marked` | marks attributed to the lane |

Ages are `(now - last_played_at)` in days.

4. One block per lane, in the table's order. Its lines are the heading `### <#> <type>`, then
   the members list, then the picks list, with no blank line between them:

   ```
   ### <#> <type>
   members
   - <title> (<engagement, two decimals>)
   picks
   - <title>
   ```

   The `members` label and its items are left out when `--titles` is 0, and the `picks` label
   and its items when `--picks` is 0. A list with nothing to show has the single item `- none`.

### 10. Non-functional

- One viewer costs about one worker rebuild, plus one `representative_vectors` call per type for
  the glanced, set-aside and marked files (one point read per stored vector, so a `text_content`
  file costs one read per chunk). Candidates are loaded once per type per run.
- Titles are printed to the operator's terminal; nothing leaves the host.

## Touch points

- `addons/intelligence/app/pickup/evaluate.py`: the `interests` subcommand and `main`'s dispatch.
- `addons/intelligence/app/pickup/profile.py`: `cluster_lanes`, with `build_lanes` delegating.
- `addons/intelligence/tests/`: tests for the subcommand and for `build_lanes` being unchanged.
- `docs/addons/intelligence.md`.
- The core's `addons/intelligence` pointer bump and `docs/specs/INDEX.md`.

`app/workers/pickup.py` is not edited: the command calls the same profile and retrieval
functions the worker calls. No protected path is edited.

## Invariants

I1. Running `interests`, whether it succeeds or fails, leaves both database files byte-for-byte as they were.
I2. The lanes the report lists (count, order, embedding type, member count, weight) equal those `build_lanes(profile_history(drive, viewer, now=now), key=f"{drive}\x1f{viewer}", now=now)` returns at the same `now`.
I3. For the same inputs, `build_lanes` (also with `vectors=`) returns the same lanes (order, type, centroid, member count, weights) as before the change, the worker stores the same feed and `PROFILE_VERSION`, and `replay` and `online` print the same output.
I4. In each embedding type that has a lane, a glanced row, set-aside row or Marked file with a vector of that type is attributed to exactly one lane of that type, the one whose centroid has the highest cosine with it; with no vector of that type, or no lane of that type, it is attributed to none of that type.
I5. The classified rows are exactly those `profile_history` keeps before weighting at the same `now` (live, video, parseable, not beyond `_FUTURE_TOLERANCE_DAYS` ahead, within `PROFILE_WINDOW_DAYS`), with no cap, and each is counted in exactly one of watched, glanced, set aside, no length and legacy zero.
I6. A liked or favourite row is always watched; a row last played before `RECORDING_START` is only ever watched or legacy zero; a dismissed row last played at or after `RECORDING_START` that is not liked or favourite is always set aside, whatever its coverage.
I7. A lane's `recorded` counts only its members last played at or after `RECORDING_START`, and its glance rate is `glanced / (recorded + glanced)`, printed `-` when both are 0.
I8. A lane's listed members are only its own members, ordered by cosine with its centroid; its picks are exactly the first `--picks` entries of the worker's `score_lanes` result for that lane, so they never include a non-video row, a watched video or a marked file.
I9. A viewer's section reads only that viewer's history and marks, and lists only files of the named drive.
I10. When any step fails, `interests` exits 1 and prints nothing to stdout, also for viewers already processed.

## Checked, no action

- **Showing interests to the viewer and rejecting one.** Deferred until this report shows
  whether lanes match what the viewer calls an interest. The profile's own comment already
  expects an explicit control for narrowing a subject.
- **Glanced as a negative signal.** Deferred: a glance cannot tell "bored" from "found what I
  wanted", and the glance rate per lane is what the decision needs.
- **Videos with no known length.** Reported as their own class rather than as glanced, so an
  embed that cannot report playback does not inflate the glance rate; whether they count as
  glances is decided with the negative-signal change.
- **The cap.** Classification is uncapped while lane members come from the capped history; the
  `members capped` line says when the two can differ. Below the cap they are the same rows.
- **The worker's separate clock reads.** The worker reads the time separately for the history,
  the lanes and freshness; the command uses one instant. The difference is the milliseconds
  between calls, and one instant is what makes I2 testable.
- **Recent against long-term interest.** Already in the lane weights (half-life 7 days, floor
  `W_MIN`, SPEC-ADDON-102/103); the report shows `14d`, `90d` and the median age so it can be
  judged, and adds no new weighting.
- **Per-channel statistics.** Out of scope: the channel lives only in Media Import's database.
- **Liked / favourite being per file rather than per viewer.** Known; a single-viewer
  installation is unaffected, and the report does not change it.
- **Labelling lanes with words.** Titles of the nearest members are shown instead; an LLM label
  would be a later step.
- **Partial output on failure.** Not printed: the other subcommands print once at the end, and
  a report missing viewers would read as complete.
- **A JSON output.** Markdown matches the other subcommands; a reader is a person.
