# ドライブ + フォルダ階層ナビゲーション 設計書

## 概要

Video Share に「ドライブ」と「フォルダ階層ナビゲーション」を追加する。

- **ドライブ**: 論理的なコンテンツ領域の分離。家族ビデオとテレビ番組のように、ジャンルが全く異なる動画を独立した領域として管理する。タグ等もドライブ間で混合しない。
- **フォルダ階層**: ファイラーのようにネストしたフォルダを辿れるUI。現在の1階層カテゴリを、実際のディレクトリ構造に合わせた多階層ナビゲーションに拡張する。

### 参考UI

STB NAS のファイラーUIを参考にする:
- サイドバーに LIBRARY / TAGS / DRIVES セクション
- メインエリアにフォルダとファイルの混在表示（フォルダ先頭）
- パンくずリストで階層ナビゲーション

## データモデル

### Video テーブル変更

```
変更前: category (String) — トップレベルフォルダ名のみ
変更後: drive (String, NOT NULL) — ドライブ名
        folder_path (String, NOT NULL, default="") — ドライブルートからの相対フォルダパス
```

- `category` カラムを `folder_path` にリネーム
- `drive` カラムを追加
- ルート直下のファイルは `folder_path = ""`
- ネストしたフォルダは `folder_path = "アクション/SF"` のようにスラッシュ区切り

例:
| file_path | drive | folder_path |
|-----------|-------|-------------|
| movie.mp4 | テレビ番組 | (空文字) |
| アクション/movie.mp4 | テレビ番組 | アクション |
| アクション/SF/movie.mp4 | テレビ番組 | アクション/SF |

インデックス:
- `idx_videos_drive_folder_path` (drive, folder_path) — 複合インデックス。フォルダ一覧APIの `WHERE drive = :drive AND folder_path LIKE ...` に最適
- `idx_videos_drive` (drive) は不要（複合インデックスの先頭で代替）

### Tag テーブル変更

```
変更前: id, name (UNIQUE), created_at
変更後: id, name, drive (String, NOT NULL), created_at
        UNIQUE(drive, name)
```

ドライブごとにタグが独立する。同名タグでもドライブが違えば別エンティティ。

### Drive 設定（DB外）

ドライブはDBテーブルではなく設定ファイルで管理する。

```json
// drives.json
[
  { "name": "家族ビデオ", "path": "/app/drives/family" },
  { "name": "テレビ番組", "path": "/app/drives/tv" }
]
```

理由: ドライブの追加/削除はDockerのボリュームマウントと連動するため、設定ファイルのほうが管理しやすい。

### 空フォルダについて

現時点ではフォルダをDBで管理せず、動画の `folder_path` から動的に算出する（パスベース）。空フォルダは表示されない。

将来アップロード機能を追加する際に `folders` テーブルを新設して対応する。APIの入出力は変わらず、バックエンドの内部実装のみ差し替える形で手戻りは最小限。

## API設計

### 新規エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/drives` | ドライブ一覧（名前のみ） |
| GET | `/api/drives/{drive}/folders?path=` | 指定パス配下の直下サブフォルダ一覧（名前+動画数） |
| GET | `/api/drives/{drive}/videos?path=&search=&sort=&order=&page=&limit=&favorite=&tag=` | 指定パス配下の動画一覧 |
| GET | `/api/drives/{drive}/tags` | ドライブ内のタグ一覧 |
| POST | `/api/drives/{drive}/scan` | ドライブ単位でスキャン |

### 既存エンドポイント（変更なし or 軽微な変更）

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/videos/{id}` | 動画詳細（IDはグローバル一意、ドライブ指定不要） |
| GET | `/api/videos/{id}/stream` | ストリーミング |
| GET | `/api/videos/{id}/thumbnail` | サムネイル |
| PUT | `/api/videos/{id}` | メタデータ編集 |
| PUT | `/api/videos/{id}/tags` | タグ編集（タグのドライブは動画のドライブから自動決定） |
| POST | `/api/videos/{id}/like` | いいね |
| POST | `/api/videos/{id}/dislike` | わるいね |
| POST | `/api/videos/{id}/favorite` | お気に入りトグル |

### 廃止エンドポイント

| メソッド | パス | 理由 |
|---------|------|------|
| GET | `/api/categories` | ドライブ内フォルダ一覧に置き換え |
| GET | `/api/videos?category=...` | `/api/drives/{drive}/videos?path=...` に置き換え |
| POST | `/api/scan` | `/api/drives/{drive}/scan` に置き換え |
| GET | `/api/tags` | `/api/drives/{drive}/tags` に置き換え |

### フォルダ一覧APIの詳細

`GET /api/drives/{drive}/folders?path=`

- `path` 省略時はルート直下のフォルダを返す
- `path=アクション` なら「アクション」フォルダ内の直下サブフォルダを返す

レスポンス:
```json
[
  { "name": "SF", "path": "アクション/SF", "video_count": 12 },
  { "name": "コメディ", "path": "アクション/コメディ", "video_count": 5 }
]
```

内部実装: `folder_path` の前方一致 + 次の階層のみ抽出
```sql
SELECT DISTINCT
  -- folder_path から path プレフィックスを除いた最初のセグメントを抽出
FROM videos
WHERE drive = :drive AND folder_path LIKE :path || '%'
```

### 動画一覧APIの詳細

`GET /api/drives/{drive}/videos?path=アクション`

- 指定パス **直下** の動画のみ返す（サブフォルダの動画は含まない）
- `folder_path` の完全一致でフィルタ

## フロントエンド

### ルーティング

| パス | 表示内容 |
|------|---------|
| `/` | ドライブ一覧（トップページ） |
| `/drive/[name]` | ドライブのルート: サブフォルダ一覧 + 直下動画 |
| `/drive/[name]/[...path]` | サブフォルダ: サブフォルダ一覧 + 直下動画 |
| `/drive/[name]?view=favorites` | ドライブ内のお気に入り動画一覧 |
| `/videos/[id]` | 動画再生ページ（現行と同じ） |

全階層のURLがブックマーク可能。

### メインエリア表示

ファイラー風のレイアウト:

1. **パンくずリスト**: `HOME > テレビ番組 > アクション > SF` （各階層がリンク）
2. **サブフォルダ一覧**: フォルダアイコン + 名前 + 動画数（グリッド表示）
3. **動画一覧**: 既存のグリッド/リスト表示（ViewToggle対応）

### サイドバー

```
LIBRARY
  ホーム          → /
  お気に入り      → /drive/{current}?view=favorites
  すべての動画    → /drive/{current}?view=all

TAGS
  (選択中ドライブのタグのみ表示)
  #night          → /drive/{current}?tag=night
  #tokyo          → /drive/{current}?tag=tokyo

DRIVES
  家族ビデオ      → /drive/家族ビデオ (選択中はハイライト)
  テレビ番組      → /drive/テレビ番組
```

- ドライブ選択で LIBRARY / TAGS セクションの内容がそのドライブに連動
- 現在の「Categories」セクションは廃止（フォルダはメインエリアで辿る）

### 型定義

```typescript
interface Drive {
  name: string;
}

interface Folder {
  name: string;
  path: string;
  video_count: number;
}

interface Video {
  // 既存フィールド + drive, folder_path
  // category は削除
  drive: string;
  folder_path: string;
}
```

### 新規コンポーネント

- `FolderCard` — フォルダアイテム表示（アイコン + 名前 + 動画数）
- `Breadcrumb` — パンくずリスト
- `DriveCard` — トップページのドライブ表示（アイコン + 名前）
- `FolderBrowser` — フォルダ一覧 + 動画一覧の統合表示

## Docker / 設定

### docker-compose.yml

```yaml
services:
  backend:
    build: ./backend
    expose:
      - "8000"
    volumes:
      - ./drives.json:/app/drives.json:ro
      - /path/to/family:/app/drives/family:ro
      - /path/to/tv:/app/drives/tv:ro
      - ./data:/app/data
    environment:
      - DRIVES_CONFIG=/app/drives.json
      - DATA_DIR=/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

- `VIDEOS_DIR` 環境変数は廃止、`DRIVES_CONFIG` に置き換え
- 各ドライブのディレクトリを個別に `:ro` でマウント
- `drives.json` もマウント

### config.py 変更

```python
import json

DRIVES_CONFIG = Path(os.getenv("DRIVES_CONFIG", "./drives.json"))
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))

# 起動時にロードしてキャッシュ（drives.json変更時はコンテナ再起動）
_drives_cache: list[dict] | None = None

def load_drives() -> list[dict]:
    global _drives_cache
    if _drives_cache is None:
        with open(DRIVES_CONFIG) as f:
            _drives_cache = json.load(f)
    return _drives_cache

def get_drive_path(drive_name: str) -> Path:
    for drive in load_drives():
        if drive["name"] == drive_name:
            return Path(drive["path"])
    raise ValueError(f"Drive not found: {drive_name}")
```

注意: scanner.py の既存の `from app.config import VIDEOS_DIR` は CLAUDE.md のルールに違反している。ドライブ対応と同時に `import app.config as config` パターンに修正する。

### サムネイル保存

```
data/
  videos.db
  thumbnails/
    {drive_name}/
      {folder_path}/
        {video_stem}.jpg
```

ドライブごとにサムネイルを分離。

## DBマイグレーション

### file_path のセマンティクス

`file_path` は現在 `VIDEOS_DIR` からの相対パス。ドライブ導入後は各ドライブルートからの相対パスになる。既存データが単一ドライブに統合される場合、値は変わらない（`VIDEOS_DIR` がそのままドライブルートになるため）。

ストリーミング・サムネイルのパス構築は `config.VIDEOS_DIR / video.file_path` → `config.get_drive_path(video.drive) / video.file_path` に変更。

### Tag テーブルの再作成

SQLite は既存のユニーク制約を ALTER TABLE で変更できない。Tag テーブルは再作成が必要:

1. `tags_new` テーブルを `UNIQUE(drive, name)` で作成
2. 既存データをコピー（全タグにデフォルトドライブを割り当て）
3. `video_tags` の外部キーを維持するため、ID を保持してコピー
4. `tags` を DROP → `tags_new` を `tags` にリネーム

### マイグレーション手順

1. `videos` テーブルに `drive` カラム追加（デフォルト値: drives.json の最初のドライブ名）
2. `videos` テーブルの `category` を `folder_path` にリネーム（`ALTER TABLE videos RENAME COLUMN`）
3. Tag テーブルを再作成（上記手順）
4. 複合インデックス `idx_videos_drive_folder_path` を作成

注意: マイグレーション前にDBバックアップを取ること。`UNCATEGORIZED = "未分類"` 定数は廃止。

## Startup スキャン

現在の `main.py` は startup 時に `scan_videos_directory()` を呼んでいる。ドライブ導入後は全ドライブを順番にスキャンする:

```python
@app.on_event("startup")
async def startup():
    for drive in config.load_drives():
        await scan_drive(drive["name"])
```

## 設計判断の記録

- ドライブ横断操作（検索、お気に入り）: **不要**。各ドライブは完全に独立した領域
- お気に入りURL: **`/drive/[name]?view=favorites`**（クエリパラメータ）。`favorites` フォルダ名との競合を回避
- ドライブ設定方式: **設定ファイル（drives.json）**。Web UIからの追加はDocker制約上不可
- 1ドライブ = 1ホストディレクトリ。複数ディレクトリの統合は不要
- 空フォルダ: **今回は非対応**。将来のアップロード機能実装時にFolderテーブルを新設
- フォルダ管理: **パスベース（アプローチA）**。Folderテーブルは作らず `folder_path` から動的算出
- サイドバーのTAGSセクション: 選択中ドライブに連動して絞り込み

## 影響を受ける既存ファイル

### Backend
- `app/config.py` — VIDEOS_DIR 廃止、DRIVES_CONFIG 追加
- `app/models.py` — Video: category→folder_path, drive追加。Tag: drive追加
- `app/schemas.py` — レスポンス/リクエストスキーマ更新
- `app/database.py` — 変更なし
- `app/routers/videos.py` — ドライブスコープ対応、パス検証の修正
- `app/routers/categories.py` — 廃止 → `app/routers/drives.py` に置き換え
- `app/services/scanner.py` — ドライブ単位スキャン、folder_path算出
- `app/services/thumbnail.py` — サムネイルパスのドライブ対応
- `app/main.py` — ルーター登録変更

### Frontend
- `src/types/index.ts` — Drive, Folder型追加、Video型変更
- `src/lib/api.ts` — 全API関数をドライブ対応に更新
- `src/app/page.tsx` — カテゴリ一覧 → ドライブ一覧
- `src/app/category/[slug]/page.tsx` — 廃止
- `src/app/drive/[name]/page.tsx` — 新規: ドライブルート
- `src/app/drive/[name]/[...path]/page.tsx` — 新規: フォルダブラウザ
- お気に入りは `?view=favorites` クエリパラメータで処理（専用ページ不要）
- `src/components/Sidebar.tsx` — ドライブ連動に変更
- `src/components/VideoCard.tsx` — category → folder_path
- `src/components/VideoListPage.tsx` — ドライブ対応
- 新規コンポーネント: FolderCard, Breadcrumb, DriveCard, FolderBrowser

### インフラ
- `docker-compose.yml` — ボリュームマウント変更
- `drives.json` — 新規: ドライブ設定ファイル
- `deploy/post-receive` — drives.json の扱い確認
- `drives.json.example` — リポジトリに含めるサンプル。実体はデプロイ先で管理（git管理外）

### テスト
- Backend: 既存テストの category → folder_path + drive 対応、新規テスト追加
- Frontend: 既存テストの修正、新規コンポーネントのテスト追加
