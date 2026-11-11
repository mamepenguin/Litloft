# The MCP video tools name a .loft reference's URL

SPEC-ID: SPEC-CORE-021

Approval: sha256:e6f6f24f2ff8ab56b128db67e6917f844890d4fe02bc66d435dd2c7794ae3e75 Yuichi Senga 2026-10-30

## Summary

An agent using the Litloft MCP server cannot learn the URL a `.loft` file points to.
`get_file_content` reads only `text/*` and JSON mimes, and a `.loft` is
`application/vnd.litloft.loft+json`; `get_video_frame` and `list_video_scenes` answer a
`.loft` with `<file_id> is a .loft reference; it has no local video to read frames from`
and nothing else. This change makes both video tools read the `.loft` file through the
existing core stream endpoint and put its URL in that error, so the agent can hand the URL
to whatever tool it has for the provider. Only `mcp-server/src/tools/video.ts`, its tests
and the MCP README change; the backend and the addons are not touched.

- SPEC-CORE-021: on a `.loft` file, `get_video_frame` and `list_video_scenes` return an
  error result that names the `.loft` file's URL.

## Required items

### 1. Normal flow

For both `get_video_frame(drive, file_id, t, size?)` and
`list_video_scenes(drive, file_id, start_time?, end_time?)`:

1. The tool reads `GET /api/files/{file_id}` (core), as today.
2. When `mime_type` is not `application/vnd.litloft.loft+json`, nothing changes: the tool
   continues exactly as before this change.
3. When it is the `.loft` mime, the tool reads `GET /api/files/{file_id}/stream` (core)
   through `client.requestRaw`, with no `Range` header and no `X-Lit-Drive` header (the
   core route authorizes by file id and the bearer token, like `GET /api/files/{id}`).
4. The tool parses the body as JSON. A `.loft` file is
   `{"provider": "...", "url": "..."}` (`docs/addons/media-import.md`).
5. When the parsed value is an object whose `url` is a non-empty string, the tool returns
   an error result with the single text
   `<file_id> is a .loft reference to <url>; it has no local video to read frames from`,
   `<url>` copied exactly as stored. `provider` is not read; the text is the same for
   `youtube`, `vimeo`, `soundcloud` and `generic`, and names no other tool.
6. No request is sent to `/api/addons/intelligence/` for a `.loft` file, as before.

### 2. Failure cases

| Step | What goes wrong | What the tool does |
|---|---|---|
| 1 | Core file read fails | Unchanged: `Litloft API error (<status>): <detail>` |
| 3 | Stream read fails (404 file not on disk, 410 missing, any other HTTP error, network error, timeout) | Returns the previous message, `<file_id> is a .loft reference; it has no local video to read frames from` |
| 4 | Body is not valid JSON | Same previous message |
| 5 | JSON is not an object, has no `url`, or `url` is not a non-empty string | Same previous message |

The fallback keeps the tool's answer to a `.loft` at least as good as before this change;
a failure to read the URL is never reported as a Litloft API error, because the file
itself was found and is still a `.loft`.

### 3. States

None: the tools hold no state. The two outcomes for a `.loft` are "URL found" (step 5)
and "URL not found" (the fallback).

### 4. Data read and written

- Read: the core file record (`GET /api/files/{id}`, unchanged) and the `.loft` file's
  bytes on disk (`GET /api/files/{id}/stream`, new for `.loft` only).
- Written: nothing. The stream route writes no watch history and no cache.

### 5. External services

None outside Litloft. The stream read is one more core request with the client's existing
30 s timeout; when it is slow or down, the tool falls back as in item 2.

### 6. Authorization

Unchanged. Both core requests carry the configured bearer token; the stream route applies
the same `unlocked_groups` check as the file read, so a `.loft` the token can see in step 1
can be read in step 3. The URL goes only to the MCP client that already holds that token.

The `drive` argument is not compared with the file's drive on the `.loft` path. A native
video gets 404 from the intelligence proxy when `drive` is accessible but not the file's;
a `.loft` returns its URL either way. The core file read in step 1 already answers by file
id alone, so the URL tells the caller nothing the same token could not read through
`get_file` and the web UI, and no data crosses from one drive into another.

### 7. Effect on existing features

- Native videos: no change in requests or results.
- The two existing `.loft` tests, `SPEC-CORE-008: a .loft reference is an error and no
  frame is requested` and `SPEC-CORE-009: a .loft reference is an error and no intelligence
  request is sent`, give the fake client no `requestRaw`, so the stream read throws and the
  tools take the fallback, whose text they already assert. They stay as they are and keep
  their SPEC-IDs: they now cover the fallback and SPEC-CORE-008/009 I10. Every new test for
  this spec's behavior cites SPEC-CORE-021.
- SPEC-CORE-008/009 I10 (`.loft` → error result, no intelligence request) still holds.
- The stream route is not changed; the web UI's use of it is unaffected.

### 8. Error behavior

The agent sees the error text of item 1 step 5 or the fallback text. Nothing is logged by
the MCP server, as for every other tool error.

### 9. User-visible behavior

- The `.loft` error text gains ` to <url>` after `.loft reference`.
- `get_video_frame` description: its last sentence, `a .loft reference has no frames.`,
  becomes `a .loft reference has no frames, and the error gives its URL.`
- `list_video_scenes` description: gains the same sentence after `Native videos indexed by
  the intelligence addon only;`.
- `mcp-server/README.md`: the two tool rows gain `; for a .loft, the error gives its URL`.
- Descriptions and README are prose: no invariant pins their wording.

### 10. Non-functional

- One extra core GET per `.loft` call; a `.loft` is under 1 KB.
- Privacy: the URL is already readable by the same token through the web UI.

## Touch points

- `mcp-server/src/tools/video.ts`: the `.loft` branch of both handlers, the error text, the
  two tool descriptions.
- `mcp-server/src/__tests__/videoFrames.test.ts`: the existing `.loft` test and new tests.
- `mcp-server/README.md`: the `get_video_frame` and `list_video_scenes` rows.
- Endpoint read (not changed): core `GET /api/files/{file_id}/stream`.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary: no drive
  header is sent and nothing crosses drives).
- No protected path is edited.

## Invariants

I1. Either tool on a `.loft` file whose stream body is a JSON object with a non-empty string
`url` returns an error result whose content is exactly one text block,
`<file_id> is a .loft reference to <url>; it has no local video to read frames from`, with
`<url>` identical to the stored value whatever the `provider`.
I2. Either tool on a `.loft` file whose stream read fails for any reason, whose body is not
JSON, or whose JSON has no non-empty string `url` returns an error result whose content is
exactly one text block, `<file_id> is a .loft reference; it has no local video to read
frames from`.
I3. On a `.loft` file, the requests either tool sends are exactly `GET /api/files/{file_id}`
followed by `GET /api/files/{file_id}/stream`; none goes to `/api/addons/intelligence/`.
In `get_video_frame` the `.loft` check runs before the duration check, so a `.loft` never
gets the past-the-end error.
I4. On a file whose mime is not the `.loft` mime, neither tool requests
`/api/files/{file_id}/stream`, and its requests and result are the same as before this
change.
I5. A `.loft` result never contains an image block and is never reported as
`Litloft API error`, whatever the stream read returns.
I6. A `.loft` call returns the same result whatever `drive` argument is passed.

## Checked, no action

- **A hint naming a follow-up tool** (for example a YouTube frame tool in another MCP
  server): left out by the user's decision. The URL alone is enough for the agent, and
  this server does not know which other tools the client has.
- **Reading `provider`**: not needed when no hint depends on it.
- **Making `get_file_content` read the `.loft` mime**: the request names the video tools,
  where an agent meets the `.loft`; widening the content allowlist is a separate change.
- **Validating the URL's scheme or host**: the `.loft` is written by media_import, and the
  personal-tool threat model has no crafted input.
- **Capping the stream body size**: a file carrying the `.loft` mime is written by
  media_import and is under 1 KB.
- **Returning the URL as a success result**: the tools still cannot do what was asked, so
  the result stays an error; the URL is the help it carries.
- **`SERVER_INSTRUCTIONS` in `mcp-server/src/server.ts`**: its video paragraph tells the
  agent how to look at a video; the `.loft` case is met through the error itself, which
  now carries what the agent needs. Left unchanged.
- **Two-request worst case**: a `.loft` call can take up to about 60 s (two 30 s core
  timeouts) when core hangs; the same hang already fails every other tool.
- **`docs/addons/media-import.md` and `docs/addons/intelligence.md`**: neither describes
  the MCP error text.
