# シーン候補の折り返し表示

SPEC-ID: SPEC-ADDON-045

Approval: sha256:5bb958dd603ce5ae59f1ba65ffb17b2b291db9dbc430ba239ff0e97ac29f6196 Yuichi Senga 2026-11-02

## Summary

シーン検索の候補を横スクロールの一列から、表示領域の幅に合わせたカードグリッドへ変える。初期表示は先頭8件とし、続きを展開できるようにする。

## Required items

### 1. Normal flow

シーン検索を有効にして検索すると、順位順に先頭8件までを表示する。9件以上あるときは「すべて表示（全N件）」で取得済みの全候補を表示し、「折りたたむ」で先頭8件へ戻す。展開のための通信は行わない。

### 2. Failure cases

検索失敗、索引なし、partial、画像取得失敗の表示は現行を維持する。画像が失敗してもカードと時間範囲、リンクは残る。

### 3. States

既存のidle/loading/failed/loadedを維持する。loadedに折りたたみ・展開を追加する。検索語、ドライブ、トグル、種類フィルター、スマートフォルダーが変われば折りたたみに戻る。読み込み中は8枚分のスケルトンを同じグリッドで表示する。結果件数による高さの変化は許容する。

### 4. Data read and written

既存のSceneSegmentレスポンスを読む。展開状態はコンポーネント内だけに保持し、永続化しない。既存フレーム取得のキャッシュ以外に書き込みを増やさない。

### 5. External services

追加なし。検索とフレーム取得は既存の経路を維持する。

### 6. Authorization

ドライブ境界と既存のアドオンプロキシの認可を維持する。

### 7. Effect on existing features

シーン候補領域だけを変更する。通常のファイル一覧は候補領域の下に置く。検索順位、候補件数上限、検索アルゴリズム、APIは変更しない。

### 8. Error behavior

既存のエラー文言とログを維持する。展開操作自体には外部I/Oがなく、新たなエラー状態は作らない。

### 9. User-visible behavior

PC・モバイルとも横スクロールなしでカードを折り返す。DESIGN.mdのカード規則（最小幅16rem、最小2列、gap-3、カード自身の表示領域の測定）と既存実装方式を使用する。画面幅だけのブレークポイントで列数を決めない。

カードは16:9画像、時間範囲、最大2行のファイル名を持ち、クリックで既存の開始時刻リンクを開く。順位は左から右、上から下へ保つ。スコアは表示しない。展開ボタンはキーボードで操作でき、aria-expandedで状態を伝える。日英の文言を用意する。

### 10. Non-functional

画像は遅延ロードを維持する。375pxと1280pxの実ブラウザーで、ページと候補領域に横方向のはみ出しがないことを測る。狭いペインでも同じ規則を使う。読み込み・1件・20件、展開前後、長いファイル名を確認する。

## Touch points

- addons/intelligence/frontend/SceneCandidatesSection.tsx と関連テスト。
- addons/intelligence/frontend/messages/{ja,en}.json。
- frontend/e2e-layout/scene-candidates.spec.ts と対応fixture。
- docs/user-guide/search.md：続きを開く操作を記載。
- docs/specs/INDEX.md と本spec。
- addons/intelligence のgitlink（実装を出荷するとき）。
- DESIGN.md、.claude/rules/frontend-conventions.md、.claude/rules/design-decisions.md、docs/process/testing-and-comments.mdに従う。保護対象のファイルは編集しない。

## Invariants

I1. 375pxと1280pxで候補領域とページは横スクロールを必要とせず、表示対象の全カードへ縦スクロールで到達できる。
I2. 初期表示は順位順の先頭8件までで、展開すると取得済み全候補へ同じ順序で到達できる。
I3. 展開・折りたたみは検索リクエストを増やさず、検索入力が変われば折りたたみに戻る。
I4. カードの開始時刻リンク、時間範囲、画像失敗時のリンク操作を維持する。
I5. 過去の検索レスポンスは現在の候補表示を上書きしない。

## Checked, no action

- 検索精度、順位、重複排除、再索引は対象外。
- 前後ボタン付きカルーセルは、候補を一度に見比べにくい問題が残るため採用しない。
- 取得済み全候補の常時表示は通常のファイル一覧を大きく押し下げるため採用しない。
- 既存spec scene-segment-search.mdの一列・固定高・件数によらない高さの要件は、本specの折り返しと件数に応じた高さへ置き換える。既存I1〜I10は変更しない。
