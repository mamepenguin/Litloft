# Record which parts of a video or audio file a viewer actually played

SPEC-ID: SPEC-CORE-025
SPEC-ID: SPEC-CORE-026

Approval:

## Summary

The players record, per viewer and per file, how many seconds of each 5-second segment of the
timeline were actually played. This is the data a later change needs to draw peaks on the
seek bar at the parts a viewer returns to. The resume point (`WatchHistory.playback_position`)
holds one overwritten value and cannot answer that question, so this is a separate record and
the resume point does not change. Opening a file and leaving within seconds records nothing,
wherever in the file that happens. This change ships the recording and an endpoint to read it
back, and no UI. Past viewing cannot be reconstructed, which is why recording starts ahead of
the display.

- **SPEC-CORE-025**: capture in the player. The player turns its clock into played ranges and
  sends them.
- **SPEC-CORE-026**: storage and read. The backend adds ranges into per-segment totals, serves
  them back to the same viewer, and removes them with the viewer's history for the file.

## Required items

### 1. Normal flow

1. A viewer with a profile plays a file in any player that uses `usePlaybackProgress`
   (`VideoPlayer`, `AudioPlayer`, `ShellVideoPlayer`, and the media_import addon's
   `YouTubeEmbed`). Capture lives inside that hook, so none of them changes.
2. Capture reads every tick of the existing media clock. A tick is **eligible** when all of
   these hold:
   - a profile is set;
   - the player is not paused and not interrupted;
   - the duration is a finite positive number;
   - the stored resume position is not being read (`resumePendingRef` is false);
   - `getPlaybackRate()` returns without throwing.
3. Between two consecutive eligible ticks, the position's movement is classified. The
   **allowance** is `elapsed wall time × playback rate + 1 second`.
   - **Played:** forward and no larger than the allowance. It extends the open stretch.
   - **Unchanged:** the same position, or backward by at most 1 second. Nothing is counted and
     the stretch stays open. Players that publish their position on their own timer produce
     this during normal playback.
   - **Jump:** anything else. It closes the stretch, and this tick starts a new one.
4. A **stretch** is one continuous run of played media time, `{ start, end }`. It closes on a
   jump, when an eligible tick arrives more than 1 second from its end after a non-eligible
   tick, on teardown, and when the profile is cleared. A pause, a stall or an interruption alone
   does not close it: if playback carries on from where it stopped, the same stretch continues.
5. A stretch counts once its length reaches **10 media seconds**. A stretch that closes below
   that is discarded and nothing about it is sent. This is what makes opening a file and leaving
   within seconds, or trying several places while looking for a scene, record nothing.
6. Pending ranges are sent by `POST /api/files/{id}/played-ranges`, using `fetch` with
   `keepalive: true`, at these **send moments**:
   - every 15 seconds while anything is sendable;
   - when the player reports the end of the file (`notifyEnded`);
   - when the hook's effect tears down (the file or the controller changes, or the player
     unmounts);
   - when the page's `visibilitychange` reports `hidden`, and on `pagehide`.

   At a send moment, an open stretch that has reached 10 seconds is cut: its played part becomes
   a range, the stretch stays open from the cut point and stays counted, so a later piece of any
   length is sent and nothing is sent twice. An open stretch below 10 seconds is held back. On
   teardown it is discarded. Sending at any of these moments does not depend on the player's
   state at that moment and reads nothing from the controller.
7. The backend splits each range across fixed 5-second segments and adds the seconds to the
   totals in `played_segments`. It returns `204`.
8. `GET /api/files/{id}/played-segments` returns this viewer's totals.

Worked example. Range `{ start: 12, end: 47.5 }` adds 3 s to segment 2, 5 s each to segments 3
through 8, and 2.5 s to segment 9. Segment `n` covers `[5n, 5n + 5)`.

Read shape, with segments ascending by index and segments never played left out:

```json
{ "segment_seconds": 5, "segments": [{ "index": 2, "played_seconds": 3.0 }] }
```

### 2. Failure cases

| Step | What goes wrong | What the system does |
|---|---|---|
| Send | Network failure or a `5xx`, with the same file and controller still active | The ranges return to pending and go with the next send. |
| Send | Network failure or a `5xx` on the teardown send, or after it | The ranges are discarded. They are never sent under another file's id. |
| Send | A `4xx` (for example, the file moved to trash during playback) | The ranges are discarded and not retried, because resending cannot succeed. |
| Send | More than 256 ranges pending | The oldest are dropped, so a request always fits the limit below. |
| Send moment | No profile is set | Pending ranges are discarded and nothing is sent. |
| Backend | Body fails validation | `422`, and nothing from the body is written. |
| Backend | File is missing, in trash or in a locked drive | `404`, and nothing is written. |
| Backend | The transaction fails | `500`, and nothing from the body is written. The client treats it as a `5xx` above. |
| `DELETE /progress` | The transaction fails | `500`. Both deletes are one transaction, so neither happens. |
| Capture | The media clock skips a tick because its controller read threw (a YouTube media swap) | Capture sees no tick. The next tick is compared under the allowance as usual, and the elapsed wall time covers the gap. |
| Capture | `getPlaybackRate()` throws | That tick is not eligible. Playback is unaffected. |

A request is rejected as a whole when it has 0 or more than 256 ranges, or when any range fails
`0 <= start < end <= 604800` (7 days) or holds a non-finite number.

Response precedence:

| Endpoint | Order |
|---|---|
| `POST /played-ranges` | Invalid body `422`, then no viewer `204`, then unavailable file `404`, then `204`. This is the order `POST /progress` has. |
| `GET /played-segments` | Unavailable file `404`, then no viewer returns an empty `segments`. This is the order `GET /progress` has. |
| `DELETE /progress` | Unchanged: no viewer `204`, then unavailable file `404`. |

### 3. States

Capture, per hook effect (one file and one controller):

| State | Event | Next |
|---|---|---|
| Not tracking | Eligible tick | Tracking, with this tick as the reference. No movement is counted for this tick. |
| Not tracking | Non-eligible tick | Not tracking |
| Tracking | Non-eligible tick | Not tracking. The open stretch is kept, unless the profile was cleared. |
| Tracking | Played movement | Tracking. The stretch is extended and this tick is the new reference. |
| Tracking | Unchanged position | Tracking. The reference's wall time moves to this tick and its position stays. |
| Tracking | Jump | Tracking. The stretch closes, this tick is the new reference, and a new stretch starts here. |
| Any | Teardown | Ended. Capture for this effect stops after the final send. |

Stretch: `held` (below 10 seconds), then `counted` (at or above 10 seconds), then closed. A held
stretch that closes is discarded. A counted stretch that closes becomes a pending range. A counted
stretch never returns to held.

Sent ranges:

| From | Event | To |
|---|---|---|
| Pending | Send moment with a profile | In flight |
| Pending | Send moment with no profile, or dropped by the 256 limit | Discarded |
| In flight | `204` | Done |
| In flight | Network failure or `5xx`, effect still active | Pending |
| In flight | Network failure or `5xx`, effect ended | Discarded |
| In flight | `4xx` | Discarded |

Not allowed: `held` to pending; a range in two requests at once; a done or discarded range sent
again; a range sent under any file id other than the one it was captured for.

Stored: a segment has no row until it is first played. Afterwards `played_seconds` only grows,
until the row is removed by `DELETE /progress` or by the file's hard delete.

### 4. Data read and written

| Store | Access |
|---|---|
| New table `played_segments` (`viewer_id` String(16), `file_id` String(12) FK `files.id` `ON DELETE CASCADE`, `segment_index` Integer, `played_seconds` Float; primary key on all of `viewer_id`, `file_id`, `segment_index`; an index on `file_id`, because the foreign key's cascade otherwise scans the table on each hard delete) | Written by `POST /played-ranges` with `INSERT ... ON CONFLICT DO UPDATE SET played_seconds = played_seconds + excluded.played_seconds`. Read by `GET /played-segments`. Deleted by `DELETE /progress`. |
| `files` | Read for the existence, state and drive access check |
| `watch_history` | Not read or written by the new endpoints |
| Browser memory | Open stretch and pending ranges. Nothing goes to `localStorage`. |

The table is new, so `init_db`'s `create_all` creates it with its index on existing databases and
`backend/app/database.py` is not edited.

### 5. External services

None. The new calls go only to Litloft's own backend. The YouTube player is read through the
existing `MediaController` as it already is.

### 6. Authorization

The same checks as `/api/files/{id}/progress`, in the same router: `_get_file_or_404` applies
`active_file_filter()` and `check_drive_access`, and `get_viewer_id` identifies the viewer. The
order is in the precedence table above. No endpoint returns another viewer's data or a total
across viewers.

### 7. Effect on existing features

- `usePlaybackProgress`: gains the capture. Its saves, resume, `notifyEnded` and `notifyReady`
  keep their behavior and timing. Capture sees every clock tick, including those for which
  `onTick` returns early, without changing what `onTick` does.
- `DELETE /api/files/{id}/progress`, which is "remove from history" in Continue Watching: also
  removes this viewer's `played_segments` rows for the file, even when there is no
  `watch_history` row. It commits in that case too.
- Continue Watching, Pickup, Ask's `personal_history`, `GET /watch-history` and the Internal API
  read `watch_history` only and are unaffected.
- Hard delete of a file removes its rows through the foreign key. `foreign_keys=ON` is already
  set on every connection.
- Trash and missing keep the rows, so they are there again on restore or recovery. A rename or a
  move keeps `file_id`, and so keeps the rows.
- PDF and EPUB progress use their own hooks and are not captured.
- `VideoPreview` hover previews do not use `usePlaybackProgress` and are not captured.

### 8. Error behavior

The viewer sees nothing on any capture or send failure, and playback continues. As with
`saveWatchProgress`, the client logs nothing. The backend's `4xx` and `5xx` responses are its
normal ones, with no added logging. When `DELETE /progress` fails, "remove from history" behaves
as it does today on a failed delete: the item stays in the list.

### 9. User-visible behavior

None in the UI: no new text, control or ordering. The only observable additions are the two
endpoints, one more background request while playing, and the removal of this data by "remove
from history". Because nothing a viewer sees changes, R-5 is recorded as
`ran_in_app: not-applicable` and `docs/user-guide/` is not edited.

No UI reads this data, so a wrong capture would stay invisible until the later display spec, and
by then the data cannot be recovered. A jsdom test with a fake controller cannot show how a real
player reports its position. So SPEC-CORE-025 also has a real-browser test in
`frontend/e2e-components/`: a real `<video>` in Chromium plays a known stretch through
`usePlaybackProgress`, with the request intercepted and asserted within a tolerance. It runs in
CI and needs no Litloft stack.

Pending for a human (`agent_cannot_verify`), recorded in `decisions.md`, not blocking the merge:
after deployment, play a stretch in the iOS shell and in a YouTube embed, then confirm through
`GET /played-segments` that about that many seconds were stored.

### 10. Non-functional

- **Requests:** at most one periodic send per player per 15 seconds during playback, plus the
  sends at the other moments in Normal flow step 6. A moment with nothing sendable sends nothing.
- **Rendering:** capture state lives in refs. It causes no React re-render and adds no second
  polling source: it uses the existing shared media clock.
- **Storage:** at most 720 rows per viewer, per file, per hour of media. A 3-hour file watched
  fully is 2,160 rows. Segments are fixed in seconds so that a duration that reads differently
  between players does not move data. A display can merge 5-second segments, but it could never
  split coarser ones.
- **Concurrency:** two tabs add to the same row without losing either, through the atomic upsert.
- **Loss:** at most about 15 seconds of counted playback is lost when a page dies without firing
  `visibilitychange` or `pagehide`. The data is a signal, and a small loss is acceptable.
- **Privacy:** data is per viewer and never aggregated.

## Touch points

- Table: new `played_segments` with its `file_id` index (`backend/app/models.py`).
- Endpoints: new `POST /api/files/{id}/played-ranges` and `GET /api/files/{id}/played-segments`;
  changed `DELETE /api/files/{id}/progress` (`backend/app/routers/progress.py`,
  `backend/app/schemas.py`).
- Frontend: `frontend/src/lib/playbackProgress.ts`, a new capture module in `frontend/src/lib/`,
  and `frontend/src/lib/api.ts`.
- Docs: `docs/reference/api.md`.
- Tests: `backend/tests/`, `frontend/src/`, `frontend/e2e-components/` with its fixtures and
  registration.
- Rules passed through: `.claude/rules/design-decisions.md` (Watch history and profiles, Handling
  missing files, Access control), `.claude/rules/backend-conventions.md`.
- Protected paths edited: none.
- Addons and iOS: no edit. `YouTubeEmbed` and `ShellVideoPlayer` inherit capture through
  `usePlaybackProgress`.

## Invariants

I1. A range adds exactly its length to the stored totals, divided at 5-second boundaries: `{ start: 12, end: 47.5 }` yields 3 s in segment 2, 5 s each in segments 3 to 8, and 2.5 s in segment 9, and `GET /played-segments` returns exactly those segments in ascending order with `segment_seconds: 5` and no unplayed segment.
I2. Sending the same range twice doubles those totals, and two concurrent requests lose neither addition.
I3. Time while the player is paused, stalled, interrupted, reading the stored resume position, or without a finite positive duration adds nothing to any range, and playback that carries on from where it stopped continues the same stretch.
I4. A forward seek larger than the allowance (`elapsed wall time × playback rate + 1 second`) or a backward seek of more than 1 second, including the player's own resume seek and a `?t=` seek, adds nothing for the skipped span and closes the stretch.
I5. One pass through the same stretch produces the same ranges at any playback rate, a tick delayed by a throttled background timer is still counted as played, and a repeated position or a backward wobble of at most 1 second neither counts anything nor closes the stretch.
I6. A stretch that closes below 10 media seconds sends nothing wherever in the file it started, and a stretch that reaches 10 seconds is sent in full from its start, with cuts at send moments leaving no gap and no overlap.
I7. No request to `POST /played-ranges` or `GET /played-segments` changes `playback_position`, `duration` or `last_played_at`, and the capture does not change when or with what values `saveWatchProgress` is called.
I8. Without a profile the client captures and sends nothing; without a viewer identity `POST /played-ranges` with a valid body returns `204` and writes nothing, and `GET /played-segments` on an available file returns an empty `segments` list; `GET` returns only the requesting viewer's totals; and on a missing, trashed or locked-drive file, an identified viewer gets `404` from both endpoints and nothing is written.
I9. `DELETE /progress` removes the requesting viewer's `played_segments` rows for that file in the same transaction as its `watch_history` row, even when no `watch_history` row exists, and leaves other viewers' and other files' rows; a file's hard delete removes its rows; trash then restore, missing then recovery, rename and move all keep them.
I10. Pending ranges are sent with `keepalive: true` every 15 seconds and at `visibilitychange` to hidden, `pagehide`, teardown and `notifyEnded`, always to the file they were captured for and never more than the newest 256; a network failure or `5xx` keeps them for the next send only while that file and controller stay active, a `4xx` discards them, and a request with 0 or more than 256 ranges or any invalid range returns `422` and writes nothing.

## Checked, no action

- **Seek bar peaks, thumbnails, recommendations, search:** a later spec. How peaks are computed
  and when they show are decided there, against real data.
- **Double counting when a response is lost:** if the backend commits and the client never gets
  the response, the retry stores those seconds twice. Accepted: it needs a connection lost inside
  one request, the error is at most one send's worth of a segment's seconds, and preventing it
  would need request ids stored on the backend for a signal that does not need to be exact.
- **Weighting seek targets, or storing a separate seek count:** not stored. A jump's destination
  gains seconds once it is played for 10 seconds, and a brief landing gains nothing, so played
  seconds covers it. If the display later needs seek arrivals as their own signal, they start
  from zero at that point.
- **A seek inside the allowance:** a forward seek of 1 second or less, or a seek inside a throttled
  gap (a lock-screen control during background play), counts the skipped span as played. Telling
  them apart would need events the `MediaController` does not offer, and the error is small.
- **A short moment replayed on purpose:** rewinding to rewatch 5 seconds again and again closes a
  stretch below 10 seconds each time and records nothing. Accepted, because the same pattern is what
  looking for a scene looks like. This is the cost of the 10-second rule.
- **Files shorter than 10 seconds:** never recorded. A timeline that short has no use for peaks.
- **Bias toward the start of a file:** repeatedly watching the first part and stopping raises those
  segments. This is true data, and any correction belongs to the display spec.
- **Counting whether the viewer was watching:** a video left playing or muted autoplay counts as
  played. It raises segments evenly, so it does not create a peak.
- **A file replaced at the same path:** its old totals stay, as its `WatchHistory` row does.
- **Changing to another profile during playback:** pending ranges go to whichever viewer is current
  at the send. Profile changes mid-playback are rare and the amount is at most 15 seconds.
- **Viewers without a profile:** nothing is kept. `localStorage` is not used, because this data
  is not worth keeping per browser and cannot sync.
- **Live streams:** a native stream without a finite duration captures nothing. YouTube's IFrame
  API documents `getDuration()` for a live event as the elapsed time, so a YouTube live embed is
  captured as a normal video. Nothing detects it today, and it does no harm with no display. A
  stream past the 7-day limit gets `422` and its ranges are discarded.
- **Plain iframe embeds with no `MediaController`:** nothing is captured, which reads as unknown
  and not as unwatched.
- **A check on the file's media type in the endpoint:** not added. Only the players send, and
  there is no adversary in this project's threat model.
- **Clamping `end` to the file's duration:** not added. A stored duration can be absent or differ
  between players.
- **An MCP tool or an Internal API endpoint:** nothing needs them yet. Internal API policy R3
  would reject one without a named second consumer.
- **Renaming `WatchHistory` fields, or a rule in `.claude/rules/`:** not required by this change.
