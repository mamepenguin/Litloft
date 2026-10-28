# MCP: read and edit files in parts, manage folders, act on many files, spend fewer tokens

SPEC-ID: SPEC-CORE-010
SPEC-ID: SPEC-CORE-011
SPEC-ID: SPEC-CORE-012
SPEC-ID: SPEC-CORE-013
SPEC-ID: SPEC-CORE-014
SPEC-ID: SPEC-CORE-015

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

An agent working on a Litloft library through the MCP server is clumsier than one working
on local files. It can only read a whole text file, only rewrite a whole file, cannot open
a file by its path, cannot create, rename, move or remove folders, has to act on files one
at a time, and receives indented JSON with every field of every file. This change closes
those gaps inside the MCP server, over the public `/api/*` endpoints that already exist; the
backend does not change.

- SPEC-CORE-010: `get_file_content` reads a line range, and reads any `text/*` or
  `application/json` file, not only Markdown and plain text.
- SPEC-CORE-011: new `edit_file_content` replaces an exact string in a Markdown or plain-text
  file without the agent sending the whole file back.
- SPEC-CORE-012: new `get_file_by_path` resolves a file from its drive-relative path.
- SPEC-CORE-013: new folder tools `create_folder`, `rename_folder`, `move_folder`,
  `trash_folder`.
- SPEC-CORE-014: new batch tools `move_files`, `copy_files`, `trash_files`, `restore_files`,
  `add_tags`, each taking up to 100 file ids.
- SPEC-CORE-015: every tool's JSON output is compact, and `search_files` returns a summary of
  each file unless asked for every field.

## Required items

### 1. Normal flow

**Reading a body.** Both `get_file_content` and `edit_file_content` read
`GET /api/files/{file_id}/stream` through the client's `requestBytes`, which gains an `etag`
field in its result (the `ETag` response header, or null). The bytes are decoded as UTF-8
keeping a leading byte-order mark as U+FEFF (`TextDecoder("utf-8", {ignoreBOM: true})`), so
re-encoding the text gives back the same bytes for any valid UTF-8 file. `file_size` in
`GET /api/files/{file_id}` is an integer in the API schema and is always present.

**`get_file_content(file_id, offset?, limit?)`** (SPEC-CORE-010)

1. The tool reads `GET /api/files/{file_id}` for `mime_type` and `file_size`.
2. It refuses (see 2.) unless `mime_type` starts with `text/` or equals `application/json`.
3. It refuses a file larger than 10 MB (10 × 1024 × 1024 bytes). It refuses a file larger
   than 1 MB (1024 × 1024 bytes) when neither `offset` nor `limit` is given.
4. It reads the body as above. Invalid UTF-8 bytes become U+FFFD in what it returns. The
   size checks of step 3 are applied again to the number of bytes downloaded, because the
   file can have changed on disk since it was indexed; a body over the bound is refused
   and nothing of it is returned.
5. Without `offset` and `limit` it returns `{"content", "etag"}`: the whole decoded text and
   the stream's ETag (the backend sends one only for Markdown and plain text of at most
   1 MB; otherwise null).
6. With either given, the text is split into lines, each keeping its own terminator (`\n`,
   or `\r\n`, which ends in `\n`); a final line without a terminator is a line; empty text
   has 0 lines. `offset` is the 1-based first line (default 1), `limit` the number of lines
   (default: to the end). Lines are taken in order and the tool stops before a line that
   would make `content` exceed 1 MB encoded as UTF-8. It returns
   `{"content", "etag": null, "start_line", "end_line", "total_lines", "truncated"}`:
   `content` is lines `start_line..end_line` exactly as decoded, `end_line` the last line
   returned, `total_lines` the count of all lines, `truncated` true when it stopped at the
   1 MB bound before `limit` or the end. When `offset` is past the last line, `content` is
   `""`, `start_line` is `offset`, `end_line` is `offset - 1` and `truncated` is false. When
   the first requested line alone exceeds 1 MB the tool refuses.
7. A ranged read always returns `"etag": null`, so a partial read can never be written back
   whole with `update_file_content`; partial changes go through `edit_file_content`.
8. The zod schema requires `offset` and `limit` to be integers ≥ 1.

**`edit_file_content(file_id, old_string, new_string, replace_all?)`** (SPEC-CORE-011)

1. With `old_string` empty, or equal to `new_string`, the tool refuses without any request.
2. It reads `GET /api/files/{file_id}`; only `text/markdown` and `text/plain` of at most 1 MB
   are editable (the backend's own write rule). Anything else is refused before `/stream`.
3. It reads the body as above, decoding strictly (`fatal: true`): a body that is not valid
   UTF-8 is refused. A response without an ETag is refused. Neither reaches the PUT.
4. It counts the non-overlapping exact occurrences of `old_string`, scanning left to right.
5. With `replace_all` false (the default) it requires exactly 1 occurrence; with
   `replace_all` true at least 1. It replaces those occurrences with `new_string`, each
   inserted literally (no pattern or `$` substitution). The rest of the text, a leading
   byte-order mark included, is unchanged.
6. It sends `PUT /api/files/{file_id}/content` with the new text, `Content-Type:
   text/plain` and `If-Match: <the ETag from step 3>`, without `X-Litloft-Save-Kind`, so the
   backend records an `auto` version as it does for `update_file_content`: edits from the
   same viewer within the backend's collapse window share one version, and the version the
   file had before them is kept.
7. It returns `{"etag": <the response ETag>, "replacements": <count>}`. For Markdown the
   backend may add an `id` to the frontmatter on write; the returned ETag is that of the
   stored file.
8. The edit applies to the file as it is at the call: if the file changed since the agent
   last read it and `old_string` still occurs as required, the edit lands on the current
   text, as a local exact-string edit would.

**`get_file_by_path(drive, path)`** (SPEC-CORE-012): one request,
`GET /api/drives/{drive}/files/by-path?path=<path>`; returns the file as the API does.
`path` is the drive-relative path including the filename.

**Folder tools** (SPEC-CORE-013), one request each, returning the API's response:

| Tool | Request | Arguments |
|---|---|---|
| `create_folder(drive, name, path?)` | `POST /api/drives/{drive}/folders` `{path: path ?? "", name}` | `path` is the parent folder (`""` = drive root), created if missing; `name` the new folder's name |
| `rename_folder(drive, path, new_name)` | `PUT /api/drives/{drive}/folders` `{path, new_name}` | `path` is the folder; `new_name` a name, not a path |
| `move_folder(drive, path, target_path)` | `PUT /api/drives/{drive}/folders/move` `{path, target_path}` | `target_path` is the parent to move into, created if missing; the folder keeps its name |
| `trash_folder(drive, path)` | `DELETE /api/drives/{drive}/folders?path=<path>` | `path` is the folder |

`trash_folder` is the backend's folder delete. Every active file under the folder moves to
trash and stays restorable for 30 days (`restore_file`, `restore_files`); the directory is
left on disk; empty subfolders are forgotten. Afterwards the folder is not listed by
`list_folders`, and `create_folder` with the same name answers 409 because the directory
still exists. It is listed again, as an empty folder, after the next scan (a container
restart or a manual scan) or when the trashed files are purged after 30 days, and with its
files when any of them is restored. Each tool's description says what `trash_folder` does
to the files and that the folder may reappear empty, and says what `path` and
`target_path` mean as in the table.

**Batch tools** (SPEC-CORE-014), one request each, `file_ids` of 1 to 100 ids, returning
the API's response (a count and a per-file `errors` list):

| Tool | Request |
|---|---|
| `move_files(file_ids, target_folder_path, target_drive?)` | `PUT /api/files/batch/move` `{ids, target_folder_path, target_drive}` |
| `copy_files(file_ids, target_folder_path, target_drive?)` | `POST /api/files/batch/copy` `{ids, target_folder_path, target_drive}` |
| `trash_files(file_ids)` | `POST /api/files/batch/delete` `{ids}` |
| `restore_files(file_ids)` | `POST /api/files/batch/restore` `{ids}` |
| `add_tags(file_ids, tags)` | `PUT /api/files/batch/tags` `{ids, tags}` |

- `target_folder_path` is the destination folder (`""` = drive root). `move_files` keeps
  the names and reports a name already taken as a per-file error. `copy_files` gives a copy
  whose name is taken the name `<stem>_copy<ext>`, then `<stem>_copy_2<ext>` and so on (the
  backend's rule); it returns only a count, so its description tells the agent to list the
  target folder to find the copies. `target_drive` is omitted from the body when not given
  (same drive).
- Every `file_ids` entry must match the backend's id shape, 12 characters of
  `[A-Za-z0-9_-]`; zod checks it, because the backend rejects the whole call for one
  malformed id.
- `add_tags` appends to each file's tags (for Markdown the backend writes the frontmatter);
  `update_tags` stays the tool that replaces one file's tags. Its `tags` is 1 to 10 strings.
  The backend validates them for the whole batch: an invalid tag is a 422 for the call, not
  a per-file error.

**Output** (SPEC-CORE-015)

- Every tool that returns JSON text returns `JSON.stringify(value)` with no indentation,
  both through `textResult` and through `textBlock` (the video tools); a string result is
  returned as is.
- `search_files` takes `fields`: `"summary"` (default) or `"full"`. `fields` is consumed by
  the MCP server and not sent to the API. With `"summary"`, each item of `data` keeps only
  `id`, `filename`, `title`, `folder_path`, `file_type`, `mime_type`, `file_size`,
  `duration`, `tags`, `created_at`, `updated_at`, `match_source` (a key the API omits stays
  omitted), and `meta` is unchanged. With `"full"` the response is the API's, unchanged.

### 2. Failure cases

| Tool | What goes wrong | What happens |
|---|---|---|
| `get_file_content` | mime not `text/*` or `application/json` | error result naming the mime; no `/stream` request |
| `get_file_content` | file over 10 MB | error result naming the size and the limit; no `/stream` request |
| `get_file_content` | file over 1 MB without `offset`/`limit` | error result saying to pass `offset`/`limit`; no `/stream` request |
| `get_file_content` | the first requested line exceeds 1 MB | error result naming the line |
| `get_file_content` | the downloaded body exceeds the bound its indexed size passed | error result naming the size; nothing of the body returned |
| `edit_file_content` | `old_string` empty, or equal to `new_string` | error result; no request |
| `edit_file_content` | mime not Markdown/plain, or file over 1 MB | error result; no `/stream` request, no PUT |
| `edit_file_content` | body not valid UTF-8 | error result; no PUT |
| `edit_file_content` | stream response without ETag (the file grew past 1 MB on disk) | error result; no PUT |
| `edit_file_content` | `old_string` not found | error result `old_string not found`; no PUT |
| `edit_file_content` | found more than once, `replace_all` false | error result naming the count and suggesting more context or `replace_all`; no PUT |
| `edit_file_content` | the file changed between the tool's read and its PUT | backend 412; error result `Litloft API error (412): …`; the file keeps the other writer's text |
| `edit_file_content` | the new text exceeds 1 MB | backend 413; error result |
| `get_file_by_path` | no active file at that path in that drive, or a path outside the drive | backend 404 / 400; error result |
| `rename_folder`, `move_folder`, `trash_folder` | the folder named by `path` missing | backend 404; error result |
| `create_folder`, `move_folder` | the parent (`path` / `target_path`) missing | created by the backend; not an error |
| Folder tools | name conflict (including a trashed folder's directory), root path | backend 409 / 400; error result |
| Batch tools | 0 or more than 100 ids, or an id that is not 12 characters of `[A-Za-z0-9_-]` | zod rejects the call; no request |
| `add_tags` | 0 or more than 10 tags | zod rejects the call; no request |
| `add_tags` | a tag the backend rejects | backend 422 for the whole call; error result |
| Batch tools | some files fail (missing, conflict) | the API's count and `errors` list; not an error result |
| Batch tools | an inaccessible `target_drive` | backend 403/404; error result |
| Any tool | Litloft unreachable or slow | existing client error / 30 s timeout; error result |

### 3. States

No new state. Files move between active and trash only through the existing endpoints
(`trash_folder` and `trash_files` to trash, `restore_files` back). After `trash_folder` the
folder's directory remains on disk and is not listed until the next scan, the purge of
its files, or a restore lists it again (see 1.). The MCP server holds no state between
calls.

### 4. Data read and written

- Read through the API: file metadata, file bodies (`/stream`), file by path.
- Written through the API: text file content (`PUT /content`, with If-Match). The backend
  also records an `auto` row in the file's version history, and for Markdown re-derives
  `File.tags` from the frontmatter, its aliases, its `file_relations` links and its
  thumbnail, as it does for any content write. Folders
  (create, rename, move, delete-to-trash); files (batch move, copy, trash, restore, tags).
- The MCP server stores nothing.

### 5. External services

Only the Litloft API, with the client's existing 30 s timeout. A slow or failing call
becomes an error result as for every existing tool.

### 6. Authorization

Unchanged. Every call carries the configured bearer token; the backend checks drive access
for every request (`_validate_drive`, `_get_file_or_404`, `_check_target_drive_access`). The
MCP server adds no check that the backend does not already make.

### 7. Effect on existing features

- `get_file_content` without a range on a Markdown or plain-text file of at most 1 MB returns
  `{content, etag}` as today. Two things change: a file starting with a byte-order mark now
  keeps it as U+FEFF in `content` (today it is dropped), and a refusal is now an error result
  with a one-line message (`isError: true`) instead of a normal result `{"error": "..."}`.
- `requestBytes` returns `etag` in addition to `bytes` and `contentType`; the video tools
  ignore it.
- `update_file_content`, `update_tags`, `move_file`, `trash_file`, `restore_file`,
  `rename_file`, `upload_file` are unchanged and remain. `upload_file` and `add_comment` keep
  returning their own checks as `{"error": ...}`.
- The output of every tool becomes compact JSON: the parsed value is the same, the text is
  not. `search_files`' default item shape changes to the summary.
- The web UI is untouched; it calls the same endpoints.

### 8. Error behavior

Backend failures read `Litloft API error (<status>): <detail>` with `isError: true`, as for
every tool. The checks `get_file_content` and `edit_file_content` make themselves (mime,
size, encoding, missing ETag, occurrences, empty or unchanged `old_string`, an oversized
line) return `isError: true` with a one-line message; zod rejects malformed arguments before
the handler runs. Nothing is logged by the MCP server.

### 9. User-visible behavior

- New tools: `edit_file_content`, `get_file_by_path`, `create_folder`, `rename_folder`,
  `move_folder`, `trash_folder`, `move_files`, `copy_files`, `trash_files`,
  `restore_files`, `add_tags`. Read-only: `get_file_by_path`; the rest are writes.
  Destructive: `edit_file_content`, `rename_folder`, `move_folder`, `trash_folder`,
  `move_files`, `trash_files`. Idempotent: `rename_folder`, `move_folder`, `trash_folder`,
  `move_files`, `trash_files`, `restore_files`, `add_tags`. None is open-world.
- `get_file_content` gains `offset` and `limit`; `search_files` gains `fields`.
- `SERVER_INSTRUCTIONS` and the `update_file_content` description say: change part of a file
  with `edit_file_content`; `update_file_content` replaces the whole file and needs the ETag
  of a full read (a ranged read returns none); large text is read in ranges;
  `get_file_by_path` opens a file by path; `trash_folder` and `trash_files` only move to
  trash.

### 10. Non-functional

- Size: a full read is at most 1 MB of text; a ranged read downloads at most 10 MB and
  returns at most 1 MB.
- Requests: each new tool makes at most 3 API requests per call.
- Batch: at most 100 ids per call, the backend's own limit.
- Tokens: compact JSON and the summary item shape reduce listing output; no field is
  removed from any other tool's output.

## Touch points

- `mcp-server/src/client.ts`: `requestBytes` returns `etag`.
- `mcp-server/src/tools/read.ts`: `get_file_content` (bytes, range, mimes, sizes, refusals),
  `search_files` (`fields`), new `get_file_by_path`.
- `mcp-server/src/tools/write.ts`: new `edit_file_content`; `update_file_content`
  description.
- New `mcp-server/src/tools/folders.ts` (folder tools) and `mcp-server/src/tools/batch.ts`
  (batch tools).
- `mcp-server/src/tools/index.ts`: registration.
- `mcp-server/src/tools/types.ts`: `textResult` and `textBlock` compact JSON.
- `mcp-server/src/tools/video.ts`: unchanged code; its JSON text becomes compact through
  `textBlock`.
- `mcp-server/src/server.ts`: `SERVER_INSTRUCTIONS`.
- `mcp-server/src/__tests__/`: `read.test.ts`, `write.test.ts`, `client.test.ts`,
  `testClient.ts`, `toolMetadata.test.ts`, `videoFrames.test.ts` where it compares text, and
  new test files for the new tools.
- `mcp-server/README.md`: the tool list (new tools; `get_file_content` now any text type,
  ranged; `search_files` `fields`), the sentence that every write tool maps 1:1 onto an
  endpoint (now: every tool except `edit_file_content`, which reads, replaces locally and
  writes with If-Match), and the list of files where tool descriptions live (adds
  `folders.ts`, `batch.ts`, `video.ts`).
- Endpoints used, none changed: `GET /api/files/{id}`, `GET /api/files/{id}/stream`,
  `PUT /api/files/{id}/content`, `GET /api/drives/{drive}/files/by-path`,
  `POST|PUT|DELETE /api/drives/{drive}/folders`, `PUT /api/drives/{drive}/folders/move`,
  `PUT /api/files/batch/move`, `POST /api/files/batch/copy`, `POST /api/files/batch/delete`,
  `POST /api/files/batch/restore`, `PUT /api/files/batch/tags`.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, file state and
  trash, tag editing: Markdown tags live in frontmatter and the backend batch/tags writes
  them), the MCP server's rule of no permanent-delete tool.
- No protected path is edited; no backend file changes.

## Invariants

I1. `get_file_content` without `offset` and `limit` on a Markdown or plain-text file of at
most 1 MB returns `{"content", "etag"}`, where `content` encoded as UTF-8 equals the stored
bytes of a valid UTF-8 file, byte-order mark included, and `etag` is the stream's ETag.
I2. A ranged read returns `"etag": null`; its `content` is exactly the decoded lines
`start_line..end_line`, terminators included, never more than 1 MB as UTF-8; reading a
file range after range from `end_line + 1` rebuilds its decoded text exactly; `total_lines`
is the same for every range.
I3. `get_file_content` makes no `/stream` request for a file whose mime is neither `text/*`
nor `application/json`, nor for one over 10 MB, nor for one over 1 MB when no range is
given.
I4. `edit_file_content` sends a PUT only when the body is valid UTF-8 with an ETag and
`old_string` occurs exactly once, or at least once with `replace_all`; the text it sends
equals the text it read with exactly those occurrences replaced by `new_string` literally
and nothing else changed; a file that is not editable Markdown or plain text gets neither a
`/stream` request nor a PUT.
I5. `edit_file_content`'s PUT carries `If-Match` equal to the ETag of the read in the same
call, so a change made between that read and the PUT is not overwritten.
I6. No tool added here reaches a permanent-delete endpoint (`batch/purge`, `/purge`, trash
empty, missing purge); every file `trash_folder` or `trash_files` removes is in trash and
restorable.
I7. A batch tool given 0 or more than 100 ids, an id not of the backend's shape, or
`add_tags` given 0 or more than 10 tags, makes no request; otherwise it returns a partial
failure as the API's count and `errors`, not as an error result.
I8. Each folder and batch tool sends exactly the method, path, query and body of its row in
the tables, and nothing else: batch bodies carry `ids` (not `file_ids`) and leave
`target_drive` out when not given, `create_folder` sends `path: ""` when `path` is not
given, and `add_tags` reaches only the merging `PUT /api/files/batch/tags`;
`get_file_by_path` sends one GET with the drive URL-encoded in the path and `path` as the
query parameter.
I9. The JSON text of every tool, through `textResult` or `textBlock`, equals
`JSON.stringify(value)` of the value it returned before this change, except where 7.
and I10 say the value changes.
I10. `search_files` never sends `fields` to the API; without `fields` each item has exactly
the summary keys present in the API's item and `meta` is unchanged; with `fields: "full"` the
response is the API's unchanged.

## Checked, no action

- **Reading Office documents** (`.docx`/`.xlsx`/`.pptx`): `GET /api/files/{id}/preview-text`
  stops at 400 characters, so it cannot serve reading. Full text needs a backend or
  intelligence change; it belongs to the intelligence-side spec with PDF page reading.
- **Batch rename** (template / regex modes): a wrong pattern renames up to 100 files at once;
  `rename_file` covers single renames.
- **Retrying `edit_file_content` on 412**: the agent calls it again; it re-reads, so the edit
  is recomputed on the new text. An automatic retry would hide that the file was changing.
- **An `etag` argument on `edit_file_content`** to refuse a file changed since the agent's
  own read: a ranged read has no ETag to pass, and an exact-string match that still occurs
  exactly once is the same guarantee a local exact-string edit gives. One person uses the
  library, so a concurrent writer is rare.
- **Returning the new ids from `copy_files`**: `batch/copy` returns only a count. Looping
  over the single copy endpoint would turn one call into up to 100 requests; the agent can
  list the target folder.
- **More than 10 tags on a file after `add_tags`**: the backend's batch merge has no per-file
  cap, and the web UI's multi-select tagging behaves the same. Changing that is a backend
  change outside this spec.
- **Restoring a trashed folder as a folder**: the backend has no folder restore; files are
  restored one by one or in batches, empty subfolders are not.
- **Editing other text formats** (CSV, JSON, code): the backend's write endpoint accepts
  only Markdown and plain text.
- **YAML, TOML, `.ts`, `.ini`**: core files them as `application/octet-stream`, so they are
  not readable here; changing the mime table is a core change outside this spec.
- **Ranged reads without downloading the whole file**: `/stream` has no line-range parameter;
  the 10 MB cap bounds the download.
- **Encodings other than UTF-8** (Shift_JIS text): reads show U+FFFD where bytes are invalid;
  edits refuse. Legacy encodings are out of scope.
- **`upload_file` and `add_comment` returning `{"error": ...}`**: their own checks keep the
  existing shape; this spec changes only the two tools it reworks.
- **Descriptions and `SERVER_INSTRUCTIONS` wording**: prose for the agent; the required
  content is listed in 1. and 9. and is checked by reading in review. A test pinning prose
  would pin wording, not behavior.
- **Saving agent edits as `explicit` versions**: one kept version per edit would grow the
  history without bound (there is no retention cap), while `auto` already keeps the version
  from before the agent's edits.
- **Annotation sets**: pinned by `toolMetadata.test.ts`, which lists every tool's
  annotations exactly; an invariant would restate that test.
- **Compact output for `semantic_search` / `get_watch_history` item shapes**: only the
  whitespace changes; their fields carry excerpts and progress the agent uses.
- **Permanent delete and purge tools**: excluded, as before.
