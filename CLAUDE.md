# Video Share

自宅LAN向け動画ストリーミングWebアプリ。Mac mini上でDockerで動作する。

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
    config.py          # 環境変数から VIDEOS_DIR, DATA_DIR を読み取り
    database.py        # SQLAlchemy engine, SessionLocal, get_db (DI)
    models.py          # Video モデル (SQLAlchemy ORM)
    schemas.py         # Pydantic スキーマ (リクエスト/レスポンス)
    routers/
      videos.py        # GET/PUT /api/videos, GET /api/videos/{id}/stream|thumbnail
      categories.py    # GET /api/categories
    services/
      scanner.py       # videos/ 再帰スキャン、DB同期、排他ロック
      thumbnail.py     # ffmpeg サムネイル生成、ffprobe duration取得
  tests/               # pytest (Docker内で実行: Dockerfile.test)
  static/
    placeholder.jpg    # サムネイル未生成時のフォールバック画像

frontend/
  src/
    app/
      page.tsx         # / トップ（カテゴリカード一覧、Server Component）
      category/[slug]/ # カテゴリ別動画一覧 (Client Component)
      videos/[id]/     # 動画再生ページ (Client Component)
      layout.tsx       # ルートレイアウト (Inter, PWA meta, dark theme)
      globals.css      # CSS変数 (デザイントークン), Tailwind
    components/        # VideoCard, VideoGrid, VideoList, VideoPlayer, etc.
    lib/
      api.ts           # Backend API呼び出しクライアント
      format.ts        # formatDuration, formatFileSize
    types/index.ts     # Video, Category, PaginatedResponse 等の型定義

deploy/
  post-receive         # git push → Mac mini 自動デプロイ hook

docker-compose.yml     # backend (expose 8000) + frontend (ports 3000)
videos/                # 動画ファイル (git管理外、Dockerでマウント)
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

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/health | ヘルスチェック |
| GET | /api/videos?category=&search=&sort=&order=&page=&limit= | 動画一覧 |
| GET | /api/videos/{id} | 動画詳細 |
| PUT | /api/videos/{id} | メタデータ編集 (title, description) |
| GET | /api/videos/{id}/stream | 動画ストリーミング (Range Request 206対応) |
| GET | /api/videos/{id}/thumbnail | サムネイル画像 |
| GET | /api/categories | カテゴリ一覧 (動画数付き) |
| POST | /api/scan | ディレクトリ再スキャン (排他制御、競合時 409) |

## 重要な設計判断

### Backend
- `app.config` はモジュール参照で使う (`import app.config as config`)。`from app.config import VIDEOS_DIR` するとテスト時のパス差し替えが効かない。
- Range Request: Rangeヘッダーなしは200で全体配信、ありは206でPartial Content
- パストラバーサル防止: IDベースでDBからfile_pathを取得 → `os.path.realpath()` で正規化 → base_dir配下か検証
- スキャン排他制御: `asyncio.Lock` で同時実行防止、ロック中は 409 Conflict
- サムネイル: ffmpegで5秒目(短い動画は0秒目)を抽出、320x180 JPEG
- カテゴリ: videos/ 直下のトップレベルフォルダ名、直下ファイルは「未分類」

### Frontend
- Next.js 16: `params` は `Promise` 型。Server Component では `await params`、Client Component では `use(params)` または `useParams()`
- トップページ (`/`) は Server Component で `http://backend:8000` に直接fetch
- カテゴリ・動画ページは Client Component で `/api/` (rewrites経由) にfetch
- rewrites (`next.config.ts`): `/api/*` → `http://backend:8000/api/*` でプロキシ。CORSは不要。
- ダークテーマ固定 (CSS変数 `--bg-primary: #0a0a0f` 等)
- ViewToggle の状態は localStorage に保持
- PWA: `manifest.json` + apple-mobile-web-app-capable

### Docker
- backend は `expose` のみ (外部からアクセス不可)、frontend が唯一のエントリーポイント
- backend healthcheck → frontend は `depends_on: condition: service_healthy`
- `videos/` は `:ro` (読み取り専用) でマウント
- `data/` にSQLite DB + サムネイル画像を永続化

## テスト

- **Backend**: pytest, Docker内で実行 (`Dockerfile.test`)。カバレッジ 83%。テストfixtureに小さなMP4ファイルを含む。
- **Frontend**: Vitest 3 + jsdom 25 + React Testing Library。20テスト。
- Vitest 4は rolldown ネイティブバインディング問題あり、3.x を使うこと
- jsdom 29は ESM互換性問題あり、25.x を使うこと

## デプロイ

Mac mini上にbare gitリポジトリ (`~/video-share.git`) を作成し、`post-receive` hookで自動デプロイ。
`docker compose build` 成功時のみ `down` → `up` する（失敗時は現バージョンを維持）。

## 設計ドキュメント

- `docs/superpowers/specs/2026-03-23-video-share-design.md` — 詳細設計書
- `docs/superpowers/specs/2026-03-23-video-share-implementation-plan.md` — 実装計画
