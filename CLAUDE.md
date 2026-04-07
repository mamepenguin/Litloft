# HomeVault

自宅LAN向けファイル管理＆動画ストリーミングWebアプリ。Mac mini上でDockerで動作する。

## アーキテクチャ

```
ブラウザ → :3000 (Next.js custom server)
  ├─ HTTP  /api/*  → rewrites → :8000 (FastAPI, Docker内部のみ)
  └─ WS    /api/ws → proxy   → :8000 (WebSocket, http-proxy)
```

- **Backend**: FastAPI (Python 3.12) + SQLite (SQLAlchemy) + ffmpeg
- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- **インフラ**: Docker Compose (2コンテナ、backendは外部非公開)
- **認証**: オプショナルなパスワード保護（`passwords.json` によるドライブ単位のアクセス制御）

## ディレクトリ構成

```
backend/
  app/
    main.py          # エントリーポイント、startup scan
    config.py        # drives.json 読み取り、DATA_DIR
    database.py      # SQLAlchemy, マイグレーション
    models.py        # ORM モデル
    schemas.py       # Pydantic スキーマ
    auth.py          # JWT認証、viewer_id管理
    routers/         # API エンドポイント (files, drives, playlists, auth, uploads, progress, ws, admin, comments)
    services/        # ビジネスロジック (scanner, fileops, thumbnail, upload, heic, subtitle, preview, hash, ws)
  tests/             # pytest (Docker内で実行)

frontend/
  src/
    app/             # Next.js App Router ページ
    components/      # React コンポーネント
    hooks/           # カスタムフック
    lib/             # ユーティリティ (api.ts, format.ts 等)
    i18n/            # next-intl 設定
    messages/        # 翻訳ファイル (ja.json, en.json)
    types/           # TypeScript 型定義
  server.js          # Custom Server (WebSocketプロキシ)

deploy/
  post-receive       # git push → 自動デプロイ hook

docker-compose.yml
drives.json          # ドライブ設定 (git管理外)
passwords.json       # アクセス制御設定 (git管理外)
data/                # SQLite DB + サムネイル + キャッシュ (git管理外)
```

## Git
The addons within the addons directory are independent Git repositories. Therefore, they are not tracked by the main repository. When making changes, you must also commit them within the respective addon.

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

## Docker
- backend は `expose` のみ (外部からアクセス不可)、frontend が唯一のエントリーポイント
- backend healthcheck → frontend は `depends_on: condition: service_healthy`
- `data/` にSQLite DB + サムネイル画像を永続化

## デプロイ

Mac mini上にbare gitリポジトリ (`~/video-share.git`) を作成し、`post-receive` hookで自動デプロイ。
`docker compose build` 成功時のみ `down` → `up` する（失敗時は現バージョンを維持）。

## 設計ドキュメント

詳細な設計書は `docs/superpowers/specs/` にある。
Backend/Frontend の規約・注意点は `.claude/rules/` にある。
