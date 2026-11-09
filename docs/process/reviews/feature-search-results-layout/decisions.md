# Decisions

decision:
ran_in_app: yes
at: d0e47ae469258af27d5c6464c82d19f4479dc609
by: agent
evidence: Re-run after 770f9765c and 5310d1338. Playwright (headless Chromium) against the running stack video_share-search-layout at http://localhost:3000 (frontend container restarted 14:32, backend/addons from 13:49), NEXT_LOCALE=ja, 1280x900 and 390x844 (isMobile, touch). Core at d0e47ae46, addons/intelligence at 7631700. Drive 動画, query 会議. Screenshots in docs/process/reviews/feature-search-results-layout/r5/ with the rerun- prefix; the earlier run's screenshots (at d92051209) are kept beside them.
  Long Smart Folder name (rerun-08e-sf-menu-longname-1280/390): … -> スマートフォルダに保存, name 「R5再実行 長い名前のスマートフォルダ 会議の動画をまとめて確認するための検索条件です」, 保存 -> URL q=会議&smart_folder_id=…; opened from the sidebar entry (drive home; at 390 through the drawer) -> URL q=会議&sort=created_at&smart_folder_id=…; … shows 「保存済み: R5再実行 長い…」, 更新, 名前変更, 削除, separator, 選択モード, Findページを開く (at 390 after the 表示/ソート groups). 1280: menu 200 px wide (x 1064-1264), saved row 198 px, name span scrollWidth 634 > clientWidth 174, text-overflow ellipsis, action rows 198 px. 390: menu sheet 374 px (x 8-382), name span 634 > 348, ellipsis. No horizontal page scroll at either width. 削除 -> confirm -> URL q=会議&sort=created_at (smart_folder_id dropped); API list afterwards holds only あんこ動画.
  Condition button (rerun-01-main-*): reads 「＋ 条件」 at 1280 and at 390, both spans display:block, 62x26 at x=256 (1280) and x=16 (390). With an operator chip it sits after the chip (x=343 / x=103).
  Smoke pass, same at both widths unless stated. Main (rerun-01): field at top, chip row, bar = ファイル/箇所 (192x38 at 1280, 148x50 at 390), シーン検索 (「シーン」 at 390, 44 px tall), 63件, グリッド表示/新しい順 (1280 only), … (34 px at 1280, 44 px at 390); no フィルタ button; no horizontal scroll. Scene on (rerun-02): checking adds include_scene_clip=true with history length unchanged (2 -> 2), 23件, 「シーン候補」 shelf present. Files … (rerun-05-menu): 1280 = スマートフォルダに保存, separator, 選択モード, Findページを開く; 390 = 表示 group, ソート group, separators, then the same four. Passages (rerun-04): 箇所 -> show=passages, checkbox kept checked, no shelf, View/Sort hidden, count 「20 ファイル・53 箇所」 at 1280 and 「53 箇所」 at 390; … = スマートフォルダに保存, Findページを開く. Operator (rerun-06, q=会議 type:video with include_scene_clip=true): checkbox absent, no shelf, segmented control/count/View/Sort/… at the same positions as the main page, 57件; … has no Find entry. These match the previous run; nothing else moved.
  The test Smart Folders created at each width were deleted; only あんこ動画 remains.
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
