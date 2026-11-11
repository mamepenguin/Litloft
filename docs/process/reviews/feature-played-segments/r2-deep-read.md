# Deep review: played segments (commit bfa2b0a4754cd4d91ffd8ae429fac104a6dee536)

Reviewer: claude-deep, role read, risk HIGH. Perspectives: scope, submodules, persistence, concurrency.
Read: the brief, `docs/specs/played-segments.md` (as quoted in the brief), `frontend/src/lib/playedRanges.ts`, `frontend/src/lib/playbackProgress.ts`, `frontend/src/lib/mediaClock.ts`, `frontend/src/lib/mediaController.ts` (YouTube controller), `frontend/src/lib/nativeMediaController.ts`, `frontend/src/lib/api.ts` (progress helpers), `backend/app/routers/progress.py`, the schema and model diff, `backend/app/database.py` (FK pragma), `backend/tests/conftest.py`, and the new backend, unit and e2e tests.

## First-review question: places the diff reaches that are not in the touch-point list

None. Every path in the diff is covered: `backend/app/models.py`, `backend/app/routers/progress.py` and `backend/app/schemas.py` (backend touch points), `frontend/src/lib/playbackProgress.ts` and the new `frontend/src/lib/playedRanges.ts` (the "new capture module"), `docs/reference/api.md`, `backend/tests/test_played_segments.py`, `frontend/src/lib/__tests__/playbackProgress.playedRanges.test.ts` and `frontend/src/components/__tests__/componentFixtureParity.test.tsx` (tests under `frontend/src/`), and `frontend/e2e-components/{played-ranges.spec.ts, fixtures/playedRanges.tsx, fixtures/app.tsx, spec-viewport.spec.ts}` (e2e with fixtures and registration). `docs/specs/*` is implicit. No submodule pointer under `addons/` moves. The reverse case is F4: a listed touch point, `frontend/src/lib/api.ts`, is not edited.

### F1
- claim: The spec's capture state table says an eligible tick after a non-eligible one counts no movement, but the code (and spec Normal flow step 4) extends the kept stretch to that tick's position, so up to 1 s of media that moved while ineligible is counted.
- impact: At most 1 s per re-entry is credited for time that moved while resume was pending, the rate was unreadable, or the player was paused and seeked by up to 1 s. Because the two spec passages disagree, someone could "fix" the code to match the table and break the continuation behavior that I3 requires. The data itself stays within the spec's accepted error.
- evidence: `frontend/src/lib/playedRanges.ts:84-86` (`if (stretch && Math.abs(position - stretch.end) <= SLACK_SECONDS) extend(stretch, position)`); spec §3 States row "Not tracking | Eligible tick | ... No movement is counted for this tick" against §1 step 4 "its `end` becomes the larger of its current `end` and the new position". The unit test "after a pause, resuming exactly 1 s past the end continues the stretch" asserts `[0, 13]` after 10 s played, a 1 s move while paused, and 2 s played, so it pins the step-4 reading.
- repro: Read-through: play 10 s, pause, seek +1 s, resume, play 2 s; the code sends `[0, 13]`, which credits the paused 1 s seek. The test above shows this result.
- introduced: introduced
- bucket_proposal: B. The code follows Normal flow step 4 and the "Checked, no action" entry for a forward seek of 1 s or less. Only the state-table wording reads wrong. No declared invariant breaks beyond the accepted 1 s slack.
- severity: INFO
- origin: reviewer
- proposed_fix: Change the state-table row to "the kept stretch continues if the position is within 1 s of its end", or delete its "No movement is counted" clause.

### F2
- claim: When two requests are in flight and the older one fails first, the retry puts the newer batch in front of the older one in `pending`, so the 256 trim can drop newer ranges and keep older ones.
- impact: This needs more than 256 pending ranges and two requests that stay unanswered for more than 15 s, then fail out of order: in practice a hanging backend during a long session with many seeks. If that happens, the stored data is skewed toward older stretches. This cannot happen in normal use.
- evidence: `frontend/src/lib/playedRanges.ts:128-130` (`retry = () => { pending = [...batch, ...pending] }`) and `:122-124` (trim keeps the array tail). Sequence: batch1 in flight, batch2 in flight, batch1 fails so `pending = [b1, P]`, then batch2 fails so `pending = [b2, b1, P]`, and `b2` is newer than `b1`.
- repro: not_reproduced (worked through by hand). The existing test "more than 256 pending ranges" fails every request at once (503 resolves immediately), so only one batch is ever in flight and the ordering is never exercised.
- introduced: introduced
- bucket_proposal: B. It touches I10's "never more than the newest 256" only under a hung backend, which is outside normal use under the declared threat model.
- severity: LOW
- origin: reviewer
- proposed_fix: Re-sort `pending` by `start`-independent capture order (for example a sequence number per range) before trimming, or accept and record it.

### F3
- claim: No test can detect removing the `try/catch` around `observeTick` or around the `notifyEnded` flush, because nothing inside them can throw today; I7's "a throw inside capture does not stop those saves" is therefore protected only by code that the tests never exercise.
- impact: A later change that makes `capture.observe` throw (for example a new field read from the controller) would skip `onTick` in the same listener (`playbackProgress.ts:230-233` calls `observeTick()` before `onTick()`), so resume and periodic saves would stop. No test would fail if the guard had been removed first.
- evidence: `frontend/src/lib/playbackProgress.ts:195-221` and `:80-84`. The only throw-injection test, "a throw from fetch inside a send does not stop saves or playback", exercises `flush`, which already catches internally at `playedRanges.ts:132-137`.
- repro: Mutation: delete the outer `try/catch` in `observeTick`. Every test in `playbackProgress.playedRanges.test.ts` and `playbackProgress.test.ts` still passes, because `getMediaClockSnapshot` and `observe` cannot throw (`getPlaybackRate` has its own inner catch). This was worked out by reading, not run.
- introduced: introduced
- bucket_proposal: B. The invariant holds today; this is a test gap.
- severity: INFO
- origin: reviewer
- proposed_fix: Add a test that makes `capture.observe` throw (for example via `vi.spyOn` on the module's factory) and asserts that saves continue, or move `observeTick()` after `onTick()` so a throw cannot skip the save.

### F4
- claim: The touch-point list names `frontend/src/lib/api.ts`, but the diff does not edit it: the send helper `sendPlayedRanges` lives in `playedRanges.ts` and hard-codes the `/api` prefix instead of using `api.ts`'s `API_BASE`.
- impact: No user-visible effect today (`API_BASE` is `"/api"`, `api.ts:5`). A later change to `API_BASE` would not reach this call. The touch-point list is not accurate.
- evidence: `frontend/src/lib/playedRanges.ts:155` `fetch(\`/api/files/${fileId}/played-ranges\`, ...)`; `frontend/src/lib/api.ts:5`; the diff has no hunk for `api.ts`.
- repro: not_reproduced (read-through).
- introduced: introduced
- bucket_proposal: B. Scope and record accuracy; no invariant is affected.
- severity: INFO
- origin: reviewer
- proposed_fix: Either move `sendPlayedRanges` into `api.ts` next to `saveWatchProgress`, or drop `api.ts` from the touch-point list.

## Specification compliance

Invariants (holds? / would a test catch a break?):

- I1: Holds. `_segment_seconds` (`progress.py:134-144`) uses floor/ceil and clips to `[5n, 5n+5)`, and only adds positive spans, so no empty segment is written. GET orders by `segment_index`, and `segment_seconds` defaults to 5. Test: the worked example plus boundary parametrization (`4.5-5.5`, `604795-604800`) would catch an off-by-one or a wrong ordering.
- I2: Holds. The atomic `INSERT ... ON CONFLICT DO UPDATE SET played_seconds = played_seconds + excluded` runs in one statement. Test: "same range twice doubles", and 16 concurrent posts through per-request sessions on a file DB (`conftest.py:75-92`). A read-modify-write version would either lose an update or hit SQLITE_BUSY (500), and both fail the test.
- I3: Holds. Eligibility is `!paused && !interrupted && usable(duration) && !resumePending && rateReadable` (`playbackProgress.ts:208-213`). A non-eligible tick sets `tracking=false` and keeps the stretch, and re-entry within 1 s continues it. Tests: pause, stall, interruption, resume-pending, duration 0/NaN/Infinity, and rate-throws. Removing any single eligibility term fails at least one of them (the interruption test fails through the 0.25 offset of the new stretch). The 1 s re-entry slack is F1.
- I4: Holds. A forward step beyond `elapsed × rate + 1`, or a backward step past -1 s, closes the stretch and opens a new one at the destination (`playedRanges.ts:91-107`). The resume seek and the `?t=` seek land while the stretch is held, or before tracking, so nothing skipped is counted. Tests: allowance-equal versus allowance+0.25, backward 1 s versus 1.25 s, the resume seek to 120, and `?t=42`. Note: on the tick where the duration first becomes usable, `observeTick` runs before `onTick` starts the resume read, so that one tick is eligible. It only opens tracking (no movement is counted), and the later resume seek closes that held stretch, so the result is still correct.
- I5: Holds. "Unchanged" keeps the reference wall time, so a slow publisher or a throttled tick still falls within the allowance. Tests: a 6-row rate × publish-interval matrix, skipped clock ticks (a throwing controller), and a 1 s wobble. Known accepted exception: a long stall followed by a seek is credited ("Checked, no action").
- I6: Holds. `counted` is set at `end - start >= 10` and never cleared. `cut` emits `[sentUpTo, end]` only when `end > sentUpTo`, and `close`/`flush` both cut. Tests: below 10 s at start 0 and 300, a 15 s periodic cut with no gap or overlap, no zero-length ranges, and a held stretch sent whole later.
- I7: Holds. The new endpoints do not touch `watch_history` (backend test compares rows before and after). Capture lives in refs and closures, and the render-count test covers it. Saves: the existing `playbackProgress.test.ts` still pins save timing and values with capture active. A throw inside capture is guarded but the guard is not tested (F3).
- I8: Holds. The client resets on any tick with no profile and discards pending at a profile-less send. The backend returns 204 for no viewer on POST and an empty list on GET, filters by viewer, and returns 404 for missing, trashed or locked files before writing. All of these are tested, including the precedence rows.
- I9: Holds. `delete_progress` deletes both in one session before a single `commit` (`progress.py:124-129`), including when no `watch_history` row exists. Hard delete goes through FK `ON DELETE CASCADE`, with `foreign_keys=ON` set on every connection (`database.py:35`). Tests: scope of the delete, the delete with no history row, injected triggers on either table rolling back both, purge via `/purge`, trash and restore, missing and recovery through the scanner, and rename and move.
- I10: Holds, apart from F2 under a hung backend. `keepalive: true`, the 15 s `setInterval`, `visibilitychange`→hidden, `pagehide`, teardown (`final`), and `notifyEnded` are all wired. Sending reads only the capture's own state. The file id is bound in the capture closure. `active=false` after teardown drops late retries. A status `>= 500` or a rejection retries, and a 4xx drops. Backend: `min_length=1`, `max_length=256`, bounds checks, and non-finite values become None, giving 422. Tests cover each of these. No test covers a send moment while the resume read is pending; it holds by construction, because `flush` does not read `resumePendingRef`.

Failure table rows: network or 5xx while active (retried; tested), on or after teardown (discarded; tested), 4xx (discarded; 400/404/422 tested), more than 256 (trimmed; tested, F2), no profile at a send (tested), 422 with nothing written (tested, including one bad range among good ones and NaN/Infinity), 404 for missing/trash/locked (tested), transaction failure gives 500 with nothing written (trigger test), a failed `DELETE /progress` rolls back both (tested for each table), skipped clock ticks covered by wall time (tested), `getPlaybackRate` throwing (tested). Every row holds.

State table rows: all hold in code, except the wording of "Not tracking + Eligible tick" (F1). In the sent-ranges table, the "in flight → pending only while the effect is active" row is enforced by `active`. Exclusivity is tested: a range in flight is in no other request.

Precedence: POST is 422, then no viewer 204, then 404 (the validation dependency runs first). GET is 404, then empty. DELETE is unchanged. All are tested.

## Test coverage

- Backend: `backend/tests/test_played_segments.py` covers I1, I2, I8, I9, the validation half of I10, the transaction-failure rows and every precedence row. Gaps: hard delete is tested only through the `/purge` endpoint, not through the startup trash auto-purge or `purge_all_missing`. Both rely on the same DB-level cascade.
- Frontend unit: `playbackProgress.playedRanges.test.ts` covers I3 to I6, the client half of I8, I10 and the I7 render count. Gaps: F3 (the observe-path throw guard), F2 (out-of-order failures of two batches in flight), and a send moment while the resume read is pending.
- E2E: `played-ranges.spec.ts` drives a real `<video>` in Chromium through the hook and checks the start within 1 s, the end and total within 1.5 s, `keepalive`, and the URL. It covers only the teardown send at 1x.

## Not verified

- No test was run. Every mutation outcome above is reasoned from reading, not executed.
- How YouTube and the iOS shell actually publish position and rate (the shell's `rate` shadow value while stalled, YouTube `getCurrentTime` right after `seekTo`). This is listed as `agent_cannot_verify` in the spec.
- Whether `keepalive` requests at `pagehide` complete in WKWebView, and the browser's 64 KiB in-flight keepalive budget when several players flush together.
- Whether every hard-delete path (auto trash purge, `purge_all_missing`, folder delete) runs on a connection with `foreign_keys=ON`. I checked only the engine connect listener.
- The migration interplay of `create_all` with the `files` table rebuild migration on old databases (`database.py:360-454`).
- The content of `docs/process/reviews/feature-played-segments/` beyond its mention in the brief.

Confidence: 80

TOTAL: 4 findings
