# Video Share - 動画ストリーミングWebアプリ 設計書

## 概要

Mac mini上でDockerで動作する自宅LAN向け動画ストリーミングWebアプリ。`videos/`ディレクトリに配置したMP4ファイルをブラウザ（PWA）で再生できる。認証不要。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| バックエンド | FastAPI (Python 3.12) |
| フロントエンド | Next.js (TypeScript + Tailwind CSS) |
| データベース | SQLite (SQLAlchemy) |
| サムネイル生成 | ffmpeg / ffprobe |
| インフラ | Docker Compose (2コンテナ) |
| パッケージ管理 | pip (backend), pnpm (frontend) |

## アーキテクチャ

```
┌──────────────────────────────────────────────────────┐
│  Mac mini (Docker)                                   │
│                                                      │
│  ┌──────────────┐  rewrites   ┌───────────────────┐  │
│  │  frontend    │  /api/* ──▶ │  backend          │  │
│  │  Next.js     │             │  FastAPI           │  │
│  │  :3000       │             │  :8000 (内部のみ)  │  │
│  └──────────────┘             │                   │  │
│        ▲                      │  ├─ SQLite        │  │
│        │ ブラウザ              │  ├─ ffmpeg        │  │
│  http://<mac-mini-ip>:3000    │  └─ videos/       │  │
│                               └───────────────────┘  │
│                                                      │
│  volumes:                                            │
│    - ./videos:/app/videos        (動画)              │
│    - ./data:/app/data            (DB+サムネイル)      │
└──────────────────────────────────────────────────────┘
```

- frontendコンテナ（Next.js :3000）がユーザーの唯一のエントリーポイント
- Next.js の rewrites で `/api/*` リクエストを backend に転送（プロキシ構成）
- ブラウザはすべて `:3000` にアクセス → CORS不要
- backend の `:8000` はDocker内部ネットワークのみで公開（ports設定なし）
- 動画ファイルはホストの `./videos` を読み取り専用でマウント
- SQLiteのDBファイルとサムネイルは `./data` に永続化
- LAN内のスマホは `http://<mac-mini-ip>:3000` でアクセス

## ディレクトリ構成

```
video-share/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py              # FastAPIエントリーポイント + ヘルスチェック
│   │   ├── config.py            # 設定（パス、DB等）
│   │   ├── database.py          # SQLite接続・初期化
│   │   ├── models.py            # SQLAlchemyモデル
│   │   ├── schemas.py           # Pydanticスキーマ
│   │   ├── routers/
│   │   │   ├── videos.py        # 動画一覧・詳細・ストリーミング
│   │   │   └── categories.py    # カテゴリ（フォルダ）一覧
│   │   └── services/
│   │       ├── scanner.py       # ディレクトリスキャン・メタデータ自動登録
│   │       └── thumbnail.py     # ffmpegサムネイル生成
│   └── tests/
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.ts           # rewrites設定 + output: 'standalone'
│   ├── public/
│   │   └── manifest.json        # PWAマニフェスト
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx       # ルートレイアウト + PWA meta
│   │   │   ├── page.tsx         # トップ（カテゴリ一覧）
│   │   │   ├── videos/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx # 動画再生ページ
│   │   │   └── category/
│   │   │       └── [slug]/
│   │   │           └── page.tsx # カテゴリ別動画一覧
│   │   ├── components/
│   │   │   ├── VideoCard.tsx    # サムネイルカード
│   │   │   ├── VideoList.tsx    # リスト表示行
│   │   │   ├── VideoGrid.tsx    # グリッド表示
│   │   │   ├── VideoPlayer.tsx  # 再生プレイヤー
│   │   │   ├── CategoryNav.tsx  # カテゴリナビゲーション
│   │   │   └── ViewToggle.tsx   # グリッド/リスト切り替え
│   │   ├── lib/
│   │   │   └── api.ts           # FastAPI呼び出しクライアント
│   │   └── types/
│   │       └── index.ts         # 型定義
│   └── tailwind.config.ts
├── docker-compose.yml
├── deploy/
│   └── post-receive             # git hookスクリプト
├── videos/                      # 動画ファイル（gitignore）
└── data/                        # DB + サムネイル（gitignore）
```

## データベーススキーマ

```sql
CREATE TABLE videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    thumbnail_path TEXT,
    file_size INTEGER NOT NULL,
    duration REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_videos_category ON videos(category);
CREATE INDEX idx_videos_title ON videos(title);
```

### タイトル自動生成ルール

1. 拡張子を除去
2. `_` `-` をスペースに変換
3. 各単語の先頭を大文字化
4. 例: `my_vacation_2024.mp4` → `My Vacation 2024`

## APIエンドポイント

```
GET  /api/health                    # ヘルスチェック

GET  /api/videos                    # 動画一覧
     ?category=旅行                 # カテゴリ絞り込み
     ?search=vacation               # タイトル検索
     ?sort=created_at|title|file_size
     ?order=asc|desc
     ?page=1&limit=30

GET  /api/videos/{id}               # 動画詳細

PUT  /api/videos/{id}               # メタデータ編集（タイトル・説明）

GET  /api/videos/{id}/stream        # 動画ストリーミング（Range Request対応）

GET  /api/videos/{id}/thumbnail     # サムネイル画像取得

GET  /api/categories                # カテゴリ一覧（動画数付き）

POST /api/scan                      # ディレクトリ再スキャン（排他制御あり）
```

### Range Request

```
クライアント → GET /api/videos/1/stream
               Range: bytes=0-1048575

サーバー    ← 206 Partial Content
               Content-Range: bytes 0-1048575/524288000
               Content-Type: video/mp4
               Accept-Ranges: bytes
```

### レスポンス形式

```json
{
  "data": [
    {
      "id": 1,
      "title": "My Vacation 2024",
      "category": "旅行",
      "thumbnail_url": "/api/videos/1/thumbnail",
      "duration": 225.5,
      "file_size": 524288000,
      "created_at": "2026-03-20T10:30:00"
    }
  ],
  "meta": {
    "total": 523,
    "page": 1,
    "limit": 30
  }
}
```

### ディレクトリスキャンの挙動

1. `videos/` 以下を再帰的に走査（対象: `.mp4` ファイルのみ）
2. 新規MP4 → DBに登録 + サムネイル生成を `BackgroundTasks` でキューに追加
3. 削除済みファイル → DBレコードを削除
4. 既存ファイル → スキップ（`file_path`のUNIQUEで判定）
5. 起動時に自動スキャン + `POST /api/scan` で手動トリガー
6. 排他制御: スキャン中に再度 `POST /api/scan` が来た場合は 409 Conflict を返す

### カテゴリの定義

- トップレベルのサブフォルダ名をカテゴリとする
- `videos/旅行/2024/summer.mp4` → カテゴリは「旅行」（トップレベル）
- `videos/直下のファイル` → カテゴリは「未分類」
- URLのslugにはフォルダ名をそのままURLエンコードして使用

### サムネイル生成の仕様

| 項目 | 値 |
|------|-----|
| 抽出位置 | 動画の5秒目（5秒未満の場合は0秒目） |
| 画像形式 | JPEG |
| サイズ | 320x180（16:9固定、アスペクト比が異なる場合はpadding） |
| 保存先 | `data/thumbnails/{category}/{filename}.jpg` |
| 失敗時 | デフォルトのプレースホルダー画像を返す |
| バックグラウンド処理 | FastAPIの `BackgroundTasks` を使用 |

## フロントエンド画面構成

### next.config.ts の重要設定

```typescript
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://backend:8000/api/:path*',
      },
    ]
  },
}
```

### 画面遷移

```
トップページ (/)
  ├── カテゴリ一覧（フォルダをカード表示）
  └── 全動画表示ボタン
        ↓
カテゴリ別一覧 (/category/[slug])
  ├── グリッド/リスト切り替えトグル
  ├── 検索バー
  ├── ソート選択（タイトル/日付/サイズ）
  └── 動画カード or リスト行 をクリック
        ↓
動画再生 (/videos/[id])
  ├── ブラウザ標準 <video> プレイヤー
  ├── タイトル・説明表示（編集ボタン付き）
  └── カテゴリへ戻るリンク
```

### コンポーネント

| コンポーネント | 役割 |
|--------------|------|
| `CategoryNav` | カテゴリ一覧を表示、現在のカテゴリをハイライト |
| `VideoGrid` | サムネイルカードをグリッド配置（スマホ1列、タブレット2列、PC3-4列） |
| `VideoList` | コンパクトなリスト表示（サムネイル小 + タイトル + 再生時間 + サイズ） |
| `VideoCard` | グリッド内の1枚（サムネイル、タイトル、再生時間オーバーレイ） |
| `VideoPlayer` | `<video>` タグをラップ、レスポンシブ幅対応 |
| `ViewToggle` | グリッド⇔リスト切り替え（状態はlocalStorageで保持） |

### スマホ最適化

- タッチフレンドリーなカードサイズ（最小44px タップ領域）
- ビューポート全幅のビデオプレイヤー
- 横スクロールなし、縦スクロールで一覧

### PWA

```json
{
  "name": "Video Share",
  "short_name": "VideoShare",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#1a1a2e",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- Service Workerはオフラインキャッシュ不要（動画はストリーミング）
- ホーム画面追加でスタンドアロン表示
- `<meta name="apple-mobile-web-app-capable" content="yes">` でiOS対応

## Docker構成

### docker-compose.yml

```yaml
services:
  backend:
    build: ./backend
    expose:
      - "8000"
    volumes:
      - ./videos:/app/videos:ro
      - ./data:/app/data
    environment:
      - VIDEOS_DIR=/app/videos
      - DATA_DIR=/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

### backend/Dockerfile

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y ffmpeg curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### frontend/Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
CMD ["node", "server.js"]
```

## セキュリティ

### パストラバーサル防止

- ストリーミング・サムネイルエンドポイントではIDベースでDBから `file_path` を取得
- ユーザー入力をファイルパスに直接使わない
- ファイルアクセス前に `os.path.realpath()` で正規化し、`VIDEOS_DIR` または `DATA_DIR` 配下であることを検証
- 検証に失敗した場合は 403 Forbidden を返す

```python
def validate_path(file_path: str, base_dir: str) -> str:
    real_path = os.path.realpath(file_path)
    if not real_path.startswith(os.path.realpath(base_dir)):
        raise HTTPException(status_code=403, detail="Access denied")
    return real_path
```

### スキャンエンドポイントの保護

- `POST /api/scan` は排他ロックで同時実行を防止
- スキャン中に再リクエストが来た場合は 409 Conflict を返す

## デプロイ

### Mac miniセットアップ

```bash
# bare リポジトリ作成
git init --bare ~/video-share.git

# post-receive hook 設置
cp deploy/post-receive ~/video-share.git/hooks/post-receive
chmod +x ~/video-share.git/hooks/post-receive
```

### deploy/post-receive

```bash
#!/bin/bash
DEPLOY_DIR=/Users/libre/Sources/video_share
GIT_DIR=/Users/libre/video-share.git

echo "=== Deploying video-share ==="
git --work-tree=$DEPLOY_DIR --git-dir=$GIT_DIR checkout -f main
cd $DEPLOY_DIR

# ビルドを先に行い、成功時のみ切り替える
docker compose build
if [ $? -eq 0 ]; then
    docker compose down
    docker compose up -d
    echo "=== Deploy complete ==="
else
    echo "=== Build failed, keeping current version ==="
    exit 1
fi
```

### 開発マシンからのpush

```bash
git remote add mac-mini libre@<mac-mini-ip>:video-share.git
git push mac-mini main
```

## テスト戦略

| レイヤー | テスト | ツール |
|---------|-------|-------|
| Backend Unit | スキャナー、サムネイル生成、タイトル変換 | pytest |
| Backend Integration | APIエンドポイント、DB操作、Range Request | pytest + httpx (TestClient) |
| Frontend Unit | コンポーネント描画、表示切替ロジック | Vitest + React Testing Library |
| E2E | 動画一覧→再生の基本フロー | Playwright |

カバレッジ目標: 80%以上

## 非機能要件

| 項目 | 方針 |
|------|------|
| パフォーマンス | サムネイル生成は `BackgroundTasks` でバックグラウンド処理、一覧は30件ずつページネーション |
| エラーハンドリング | ファイル未発見は404、スキャン中のエラーはログ出力して続行 |
| セキュリティ | 認証不要だがパストラバーサル防止（IDベースアクセス + realpath検証） |
| ログ | stdout/stderrに出力（`docker logs` で確認可能） |
| データ保全 | SQLiteのDBファイルは`data/`にマウント、コンテナ再構築で消えない |
| DBマイグレーション | 初期バージョンではマイグレーション不要。スキーマ変更が必要になった時点でAlembicを導入 |

## デザインシステム

### カラーテーマ（ダーク固定）

| トークン | 値 | 用途 |
|---------|-----|------|
| `--bg-primary` | `#0a0a0f` | ページ背景 |
| `--bg-card` | `#1a1a2e` | カード・サーフェス |
| `--bg-elevated` | `#16213e` | ヘッダー・ナビ |
| `--text-primary` | `#EDEDEF` | 本文テキスト |
| `--text-muted` | `#8A8F98` | 補助テキスト |
| `--accent` | `#2563EB` | プライマリアクション |
| `--accent-cta` | `#F97316` | 再生ボタン等CTA |

### タイポグラフィ

- フォント: Inter（Google Fonts）
- 見出し: Inter 600-700
- 本文: Inter 400
- 補助: Inter 300
- スケール: 12 / 14 / 16 / 18 / 24 / 32px

### アイコン

- ライブラリ: Lucide React（SVG、統一スタイル）

### コンポーネント視覚仕様

| 項目 | 値 |
|------|-----|
| カード角丸 | `12px` |
| カードホバー | `scale(1.02)` + shadow拡大、200ms ease-out |
| サムネイルアスペクト比 | 16:9 固定 |
| 再生時間バッジ | 右下、`rgba(0,0,0,0.7)` 背景 |
| グリッドgap | PC `16px`、スマホ `12px` |
| ページ最大幅 | `max-w-7xl`（1280px） |
| ブレークポイント | 375 / 768 / 1024 / 1440px |

### モバイルUX

| 項目 | 対応 |
|------|------|
| タップ遅延 | `touch-action: manipulation` |
| Pull-to-Refresh誤動作 | `overscroll-behavior: contain` |
| ビューポート高さ | `min-h-dvh`（100vh不使用） |
| 動画インライン再生 | `playsInline` 属性 |
| 動画プリロード | `preload="metadata"` |

### 空状態（Empty State）

- 動画0件のカテゴリ: アイコン + 「動画がありません」メッセージ
- 検索結果0件: アイコン + 「一致する動画が見つかりません」+ 検索条件クリアボタン
- 初回起動時（DB未スキャン）: 「スキャンを実行してください」+ スキャンボタン

## スコープ外

- 動画のトランスコード（MP4をそのまま配信）
- MP4以外の動画形式（WebM、MKV、MOV等）
- ユーザー認証・マルチユーザー
- 動画アップロード機能（手動でvideos/に配置）
- オフライン再生・キャッシュ
- 字幕・チャプター
