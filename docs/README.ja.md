# HomeVault

自宅LAN向けファイル管理＆メディアストリーミングWebアプリ。Docker で動かし、ブラウザ（PWA対応）からアクセスする。

> **Note:** このプロジェクトは個人用途で開発しています。Issue/PRは歓迎しますが、対応・サポートは保証しません。

> **Warning:** HomeVaultは信頼できる家庭内ネットワークでの使用を前提としています。インターネットに公開するのに十分なセキュリティは備えていません。外部公開する場合は、リバースプロキシによるHTTPS化やVPN等を自身で構成してください。

<!-- TODO: スクリーンショット（ドライブ一覧 or フォルダブラウザのメイン画面） -->
![HomeVault メイン画面](screenshots/main.png)

## 主な機能

- **マルチドライブ** — 用途別にコンテンツ領域を分離（家族ビデオ、音楽、写真など）
- **フォルダブラウザ** — ネストしたフォルダ階層をファイラーのように辿れるUI
- **動画/音声ストリーミング** — Range Request対応、ブラウザ内再生
- **画像/ドキュメント閲覧** — プレビュー表示、前後ナビゲーション
- **プレイリスト** — ユーザー作成プレイリスト＋フォルダ自動再生
- **ファイル操作** — アップロード、リネーム、移動、削除、ドラッグ&ドロップ整理
- **検索/タグ/お気に入り** — ドライブ内のファイルを素早く見つける
- **フォルダピン留め** — よく使うフォルダへのショートカット
- **アクセス制御** — ドライブ単位のパスワード保護（オプション）
- **ダーク/ライトテーマ** — 切替対応
- **PWA** — スマホのホーム画面に追加してネイティブアプリのように使える

<!-- TODO: スクリーンショット（機能を並べたギャラリー、2〜3枚横並び） -->
<p align="center">
  <img src="screenshots/folder-browser.png" width="32%" alt="フォルダブラウザ" />
  <img src="screenshots/video-player.png" width="32%" alt="動画再生" />
  <img src="screenshots/playlist.png" width="32%" alt="プレイリスト" />
</p>

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| Backend | FastAPI (Python 3.12) + SQLite (SQLAlchemy) + ffmpeg |
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| インフラ | Docker Compose (2コンテナ) |

```
ブラウザ → :3000 (Next.js) → rewrites /api/* → :8000 (FastAPI, Docker内部のみ)
```

## セットアップ

### 1. ドライブ設定

`drives.json.example` を参考に `drives.json` を作成:

```bash
cp drives.json.example drives.json
```

```json
[
  { "name": "家族ビデオ", "path": "/app/drives/family" },
  { "name": "テレビ番組", "path": "/app/drives/tv", "readonly": true },
  { "name": "プライベート", "path": "/app/drives/private", "access_group": "private" }
]
```

| プロパティ | 説明 |
|-----------|------|
| `name` | UI上の表示名 |
| `path` | コンテナ内パス（`docker-compose.yml` の volumes でマウント） |
| `readonly` | `true` でファイル操作を禁止（デフォルト: 書き込み可能） |
| `access_group` | アクセス制御グループ名（省略で公開ドライブ） |

### 2. docker-compose.yml にドライブをマウント

```yaml
services:
  backend:
    volumes:
      - ./drives.json:/app/drives.json:ro
      - /path/to/family-videos:/app/drives/family:ro
      - /path/to/tv-recordings:/app/drives/tv:ro
      - /path/to/private:/app/drives/private
      - ./data:/app/data
```

### 3. 起動

```bash
docker compose up -d --build
```

ブラウザで `http://localhost:3000` を開く。LAN内の他デバイスからは `http://<ホストIP>:3000`。

### 4. アクセス制御（オプション）

特定ドライブをパスワードで保護する場合:

```bash
cp passwords.json.example passwords.json
```

```json
[
  { "password": "your-password", "groups": ["private"] }
]
```

`docker-compose.yml` の backend volumes に追加:

```yaml
- ./passwords.json:/app/passwords.json:ro
```

`passwords.json` を配置しなければ全ドライブが公開される（デフォルト動作）。

## 開発

```bash
# 起動
docker compose up -d --build

# Backend テスト（Docker内で実行）
docker build -f backend/Dockerfile.test -t homevault-test backend/
docker run --rm homevault-test

# Frontend テスト
cd frontend && pnpm test

# ログ確認
docker compose logs -f backend
```

## デプロイ（Mac mini）

`git push` による自動デプロイに対応。

### 初回セットアップ（Mac mini側）

```bash
# bare リポジトリ作成
git init --bare ~/homevault.git

# post-receive hook を設置
cp deploy/post-receive ~/homevault.git/hooks/post-receive
chmod +x ~/homevault.git/hooks/post-receive
```

> `deploy/post-receive` 内の `DEPLOY_DIR` と `GIT_DIR` を環境に合わせて編集すること。

### 開発マシンからデプロイ

```bash
# リモート追加（初回のみ）
git remote add deploy libre@<mac-mini-ip>:homevault.git

# push で自動デプロイ
git push deploy main
```

`docker compose build` 成功時のみコンテナを入れ替え、失敗時は現バージョンを維持する。

## ライセンス

MIT
