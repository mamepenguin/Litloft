# Handoff: Knowledge Addon Dashboard Redesign

**Date:** 2026-05-15  
**Status:** 実装途中 — デザインと実装に乖離あり。引き継ぎのため作成。  
**Next action:** デザイン仕様通りに実装し直すこと

---

## 背景・目的

Knowledge addon のフロントエンドページを「ノートアプリ UI（Vault ブラウザ）」から
「Capture & Connections ダッシュボード」にリデザインする作業。

### なぜリデザインするのか

1. Vault ブラウザ UI はコアのファイルツリー + インラインエディタ（Phase 2 完了）と完全重複になった
2. Vault 概念は DB レベルで既に撤去済み（`database.py` の migration で `user_vaults` テーブルを DROP）
3. Knowledge addon の独自価値は「外部コンテンツの取り込み口」と「ファイル↔ノートの接続可視化」に絞るべき

---

## 承認済みデザイン仕様（ユーザーが承認したもの）

### ページ構成：3ゾーン、単一スクロールページ、サイドバーなし

```
┌─────────────────────────────────────────────────┐
│  [Zone 1] Capture バー（常時表示、ページ上部）   │
│                                                 │
│  ┌──────────────────────────────────┬─────────┐ │
│  │  https://example.com/...         │ クリップ │ │
│  └──────────────────────────────────┴─────────┘ │
│  保存先: [フォルダピッカー]                      │
│                                                 │
│  📋 HTMLを貼り付け  🔖 ブックマークレット        │
│  ✏️  クイックメモ（新規 .md を即作成）           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  [Zone 2] Clip キュー                           │
│  処理中・完了・失敗のクリップジョブ一覧          │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  [Zone 3] Connections ダッシュボード（折りたたみ）│
│  A: リンク済みノート（note_origins with sources）│
│  B: リンクなしノート（orphaned、空でも表示する） │
└─────────────────────────────────────────────────┘
```

**重要な設計意図：**
- Zone 1 は「バー」— カードや説明文のある heavy UI ではなく、常時露出した軽い入力バー
- クイックメモボタンは Zone 1 に含まれる（URL クリップと並列の「作成」手段）
- Connections は data がなくても空状態として表示する（`return null` で消さない）

---

## 現在の実装状態

### 新規作成ファイル

| ファイル | 内容 |
|---|---|
| `addons/knowledge/app/routers/connections.py` | `GET /connections` エンドポイント。linked/orphaned の note_origins を返す |
| `addons/knowledge/frontend/KnowledgeDashboard.tsx` | 新ページコンポーネント。3ゾーン構成だが **デザイン仕様と乖離あり** |

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `addons/knowledge/app/main.py` | `connections.router` を登録 |
| `addons/knowledge/frontend/Page.tsx` | `KnowledgeDashboard` を描画するシンプルなラッパーに置き換え（`?edit=ID` リダイレクト維持）|
| `addons/knowledge/frontend/api.ts` | `getConnections()` + `LinkedItem` / `OrphanedItem` / `ConnectionsResponse` 型を追加 |
| `addons/knowledge/frontend/messages/ja.json` | paste タイトル「HTML を貼り付けて再挑戦」→「HTML を貼り付けて変換」、description を中立な文言に修正 |
| `addons/knowledge/frontend/__tests__/page.test.tsx` | Vault ブラウザ系テストを削除し、新 Page の動作（redirect 等）をカバー |

---

## デザインとの乖離（修正が必要な点）

### 1. Web Clip がバーではなくカードになっている【最重要】

**仕様：** Zone 1 は「常時表示のキャプチャバー」。軽くて常に見える。  
**現状：** `<div className="rounded-2xl border ...">` の重いカード UI。タイトル・説明文あり。  
**修正方針：** カードを取り除き、URL 入力 + クリップボタンをバー形式で配置する。

### 2. クイックメモボタンがない

**仕様：** Zone 1 に「✏️ クイックメモ」ボタン。押すと空の `.md` を新規作成しエディタに遷移。  
**現状：** 未実装。完全に落とされている。  
**修正方針：** `createTextFile(drive, { path: untitledFilename(), content: "" })` を呼んで
`router.push` で `/files/{id}?edit=1` に遷移する。

### 3. Connections がデータなしで非表示になる

**仕様：** data がなくても空状態（「まだリンクされたノートはありません」）を表示。  
**現状：** `if (!loading && !hasContent) return null` — データなしで Zone 3 全体が消える。  
**修正方針：** `hasContent` の条件に依存せず、空状態コンポーネントを表示する。

---

## 技術コンテキスト

### コンポーネント構成

```
Page.tsx                      ← シンプルなラッパー（?edit=ID リダイレクト処理のみ）
  └─ KnowledgeDashboard.tsx   ← 実際のページコンテンツ
       ├─ CaptureZone          ← Zone 1（バー形式に修正が必要）
       │   ├─ ClipForm         ← URL 入力フォーム（ClipInput.tsx を使わず直接 API 呼び出し）
       │   ├─ FolderPicker     ← @/components/FolderPicker（コアコンポーネント）
       │   ├─ ClipPasteForm    ← HTMLペースト（インライン展開）
       │   └─ BookmarkletDialog
       ├─ ClipQueueZone        ← Zone 2（OK）
       └─ ConnectionsZone      ← Zone 3（空状態対応が必要）
```

### 既存コンポーネントで再利用できるもの

- `FolderPicker` (`@/components/FolderPicker`) — CreateNoteDialog と同一の保存先 UI。`value` はフォルダパス（空文字 = root）
- `ClipPasteForm` — HTML ペースト変換フォーム。`drive`, `url`, `subfolder`, `onSaved`, `onCancel` を props として受け取る
- `BookmarkletDialog` — ブックマークレット説明モーダル
- `ClipDuplicateDialog` — 重複 URL 検出ダイアログ

### API

```typescript
// Web Clip 作成
createClip(drive, { url, subfolder, title }) → Promise<ClipJob>
findClipsByUrl(drive, url) → Promise<ClipJob[]>

// Connections
getConnections(drive) → Promise<{ linked: LinkedItem[], orphaned: OrphanedItem[] }>
// linked: note_file_id, note_path, source_file_ids[]
// orphaned: note_file_id, note_path

// ファイル作成（クイックメモ用）
createTextFile(drive, { path, content }) → Promise<CoreFileItem>
```

### WebSocket イベント

```
"knowledge.clip.ready"  → { file_id, title }
"knowledge.clip.failed" → { file_id, error }
```

### デザインシステム（DESIGN.md）

- 標準入力: `rounded-2xl border border-bg-border bg-bg-card px-4 py-2 text-sm`
- CTA ボタン: `rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover`
- セクションラベル: `text-[11px] font-semibold uppercase tracking-wide text-text-muted`
- カード: `rounded-2xl border border-bg-border bg-bg-card`
- アクセント（coral red）: `--accent: #d63031`
- Teal（完了状態）: `--accent-teal`
- Amber（処理中）: `--accent-amber`

### RecentJob の永続化

`localStorage["knowledge:recentJobs:{drive}"]` に 24h TTL で最大 10 件保存。  
`jobsReducer` で管理（`"add"` / `"update"` / `"init"` アクション）。

---

## テスト状況

TypeScript エラー: **0件**  
`page.test.tsx`: **4/4 通過**（Page の redirect 動作をカバー）  
`KnowledgeDashboard.tsx` 専用テスト: **未作成**

---

## 未コミット（addons/knowledge submodule 内）

```
M  app/main.py
M  frontend/Page.tsx
M  frontend/__tests__/page.test.tsx
M  frontend/api.ts
M  frontend/messages/ja.json
?? app/routers/connections.py
?? frontend/KnowledgeDashboard.tsx
```

コア側（`frontend/`）に変更なし（`api.ts` 追記のみ）。

---

## 次のエージェントへのお願い

1. `KnowledgeDashboard.tsx` の `CaptureZone` を「バー」形式に修正する
2. クイックメモボタンを Zone 1 に追加する
3. `ConnectionsZone` の空状態を実装する（data なしで消えないようにする）
4. 実装がデザイン仕様と一致することを確認してからコミットする

**参照すべき hako エントリ:**
- `P24P57drMZ8ZdGFryPuz_` — 今回のリデザイン方針（Capture & Connections ダッシュボード）
- `3KCyFK7V_k5RAK1n3adu5` — Vault-Core 統合でアドオン設計ルールの例外不要と確認
- `29YTAZt7Z1LCwLJw_eX2I` — Phase 2 完了ハンドオフ（inline editor が default true）
