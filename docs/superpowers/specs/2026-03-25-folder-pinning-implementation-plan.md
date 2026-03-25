# フォルダピン留め機能 実装計画

設計書: `docs/superpowers/specs/2026-03-25-folder-pinning-design.md`

## Phase 1: Backend — モデル・マイグレーション・スキーマ

### 1-1. `PinnedFolder` モデル追加
- **ファイル**: `backend/app/models.py` (line 98 以降に追加)
- **パターン**: `EmptyFolder` モデル (lines 85-98) をコピーして修正
- テーブル名: `pinned_folders`
- カラム: id (INTEGER PK AUTOINCREMENT), drive (VARCHAR NOT NULL), path (VARCHAR NOT NULL), created_at (DATETIME)
- UniqueConstraint: `uq_pinned_folders_drive_path`

### 1-2. Pydantic スキーマ追加
- **ファイル**: `backend/app/schemas.py` (末尾に追加)
- `PinnedFolderResponse(BaseModel)`: path: str
- `PinnedFolderCreateRequest(BaseModel)`: path: str

### 1-3. マイグレーション追加
- **ファイル**: `backend/app/database.py` (line 163 付近、Phase 2 セクションに追加)
- `if "pinned_folders" not in tables:` → `Base.metadata.tables["pinned_folders"].create(...)`

### 検証
- `docker build -f backend/Dockerfile.test -t video-share-test backend/ && docker run --rm video-share-test`

---

## Phase 2: Backend — APIエンドポイント

### 2-1. ピン留め一覧・追加・解除エンドポイント
- **ファイル**: `backend/app/routers/drives.py` (末尾に追加)
- **パターン**: tags エンドポイント (lines 177-193) をベースにする
- `GET /{drive_name}/pins` → `list[PinnedFolderResponse]`（id昇順）
- `POST /{drive_name}/pins` → `PinnedFolderResponse`（重複時 409）
- `DELETE /{drive_name}/pins?path=...` → 204 No Content
- 全エンドポイントで `_validate_drive(drive_name, unlocked_groups)` を呼ぶ
- import追加: `PinnedFolder` (models), `PinnedFolderResponse`, `PinnedFolderCreateRequest` (schemas)

### 検証
- バックエンドテスト実行
- （任意）curl で手動確認

---

## Phase 3: Frontend — API クライアント・型定義

### 3-1. 型追加
- **ファイル**: `frontend/src/types/index.ts`
- `PinnedFolder` interface: `{ path: string }`

### 3-2. API 関数追加
- **ファイル**: `frontend/src/lib/api.ts` (末尾に追加)
- **パターン**: `getDriveTags()` (line 56-58) をベースに
- `getPins(drive: string): Promise<PinnedFolder[]>`
- `addPin(drive: string, path: string): Promise<PinnedFolder>`
- `removePin(drive: string, path: string): Promise<void>`

### 検証
- TypeScript コンパイル通過

---

## Phase 4: Frontend — サイドバー Pins セクション

### 4-1. サイドバーに Pins セクション追加
- **ファイル**: `frontend/src/components/Sidebar.tsx`
- **パターン**: Tags セクション (lines 117-135) と同じ構造
- Library セクションと Tags セクションの間に配置
- `useEffect` で `getPins(currentDrive)` を呼ぶ（`refreshKey` を監視）
- ピン留め 0 件時はセクション非表示
- 各アイテム: `Folder` アイコン + パス末尾表示 + クリックでフォルダに遷移
- `isActive()` に pinned folder のパス判定を追加
- lucide `Pin` アイコンをセクションヘッダーまたは各アイテムに使用

### 検証
- ブラウザでサイドバーに Pins セクションが表示されること

---

## Phase 5: Frontend — FolderCard にピン留めボタン追加

### 5-1. FolderActions にピン留めトグル追加
- **ファイル**: `frontend/src/components/FolderActions.tsx`
- **パターン**: 既存のアクションボタン (lines 62-83) と同じスタイル
- lucide `Pin` / `PinOff` アイコン
- props に `isPinned: boolean`, `onTogglePin: () => void` を追加
- ピン留め済みはアイコンをハイライト

### 5-2. FolderBrowser からピン状態を渡す
- **ファイル**: `frontend/src/components/FolderBrowser.tsx`
- マウント時に `getPins(drive)` を呼んでピン状態を取得
- `FolderCard` → `FolderActions` にピン状態を伝播
- ピン追加/解除後にサイドバーの `requestRefresh()` を呼ぶ

### 検証
- フォルダカードにピンボタンが表示され、トグル動作すること
- ピン追加/解除でサイドバーが更新されること

---

## Phase 6: テスト

### 6-1. バックエンドテスト
- `backend/tests/` にピン留めAPIのテストを追加
- GET/POST/DELETE の正常系 + 重複・不存在のエラー系

### 6-2. フロントエンドテスト
- API関数のテスト
- サイドバーのピンセクション表示テスト

### 検証
- 全テスト通過
