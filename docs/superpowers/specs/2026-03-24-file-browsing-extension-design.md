# Phase A: ファイル閲覧の拡張 — 設計書

## 概要

video_share を「動画専用ストリーミングアプリ」から「動画プレーヤーをメインとしたファイルマネージャー」に拡張する Phase A。動画以外のファイルも一覧表示・管理できるよう DB・API・フロントエンドを変更する。

将来の拡張計画:
- **Phase A** (本設計): ファイル閲覧の拡張
- **Phase B**: ファイル操作（アップロード、ダウンロード、フォルダ作成/リネーム/削除）
- **Phase C**: UI拡張（コンテキストメニュー、Cmd+Shift+F 検索）

## 設計判断

### DB設計方針: 単一テーブル統合
- `Video` テーブルを汎用 `File` テーブルに統合
- `videos` テーブルは廃止（duration は File に nullable で統合）
- DB が Single Source of Truth（ファイルシステム直接参照は複雑すぎるため却下）
- likes, dislikes, is_favorite, tags は File レベルに引き上げ（動画以外にも適用可能）
- thumbnail_path も File レベル（将来の画像サムネイル対応のため）

### スキャン対象
- 隠しファイル（`.` 始まり）以外の全ファイル
- ホワイトリスト/ブラックリスト方式は採用しない

### ファイルタイプ分類: 大分類 + MIME タイプの2カラム
- `file_type`: video / image / audio / document / other（UIフィルタ・アイコン切り替え）
- `mime_type`: video/mp4, image/jpeg 等（Content-Type 決定・プレビュー方式判定）

### Folder テーブル
- Phase A で定義、Phase B で実装
- files と folders 間に FK は張らない（folder_path 文字列で暗黙関連）

## DBスキーマ

### files テーブル（新規）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | INTEGER | PK, AUTO | |
| filename | TEXT | NOT NULL | |
| title | TEXT | NOT NULL | |
| description | TEXT | DEFAULT '' | |
| drive | TEXT | NOT NULL, DEFAULT '' | |
| folder_path | TEXT | NOT NULL, DEFAULT '' | |
| file_path | TEXT | NOT NULL, UNIQUE | ドライブルートからの相対パス |
| file_size | INTEGER | NOT NULL | |
| file_type | TEXT | NOT NULL, DEFAULT 'other' | video/image/audio/document/other |
| mime_type | TEXT | NOT NULL, DEFAULT 'application/octet-stream' | |
| thumbnail_path | TEXT | nullable | |
| duration | REAL | nullable | video/audio のみ |
| likes | INTEGER | DEFAULT 0 | |
| dislikes | INTEGER | DEFAULT 0 | |
| is_favorite | BOOLEAN | DEFAULT 0 | |
| created_at | DATETIME | | |
| updated_at | DATETIME | | |

インデックス: (drive, folder_path), (title), (is_favorite), (file_type)

### folders テーブル（Phase B で実装）

| カラム | 型 | 制約 |
|--------|-----|------|
| id | INTEGER | PK, AUTO |
| drive | TEXT | NOT NULL |
| path | TEXT | NOT NULL |
| name | TEXT | NOT NULL |
| created_at | DATETIME | |

UNIQUE: (drive, path)

### file_tags 中間テーブル（video_tags からリネーム）

| カラム | 型 | 制約 |
|--------|-----|------|
| file_id | INTEGER | FK → files.id, CASCADE |
| tag_id | INTEGER | FK → tags.id, CASCADE |

PK: (file_id, tag_id)

### tags テーブル
変更なし。

### tags テーブルのリレーション変更
- `Tag.videos` リレーション → `Tag.files` にリネーム
- `back_populates="tags"` は維持

### マイグレーション
1. files テーブル作成
2. videos → files へデータコピー（**id を保持**、file_type='video', mime_type='video/mp4'）
   - `INSERT INTO files SELECT id, filename, title, description, drive, folder_path, file_path, file_size, 'video', 'video/mp4', thumbnail_path, duration, likes, dislikes, is_favorite, created_at, updated_at FROM videos`
   - ID 保持により既存のブックマーク等が無効にならない
3. file_tags テーブル作成、video_tags からデータコピー（video_id → file_id）
4. 旧 videos, video_tags テーブル削除

## API

### FileResponse スキーマ

```
FileResponse:
  id: int
  filename: str
  title: str
  description: str
  drive: str
  folder_path: str
  file_type: str          # 新規
  mime_type: str           # 新規
  thumbnail_url: str       # /api/files/{id}/thumbnail
  file_size: int
  duration: float | null   # video/audio のみ
  likes: int
  dislikes: int
  is_favorite: bool
  tags: list[str]
  created_at: str
  updated_at: str
```

### URLパスリネーム
`/api/videos/*` → `/api/files/*`（後方互換不要）

### ドライブスコープ

| メソッド | パス | 変更 |
|---------|------|------|
| GET | /api/drives | 変更なし |
| GET | /api/drives/{drive}/folders?path= | video_count → file_count |
| GET | /api/drives/{drive}/files?path=&search=&sort=&order=&page=&limit=&favorite=&tag=&type= | type フィルタ追加 |
| GET | /api/drives/{drive}/tags | file_tags から集計 |
| POST | /api/drives/{drive}/scan | 全ファイル対象 |

### グローバル（IDベース）

| メソッド | パス | 変更 |
|---------|------|------|
| GET | /api/files/{id} | |
| PUT | /api/files/{id} | |
| GET | /api/files/{id}/stream | 下記「ストリーム/サムネイル動作」参照 |
| GET | /api/files/{id}/thumbnail | 下記「ストリーム/サムネイル動作」参照 |
| POST | /api/files/{id}/like | |
| POST | /api/files/{id}/dislike | |
| POST | /api/files/{id}/favorite | |
| PUT | /api/files/{id}/tags | |

### ストリーム動作 (GET /api/files/{id}/stream)
- Content-Type を `mime_type` から動的決定（現在の `video/mp4` ハードコードを置換）
- video: Range Request 対応を維持（206 Partial Content）
- それ以外: Range Request 対応を維持（画像・PDF 等もブラウザ側で Range を使う場合がある）
- ダウンロード用途は Phase B で `Content-Disposition: attachment` を追加予定

### サムネイル動作 (GET /api/files/{id}/thumbnail)
- video: ffmpeg で生成（既存動作を維持）
- image: Phase A では placeholder。将来リサイズサムネイル対応予定
- audio / document / other: placeholder.jpg を返す

## スキャナー

### 変更点
- `rglob("*.mp4")` → `rglob("*")` + `is_file()` + 隠しファイル除外
- 新規 `services/filetype.py` で分類ロジックを分離
  - `classify(filename) → (file_type, mime_type)`
  - `is_hidden(path) → bool`
- video/audio: ffprobe で duration 取得
- video: ffmpeg でサムネイル生成（既存のまま）

### file_type マッピング

| file_type | 拡張子例 | 追加処理 |
|-----------|---------|---------|
| video | .mp4, .mkv, .avi, .mov, .webm | duration + thumbnail |
| image | .jpg, .png, .gif, .webp, .svg | なし |
| audio | .mp3, .flac, .wav, .aac, .ogg | duration |
| document | .pdf, .txt, .doc, .xlsx | なし |
| other | 上記以外 | なし |

## フロントエンド

### 型定義
- `Video` → `FileItem`（file_type, mime_type 追加）
- `Folder.video_count` → `Folder.file_count`
- `FileType = "video" | "image" | "audio" | "document" | "other"`

### コンポーネント

| 既存 | 変更後 | 内容 |
|------|--------|------|
| VideoCard | FileCard | file_type でアイコン/サムネイル切り替え |
| VideoGrid | FileGrid | FileCard 使用 |
| VideoList | FileList | FileCard 使用 |
| VideoPlayer | 維持 | 変更なし |
| — | FilePreview（新規） | file_type 分岐ラッパー |
| — | FileTypeIcon（新規） | lucide-react アイコン |

### ページ
- `/videos/[id]` → `/files/[id]`（FilePreview 使用）
- FolderBrowser: 「動画を検索」→「ファイルを検索」
- Sidebar: 「すべての動画」→「すべてのファイル」
- FolderCard: 「N 本」→「N 件」
