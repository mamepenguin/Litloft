# ファイル詳細ページ 前後ナビゲーション設計書

## 概要

ファイル詳細ページ (`/files/[id]`) でフォルダ内の前後ファイルに移動できるナビゲーション機能を追加する。現在は毎回フォルダ一覧に戻る必要があり、画像ブラウジングや連続動画視聴のUXが悪い。

## 設計方針

- 一覧ページのソート順をクエリパラメータで詳細ページに引き継ぐ
- Backend に `neighbors` エンドポイントを追加し、SQLで前後ファイルIDを1クエリで返す
- フロントでのページネーション処理やファイル一覧の追加取得は不要

## Backend API

### `GET /api/files/{id}/neighbors`

指定ファイルと同一ドライブ・同一フォルダ内で、指定ソート順における前後のファイルIDを返す。

#### クエリパラメータ

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `sort` | `created_at` | ソートカラム (`created_at`, `title`, `file_size`, `likes`) |
| `order` | `desc` | ソート方向 (`asc`, `desc`) |

`sort=random` は受け付けない（バリデーションエラー 422）。ランダム順では前後が定義できないため。

#### レスポンス

```json
{
  "prev_id": "abc123def456" | null,
  "next_id": "xyz789ghi012" | null
}
```

先頭ファイルの場合 `prev_id` が `null`、末尾ファイルの場合 `next_id` が `null`。

#### 実装方針

SQLAlchemy で同一フォルダ内のファイルをソートし、現在ファイルの前後1件ずつを取得する。SQLite にはウィンドウ関数 (`LAG`/`LEAD`) があるが、SQLAlchemy での記述が煩雑なため、以下のアプローチを取る:

1. 同一 drive + folder_path のファイルにフィルタ
2. ソート条件で「現在のファイルより前」の最後の1件 → `prev_id`
3. ソート条件で「現在のファイルより後」の最初の1件 → `next_id`

これにより2つの単純なクエリで前後IDが得られる。ファイル数に依存しない O(1) のパフォーマンス。

#### ソート条件の比較ロジック

`sort=title&order=asc` の例:
- **prev**: `WHERE (title < current.title) OR (title = current.title AND id < current.id) ORDER BY title DESC, id DESC LIMIT 1`
- **next**: `WHERE (title > current.title) OR (title = current.title AND id > current.id) ORDER BY title ASC, id ASC LIMIT 1`

同値の場合は `id` で安定ソートする（一覧APIの `ORDER BY sort_column, id` と一致させる）。

注意: 一覧APIの既存ソートは `id` による安定化を行っていない。neighbors の結果と一貫性を持たせるため、一覧API側にも `id` によるセカンダリソートを追加する。

#### アクセス制御

ファイルの `drive` を取得した時点で `check_drive_access` を通す。保護ドライブのファイルは 404 を返す（既存のファイル詳細APIと同じ方針）。

## データフロー

```
一覧ページ (FolderBrowser)
  ↓ リンクに ?sort=title&order=asc を付与
ファイル詳細ページ (/files/[id]?sort=title&order=asc)
  ↓ getFile(id) でファイル詳細を取得
  ↓ getFileNeighbors(id, sort, order) で前後IDを取得
  ↓ 前後ボタンを表示
  ↓ クリック時: /files/{neighborId}?sort=title&order=asc に遷移
```

### クエリパラメータが無い場合

直接URLアクセスや外部リンクなど、`sort`/`order` パラメータが無い場合はデフォルト値（`created_at` / `desc`）を使用する。

### `sort=random` からの遷移

一覧でランダムソートを選んでいた場合、FileCard/FileList のリンクには `sort`/`order` を付与しない。詳細ページではデフォルトの `created_at`/`desc` で前後ナビゲーションが動作する。

### 特殊ビューからの遷移

お気に入り (`favorite=true`)、タグフィルタ (`tag=xxx`) などの特殊ビューからの遷移は、初期実装ではスコープ外とする。これらのビューからファイル詳細に遷移した場合、`sort`/`order` のみが渡され、通常のフォルダ内ナビゲーションとなる。

## UI

### 矢印ボタン

- プレビュー領域の左右にオーバーレイで `ChevronLeft` / `ChevronRight` ボタンを配置
- ホバー時に表示、常時は半透明
- モバイルでは常時表示（タッチでホバーが使えないため）
- `prev_id` / `next_id` が `null` の場合、該当ボタンを非表示
- neighbors 取得中はボタン非表示

### キーボードショートカット

| ファイルタイプ | `←` キー | `→` キー |
|-------------|---------|---------|
| image, document, other | 前のファイルに移動 | 次のファイルに移動 |
| video, audio | 無効（シークに使用） | 無効（シークに使用） |

- `keydown` イベントリスナーで実装
- テキスト入力中（`input`, `textarea`, `[contenteditable]` にフォーカス中）は無効

### エラーハンドリング

- neighbors 取得失敗: ナビゲーションボタンを非表示にする（エラー表示はしない）
- 前後ファイルに遷移後 404: フォルダ一覧にリダイレクト

## 変更対象ファイル

### Backend

| ファイル | 変更内容 |
|---------|---------|
| `backend/app/schemas.py` | `NeighborsResponse` スキーマ追加 |
| `backend/app/routers/files.py` | `GET /api/files/{id}/neighbors` エンドポイント追加 |
| `backend/app/routers/drives.py` | 一覧APIのソートに `id` によるセカンダリソートを追加 |

### Frontend

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/types/index.ts` | `Neighbors` 型追加 |
| `frontend/src/lib/api.ts` | `getFileNeighbors()` 関数追加 |
| `frontend/src/components/FileCard.tsx` | リンクに `sort` / `order` クエリパラメータを付与 |
| `frontend/src/components/FileList.tsx` | 同上 |
| `frontend/src/components/FolderBrowser.tsx` | 現在の `sort` / `order` を FileCard / FileList に渡す |
| `frontend/src/app/files/[id]/page.tsx` | 前後ナビゲーションのロジックとUI追加 |

新規ファイルの作成は不要。

## 将来の拡張性

### プレイリスト機能との関係

この設計はフォルダコンテキスト専用。将来プレイリスト機能を追加する場合、プレイリストはアイテムIDの順序リストをフロントが保持するため、API不要で前後を特定できる（`?playlist=xxx&index=3` 等のクエリパラメータで管理）。`neighbors` エンドポイントの汎用化は不要。

## テスト

### Backend
- neighbors エンドポイントの正常系（前後あり、先頭、末尾）
- 各ソートカラム × asc/desc の組み合わせ
- 同値ファイル（同じ title 等）での安定ソート
- sort=random のバリデーションエラー
- 存在しないファイルIDで 404
- 保護ドライブのファイルで 404

### Frontend
- 前後ナビゲーションボタンの表示/非表示
- キーボードショートカットの動作（画像ファイル時のみ有効）
- テキスト入力中のショートカット無効化
- クエリパラメータなしの場合のデフォルト動作
- sort=random 時のリンクにパラメータが付かないこと
