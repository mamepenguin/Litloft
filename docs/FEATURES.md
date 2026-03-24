# Video Share — 機能一覧

自宅LAN向けファイル管理＆動画ストリーミングWebアプリ。

## アーキテクチャ

| レイヤー | 技術 |
|---------|------|
| Backend | FastAPI (Python 3.12) + SQLite + ffmpeg |
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| インフラ | Docker Compose (2コンテナ) |
| デプロイ | Mac mini + git push 自動デプロイ |

```
ブラウザ → :3000 (Next.js) → rewrites /api/* → :8000 (FastAPI)
```

---

## ファイル閲覧

### マルチドライブ対応
- `drives.json` で複数のストレージを論理ドライブとして登録
- 各ドライブは完全に独立（タグ、お気に入り、検索はドライブ内で閉じる）
- ドライブ単位で `readonly: true` を設定可能（書き込み禁止）
- トップページ (`/`) にドライブ一覧を表示

### フォルダナビゲーション
- ファイルシステムのフォルダ構造をそのままブラウズ可能
- パンくずリスト付きの階層ナビゲーション
- フォルダ内のファイル数表示
- 空フォルダも表示可能（EmptyFolder テーブルで管理）

### ファイル一覧
- **グリッド表示** / **リスト表示** の切り替え（localStorage に保持）
- ソート: 新しい順 / 古い順 / タイトル / ファイルサイズ
- ページネーション（30件/ページ）
- ファイルタイプアイコン表示（video / image / audio / document / other）
- 動画・音声ファイルは再生時間バッジ表示

### ファイルタイプシステム
- 全ファイルを統一の `File` テーブルで管理
- `file_type`（大分類）と `mime_type`（詳細）の2カラム分類
- 起動時に全ドライブを自動スキャン（隠しファイル除外）
- 動画: ffprobe で再生時間取得 + ffmpeg でサムネイル自動生成
- 音声: ffprobe で再生時間取得
- `mimetypes` + カスタムマッピングで拡張子から自動分類

---

## ファイル操作

### アップロード
- **ドラッグ＆ドロップ** でファイルをアップロード（ドロップゾーン表示）
- **Upload ボタン** からファイル選択ダイアログでアップロード
- チャンク分割アップロード（5MB単位、最大2GB対応）
- ファイル単位の進捗バー表示
- 最大2ファイル同時アップロード
- アップロード完了後、動画は自動でサムネイル＋再生時間を生成
- 同名ファイルが存在する場合はエラーで拒否
- アップロードのキャンセル対応
- 放置されたアップロードは起動時に自動クリーンアップ（24時間）

### ダウンロード
- ストリーミングエンドポイント経由でダウンロード
- Range Request 対応（大容量ファイルのレジューム可能）
- Content-Type はファイルの mime_type から動的決定
- ファイル名は RFC 5987 エンコーディングで安全に送信

### ファイルのリネーム
- ファイル名変更ダイアログ
- ファイルシステム + DB + サムネイルパスを同時更新
- タイトルはファイル名から自動生成

### ファイルの移動
- 移動先フォルダ選択ダイアログ（フォルダツリーブラウザ）
- ドライブ間の移動にも対応
- ファイルシステム + DB を同時更新

### ファイルの削除
- 確認ダイアログ付き
- ファイルシステム + DB + サムネイルを同時削除

### フォルダ作成
- **New Folder ボタン** でインライン入力
- ファイル名バリデーション（パス区切り文字、隠しファイル、長さ制限）

### フォルダのリネーム
- リネームダイアログ
- フォルダ内の全ファイルのパスを SQL 一括更新
- サムネイルパスも連動して更新

### フォルダの削除
- 空フォルダのみ削除可能（中身がある場合は 409 エラー）
- 確認ダイアログ付き

---

## メタデータ・整理

### お気に入り
- ファイル単位でお気に入りトグル（星アイコン）
- お気に入り一覧表示（`?view=favorites`）
- サイドバーからワンクリックでアクセス

### タグ
- ファイルに最大10個のタグを付与
- タグ名は30文字以内、英数字・アンダースコア・ハイフン
- 自動小文字正規化、重複排除
- サイドバーにタグ一覧（件数付き）
- タグクリックでフィルタ表示
- タグ入力時のオートコンプリート（既存タグからサジェスト）
- 孤立タグの自動クリーンアップ

### いいね / わるいね
- ファイル詳細ページで投票
- カウント表示

### メタデータ編集
- タイトル・説明文のインライン編集

---

## 動画再生

### ストリーミング再生
- ネイティブ HTML5 `<video>` プレーヤー
- Range Request 対応（シーク可能）
- サムネイル自動生成（5秒目、短い動画は0秒目）

### プレビューシステム
- `FilePreview` コンポーネントが file_type で分岐
- 動画 → VideoPlayer で再生
- その他 → ファイル情報表示（将来、画像・音声プレビュー追加可能）

---

## UI / UX

### サイドバー
- **Library**: ホーム、お気に入り、すべてのファイル
- **Tags**: ドライブ内のタグ一覧（件数付き）
- **Drives**: ドライブ一覧（現在のドライブをハイライト）
- モバイル: ハンバーガーメニューで開閉

### コンテキストメニュー
- ファイル: 右クリックでダウンロード / リネーム / 移動 / 削除
- フォルダ: 右クリックでリネーム / 削除
- モバイル: ロングプレス（500ms）で発動
- 画面端での位置自動補正

### グローバル検索
- **Cmd+Shift+F** またはサイドバーの検索アイコンで起動
- ドライブ全体を再帰的にファイル名検索
- デバウンス 300ms で API 呼び出し
- 最大200件の結果表示（ファイルタイプアイコン + パス付き）
- クリックでファイル詳細ページに遷移
- Escape で閉じる

### テーマ
- ライト / ダーク / システム連動の3モード切替
- CSS 変数ベースのデザイントークン

### PWA
- `manifest.json` + apple-mobile-web-app-capable
- ホーム画面に追加可能

---

## セキュリティ

- **認証なし**（自宅LAN前提）
- **パストラバーサル防止**: 全ファイル操作で `os.path.realpath()` + base_dir 境界チェック（`os.sep` 付き）
- **ファイル名サニタイズ**: `<>:"/\|?*\x00` 禁止、`.` 始まり禁止、255文字上限
- **readonly ドライブ**: `drives.json` で個別に書き込み禁止設定可能
- **アップロード安全性**: ファイルサイズ上限 2GB、チャンクサイズ検証、一時ディレクトリ隔離、放置クリーンアップ
- **Content-Disposition**: RFC 5987 エンコーディングでヘッダーインジェクション防止
- **SQL インジェクション防止**: パラメタライズドクエリ、LIKE エスケープ
- **スキャン排他制御**: asyncio.Lock で同時実行防止

---

## インフラ・デプロイ

### Docker Compose
- **backend**: FastAPI (expose 8000、外部非公開)
- **frontend**: Next.js (ports 3000、唯一のエントリーポイント)
- backend healthcheck → frontend は `depends_on: condition: service_healthy`
- ドライブディレクトリは `:rw` でマウント（readonly は drives.json で制御）
- `data/` に SQLite DB + サムネイル画像を永続化

### 自動デプロイ
- Mac mini 上に bare git リポジトリ
- `git push` → `post-receive` hook → `docker compose build` → `down` → `up`
- ビルド失敗時は現バージョンを維持

---

## テスト

| 対象 | フレームワーク | カバレッジ |
|------|-------------|----------|
| Backend | pytest (Docker 内実行) | 80% (106テスト) |
| Frontend | Vitest 3 + jsdom 25 + React Testing Library | 22テスト |

---

## API エンドポイント一覧

### ドライブスコープ (`/api/drives/`)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/drives | ドライブ一覧 |
| GET | /api/drives/{drive}/folders?path= | フォルダ一覧 |
| GET | /api/drives/{drive}/files?path=&search=&sort=&order=&page=&limit=&favorite=&tag=&type= | ファイル一覧 |
| GET | /api/drives/{drive}/tags | タグ一覧 |
| POST | /api/drives/{drive}/folders | フォルダ作成 |
| PUT | /api/drives/{drive}/folders | フォルダリネーム |
| DELETE | /api/drives/{drive}/folders?path= | フォルダ削除 |
| POST | /api/drives/{drive}/upload/init | アップロード開始 |
| POST | /api/drives/{drive}/upload/{id}/chunk | チャンク送信 |
| POST | /api/drives/{drive}/upload/{id}/complete | アップロード完了 |
| DELETE | /api/drives/{drive}/upload/{id} | アップロードキャンセル |
| POST | /api/drives/{drive}/scan | スキャン実行 |

### ファイル操作 (`/api/files/`)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/files/{id} | ファイル詳細 |
| PUT | /api/files/{id} | メタデータ編集 |
| GET | /api/files/{id}/stream | ストリーミング/ダウンロード |
| GET | /api/files/{id}/thumbnail | サムネイル |
| POST | /api/files/{id}/like | いいね |
| POST | /api/files/{id}/dislike | わるいね |
| POST | /api/files/{id}/favorite | お気に入りトグル |
| PUT | /api/files/{id}/tags | タグ編集 |
| PUT | /api/files/{id}/rename | リネーム |
| PUT | /api/files/{id}/move | 移動 |
| DELETE | /api/files/{id} | 削除 |

### その他

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/health | ヘルスチェック |
