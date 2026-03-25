# プレイリスト機能設計書

## 概要

フォルダ内の音声/動画ファイルの連続再生と、ユーザーが作成・管理できるプレイリスト機能を提供する。

## 要件

- フォルダ内の音声+動画ファイルを連続再生できる（フォルダ自動プレイリスト）
- ユーザーが任意のファイルでプレイリストを作成・編集できる（ユーザー作成プレイリスト）
- 音声と動画の両方に対応
- プレイリストはドライブ内限定（ドライブ横断不可）
- データはDB永続化（デバイス間共有可能）

## データモデル

### Playlist テーブル

| カラム | 型 | 説明 |
|--------|------|------|
| id | str (nanoid) | 主キー |
| drive | str | 所属ドライブ名 |
| name | str | プレイリスト名（1〜100文字、同一ドライブ内で重複不可） |
| created_at | datetime | 作成日時 |
| updated_at | datetime | 更新日時 |

### PlaylistItem テーブル

| カラム | 型 | 説明 |
|--------|------|------|
| id | int (auto) | 主キー |
| playlist_id | str (FK → Playlist.id, CASCADE DELETE) | 所属プレイリスト |
| file_id | str (FK → File.id, CASCADE DELETE) | 対象ファイル |
| position | int | 曲順（0始まり） |
| created_at | datetime | 追加日時 |

**制約**:
- ファイル削除時はPlaylistItemもカスケード削除
- 同一ファイルを複数プレイリストに追加可能
- 同一プレイリスト内の重複は禁止（playlist_id + file_id でユニーク制約）

**バリデーション**:
- プレイリスト名: 1〜100文字、空文字不可
- 同一ドライブ内でプレイリスト名の重複不可（409 Conflict）
- アイテム追加時、ファイルのドライブとプレイリストのドライブが一致することを検証（不一致は400 Bad Request）

**positionの扱い**:
- カスケード削除でpositionに隙間が生じる可能性がある
- 隙間は許容し、ORDER BY position で順序を決定する（連番であることを前提としない）
- reorder API呼び出し時にpositionを0始まりの連番に再付番する

**マイグレーション**:
- `database.py` の `_migrate` 関数に `playlists` / `playlist_items` テーブルの作成を追加
- 既存の `empty_folders` / `pinned_folders` と同じパターン

## API エンドポイント

### プレイリストCRUD（ドライブスコープ）

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/drives/{drive}/playlists` | プレイリスト一覧（名前、アイテム数、updated_at降順） |
| POST | `/api/drives/{drive}/playlists` | プレイリスト作成 `{name}` |
| GET | `/api/drives/{drive}/playlists/{id}` | プレイリスト詳細（アイテム一覧含む） |
| PUT | `/api/drives/{drive}/playlists/{id}` | リネーム `{name}` |
| DELETE | `/api/drives/{drive}/playlists/{id}` | プレイリスト削除 |

### プレイリストアイテム操作

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/drives/{drive}/playlists/{id}/items` | アイテム追加 `{file_ids: [...]}` |
| DELETE | `/api/drives/{drive}/playlists/{id}/items/{item_id}` | アイテム削除 |
| PUT | `/api/drives/{drive}/playlists/{id}/items/reorder` | 並び替え `{item_ids: [...]}` |

**レスポンス仕様**:
- プレイリスト一覧: `[{id, name, drive, item_count, created_at, updated_at}]`
- プレイリスト詳細: `{id, name, drive, items: [{id, position, file: FileItem}], created_at, updated_at}`
  - アイテムはposition昇順でソート
  - File → Tags のeager loadingを使用してN+1問題を回避
- アイテム追加は複数ファイルを一括追加可能（選択バーからの操作を想定）
  - 各ファイルのドライブがプレイリストのドライブと一致することを検証
  - 既に存在するファイルはスキップ（エラーにしない）
  - positionは既存の最大値+1から連番で付与
- reorderは新しい順序の`item_id`配列を送信し、positionを0始まりの連番で一括更新
  - 送信されたitem_id配列が現在のアイテム集合と一致しない場合は409 Conflict

**readonlyドライブ**: プレイリストはDBメタデータであり、ファイルシステムを変更しないため、readonlyドライブでもCRUD操作は許可する。

## フロントエンド設計

### 再生画面（ファイル詳細ページ拡張）

既存の `/files/[id]` ページにプレイリストコンテキストを追加。

**URL形式**:
- ユーザー作成プレイリスト: `/files/{id}?playlist={playlist_id}`
- フォルダ自動プレイリスト: `/files/{id}?folder_play=1&sort={sort}&order={order}`

**レイアウト（ファイルタイプ × デバイスで切替）**:

| 条件 | レイアウト | トラックリスト表示 |
|------|-----------|---------------|
| デスクトップ + 動画 | 縦積み（シアターモード） | サムネカード横スクロール |
| デスクトップ + 音声 | 横並び（サイドパネル） | 縦リスト（右側300px） |
| モバイル（全タイプ） | 縦積み | 折りたたみ可能な縦リスト |

**トラックリストパネルの機能**:
- プレイリスト名と曲数（現在位置/総数）を表示
- 再生中トラックをアクセントカラーでハイライト（▶アイコン）
- トラッククリックで `router.replace` により該当ファイルに遷移
- ループON/OFFトグルボタン（パネルヘッダーに配置）
- 動画/音声混在OK（アイコンで区別）

**ユーザー作成プレイリストの場合のみ**:
- 曲順変更: 上下ボタン（▲▼）で1つずつ移動（全デバイス共通、ライブラリ不要）
- 個別削除ボタン

**再生終了時の挙動**:
- 自動で次の曲/動画に遷移（`router.replace`）
- プレイリスト末尾でループONなら先頭に戻る、OFFなら停止
- ループ状態はlocalStorageに保持

### フォルダ再生の起動

フォルダ一覧ページに「全曲再生」ボタンを追加。

- ボタンクリックで `/files/{first_id}?folder_play=1&sort={sort}&order={order}` へ遷移
- フォルダ内の音声+動画ファイル（`file_type` が `video` または `audio`）を現在のソート順で自動プレイリスト化
- `folder_play=1` の場合、フロントエンドがドライブファイルAPIを `type=video` と `type=audio` で呼んでトラックリストを構築
- フォルダ内に音声/動画ファイルがない場合は「全曲再生」ボタンを非表示
- ページネーション: ImageGalleryと同じパターンで全ページを取得するループを使用

### サイドバーのプレイリスト管理

既存のサイドバーにPLAYLISTSセクションを追加（LIBRARYの直後、PINSの前に配置）。

**一覧表示**:
- プレイリスト名 + アイテム数
- 現在のドライブに属するプレイリストのみ表示

**操作**:
- `+` ボタン: インラインで名前入力 → Enter で作成
- クリック: 先頭ファイルの詳細ページへ遷移（プレイリスト再生開始）
  - 空プレイリストの場合はクリック無反応（視覚的に空であることを示す: アイテム数0表示）
- 右クリック: コンテキストメニューからリネーム・削除

### ファイルからプレイリストへの追加

**方法1: 右クリックメニュー（ContextMenu）**:
- 既存のコンテキストメニューに「プレイリストに追加」サブメニューを追加
- プレイリスト一覧から選択

**方法2: 選択バー（SelectionBar）**:
- 複数選択時の操作バーに「プレイリストに追加」ボタンを追加
- プレイリスト一覧から選択

### 新規コンポーネント

| コンポーネント | 役割 |
|--------------|------|
| `PlaylistPanel.tsx` | 再生画面のトラックリストパネル（レイアウト切替含む） |
| `PlaylistPicker.tsx` | プレイリスト選択ダイアログ（追加先選択用） |

### 既存コンポーネントの変更

| コンポーネント | 変更内容 |
|--------------|----------|
| `files/[id]/page.tsx` | クエリパラメータ検出、PlaylistPanel表示、自動次曲遷移 |
| `AudioPlayer.tsx` | `onEnded` コールバック追加 |
| `VideoPlayer.tsx` | `onEnded` コールバック追加 |
| `FilePreview.tsx` | `onEnded` を子コンポーネントに伝播 |
| `Sidebar.tsx` | PLAYLISTSセクション追加 |
| `FolderBrowser.tsx` | 「全曲再生」ボタン追加 |
| `ContextMenu.tsx` | 「プレイリストに追加」メニュー追加 |
| `SelectionBar.tsx` | 「プレイリストに追加」ボタン追加 |

## 実装方針

- ImageGalleryと同じパターン: `router.replace` でファイルIDを切り替え
- バックエンドはCRUD API のみ、再生ロジックはフロントエンド
- フォルダ自動プレイリストはDBに保存しない（フロントエンドが都度APIからファイルリストを取得）
- アクセス制御: プレイリストAPIもドライブのアクセスグループに従う（保護ドライブのプレイリストは未ロック時に不可視）
