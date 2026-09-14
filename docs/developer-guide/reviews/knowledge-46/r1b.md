# knowledge #46 round 1b — 観点 1/2/3 レビュー

対象: mamepenguin/Litloft-knowledge-addon `d85c2a7d8382b96a93126e17aff06e1676d0f332`（parent `5835bba`）、core `fff3001b`。
ツリー: scratchpad 内に tarball 展開（worktree 不使用）。parent 比較は `addons/knowledge` を parent の展開物に一時差し替えて同じプローブを実行し、PR ツリーに戻した。
ベースライン: `pnpm exec vitest run src/addons/knowledge` 38 files / 885 tests pass、`tsc --noEmit` clean。

## 前提として測ったこと

- **ドライブ切替は実アプリでは再マウントになる。** core の addon ルートは `app/drive/[name]/addons/[addon]/page.tsx`。Next 16.2.1 の `layout-router.js` は子を `createRouterCacheKey(segment, true)` の stateKey で key し、動的セグメントは `name|<value>|d` になる。`__NEXT_CACHE_COMPONENTS` が無い（next.config に cacheComponents なし）ので `MAX_BF_CACHE_ENTRIES = 1`、`<Activity>` 保持もない。よって `/drive/a/addons/knowledge` → `/drive/b/addons/knowledge` は `[name]` 配下が作り直される。`CurrentDriveProvider` は `pathDrive ?? overrideDrive` で、`/drive/x` 上では pathname 由来の値が常に勝つので、同一インスタンスのまま `useCurrentDrive()` だけが変わる経路は core のルーティングからは見つからなかった。観点 3 の jsdom プローブ（再マウントなしで drive を差し替え）はこの前提の上で「到達性なし」と明記する。
- **検索パラメータの変化は再マウントにならない。** stateKey は search params を除くので、`?prefill=…` → `?q=…` → ブラウザ戻る、は同じ `NotesPage` インスタンスの再レンダーになる。PR ではこのとき `body` の分岐で `ClipSection` がアンマウント／再マウントされる（parent の `KnowledgeDashboard` は常時マウント）。G1・G2 はここから出る。

## Findings

### G1 [introduced] 観点 1 / 不変条件 10・11 — ブックマークレット着地後に Find（または All notes）→ ブラウザ「戻る」で autosubmit が再発火する

- 再現（プローブ P1 / P1b、NotesPage を `useSearchParams` 差し替えで rerender）:
  1. `?prefill=https://example.com/a&title=A&autosubmit=1` で描画 → `createClip` 1 回。
  2. `?q=kyoto` に切替（Find の `router.push` 相当）→ `ClipSection` がアンマウント。
  3. `?prefill=…&autosubmit=1` に戻す（ブラウザ戻る相当。同一ページインスタンス）。
  - P1（`findClipsByUrl` が常に `[]`）: PR `findClipsByUrl 3 / createClip 2`、parent `1 / 1`。**同じクリップが 2 本作られる。**
  - P1b（2 回目の lookup が最初のクリップを返す、`view=all` 経由）: PR `dialog 1`（重複プロンプトが開く）、parent `dialog 0`。
- 原因: `NotesPage` は `query` / `showAll` のとき `ClipSection` を描かないので、ランディングに戻るたびに `ClipForm` が新規マウントされ、`useEffect(() => { if (autoSubmit && initialUrl) void submit(initialUrl) }, [])` が再実行される。`prefill` / `autosubmit` は URL から消されないので、戻った先の URL が autosubmit を再び要求する。
- 実アプリでの経路: ブックマークレットで開いたタブでは clip form が先頭、その直下に Find a note と Recent notes の「All notes」リンクがある。Find 送信（`router.push`、履歴エントリ追加）や All notes リンク → 戻る、で再発火する。parent にはページ内でフォームをアンマウントする状態が無かったので同じ URL 列で再発火しない（上の数値）。
  - 参考: ノート行（`NoteList` の `<Link>`）で別ルートへ出て戻る場合もページ再マウントで再発火するが、これは「ルートを出て戻る」型で parent でもサイドバー等から起きうる（parent 側は未測定のため G1 の根拠には含めない）。
- ユーザーから見えること: 戻るだけで「既にクリップ済み」ダイアログが出る、または（lookup がまだ見つけられないタイミングだと）同じページが二重にクリップされる。

### G2 [introduced] 観点 1 / 不変条件 11 — 送信中のクリップは Find / All notes に移ると recent clips から消える

- 再現（プローブ P5）: `?prefill=…&autosubmit=1` で描画、`createClip` を未解決の deferred にする → `?q=x` に切替 → deferred を解決 → パラメータなしのランディングに戻す。
  - PR: `row 0`、`localStorage["knowledge:recentJobs:a"] = []`
  - parent（同じ URL 列）: `row 1`、`[["c1",{"status":"fetching",…}]]`
- 原因: `onSubmitted` → `dispatch({type:"add"})` → `saveJobs` はすべて `ClipSection` の中にあり、送信完了時にはそのインスタンスが既にアンマウントされている。クリップ自体はサーバで作られるが、ページの recent clips には載らず、#44 の再オープン lookup も localStorage に `fetching` 行が無いので何も拾わない。
- 経路: autosubmit 直後（`findClipsByUrl` + `createClip` の往復中）に Find a note を送信する、または手入力クリップ送信直後に All notes リンクを押す。往復は LAN では短いのでタイミングは狭い。
- ユーザーから見えること: クリップしたはずのページが recent clips に出ない（ファイルは作られている）。

### G3 [introduced] 観点 3 / 不変条件 なし（drive 境界、design-decisions.md「A drive is a security boundary」）— `NoteResults` は drive 変化で `files` / `pages` / `total` をリセットしない

- 再現（プローブ P3、再マウントなしで `useCurrentDrive` を `a`→`b`）: `?view=all`、drive a で 30 件表示 → Show more で 60 件 → drive を b に（b の応答は保留）。
  - b 読み込み中: **a のノート 60 行が表示されたまま**。
  - b 応答後: a の 60 行 + b の 1 行、件数表示は `count {"count":1}`。
  - リクエスト列: `[["a",1],["a",2],["b",2]]` — **b は page 2 から取りに行く**（`pages` が 2 のまま）。`pages===1` でないので `setFiles(prev => [...prev, ...res.data])` が a の行に b を足す。
- 対照（プローブ P3b）: `ContinueWriting` / `RecentNotes` と、`q=` の 1 ページ目だけの状態では、遅れて届いた a の応答は `cancelled` ガードで捨てられ、a の行は 0。問題は「Show more 済み」と「読み込み中の残留」に限られる。
- key が `q:${query}` / `"all"` で drive を含まないことが直接の原因（`key` に drive を入れれば再マウントでリセットされる）。
- 到達性: 上の「前提」のとおり、core のルーティングでは drive 切替で `NotesPage` ごと再マウントされるため、**現在の core からは到達を確認できなかった**。`CurrentDriveProvider` の値だけが変わる経路が将来できた場合（override drive を使う画面にこのページを置く等）に、前ドライブのノート名が次のドライブの画面に残る。`ContinueWriting` / `RecentNotes` が明示的にリセットしているのと非対称。

### G4 [pre-existing] 観点 1 / 不変条件 10 — StrictMode では autosubmit が 2 回走る（開発時のみ）

- 再現（プローブ P2、`<StrictMode>` で prefill+autosubmit）: PR `createClip 2 / findClipsByUrl 2`、parent も `2 / 2`。
- `ClipForm` の `[]` 依存の mount effect に一度きりのガードが無い。Next の App Router は dev で StrictMode 相当の二重実行をするので、開発中にブックマークレットを試すと二重クリップになる。本番ビルドでは起きない。この PR は変えていない。

### G5 [pre-existing] 観点 3 / 不変条件 なし — `ClipSection` の jobs は初回 drive の localStorage で初期化されたまま、drive 変化で入れ替わらず、新 drive のキーに書き込まれる

- 再現（プローブ P6、再マウントなしで drive `a`→`b`）: PR/parent とも a の clip 行が b の画面に表示され、`knowledge:recentJobs:b` に a の行が保存される。
- `useReducer(jobsReducer, undefined, () => loadJobs(drive))` の遅延初期化と、`useEffect(() => saveJobs(drive, jobs), [drive, jobs])`。
- 到達性は G3 と同じ（現 core では drive 切替は再マウント）。PR は変えていない。

### G6 [introduced] 観点 2 / 不変条件 5 — Continue writing の失敗経路を検査するテストが無く、失敗時にページ全体を落とす変更が通る

- ミューテーション M18（`NotesLanding.tsx` の `ContinueWriting`、失敗時の alert を render 中 throw に置換）: `NotesPage.test.tsx` 12/12 pass（survivor）。同じ置換を `RecentNotes` 側に入れた M19 は「keeps the clip form and Continue writing when the note list fails」で kill。
- M13（`ContinueWriting` の `.catch` 自体を削除）も 12/12 pass。`getWatchHistory` を reject させるテストが 1 本も無いため。
- fixture は明確にある: `nickname = "alice"`、`getWatchHistory.mockRejectedValue(...)`、`getDriveFiles` に 1 件 → Recent notes の行と clip form が残り、alert が Continue writing の section 内に 1 件、を検査すれば M13・M18 とも kill できる。
- 不変条件 5 は 3 系統それぞれが自分の失敗を抱えることを求めているが、テストが持っているのは note list 側の片方向だけ。clip 側の失敗（`createClip` / `findClipsByUrl` reject）でノート側が残ることも `NotesPage.test.tsx` には無い（ClipForm のエラー表示を壊す M20 は `ClipWebPage.test.tsx` のダイアログ側テストで kill されるが、ランディング上の分離を見ているわけではない）。
- 実装自体はプローブ P4 で分離が成立しているので、ユーザーに今見える欠陥ではない。検出器の欠落。

### G7 [introduced] 観点 外（NoteResults の Show more）/ 不変条件 3 — 読み込み中に Show more を 2 回押すと 2 ページ目が永久に欠ける

- 3 観点の対象外だが、観点 3 の「Show more 済みページ」を調べる途中で再現したので記録する。
- 再現（プローブ P7、`?view=all`、total 90、page 2 の応答を保留）: Show more → 読み込み中もボタンは表示されたまま（`button visible during load true`）→ もう一度押す → page 2 を解決。
  - 結果: `calls [1,2,3]`、表示 60 行、`Note n30`（2 ページ目の先頭）0 件、`Note n60`（3 ページ目）1 件、Show more はまだ表示。
- 原因: `pages` が 3 になった時点で page 2 の effect は `cancelled = true` になり、その応答は捨てられる。page 3 は `[...prev, ...res.data]` で 1 ページ目の後ろに付く。以降 `files.length (60) < total (90)` のままなので、押すたびに page 4, 5… を取りに行き、31〜60 件目は出ない。ボタンに読み込み中の無効化が無い。
- ユーザーから見えること: 遅い LAN で All notes / 検索結果の Show more を連打すると、30 件ぶん抜けた一覧になり、Show more が消えない。

## 観点 2（失敗の分離）の結果 — 実装上の問題なし（テスト欠落は G6）

プローブ P4（PR のみ。parent には note list / Continue writing が無い）:
- note list（`getDriveFiles`）が永久に未解決 + Continue writing（`getWatchHistory`）が reject: alert は Continue writing の 1 件だけ、clip form は送信でき `createClip` 1 回、recent clips 行も表示。
- clipping 全滅（`findClipsByUrl` / `createClip` reject、#44 lookup も reject）: Recent notes と Continue writing の 2 行は表示、clip form に `clip down` のエラー、localStorage の fetching 行は残る（#44 の「lookup 失敗で fetching のまま」と一致）。
- #44 lookup が永久に未解決: ノート 2 セクションは表示。
- render 中の throw: `getDriveFiles` / `getWatchHistory` はどちらも `async` 関数で同期 throw しない。`res.meta.total` の欠落は `.then` 内の TypeError なので `.catch` に落ちる。`res.data` が配列でない不正応答だけは `NoteList` の `files.map` が render 中に throw し、エラーバウンダリが無いのでページ全体が落ちるが、backend の応答形が壊れた場合に限られるので finding にしない。

## `?edit=` リダイレクト（不変条件 9）— finding なし

`Page.tsx` は import 先の差し替えのみ。M10（mime 条件）は `page.test.tsx` が kill。M9（`!editParam` ガード削除）は survivor で、`?edit=` なしでも `/api/files/null` を取りに行き、テストの fetch スタブ（`/api/files/[^/]+$` に一致すれば markdown を返す）では `router.replace` が呼ばれるが、「renders the Notes page by default」は replace を検査していない。実 backend では `null` は 404 なのでユーザーに見える差は無い。`Page.tsx` の該当箇所は PR で無変更なので pre-existing のテスト欠落として表にだけ残す。

## ブックマークレット URL — finding なし

`BookmarkletSnippet.tsx` / `BookmarkletDialog.tsx` は parent から無変更（`diff -rq` で差分なし）。生成 URL は `/drive/{drive}/addons/knowledge?prefill=…&title=…&autosubmit=1` のままで、`ClipSection` が同じ 3 キーを、`NotesPage` が `prefill` を読む。

## Mutation / probe table

| id | diff / probe | want | result | verdict |
|---|---|---|---|---|
| P1 | prefill+autosubmit → q= → prefill（rerender） | — | PR find 3 / create 2、parent 1 / 1 | G1 |
| P1b | 同上、view=all 経由、2 回目の lookup が既存を返す | — | PR dialog 1、parent 0 | G1 |
| P2 | StrictMode で prefill+autosubmit | — | PR create 2、parent 2 | G4 |
| P3 | view=all、Show more、drive a→b（b 保留→解決） | — | a 行 60 残留、b は page 2 を要求 | G3 |
| P3b | landing / q= で a の応答を drive 切替後に解決 | — | a 行 0 | ガード有効 |
| P4 | 3 系統を順に失敗（reject / 未解決） | — | 他 2 系統は表示・動作 | 観点 2 問題なし |
| P5 | createClip 保留中に q= → 解決 → landing | — | PR row 0 / stored []、parent row 1 | G2 |
| P6 | ClipSection、drive a→b | — | PR・parent とも a 行が b に残り b キーに保存 | G5 |
| P7 | view=all、page 2 保留中に Show more 2 回 | — | calls [1,2,3]、2 ページ目欠落、ボタン残存 | G7 |
| M1 | `NotesPage.tsx`: `const clipFirst = false;` | kill | kill（bookmarklet 配置テスト） | 保持 |
| M2 | `NotesPage.tsx`: `{!clipFirst && <ClipSection />}` → `<ClipSection />` | kill | kill（clip URL textbox が複数） | 保持 |
| M17 | `NotesPage.tsx`: clipFirst を `get("autosubmit")` から判定 | kill | live | survivor。`prefill` のみ（autosubmit なし）の URL で配置が変わる。ブックマークレットは常に両方付けるので手打ち URL でのみ観測可。軽微 |
| M9 | `Page.tsx`: `if (!editParam \|\| !isInline…) return;` → `if (!isInline…) return;` | kill | live | survivor（pre-existing、上記） |
| M10 | `Page.tsx`: mime 条件の markdown 側を `true` | kill | kill | 保持 |
| M3 | `NotesLanding.tsx` ContinueWriting: `if (!cancelled) setRows(items)` → `setRows(items)` | live | live | 同一インスタンスで drive / nickname が変わる必要がある。drive は再マウント、nickname は `/settings`（別ルート）でのみ変わるので実アプリでは観測不能。jsdom fixture では観測可 |
| M4 | RecentNotes: `cancelled` ガード削除 | live | live | M3 と同じ（drive 変化のみ） |
| M5 | NoteResults: `if (cancelled) return;` 削除 | live | live | query 変化は key で再マウント。pages 変化では P7 の状況で「捨てられていた page 2 が付く」ので挙動が変わる → fixture で観測可。survivor（G7 と同じ箇所） |
| M6 | ContinueWriting: 先頭の `setRows(null)` 削除 | live | live | M3 と同じ |
| M7 | RecentNotes: 先頭の `setPage(null)` 削除 | live | live | M3 と同じ |
| M8 | `NotesPage.tsx`: `NoteResults` の `key` 2 つを削除 | live | live | q=a→q=b / q→view=all の直接遷移がアプリ内に無い（結果画面の出口は back リンクのみでランディングを経由）ので実アプリでは観測不能 |
| M11 | `ClipSection.tsx` #44 lookup の deps `[drive]` → `[drive, jobs]` | kill | kill（lookup once テスト） | 保持 |
| M12 | `ClipForm.tsx`: `if (autoSubmit && initialUrl)` → `if (initialUrl)` | kill | live | survivor（pre-existing、ClipForm のこの行は PR で無変更）。`?prefill=` だけの URL で送信されてしまう。ブックマークレットは autosubmit=1 を必ず付ける |
| M13 | ContinueWriting の `.catch` 削除 | kill | live | G6 |
| M14 | RecentNotes の `.catch` 削除 | kill | kill | 保持 |
| M15 | NoteResults の `.catch` 削除 | kill | live | survivor。q= / view=all の失敗表示を検査するテストが無い。この状態では他セクションが無いので分離の問題ではなく、失敗時に alert が出ず件数も出ない一覧になる |
| M16 | ClipSection #44 lookup の `.catch(() => {})` 削除 | kill | kill（unhandled rejection で vitest exit 1） | 保持 |
| M18 | ContinueWriting 失敗時の alert を render throw に | kill | live | G6 |
| M19 | RecentNotes 失敗時の alert を render throw に | kill | kill | 保持 |
| M20 | ClipForm のエラー表示を render throw に | kill | kill（ClipWebPage のダイアログ側 2 件） | 保持（ランディング上の分離としては未検査、G6 に記載） |

全ミューテーション後に `diff -r pristine addons/knowledge` で差分なし、`vitest run src/addons/knowledge` 38 files / 885 tests pass を確認。プローブファイルは削除し `setup-addons.sh` を再実行済み。

## Missing from R-0?

- 不変条件 10 の「exactly once」は 1 回のマウントについてしか読めない。この PR で初めて、同じページ内の URL 変化（`q=` / `view=all` ↔ ランディング、ブラウザ戻る／進む）で clip form がアンマウント・再マウントされるようになったので、「ページ内でランディングを離れて戻っても、同じ `?prefill=` の着地に対して送信は増えず、送信中・送信済みのクリップは recent clips から消えない」を一行で明示する価値がある（G1・G2 はこの隙間から出ている）。
- 不変条件 3 の Show more について「読み込み中に押しても抜け・重複なく連続したページになる」が無い（G7）。

TOTAL: 7 findings
