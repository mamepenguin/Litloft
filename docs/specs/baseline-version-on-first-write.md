# Keep a file's text from before its first recorded write

SPEC-ID: SPEC-CORE-016

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

A text file that reached Litloft by upload, by a scan of a mounted folder, or by any path
other than `POST /api/drives/{drive}/files` has no version history. Its first content write
(`PUT /api/files/{id}/content` from the editor, the MCP `edit_file_content` /
`update_file_content`, a Markdown tag write, the image import job) records only the new
text, so the text the file had before that write cannot be restored from history. A wrong
first edit, by a person or by an agent, silently loses the original. This is a bug fix:
`write_text_content` records the text it replaces as a baseline version when the file has
no version yet.

## Required items

### 1. Normal flow

1. A caller of `write_text_content` (the content PUT, the Markdown tag write, the image
   import job) passes the new body; the function reads the current bytes and checks the
   ETag, as today.
2. It replaces the file on disk, as today.
3. Inside the existing nested transaction for version recording, when the file has no
   `FileVersion` row, it first records the current (pre-write) bytes with
   `kind='explicit'`, `viewer_id=NULL`, `nickname=NULL`.
4. It then records the new body with the caller's kind and identity, exactly as today. The
   new version's line counts are computed against the baseline.

A file that already has any version gets no baseline: steps 1, 2 and 4 are today's
behavior unchanged.

### 2. Failure cases

| What goes wrong | What happens |
|---|---|
| The pre-write bytes are not valid UTF-8 or exceed the version body cap | No baseline is recorded and the new version is recorded as today (the baseline is skipped, not the write). |
| Recording either version raises | Logged and swallowed as today; the content write is durable; nested transaction rolls back both rows. |
| Pre-write bytes equal the new body | The baseline is recorded; the new version is then a no-op or a promotion under the existing dedup rule, so one row results. |

### 3. States

A file's history goes from empty to `[baseline (explicit), new version]` on its first
recorded write. No other transition changes.

### 4. Data read and written

- Read: the file's current bytes (already read for the ETag check), the count of its
  `file_versions` rows.
- Written: one extra `file_versions` row on a file's first recorded write.

### 5. External services

None.

### 6. Authorization

Unchanged; the callers already checked access to the file.

### 7. Effect on existing features

- The version history UI and API list one more row (the baseline) for files that had no
  history before their first write. It is explicit, so the 200-row cap, which evicts the
  oldest auto rows, never evicts it.
- `POST /api/drives/{drive}/files` already records an explicit first version, so files
  created there get no baseline.
- Tests that seed a file without versions and then PUT now see the baseline first.

### 8. Error behavior

As today: a version-recording failure is logged (`Could not record file version`) and the
write succeeds.

### 9. User-visible behavior

The history panel of a file edited for the first time shows its earlier text as the oldest
entry, without a nickname, restorable like any version.

### 10. Non-functional

One extra row and one compressed copy of at most 1 MB per file, once.

## Touch points

- `backend/app/services/content_write.py`: `write_text_content`.
- `backend/app/services/file_versions.py`: a helper that tells whether a file has versions,
  if needed.
- `backend/tests/test_file_versions.py`: existing write-path tests that assume an empty
  history after the first PUT; new tests.
- Rules passed through: `.claude/rules/design-decisions.md` (data the filesystem cannot
  regenerate), `.claude/rules/backend-conventions.md`.
- No protected path is edited.

## Invariants

I1. After the first recorded write to a file with no version, its history holds the
pre-write text as an explicit version with no viewer, older than the version of the new
text.
I2. A write to a file that already has a version records exactly what it recorded before
this change, and no baseline.
I3. A failure to record the baseline or the new version never fails the content write or
undoes it on disk.
I4. The baseline is recorded at most once per file: a second write never adds another
viewer-less explicit row of the text it replaced.
I5. A pre-write body that is not valid UTF-8 or exceeds the version body cap records no
baseline and does not stop the new version from being recorded.

## Checked, no action

- **Recording a version at upload or scan time**: upload is a file-transfer path for the
  whole library, not only text up to 1 MB; recording at the first write covers every text
  file without touching upload or the scanner.
- **Dating the baseline with the file's mtime**: the row's time is when it was recorded;
  the content is what matters for restoring.
- **Upload over a file that already has versions**: still records nothing, as the
  version-history design stated, so the uploaded text is not in history until a later write
  replaces it. Upload is not an editing path; this fix covers files with no history.
