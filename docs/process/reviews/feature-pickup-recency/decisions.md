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
