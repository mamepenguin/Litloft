# Decisions

decision:
ran_in_app: yes
at: d92051209522ec584f6696fb070802745fee2736
by: agent
evidence: Playwright (headless Chromium) against the running stack video_share-search-layout at http://localhost:3000, NEXT_LOCALE=ja (en once), 1280x900 and 390x844 (isMobile, touch). Core at d92051209; addons/intelligence checked out at 7631700 (feature/find-menu-row, not yet committed as the pointer: the core tree shows the submodule modified, 07dbabc -> 7631700). Drive 動画, query 会議 unless stated. Screenshots in docs/process/reviews/feature-search-results-layout/r5/.
  Main (01-main-1280/390): field at top, nothing visible above it; chip row 「＋ 条件」 at 1280 and only 「＋」 at 390 (the Phone artboard draws 「＋ 条件」); bar = ファイル/箇所, シーン検索 (「シーン」 at 390), 63件, グリッド表示, 関連度順, …; no フィルタ button, no 「このフォルダで絞り込み」 field; no horizontal scroll. At 390 the bar is one row, segmented control 50 px, the Scene search label 44 px and … 44 px tall, count on one line (1280: label 20 px, fine pointer). The image button inside the field is not drawn (image query is not available on this stack), so D2's image button and D12 were not seen.
  Scene (02-*): checking シーン検索 adds include_scene_clip=true with replace (history.length unchanged), count 23件, shelf 「シーン候補」 under the bar, then results; unchecking removes it. After scrolling 700 px the bar sits at the top (y=8) with the shelf scrolled under it (02b). Passages + Scene on: checkbox shown and checked, no shelf (02c).
  Passages (04-*): 箇所 -> show=passages via replace; count 「4 ファイル・15 箇所」 at 1280, 「15 箇所」 at 390; Sort/View hidden; the first row's link starts at the bar's left edge (x=256, width 960, right 1216 at 1280; x=16, width 358 at 390). … in Passages = スマートフォルダに保存, Findページを開く only, at both widths (05b). Back to ファイル keeps history length.
  Menu (05-*): Files … = (below 768: 表示 group, ソート group, separators) スマートフォルダに保存, separator, 選択モード, Findページを開く last with no separator. At 1280 the View/Sort groups are present in the DOM but not visible. Find with q="  会議  " navigates to /drive/動画/addons/intelligence/find?q=会議 (05c).
  Operator (06-*): q="会議 type:video" with include_scene_clip=true: checkbox absent, no shelf, segmented control/count/View/Sort/… x positions identical to the no-operator page at 1280 and 390; … has no Find entry. Removing the operator chip returns q=会議&include_scene_clip=true with the checkbox back and checked (06c).
  Type chip (07-*): ?type=video shows 「種類 動画 ×」 before 「＋ 条件」, checkbox still present, count 20/57 vs unfiltered 23/63. ✕ pushes one entry (history 8->9), URL keeps q and include_scene_clip, drops type; Back restores type and chip, Forward removes them, no effect re-adds type 2 s later. With a sort chosen in the UI (タイトルA→Z) ✕ keeps sort=title&order=asc. A URL loaded with sort=title&order=asc already lacks them before ✕ (Back after ✕ lands on q=会議&type=video&include_scene_clip=true): the page's load rewrote the URL, ✕ did not drop them. type=bogus: no chip, unfiltered count. type=markdown: chip 「種類 テキスト」. No-results (type=audio, 0件): 「フィルタを解除」 pushes one entry and drops type (07c). Passages empty with type: its 「フィルタを解除」 drops type and keeps show=passages (07d).
  Smart Folder (08-*, 09): from Passages + Scene, … -> スマートフォルダに保存 closes the menu, then opens the save dialog; after save URL = q, smart_folder_id, include_scene_clip, show=passages. … then shows 「保存済み: 名前」 (role=presentation, not focusable), 更新, 名前変更, 削除, Find. 名前変更 closes the menu, dialog pre-filled, rename reflected in the row. Opened from the sidebar: URL q + sort=created_at + smart_folder_id, menu shows the saved row; 更新 opens the overwrite confirmation. 削除 from Passages + Scene: URL keeps q, sort, include_scene_clip, show, drops smart_folder_id; API confirms deletion. Existing 「あんこ動画」 (operator query) shows 保存済み row and no Find entry. With 「ポケモン」 typed in the field but not submitted on q=会議, the saved query is 会議 (API). A smart_folder_id that no longer exists shows the unsaved スマートフォルダに保存 entry (14). A name the backend rejects (149 characters) closes the menu, keeps the dialog open and shows 「スマートフォルダの保存に失敗しました」 bottom-right (08k). Saving a duplicate name 「あんこ動画」 succeeded without error (a second row was created and deleted afterwards). Test folders were deleted; only あんこ動画 remains.
  Select mode (16-*): … -> 選択モード shows card checkboxes; switching to 箇所 and back to ファイル leaves select mode off, at 1280 and 390.
  Folder and tag pages (10-*): /drive/動画/YouTube shows フィルタ and 「このフォルダで絞り込み...」, no view switch, no Scene search; the tag page (?tag=あんこ) shows フィルタ and the filter field.
  Tree pane (11-*): with tree enabled, the search route draws no tree pane; ?file= on the search route replaces the page with the file view, and clicking a result opens the folder route. The search page's hideToolbar state (tree visible + file selected) could not be produced by ordinary use.
  Match labels (13, cards): ファイル名/音声一致/内容一致/サムネイル all bg rgb(246,246,243), text rgb(98,98,91), 10px, 500; modal rows show the same neutral labels.
  en (12-*): 「Type Video ×」, Files/Passages, 「Scene search」 (「Scenes」 at 390), 「57 items」, menu 「Save as Smart Folder」, 「Selection mode」, 「Open Find page」; Passages count 「1 file · 1 passage」.
  Differences from the spec: (1) a long Smart Folder name is not cut at 1280: the … menu widens to fit it (642-685 px wide, text-overflow never triggers, 08e-sf-menu-longname-1280); at 390 it is cut with an ellipsis inside the 374 px sheet. (2) the hideToolbar case of item 1.4 / I2 / I4 is unreachable on the search route (see Tree pane). (3) at 390 the add-condition chip reads 「＋」 only, while the Phone artboard draws 「＋ 条件」. Also seen: the sidebar's Smart Folder list is not updated after save, rename or delete until a later navigation (a new folder absent right after save; a deleted one still listed right after delete). A sort/order written into the search URL by hand is not applied on load and is removed from the URL.
pending: Image query (image button in the field, 「画像で探す」 pill order at 390, image error line) not exercised: image search is not available on this stack. Nothing in agent_cannot_verify applies.

## Design differences (design-check.md)

Decided by the human on 2026-11-09, in the session that built this change.

- D-4 fixed: the condition button shows its word at every width (ConditionMenu), measured at 390 px in `frontend/e2e-components/search-results-bar.spec.ts`.
- D-12 fixed: a long saved name truncates inside the … menu (770f9765c); measured after the fix at 1280 px: menu 200 px wide, name cut with an ellipsis.
- D-1 accepted: the column count comes from the existing grid rule, which this change does not touch.
- D-2 accepted: the shelf's contents belong to the addon and are out of scope (spec Summary); a restyle would be separate addon work.
- D-3 accepted: no artboard draws the shelf at 390.
- D-5 accepted: the spec sets `max-w-list-row` (960 px) instead of the artboard's 880 px.
- D-6, D-8, D-9 accepted: the Passages rows are the existing SPEC-CORE-040 design; this change moves them only.
- D-7 accepted: marks appear only on keyword passages (SPEC-CORE-040 I12); the example query matched by meaning.
- D-10 accepted: the existing menu surface's width and trigger style.
- D-11 accepted: a URL `type` keeps Scene search (spec item 1); the artboard draws the operator case.
- D-13 accepted: the image query view is out of scope and image search is unavailable on the R-5 stack.
- D-14 accepted: no artboard for those phone states.
