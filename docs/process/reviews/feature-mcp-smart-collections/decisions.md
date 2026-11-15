# Decisions

decision:
ran_in_app: yes
at: ae605dee8fc8a2292f469cf78d6229f33497cd2e
by: agent
evidence: |
  MCP clients are the users of this change, so the application was used as an MCP client: the
  `mcp-server/` tree at this commit was built (`pnpm run build`, tsc only) and driven over stdio
  by a script under `.r5/` (`.r5/drive.mjs`) that uses `@modelcontextprotocol/sdk`'s `Client` +
  `StdioClientTransport` to start `node mcp-server/dist/index.js` with
  `LITLOFT_BASE_URL=http://127.0.0.1:4599` and `LITLOFT_API_TOKEN=r5`. 4599 was a small logging
  proxy inside the same script in front of the litloft stack at
  `http://video-share-mcp-smart.localhost:3101`; it recorded every outgoing method/URL/status/body,
  so the request the tools actually sent (not only the answer) is part of the evidence. Each call's
  arguments, full result and recorded requests are saved as JSON in
  `docs/process/reviews/feature-mcp-smart-collections/r5/` (files cited per item below). The stack
  was already running with the intelligence addon and was not started, rebuilt, restarted or
  stopped; nothing named `data`, `drives.json`, `passwords.json` or `.env` was created. Drive
  membership was read with `GET /api/drives`: `動画` (850 files; `type:video` 518, audio 53,
  image 61) and `テスト画像` (0 files, 2 collections + 1 Smart Collection). Extra data was created
  through the app's own HTTP API (`POST /api/drives/動画/smart-folders`): `All Videos`
  (`fIQkLAB3Focg`, `type:video`, 518 members), `Case Check` (`Hig9iGBSlFea`, `tag:あんこ`, 8),
  `Empty Smart` (`hnCsecxeZOVi`, `tag:zzz-nonexistent-r5`, 0) and `Semantic Dogs`
  (`Q4lMIohs3UCH`, free text `犬`, 22, meaning-search hits). Pre-existing: Smart Collection
  `あんこ動画` (`iJoo9-NqbcRO`, `tag:あんこ type:video`, 8) and collection `Spirit`
  (`bG77f6xG21ju`, 50 audio files). The browser side was driven with the frontend's Playwright
  1.58.2 (headless Chromium, 1280x900, `.r5/pages.mjs`).

  1. `list_collections` (r5/02-list-collections-movie.json, 03-list-collections-images.json,
     17-list-collections-unknown-drive.json). 動画 answered one list of 6 rows:
     `All Videos`(smart), `Case Check`(smart), `Empty Smart`(smart), `Semantic Dogs`(smart),
     `Spirit`(collection), `あんこ動画`(smart); sorted in node with
     `new Intl.Collator("ja", { numeric: true })` gave the same 6 names in the same order. Every
     Smart row had exactly `id, name, kind: "smart", query, file_type`. Collection rows were
     compared key by key with the core `GET /api/drives/動画/collections`: the row differs from
     the core's only by `kind: "collection"` (all values equal). テスト画像 answered 3 rows in
     the same shape (`apple`, `画像` collections and `船の画像` smart). `drive: "nosuchdrive"`
     returned `isError` `Litloft API error (404): Drive not found: nosuchdrive` — no partial list.
     The name tie rule (collection before Smart Collection) could not be produced: the core
     refuses a duplicate name case-insensitively within the drive (a `POST .../collections`
     with `{"name":"case check"}` answered 409 `Name already in use`).
  2. `get_collection`.
     - Collection `Spirit` (04, 09b): result equals the core `GET .../collections/bG77f6xG21ju`
       plus `kind: "collection"` and `inactive_count`, 50 items, item keys `{item_id, position,
       file}` as before. Passing `offset: 5, limit: 2` changed nothing (same 50 items from
       position 0), i.e. paging is ignored for a collection.
     - Smart Collection default page (05, `あんこ動画`): `{id, name, kind: "smart", query,
       file_type, complete: true, total: 8, offset: 0, items}` with `items[i] = {position, file}`,
       positions 0..7, summary files. (21, `All Videos`, no limit given): 50 items, positions
       0..49, `total: 518` — the default limit is 50.
     - Paging (06, 06b): `offset: 200, limit: 200` gave positions 200..399 and `offset: 400,
       limit: 200` gave 400..517 (118 items), contiguous, `total: 518` in both and in 21;
       `offset: 600` (20) gave `items: []` with `total: 518`, not an error.
     - `fields: "full"` (07): each item file carried the whole object (`thumbnail_url`,
       `deleted_at`, `missing_since`, `trust_tier`, …) instead of the summary.
     - `limit: 201` (08) was rejected before any request, with the MCP input-validation error for
       `limit` (`Number must be less than or equal to 200`), `isError: true`.
     - Unknown id (09): `isError` `Litloft API error (404): Collection not found`. An id from the
       other drive behaved the same (18 collection id, 19 Smart Collection id).
     - Compared with the search page (`.r5/pages.mjs`, 15-search-pages.json, compare-page-*.json,
       page-*.png): `/drive/動画/search?q=<query>&smart_folder_id=<id>` opened in Chromium showed
       `8 items` / `8 items` / `518 items` / `22 items` for `あんこ動画`, `Case Check`,
       `All Videos` and `Semantic Dogs`; the anchor order bled from the DOM matched the endpoint's
       member ids exactly, item for item, in all four (full list for the three small ones and the
       first 30 rendered cards of `All Videos`, out of 518). The meaning-search one
       (`Semantic Dogs`, 22) matched too.
  3. `ask` (10, 11, 12, 13, 14b, 15; the request bodies are in the same files' `requests`).
     - `scope.collections: ["CASE CHECK"]` (10; saved name `Case Check`): the tool made
       `GET .../collections`, `GET .../smart-folders` and one
       `GET /app-api/smart-collection-members?...&id=Hig9iGBSlFea&ids=1`, then sent
       `{"query": ..., "scope": {"collections": [], "file_ids": ["BVtZs91FE2MA", "tSS4ETXxZ_wh",
       "e9uRhYYj2J25", "k3XIn8mHqLcw", "TNyTHMPpR09J", "e0RSMoRXeePU", "3edLwzf0sYZI",
       "FuHJi4Mbg-vp"]}}` — the members' ids, the typed name nowhere. Result (non-error,
       LLM answered): `smart_collections: [{name: "Case Check", member_count: 8}]` (the saved
       spelling, not `CASE CHECK`), `scope.matched_file_count: 8`, and all five
       `sources.sources` ids are members of `Case Check`.
     - A collection name alone (11, `Spirit`): `GET .../collections` + `GET .../smart-folders`,
       no Smart Collection endpoint call, and the body was `"scope": {"collections": ["Spirit"]}`
       unchanged; `scope.matched_file_count: 50`, the five sources are all in `Spirit`, and the
       result has no `smart_collections` key.
     - Zero members (12, `empty smart`): one `ids=1` evaluation, body
       `"scope": {"collections": [], "file_ids": []}`; result `answer: ""`,
       `done.scope_empty: true`, `scope.matched_file_count: 0`,
       `smart_collections: [{name: "Empty Smart", member_count: 0}]`, non-error.
     - No scope (13): only `POST /api/addons/intelligence/ask`, no collection or Smart Collection
       request, body `{"query": ...}` with no `scope` — unchanged.
     - Caller `file_ids` plus a Smart name (14b, `file_ids: ["YwOS8eJjBiTH"]` + `case check`):
       body carried 9 ids, the caller's id first then the 8 members, de-duplicated.
     - The same Smart name twice in another case (15, `["Case Check", "case check", "spirit"]`):
       a single `ids=1` evaluation for the two spellings, body
       `"scope": {"collections": ["spirit"], "file_ids": [8 ids]}`.
     - More than 10,000 members cannot exist here: the whole drive holds 850 files, so the largest
       reachable scope (e.g. `type:video` merged with anything) is 850 ids; no data exists in this
       environment to reach the cap.
     - Timeouts observed in this environment, reported as seen: ask calls 14b and 15 returned
       `isError` `The operation was aborted due to timeout` after their requests had been sent, and
       the intelligence log shows `POST /ask` 200 roughly 120 s after each; the local answer model
       ran past Ask's 120 s timeout. The first 10 attempt failed only in my harness, the SDK
       client's default 60 s request timeout (saved as 14-askcall-file-ids-and-smart.json); rerun with
       a 300 s client timeout, 10 answered as described.
  4. Descriptions (01-tools-list.json, 01b-server-instructions.json). `list_collections` says a
     Smart Collection is a saved search whose items are computed when read and that every row
     carries `kind`. `get_collection` says a Smart Collection returns `{ total, offset, complete,
     items }`, is paged with `offset`/`limit` (default 50, at most 200) and that `complete: false`
     means meaning search could not be read. `ask`'s schema declares `scope.file_ids` ("an
     optional list of strings") and its description says a Smart Collection name may be given in
     `collections`, that its members are combined with the named collections as one collection
     condition, and that `file_ids` is sent when a name was replaced. The server instructions say
     a Smart Collection is a saved search whose items are computed when read, that `get_collection`
     pages them with offset and limit, that `complete: false` means meaning search could not be
     read, and that `ask` accepts Smart Collection names in `scope.collections`.
  5. Endpoint directly with curl (16-endpoint-curl.txt). Missing `id` (and no params at all) →
     400 `{"detail":"drive and id are required"}`; `offset=-1` and `limit=abc` → 400
     `{"detail":"offset and limit must be non-negative integers"}`; `id=unknownid99` → 404
     `{"detail":"Smart collection not found"}`; `drive=nosuchdrive` → 404
     `{"detail":"Drive not found: nosuchdrive"}` (the backend's own body, same status). With the
     endpoint directly: `ids=1&offset=6&limit=3` answered `ids` (3 ids) in place of `files`;
     `offset=600` answered `total: 518, files: []`. Every endpoint request the MCP server sent
     carried `Authorization: Bearer r5` and no `Cookie` (an MCP client sends none). A locked drive
     is not available here: there is no `passwords.json` in this tree and every drive is public, so
     the 404/401 of a locked drive, and the cookie/credential half of the forwarding (the proxy sees
     only the MCP to frontend hop, not the frontend to backend hop), could not be produced.
pending: None of PROJECT.md's `agent_cannot_verify` items is involved (no real device, home-LAN
  playback, audio/video perception or third-party service). Left to a human or a later run: a
  locked or expired-credential drive through the endpoint (all drives are public here, no
  `passwords.json`); the `complete: false` answer (meaning search or addon status unreadable — the
  running addon was not to be stopped); the over-10,000 refusal (this drive holds 850 files); the
  30 s / 120 s per-call timeouts and the older-server "no Smart Collection endpoint" 404 message
  (both need a failure the environment cannot produce without taking the stack down or swapping
  the build); the collection-before-Smart-Collection name tie (the core rejects a same-named
  collection, case-insensitively, in the same drive).
