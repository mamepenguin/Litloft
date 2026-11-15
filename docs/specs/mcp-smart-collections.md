# MCP reads Smart Collections

SPEC-ID: SPEC-CORE-111
SPEC-ID: SPEC-CORE-112

Approval:

## Summary

The MCP server can list and read collections but not Smart Collections (saved searches),
and its `ask` tool cannot scope a question to one. A Smart Collection's members are what
its search page lists (SPEC-CORE-109): the core listing merged with the intelligence
addon's meaning search, computed today only in the browser by `evaluateSmartCollection`
(`frontend/src/lib/smartCollectionEval.ts`). The backend cannot compute them (no
core-to-addon dependency), and copying the evaluation into the MCP server would keep two
implementations in step.

So the frontend server gets one endpoint that runs the same `evaluateSmartCollection` on
the server, with the caller's own credentials, and the MCP server calls it.

- **SPEC-CORE-111**: `GET /app-api/smart-collection-members` on the frontend server.
- **SPEC-CORE-112**: MCP `list_collections`, `get_collection` and `ask` cover Smart
  Collections.

No screen changes; no design artifact.

## Required items

### 1. Normal flow

**SPEC-CORE-111 (the endpoint).**

1. A Next.js route handler at `frontend/src/app/app-api/smart-collection-members/route.ts`
   answers `GET /app-api/smart-collection-members?drive=<drive>&id=<smart folder id>`
   with optional `offset` (default 0), `limit` (default all) and `ids=1` (answer member
   ids instead of files). The path is static and
   outside `/api`, so the `/api/:path*` rewrite to the backend never takes it (Next
   applies array rewrites before dynamic routes), and `server.js` passes it to Next like
   any non-`/api` path.
2. Every request it makes carries the incoming `Cookie` and `Authorization` headers
   unchanged, goes to the backend's public `/api` at `BACKEND_URL` (default
   `http://backend:8000`), and never to `/api/internal/*`. The `/api` rewrite in
   `next.config.ts` stays hard-coded and does not follow `BACKEND_URL`; the two agree only
   while `BACKEND_URL` is unset, which is the default. The request's abort signal aborts them when the caller disconnects.
3. It looks the Smart Collection up with `GET /api/drives/{drive}/smart-folders` and finds
   the id.
4. It evaluates it with `evaluateSmartCollection`: the saved query and `file_type`, sort
   relevance, order desc, scene search off. The server `io` shares with the browser both
   halves of each exchange: the request builder (listing query string, meaning-search
   parameters and headers, addon-status URL) and the response reader (how a listing page,
   a meaning-search answer, including `available: false` and its HTTP status, and an
   addon-status answer are read). The browser functions (`getDriveFiles`,
   `fetchSemanticHits`, `getSemanticAvailability`) call the same builders and readers.
   The server `io` does not use the browser's module-level caches (`addons.ts`) or
   `seedFiles`: every endpoint request reads the addon status afresh.
   The shared listing reader throws the existing `ApiStatusError` (`lib/apiError.ts`)
   carrying the HTTP status for a non-2xx answer, with the same message the browser's
   error carries today; a network failure stays the `TypeError` `fetch` throws. The
   browser's `seedFiles` call and the status cache's rules stay where they are. Nothing
   browser-only (`window`, `localStorage`, `fileSeed`) enters the route handler's imports.
5. It answers 200 with `{ id, name, query, file_type, complete, total, files }`: `total` is
   the evaluated member count, `files` the `FileItem`s from `offset` for `limit`, in
   order. With `ids=1` it answers `ids` (the member ids, from `offset` for `limit`) in
   place of `files`. `complete` is the evaluation's.

**SPEC-CORE-112 (MCP).**

1. `list_collections(drive)` returns one list: the drive's collections (each row exactly
   as today plus `kind: "collection"`) and Smart Collections (exactly
   `{ id, name, kind: "smart", query, file_type }`), in
   `Intl.Collator("ja", { numeric: true })` name order, ties by kind (collection first)
   then id in code-unit order. Either source failing returns `isError` with that error; no
   partial list.
2. `get_collection(drive, collection_id, fields?, offset?, limit?)` (`offset` an integer
   ≥ 0, `limit` an integer 1–200; other values are rejected by the schema) asks the collection
   endpoint first. On its 404 it asks `GET /api/drives/{drive}/smart-folders` for the id;
   any other error from either is returned as today. For a Smart Collection it calls the
   endpoint with `offset` (default 0) and `limit` (default 50, at most 200) and returns
   `{ id, name, kind: "smart", query, file_type, complete, total, offset, items:
   [{ position, file }] }`, `position` the member's index from 0 in the whole list, `file`
   the `search_files` summary by default and the whole object with `fields: "full"`.
   Neither found: `isError` with `Litloft API error (404)`. A collection id answers exactly
   as today plus `kind: "collection"`; `offset` and `limit` are ignored for it.
3. `ask`'s `scope.collections`:
   - Absent or empty: the request is sent exactly as today, with no extra request.
   - Otherwise the tool reads the drive's collections and Smart Collections. Each name is
     matched after `toLowerCase()` against the collections first, then the Smart
     Collections. Smart Collection names are evaluated one after another, in the order
     given, a name repeated in another case once, through the endpoint with `ids=1`, and
     replaced by the members' ids; other names stay in `collections` (an empty list when
     none stay). The ids are appended to any `scope.file_ids` the caller passed, then
     de-duplicated keeping the first occurrence. When at least one name was replaced,
     `file_ids` is always sent, `[]` included.
   - `scope.file_ids` is declared in the tool's schema: an optional list of strings. The
     description says Smart Collection names may appear in `collections` and that a
     Smart Collection's members are combined with the named collections as one
     collection condition.
   - Failures, each `isError` with no Ask request sent:
     - either list cannot be read: the client's error, as today;
     - an evaluation answers non-2xx: the client's error;
     - an evaluation is not `complete`:
       `Smart Collection "<name>" could not be read completely (meaning search unavailable); nothing was asked.`;
     - more than 10,000 ids in the final `file_ids`:
       `The scope holds <n> files; at most 10,000 can be asked about. Nothing was asked.`
   - The result gains `smart_collections: [{ name, member_count }]` for each Smart
     Collection that was replaced, once each, in the order first given; it is absent when
     none was.
4. Timeouts: each endpoint call made by `get_collection` uses the client's default timeout
   (30 s); each made by `ask` uses 120 s (Ask's own timeout), per call. `client.request`
   gains an optional per-call timeout for this. A timeout is reported as the client
   reports one today.
5. An older Litloft without the endpoint answers its path with a non-JSON 404. The MCP
   tools report that as `isError` with
   `This Litloft server has no Smart Collection endpoint; update Litloft.`
6. Tool descriptions and the server instructions say a Smart Collection is a saved search
   whose items are computed when read, that `complete: false` means meaning search could
   not be read, that a Smart Collection's items are paged with `offset` and `limit`, and
   that `ask` accepts Smart Collection names in `scope.collections`.

### 2. Failure cases

The endpoint:

| Case | Status | Body |
|---|---|---|
| `drive` or `id` missing | 400 | `{"detail": "drive and id are required"}` |
| `offset` or `limit` not a non-negative integer | 400 | `{"detail": "offset and limit must be non-negative integers"}` |
| the smart-folders lookup answers non-2xx (404 for a locked or unknown drive, 401 for an expired token, 5xx) | the same status | the backend's body |
| the id is not among the drive's Smart Collections | 404 | `{"detail": "Smart collection not found"}` |
| a listing page answers non-2xx (a drive locked between pages included) | 404 when it answered 404, else 502 | `{"detail": "Smart collection listing failed"}` |
| the backend unreachable (a `TypeError` from `fetch`) | 502 | `{"detail": "Backend unreachable"}` |
| any other error during the evaluation (a non-JSON 200 included) | 500 | `{"detail": "Smart collection evaluation failed"}` |
| meaning search or the addon status cannot be read | 200 | `complete: false` |

The MCP tools report any non-2xx as the client does today: `isError` with
`Litloft API error (<status>)` and the body's `detail`.

### 3. States

Stateless. Each endpoint request evaluates afresh; nothing is cached on the server, and a
later page of `get_collection` evaluates again, so members that change between pages can
shift.

### 4. Data read and written

Read only, through the backend's public API: smart folders, the drive listing, the addon
status and the addon's search. Nothing is written.

### 5. External services

None outside Litloft. A slow backend or addon makes the endpoint slow; the endpoint adds no
timeout of its own and stops when its caller disconnects (1, step 2).

### 6. Authorization

The endpoint has no access logic of its own: every call carries the caller's `Cookie` and
`Authorization` unchanged, so the backend's drive checks decide, exactly as for the
browser. It never calls the Internal API and adds no secret.

### 7. Effect on existing features

- Every caller of `getDriveFiles`, `appendListingFilters`, `fetchSemanticHits` and
  `getSemanticAvailability` (folder views, shelves, search, meaning mode, Play, Ask) keeps
  sending the same requests and reading the answers the same way; only where the builders
  and readers live changes. The browser's status cache keeps its rules (a cached failure
  is asked again; `invalidateAddonsCache` clears it).
- MCP `list_collections` changes order and gains rows and `kind`; `get_collection` gains
  `kind` and, for Smart Collections, paging; `ask` reads two lists when `collections` is
  non-empty. See Revises.
- The frontend server gets its first route handler.

### 8. Error behavior

Covered in 2. The endpoint logs nothing new.

### 9. User-visible behavior

For MCP clients only: the tool outputs and descriptions in 1. Docs: `mcp-server/README.md`
(the tools), `docs/reference/api.md` (the endpoint, marked as served by the frontend),
`docs/reference/env-variables.md` (`BACKEND_URL` is also the upstream of the frontend's
`/app-api` endpoint, while the `/api/*` rewrite stays hard-coded to `http://backend:8000`).

### 10. Non-functional

An evaluation reads every listing page (500 per page) and one meaning-search request, as
in the browser. `get_collection` pages its output (at most 200 items a call); `ask` reads
members as ids only (`ids=1`), about 15 bytes each, and caps `file_ids` at 10,000.

## Touch points

- `frontend/src/app/app-api/smart-collection-members/route.ts` (new) and its tests in
  `frontend/src/app/app-api/__tests__/` (vitest with `// @vitest-environment node`)
- `frontend/src/lib/smartCollectionEval.ts` (unchanged API), `frontend/src/lib/api.ts`,
  `frontend/src/lib/semanticSearch.ts`, `frontend/src/lib/addons.ts` (builders and readers
  moved out), a new server `io` module under `frontend/src/lib/`, their tests
- `frontend/server.js`, `frontend/server-routes.js`, `frontend/src/proxy.ts` (read only:
  the path reaches Next)
- `mcp-server/src/tools/collections.ts`, `mcp-server/src/tools/ask.ts`,
  `mcp-server/src/server.ts`, `mcp-server/src/client.ts` (a per-call timeout) and
  `client.test.ts`, mcp-server tests
- `mcp-server/README.md`, `docs/reference/api.md`, `docs/reference/env-variables.md`
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, no
  core-to-addon dependency, the Internal API not reachable from outside),
  `.claude/rules/frontend-conventions.md`
- No protected path is edited.

## Invariants

I1. For a Smart Collection, the endpoint's `total`, `complete` and full member list equal,
in order, what `evaluateSmartCollection` returns in the browser for the same answers with
its saved query and type, relevance and scene search off, including meaning search
answering 404 (complete, listing only), 5xx or `available: false` (incomplete) and the
addon status failing (incomplete); `offset` and `limit` slice that list.

I2. Every request the endpoint sends carries the caller's `Cookie` and `Authorization`
unchanged and goes to `BACKEND_URL` + the public `/api`; none goes to `/api/internal/*`;
aborting the incoming request aborts the request in flight; the statuses and bodies are
those of the Failure cases table.

I3. The endpoint and the browser build the listing, meaning-search and addon-status
requests with the same functions and read their answers with the same functions; two
consecutive endpoint requests each send their own addon-status request.

I4. `list_collections` returns collections (rows unchanged apart from `kind`) and Smart
Collections (exactly `id`, `name`, `kind`, `query`, `file_type`) in one
`Intl.Collator("ja", { numeric: true })` order, collection before Smart Collection on a
tie, then id; or `isError` when either source fails.

I5. `get_collection` on a collection id answers exactly as before plus `kind`; on a Smart
Collection id it returns `total`, `offset`, `complete` and at most `limit` (default 50,
at most 200) `items` whose `position` is the index in the whole list, summarised unless
`fields: "full"`, and no `inactive_count`; on neither, or a locked drive, `isError` with
`Litloft API error (404)`.

I6. MCP `ask` with an absent or empty `scope.collections` sends the request unchanged
with no other request; otherwise a name matching a collection (case-insensitively) stays
in `collections`, a name matching only a Smart Collection is never sent there, its
members' ids are appended to `file_ids` and de-duplicated keeping the first occurrence,
`file_ids` is sent (even `[]`) whenever a name was replaced, and the result lists each
replaced Smart Collection once in `smart_collections` with its member count; a list
failure, an incomplete or failed evaluation, or more than 10,000 ids sends no Ask request
and returns `isError` with the stated text.

I7. Every browser caller of the moved builders and readers sends the same requests and
reads the same answers as before (a failed listing still throws with the same message),
`getDriveFiles` still seeds the file cache, and the browser's addon-status cache keeps its
rules.

I8. `get_collection`'s endpoint calls use a 30 s timeout and `ask`'s use 120 s each; an
endpoint missing on the server (a non-JSON 404) is reported with the update message; the
tool descriptions and server instructions mention Smart Collections, `complete`, paging
and Smart Collection names in `ask`.

## Revises

SPEC-CORE-045 I9. The MCP `ask` tool forwards `scope` in the body unchanged when `scope.collections` is absent or empty; otherwise names in `scope.collections` that name a Smart Collection (and no collection) are replaced by its members' ids appended to `scope.file_ids`; it returns `isError` when it sent `scope` and the stream has no `scope` event, or when the collection lists cannot be read or a Smart Collection's evaluation fails, is incomplete or the ids exceed 10,000, and returns a non-error result with an empty `answer` and `matched_file_count: 0` when `done` has `scope_empty: true`.
SPEC-CORE-038 I7. For a collection id, `get_collection` lists exactly the items whose file is neither trashed nor missing (a missing state key counts as null), in the core's order, and `inactive_count` plus the number of listed items equals the collection's item count; for a Smart Collection id it returns a page of its evaluated members as `items: [{ position, file }]` with `total`, `offset` and `complete` and no `inactive_count`.
SPEC-CORE-038 I12. `list_collections` returns the drive's collections, each row as the core returns it plus `kind: "collection"`, and its Smart Collections as `{ id, name, kind: "smart", query, file_type }`, in one `Intl.Collator("ja", { numeric: true })` name order. `get_collection` returns each collection item as `{ item_id, position, file }` with `item_id` the core item's `id`, `file` the `search_files` summary by default and the whole file object with `fields: "full"`, and answers another drive's collection with the core's 404 as `isError`. `list_collections` and `get_collection` carry `readOnlyAnnotations`; `get_collection` never sends `fields` to the core; the server instructions name both tools; the `move_file` and `move_files` descriptions say a cross-drive move removes the file from the old drive's collections.

## Checked, no action

- Copying the evaluation into the MCP server: rejected (two implementations, and the
  copies would fall under the MCP server's coverage floors); the human chose the endpoint.
- Computing members in the backend: it cannot run meaning search (no core-to-addon
  dependency); leaving it out would return fewer members than the page.
- Putting the endpoint under `/api`: the `/api/:path*` rewrite to the backend runs before
  dynamic routes, and a backend path of the same name later would collide.
- A sort or scene-search argument on the endpoint or the MCP tools: the saved definition
  with relevance is what a Smart Collection means outside its page.
- Caching evaluations on the server, or a stable snapshot across `get_collection` pages:
  members change; each read is fresh, and the shift between pages is accepted.
- The browser using the new endpoint instead of evaluating itself: unchanged; it already
  has the evaluation.
- MCP `search_files` reading Smart Collections: not asked.
- `X-Lit-Viewer`: Smart Collections and listings are not per viewer; it is not forwarded.
- Evaluating several Smart Collection names concurrently in `ask`: one after another
  keeps the load on the backend predictable; the worst case is one 120 s budget per name.
- A response-size limit on the endpoint: `get_collection` pages and `ask` reads ids only.
