# YouTube fetches are paced and back off when YouTube stops answering

SPEC-ID: SPEC-ADDON-119

Approval:

## Summary

The YouTube reference fetch of SPEC-ADDON-117 went to production with 7,034
references to work through. From one address, thousands of lookups and downloads in
a row can make YouTube ask to "confirm you're not a bot" and refuse every request
for a while. Today the fetch then counts each refused lookup against its video
(after one success in the process), so a few sweeps of a refusal close the on-screen
text stage of thousands of references for good, silently. This change paces the
backlog fetches and, when lookups of different videos keep failing, stops counting
and backs off, so a YouTube-wide refusal costs time but closes nothing. New
references and the owner's own requests are not slowed. It is for the owner whose
library holds thousands of YouTube references.

## Terms

- **Backlog fetch**: a `loft_media` task at priority -10 (SPEC-ADDON-117 step 2).
- **YouTube result** of a fetch: none when it ends before its lookup, or at the disk
  guard, or at the free-space stop; a failure when its lookup fails, or its download
  fails (a yt-dlp error, 120 s without growth, the time limit, or a file below 95% of
  the lookup's duration); a success otherwise (the lookup answered and the download
  completed, or there was no rendition).
- **Failure run**: the number of YouTube results in a row, of any files, that are
  failures; a success resets it to 0. Kept in process memory.
- **Last result time**: the moment the latest fetch with a YouTube result returned.
- **Pause interval**: 30 s.
- **Backoff**: a period during which no backlog fetch starts. A backoff starts at
  every failure result that leaves the failure run at 3 or more, timed from that
  moment and replacing any backoff in effect: the first lasts 30 minutes, and each
  later one twice the previous, up to 6 hours. A success ends any backoff and resets
  the next length to 30 minutes.

## Required items

### 1. Normal flow

1. A backlog fetch starts only when at least the pause interval has passed since the
   last result time and no backoff is in effect. A backlog task taken while either
   holds is put back on the queue, as a task held for native frame work is, so a
   task at priority 0 or 100 queued meanwhile runs first; a fetch at 0 or 100 waits
   for neither.
2. A failure result is a counted failure (SPEC-ADDON-117 Terms) only when the
   previous YouTube result, of any file, was a success. Otherwise it changes no
   count and no flag, and the file's task is queued again at -10 behind the backlog.
3. Each backoff that starts writes the log line
   `loft_media backing off <minutes> min after <n> failures in a row`
   (no file id, URL or video id).
4. A success resets the failure run and ends a backoff.

### 2. Failure cases

- **YouTube refuses everything for hours** (lookups, downloads, or both): at most one
  counted failure per refusal episode (the first failure after a success); backlog
  fetches stop after 3 failures and retry after 30 min, 1 h, 2 h, 4 h, 6 h, 6 h …; a
  fetch at 0 or 100 still runs and can end the backoff with a success.
- **Removed videos side by side in the backlog** (a deleted channel): the first is
  counted, the next ones are not and go behind the backlog; three in a row start a
  30-minute backoff, after which a working video's success resets the run, and the
  removed videos, retried later right after a success, are counted and capped. The
  human accepted this delay of about 30 minutes per such cluster.
- **One video is private or removed while others work**: its failure follows a
  success, so it is counted as today and capped after 3.
- **Restart**: the failure run, the backoff and the last fetch time start fresh, as
  the in-process success flag of SPEC-ADDON-117 does.

### 3. States

Worker: `normal` → (a failure leaves the run at 3 or more) `backoff`; `backoff` →
(another such failure, from a fetch at 0 or 100) `backoff` restarted from now with
the doubled length; `backoff` → (elapsed) `normal`, next length doubled; any state →
(a success) `normal`, run 0, length reset.
Not allowed: a backlog fetch starting during a backoff or within the pause interval
of the last result time.

### 4. Data read and written

None new: in-process state only. The failure count column is written only under the
rule of step 2.

### 5. External services

YouTube, as SPEC-ADDON-117; this change reduces the request rate of the backlog to
at most one fetch per 30 s plus its own duration, and none during a backoff.

### 6. Authorization

None changes.

### 7. Effect on existing features

The backlog takes longer (at least 30 s between fetches: about 2.5 days of pauses for
7,000 references, on top of the work). New references, regenerates and the Visual
Index are unchanged. Native videos are unchanged.

### 8. Error behavior

The operator sees the backoff log line; the index widget's 「YouTube の取得」 row keeps
counting the waiting references.

### 9. User-visible behavior

None in the UI beyond a slower backlog.

### 10. Non-functional

No new storage; timers use the worker's monotonic clock.

## Touch points

- `addons/intelligence/app/workers/loft_media.py`: the YouTube result of a fetch,
  the counting rule of step 2 (replacing the in-process "a lookup has succeeded"
  flag), the failure run and backoff state, cleared by `reset_worker_state`.
- `addons/intelligence/app/indexer.py`: `_loft_media_worker` (the gate for priority
  -10, putting a held task back; the last result time; requeueing an uncounted
  failure behind the backlog).
- Tests under `addons/intelligence/tests/` for SPEC-ADDON-119.
- `docs/addons/intelligence.md` (the pacing and backoff sentence).
- The core's `addons/intelligence` pointer and `docs/specs/INDEX.md`.
- No protected path.

## Invariants

I1. A backlog fetch never starts within 30 s of the last result time, nor during a backoff; a fetch at priority 0 or 100 is never held by either, and a held backlog task never delays one.

I2. A failure result (lookup or download) changes the failure count only when the previous YouTube result was a success; an uncounted failure changes no flag and queues the file again at -10 behind the backlog.

I3. Every failure result that leaves the failure run at 3 or more starts a backoff from that moment, 30 minutes the first time and twice the previous after that, up to 6 hours; a success ends a backoff and resets the next length to 30 minutes; a restart starts with no run, no backoff and no pause.

I4. The backoff log line names no file id, URL or video id.

## Revises

SPEC-ADDON-117 I6. The failure count changes only by a counted failure (+1), a fetch whose stages all set their flags (to 0), or a reindex or CLIP regenerate (to 0); at 3 the wanted stages are closed with no scan row and no text; a not-accessible `.loft`, an unavailable model or engine, the disk guard, a missing yt-dlp, and a lookup or download failure not directly preceded by a YouTube success (SPEC-ADDON-119 I2) are never counted; a download whose probed duration is below 95% of a known lookup duration is counted.

## Checked, no action

- **Detecting YouTube's bot message by its text**: rejected; a language- and
  wording-dependent rule (backend-conventions), and every refusal looks the same to
  the counting rule.
- **Cookies or an account to pass the check**: out of scope; SPEC-ADDON-117 I2 forbids
  them.
- **Pacing new references and requests**: not done; they are few and the owner is
  waiting for them.
- **A setting for the interval**: not added; constants until the production run shows
  a need.
