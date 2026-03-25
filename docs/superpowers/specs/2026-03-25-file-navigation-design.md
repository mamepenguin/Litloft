# ファイル詳細ページ 前後ナビゲーション設計書

## 概要

ファイル詳細ページ (`/files/[id]`) でフォルダ内の前後ファイルに移動できるナビゲーション機能を追加する。現在は毎回フォルダ一覧に戻る必要があり、画像ブラウジングや連続動画視聴のUXが悪い。

## 設計方針

- **フロントエンドのみの変更**。Backend APIの追加・変更なし
- 既存の `getDriveFiles()` API を活用して前後ファイルを取得
- 一覧ページのソート順をクエリパラメータで詳細ページに引き継ぐ

## データフロー

```
一覧ページ (FolderBrowser)
  ↓ リンクに ?sort=title&order=asc を付与
ファイル詳細ページ (/files/[id]?sort=title&order=asc)
  ↓ file.drive, file.folder_path + sort/order で getDriveFiles() を呼ぶ
  ↓ レスポンスから現在ファイルの前後IDを特定
  ↓ 前後移動時: /files/{prevId}?sort=title&order=asc に遷移
```

## 前後ファイルの取得ロジック

1. ファイル詳細を取得後、`getDriveFiles(file.drive, { path: file.folder_path, sort, order, limit: 200 })` を呼ぶ
2. レスポンスの `data` 配列から現在のファイルIDのインデックスを探す
3. `index - 1` が前のファイル、`index + 1` が次のファイル
4. 先頭/末尾ではボタンを `disabled` にする（ループしない）
5. ファイル数が200を超える場合: `meta.total > 200` なら、現在ファイルが見つからない場合にページを変えて再取得する（エッジケース対応）

### クエリパラメータが無い場合

直接URLアクセスや外部リンクなど、`sort`/`order` パラメータが無い場合はデフォルト値（`created_at` / `desc`）を使用する。

### 特殊ビューからの遷移

お気に入り (`favorite=true`)、タグフィルタ (`tag=xxx`) などの特殊ビューからの遷移は、初期実装ではスコープ外とする。これらのビューからファイル詳細に遷移した場合、`sort`/`order` のみが渡され、通常のフォルダ内ナビゲーションとなる。

## UI

### 矢印ボタン

- プレビュー領域の左右にオーバーレイで `ChevronLeft` / `ChevronRight` ボタンを配置
- ホバー時に表示、常時は半透明
- モバイルでは常時表示（タッチでホバーが使えないため）
- 先頭/末尾では該当ボタンを非表示
- 前後ファイル取得中（ローディング中）はボタン非表示

### キーボードショートカット

| ファイルタイプ | `←` キー | `→` キー |
|-------------|---------|---------|
| image, document, other | 前のファイルに移動 | 次のファイルに移動 |
| video, audio | 無効（シークに使用） | 無効（シークに使用） |

- `keydown` イベントリスナーで実装
- テキスト入力中（`input`, `textarea` にフォーカス中）は無効

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/components/FileCard.tsx` | リンクに `sort` / `order` クエリパラメータを付与 |
| `frontend/src/components/FileList.tsx` | 同上（リスト表示のリンク） |
| `frontend/src/components/FolderBrowser.tsx` | 現在の `sort` / `order` を FileCard / FileList に渡す |
| `frontend/src/app/files/[id]/page.tsx` | 前後ナビゲーションのロジックとUI追加 |

新規ファイルの作成は不要。

## テスト

- ファイル詳細ページの前後ナビゲーションボタン表示/非表示
- キーボードショートカットの動作（画像ファイル時のみ有効）
- 先頭/末尾での境界処理
- クエリパラメータなしの場合のデフォルト動作
