# フォルダピン留め機能 設計書

## 概要

サイドバーによく使うフォルダをピン留めし、素早くアクセスできるようにする。

## 要件

- 現在選択中のドライブのピン留めフォルダのみサイドバーに表示
- ピン留めデータはバックエンドDB（全デバイス共有、永続化）
- ピン留め操作はFolderCardのUIから行う
- 並び順はピン留めした順（id昇順）
- 表示名はパスの末尾から動的取得（`path.split("/").pop()`）

## データモデル

### `pinned_folders` テーブル

| カラム | 型 | 説明 |
|--------|------|------|
| id | INTEGER PK AUTOINCREMENT | 自動採番（並び順にも使用） |
| drive | VARCHAR NOT NULL | ドライブ名 |
| path | VARCHAR NOT NULL | フォルダパス（例: `"Movies/Action"`） |
| created_at | DATETIME | ピン留め日時 |

- `UNIQUE(drive, path)` で重複防止

## API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/drives/{drive}/pins` | ピン留め一覧（id昇順） |
| POST | `/api/drives/{drive}/pins` | ピン留め追加 |
| DELETE | `/api/drives/{drive}/pins` | ピン留め解除 |

### リクエスト/レスポンス

```
GET /api/drives/{drive}/pins
→ [{ "path": "Movies/Action" }, { "path": "Music" }]

POST /api/drives/{drive}/pins
← { "path": "Movies/Action" }
→ { "path": "Movies/Action" }

DELETE /api/drives/{drive}/pins?path=Movies/Action
→ 204 No Content
```

## フロントエンド

### サイドバー変更

Library と Tags セクションの間に「Pins」セクションを追加:

```
Library
  ホーム
  お気に入り
  最近再生
  最近追加
  すべてのファイル
Pins              ← 新規セクション
  📁 Action       ← path末尾を表示、クリックでフォルダに遷移
  📁 Music
Tags
  ...
Drives
  ...
```

- ピン留めフォルダクリック → `/drive/{drive}/{path}` に遷移
- ピン留めが0件 → セクション非表示
- 現在のドライブのピンのみ表示（Tags と同じパターン）

### FolderCard変更

- ピン留めトグルボタンを追加（lucide `Pin` / `PinOff` アイコン）
- ピン留め済みフォルダはアイコンをハイライト表示

## 既存機能との整合性

- **フォルダリネーム**: ピン留めされたフォルダをリネームした場合、パスが変わるためピンは自動的に無効になる（該当パスが存在しなくなるだけ）。フォルダリネーム時にピンも更新する対応は将来検討。
- **フォルダ削除**: 同上。存在しないパスのピンはサイドバーに表示されるが、クリックすると空のフォルダビューになる。
- **ドライブスキャン**: ピンはファイルシステムと独立なので影響なし。
- **アクセス制御**: ピン一覧APIもドライブスコープなので、保護ドライブの不可視性は既存のミドルウェアで担保。

## マイグレーション

新テーブル追加のみ。`database.py` の `_migrate()` で `pinned_folders` テーブルが存在しなければ作成。
