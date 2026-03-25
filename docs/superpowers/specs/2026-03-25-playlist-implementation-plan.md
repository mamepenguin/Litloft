# プレイリスト機能 実装計画

設計書: `docs/superpowers/specs/2026-03-25-playlist-design.md`

## Phase 0: ドキュメント・パターン参照

### 許可されたAPI・パターン

**バックエンド**:
- SQLAlchemy モデル: `Mapped` 型ヒント + `mapped_column()` パターン (`models.py:48-82`)
- nanoid主キー: `String(12)`, `default=generate_nanoid` (`models.py:51`, `nanoid.py:1-12`)
- ドライブ検証: `_validate_drive(drive_name, unlocked_groups)` (`routers/drives.py:36-40`)
- Pin CRUD パターン: GET/POST/DELETE with 201/204/404/409 (`routers/drives.py:250-310`)
- Pydantic スキーマ: `_UtcDateTimeMixin`, `model_config = {"from_attributes": True}` (`schemas.py:7-16, 19-37`)
- バリデータ: `@field_validator` + `@classmethod` (`schemas.py:48-68`)
- マイグレーション: `Base.metadata.tables["table_name"].create(bind=engine_, checkfirst=True)` (`database.py:152-161`)
- コンバータ関数: `file_to_response()` パターン (`schemas.py:222-240`)

**フロントエンド**:
- API クライアント: `fetchJSON<T>()` ジェネリクス (`lib/api.ts:5-11`)
- 型定義: `export interface` / `export type` (`types/index.ts`)
- ページネーション全取得: ImageGallery パターン limit=500ループ (`ImageGallery.tsx:46-103`)
- サイドバーセクション: 条件付きレンダリング + `linkClass()` (`Sidebar.tsx:120-161`)
- コンテキストメニュー: `MenuItem` インターフェース (`ContextMenu.tsx:5-10`)
- 選択バー: ボタン + ダイアログ切替 (`SelectionBar.tsx:119-145`)
- VideoPlayer onEnded: `useCallback` + `videoRef` (`VideoPlayer.tsx:67-69, 135-148`)
- FolderBrowser ツールバー: spacer後にボタン追加 (`FolderBrowser.tsx:244-350`)

### アンチパターン（禁止事項）

- `from app.config import VIDEOS_DIR` — モジュール参照 `import app.config as config` を使うこと
- Vitest 4 / jsdom 29 は使わない
- ドラッグ&ドロップライブラリの追加は不要
- フォルダ自動プレイリストをDBに保存しない

---

## Phase 1: バックエンド — データモデルとマイグレーション

### タスク

1. **models.py に Playlist / PlaylistItem モデルを追加**
   - `Playlist`: nanoid主キー, drive, name, created_at, updated_at
   - `PlaylistItem`: auto-increment int主キー, playlist_id (FK CASCADE), file_id (FK CASCADE), position, created_at
   - `UniqueConstraint("drive", "name")` on Playlist
   - `UniqueConstraint("playlist_id", "file_id")` on PlaylistItem
   - `relationship("PlaylistItem", back_populates="playlist", cascade="all, delete-orphan", lazy="selectin")`
   - `relationship("File", lazy="selectin")` on PlaylistItem
   - コピー元パターン: `PinnedFolder` モデル (`models.py:99-111`), `File` モデル (`models.py:48-82`)

2. **database.py の `_migrate()` に新テーブル作成を追加**
   - Phase 2 セクション（fresh install path）に `playlists` / `playlist_items` テーブルを追加
   - パターン: `Base.metadata.tables["playlists"].create(bind=engine_, checkfirst=True)` (`database.py:152-161`)

3. **schemas.py にプレイリスト関連スキーマを追加**
   - `PlaylistCreateRequest(BaseModel)`: name (str)
   - `PlaylistUpdateRequest(BaseModel)`: name (str)
   - `PlaylistItemAddRequest(BaseModel)`: file_ids (list[str])
   - `PlaylistItemReorderRequest(BaseModel)`: item_ids (list[int])
   - `PlaylistSummaryResponse(_UtcDateTimeMixin, BaseModel)`: id, name, drive, item_count, created_at, updated_at
   - `PlaylistItemResponse(BaseModel)`: id, position, file (FileResponse)
   - `PlaylistDetailResponse(_UtcDateTimeMixin, BaseModel)`: id, name, drive, items (list[PlaylistItemResponse]), created_at, updated_at
   - name バリデーション: `@field_validator("name")` で1〜100文字, strip(), 空文字禁止

### 検証

- [ ] `docker build -f backend/Dockerfile.test -t video-share-test backend/ && docker run --rm video-share-test` が通る
- [ ] `docker compose up -d --build` でコンテナ起動、playlists / playlist_items テーブルが作成される

---

## Phase 2: バックエンド — プレイリストCRUD API

### タスク

1. **routers/playlists.py を新規作成**（drives.py と分離してファイルサイズを抑える）
   - `router = APIRouter(prefix="/api/drives", tags=["playlists"])`
   - 全エンドポイントで `_validate_drive(drive_name, unlocked_groups)` を呼ぶ
   - パターン: Pin エンドポイント (`routers/drives.py:250-310`)

2. **CRUD エンドポイント実装**
   - `GET /{drive}/playlists` — 一覧取得 (updated_at DESC)、item_count は `func.count()` サブクエリ
   - `POST /{drive}/playlists` — 作成 (201)、名前重複で 409
   - `GET /{drive}/playlists/{id}` — 詳細取得、items を position ASC でソート、File eager load
   - `PUT /{drive}/playlists/{id}` — リネーム、名前重複で 409
   - `DELETE /{drive}/playlists/{id}` — 削除 (204)、404 if not found

3. **アイテム操作エンドポイント実装**
   - `POST /{drive}/playlists/{id}/items` — 追加、file.drive == playlist.drive 検証 (400)、既存スキップ、position = max + 1
   - `DELETE /{drive}/playlists/{id}/items/{item_id}` — 削除 (204)
   - `PUT /{drive}/playlists/{id}/items/reorder` — 並替え、item_ids 不一致で 409、position 再付番

4. **main.py にルーター登録**
   - `from app.routers import playlists` + `app.include_router(playlists.router)`

### 検証

- [ ] テスト作成: プレイリストCRUD、アイテム追加/削除/並替え、ドライブ一致検証、名前重複、カスケード削除
- [ ] `docker run --rm video-share-test` が通る

---

## Phase 3: フロントエンド — 型定義とAPIクライアント

### タスク

1. **types/index.ts に型追加**
   ```
   PlaylistSummary: {id, name, drive, item_count, created_at, updated_at}
   PlaylistItem: {id, position, file: FileItem}
   PlaylistDetail: {id, name, drive, items: PlaylistItem[], created_at, updated_at}
   ```

2. **lib/api.ts にAPI関数追加**
   - `getPlaylists(drive)` → `PlaylistSummary[]`
   - `createPlaylist(drive, name)` → `PlaylistSummary`
   - `getPlaylist(drive, id)` → `PlaylistDetail`
   - `updatePlaylist(drive, id, name)` → `PlaylistSummary`
   - `deletePlaylist(drive, id)` → `void`
   - `addPlaylistItems(drive, playlistId, fileIds)` → `PlaylistDetail`
   - `removePlaylistItem(drive, playlistId, itemId)` → `void`
   - `reorderPlaylistItems(drive, playlistId, itemIds)` → `PlaylistDetail`
   - パターン: 既存の `getDriveTags`, `addPin` etc. (`api.ts:56-273`)

### 検証

- [ ] TypeScript コンパイルエラーなし
- [ ] `cd frontend && pnpm test` が通る

---

## Phase 4: フロントエンド — サイドバーにPLAYLISTSセクション追加

### タスク

1. **Sidebar.tsx を拡張**
   - `useState<PlaylistSummary[]>` 追加
   - `useEffect` で `getPlaylists(currentDrive)` を呼ぶ（PINSと同じパターン `Sidebar.tsx:33-39`）
   - LIBRARY セクション直後、PINS の前に PLAYLISTS セクションを追加
   - `+` ボタン → インライン入力 → Enter で `createPlaylist()` → リスト更新
   - プレイリスト名クリック → `item_count > 0` の場合のみ `getPlaylist()` で先頭ファイルID取得 → `/files/{firstId}?playlist={playlistId}` へ遷移
   - 空プレイリスト（item_count === 0）はクリック無反応
   - 右クリック: 既存の `useContextMenu` hook でリネーム・削除メニュー表示

### 検証

- [ ] サイドバーにプレイリスト一覧が表示される
- [ ] プレイリスト作成・リネーム・削除が動作する
- [ ] 空プレイリストはクリック無反応

---

## Phase 5: フロントエンド — AudioPlayer / VideoPlayer に onEnded コールバック追加

### タスク

1. **AudioPlayer.tsx**: `onEnded?: () => void` prop 追加、`<audio onEnded={onEnded}>` に設定

2. **VideoPlayer.tsx**: `onEnded?: () => void` prop 追加、既存の `handleEnded` 内で `clearProgress()` 後に `onEnded?.()` を呼ぶ (`VideoPlayer.tsx:67-69`)

3. **FilePreview.tsx**: `onEnded?: () => void` prop 追加、AudioPlayer / VideoPlayer に伝播

### 検証

- [ ] 既存のテストが通る
- [ ] onEnded 未指定時に既存動作が変わらない

---

## Phase 6: フロントエンド — PlaylistPanel コンポーネント

### タスク

1. **PlaylistPanel.tsx を新規作成**
   - Props: `playlistId?: string`, `folderPlay?: boolean`, `currentFileId: string`, `currentFileType: FileType`, `drive: string`, `folderPath: string`, `sort?: string`, `order?: string`, `onPlayNext: (fileId: string) => void`, `onPlaylistLoaded?: (items: FileItem[]) => void`
   - ユーザー作成プレイリスト: `getPlaylist()` でアイテム取得
   - フォルダ自動プレイリスト: `getDriveFiles()` で `type=video` と `type=audio` を取得（ImageGalleryパターン）、結果をマージしてソート
   - ループ状態: `localStorage` に保持
   - 再生中トラックのハイライト（アクセントカラー + ▶アイコン）
   - トラッククリック → `onPlayNext(fileId)` コールバック

2. **レイアウト切替**
   - デスクトップ + 動画: 縦積みシアターモード（サムネカード横スクロール）
   - デスクトップ + 音声: サイドパネル（右側300px固定の縦リスト）
   - モバイル: 縦積み + 折りたたみ可能
   - Tailwind のレスポンシブプレフィックス `md:` で切替

3. **ユーザー作成プレイリストの編集機能**
   - 上下ボタン（▲▼）で曲順変更 → `reorderPlaylistItems()` API呼出
   - 個別削除ボタン → `removePlaylistItem()` API呼出
   - フォルダ自動プレイリストではこれらを非表示

### 検証

- [ ] プレイリストパネルが正しくレンダリングされる
- [ ] レイアウトがファイルタイプ × デバイスで正しく切り替わる
- [ ] 曲順変更・削除が動作する

---

## Phase 7: フロントエンド — ファイル詳細ページへの統合

### タスク

1. **files/[id]/page.tsx を拡張**
   - `searchParams` から `playlist` / `folder_play` / `sort` / `order` を取得
   - プレイリストコンテキストがある場合、`PlaylistPanel` を表示
   - レイアウト切替: 動画シアターモード vs 音声サイドパネル
   - `onPlayNext` コールバック: `router.replace(/files/{nextId}?playlist={id})` or `?folder_play=1&sort=&order=`
   - `FilePreview` に `onEnded` を渡し、再生終了時に次曲遷移
   - ループ状態に応じて末尾で先頭に戻る or 停止
   - プレイリスト再生中はキーボードショートカット（←→）を音声でも有効化（再生操作ではなくナビゲーション用）

2. **既存の前後ナビゲーションとの共存**
   - プレイリストコンテキストがない場合: 従来通り neighbors API を使用
   - プレイリストコンテキストがある場合: PlaylistPanel のトラックリストから前後を決定

### 検証

- [ ] `?playlist=xxx` でプレイリスト再生画面が表示される
- [ ] `?folder_play=1` でフォルダ自動プレイリスト再生が動作する
- [ ] 再生終了時に自動次曲遷移する
- [ ] ループON/OFFが正しく動作する

---

## Phase 8: フロントエンド — フォルダ再生ボタンとプレイリスト追加UI

### タスク

1. **FolderBrowser.tsx に「全曲再生」ボタン追加**
   - ツールバーの SortButton の前に配置
   - フォルダ内に audio/video ファイルがある場合のみ表示
   - クリック → `getDriveFiles()` で先頭の audio/video ファイルID取得 → `/files/{firstId}?folder_play=1&sort={sort}&order={order}` へ遷移

2. **PlaylistPicker.tsx を新規作成**
   - ダイアログ形式（MoveDialog パターンに準拠）
   - 現在のドライブのプレイリスト一覧を表示
   - 選択 → `addPlaylistItems()` → 完了通知

3. **ContextMenu.tsx に「プレイリストに追加」メニュー追加**
   - `MenuItem` に追加、クリックで `PlaylistPicker` を開く

4. **SelectionBar.tsx に「プレイリストに追加」ボタン追加**
   - 既存のタグ・移動ボタンと同じパターン
   - クリックで `PlaylistPicker` を開く

### 検証

- [ ] 「全曲再生」ボタンが表示され、クリックでプレイリスト再生が開始される
- [ ] 右クリック → プレイリストに追加 が動作する
- [ ] 選択バー → プレイリストに追加 が動作する

---

## Phase 9: テストと最終検証

### タスク

1. **バックエンドテスト追加**
   - プレイリストCRUD（作成、一覧、詳細、リネーム、削除）
   - アイテム操作（追加、削除、並替え）
   - エッジケース: ドライブ不一致、名前重複、空プレイリスト、カスケード削除、reorder不整合

2. **フロントエンドテスト追加**
   - PlaylistPanel レンダリング
   - レイアウト切替
   - API クライアント関数

3. **統合テスト**
   - `docker compose up -d --build` で全体起動
   - プレイリスト作成 → 曲追加 → 再生 → 次曲自動遷移 → ループ のE2Eフロー

4. **CLAUDE.md 更新**
   - ディレクトリ構成にPlaylistPanel, PlaylistPicker追加
   - APIエンドポイント表にプレイリスト関連追加
   - 重要な設計判断セクションにプレイリスト設計を追加

### 検証

- [ ] `docker run --rm video-share-test` 全テスト通過
- [ ] `cd frontend && pnpm test` 全テスト通過
- [ ] E2Eフロー手動確認
