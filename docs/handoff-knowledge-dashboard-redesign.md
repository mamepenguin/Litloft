# Handoff: Knowledge Addon Dashboard Redesign

**Updated:** 2026-05-16
**Status:** 全フェーズ完了・コミット済み（Connections グラフ化 / Phase A Capture バー / Phase B クイックメモ）。
**Next action:** なし（残タスクなし）

---

## これまでの経緯

Knowledge addon のフロントを「ノートアプリ UI（Vault ブラウザ）」から
「Capture & Connections ダッシュボード」にリデザインする作業。

3 ゾーン構成（単一スクロール、サイドバーなし）:

```
Zone 1  Capture バー（URL クリップ / HTML 貼付 / ブックマークレット / クイックメモ）
Zone 2  Clip キュー（処理中・完了・失敗）
Zone 3  Connections（ノート↔ファイルの繋がり）  ← グラフ化 完了
```

---

## 完了済み（コミット済み・変更しないこと）

### Connections のグラフ化（2026-05-16 完了）

リスト形式 → Obsidian 風 force-directed グラフに置換完了。

| リポジトリ | コミット |
|---|---|
| `addons/knowledge` | `4215d36 feat(knowledge): replace Connections list with Obsidian-style graph` |
| メイン | `fd5d141 feat(internal-api): drive-wide file_relations query for connections graph` |

実装の要点（詳細は hako `6s5hsPlHzGr2OiII9sHkx`）:

- バックエンド: `GET /connections-graph`（`app/routers/connections_graph.py`）。
  `file_relations`（コア、Internal API 経由）∪ `note_origin_sources` をユニオン。
  コア側は `GET /api/internal/file_relations?drive=X` を新設して drive 一括取得。
- フロント: `frontend/ConnectionsGraph.tsx`（オーケストレータ 394 行）+
  `frontend/graph/`（`useGraphLayout` 力学 / `useGraphPanZoom` pan-zoom /
  `graphPalette` 配色 / `graphGeometry` 幾何 / `GraphLayers` / `GraphControls` /
  `GraphPanels`）。pure SVG・依存ゼロ。
- 操作: クリックで選択 → 詳細カード →「ここを中心に」で focus モード（BFS 深さ）。
  検索 / focus は dim でなく**サブグラフを再レイアウトして絞り込み**。
  pan / pinch / wheel zoom（慣性）、Color by（種別/タグ/フォルダ/単色）。
- UI に絵文字を使わない（lucide アイコンを使う）。これは全体ルール（hako 参照）。

### 旧 Vault 撤去（前任分・同一コミットに同梱済み）

- `frontend/Page.tsx` は `?edit=ID` リダイレクトのみの薄いラッパー
- `frontend/KnowledgeDashboard.tsx` が実体（Zone 1/2/3 を構成）
- `frontend/__tests__/page.test.tsx` は新 Page の動作をカバー

### Phase A: Capture を「カード」→「バー」へ（2026-05-16 完了）

承認済みデザイン仕様どおり、`CaptureZone` の重いカード囲い・「Web クリップ」
見出し・説明文を撤去し、`ClipForm` を常時露出の軽い入力バーとして直配置。
HTML 貼付 / ブックマークレットはバー下のセカンダリボタン行に。

| リポジトリ | コミット |
|---|---|
| `addons/knowledge` | `3376b05 refactor(knowledge): replace Capture card with always-exposed input bar` |
| メイン | `9c12153 chore: bump knowledge addon (Capture bar redesign)` |

検証: frontend テスト 119/119 PASS（当時）、tsc 新規エラーなし、実機目視確認済み。

### Phase B: クイックメモボタン追加（2026-05-16 完了）

Zone 1 セカンダリ行に「クイックメモ」ボタン（lucide `SquarePen`、絵文字なし）。
Core の `useCreateFile(drive, "")` を addon から `@/hooks/useCreateFile` で流用し、
drive root に `untitled-{時刻}.md` を即時作成 → `/files/{id}?edit=1` へ SPA 遷移
（実機では 2ペインエディタ `?file=...&edit=1` に正規化されて着地）。

`/ebs` で Topic 12（`adBbtSe3GDv8cE1wGqgLP`）との対立を再確認し上書きを決定。
根拠: 再設計後ダッシュボードは `FolderBrowser` をマウントしないため Cmd+N が
物理的に効かず、Topic 12 の「Cmd+N で十分」前提が崩れていた。Core フック流用に
より Topic 12 の真の懸念（設定肥大化・Knowledge↔Core 結合）は回避。
判断記録は hako `zyhHZeGtL0Ri4NoQh3Vjr`。

| リポジトリ | コミット |
|---|---|
| `addons/knowledge` | `fa27142 feat(knowledge): add quick-memo button to Capture zone` |
| メイン | `chore: bump knowledge addon (quick-memo) + handoff 更新` |

検証: knowledge テスト 122/122 PASS、tsc 新規エラーなし、実機で
クリック→空ノート作成→エディタ遷移を確認済み。

---

## 技術コンテキスト

### コンポーネント構成（現状）

```
Page.tsx                    ?edit=ID リダイレクトのみ
  └─ KnowledgeDashboard.tsx 実体
       ├─ CaptureZone        ← Phase A 対象（行 235）
       │   ├─ ClipForm       ← 流用可（行 126）
       │   ├─ FolderPicker   ← @/components/FolderPicker
       │   ├─ ClipPasteForm  ← HTML 貼付（インライン展開）
       │   └─ BookmarkletDialog
       ├─ ClipQueueZone      ← 触らない
       └─ ConnectionsGraph   ← 触らない（別ファイル・完了済み）
```

### 使える API / 既存資産

```typescript
createClip(drive, { url, subfolder, title }) → ClipJob          // api.ts:76
createTextFile(drive, { path, content }) → CoreFileItem          // api.ts:201
findClipsByUrl(drive, url) → ClipJob[]
```

WebSocket: `knowledge.clip.ready` / `knowledge.clip.failed`（既存ハンドラ流用）

### テスト・ビルド

```bash
# frontend
cd frontend && pnpm vitest run "src/addons/knowledge"
cd frontend && pnpm tsc --noEmit            # 既存の無関係 3 エラーは別件

# knowledge backend（Docker 内）
cd addons/knowledge && docker build -f Dockerfile.test -t knowledge-test . \
  && docker run --rm knowledge-test python -m pytest -q

# 実機
docker compose up -d --build frontend
# http://localhost:3000/drive/<drive>/addons/knowledge
# プロフィール（lit_viewer cookie）未設定だと 401。drive ルートで設定する
```

### 注意点（ハマりどころ）

- **rtk Bash プロキシ**: `head -N file > tmp && mv` のような出力パイプは
  プロキシが `// ... N lines omitted` をファイルに混入させて破損させた事例あり。
  ファイル切り詰めは Edit/Write ツールで行うこと。`/usr/bin/wc` 等で実体確認。
- **絵文字禁止**: UI テキスト・翻訳ファイルに絵文字を入れない。lucide アイコンで。
- **コミット**: addon は独立 git。`addons/knowledge` で commit → メイン repo で
  submodule ポインタを commit。`addons/intelligence` は無関係なので触らない。
- 属性トレーラー（Co-Authored-By）は付けない（グローバル設定）。

---

## 参照すべき hako エントリ

- `6s5hsPlHzGr2OiII9sHkx` — Connections グラフ化の実装記録（完了分の全体像）
- `P24P57drMZ8ZdGFryPuz_` — Capture & Connections ダッシュボード方針
- `WXHdghZXLAcjhy5QThNAm` — Topic 12: 新規ノート作成の動線（Phase B の前提確認）
- `project_spa_navigation`（メモリ）— SPA 遷移厳守
- 絵文字禁止 / 選択肢提示の作法はユーザーメモリに記録済み
