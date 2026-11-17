# Batch trash and permanent delete: progress, failures, and selections over 100

SPEC-ID: SPEC-CORE-120
SPEC-ID: SPEC-CORE-121

Approval: sha256:c6a0f2104eea5db01c66136097da750a0cb327c45532678c27d32cc13c316d73 Yuichi Senga 2026-11-17

## Summary

Moving a selection to the trash, permanently deleting a selection from the trash, and the
two whole-list actions (empty the trash, permanently delete all missing files) show no
progress. A selection of more than 100 files is rejected by the server with a 422, and the
frontend swallows that error: the dialog stays open and nothing is shown. This change:

- **SPEC-CORE-120**: a selection is sent in requests of at most 100 files, one after the
  other, with a count of processed files; failed and unconfirmed files stay selected. The
  server contract is unchanged.
- **SPEC-CORE-121**: empty trash and permanently delete all missing show that they are
  running, and show their failure instead of keeping the dialog silently open.

The change does not alter which files an action affects, what the trash keeps, or what
purge deletes on disk.

## Terms

- **Run**: one confirm press of a batch action. A retry after a partial or stopped run is a
  new run whose ids are the ids still selected.
- **Processed**: the answer to a chunk's request has counts that add up to the chunk's length
  (`deleted` or `purged` plus the number of `errors` equals the chunk's length), and the file's
  id is not in `errors`.
- **Failed**: the answer has a per-file entry in `errors` for the file.
- **Unconfirmed**: sent, but no answer that counts as processed or failed has been received
  for it (the request failed, timed out or was aborted, or its answer did not add up), so the
  server may or may not have processed it.
- **Stopped**: a chunk was unconfirmed, so the run sends no further chunk.

## Required items

### 1. Normal flow

SPEC-CORE-120, for an action on a selection (trash: `batchDelete`; purge: `batchPurge`):

1. The viewer selects N files and chooses **ゴミ箱に入れる** or **完全に削除**. The
   confirmation names N, as today.
2. On confirm, `SelectionBar` calls `runChunked(ids, send, hooks)` in
   `frontend/src/lib/batchChunks.ts`, a pure helper. `ids` is the selection in insertion order
   (the order of the `Set` the selection store holds). The helper splits them into consecutive
   chunks of at most 100 and calls `send(chunk, signal)` for one chunk at a time. `send` is
   `batchDelete` or `batchPurge`.
3. `batchDelete` and `batchPurge` gain one optional argument, `options?: RequestOptions`
   (the type `api.ts` already has, with `signal`), passed to `fetchJSON` as `RequestInit`.
   Existing calls without it are unchanged. Each chunk gets its own `AbortController`; the
   helper aborts it after 120 seconds (see 8).
4. `runChunked` resolves to `{ processed, failed, unconfirmed, stopped }`. For a chunk whose
   answer counts add up (see Terms): `processed` gets the chunk's ids not in `errors`, and
   `failed` gets the ids in `errors`. For a chunk whose request failed, timed out or was aborted,
   or whose answer did not add up: its ids go to `unconfirmed`, and `stopped` becomes true. Every
   unsent id also goes to `unconfirmed`. The hook `onProgress(processedSoFar, total)` runs after
   each answer; `total` is the run's id count.
5. The run's dialog shows `処理中 X / N 件`, X being `processedSoFar` (§9).
6. When the last chunk answers with no failure, the run ends: the dialog closes, the selection is
   cleared with `onClear`, and `onComplete(true)` is called once (I7).
7. When the run ends partial or stopped, the dialog stays open with the outcome (§9), and
   `SelectionBar` does two things. It replaces the selection with `failed` plus `unconfirmed`
   through a new optional prop `onSelectOnly(ids)`. It reports `processed` through a new optional
   prop `onProcessed(ids)`, then calls `onComplete(true)` once (I7). The three parents
   (`TrashView`, `FolderBrowser`, `InboxPresenter`) implement both props: `onSelectOnly` with the
   replace operation of the selection hook they already use, and `onProcessed` by removing those
   rows from their lists, as a full run's `onClear` path already does for `FolderBrowser`'s
   continuous rows (`FolderBrowser.tsx:343-345`, `:951-957`).

SPEC-CORE-121, for the whole-list actions (`POST /api/drives/{drive}/trash/empty` and
`POST /api/drives/{drive}/missing/purge-all`):

1. The viewer confirms. The dialog shows a running state (a spinner and `処理中` /
   `Working`), and its confirm and cancel controls are disabled until the request answers. The
   request carries a 120-second `AbortController` (see 8).
2. On success the dialog closes and the list is emptied, as today (I22).

### 2. Failure cases

- A chunk request returns a non-2xx status, fails at the network level, or times out. The run
  stops: no later chunk is sent (I4). The failed chunk's files are unconfirmed (the server may
  have committed some before failing), so they stay selected.
- A timeout aborts the client request. The server may still finish the chunk; the ids are
  unconfirmed, and the list refresh at the end of the run shows the server's state.
- A chunk answer whose counts do not add up is unconfirmed and stops the run (I5).
- A chunk answer with per-file `errors` is not a stop: the failed files are counted and the run
  continues with the next chunk.
- A retry sends only the ids still selected. A file the earlier attempt already processed answers
  as a per-file error, is counted as failed in the retry, and the retry text says that an earlier
  attempt may have processed it (§9; Pending confirmation 6).
- A whole-list request fails (status, network or timeout): the dialog stays open, shows the
  failure text (§9), enables its controls, and the list is refetched (I11).
- Cancel and dismissal are not offered while a run is running (I17).
- A selection of exactly 100 is one request. A selection of 101 is two requests, 100 and 1 (I1).
- A file that leaves the drive between selection and purge is answered as a per-file error and
  counted as failed.

### 3. States

Batch run of a selection:

| From | To | When |
|---|---|---|
| idle | running | confirm pressed; a new run starts with the ids of the selection |
| running | running | a chunk answered with no stop, and chunks remain |
| running | done | the last chunk answered, no file failed |
| running | partial | the last chunk answered, some files failed |
| running | stopped | a chunk was unconfirmed (request failure, timeout, abort, or an answer that did not add up) |
| partial, stopped | idle | the viewer dismisses the dialog; the selection holds the failed and unconfirmed ids |
| partial, stopped | running | confirm pressed again; a new run with the ids still selected |

Not allowed: done → any state (the dialog has closed); running → idle (dismissal is disabled
while running, I17); a second run while one is running (I18); a selection change while running
(I19).

Unmount while running: the in-flight request is aborted and no further chunk is sent (I9). The
server may still complete the in-flight chunk. The processed and unconfirmed ids of the run are
not reported, so the selection store keeps the ids of the run as they were at confirm; the next
page load shows the server's state. This is the one case where the selection can hold files that
were processed (I6 excludes it). Pending confirmation 11.

Whole-list run: idle → running → done (dialog closes) or idle (failure, controls enabled, list
refetched).

### 4. Data read and written

- Reads: the selection's ids at confirm time.
- Writes, in memory only: the selection store, through `onClear` (full run) or `onSelectOnly`
  (partial or stopped run), and the parent's list, through `onProcessed` and `onComplete`.
- Server writes: none new. The requests are the existing batch and whole-list endpoints.
- Server-side deletion, purge and the trash and missing rules are unchanged (see 7).

### 5. External services

The requests go to the existing API through the Next.js rewrite (`frontend/next.config.ts`); no
third-party service. The rewrite sets no timeout in this repository. Whether the Next.js default
limit can cut off a 100-file chunk is not known; §10 requires it to be measured before merge. A
cut-off shows as an unconfirmed chunk (2).

### 6. Authorization

Unchanged, and checked by the server per request:
- Batch delete: `get_unlocked_groups` and `_get_file_or_404` (`routers/files.py:230`), because it
  trashes active files.
- Batch purge: `get_unlocked_groups` and `_get_trashed_or_missing_file_or_404`
  (`routers/files.py:285`), because it accepts trashed and missing files.
- Whole-list actions: `_validate_drive` with `unlocked_groups` (`routers/drives.py:1874-1938`).
A file in a locked drive is a per-file error (batch) or a 404 (whole-list), and is not processed.

### 7. Effect on existing features

- The backend is not changed. `_validate_batch_ids` (`schemas.py:410-418`) keeps its 100-id cap,
  used by `BatchIdsRequest` (`schemas.py:488-494`); a direct API caller still gets a 422 for more
  than 100 ids.
- `api.ts`: `batchDelete` and `batchPurge` gain one optional argument (3 of 1). Every existing call
  site is unchanged.
- `DuplicatesSection.tsx:159` calls `batchDelete` with its whole list and passes no options. It
  stays one request and is not changed (I16; Pending confirmation 5).
- `SelectionBar`'s other actions (restore, batch move, batch tag) keep their whole-selection
  requests. The inbox's batch move keeps its existing split at 100 (`INBOX_BATCH_SIZE`).
- `SelectionBar` gains two optional props, `onSelectOnly` and `onProcessed`. A `SelectionBar`
  without them behaves as before (I13).
- Events, and what they do to lists. The server emits `files.deleted` and `files.purged` once per
  request, so a selection sent in chunks emits one per chunk. `backend/app/services/event_hooks.py`
  (`:155`, `:160`, `:164`) maps both to `drive.structure_changed`, which the frontend subscribes to
  in `DriveHome.tsx:253`, `useFolderFiles.ts:63`, `FolderTreePane.tsx:29`, `useInboxData.ts:133` and
  `useInboxCount.ts:33`, and those re-fetch. So during a run, a list on screen can re-fetch once
  per chunk, and that can overlap with `onProcessed`'s row removal. Whether that is allowed is
  Pending confirmation 13.
- Addon webhooks. `addons/intelligence/app/routers/webhooks.py` (`files-deleted` at `:83`,
  `files-purged` at `:109`) and `addons/knowledge/app/routers/webhooks.py` (`files-purged` at `:50`)
  each take a list of `file_ids` and call a handler with it. Read at this review: neither handler
  assumes one id per event. Whether each handler is idempotent when the same ids arrive again, or
  when a later chunk arrives after an earlier one, is not verified and is checked in each addon's
  repository before merge. An addon that is not idempotent does not merge until fixed there (a
  separate PR, per `CLAUDE.md`).
- iOS app: no listener on these events in this repository.
- `docs/reference/websocket-events.md` and `docs/reference/file-states.md` state one event per
  operation; they are updated in the same change (Touch points).

### 8. Error behavior

- A batch run shows its outcome in the dialog (§9) with the processed, failed and remaining counts.
  The existing toast is not used for batch runs.
- Timeout: 120 seconds per request, for chunks and for whole-list requests. A chunk timeout is an
  unconfirmed chunk and stops the run (2). A whole-list timeout is a failure (SPEC-CORE-121). The
  value is recommended, not measured (Pending confirmation 8). If the server finishes a request
  the client aborted, the dialog reports failure while the server has acted; Pending confirmation
  14 decides how that is shown.
- The whole-list failure text is a fixed translated string, not the raw `fetchJSON` message.
  `fetchJSON` throws `API error: <status> <statusText>` and drops the body, so the raw text is not
  shown (§9).
- Nothing new is logged on the frontend; no `console.error` is used for user-facing failures.
- Server logging is unchanged.

### 9. User-visible behavior

Strings (`frontend/src/messages-core/ja.json`, `en.json`). Every count names what it counts.

- running: `処理中 {done} / {total} 件` / `Processing {done} of {total}`. `done` is the processed
  count of this run; `total` is the number of ids of this run.
- partial: `{done} 件を処理し、{failed} 件は処理できませんでした。` /
  `{done} processed; {failed} could not be processed.` The failed files stay selected.
- stopped: `{done} 件を処理したあと止まりました。{remaining} 件は選択に残しています。` /
  `Stopped after {done} processed. {remaining} files remain selected.`
  `remaining` is the size of the selection after the run: failed plus unconfirmed (I15).
- retry (a run started from a partial or stopped run): the same partial and stopped text, plus
  `前回の処理で処理済みの file が含まれることがあります。` /
  `Some files may have been processed by an earlier attempt.` This line is shown only on a retry
  run (I23).
- the confirm label of a retry: `残りを処理` / `Process remaining`, with the message
  `{remaining} 件を処理しますか？`. A first run keeps the label and message of §1.
- whole-list running: `処理中` / `Working`.
- whole-list failure: `処理できませんでした。もう一度お試しください。` /
  `Could not complete. Please try again.`

The dialog gains three optional props: `busy` (disables confirm, cancel, the X, the backdrop and
Escape), `progress` (the running line) and `error` (a failure line below the message). A dialog
that passes none of them renders and dismisses as I13 states.

User guide (`docs/user-guide/trash-and-missing.md`): one sentence that a large selection is
processed in groups of 100, and that files which were not processed stay selected.

### 10. Non-functional

- At most 100 ids per request (the server's cap); requests strictly sequential, so at most one
  request is in flight per run.
- A selection of N needs ceil(N / 100) requests. No speed-up is claimed here. Before any speed
  claim, the author measures and records in `docs/process/reviews/<topic>/`: a 300-file purge on
  test data (`data/` is test data, per the project's notes); the time of one 100-file chunk; the
  time of one whole-list request on a trash of at least 300 files; and whether any request was cut
  off by the Next.js rewrite. If sequential requests are still too slow, a separate spec decides on
  a job endpoint.
- The 120-second timeout must be above the measured time of one 100-file chunk and of one
  whole-list request. If it is not, the value changes before merge.
- Changing a value after approval is a revision: it is recorded in
  `docs/process/reviews/<topic>/invariants.md` (the timeout is I20) and approved again by the human.
  Before approval, the value is changed in this file and the hash is taken afterwards.
- The progress line wraps inside the dialog at 375 px without horizontal overflow, measured in
  `frontend/e2e-components/` (I14; Pending confirmation 10).

## Touch points

Frontend (no protected path):
- `frontend/src/lib/batchChunks.ts` (new): `runChunked(ids, send, hooks)` and its result type.
  Pure; the send function is passed in, so tests do not mock `@/lib/api`.
- `frontend/src/lib/api.ts`: `batchDelete`, `batchPurge` gain `options?: RequestOptions`
  (`fetchJSON` already accepts `RequestInit`, which carries `signal`).
- `frontend/src/components/SelectionBar.tsx`: `handleBatchDelete` (`:145`), `handleBatchPurge`
  (`:134`), the two confirm dialogs (`:465-482`), the run state, and the new props `onSelectOnly`
  and `onProcessed`.
- `frontend/src/components/ConfirmDialog.tsx`: optional `busy`, `progress`, `error`. When `busy`,
  the dismissal paths (Cancel button, X, backdrop `:50`, Escape through `useShortcuts` `:37-40`) do
  nothing.
- `frontend/src/components/trash/TrashView.tsx`: `handleEmptyTrash` (`:85-93`), the `SelectionBar`
  use (`:186`), `onSelectOnly` and `onProcessed`, and the replace operation of its selection hook
  (added to that hook if it has none).
- `frontend/src/components/missing/MissingView.tsx`: `handlePurgeAll` (`:58-66`).
- `frontend/src/components/folder/FolderBrowser.tsx` (the file that holds the `SelectionBar` use at
  `:939`): `onSelectOnly`, `onProcessed`, the continuous-row removal (`:343-345`, `:951-957`), and
  the replace operation of its selection hook.
- `frontend/src/components/inbox/InboxPresenter.tsx` (`:164`): `onSelectOnly`, `onProcessed`, and
  the replace operation of its selection hook.
- `frontend/src/messages-core/ja.json`, `en.json`: the strings in 9.
- Tests: `frontend/src/lib/__tests__/batchChunks.test.ts` (new);
  `frontend/src/components/__tests__/SelectionBar.test.tsx` and `SelectionBar.removedFlag.test.tsx`
  (existing `onComplete` contract, extended); `frontend/src/components/__tests__/TrashView.test.tsx`
  (existing; whole-list and selection); `frontend/src/components/__tests__/MissingView.test.tsx`
  (new; purge all); `frontend/src/components/__tests__/ConfirmDialog.test.tsx` (new; I13 and the
  busy paths); tests for the `onSelectOnly` and `onProcessed` behaviour of `FolderBrowser` and
  `InboxPresenter`.
- `frontend/e2e-components/`: a 375 px measurement of the progress line (I14). The running dialog is
  drawn with a stub that holds the request open; the fixture and selector are named in the PR.

Backend test only (no backend source change):
- `backend/tests/` (a pytest file that cites SPEC-CORE-120): a request with 101 ids to
  `/api/files/batch/delete` and to `/api/files/batch/purge` is answered 422 and changes no file.

Docs:
- `docs/user-guide/trash-and-missing.md`: one sentence (9).
- `docs/reference/websocket-events.md`: `files.deleted` and `files.purged` are one event per request;
  a selection sent in chunks emits one per chunk.
- `docs/reference/file-states.md`: the purge event wording, for the same reason.
- `docs/ADDON-DEVELOPMENT.md` and `docs/reference/configuration.md`: if their text says the webhook
  fires once per operation, it is changed in this PR; otherwise unchanged.
- `docs/process/reviews/<topic>/`: the measurement record (10).

Not touched: `backend/app/routers/files.py`, `backend/app/schemas.py`,
`backend/app/services/fileops.py`, `backend/app/routers/drives.py`, `backend/app/services/event_hooks.py`,
`frontend/src/components/DuplicatesSection.tsx`, `frontend/next.config.ts`.

Rules passed through: `.claude/rules/frontend-conventions.md` (translation keys only in
`messages-core/`; `batchChunks.ts` is a pure helper, not a shared component); `DESIGN.md` for the
dialog text and spacing; `.claude/rules/design-decisions.md` (drive boundary; locked drives
unchanged).

## Invariants

Each invariant names its spec in brackets.

I1. [120] A selection of N files is sent as ceil(N / 100) requests in insertion order, each with at most 100 ids, and each id is sent at most once per run.
I2. [120] The processed count shown during a run equals the number of ids counted processed by the answers so far, never exceeds the run's id count, and does not include per-file errors.
I3. [120] A chunk request is not sent until the previous chunk's request has been answered or aborted.
I4. [120] After a chunk request fails, times out or is aborted, no later chunk of that run is sent, and every id not confirmed processed stays selected.
I5. [120] A chunk answer whose counts do not add up makes that chunk unconfirmed and stops the run.
I6. [120] After a run ends (except an unmount, see 3), the selection holds exactly the failed and unconfirmed ids of the run, and none of the processed ids.
I7. [120] A run that sent at least one request calls `onComplete(true)` exactly once when it ends. A run that ends with no failure also calls `onClear` and closes the dialog. A run that ends partial or stopped keeps the dialog open. A run that ends with no processed file and no failed file (every chunk unconfirmed) still calls `onComplete(true)`.
I8. [120] The ids sent by a run are a subset of the selection at confirm time.
I9. [120] Unmounting during a run aborts the in-flight request and sends no further chunk.
I10. [121] A whole-list action's confirm and cancel controls are disabled from confirm until its request answers, and its request is sent exactly once per confirm.
I11. [121] After a whole-list failure the dialog stays open, its controls are enabled, and the list is refetched.
I12. [120] A direct request with more than 100 ids to `batch/delete` or `batch/purge` is answered 422 and processes nothing (backend pytest).
I13. [120] A ConfirmDialog given none of `busy`, `progress`, `error` calls `onConfirm` on confirm, and calls `onCancel` from its Cancel button, its X, its backdrop and Escape, as it does before this change. A SelectionBar given neither `onSelectOnly` nor `onProcessed` behaves as before.
I14. [120] The progress line of a running dialog wraps inside the dialog at 375 px width, with no horizontal overflow (`frontend/e2e-components/`).
I15. [120] The `remaining` count shown after a partial or stopped run equals the size of the selection after the run.
I16. [120] `DuplicatesSection`'s batch delete still sends its whole list in one request, with no options argument.
I17. [120] While a run is running, the dialog's confirm, cancel, X, backdrop and Escape do nothing.
I18. [120] While a run is running, a second confirm from any path does not start another run.
I19. [120] While a run is running, the selection's actions (trash, purge, move, tag and the like) are disabled.
I20. [120] Each request is aborted after 120 seconds, and an aborted request is treated as a failure of its chunk (or of the whole-list action).
I21. [120] A parent given `onProcessed` removes the processed rows from its list, and one given `onSelectOnly` replaces its selection with exactly the ids passed.
I22. [121] A whole-list success closes the dialog and empties the list.
I23. [120] The retry text is shown only on a run that started from a partial or stopped run.

Documentation text is checked in review, not by a test.

## Checked, no action

- **Raising the server's 100-id cap or adding an asynchronous job.** Chunking fixes the observable
  failure without a contract change. A job endpoint with progress events is a new WebSocket
  contract, a larger decision, left for a later spec if the measurement in 10 needs it.
- **Why deletion is slow on the server.** `physical_delete` (`fileops.py:669`) runs per file,
  `purge_file` commits per file, and `purge_all_trash` (`fileops.py:749-762`) unlinks each file
  before one commit, so a failure before that commit leaves files unlinked while their rows remain.
  These are backend issues in a HIGH zone (`fileops.py`), reported as separate findings and not
  changed here. The whole-list failure path refetches the list so it shows the server's state, but
  does not repair the server.
- **Restore from trash, batch move and batch tag.** Same 100-id cap and silent failure in one request
  each. Not named by the request; a follow-up (Pending confirmation 4).
- **DuplicatesSection's batch delete.** Same silent failure on the admin duplicates screen. Not in the
  request; a follow-up (Pending confirmation 5).
- **Server-side progress during a request.** Not needed: the frontend counts answers per chunk.
- **Toast for batch results.** The dialog shows the outcome, because a partial run needs a retry
  decision.
- **Per-file error text in the dialog.** Counts only (Pending confirmation 9).
- **Cancel during a run.** Not offered: a cancel would leave an unknown prefix processed.
- **Reporting processed ids after unmount.** Not possible once the component is gone; accepted in 3
  (Pending confirmation 11).

## Pending human confirmation

Each is written into the spec as recommended; approval of the spec confirms them.

1. A failed, timed-out or inconsistent chunk stops the run; later chunks are not sent.
   (Recommended: the viewer decides whether to continue; continuing past an unknown failure could
   purge files the viewer did not expect to be affected.)
2. Files not confirmed processed stay selected after the run, and a retry sends only those.
   (Recommended: the viewer can see and retry exactly what did not happen.)
3. Empty trash and permanently delete all missing show a running state with no count, because each
   is one server request with no per-file progress. (Recommended: a count needs a server change, out
   of scope here.)
4. Restore, batch move and batch tag stay unchanged in this spec. (Recommended: one change per spec;
   they follow once this one is measured.)
5. DuplicatesSection's batch delete is out of scope and stays a follow-up. (Recommended: an admin
   screen with its own flow; changing it here would widen the review.)
6. A retry can count files already processed by an earlier attempt as failed, because the server
   answers "not found" for them. (Recommended: count them as failed, and say so in the retry text
   (§9). Telling "already gone" from failure would depend on error wording, which is brittle.)
7. After a whole-list failure the list is refetched, and the unlink-before-commit behaviour of
   `purge_all_trash` stays out of scope and is reported. (Recommended: the refetch shows the server's
   state; the backend fix is a separate, HIGH-zone change.)
8. Every request (each chunk and each whole-list request) has a 120-second timeout that counts as a
   failure. (Recommended: a hung request would otherwise leave the dialog running with no exit. 120 s
   is an initial value; the measurement in 10 may change it.)
9. The failed and remaining counts show numbers only, not which files. (Recommended: a list of ids in
   the dialog adds layout for little use on a home library.)
10. The 375 px measurement of the progress line is required, and it is taken before approval or
    before merge? (Recommended: before merge, since it is a browser measurement of the implementation;
    the spec's I14 is the check.)
11. Unmount during a run leaves the run's ids in the selection, and processed files may be among them
    until the next page load. (Recommended: reporting after unmount would need state outside the
    component; the cost is a stale selection in a rare navigation case.)
12. Whether a measurement that changes the timeout value is approved as an `invariants.md` revision
    (Recommended), or the spec is re-approved as a whole.
13. Mid-run re-fetch. Each chunk's `files.deleted` / `files.purged` causes `drive.structure_changed`,
    so lists on screen re-fetch during a run and may overlap with `onProcessed`'s row removal.
    (Options: allow it, which is simpler and keeps lists true to the server; or suppress it during a
    run, which keeps rows stable and leaves the list stale until the run ends. Recommended: allow it,
    and let `onProcessed` run after each chunk so the removal and the re-fetch agree.)
14. A whole-list request that the server finishes but the client aborts at 120 s shows failure while
    the server has acted. (Options: keep the failure text and refetch the list, which shows the truth;
    or lengthen the whole-list timeout only; or split whole-list actions into chunks, which needs a
    server change. Recommended: keep the failure text and refetch, after the measurement in 10.)
15. If the Next.js rewrite cuts off a 100-file chunk, or a measured run is too slow, what is done.
    (Recommended: a cut-off means the measurement is redone with a smaller chunk size, a decision
    recorded as a revision; "too slow" is judged on the measurement record, with no fixed threshold
    set here.)
16. Approve the 120-second value as written, or require the measurement before approval. (Recommended:
    approve as written; the measurement can still move the value through a revision (12).)
17. Accept that one selection of N files produces one webhook per chunk. The addons' handlers take
    lists; whether each is idempotent is checked in each addon's repository before merge. (Recommended:
    accept, with the merge condition in 7.)
