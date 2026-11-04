# Decisions

ran_in_app: yes
at: cc526349741e9afb5ffc67fe59dfe237e4f61a35
by: agent
evidence: Ran the app on the prepared stack (compose project `litloft-r5-c3`, host port 3994, UI language ja, drives `scratch` and `写真 テスト`) and used the inbox as a viewer: three uploads (folder zone, drive-root drag and drop, inbox-page zone), a knowledge pasted web clip, a file copied onto the drive plus a backend restart for the scan, a Quick Note, single/selection/all done with undo, rename/open/move/trash/restore/tag, opening rows in the detail, a 390x844 touch session (CDP touch events), the second drive, and the MCP `list_inbox` over stdio. Screenshots under `docs/process/reviews/feature-inbox/shots/c3-*`; script logs under `.r5/c3-*.json` and `.r5/c3-*.mjs`. Checks 1-5 and 8 passed; 6 and 7 failed (details below). Re-ran checks 6 and 7 at `3d829e2d81e066956ccec80d9a62caca722e9a0f`'s follow-up `cc526349741e9afb5ffc67fe59dfe237e4f61a35` (same stack, same port, ja; fresh arrivals `c3r-*` uploaded through the inbox zone) and added a third check, the moving row's stage label: both re-checked failures now pass and the new check passes; one new finding about the full-screen detail's back chevron is recorded under A. Screenshots `shots/c3r-*`; logs `.r5/c3r-*.json`, `.r5/c3r-*.mjs`.
pending: The iOS app on a real device: the touch row's link preview and the swipe feel cannot be judged from Chromium emulation. The other `agent_cannot_verify` items are not on this path.

## R-5 report

Stack: `LITLOFT_PORT=3994 docker compose -p litloft-r5-c3 -f docker-compose.yml -f .r5/override.yml up -d --build backend frontend intelligence knowledge`, healthy, `http://localhost:3994`, `NEXT_LOCALE=ja`.

### 1. Three uploads and the list — PASS

- Folder zone: dropped `c3-zone-a.md` on `/drive/scratch/inbox` (`[data-upload-zone]`); upload init carried `inbox_source:"upload"`, `folder_path:"inbox"`; complete 200.
- Drag and drop: dropped `c3-drag-b.md` on `/drive/scratch`; init carried `inbox_source:"upload"`, `folder_path:""`; complete 200.
- Inbox page zone: dropped `c3-inbox-c.md` on `/drive/scratch?view=inbox`; init carried `inbox_source:"upload"`, `folder_path:""`; complete 200.
- Sidebar showed `受信箱` directly under `ホーム`, above `ライブラリ`, with count `3`.
- The page header read `scratch · 3 件`, group `今日`, rows newest first: `C3-inbox-c` / `C3-drag-b` / `C3-zone-a`, each `アップロード`, `20:12`, folders `ルート`/`ルート`/`inbox/`, and stage `使えます`.
- Screenshots: `shots/c3-01a-after-three-uploads.png`, `shots/c3-01b-inbox-three.png`.

### 2. Pasted web clip — PASS

- Profile was unset, so clipping first answered 401 `Profile (nickname) not set`; set nickname `R5` in プロフィール設定 (normal setup), then pasted HTML + URL via Web クリップ → HTMLを貼り付け → 変換して保存. `POST /clips/pasted` answered 200 `{"file_id":"AxSeKEp-B3_q","status":"ready"}`.
- The inbox gained `clip-20261104-111702` at the top with source `Web クリップ`, `ルート`, and count 4.
- Observation: while the clip was still processing, the row's stage text was the raw string `upload.intelligence.processing.search` (not a label); it became `使えます` when ready. This is the shared C2 stage-label fallback, seen in the inbox row.
- Screenshots: `shots/c3-02a-clip-pasted-filled.png`, `shots/c3-02b-clip-submitted.png`, `shots/c3-02c-inbox-with-clip.png`.

### 3. Scan find and Quick Note stay out — PASS

- Copied `c3-scan-found.md` into `.r5/drive` on disk and restarted the backend; the file appears in the Library listing.
- Quick Note saved (`C3 Quick Note` body) into `scratch / Inbox`.
- Inbox stayed at `scratch · 4 件` with only the four arrivals; neither the scanned file nor the quick note was listed or counted (`/api/drives/scratch/inbox?limit=100` refetches).
- Screenshots: `shots/c3-03a-scan-file-in-library.png`, `shots/c3-03c-after-quicknote.png`, `shots/c3-03d-inbox-after-scan-note.png`.

### 4. Done, selection, all, undo — PASS

- Single row 済み: the row left, count went 4 → 3 without a page reload (window probe alive, `load` count 1), toast `1 件を済みにしました` with `元に戻す`; undo restored the row at its original place and count 4.
- Two rows selected: the bar showed `2件選択` with 済み / タグ / 移動; 済み removed both, count 4 → 2, toast `2 件を済みにしました` with undo; undo restored both in order.
- すべて済みにする: all four left, empty state `受信箱は空です`, header `scratch · 0 件`, sidebar count hidden, toast `4 件を済みにしました`; undo restored all four and the button.
- Observation: the selection bar text is `2件選択`, not the spec's `N 件を選択`.
- Screenshots: `shots/c3-04a-single-done-toast.png` … `shots/c3-04g-all-undone.png`.

### 5. What closes a row — PASS

- Rename `c3-zone-a.md` → `c3-zone-a-renamed.md` via the row menu: row stayed, count unchanged, the row showed the new name.
- Opening that row and going back: row stayed.
- Move the clip to the `Inbox` folder of the same drive: row left, count 5 → 4; the file's folder became `Inbox`.
- Trash `C3-inbox-c` (confirm dialog `ゴミ箱に移動`): row left, count 4 → 3. Restore it from ゴミ箱 (`復元`, trash empty afterwards): its row stayed closed, count stayed 3.
- Tag `C3-drag-b` with `r5tag` in the detail's タグ追加: row left on return, count 3 → 2.
- Screenshots: `shots/c3-05a-after-rename.png` … `shots/c3-05h-after-tag-inbox.png`.

### 6. Opening a file from the inbox — FAIL (superseded by the re-check below, now PASS)

- Clicking a row (document and image alike) lands on `/drive/scratch?file=<id>&nav=inbox`: `/files/{id}?nav=inbox` redirects to the two-pane canonical URL, and `nav=inbox` survives. The page does call `GET /api/drives/scratch/inbox/<id>/neighbors`.
- No 済み control exists there: 0 buttons whose text is exactly `済み`, no `済み` aria-label, and the file context menu has no done item. The only 済み button in the code sits in `FileDetailFullScreen`, which `/files/{id}` renders only for collection mode, so the check's `済み` and "moves to the next arrival" cannot be done at all.
- For a document (`C3-inbox-c`, and the direct load of `/files/gk-O7ThXMFIb?nav=inbox`) there are also no prev/next controls: `[data-testid=file-nav-controls]` count 0, position null.
- For an image (`C3-image`) the shell does render prev/next: position `1 / 5`, next moved to `AxSeKEp-B3_q` (the next row) and kept `nav=inbox`; the neighbors answers matched the list order.
- Closing via back returned to `/drive/scratch?view=inbox` in both cases.
- Screenshots: `shots/c3-06-document.png`, `shots/c3-06-image.png`, `shots/c3-06b-direct-file-url.png`.

### 7. 390x844 with touch — FAIL (superseded by the re-check below, now PASS)

- Environment: 390x844, DPR 2, `pointer: coarse` true, `pointer: fine` false, `maxTouchPoints` 1. Rows 358 px wide; `-webkit-touch-callout: none` on the row; layout has no horizontal overflow (`scrollWidth` 390 = `clientWidth` 390, no element wider than the viewport).
- Swipe left (CDP touch, dx −215 px past the 119 px third) did not mark done: after the first horizontal `touchMove` the browser sent `pointercancel`, the row never moved, no toast appeared, rows and count unchanged (`shots/c3-07b-swipe-in-progress.png`, `shots/c3-07c-swipe-done-toast.png` are identical to `c3-07a`). The row's `touch-action` is `auto`, so the horizontal gesture is taken by the browser.
- The 済み button is not visible (`opacity: 0`, no hover on touch) but is not absent: it keeps a 60x44 px box and is still tappable. A tap at its box (x≈332, y≈216) closed the row and showed `1 件を済みにしました` (`shots/c3-07f-tap-invisible-done.png`).
- Long-press: holding 500 ms selects (bar showed `1件選択`, no context menu); on release the trailing click toggles the row off, the selection becomes empty and the bar disappears — the viewer cannot remain in selection mode (`shots/c3-07d-longpress-holding.png` vs `shots/c3-07e-longpress-after-release.png`).
- No checkbox is shown on touch (computed `display: none`), as intended.

### 8. Two drives and MCP — PASS

- `写真 テスト` inbox started `写真 テスト · 0 件`; one drop (`c3-jp-d.md`) made it `写真 テスト · 1 件` and the sidebar showed `受信箱|1`; no scratch rows appeared there.
- Back on scratch the header was `scratch · 2 件`, sidebar `受信箱|2`, and the jp row was absent.
- Built `mcp-server` (`pnpm build`) and ran `dist/index.js` over stdio against `http://localhost:3994` with a small script (`.r5/c3-mcp.mjs`). `list_inbox {drive:"scratch"}` returned the same two items in the same order as the page — `I59PC7FlWF7s` `c3-image.png` `""` `upload` `2026-11-04T11:22:58.489204Z`, then `hzKpYj5Q1XZp` `c3-zone-a-renamed.md` `inbox` `upload` `2026-11-04T11:12:35.716194Z`, `next: null`; `写真 テスト` returned only `MiQSDshEer1I` `c3-jp-d.md`. No done/undo tool is exposed.
- Screenshots: `shots/c3-08a-jp-inbox.png`, `shots/c3-08b-scratch-inbox.png`.

### Re-check after `cc5263497` (was checks 6 and 7, plus the processing stage)

Stack: `LITLOFT_PORT=3994 docker compose -p litloft-r5-c3 -f docker-compose.yml -f .r5/override.yml up -d --build backend frontend intelligence knowledge`, backend healthy, frontend answering 200 on `http://localhost:3994`, `NEXT_LOCALE=ja`. Fresh arrivals for the re-check were dropped on the inbox page's upload zone from `.r5/files`: `c3r-doc.pdf`, `c3r-image.png`, `c3r-note.md` (plus `c3r-doc2.pdf`, `c3r-note2.md`, `c3r-photo2.png` and `c3r-b1…b7.md` so the list was long enough to scroll on a phone); the inbox went from `scratch · 2 件` to `12 件`.

#### A. (was 6) Opening a document and an image from the inbox — PASS

- 1440x900, two-pane. `c3r-doc2.pdf` opened as `/drive/scratch?file=Veevtc8lkHPY&nav=inbox`, position `2 / 7`, with one visible `済み` button in the detail chrome. 次のファイル → `c3r-note2.md` `3 / 7`; 前のファイル → back to `C3r-doc2` `2 / 7`. The neighbors answers (`{prev_id:"fNFY0iWSpHsK",next_id:"lWQR-F9ovsXM",position:2,total:7}` and then position 3 for `lWQR…`) matched the list order shown in the inbox.
- `済み` on the PDF: the row closed (count 7 → 6) and the detail moved on to the next arrival, `c3r-note2.md` at `2 / 6`, with the toast `1 件を済みにしました`.
- `c3r-photo2.png` (image): opened at `1 / 6` with `済み` visible and prev/next; next → `c3r-note2.md` `2 / 6`, prev → `1 / 6`; `済み` closed the row (6 → 5) and moved to the next arrival at `1 / 5` with the same toast. Back on the inbox the image row was gone.
- Closing: at 1440 there is no visible in-app close control (`file-detail-back` is present in the DOM but not visible, and Escape does nothing), so closing was the browser's back; it returned to `/drive/scratch?view=inbox` both times, with the row that was marked done absent.
- New finding, not fixed: at 390x844 the same detail is a full-width host whose only close control is the back chevron (`file-detail-back`, aria `scratchに戻る`); clicking it lands on `/drive/scratch` (the ライブラリ folder view), not on `/drive/{drive}?view=inbox`, so the viewer leaves the inbox. Spec item 7 says closing the detail returns to the inbox. Inside that host, `済み`, the position and prev/next behaved as above.
- Screenshots: `shots/c3r-02-doc-opened.png`, `shots/c3r-02-doc-next.png`, `shots/c3r-02-doc-prev.png`, `shots/c3r-02-doc-done.png`, `shots/c3r-02-doc-closed-inbox.png`, `shots/c3r-02-image-opened.png`, `shots/c3r-02-image-next.png`, `shots/c3r-02-image-prev.png`, `shots/c3r-02-image-done.png`, `shots/c3r-02-image-closed-inbox.png`, `shots/c3r-04-doc-opened.png`, `shots/c3r-04-doc-after-back.png`, `shots/c3r-04-image-opened.png`.

#### B. (was 7) 390x844 with touch — PASS

- Environment: 390x844, DPR 2, `pointer: coarse` true, `pointer: fine` false, `maxTouchPoints` 1. Rows 358x64 px, row `touch-action: pan-y`, checkbox computed `display: none`, 12 rows in `scratch · 12 件`.
- No `済み` button on the rows: 0 buttons whose text is `済み` inside a row, so no invisible 44 px box is left behind; a hit test 20 px from the row's right edge hit the file name span, and nothing there marks done.
- Vertical scrolling: a touch drag from y 700 to 300 scrolled the page 0 → 205 px, left all 12 rows and the count unchanged, and showed no toast.
- Swipe left: dx −215 px past the 119 px third (row 358 px) on the first row (`C3r-b7`); the row followed the finger, and on release it left the list (12 → 11) with the toast `1 件を済みにしました` and `元に戻す`. Undo put the row back at the top and the count back to 12.
- Long-press: 750 ms on the first row selected it — the bar showed `1件選択`, no context menu opened. After the finger lifted, the row stayed selected (checkbox checked 1, the bar still showed `1件選択` with 済み / タグ / 移動), no context menu, URL unchanged. `選択解除` ended selection mode.
- Screenshots: `shots/c3r-03-touch-inbox-390.png`, `shots/c3r-03-after-vertical-scroll.png`, `shots/c3r-03-swipe-in-progress.png`, `shots/c3r-03-swipe-done-toast.png`, `shots/c3r-03-longpress-holding.png`, `shots/c3r-03-longpress-after-release.png`, `shots/c3r-03-after-selection-cancel.png`.

#### C. Stage label while a new upload processes — PASS

- The three fresh files dropped on the inbox zone showed `検索の索引` as their ingest stage, with the spinner, on all three rows while they processed (also in the upload panel); no raw key such as `upload.intelligence.processing.search` appeared in the row text while polling for about 60 s. Each row then showed `使えます` with the check mark.
- Screenshots: `shots/c3r-01-upload-stage.png`, `shots/c3r-01-inbox-after-upload.png`.

### Teardown

- Stopped with `docker compose -p litloft-r5-c3 -f docker-compose.yml -f .r5/override.yml down`, without removing volumes or images. The re-check used the same command to start and stop the same project.
