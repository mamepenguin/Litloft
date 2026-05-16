# Handoff: Knowledge Addon Dashboard Redesign

**Updated:** 2026-05-16
**Status:** Connections グラフ化は完了・コミット済み。Capture バー改修とクイックメモが残タスク。
**Next action:** 下記「残タスク」の Phase A / B を実装する

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

---

## 残タスク

`frontend/KnowledgeDashboard.tsx` の `CaptureZone`（行 235〜）が対象。
Connections（Zone 3）には**触らないこと**。

### Phase A: Capture を「カード」から「バー」へ【最重要】

**現状（行 247〜）:** `<div className="...rounded-2xl border ... bg-bg-card p-5 shadow-sm">`
の重いカード。`<p>Web クリップ</p>` のタイトルと
`<p>URL を貼り付けると Markdown に変換して保存します</p>` の説明文がある。

**あるべき姿（承認済みデザイン仕様）:** 常時露出した軽い入力バー。
カードの囲い・タイトル・説明文を外し、URL 入力 + クリップボタンを
1 行のバーとして出す。HTML 貼付 / ブックマークレットは現状どおり
セカンダリ（バー下の小さなボタン行）でよい。

**修正方針:**
- `rounded-2xl border ... bg-bg-card p-5 shadow-sm` のラッパーを廃し、
  `ClipForm` を直接バーとして配置（`ClipForm` 自体は流用可、行 126）
- 「Web クリップ」見出しと説明文の `<p>` 2 本を削除
- セクションラベル「キャプチャ」（行 249）は残してよい
- DESIGN.md の標準入力 / CTA トークンに従う

### Phase B: クイックメモボタンを追加

**現状:** 未実装（完全に欠落）。

**仕様:** Zone 1 に「クイックメモ」ボタン（絵文字禁止・lucide アイコン例
`SquarePen` / `NotebookPen`）。押下で空の `.md` を新規作成しエディタへ遷移。

**実装方針:**
- API は既存の `createTextFile(drive, { path, content })` を使う
  （`frontend/api.ts:201`、`POST /api/drives/{drive}/files` ラッパー）
- ファイル名は `untitled-{YYYYMMDD-HHMMSS}.md`（既存クリップの命名と整合）。
  保存先は drive root でよい（フォルダピッカーは v1 不要、後で議論）
- 作成成功後 `router.push('/files/{id}?edit=1')` で全画面エディタへ遷移
  （SPA 遷移厳守。hako `project_spa_navigation` / フルリロード禁止）
- 失敗時はトースト or インラインエラー（既存パターンに合わせる）

> 補足: 「ダッシュボードからどこにメモを作るか」は過去議論あり
> （hako `WXHdghZXLAcjhy5QThNAm` Topic 12）。結論は「Core の
> `FolderToolbar` に新規ファイル + Cmd+N」で、ダッシュボード側に
> 専用ボタンは置かない方針だった。**この残タスクはその結論と矛盾する**
> 可能性がある。実装前に `/ebs` で要否を再確認すること（クイックメモを
> 入れるか、Cmd+N グローバルに委ねるかはユーザー判断）。

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
