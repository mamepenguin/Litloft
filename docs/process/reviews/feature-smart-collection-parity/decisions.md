# Decisions

decision: ship (Yuichi Senga, 2026-11-15: "ship" after r3 HUMAN_REVIEW_REQUIRED with 0 findings; accepts the new aria-labels on the collection queue's move and remove buttons)
ran_in_app: yes
at: 047882e06b8c510bdd91c48b6864ff61ba248a7c
by: agent
pending: audio and video as heard and seen (whether the tracks are audible, sync, quality) and playback on other household devices are `agent_cannot_verify` in PROJECT.md; this run drove playback silently and did not listen. The rest of the spec's steps are in this file's first-run evidence below.
evidence:

Second run, after the loop fix. Only the queue's loop behavior and the rest of the
queue as the first run recorded it; 1440px, ja and en, one fresh browser context per
Play (empty `localStorage` and `sessionStorage`). Driven with Playwright (Chromium) from
`.r5/r2-loop.mjs` and `.r5/r2-hover.mjs`; screenshots in
`docs/process/reviews/feature-smart-collection-parity/shots/` with the `r2-` prefix; one
line per state with the panel's title, count, buttons, loop styles and the media element
in `.r5/manifest.jsonl`.

1. Default in a fresh context, both queue kinds, ja and en.
- Smart Collection queue (Play on 自動再生用's search page, `path:アニメ type:video`):
  panel title 自動再生用, `1/28トラック` / `1/28 tracks`, 28 tiles, and the loop button is
  the panel's only button: `aria-label` ループON / Loop ON, class `rounded-lg p-2` with
  `text-text-muted`, 34x34, an 18x18 `lucide-repeat`, no background
  (`r2-smart-queue-1440-ja`, `r2-smart-queue-1440-en`). Hovering a tile adds no control
  and no row is draggable (`r2-hover-smart-1440-ja`).
- Collection queue (Play on Spirit's page, 50 tracks): the loop button is the same
  element — identical class string, `aria-label` ループON / Loop ON, 34x34, 18x18
  `lucide-repeat`, same colour and no background — in the same header (title, count,
  loop at the right); title Spirit, `1/50トラック` / `1/50 tracks`
  (`r2-collection-queue-1440-ja`, `r2-collection-queue-1440-en`).
- Ending the last track with that default: the Smart Collection's 28th tile
  (`Bg-XKNCfDbZ4`) played to its end (5672.8 s of 5672.8, ended, paused) and the page
  stayed on it, `28/28トラック`; Spirit's 50th row (`gR6ISIwLTW_i`) ended at 85.5 s of
  85.5 and the page stayed on it, `50/50トラック`. Neither wrapped
  (`r2-smart-end-last-1440-ja`, `r2-smart-end-last-1440-en`,
  `r2-collection-end-last-1440-ja`, `r2-collection-end-last-1440-en`).

2. The Smart Collection queue's loop toggle, ja and en.
- Pressing the button changed the label ループON → ループOFF / Loop ON → Loop OFF and the
  button to `bg-accent/20 text-accent` (red icon on an accent wash), the state a
  collection's button takes when it is turned on (`r2-smart-loop-on-1440-ja`,
  `r2-smart-loop-on-1440-en`; the collection's, `r2-collection-loop-on-wrap-1440-ja`).
- With loop on, ending the last track opened the first: `Bg-XKNCfDbZ4` → `Alx1ShvKJ5ny`,
  panel `1/28トラック`, autoplay (`r2-smart-loop-on-wrap-1440-ja`,
  `r2-smart-loop-on-wrap-1440-en`). The collection queue did the same on its own toggle:
  `gR6ISIwLTW_i` → `XAA7eXM1X-h0`, `1/50トラック` (`r2-collection-loop-on-wrap-1440-ja`,
  `...-en`).
- Pressing it again restored ループON / Loop ON and the muted look; ending the last track
  then stopped at `28/28トラック` with nothing following
  (`r2-smart-loop-off-again-1440-ja`, `...-en`).

3. The rest of the queue, as the first run recorded: the title is the Smart Collection's
name; `1/28トラック`; ending track 1 opened `j-OBNw218KdB` as `2/28トラック` already
playing (not paused); 28 tracks drawn; only the loop button in the panel, nothing
draggable, no reorder or remove control at rest or on hover (`r2-smart-next-1440-ja`,
`r2-smart-next-1440-en`). For comparison, a collection queue's rows show 上へ移動 /
下へ移動 / コレクションから削除 when hovered, which the Smart Collection queue does not
draw, as D4 says (`r2-hover-collection-1440-ja`).

No difference from the spec or from the collection's behavior was seen.

### First run

Environment: the running stack at http://video-share-sc-parity.localhost:3101 (drive 動画,
850 files; intelligence addon answering). Driven with Playwright (Chromium) from scripts under
`.r5/`; screenshots in `docs/process/reviews/feature-smart-collection-parity/shots/`; one line
per state with DOM boxes, widths, clipping and scrollWidth in `.r5/manifest.jsonl`
(`.r5/LAYOUT_DONE` was written after the layout states). Japanese and English were both used
where text is involved; widths 1440, 1200 (the Main and Queue artboards), 768, 760 (the Ask
artboard) and 375.

Data created through the app's HTTP API (`smart_folders`): レシピ動画 (`レシピ`, id
HgKEPTjm8MbX, meaning-search hits), 該当なし (`tag:存在しないタグ type:video`, id 6z-DmbRDdXny,
no members), 引用"テスト (id YDWfhVDRL28m, quote in the name), 自動再生用 (`path:アニメ
type:video`, id e-xUTu4EGyJr, local mp4s for playback), ペトロナス (`ペトロナス`, id
KrV7PzdX2y9d, only meaning-search hits), 音楽 (`type:audio`, id yKFdrp_87eCA); 削除テスト (id
0VpigjbZP5j3) was created and deleted to open a gone Smart Collection's link.

1. Play, its condition and the queue.
- あんこ動画's saved page (`q=tag:あんこ type:video`, no type parameter): 再生 sits in the
  results bar after `8件` and before view/sort/… at 1440 and 768 (one row, no clipping, no
  horizontal scroll); at 375 it is not in the bar (the bar shows `8件` and `…` only) and is
  the `…` sheet's first row under a separator. `search-smart-1440-ja-bar`,
  `search-smart-768-ja-bar`, `search-smart-375-ja-bar`, `search-smart-375-ja-sheet`.
- Hidden after editing the query to `tag:あんこ type:image` (Play 0, menu has no ここに質問);
  hidden when the URL adds `type=video` while the saved `file_type` is null; hidden on a plain
  search; hidden in Passages (free-text Smart Collection レシピ動画); hidden on 該当なし (no
  members, no video or audio). `play-hidden-edited-query-1440-ja`,
  `play-hidden-url-type-1440-ja`, `play-hidden-plain-search-1440-ja`,
  `play-hidden-passages-1440-ja`, `play-hidden-no-media-1440-ja`.
- Pressing Play with the listing delayed 4 s: the button was disabled and the toast read
  再生を準備しています… / Preparing playback… (`play-preparing-1440-ja`, `play-preparing-1440-en`);
  when the listing answered it opened
  `/files/BVtZs91FE2MA?smart_collection=iJoo9-NqbcRO` and stored
  `smart-queue:動画:iJoo9-NqbcRO` = `{name:"あんこ動画", files:[8 × video]}` in the page's order
  (`play-opened-queue-1440-ja`). Queue ids equal the page's card ids, in order, on あんこ動画
  (8/8), on レシピ動画 (page 21 mixed rows → queue 12 video files, subset and page order
  preserved) and on 自動再生用 with タイトルA→Z (28/28, same prefix and set)
  (`queue-title-asc-player-1440-ja`). With ランダム the set is the same (28/28) but the queue's
  order differs from the page's visible order; the evaluation shuffles once on its own, so its
  order is not the page's (`queue-random-player-1440-ja`, `search-random-1440-ja`).
- Changing the sort while that 4 s evaluation ran discarded it: the toast closed, the URL stayed
  on the search page and no queue was stored (`play-discarded-after-sort-change-1440-ja`).
- Failure toasts seen: incomplete result (the addon's search aborted during the evaluation on
  レシピ動画) → 結果をすべて読み込めなかったため、再生できません。もう一度お試しください。
  (`play-failure-incomplete-1440-ja`); listing failure → 再生を始められませんでした
  (`play-failure-listing-1440-ja`); no media → 再生できる動画や音声がありません
  (`play-failure-no-media-1440-ja`). The last one needs the evaluation to see no video while
  the page still shows some: on ペトロナス (all its rows come from meaning search) the
  evaluation's `passages=true` search was answered with no hits while the page kept its 100
  rows; Play then showed the toast. Play is hidden when the page itself has no video or audio,
  so this toast cannot be reached by ordinary clicks alone.

2. The player.
- Panel title あんこ動画, `1/8トラック`, 8 tiles, the only control is the loop button
  (`aria-label` ループON); no reorder or remove control (`queue-1440-ja`, `queue-1200-ja`,
  `queue-375-ja`, `player-queue-panel-1440-en` shows `1/8 tracks`).
- 自動再生用 after Play: the first video was already playing (0.9 s of 1066 s); ending it
  opened the next file with `smart_collection` kept and the panel at `2/28トラック`
  (`player-autoplay-1-1440-ja`, `player-next-after-end-1440-ja`). A queue click opened the
  third track and kept the parameter (`player-queue-click-1440-ja`). Loop on (the default):
  ending the last track opened the first (`player-loop-1440-ja`); the toggle changed the label
  to ループOFF / Loop OFF and wrote `0` to its storage key.
- Same URL in a new browser context (no stored queue): the panel showed キューを読み込み中… /
  Loading the queue… inside its frame (`player-queue-loading-1440-ja`,
  `player-queue-loading-1440-en`), then the queue; the current video was paused at 0 (no
  autoplay, `player-queue-loaded-no-autoplay-1440-ja`); played by hand and ended, it opened the
  next entry which autoplayed (`player-queue-loaded-next-autoplay-1440-ja`).
- A deleted Smart Collection's link (`?smart_collection=0VpigjbZP5j3`) showed
  キューを読み込めませんでした / Could not load the queue and the file did not autoplay
  (`player-queue-deleted-1440-ja`, `player-queue-failed-1440-en`).
- A video not in the queue (`Alx1ShvKJ5ny` with あんこ動画's id) played; the panel read
  `–/8トラック` with no current track, and ending it did nothing
  (`player-not-in-queue-1440-ja`). An image opened with the same parameter, its gallery opened
  and closed with Escape, and the URL kept `smart_collection` (`player-image-gallery-1440-ja`,
  `player-image-gallery-closed-1440-ja`). Editing 自動再生用's query after a queue was stored
  left the stored 28-track queue intact on reload; clearing sessionStorage re-evaluated the new
  query (8 tracks) and the open file then showed `–/8トラック`
  (`player-queue-fixed-after-collection-edit-1440-ja`).
- An audio-only Smart Collection (音楽, 53 tracks) put the 360 px panel beside the player at
  1440 (x=920) and 1200 (x=800), matching the artboard's placement (`queue-audio-1440-ja`,
  `queue-audio-1200-ja`). For a video Smart Collection the panel is below the player, which is
  today's collection-queue layout for video.

3. The `…` menu.
- Files, あんこ動画: 保存済み: あんこ動画 / 上書き保存 (disabled) / 名前変更 / ホームに置く /
  削除 / separator / ここに質問 / 選択モード (`menu-files-slot-1440-ja`,
  `search-smart-1440-ja-menu`; the same in English, `search-smart-1440-en-menu`, where the
  entry reads Ask here).
- Passages, レシピ動画: 保存済み block / separator / ここに質問, then the Find entry
  (`menu-passages-slot-1440-ja`, `play-hidden-passages-menu-1440-ja`).
- 引用"テスト: no ここに質問 and no separator before 選択モード (`menu-quote-name-1440-ja`).
- After editing the query, and with `type=video` added to the URL: no slot entry and no
  separator (`menu-edited-query-1440-ja`, `menu-url-type-1440-ja`).
- ここに質問 opens `/drive/動画/addons/intelligence?scope=in:"<name>"` with the only chip
  コレクション <name> — from Files (`ask-from-menu-1440-ja`) and from Passages
  (`ask-from-passages-1440-ja`).

4. Ask.
- Scoped question for あんこ動画: the header/scope line read 動画 · 8件 before and after; the
  POST body was `{"query":…,"scope":{"folders":[],"collections":[],"tags":[],"kinds":[],
  "file_ids":[8 ids]}}` — no collection name in `collections`. The answer cited 5 files, all
  among the 8 members (`ask-answer-scoped-1440-ja`).
- Citation → `/drive/動画/YouTube?file=BVtZs91FE2MA&t=40`; Back restored the same answer with no
  new POST (ask count stayed 1, `ask-restored-after-back-1440-ja`); pressing 質問する asked again
  (count 2, `ask-asked-again-1440-ja`).
- ＋ 範囲 → コレクション listed Spirit (Library icon), レシピ動画 and 該当なし (both ListFilter),
  in that name order; あんこ動画 (already chosen) and 引用"テスト (quote) were left out
  (`ask-1440-ja-collections`, `ask-760-ja-collections`, `ask-375-ja-collections`,
  `ask-1440-en-collections`).
- A collection chip alone (Spirit) still works as before: scope line 動画 · 50件, POST
  `collections:["Spirit"]` with no `file_ids`, sources are Spirit tracks
  (`ask-collection-chip-answer-1440-ja`).
- Mixed scope (folder YouTube + コレクション あんこ動画): the scope line showed the drive alone
  (動画) before the answer and 動画 · 8件 after it; the POST carried `folders:["YouTube"]` plus
  the 8 member ids; the answer cited 5 files, all among those 8 (all 8 members are in YouTube),
  so the scope set is those 8 (`ask-mixed-scope-1440-ja`, `ask-mixed-answer-1440-ja`).
- More than 10,000 ids: not producible (850 files in the drive).
- Zero members (該当なし): the menu still offers ここに質問; the Ask page showed the chip
  `コレクション 該当なし`, the scope line 動画 · 0件, and the POST sent `"file_ids":[]`
  (`ask-empty-collection-1440-ja`).
- At 760 and 375 the chip and the list render without horizontal scroll
  (`ask-760-ja-chip`, `ask-375-ja-chip`, `ask-375-ja-collections`).

5. The search page's ＋ 条件 → コレクション lists Spirit only; no Smart Collection appears
(`search-condition-collections-1440-ja`).

6. Agreed design (described, not judged for pixel equality).
- D1: at 1440 the bar reads `8件 | 再生 | グリッド表示 | 関連度順 | …`, the order in
  `Main.dc.html`; 再生 uses the secondary (`bg-sand`) button and the Play icon, height 32 vs
  38 for the other controls. At 768 the same row fits (no wrap, no clipping). At 375 再生 is
  not in the bar, as `Phone.dc.html` draws.
- D2: the menu's visible order is the saved block, a rule, ここに質問, 選択モード; the saved
  block's disabled 上書き保存, 名前変更, ホームに置く and the red 削除 match the artboard.
- D3: at 375 the sheet opens from the bottom over a scrim with 再生 as its first row and a rule
  under it, then 表示/ソート, the saved block, ここに質問 and 選択モード. At 375x812 the sheet
  is 60vh and scrolls: ここに質問 and 選択モード are below the fold until the sheet is scrolled
  (`search-smart-375x812-ja-sheet-bottom`), whereas the artboard shows the whole sheet at once.
- D4: title, `n/N トラック` and the loop control in the panel's frame match. The artboard draws
  numbered rows with durations beside a video; the app draws the same panel for video as a
  thumbnail grid under the player (`queue-1440-ja`, `queue-1200-ja`), and beside the player
  only for audio (`queue-audio-1200-ja`). No reorder or remove control in either.
- D5: the chip reads `コレクション あんこ動画` with the ×; the ＋ 範囲 → コレクション list shows
  Spirit with the Library icon and レシピ動画 / 該当なし with the ListFilter icon, in the
  artboard's order (`ask-760-ja-collections`), and the Ask page at 760 puts the header, chip row
  and field in one column as drawn.

## Design differences accepted by the human (design-check.md)

Accepted by Yuichi Senga on 2026-11-15, each by its id. The artboards drew existing parts without measuring them; the parts this change adds (再生 in the bar and the sheet, ここに質問 in the `…` menu, the queue title and count, the Ask chip and the two-kind collection list) match them.

- D-1 accepted: a video queue is today's collection queue for video, a thumbnail grid under the player; an audio queue sits beside it.
- D-2 accepted: the loop button keeps today's look.
- D-3 accepted: the 375px `…` sheet keeps today's height and scrolls, so ここに質問 and 選択モード can be below the fold.
- D-4 accepted: the Ask page keeps its header, tabs and chip row above the field.
- D-5 accepted: the collection filter keeps today's placeholder.
- D-6 accepted: the search page keeps its image search control.
- D-7 accepted: the other bar buttons keep their existing height.
