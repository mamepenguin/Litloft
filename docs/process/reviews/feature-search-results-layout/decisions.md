# Decisions

decision:
ran_in_app: yes
at: 594db5014bf82551a951d15bfdc91a0bf5e26a4e
by: agent
evidence: Re-run after the rebase onto develop (file Ask thread) and the SPEC-ADDON-086 renumber. Playwright (headless Chromium) against the running stack video_share-search-layout at http://localhost:3000, NEXT_LOCALE=ja, 1280x900 and 390x844 (isMobile, touch). Core at 594db5014, addons/intelligence at b0a5c01. Drive 動画, query 会議. Screenshots in docs/process/reviews/feature-search-results-layout/r5/ with the rebase- prefix; earlier runs' screenshots are kept beside them. No page errors at either width.
  Main (rebase-01-main-*): field first (1008 px wide at x=256 / 358 px at x=16), chip row with 「＋ 条件」 (62x26, word shown at both widths), then the bar: ファイル/箇所 (192x38 / 148x50), シーン検索 (「シーン」 at 390), 63件, グリッド表示 and 関連度順 (1280 only), … (34 px / 44 px). No フィルタ button, no 絞り込み field, no horizontal scroll (scrollWidth = clientWidth at both widths).
  Files … (rebase-05-menu-*): 1280 = スマートフォルダに保存, separator, 選択モード, Findページを開く; 390 = 表示 group, ソート group with separators, then the same four.
  Scene on (rebase-02-scene-*): checking adds include_scene_clip=true, history length unchanged (2 -> 2), 23件, 「シーン候補」 shelf under the bar; bar controls keep their positions.
  Passages (rebase-04-passages-*, rebase-05b-menu-passages-*): 箇所 -> URL adds show=passages, checkbox stays checked, no shelf, View/Sort absent, count 「20 ファイル・53 箇所」 (1280) / 「53 箇所」 (390); … = スマートフォルダに保存, Findページを開く only.
  Find entry (rebase-05c-find-*): … -> Findページを開く -> /drive/動画/addons/intelligence/find?q=会議, menu closed.
  Operator (rebase-06-operator-*, q=会議 type:video with include_scene_clip=true): checkbox absent, no shelf, segmented control, count, View, Sort and … at the same x as the main page; 「＋ 条件」 after the operator chip (x=343 / x=103); 57件; … has no Find entry.
  Type chip (rebase-07-*): ?type=video&include_scene_clip=true shows 「種類 動画 ×」 before 「＋ 条件」, checkbox and shelf shown, 20件. ✕ (「種類 動画 を外す」) pushes one entry (history 6 -> 7), URL q=会議&include_scene_clip=true, 23件, no type returns after 2 s. With show=passages in the URL, ✕ keeps show=passages. With sort chosen in the UI (古い順 -> sort=created_at&order=asc), ✕ keeps sort and order (rebase-07c-typechip-removed-sorted-1280). Observed: sort=…&order=… written into the URL by hand are removed on page load before any click (q=会議&sort=title&order=asc, with or without type, settles to q=会議 and 関連度順).
  Condition menu (rebase-09-condition-*): 「＋ 条件」 opens タグ, 種類, フォルダ, コレクション, サイズ, 長さ, お気に入り (dropdown at 1280, bottom sheet at 390).
  Smart Folder (rebase-08*-*): from Passages with Scene search on, … -> スマートフォルダに保存 closes the menu and opens the save dialog; name 「R5リベース後<width> 長い名前のスマートフォルダ 会議の動画をまとめて確認するための検索条件です」, 保存 -> URL q=会議&smart_folder_id=…&include_scene_clip=true&show=passages. Opened from the sidebar entry (drive home; at 390 through the メニュー drawer) -> URL q=会議&sort=created_at&smart_folder_id=…. … shows 「保存済み: R5リベース後…」 (role presentation), 更新, 名前変更, 削除, separator, 選択モード, Findページを開く. 1280: menu 200 px, saved row 198 px, name scrollWidth 694 > clientWidth 174, ellipsis, nowrap. 390: sheet 374 px, name 688 > 348, ellipsis. No horizontal scroll. 削除 closes the menu, confirm -> URL q=会議&sort=created_at; API list afterwards holds only あんこ動画. (A first 1280 attempt saved a folder and then failed in the test script before opening it; that folder was removed through the API.)
  Folder page (rebase-10-folder-*, /drive/動画/YouTube): フィルタ button and 「このフォルダで絞り込み…」 field present, no view switch, no Scene search, no horizontal scroll.
  Ask (rebase-11-ask-*, /drive/動画/addons/intelligence): 質問 page loads with Ask/Find tabs, 「＋ 範囲」, the question field, the model select and 質問する; no question sent.
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
