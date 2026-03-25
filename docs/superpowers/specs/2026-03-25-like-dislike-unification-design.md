# LIKE/DISLIKE 統合設計

## 背景

現状、`likes` と `dislikes` は独立した2つのカウンターとして実装されている。しかし本アプリでは一人何回でもボタンを押せる（トグルではなく累積）ため、LIKE の取り消しと DISLIKE 操作を区別できない。この制約から、2つのカウンターを維持する意味がなく、単一の `likes` カウンター（正負どちらもとれる）に統合する。

## 設計

### データモデル

- `File.likes`: `Integer`（正負どちらもとれる、既存カラム）
- `File.dislikes`: **削除**

マイグレーション:
1. `dislikes` カラムを DROP する
2. 既存データの `dislikes` 値は破棄（`likes - dislikes` への変換は行わない。理由: 両方のボタンが独立に累積されていたため、差分に意味がない）
3. 既存の `likes` 値はそのまま保持する

### API

| エンドポイント | 変更内容 |
|---|---|
| `POST /api/files/{id}/like` | 変更なし（`likes + 1`） |
| `POST /api/files/{id}/dislike` | `dislikes + 1` → `likes - 1` に変更 |

レスポンススキーマから `dislikes` フィールドを削除する。

### UI

```
変更前: [ thumbs-up 3 | thumbs-down 1 ]
変更後: [ thumbs-up  3  thumbs-down ]
変更後: [ thumbs-up  0  thumbs-down ]
変更後: [ thumbs-up -3  thumbs-down ]
```

- thumbs-up ボタン: `likes + 1`（変更なし）
- thumbs-down ボタン: `likes - 1`（変更）
- 数値は中央に1つだけ表示（正負どちらもありえる）
- 既存のセパレータ（縦線）は削除し、数値を中央に配置

### 影響箇所

#### Backend
- `models.py`: `dislikes` カラム削除
- `schemas.py`: レスポンスから `dislikes` フィールド削除
- `routers/files.py`: `dislike_file` を `likes - 1` に変更
- `database.py`: マイグレーション（`dislikes` カラム DROP）+ インラインDDL（Phase 1/Phase 3 の既存マイグレーション内の `dislikes` 定義も削除）
- `tests/`: dislike エンドポイントが `likes - 1` を返すこと、レスポンスに `dislikes` がないことのテスト追加

#### Frontend
- `types/index.ts`: `dislikes` プロパティ削除
- `app/files/[id]/page.tsx`: 表示を中央1数値に変更、`handleDislike` のレスポンス処理更新
- `components/DriveHome.tsx`: `likes > 0` フィルタは維持。ただし dislikes 破棄により、旧 dislikes が多かったファイルも popular に表示されうる（許容する）
- `components/FolderBrowser.tsx`: `sort: "likes"` 使用箇所あり（コード変更不要、動作確認のみ）
- `components/__tests__/FileCard.test.tsx`: `dislikes` 参照を削除
- `lib/api.ts`: `dislikeFile` 関数は維持（エンドポイントは同じ）

### ソート

`sort=likes` は既存のまま動作する。負の値を持つファイルは自然にソート下位に来る。デフォルトの `order=desc` により、likes が高い順に表示される（変更不要）。
