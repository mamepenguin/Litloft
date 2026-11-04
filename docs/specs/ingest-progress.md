# Upload progress until the file is ready to use

SPEC-ID: SPEC-CORE-031
SPEC-ID: SPEC-CORE-037
SPEC-ID: SPEC-ADDON-057

Approval: sha256:de18030f6fb3fe7172d2ef5474e6349e04ecb055520a610d4e780e8648bcfefd Yuichi Senga 2026-11-03

## Summary

When an upload finishes, the drawer says **Complete**, but the file is not yet what the
viewer uploaded it for: search cannot find it yet, and its text and speech have not been
processed. Those steps run later in addons, and nothing tells the viewer where they
stand.

- **SPEC-CORE-031**: a generic contract for an addon to report files' processing stages,
  each marked required or not, and a core endpoint that asks every addon declaring it and
  returns one list per file, with the core's own "saved" stage first. A file is ready when
  every required stage is done. The core never names an addon or a stage, and stores
  nothing.
- **SPEC-CORE-037**: the upload drawer keeps an entry going after **Complete**: it shows
  the stages and **使えます** / **Ready** once the required ones are done. It refreshes
  when an addon announces a change, and stops after 30 minutes.
- **SPEC-ADDON-057**: intelligence reports one required stage, the search index, from
  the one flag that reliably means "searchable", plus two informational stages (text,
  transcript) that only ever say done, pending, or a failure that will not be retried.

Intelligence keeps no per-file record of a stage that will not run, so this unit does not
try to infer one: informational stages never claim "skipped", and readiness rests on the
search index alone. Out of scope: the file detail page, a list of recent imports (C3),
and optional outputs such as summaries and tag candidates.

The user chose the pull-based contract, the upload drawer, this reduced stage model and
the decisions below on 2026-11-03.

## Required items

### 1. Normal flow

SPEC-CORE-031:

1. An external-service addon (one with a `proxy` target) declares in `manifest.json` a
   top-level key `"processing_status": { "path": "/files/processing" }`. In-process
   addons cannot declare it; the key is ignored on them.
2. The core calls that path on the addon's proxy target directly, not through the
   browser-facing proxy table (which does not list it): `POST <target><path>` with
   `X-Lit-Drive: <drive>` and `{ "file_ids": [ … ] }` (at most 100), and no secret, as
   the proxy forwards without one. The target URL comes from the same resolution the
   proxy uses, moved from `addon_proxy.py` into `addon_registry.py` so both share it.
3. The addon answers `{ "files": { "<file_id>": { "stages": [ { "key", "i18n_key",
   "state", "required" } … ] } } }`, with `state` one of `pending`, `running`, `done`,
   `failed`, `required` a bool, stages in display order, and `key` matching
   `^[a-z][a-z0-9_.]*$`. A file id it does not hold in that drive may be left out. An
   empty `stages` list is valid and contributes nothing for that file (an addon with
   nothing to report for a kind says so). Validation is per file: a file whose stage list
   breaks the schema counts as left out; a body that is not this shape counts as every
   requested file left out; ids that were not requested are dropped.
4. `POST /api/files/processing` (core) takes `{ "file_ids": [ … ] }` (1 to 100). It drops
   the ids the viewer cannot access, or that are missing or trashed, groups the rest by
   drive, and calls every (drive, addon) pair concurrently, each call bounded to 3 s in
   total, for every external addon that declares `processing_status` and whose per-drive `index` feature is
   on (`config.is_addon_feature_enabled(drive, name, "index")`). Addons are called and
   listed in addon-name order.
5. It answers `{ "files": { "<file_id>": { "stages": [ { "addon", "key", "i18n_key",
   "state", "required" } … ], "ready": bool } } }` for the accessible ids only. Each list
   starts with `{ "addon": null, "key": "saved", "i18n_key": "upload.stageSaved",
   "state": "done", "required": true }`, then each addon's stages for that file in its
   order. An addon that times out, fails, answers a malformed body or leaves a file out
   contributes, for that file, `{ "addon": "<name>", "key": "unavailable", "i18n_key":
   "upload.stageUnavailable", "state": "pending", "required": true }`.
6. `ready` is true exactly when every required stage is `done`.

SPEC-CORE-037:

1. An entry that reaches **Complete** for a file (not a subtitle sidecar, which has no
   file id) keeps the file id from the complete response and enters the processing view.
   The processing view is separate from the upload status: the at-most-two upload limit,
   the leave-page confirmation and **Clear** look at the upload status only, so a complete
   entry is finished for them whatever its processing (SPEC-CORE-030 I4, I5, I12 hold).
2. The upload store owns the processing view: one fetch of
   `POST /api/files/processing` per tick for all its entries in processing view (batches
   of 100), a 30 s tick, and a 30-minute deadline per entry counted from **Complete**.
   `UploadProgress`, mounted once in the root layout, reads the WebSocket's last event and
   passes `processing.updated` events to the store; an event lost in a burst is picked up
   by the next tick.
3. Until the first answer, the entry shows its upload state as today. Then it shows a line
   of its stages in order, wrapping within the drawer's width: each label translated by
   its `i18n_key` (a missing key shows the stage `key`), with a check for `done`, a
   spinner for `pending` and `running`, a mark for `failed`. `unavailable` shows the text
   **確認できません** / **Not available right now** with a spinner.
4. When `ready` is true, the line is replaced by **使えます** / **Ready** in
   `accent-teal` with a lucide `Check`; if a stage had `failed`, the failure mark stays
   beside it. A failure that happens after **Ready** is not shown (the entry no longer
   fetches).
   Layout: the line sits under the file name in small muted text; icons are lucide
   `Check` (done), a spinning `Loader2` (pending, running), `AlertCircle` in `danger`
   (failed) and `Minus` in grey (stopped). The header's "N processing" count keeps
   counting upload states only.
5. A `failed` stage marks the entry **一部の処理に失敗しました** / **Some steps failed**
   and the line keeps every stage; it does not stop the entry while a required stage is
   still pending.
6. Refresh happens on a `processing.updated` event whose `file_ids` include the entry's
   id, and on each tick, while the entry is not ready, not gone and within its deadline.
   At the deadline it stops: spinners become a grey dash, and the line stays.
7. A file the endpoint leaves out (no longer accessible) stops fetching and shows the
   plain **Complete** check again. A failed request (any non-200, or network) leaves every
   entry's state and line as they were and is retried on the next tick. An entry still
   `waiting` at its deadline keeps the plain **Complete** check. **Clear** removes the
   entry and its fetching with it.

SPEC-ADDON-057:

1. Intelligence declares `processing_status` with path `/files/processing` and answers
   for each requested id of the request drive, whether or not it has an `indexed_files`
   row yet.
2. Stages:
   - `search` (`intelligence.processing.search`, 「検索の索引」 / "Search index"),
     required, every file: `done` when the file has an active row in the request drive
     with `metadata_indexed`; `pending` otherwise, including no row yet, an inactive row
     (a revived upload before its webhook), or a row still in another drive.
   - `text` (`intelligence.processing.text`, 「本文の抽出」 / "Text"), not required,
     only for a row whose `mime_type` is in `TEXT_MIMES`: `done` when `text_indexed`,
     `pending` otherwise. Never `failed`.
   - `transcript` (`intelligence.processing.transcript`, 「文字起こし」 / "Transcript"), not
     required, only for a row whose `mime_type` is in `TRANSCRIBABLE_TYPES` or is
     `LOFT_MIME`. With "latest job" the file's newest transcription job record by `id`:
     `running` when the latest job is `running`; `failed` when the latest job is `failed`
     and either the row is `whisper_indexed` (nothing will retry it, as for a `.loft` whose
     temporary audio was consumed) or its `error_class` is `FatalError`; `done` when the
     row is `whisper_indexed` and the latest job, if any, is not `failed`; `pending`
     otherwise, including failures that are retried (transient, rate limit, circuit
     breaker, container restart).
3. Intelligence posts `processing.updated` with `{ "file_ids": [ … ] }` (at most 100 per
   event) and `drive` set, through `POST /api/internal/addon-events`, whenever a write
   moves `metadata_indexed`, `text_indexed` or `whisper_indexed` from false to true, or a
   transcription job record ends `failed`: one event per write and drive, listing the files
   that write changed. A write that leaves a flag unchanged, or clears it (resets), posts
   nothing.

### 2. Failure cases

- An id the viewer cannot access, or missing or trashed: absent from the answer; the entry
  stops fetching and loses its line.
- An addon down, slow (over 3 s) or wrong: its `unavailable` stage is required and
  pending, so the entry is never **Ready** meanwhile; it keeps trying until its deadline.
- The core endpoint fails: the drawer keeps the last line and retries on the next tick.
- An event naming a file the drawer does not hold: ignored.
- Events lost (WS down, or a burst): the next tick picks the change up.
- No addon declares `processing_status`, or intelligence's `index` feature is off for the
  drive: the file is `[saved]`, ready, and shows **Ready** at the first answer.
- The queue is paused or a step never finishes: the entry stops at its deadline with grey
  dashes.

### 3. States

Processing view of an entry (its upload state stays `complete`):

| From | To | When |
|---|---|---|
| waiting (no answer yet) | ready | first answer is ready |
| waiting | in-progress | first answer is not ready |
| waiting, in-progress | gone | the file is absent from an answer |
| waiting, in-progress | stopped | 30 minutes past **Complete** |
| in-progress | ready | an answer is ready |
| any | removed | **Clear** |

`ready`, `stopped`, `gone` and `removed` are final: nothing moves them and they do not
fetch. A failed stage is shown in `in-progress` and `stopped` and is not a state of its
own.

### 4. Data read and written

- Core: reads file rows for access; writes nothing.
- The target resolution moved into `addon_registry.py` keeps the proxy's rule (the
  manifest's `target_env` value when set and non-empty, otherwise `target_default`).
- Intelligence: reads `indexed_files` and `job_records`; writes nothing for the route. The
  event posts add WS broadcasts.
- Browser: the processing view lives in the upload store's entry, in memory.

### 5. External services

None outside the Docker network.

### 6. Authorization

The core endpoint answers only for files the viewer can access (others are absent, so a
locked drive's file is not revealed). The core sends each addon only that drive's
accessible ids, in `X-Lit-Drive`; intelligence answers only from its rows of that drive.
The addon route is not in the browser-facing proxy table, so a browser cannot call it.
`processing.updated` is broadcast with `drive`, so only viewers who can open that drive
receive it.

### 7. Effect on existing features

- The upload drawer's upload states, the at-most-two limit, the leave-page confirmation
  and **Clear** are unchanged (SPEC-CORE-030 I4, I5, I12 hold as written).
- **Index details** is unchanged.
- `addon_proxy.py` imports the target resolution from `addon_registry.py`; its behaviour
  does not change.
- `addon-events` gains one generic event name, `processing.updated`.

### 8. Error behavior

As in 2. The core logs an addon's processing call failure at WARNING with the addon name
and the number of ids, at most once per addon per minute.

### 9. User-visible behavior

As in 1 (037). `docs/user-guide/upload-and-fileops.md` says the drawer shows when an
uploaded file can be found by search. `docs/reference/api.md` documents
`POST /api/files/processing`; `docs/reference/websocket-events.md` documents
`processing.updated`; `docs/ADDON-DEVELOPMENT.md` documents `processing_status`;
`docs/addons/intelligence.md` lists the three stages.

### 10. Non-functional

- One core request per drawer tick or event, covering all its entries (100 per request).
- The core endpoint answers within the slowest addon's time, at most about 3 s.
- Intelligence answers 100 ids within 300 ms.
- Events: at most one per metadata batch per drive, one per text or transcript
  completion, none from resume or bulk passes.

## Touch points

Core:
- `backend/app/routers/files.py` (or a new router registered in `backend/app/main.py`):
  `POST /api/files/processing`.
- `backend/app/services/addon_registry.py`: read `processing_status` from external
  manifests; hold the target resolution.
- `backend/app/routers/addon_proxy.py` (HIGH zone): import the target resolution from the
  registry instead of defining it. No other change.
- `backend/app/schemas.py`: request and response models.
- `backend/tests/`: endpoint, aggregation, access, timeout, policy and proxy-resolution
  tests.
- `frontend/src/hooks/useUpload.ts` (the upload store), `frontend/src/components/UploadProgress.tsx`: the processing view, the tick, the deadline, the event hand-off.
- `frontend/src/lib/api.ts`: `getFilesProcessing`.
- `frontend/src/messages-core/ja.json`, `en.json`: `upload.stageSaved`,
  `upload.stageUnavailable`, **Ready**, **Some steps failed**.
- Frontend tests next to the existing upload tests.
- `docs/user-guide/upload-and-fileops.md`, `docs/reference/api.md`,
  `docs/reference/websocket-events.md`, `docs/ADDON-DEVELOPMENT.md`.

Addon (intelligence):
- `addons/intelligence/app/routers/files.py`: `POST /files/processing` (a literal path
  declared before the `/files/{file_id}` routes).
- Every intelligence write that moves `metadata_indexed`, `text_indexed` or
  `whisper_indexed` from false to true, or ends a transcription job `failed`, posts
  `processing.updated`: `app/workers/metadata.py`, `app/workers/whisper.py` (including the
  `.loft` and flag-only paths), `app/indexer.py` (resume). The resets in `app/database.py`
  clear flags and post nothing.
- `addons/intelligence/manifest.json`: `processing_status`.
- `addons/intelligence/frontend/messages/ja.json`, `en.json`:
  `intelligence.processing.search`, `.text`, `.transcript`.
- `addons/intelligence/tests/`.
- `docs/addons/intelligence.md` (core repo, with the gitlink bump).

Rules passed through: `.claude/rules/design-decisions.md` (no addon-specific core code;
drive boundary and absence for locked drives; per-drive addon policy),
`.claude/rules/internal-api-policy.md` (no new Internal API endpoint),
`.claude/rules/frontend-conventions.md`, `DESIGN.md`. `addon_proxy.py` is a HIGH zone and
is named; no protected path is edited.

## Invariants

I1. `POST /api/files/processing` returns nothing for a file the viewer cannot access, and never sends that file's id to an addon.
I2. Each file's stages start with `saved`, followed by the stages of every external addon that declares `processing_status` and has its `index` feature on for that drive, in addon-name order and each addon's own order; each addon receives only ids of the drive named in its `X-Lit-Drive`; an in-process addon is never called.
I3. An addon that fails, takes over 3 s, answers a malformed body or omits a file contributes one required, `pending` `unavailable` stage for that file, and the other addons' stages are still returned.
I4. `ready` is true exactly when every required stage is `done`; with no addon declaring the key, every file is `[saved]` and ready.
I5. Intelligence's `search` stage is required and `done` exactly when the file has an active row in the request drive with `metadata_indexed`; its `text` and `transcript` stages are not required and never `skipped`; `transcript` is `failed` only when the latest transcription job failed and either the row is `whisper_indexed` or the error class is `FatalError`, and `pending` for a retried failure.
I6. Intelligence posts `processing.updated` with `drive` set exactly for writes that move one of the three flags from false to true or end a transcription job `failed`, at most 100 ids per event, and nothing for writes that leave a flag unchanged or clear it; a viewer who cannot open that drive never receives it.
I7. A drawer entry shows **Ready** exactly when the latest answer for its file is ready, and keeps a failure mark beside it when a stage had failed.
I8. A drawer entry fetches only on an event naming its id or on the tick, and never after it is ready, gone, removed, or 30 minutes past **Complete**; a failed request keeps its last line.
I9. The processing view changes neither the at-most-two upload limit, nor the leave-page confirmation, nor what **Clear** removes.
I10. The intelligence processing route is not reachable through the browser-facing proxy.
I11. Both the proxy and the processing call resolve an addon's target the same way: the `target_env` value when set and non-empty, else `target_default`.
I12. At the deadline an entry's spinners become grey dashes; a file that leaves the answer, or an entry still waiting at its deadline, shows the plain **Complete** check; `unavailable` shows **確認できません** with a spinner.
I13. An addon's empty `stages` list contributes no stage for that file, and a file whose stage list breaks the schema gets the `unavailable` stage while the addon's other files keep theirs.

## Checked, no action

- **Push into a core table.** Rejected for the pull contract.
- **"Skipped" stages.** Intelligence records no terminal "will not run" for text or
  transcript; inferring it from config or job records gave wrong answers in review, so
  informational stages only report what is recorded.
- **Optional outputs (summaries, tag candidates, chapters).** Not part of "ready".
- **Files that arrive by scan, not upload.** Need a surface outside the drawer, later.
- **Tracking re-runs.** A retried transcription stays `pending`; a fatal one stays
  `failed` in the drawer even if it is later fixed by hand.
- **In-process addons.** They have no network target.
- **A secret on the core-to-addon call.** The proxy forwards without one on the same
  network; the route is not exposed to browsers.
