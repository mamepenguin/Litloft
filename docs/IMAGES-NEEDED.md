# 必要な画像一覧

ドキュメントに掲載する（または掲載すべき）画像と図のまとめ。各エントリには「どのシーンの画像か」と「どのファイルのどこに貼るか」を明記している。

新しい画像は `docs/images/` 配下に置く（ディレクトリが無ければ作成）。参照は使用するドキュメントからの相対パスで書く。

> **寄稿者向けメモ**: スクリーンショットは PNG、可能なら透過背景で。関連領域だけ切り抜く。UI 撮影時はデバッグバナーやテスト用ファイル名が映らないクリーンな状態で撮る。

## Getting started

| ID | 貼る場所 | 撮影シーン |
|---|---|---|
| GS-01 | `getting-started/installation.md` の「動作確認」セクション末尾 | `docker compose up -d --build` 完了後のターミナル出力（コンテナが healthy になっている状態）と、ブラウザで `http://localhost:3000` を開いて `/setup` に自動リダイレクトされた直後の画面を 1 枚に並べたもの。 |
| GS-02 | `getting-started/first-run-setup.md` 冒頭（概要文の直下） | `/setup` ウィザード上部のステッパー部分のみ。6 ステップすべて（Welcome / Locale / Drives / Passwords / Addons / Confirm）が見え、Step 1 がアクティブ。 |
| GS-03 | `getting-started/first-run-setup.md` の Step 3「Drives」セクション内 | Drives フォームに 2 件入力済みの状態（例: `Movies` = `/srv/movies`、`Photos` = `/srv/photos`）。「行を追加」ボタンも見える構図。 |
| GS-04 | `getting-started/first-run-setup.md` の Step 5「Password」セクション内 | Password フォームで全グループが少なくとも 1 つのパスワードでカバーされ、バリデーション OK のチェック表示が出ている状態。1 件だけマスター閲覧者になっているケースを推奨。 |
| GS-05 | `getting-started/first-run-setup.md` の Step 6「Addon policy」セクション内 | ドライブ × アドオンのマトリクス UI。例として 1 ドライブだけ `intelligence.transcription_cloud` をオフにしたチェック状態。 |

## User guide

| ID | 貼る場所 | 撮影シーン |
|---|---|---|
| UG-01 | `user-guide/file-browsing.md` の冒頭「ドライブホーム画面の構成」セクション | ドライブのトップページ。フォルダグリッド・ファイルグリッド・カルーセル（Continue watching / Recently added / Favourites）・パンくず、すべてが 1 画面に収まった俯瞰ショット。各領域に番号付き吹き出しで注釈を入れる。 |
| UG-02 | `user-guide/viewers-and-players.md` の「Video」セクション | 動画プレイヤー再生中の画面。シークバー上にスプライトプレビューがホバー表示され、字幕ピッカーが開いていて、autoplay トグルが見える状態。 |
| UG-03 | `user-guide/viewers-and-players.md` の「Image」セクション | 画像ビューアの見開きモード。RTL トグルが ON で、2 枚並びの画像が表示されている状態。 |
| UG-04 | `user-guide/viewers-and-players.md` の「Markdown」セクション | Markdown ビュー。上部に frontmatter のチップ（tags / title / description）が表示され、本文中に Mermaid 図が描画されている状態。 |
| UG-05 | `user-guide/search.md` の「検索モード」セクション | 検索ページで semantic と scene search のトグルが両方 ON、結果カードにハイライト済みタイムスタンプが表示されている状態。 |
| UG-06 | `user-guide/search.md` の「Ask」セクション | Ask の回答ペイン。引用チップ付きの回答本文と、`no strong source` (⚠) 警告が出ているケース 1 件を同じ回答内に含む。 |
| UG-07 | `user-guide/upload-and-fileops.md` の「アップロード進捗」セクション | アップロード進捗ドロワーが開いた状態。複数ファイルがアップロード中、うち 1 件が paused、1 件が完了済み、と進行度がばらけている構図。 |
| UG-08 | `user-guide/playlists-favorites.md` の「プレイリストの並び替え」セクション | プレイリスト編集モード。ドラッグハンドルが表示され、1 項目をドラッグ移動中（ゴースト行が見える）状態。 |
| UG-09 | `user-guide/tags-and-relations.md` の冒頭「タグと Related files」セクション | Markdown ファイルの詳細ページ。frontmatter タグがチップとして表示され、下部に *Related files* セクションがサムネ付きで 3〜5 件並んでいる。 |
| UG-10 | `user-guide/trash-and-missing.md` の「ゴミ箱の操作」セクション | ゴミ箱ビューの一覧。各行に削除日時、*Restore* と *Delete forever* ボタンが表示。30 日以内に自動削除される警告バナーも見える状態。 |
| UG-11 | `user-guide/comments-history.md` の「ファイル詳細のコメント」セクション | ファイル詳細ページ。コメントスレッド（2〜3 件のやり取り）と、その下に Continue watching カルーセルが続く縦長構図。 |
| UG-12 | `user-guide/keyboard-shortcuts.md` の冒頭 | `?` キーで開いたショートカット・チートシートモーダル。背景はぼかしで、モーダル内に全カテゴリ（Navigation / Player / Selection / Edit）が見える状態。 |

## Admin guide

| ID | 貼る場所 | 撮影シーン |
|---|---|---|
| AG-01 | `admin-guide/admin-dashboard.md` 冒頭の「ダッシュボードの構成」セクション | `/admin` 画面の俯瞰ショット。ドライブごとのカード、システムメトリクス、アドオンウィジェット、再起動保留バナーがすべて見える状態。番号付き吹き出しで領域を注釈。 |
| AG-02 | `admin-guide/settings-gui.md` の「設定ページの構成」セクション | `/admin/settings` 画面。Drives / Passwords / AddonPolicy の 3 セクションがすべて折りたたまれずに表示されている状態（縦長のフルページショット）。 |
| AG-03 | `admin-guide/docker-compose.md` の「override.yml の例」セクション | `docker-compose.override.yml` のサンプル断面のコード画像。ドライブマウント行と intelligence サービス定義行に色付きハイライト＋日本語コメントの吹き出しを重ねたもの。 |
| AG-04 | `admin-guide/backup-restore.md` の「バックアップ対象」セクション | バックアップ対象の図解。`data/`、`drives.json` / `passwords.json`、`.env`、アドオン設定、ドライブ実体ディレクトリの 5 ブロックを矢印付き構成図で示す。 |

## Addons

| ID | 貼る場所 | 撮影シーン |
|---|---|---|
| AD-01 | `addons/intelligence.md` 冒頭 | Ask ページで実際の質問への回答が表示されている画面。回答本文の各文末に引用チップが付いている状態。 |
| AD-02 | `addons/intelligence.md` の「詳細サマリー」セクション | 長文サマリー（複数 bullet）が表示され、各 bullet 末尾に引用チップ、うち 1 つに ⚠ 低信頼マークが付いている状態。 |
| AD-03 | `addons/intelligence.md` の「Suggested tags」セクション | ファイル詳細のタグチップエディタ。確定済みタグの下に Suggested tags が薄色で並び、各サジェストに Approve / Dismiss ボタンが付いている状態。 |
| AD-04 | `addons/intelligence.md` の「Scene search」セクション | 検索ページで Scene search トグル ON。結果カードにサムネと動画内タイムスタンプ（例: 12:34）が並ぶ状態。 |
| AD-05 | `addons/knowledge.md` の「Active Summary」セクション | 左にファイル詳細、右に knowledge アドオンの Vault ノートが並ぶ 2 ペイン構図。ノート上部に Active Summary ウィジェットと関連ノート一覧が見える。 |
| AD-06 | `addons/cloud-sync.md` の「ダッシュボードウィジェット」セクション | cloud-sync のダッシュボードウィジェット。複数ドライブのマッピング行、各行に *Sync now* / *Cancel* ボタン、次回スケジュール時刻が見える状態。 |
| AD-07 | `addons/media-import.md` の「.loft ファイルの再生」セクション | `.loft` ファイルの詳細ページ。中央に埋め込み YouTube プレイヤー、右サイドバーに取得済みメタデータ（タイトル / チャンネル / 投稿日 / 元 URL）が表示。 |

## Reference

| ID | 貼る場所 | 撮影シーン |
|---|---|---|
| REF-01 | `reference/file-states.md` の「状態遷移」セクション（ASCII 図を置換） | Active / Missing / Trash の 3 状態を円で表し、矢印に遷移条件（scanner で消失 / 復活 / ユーザがゴミ箱送り / 復元 / 30 日後パージ）を書き込んだ状態遷移図。 |

## Developer guide

| ID | 貼る場所 | 撮影シーン |
|---|---|---|
| DEV-01 | `developer-guide/architecture.md` の「全体構成」セクション（既存 ASCII アートを置換） | ブラウザ → Custom Server (:3000) → Backend (:8000) の経路図に、アドオン群を外側に衛星状に配置したトポロジ図。WebSocket 経路は別色で示す。 |
| DEV-02 | `developer-guide/architecture.md` の「ファイル状態」セクション（既存 ASCII アートを置換） | ファイル状態の有限状態機械図。REF-01 と類似だが開発者向けに `deleted_at` / `missing_since` カラムの値も併記。 |
| DEV-03 | `developer-guide/addon-dev.md` の「Slot System」セクション | スロット注入の概念図。1 ページに複数スロット（`search-modes` / `file-detail-sections` / `dashboard-widgets` / `folder-actions`）が並び、それぞれを別のアドオンが埋めている様子をカラーで色分けして示す。 |

## Reused

| ID | 貼る場所 | 撮影シーン |
|---|---|---|
| LOGO | 各種ドキュメントの先頭、README | Litloft のプロジェクトロゴ。既存の `docs/screenshot_*.png` を流用できるなら流用可。 |

## アニメーション GIF

短いアニメーションが静止画より有効なケース：

- **ドラッグ＆ドロップアップロード**: `user-guide/upload-and-fileops.md` の冒頭。デスクトップから複数ファイルを掴んでフォルダグリッドに落とし、進捗ドロワーが立ち上がるまで。
- **Continue watching**: `user-guide/comments-history.md` または `user-guide/viewers-and-players.md`。動画を途中で一時停止 → ページをリロード → 同じ位置から再開される様子。
- **タグチップ編集**: `user-guide/tags-and-relations.md`。Markdown ファイルでチップを追加 → 右側プレビューの frontmatter が即時更新される様子。
- **Scene search ジャンプ**: `addons/intelligence.md` の Scene search セクション。検索結果のタイムスタンプ付きヒットをクリック → プレイヤーが該当時刻にシークするまで。

## 命名・形式の規約

- ファイル名: `<id を小文字化>.png`（例: `gs-02-wizard-stepper.png`）
- 解像度: 2× （Retina 対応）推奨
- ダークモード: 両方撮影し、ダーク版は `<id>-dark.png`。`<picture>` 要素で切り替える。
- 実在の個人情報は写さない。同梱の `videos/` テストコンテンツを使う。

## ステータス

追加された画像は `✅ <id>: docs/images/<file>.png` の形式で記録する。

### User guide

- ✅ UG-01: `docs/images/user-guide/drive-home-overview.png`
- ✅ UG-02: `docs/images/user-guide/video-player-subtitles-preview.png`
- ✅ UG-03: `docs/images/user-guide/image-viewer-spread-rtl.png`
- ✅ UG-04: `docs/images/user-guide/markdown-viewer-frontmatter-mermaid.png`
- ✅ UG-05: `docs/images/user-guide/search-semantic-scene-results.png`
- ✅ UG-06: `docs/images/user-guide/ask-answer-citations-warning.png`
- ✅ UG-07: `docs/images/user-guide/upload-progress-drawer.png`
- ✅ UG-08: `docs/images/user-guide/playlist-reorder-drag.png`
- ✅ UG-09: `docs/images/user-guide/tags-related-files.png`
- ✅ UG-10: `docs/images/user-guide/trash-view-actions.png`
- ✅ UG-11: `docs/images/user-guide/comments-thread-continue-watching.png`
- ✅ UG-12: `docs/images/user-guide/shortcut-cheatsheet-modal.png`
