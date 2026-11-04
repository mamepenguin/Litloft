# Decisions

decision:
ran_in_app: yes
at: 371da39a9b0c70b831cb215e4413d31d815a1a1d
by: agent
evidence: |
  Application: `LITLOFT_PORT=3993 docker compose -p litloft-r5-d1 -f docker-compose.yml
  -f .r5/override.yml up -d --build backend frontend intelligence`; all three containers
  started, backend healthy. Browser: Playwright (Chromium) at http://localhost:3993 with
  `NEXT_LOCALE=ja`; scripts under `.r5/d2-*.mjs`, screenshots under
  `docs/process/reviews/feature-source-sets/shots/d2-*`.

  1. Cross-drive move (collection of 3). Created "R5 セット" from the sidebar; added
  Lecture-again, Lecture, Clip in that order through each file's ファイル操作 →
  コレクションに追加. Collection page showed 3 items in that order
  (d2-1-collection-three-items.png). Cut Lecture on its file page; switched to archive;
  pasted at the archive library root (`/drive/archive`). The web move dialog offers only
  folders of the current drive, so the cross-drive move is the documented Cut → switch
  drive → Paste path (docs/user-guide/upload-and-fileops.md), not the move dialog. After
  the move the collection page listed exactly Lecture-again then Clip (2件, sidebar count
  2), in their old order (d2-2d-collection-after-move.png). Moving Lecture back to scratch
  by the same path left the collection at the same two items: the file did not return
  (d2-3c-collection-after-move-back.png); scratch held 6 files again.
  2. Within-drive move. Created folder "moved-here" in scratch and moved Lecture-again into
  it with ファイル操作 → 移動 → moved-here → ここに移動. The collection still listed
  Lecture-again then Clip, 2件, unchanged (d2-4e-collection-after-within-move.png,
  d2-4g-folder-clicked.png).
  3. Internal API from `docker compose ... exec backend curl`:
  `GET /api/internal/collections/7691nAkjYnlm/file-ids?drive=scratch` with
  `x-internal-secret: r5-d1-secret` → 200
  `{"file_ids":["vZ9j88Rfpt3S","khxFH7CZ_oTj"]}` (Lecture-again then Clip, Lecture's removed
  item left a gap and was not listed). Trashed Clip in the UI; the same call then returned
  200 `{"file_ids":["vZ9j88Rfpt3S"]}` while the collection page still showed both items,
  Clip included (d2-5b-collection-after-trash.png), and the trash view listed Clip
  (d2-5c-trash-view.png). `?drive=archive` for that collection → 404
  `{"detail":"Collection not found"}`; wrong secret → 403
  `{"detail":"Invalid internal secret"}`; omitted `drive` → 422; malformed id → 400
  `{"detail":"Invalid collection_id"}`; unknown drive → 404 `{"detail":"Drive not found"}`.
  4. MCP. `pnpm run build` in `mcp-server/` FAILED (exit 2): TS2339 `Property 'text' does
  not exist on type 'TextBlock | ImageBlock'` at `src/__tests__/collections.test.ts` lines
  88, 127, 144, 169, 190, 237. `dist/` was still emitted, so the stdio server from
  `dist/index.js` was run with `LITLOFT_BASE_URL=http://localhost:3993` and
  `LITLOFT_API_TOKEN=r5-token`; all calls below are from `.r5/d2-6-mcp.mjs`. `list_collections
  {drive:scratch}` returned the collection (`id 7691nAkjYnlm`, name "R5 セット", item_count
  2, first_file_id vZ9j88Rfpt3S); archive returned []. `get_collection {scratch}` returned
  one item `{item_id: 1, position: 0, file: {id vZ9j88Rfpt3S, filename lecture-again.mp4,
  title Lecture-again, ...}}` (summary fields) and `inactive_count: 1` for the trashed Clip;
  `fields:"full"` returned the whole file object (25 keys, deleted_at and missing_since
  present). `get_collection {drive:archive}` → isError, "Litloft API error (404): Collection
  not found"; `list_collections {drive:nope}` → isError 404. `move_file` description reads
  "Moving it to another drive removes it from the collections of the drive it leaves";
  `move_files` says the same. Both collection tools carry readOnlyAnnotations and the server
  instructions name them.
  5. Restarted the backend (`docker compose ... restart backend`); healthy after 6 s. The
  post-restart log had no "Removed N collection item(s)" line and no "Collection item
  cleanup failed" line, only the normal startup lines.
  Intelligence `collection_client.py` has no caller in this unit, so nothing in the app
  exercised it; that matches the spec's "nothing in intelligence calls the client yet".
pending: none
