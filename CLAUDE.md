# Video Share

自宅LAN向けファイル管理＆動画ストリーミングWebアプリ。Mac mini上でDockerで動作する。

## アーキテクチャ

```
ブラウザ → :3000 (Next.js) → rewrites /api/* → :8000 (FastAPI, Docker内部のみ)
```

- **Backend**: FastAPI (Python 3.12) + SQLite (SQLAlchemy) + ffmpeg
- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- **インフラ**: Docker Compose (2コンテナ、backendは外部非公開)
- 認証なし（自宅LAN前提）

## ディレクトリ構成

```
backend/
  app/
    main.py           # FastAPIエントリーポイント、ルーター登録、startup scan
    config.py          # drives.json からドライブ設定読み取り、DATA_DIR
    database.py        # SQLAlchemy engine, SessionLocal, get_db (DI), マイグレーション
    models.py          # File, Tag モデル (SQLAlchemy ORM)
    schemas.py         # Pydantic スキーマ (リクエスト/レスポンス)
    routers/
      files.py         # GET/PUT /api/files/{id}, stream, thumbnail, like, tags
      drives.py        # GET /api/drives, folders, files, tags, scan
    services/
      scanner.py       # ドライブ単位の再帰スキャン（全ファイル対応）、DB同期、排他ロック
      filetype.py      # ファイルタイプ分類 (classify, is_hidden)
      fileops.py       # ファイル/フォルダ CRUD 操作（リネーム、移動、削除、作成）
      upload.py        # チャンクアップロード管理（セッション、結合、クリーンアップ）
      thumbnail.py     # ffmpeg サムネイル生成、ffprobe duration取得
  tests/               # pytest (Docker内で実行: Dockerfile.test)
  static/
    placeholder.jpg    # サムネイル未生成時のフォールバック画像

frontend/
  src/
    app/
      page.tsx           # / トップ（ドライブ一覧、Server Component）
      drive/[name]/      # ドライブルート（フォルダ+ファイル、Client Component）
      drive/[name]/[...path]/ # サブフォルダブラウザ (Client Component)
      files/[id]/        # ファイル詳細・再生ページ (Client Component)
      layout.tsx         # ルートレイアウト (Inter, PWA meta, dark theme)
      globals.css        # CSS変数 (デザイントークン), Tailwind
    components/
      Sidebar.tsx        # サイドバー（LIBRARY/TAGS/DRIVES セクション）
      FolderBrowser.tsx  # フォルダ一覧 + ファイル一覧の統合表示
      FolderCard.tsx     # フォルダアイテム表示
      Breadcrumb.tsx     # パンくずリスト
      FileCard.tsx       # ファイルカード（file_type でサムネイル/アイコン切替）
      FileGrid.tsx       # グリッド表示
      FileList.tsx       # リスト表示
      FilePreview.tsx    # file_type 分岐プレビュー（video→VideoPlayer、他→情報表示）
      FileTypeIcon.tsx   # ファイルタイプアイコン
      VideoPlayer.tsx    # 動画プレーヤー
    lib/
      api.ts           # Backend API呼び出しクライアント
      format.ts        # formatDuration, formatFileSize
    types/index.ts     # FileItem, Drive, Folder, Tag, PaginatedResponse 等の型定義

deploy/
  post-receive         # git push → Mac mini 自動デプロイ hook

docker-compose.yml     # backend (expose 8000) + frontend (ports 3000)
drives.json            # ドライブ設定 (git管理外)
drives.json.example    # ドライブ設定サンプル
data/                  # SQLite DB + サムネイル (git管理外)
```

## 開発コマンド

```bash
# 起動
docker compose up -d --build

# Backend テスト (Docker内で実行、ローカルPython 3.14ではpydantic非対応)
docker build -f backend/Dockerfile.test -t video-share-test backend/
docker run --rm video-share-test

# Frontend テスト
cd frontend && pnpm test

# ログ確認
docker compose logs -f backend
```

## API エンドポイント

### ドライブスコープ

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/drives | ドライブ一覧 |
| GET | /api/drives/{drive}/folders?path= | サブフォルダ一覧（名前+ファイル数） |
| GET | /api/drives/{drive}/files?path=&search=&sort=&order=&page=&limit=&favorite=&tag=&type= | ファイル一覧（type でフィルタ可能） |
| GET | /api/drives/{drive}/tags | タグ一覧 |
| POST | /api/drives/{drive}/folders | フォルダ作成 |
| PUT | /api/drives/{drive}/folders | フォルダリネーム |
| DELETE | /api/drives/{drive}/folders?path= | フォルダ削除（空のみ） |
| POST | /api/drives/{drive}/upload/init | アップロード開始 |
| POST | /api/drives/{drive}/upload/{id}/chunk | チャンク送信 |
| POST | /api/drives/{drive}/upload/{id}/complete | アップロード完了 |
| DELETE | /api/drives/{drive}/upload/{id} | アップロードキャンセル |
| POST | /api/drives/{drive}/scan | ドライブ単位スキャン (排他制御、競合時 409) |

### グローバル（IDベース）

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/health | ヘルスチェック |
| GET | /api/files/{id} | ファイル詳細 |
| PUT | /api/files/{id} | メタデータ編集 (title, description) |
| GET | /api/files/{id}/stream | ストリーミング (Range Request 206対応、Content-Type は mime_type から動的決定) |
| GET | /api/files/{id}/thumbnail | サムネイル画像 (動画: ffmpeg生成、他: placeholder) |
| POST | /api/files/{id}/like | いいね |
| POST | /api/files/{id}/dislike | わるいね |
| POST | /api/files/{id}/favorite | お気に入りトグル |
| PUT | /api/files/{id}/tags | タグ編集 |
| PUT | /api/files/{id}/rename | ファイルリネーム |
| PUT | /api/files/{id}/move | ファイル移動 |
| DELETE | /api/files/{id} | ファイル削除 |

## 重要な設計判断

### ファイルタイプシステム
- **File テーブル**: 全ファイルの統一モデル（旧 Video テーブルを統合）
- **file_type**: 大分類（video/image/audio/document/other）— UIフィルタ・アイコン切替
- **mime_type**: 詳細（video/mp4 等）— Content-Type 決定・プレビュー方式判定
- **duration**: nullable、video/audio のみ ffprobe で取得
- **スキャン**: 隠しファイル（`.` 始まり）以外の全ファイルを登録
- 分類ロジックは `services/filetype.py` に分離
- 設計書: `docs/superpowers/specs/2026-03-24-file-browsing-extension-design.md`

### ドライブ + フォルダ階層
- **ドライブ**: 論理的なコンテンツ領域の分離。タグもドライブ間で独立
- **フォルダ階層**: ファイラーのようにネストしたフォルダを辿れるUI
- ドライブ設定は `drives.json` で管理（DB外）。変更時はコンテナ再起動
- フォルダは `folder_path` カラムから動的算出 + `EmptyFolder` テーブルで空フォルダ表示
- `drives.json` に `readonly: true` で書き込み禁止（デフォルト: 書き込み可能）
- ドライブ横断操作（検索、お気に入り）は不要。各ドライブは完全に独立
- お気に入りURLは `?view=favorites` クエリパラメータ（フォルダ名との競合回避）
- 設計書: `docs/superpowers/specs/2026-03-24-drives-and-folders-design.md`

### Backend
- `app.config` はモジュール参照で使う (`import app.config as config`)。`from app.config import VIDEOS_DIR` するとテスト時のパス差し替えが効かない。
- Range Request: Rangeヘッダーなしは200で全体配信、ありは206でPartial Content
- パストラバーサル防止: IDベースでDBからfile_pathを取得 → `os.path.realpath()` で正規化 → base_dir配下か検証
- スキャン排他制御: `asyncio.Lock` で同時実行防止、ロック中は 409 Conflict
- サムネイル: ffmpegで5秒目(短い動画は0秒目)を抽出、320x180 JPEG

### Frontend
- Next.js 16: `params` は `Promise` 型。Server Component では `await params`、Client Component では `use(params)` または `useParams()`
- トップページ (`/`) は Server Component で `http://backend:8000` に直接fetch
- ドライブ・ファイルページは Client Component で `/api/` (rewrites経由) にfetch
- rewrites (`next.config.ts`): `/api/*` → `http://backend:8000/api/*` でプロキシ。CORSは不要。
- ダークテーマ固定 (CSS変数 `--bg-primary: #0a0a0f` 等)
- ViewToggle の状態は localStorage に保持
- PWA: `manifest.json` + apple-mobile-web-app-capable

### Docker
- backend は `expose` のみ (外部からアクセス不可)、frontend が唯一のエントリーポイント
- backend healthcheck → frontend は `depends_on: condition: service_healthy`
- 各ドライブディレクトリは `:ro` (読み取り専用) でマウント
- `drives.json` は `:ro` でマウント
- `data/` にSQLite DB + サムネイル画像を永続化

## テスト

- **Backend**: pytest, Docker内で実行 (`Dockerfile.test`)。テストfixtureに小さなMP4ファイルを含む。
- **Frontend**: Vitest 3 + jsdom 25 + React Testing Library。
- Vitest 4は rolldown ネイティブバインディング問題あり、3.x を使うこと
- jsdom 29は ESM互換性問題あり、25.x を使うこと

## デプロイ

Mac mini上にbare gitリポジトリ (`~/video-share.git`) を作成し、`post-receive` hookで自動デプロイ。
`docker compose build` 成功時のみ `down` → `up` する（失敗時は現バージョンを維持）。
`drives.json` はホスト固有設定のためgit管理外。`drives.json.example` を参考に作成。

## 設計ドキュメント

- `docs/superpowers/specs/2026-03-23-video-share-design.md` — 詳細設計書
- `docs/superpowers/specs/2026-03-23-video-share-implementation-plan.md` — 実装計画
- `docs/superpowers/specs/2026-03-24-drives-and-folders-design.md` — ドライブ+フォルダ階層設計書
- `docs/superpowers/specs/2026-03-24-file-browsing-extension-design.md` — ファイル閲覧拡張設計書
- `docs/superpowers/specs/2026-03-24-file-operations-design.md` — ファイル操作設計書
