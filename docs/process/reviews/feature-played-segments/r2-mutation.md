# Mutation review (R-3): played segments, SPEC-CORE-025 / SPEC-CORE-026

- Reviewed SHA: 8264a0b (detached worktree /tmp/mut-wt), diff against 126fdb7
- Spec: docs/specs/played-segments.md (I1 to I10, Checked no action read)
- Reviewer: fresh process, mutate perspective. Nothing was fixed, committed or pushed.
- Threat model (PROJECT.md): personal tool, no adversary; crafted input not pursued.

## Baseline (unmutated)

| Suite | Result |
|---|---|
| Frontend unit (playbackProgress.playedRanges.test.ts, playbackProgress.test.ts) | 87 passed |
| Backend (Docker, test_played_segments.py, test_progress.py) | 92 passed |
| E2E (played-ranges, Chromium) | 1 passed (run 3 times: all passed) |

Baseline is green; the artifact is valid.

## Mutations

Each mutation was applied alone, the suite named was run, the file was restored with `git checkout --`, and `git status --short` was checked empty before the next one.

### Capture module: frontend/src/lib/playedRanges.ts (suite: unit)

| Id | Change | Want | Result |
|---|---|---|---|
| M01 | MIN_COUNTED_SECONDS 10 -> 9 | kill (I6) | killed: "a stretch closed below 10 s sends nothing, one of exactly 10 s is sent" (x2) |
| M02 | SLACK_SECONDS 1 -> 0.5 | kill (I4/I5) | killed: "forward step equal to the allowance", "backward wobble of exactly 1 s", "resuming exactly 1 s past the end" |
| M03 | MAX_PENDING_RANGES 256 -> 255 | kill (I10) | killed: "more than 256 pending ranges" |
| M04 | send interval 15000 -> 20000 | kill (I10) | killed: "periodic send fires at 15 s", "timer runs while paused" |
| M05 | cut: `end > sentUpTo` -> `>=` | kill (I6 zero-length) | killed: 8 tests incl. "no zero-length range is sent" |
| M06 | cut: drop `s.counted &&` | kill (I6 held) | killed: 7 tests |
| M07 | counted at `> 10` instead of `>= 10` | kill (I6 boundary) | killed: 8 tests incl. "exactly 10 s is sent" |
| M08 | no-profile tick keeps the stretch | kill (I8) | killed: "clearing the profile discards the open counted stretch" |
| M09 | non-eligible tick keeps tracking | kill (I3) | killed: "resuming 1.25 s past the end starts a new stretch" |
| M10 | re-entry always continues the stretch | kill (step 4) | killed: 2 pause/resume tests |
| M11 | allowance without +1 s slack | kill (I4/I5) | killed: "forward step equal to the allowance" |
| M12 | allowance ignores playback rate | kill (I5) | killed: "rate 2 published every 2000 ms" |
| M13 | Unchanged branch refreshes reference wall time | kill (I5) | killed: 3 publish-interval tests |
| M14 | Unchanged only on `delta === 0` (wobble closes) | kill (I5) | killed: "backward wobble of exactly 1 s" |
| M15 | jump branch does not reset the reference | kill (I4) | killed: 7 tests |
| M16 | final flush does not null the stretch | live (equivalent: `active=false` gates everything) | live, equivalent |
| M17 | final flush does not set `active=false` | live (equivalent in the hook: listeners, timer, captureRef all released at teardown) | live, equivalent |
| M18 | no-profile send moment keeps pending | kill (I8) | killed: "a send moment without a profile discards pending ranges" |
| M19 | 256 trim keeps the oldest | kill (I10) | killed: "more than 256 pending ranges" |
| M20 | retry on `>= 400` | kill (I10 4xx) | killed: 400/404/422 discard tests |
| M21 | no retry on network rejection | kill (I10) | killed: "after a network failure ... next send, once" |
| M22 | retry order `[...pending, ...batch]` | live (only matters for >256 with a range added while a request is in flight) | live; see note N1 |
| M23 | `keepalive: false` | kill (I10) | killed (unit): "sends a played stretch on teardown with keepalive"; also killed by e2e |
| M24 | flush does not cut the open stretch | kill (I6/I10) | killed: 55 tests |
| M25 | synchronous throw from `send` not retried | live (equivalent: `sendPlayedRanges` is async, never throws synchronously) | live, equivalent |
| M26 | played needs `delta < allowance` | kill (I5 boundary) | killed: "forward step equal to the allowance" |
| M27 | played branch never opens a stretch when none exists | live (equivalent: tracking implies a stretch) | live, equivalent |
| M28 | re-entry sets `end = position` instead of max | kill (step 4 "the larger of") | **live** -> F1 |
| M29 | allowance drops `Math.max(0, ...)` on wall-clock delta | live (only a backwards `Date.now()`) | live, near-equivalent |
| M30 | re-entry slack `<` instead of `<=` | kill (step 4 boundary) | killed: "resuming exactly 1 s past the end continues" |
| M31 | re-entry within slack does not extend the stretch | kill (I6, step 4) | **live** -> F1 |
| M32 | observe not gated by `active` | live (equivalent: unsubscribed at teardown) | live, equivalent |
| M33 | flush not gated by `active` | live (equivalent: nothing flushes after teardown) | live, equivalent |
| M34 | empty pending still sends | kill (I10 "nothing sendable sends nothing") | killed: 9 tests |
| M35 | close() does not cut the stretch | kill (I6) | killed: 7 tests |
| M36 | retry on `> 500` (500 dropped) | kill (I10) | killed: "after a 500 the ranges go with the next send" |
| M37 | trim at `>= 256` | live (equivalent: slice to 256 is a no-op at 256) | live, equivalent |

### Hook: frontend/src/lib/playbackProgress.ts (suite: unit, e2e where noted)

| Id | Change | Want | Result |
|---|---|---|---|
| H01 | teardown flush not final | live (equivalent: nothing reaches the capture after teardown) | live, equivalent |
| H02 | no teardown flush | kill (I10) | killed: 41 tests |
| H03 | visibilitychange flushes on visible too | kill (I10) | killed: "visibilitychange to hidden is a send moment, to visible is not" |
| H04 | no pagehide listener | kill (I10) | killed: 14 tests |
| H05 | notifyEnded is not a send moment | kill (I10) | killed: "notifyEnded is a send moment" |
| H06 | eligibility ignores resumePendingRef | kill (I3) | killed: "ticks while the stored position is being read are not counted" |
| H07 | eligibility ignores rate read failure | kill (step 2) | killed: "a tick whose getPlaybackRate throws is not eligible" |
| H08 | eligibility ignores interrupted | kill (I3) | killed: "time on another clock while interrupted adds nothing" |
| H09 | eligibility ignores duration | kill (I3) | killed: duration 0 / NaN / Infinity tests |
| H10 | observeTick after onTick | live expected (order unspecified) | live in unit; **killed by e2e** (first range start 1.01-1.09 s after start, limit 1 s; 3/3 runs). See F2 |
| H11 | captureRef nulled unconditionally | live (equivalent: React runs cleanup before the next setup) | live, equivalent |
| H12 | no try/catch around notifyEnded flush | live (equivalent: flush cannot throw) | live, equivalent |
| H13 | no try/catch in flushCapture | live (equivalent: same) | live, equivalent |
| H14 | periodic timer does nothing | kill (I10) | killed: 3 tests |
| H15 | interval not cleared at teardown | kill | killed: "releases the clock on unmount" (playbackProgress.test.ts) |
| H16 | captureRef not cleared at teardown | live (equivalent: stale capture is inactive) | live, equivalent |
| H17 | wallMs constant 0 | kill (I5) | killed: 5 tests |
| H18 | capture always sees a profile | kill (I8) | killed: "clearing the profile discards the open counted stretch" |

### E2E only (suite: played-ranges, Chromium)

| Id | Change | Want | Result |
|---|---|---|---|
| E-H10 | as H10 | live | killed (3/3 runs) |
| E-M23 | as M23 | kill | killed: `keepalive` assertion |
| E-M11 | as M11 | kill | killed: total/last assertions |

### Backend (suite: Docker pytest)

| Id | File | Change | Want | Result |
|---|---|---|---|---|
| B01 | schemas.py | PLAYED_SEGMENT_SECONDS 5 -> 10 | kill (I1) | killed: 17 tests incl. test_worked_example |
| B02 | progress.py | `math.floor` -> `int(start // 5)` | live (equivalent for start >= 0) | live, equivalent |
| B03 | progress.py | `range(first, last + 1)` | live (equivalent: extra index has hi <= lo) | live, equivalent |
| B04 | progress.py | `hi >= lo` | live (equivalent: hi > lo always inside the range) | live, equivalent |
| B05 | progress.py | upsert overwrites instead of adding | kill (I2) | killed: test_same_range_twice_doubles, test_concurrent_requests_lose_no_addition |
| B06 | progress.py | POST: file check before the no-viewer 204 | kill (precedence) | killed: test_no_viewer_wins_over_unknown_file_on_post |
| B07 | progress.py | GET: no-viewer check before the file check | kill (precedence, I8) | killed: test_unknown_file_wins_over_no_viewer_on_get, test_locked_drive_is_404 |
| B08 | progress.py | GET drops `order_by(segment_index)` | live expected (PK index order) | live, equivalent under the current schema: EXPLAIN shows `SEARCH ... USING sqlite_autoindex_played_segments_1 (viewer_id=? AND file_id=?)`, rows come back ascending even when inserted 9,2,5,0 |
| B09 | progress.py | GET drops the viewer filter | kill (I8) | killed: test_get_returns_only_the_requesting_viewers_totals |
| B10 | progress.py | DELETE removes segments only when a watch_history row exists | kill (I9) | killed: test_delete_removes_rows_when_no_watch_history_row_exists |
| B11 | progress.py | DELETE drops the file filter | kill (I9) | killed: test_delete_removes_only_this_viewers_rows_for_this_file |
| B12 | progress.py | DELETE drops the viewer filter | kill (I9) | killed: same |
| B13 | progress.py | DELETE commits between the two deletes | kill (I9 one transaction) | killed: test_a_failed_delete_is_500_and_removes_neither[played_segments] |
| B14 | schemas.py | max ranges 257 | kill (I10) | killed: test_invalid_body_is_422[257-ranges] |
| B15 | schemas.py | min ranges 0 | kill (I10) | killed: [zero-ranges], test_invalid_body_wins_over_no_viewer |
| B16 | schemas.py | `0 < start` | kill (I10) | killed: 20 tests |
| B17 | schemas.py | `start <= end` | kill (I10) | killed: [zero-length] |
| B18 | schemas.py | `end < 604800` | kill (I10 boundary) | killed: test_segment_boundaries[rng4] |
| B19 | schemas.py | 604800 -> 604801 | kill (I10) | killed: [past-7-days] |
| B20 | schemas.py | no non-finite pre-validator | kill (I10 422 not 500) | killed: test_non_finite_number_is_422[NaN/Infinity] |
| B21 | models.py | FK without ON DELETE CASCADE | kill (I9) | killed: test_hard_delete_removes_the_files_rows |
| B22 | progress.py | POST skips the file check | kill (I8) | killed: 4 tests (unknown, trash, missing, locked) |
| B23 | progress.py | POST does not commit | kill (I1) | killed: 23 tests |
| B24 | models.py | drop `idx_played_segments_file_id` | live expected (no behaviour) | live -> F3 |
| B25 | progress.py | per-segment `=` instead of `+=` across ranges | kill (I1) | killed: test_every_range_in_a_request_adds_its_length |
| B26 | schemas.py | segment_seconds response 1 | kill (I1) | killed: 8 tests |
| B27 | progress.py | GET skips the file check | kill (I8) | killed: 7 tests |
| B28 | progress.py | DELETE does not remove segments | kill (I9) | killed: 3 tests |

Totals: 86 mutations (37 + 18 capture/hook unit, 3 e2e, 28 backend). Killed: 61 by the unit or backend suites, 1 more (H10) by e2e only. Live: 22, of which 18 are equivalent or near-equivalent (listed below), 2 are findings (M28, M31 -> F1), 1 is a spec-mandated non-behavioural item (B24 -> F3), 1 is timing-dependent (M22, note N1).

### Equivalent or near-equivalent live mutants (not findings)

M16, M17, M25, M27, M32, M33, M37, H01, H11, H12, H13, H16, B02, B03, B04, B08 are equivalent for the reasons given in the tables. M29 differs only if `Date.now()` steps backwards. H10 is equivalent for the unit suite but not for a real browser (see F2).

N1 (M22, not pursued): retry prepends the failed batch so the 256 trim drops the oldest. Reversing the order only changes which ranges are dropped when more than 256 are pending and a new range was added while a request was in flight (a jump closing a counted stretch inside the request's round trip, after about an hour of failed sends). That needs unusual timing, so per review.md it is not pursued; it is noted because no test covers the order of a retried batch relative to newer pending ranges.

## Findings

### F1
- claim: The rule that a stretch continued after a non-eligible tick takes "the larger of its current end and the new position" (spec step 4) is not pinned by any test; two mutants of it survive (M28, M31).
- impact: With M31, a held stretch that reaches 10 s exactly at the re-entry tick and closes on the next event (teardown or a jump within one 250 ms clock tick) is discarded instead of sent; with M28, a re-entry slightly behind the old end shortens the sent range by up to 1 s. Both need the stretch to close within one tick of resuming, so the user-visible effect today is negligible; the gap matters if the extend logic is later refactored.
- evidence: frontend/src/lib/playedRanges.ts:84-85 (`if (stretch && Math.abs(position - stretch.end) <= SLACK_SECONDS) { extend(stretch, position); }`) and :63-64 (`s.end = Math.max(s.end, position)`). The pause/resume tests in playbackProgress.playedRanges.test.ts:546-597 always play 2 s or more after resuming, which re-extends the stretch and masks both mutants.
- repro: M31 (delete `extend(stretch, position);` in the re-entry branch) and M28 (`s.end = position;`): full unit suite 87/87 green. Scratch test (written in the throwaway worktree, run, deleted): play 9 s, pause, set position 10, resume, one idle tick, unmount -> original sends `[{start:0,end:10}]`, M31 sends nothing. Second scratch: play 12 s, pause, set position 11.5, resume, one idle tick, unmount (before the 15 s timer) -> original `end: 12`, M28 `end: 11.5`.
- introduced: introduced
- bucket_proposal: B. The mutants break spec step 4 and, for M31, I6 ("sent ... up to its last observed tick"), but only when the stretch closes within one clock tick of resuming, which review.md treats as unusual timing; so the proposal is a test gap that reads wrong, not A.
- severity: LOW
- origin: reviewer
- proposed_fix: Add a unit test that resumes within 1 s of the stretch end (one case ahead crossing 10 s, one case behind) and tears down on the very next tick, asserting the sent end.

### F2
- claim: Media time that plays while the stored resume position is being read is added to the range when the read finishes within 1 s and no seek follows, which contradicts I3 ("Time while the player is ... reading the stored resume position ... adds nothing to any range"), and the e2e test depends on that behaviour.
- impact: For a player that has no `notifyReady` (the media_import `YouTubeEmbed`, and the e2e fixture) the resume read starts on the first tick with a usable duration, which can be a playing tick; that tick is observed as eligible before `onTick` sets `resumePendingRef`, and the re-entry rule (step 4, 1 s slack) then continues the stretch across the read. Up to 1 s of media is counted. That time was genuinely played, so the data is not wrong; the contradiction is between I3 and step 4 of the spec, and only a human can say which governs.
- evidence: frontend/src/lib/playbackProgress.ts:231-232 (`observeTick(); onTick();`, capture sees the tick before `onTick` starts the read) and frontend/src/lib/playedRanges.ts:80-90 (re-entry within `SLACK_SECONDS` extends the open stretch). E2E baseline: first range starts 0.78-0.84 s after `startedAt`; with H10 (observe after onTick, so the read tick is ineligible) it starts 1.01-1.09 s after and `expect(Math.abs(first - startedAt)).toBeLessThanOrEqual(1)` (e2e-components/played-ranges.spec.ts:159) fails 3/3.
- repro: Scratch unit test (throwaway, deleted): stub at position 30 with duration NaN, one tick, set duration 600, one tick (read starts, `getWatchProgress` pending), play 0.75 s, resolve the read with position 0, play 12 s, unmount -> sent `[{start:30,end:42.75}]`; I3 read literally requires the start to be at least 30.75. Mutation H10 is killed only by the e2e for the same reason.
- introduced: introduced
- bucket_proposal: C. The code follows step 4 and the e2e enforces it, while I3 forbids it; the spec contradicts itself, which is a design question for the human (amend I3 to exempt a read that ends without a seek, or make the read tick ineligible).
- severity: LOW
- origin: reviewer
- proposed_fix: Decide which rule governs; if step 4, reword I3 to say the resume read's time is not counted across a resume seek; if I3, mark the tick that starts the read ineligible and widen the e2e start tolerance accordingly.

### F3
- claim: The `file_id` index on `played_segments`, which spec section 4 requires, is not covered by any test; removing it leaves both suites green.
- impact: None functional. Without it, a file's hard delete cascades with a full scan of `played_segments`; the spec added the index for exactly that reason.
- evidence: backend/app/models.py:221 (`__table_args__ = (Index("idx_played_segments_file_id", "file_id"),)`).
- repro: B24 (drop the `__table_args__` line): backend 92/92 green.
- introduced: introduced
- bucket_proposal: B. Performance-only schema requirement, not one of I1-I10.
- severity: INFO
- origin: reviewer
- proposed_fix: Assert the index exists via `sqlalchemy.inspect(engine).get_indexes("played_segments")` in test_played_segments.py.

### F4
- claim: The e2e start assertion (`|first - startedAt| <= 1`) has about 0.16-0.22 s of headroom in observed baseline runs, because the first counted tick follows the 1000 ms idle clock phase after `play()`.
- impact: Possible CI flakiness of e2e-components/played-ranges.spec.ts under load; a one-tick (250 ms) behaviour change (H10) already pushes it over.
- evidence: e2e-components/played-ranges.spec.ts:159; observed first-start offsets 0.843 s and 0.784 s in two instrumented baseline runs (instrumentation was temporary and reverted).
- repro: Temporarily log `first - startedAt` in the e2e and run the baseline twice: 0.843, 0.784.
- introduced: introduced
- bucket_proposal: B. Test robustness, no invariant broken.
- severity: INFO
- origin: reviewer
- proposed_fix: Base the tolerance on `MEDIA_CLOCK_IDLE_MS` plus one active tick, or start playback before the hook's first idle tick deterministically.

## Not verified

- Real players other than a native `<video>` in Chromium: YouTube embed (rate 1x/2x, ads, `getDuration()` timing), iOS shell foreground and locked screen; these are `agent_cannot_verify` in the spec.
- Behaviour on a real `pagehide` / `visibilitychange` in a browser (only jsdom events were exercised by the unit tests; the e2e covers teardown only).
- Real concurrency of two tabs against SQLite beyond what test_concurrent_requests_lose_no_addition does; WAL contention was not measured.
- `init_db` creating the table and index on an existing database (only the test fixture's fresh schema was used).
- e2e flakiness rate (F4) beyond 5 baseline-equivalent runs.
- frontend/src/lib/api.ts (listed in spec touch points) was not mutated; the send lives in playedRanges.ts.
- docs/reference/api.md content was not reviewed (prose is not a mutation target).
- The timing-dependent M22 scenario (N1) was not reproduced.

TOTAL: 4 findings
