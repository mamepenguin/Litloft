# お気に入り・タグ機能 設計書

## 概要

Video Share にお気に入り機能とタグ機能を追加する。合わせて、アプリ全体にサイドバーナビゲーションを導入し、お気に入り・タグ・カテゴリへの導線を一元化する。

### 要件

- お気に入り: 各動画にお気に入りフラグ（サーバー側DB保存）。一覧・再生画面どちらからもトグル可能。お気に入り専用ページ (`/favorites`) を新設。
- タグ: 動画に複数タグを付与可能。フリーテキスト入力 + 既存タグサジェスト。一覧にタグ表示、再生画面でタグ編集。タグでフィルター可能。
- サイドバー: 全ページ共通。LIBRARY / CATEGORIES / TAGS の3セクション。モバイルはハンバーガーメニューでオーバーレイ表示。

### 前提・制約

- 認証なし（自宅LAN、1人利用）
- 将来認証追加の可能性あり。ただし1人用のため、お気に入り・タグにユーザー区別は不要
- 既存スタック: FastAPI + SQLite / Next.js 16 + Tailwind CSS v4

---

## データモデル

### Video テーブル（既存に追加）

| カラム | 型 | デフォルト | 説明 |
|--------|-----|-----------|------|
| is_favorite | BOOLEAN | false | お気に入りフラグ |

### Tag テーブル（新規）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER PK | 自動採番 |
| name | VARCHAR UNIQUE | タグ名（例: "night", "tokyo"） |
| created_at | DATETIME | 作成日時 |

### video_tags テーブル（新規・中間テーブル）

| カラム | 型 | 説明 |
|--------|-----|------|
| video_id | INTEGER FK → videos.id | ON DELETE CASCADE |
| tag_id | INTEGER FK → tags.id | ON DELETE CASCADE |
| (PK) | (video_id, tag_id) 複合主キー | |

### SQLAlchemy リレーション

- `video_tags` は `sqlalchemy.Table` で定義（ORM モデル不要）
- `Video.tags`: `relationship("Tag", secondary=video_tags, lazy="selectin")` — 一覧取得時に N+1 を回避
- `Tag.videos`: `relationship("Video", secondary=video_tags)` — タグ側からの逆参照

### インデックス

- `Index("idx_videos_is_favorite", "is_favorite")` — お気に入りフィルタ用

### タグのバリデーションルール

- 最大文字数: 30文字
- 大文字小文字: 保存時に小文字に正規化（`"Tokyo"` → `"tokyo"`）
- 使用可能文字: Unicode 文字、数字、ハイフン、アンダースコア。空白・特殊記号は不可
- 1動画あたりの最大タグ数: 10
- 孤立タグの自動削除: `PUT /api/videos/{id}/tags` でタグが外された際、動画数が0になったタグは自動削除

### マイグレーション

既存の `database.py` の `_migrate()` パターンに従い、`init_db()` 実行時に:
- `videos` テーブルに `is_favorite` カラムがなければ `ALTER TABLE` で追加
- `tags` / `video_tags` テーブルは `create_all` で自動作成

---

## API エンドポイント

### 新規

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/videos/{id}/favorite | お気に入りトグル（ON↔OFF）。更新後の Video を返す |
| GET | /api/tags | タグ一覧（動画数付き）。`[{"name": "night", "count": 3}, ...]` |
| PUT | /api/videos/{id}/tags | 動画のタグを一括設定。`{"tags": ["night", "tokyo"]}` 存在しないタグは自動作成。更新後の Video を返す |

### 既存の拡張

| エンドポイント | 変更 |
|---|---|
| GET /api/videos | `favorite=true` パラメータ追加（お気に入りフィルター） |
| GET /api/videos | `tag=xxx` パラメータ追加（タグフィルター） |
| VideoResponse スキーマ | `is_favorite: bool` と `tags: list[str]` フィールド追加 |
| `_to_response()` ヘルパー | `is_favorite` と `tags`（リレーションから `[tag.name for tag in video.tags]`）を追加 |

---

## サイドバーレイアウト

### 構造

```
┌──────────────────┐
│ Video Share       │
├──────────────────┤
│ LIBRARY           │
│  🏠 ホーム         │
│  ⭐ お気に入り      │
│  🎬 すべての動画    │
├──────────────────┤
│ CATEGORIES        │
│  📁 旅行           │
│  📁 料理           │
│  📁 未分類         │
├──────────────────┤
│ TAGS              │
│  🏷 night          │
│  🏷 tokyo          │
└──────────────────┘
```

### レスポンシブ

- デスクトップ（>=768px）: サイドバー常時表示、幅 240px (`w-60`)
- モバイル（<768px）: サイドバー非表示。ヘッダーにハンバーガーアイコン → オーバーレイで表示
- 開閉状態は `localStorage` に保持

### 既存ページへの影響

- `layout.tsx`: SidebarProvider でラップ、`<aside>` + `<main>` の横並びレイアウトに変更
- `CategoryNav` コンポーネント: サイドバーに役割統合のため **削除**
- `category/[slug]/page.tsx`: CategoryNav 削除、`tag` クエリパラメータ対応追加

---

## お気に入り操作UI

### 一覧ページ（VideoCard / VideoList）

- サムネイル右上に星アイコン（lucide-react `Star`）をオーバーレイ配置
- デフォルト: 空の星（stroke のみ、半透明）。ホバー時に表示
- お気に入り済み: 塗りつぶした星（fill 黄色 `#facc15`）。常時表示
- クリックで POST /api/videos/{id}/favorite。`e.preventDefault()` + `e.stopPropagation()` でリンク遷移を防止
- UI更新戦略: 楽観的更新（クリック即座にアイコン切替、API失敗時にロールバック）

### 動画再生ページ

- Like/Dislike ボタンの横にお気に入りボタン配置
- 星アイコン + 「お気に入り」テキスト
- お気に入り済みは黄色塗りつぶし + 「お気に入り済み」テキスト

### お気に入りページ (`/favorites`)

- カテゴリページと同じ構造（検索、ソート、ページネーション、Grid/List 切替）
- `getVideos({ favorite: true, ... })` で取得
- 空の場合は EmptyState「お気に入りの動画がありません」

---

## タグUI

### 動画再生ページ（タグ編集）

- Like/Dislike ボタン行の下にタグエリア配置
- 現在のタグをピル型（`rounded-full bg-bg-card`）で表示、各タグに × ボタンで削除
- 末尾に「+ タグ追加」ボタン → インライン入力欄
- 入力中に既存タグをドロップダウンでサジェスト（GET /api/tags の結果からクライアント側フィルタ）
- Enter で確定。新規タグ名なら自動作成
- 確定ごとに PUT /api/videos/{id}/tags で全タグ一括送信

### 一覧ページ（タグ表示）

- VideoCard（グリッド）: タイトル下にタグをピル型で最大2つ。3つ以上は `+N` 省略
- VideoList（リスト）: カテゴリ・サイズの横にタグをピル型で最大3つ。4つ以上は `+N` 省略

### サイドバー TAGS セクション

- GET /api/tags で取得したタグ一覧を表示
- クリックで `/category/all?tag=xxx` にフィルター遷移（`/category/all` は既存ルート `/category/[slug]` の `slug=all` で、全カテゴリを対象にフィルタリング）
- 各タグ横に動画数バッジ

---

## コンポーネント構成

### 新規コンポーネント

| コンポーネント | 責務 |
|---|---|
| `Sidebar` | サイドバー本体。LIBRARY / CATEGORIES / TAGS セクション |
| `SidebarProvider` | サイドバー開閉状態の管理（Context + localStorage） |
| `FavoriteButton` | 星アイコンのトグルボタン。VideoCard / VideoList / 再生ページで共用 |
| `TagList` | ピル型タグの表示（一覧ページ用、表示のみ） |
| `TagEditor` | タグ追加/削除 + サジェスト（再生ページ用） |

### 既存コンポーネントの変更

| コンポーネント | 変更内容 |
|---|---|
| `layout.tsx` | SidebarProvider でラップ、aside + main レイアウトに変更 |
| `VideoCard` | FavoriteButton オーバーレイ追加、TagList 追加 |
| `VideoList` | FavoriteButton 追加、TagList 追加 |
| `videos/[id]/page.tsx` | FavoriteButton 追加、TagEditor 追加 |
| `category/[slug]/page.tsx` | CategoryNav 削除、tag クエリパラメータ対応 |

### 削除

- `CategoryNav` — サイドバーの CATEGORIES セクションに統合

### データフロー

```
Sidebar
  ├─ categories: GET /api/categories（既存）
  └─ tags: GET /api/tags（新規）

一覧ページ
  └─ videos: GET /api/videos?favorite=true&tag=xxx（既存API拡張）

FavoriteButton
  └─ POST /api/videos/{id}/favorite → コールバックで更新後 video を親に返す

TagEditor
  ├─ GET /api/tags（サジェスト用）
  └─ PUT /api/videos/{id}/tags → コールバックで更新後 video を親に返す
```

---

## 型定義の変更

### Backend (schemas.py)

```python
class VideoResponse(BaseModel):
    # 既存フィールド...
    is_favorite: bool
    tags: list[str]

class TagResponse(BaseModel):
    name: str
    count: int

class TagUpdate(BaseModel):
    tags: list[str]
```

### Frontend (types/index.ts)

```typescript
interface Video {
  // 既存フィールド...
  is_favorite: boolean;
  tags: string[];
}

interface Tag {
  name: string;
  count: number;
}
```

### Frontend API クライアント (api.ts) 追加関数

```typescript
toggleFavorite(id: number): Promise<Video>
getTags(): Promise<Tag[]>
updateVideoTags(id: number, tags: string[]): Promise<Video>
// getVideos の params に favorite?: boolean, tag?: string を追加
```

### Sidebar データ取得

Sidebar は layout に配置されるため、ナビゲーション毎の再取得を避ける。categories と tags は Sidebar コンポーネント内で `useEffect` で取得し state に保持。お気に入り/タグ操作後は Sidebar にコールバックで再取得を通知する。
