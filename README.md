# Video Share

自宅LAN向け動画ストリーミングWebアプリ。Mac mini上でDockerで動作し、`videos/` ディレクトリに配置したMP4ファイルをブラウザ（PWA）で再生できます。

## 技術スタック

- **Backend**: FastAPI (Python 3.12) + SQLite + ffmpeg
- **Frontend**: Next.js 16 (TypeScript + Tailwind CSS)
- **インフラ**: Docker Compose

## クイックスタート

### 1. 動画を配置

```bash
mkdir -p videos/旅行
cp /path/to/your/videos/*.mp4 videos/旅行/
```

サブフォルダがカテゴリとして扱われます。

### 2. 起動

```bash
docker compose up -d --build
```

### 3. アクセス

ブラウザで `http://localhost:3000` を開きます。
スマホの場合は `http://<Mac miniのIP>:3000` でアクセスできます。

## Mac mini デプロイ

### 初回セットアップ（Mac mini側）

```bash
# bare リポジトリ作成
git init --bare ~/video-share.git

# post-receive hook 設置（初回のみ手動コピー）
# deploy/post-receive を ~/video-share.git/hooks/post-receive にコピー
cp /Users/libre/Sources/video_share/deploy/post-receive ~/video-share.git/hooks/post-receive
chmod +x ~/video-share.git/hooks/post-receive
```

### 開発マシンからのデプロイ

```bash
# リモート追加（初回のみ）
git remote add mac-mini libre@<mac-mini-ip>:video-share.git

# pushで自動デプロイ
git push mac-mini main
```

## ディレクトリ構成

```
videos/          # 動画ファイル（git管理外）
  ├── 旅行/      # カテゴリ = フォルダ名
  ├── 料理/
  └── sample.mp4 # カテゴリ = 未分類

data/            # DB + サムネイル（git管理外、Docker volumeで永続化）
```

## API

| エンドポイント | 説明 |
|--------------|------|
| `GET /api/videos` | 動画一覧（ページネーション、検索、ソート対応） |
| `GET /api/videos/{id}` | 動画詳細 |
| `PUT /api/videos/{id}` | メタデータ編集 |
| `GET /api/videos/{id}/stream` | 動画ストリーミング（Range Request対応） |
| `GET /api/videos/{id}/thumbnail` | サムネイル画像 |
| `GET /api/categories` | カテゴリ一覧 |
| `POST /api/scan` | ディレクトリ再スキャン |
