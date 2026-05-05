# Litloft

自宅LAN向けファイル管理＆動画ストリーミングWebアプリ。Dockerで動作する。

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
- **設定 GUI**: 初回起動は `/setup` first-run wizard、以降は `/admin/settings` でドライブ・パスワード・アドオン policy を編集（マスター viewer = 全 group を持つパスワードでロック解除した viewer のみ。`passwords.json` 未配置時は誰でも admin）。`data/setup_completed` sentinel でウィザード表示を判定し、`data/restart_pending` flag で「保留中の変更あり」バナーを `/admin` 配下に表示

## ディレクトリ構成

```
backend/
  app/
    main.py          # エントリーポイント、startup scan、setup_completed sentinel migration、restart_pending flag clear
    config.py        # drives.json 読み取り、DATA_DIR、sentinel/flag path helpers
    database.py      # SQLAlchemy, マイグレーション
    models.py        # ORM モデル
    schemas.py       # Pydantic スキーマ
    auth.py          # JWT認証、viewer_id管理、is_admin_viewer helper
    routers/         # API エンドポイント (files, drives, playlists, auth, uploads, progress, ws, admin, admin_config, comments, addon_proxy, internal)
    services/        # ビジネスロジック (scanner, fileops, thumbnail, upload, heic, subtitle, preview, hash, ws, addon_registry, config_writer)
  tests/             # pytest (Docker内で実行)

frontend/
  src/
    app/             # Next.js App Router ページ
      admin/         # 管理ダッシュボード。layout.tsx で admin gate + RestartBanner
        settings/    # 設定編集 UI (Drives / Passwords / AddonPolicy セクション)
      setup/         # first-run wizard (6 ステップ)
    components/      # React コンポーネント (RestartBanner, SetupRedirector 含む)
    hooks/           # カスタムフック
    lib/             # ユーティリティ (api.ts, format.ts, adminConfig.ts 等)
    i18n/            # next-intl 設定
    messages/        # 翻訳ファイル (ja.json, en.json)
    types/           # TypeScript 型定義
  server.js          # Custom Server (WebSocketプロキシ)

deploy/
  post-receive       # git push 自動デプロイ hook (開発者向け、一般利用では不要)

docker-compose.yml                    # ベース設定。編集しない
docker-compose.override.yml.example  # ユーザー設定テンプレート（git管理）
docker-compose.override.yml          # ユーザー設定（git管理外）
drives.json          # ドライブ設定 (git管理外)
passwords.json       # アクセス制御設定 (git管理外)
data/                # SQLite DB + サムネイル + キャッシュ + setup_completed sentinel + restart_pending flag (git管理外)
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
- **`docker-compose.yml` は編集しない**。ユーザー固有の設定（ドライブマウント・passwords.json・ポート）は `docker-compose.override.yml` に記述する
- テンプレート: `cp docker-compose.override.yml.example docker-compose.override.yml` してから編集
- ポート変更は `.env` に `LITLOFT_PORT=8080` を追記するだけでも可
- 独立サービスアドオンも同様に `docker-compose.override.yml` で追加する

## 更新・デプロイ

`git pull && docker compose up -d --build` で更新。ビルド失敗時は現バージョンを維持。
`deploy/` に `post-receive` hook があるが、これは開発者向けの自動デプロイ用（一般利用では不要）。

## 設計ドキュメント

詳細な設計書は `docs/superpowers/specs/` にある。
Backend/Frontend の規約・注意点は `.claude/rules/` にある。
