# Decisions

decision:
ran_in_app: yes
at: c25c19b6c8c295086352537a5b2c694199b50325
by: agent
evidence: >
  Scratch stack `litloft-r5-sfo` from this tree (LITLOFT_PORT=3995), one drive
  `scratch` mounted from `.r5/drive` (3 three-second videos, 2 images, 2 markdown
  notes; `travel` on the three Kyoto media files; `kyoto` matches 4 files,
  `kyoto tag:travel` 3). Japanese UI, Chromium through the frontend's Playwright,
  1280x900 and 375x812 with touch emulation. Scripts under `.r5/`
  (walk-1280.js, walk-phone.js, walk-rename-delete.js, walk-failure.js,
  walk-saving.js); screenshots in
  `docs/process/reviews/feature-smart-folder-overwrite/shots/`.

  1. Saved `京都の旅行` from the search page's `…` (q=kyoto), then opened it from
  the sidebar: URL `?q=kyoto&smart_folder_id=jrlV4mP_Kr1Q`, no 上書き保存 button
  in the chips row. The `…` menu reads `保存済み: 京都の旅行`, `上書き保存`
  (disabled), `名前変更`, `削除`, divider, `選択モード`, in that order
  (21-unchanged-menu-open-1280.png, 41-unchanged-menu-open-375.png).
  2. Submitted `kyoto tag:travel`: the sand button with the lucide Save icon and
  the label 上書き保存 appears as the last item of the chips row, its right edge
  (1264px) equal to the row's right edge, `ml-auto`, 32px tall at 1280, accessible name
  「京都の旅行」に上書き保存 (23-changed-1280.png). 「＋ 条件」→ 種類 → 動画 added a 種類 動画 chip and kept
  the button; its `種類 動画 を外す` button removed the chip, still changed, still
  one button (25-changed-with-type-chip-1280.png, 26-after-removing-type-chip-1280.png).
  At 375x812 touch the button wraps to the line below the chips, right-aligned,
  44px tall; document and body scrollWidth are 375 = clientWidth (no sideways
  scroll) and the results bar stays one 61px row with `2件` and `⋯` on the same
  centre line (42-changed-375.png).
  3. Changing only the sort (新しい順), toggling シーン検索, and typing
  `kyoto tag:travel` without Enter each left the button absent
  (22-typed-no-enter-1280.png). The ファイル/箇所 toggle is not rendered in this
  environment (passages require the search addon), so that sub-item could not be
  exercised.
  4. Pressing 上書き保存 sent exactly one `PATCH /api/drives/scratch/smart-folders/{id}`
  with `{"query":"kyoto tag:travel type:video","file_type":null}`; no dialog
  appeared (no `[role=dialog]`, no overlay sampled over the next second); the
  button disappeared; the URL was unchanged; `document.activeElement` was the
  results bar's `その他の操作` (… ) button (27-after-overwrite-1280.png). Clicking
  the sidebar row without a reload opened q=`kyoto tag:travel type:video`.
  5. Reload kept the new conditions: field `kyoto tag:travel type:video`, no
  button (28-after-reload-1280.png).
  6. Rename from the sidebar's context menu (right-click → 名前変更 → 変更) to
  `京都の旅2026`: the sidebar and, without a reload, the open page's `…` then read
  `保存済み: 京都の旅2026` (52-menu-after-rename-1280.png). Delete from the same
  menu: the page kept q=kyoto with the stale `smart_folder_id` in the URL, no
  navigation, no button, and the `…` menu fell back to `スマートフォルダに保存` /
  `選択モード` (54-after-delete-1280.png).
  7. With the page changed again (q=kyoto), pressing `上書き保存` in the `…` row
  sent one PATCH, closed the menu, removed the button and left the URL alone
  (29-changed-menu-row-1280.png, 30-after-row-overwrite-1280.png).

  Failure and in-flight states: deleting the open folder in a second browser
  context and then pressing 上書き保存 in the first gave `404 PATCH`, the toast
  「スマートフォルダの更新に失敗しました」 for about 3 s, the button still shown and
  enabled, and a second press sent a second PATCH (60-overwrite-failed-toast-1280.png,
  61-overwrite-failed-after-1280.png). With the PATCH delayed 2.5 s, the button and
  the `…` row were disabled while it was in flight and a second press sent nothing
  (62-saving-1280.png, 63-saving-menu-1280.png).

  Observations that are outside the change: the 長さ chip renders `長さ >1s` where
  the artboards show `長さ 10分以上`; the ファイル/箇所 toggle is absent because
  passages are unavailable without the search addon; and the シーン検索 toggle is
  hidden for operator queries at both widths (existing `showSceneSearch: !hasOperators`),
  so the phone artboard's results bar cannot be reproduced with a `tag:` query.
  None of these is on the changed path.
pending: The ファイル/箇所 switch was not exercised (not rendered without the
  passages/search addon); no other `agent_cannot_verify` part applies.

## Design differences accepted by the human (design-check.md)

Accepted by Yuichi Senga on 2026-11-14, each by its id. The artboards simplified the parts this change does not touch; the overwrite button (place, size, sand style, icon, label, wrap at 375) and the `…` rows (order, disabled state) match them.

- D-1 accepted: the Files / Passages switch needs the search addon, and Scene search is hidden for operator queries; both are existing behaviour.
- D-2 accepted: the View and Sort buttons show the current choice, as today; the artboard used placeholder labels.
- D-3 accepted: the length chip keeps its existing format; the artboard used placeholder text.
- D-4 accepted: the `…` menu sizes to its rows, as today.
- D-5 accepted: the count keeps its existing translation (「{count}件」).
- D-6 accepted: the phone `…` sheet is the same component; R-5 checked its rows' order and disabled state at 375.
