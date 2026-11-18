# R1 review: Knowledge notes/sources routes (track B) and editor save handle (track C1)

Commits reviewed (addons/knowledge): `3f79bad` (routes), `4b95742` (editor save handle).
Threat model: personal tool, owner is the only user, no adversary. Bucket A = silently wrong in normal use; bucket B = odd input / misuse.

Material read: the two commits' code and tests, `CLAUDE.md`, `.claude/rules/*.md`, `docs/specs/notes-app.md` (Sources steps 1-6, Library steps 6-7, I4, I7, I11, I12, I20, Checked no action).

## Mutation log

Routes: each mutant was a copy in the scratchpad bind-mounted read-only over `app/routers/notes_sources.py` in the existing `knowledge-test-baseline` image, so the checkout was never touched; tests: `tests/test_notes_sources.py` only (baseline 17 passed).
Editor: `frontend/Editor.tsx` had no uncommitted change (`git diff` empty) before each mutant; each was applied, the three test files of `4b95742` run (baseline 19 passed), then the file restored with `git checkout -- frontend/Editor.tsx` (diff empty afterwards).

| Mutant | Result |
|---|---|
| m1 origin lookup without `NoteOrigin.drive == drive` | killed (1 failed) |
| m2 read content of every requested id, not only `kept_notes` | killed (2 failed) |
| m3 keep bulk files of any drive | killed (1 failed) |
| m4 `with-sources` without the drive filter | killed (1 failed) |
| m5 fallback `note_origin_sources` query without its drive filter | **survived** (F2) |
| m6 locator = last link instead of first | killed (2 failed) |
| m7 locators on the content-read fallback | killed (2 failed) |
| F1 flush without the initial debounce cancel | killed (6 failed) |
| F2 flush without the in-loop debounce cancel | killed (1 failed) |
| F3 flush without waiting for the in-flight save | killed (7 failed) |
| F4 flush without the re-save of newer text | killed (1 failed) |
| F5 conflict reported as `failed` | killed (3 failed) |
| F6 performSave not recording `conflict` | killed (3 failed) |
| F7 performSave not resetting the outcome to `failed` per operation | **survived** (F1) |
| F8 flush without its own plain-block check | survived, equivalent: `performSave` itself returns at the plain block with the outcome reset to `failed`, so the result and requests are identical |
| F9 non-conflict failure treated as success | killed (1 failed) |
| F10 `dirty()` always false | killed (3 failed) |

## Findings

### F1. A save failure that follows a successful save is not tested, so `flush()` could loop for ever without a test failing (surviving mutant)

- `addons/knowledge/frontend/Editor.tsx:592` (`lastSaveOutcomeRef.current = "failed"` at the start of each save operation)
- Rule: spec Library step 6 / item 2 ("resolves `failed` ... with the first save that fails"); testing-and-comments (a guard no test kills).
- Current code is correct. Mutant F7 deletes the reset and all 19 tests still pass, because `resolves failed when the save fails` starts from the ref's initial value `"failed"` with no earlier successful save. With the reset gone, a network/500 failure after any earlier save leaves the ref at `"saved"`; the flush loop then sees the text still unsaved and PUTs again, indefinitely, and the pane stays in "Saving…".
- How it would happen in normal use (if the reset regresses): edit a note, let autosave succeed, lose the backend (restart, Wi-Fi), press Done.
- Missed-defect score: frequency 1, impact 5 (stuck gate, noticed). Fix: one test that saves successfully once, then makes the next PUT fail and expects `"failed"` with one extra PUT.

### F2. The fallback query's drive filter in `notes/sources` is not pinned by any test (surviving mutant, masked by the bulk filter)

- `addons/knowledge/app/routers/notes_sources.py:130` (`NoteOriginSource.drive == drive` in the per-note `note_origin_sources` query)
- Rule: I7 / design-decisions "drive is a security boundary"; drive-partitioned tables are queried drive-scoped.
- Mutant m5 removes the predicate and all 17 route tests pass. Output is still correct today because `note_path` is only looked up for origins already filtered to the header drive, and line 173 drops any source `/files/bulk` reports on another drive; the predicate only matters when two drives hold a note at the same `note_path`, and then only the fallback (content-read failure) path, and then the second layer removes the foreign sources. No content of another drive's note is read.
- Frequency 0, impact 2. Bucket B. A seed of the same `note_path` on two drives with different sources plus a failed content read would pin it.

### F3. `notes/sources` percent-decodes the drive header twice; `notes/with-sources` decodes it once (bucket B)

- `addons/knowledge/app/routers/notes_sources.py:115` (`unquote(_require_drive(x_hv_drive))`; `_require_drive` in `distill.py:55` already returns `unquote(drive)`)
- Rule: design-decisions drive boundary / consistent `X-Lit-Drive` decoding with the proxy (`addon_proxy.py` decodes once).
- For a drive whose decoded name still contains `%` followed by two hex digits (e.g. a folder literally named `50%25 off`), the second decode yields a different name, the `note_origins` lookup finds nothing, and the route answers `{"notes": {}}`: Home's "Notes with sources" and the pane's Sources column silently disappear while `with-sources` (single decode) still lists the notes. Fails closed (no other drive's data), so no boundary breach.
- Frequency 0 (needs such a drive name), impact 3. Fix: drop the outer `unquote`.

## Checked, no finding

- Drive check before content read (I7): `read()` runs only for ids found in `note_origins` with the header drive (`kept_notes`); mutants m1 (drop the origin drive filter) and m2 (read every requested id) are both killed by `test_never_reads_content_of_a_note_not_on_the_header_drive`. Sources are kept only when `/files/bulk` reports them on that drive (m3 killed).
- Locator is the first link per source (m6 killed); no locator on the fallback path (m7 killed); frontmatter parse never raises on malformed YAML (`frontmatter.parse`).
- `/notes/with-sources` is not shadowed by another `/notes/{...}` route; both manifest entries are drive-scoped (not `drive_optional`), like the neighbouring Knowledge routes.
- `flush()` outcomes and ordering: waits for an in-flight save via the queue, cancels the debounce at entry and on each loop, re-saves newer text, returns the first `failed` / `conflict`; the outcome ref is read in the microtask after flush's own operation and before the next queued operation starts, so an autosave queued behind it cannot overwrite the outcome first.
- Handle lifetime: `handleReady` is false in the render where `fileId` changes (`contentFileIdRef` still holds the old id), so the cleanup clears `current` before the new file loads; cleanup only clears its own handle.
- I12: with no `saveHandle` the new effect returns at once and `performSave` only gains ref writes; `Editor.requestSequence.test.tsx` covers GET/PUT order and timing.
- Plain-text block: not dirty -> `"saved"` without a write; dirty -> `"failed"` without a write (matches Library step 6).

TOTAL: 3 findings
