# Codemap: Search (popup launcher + search results page + Smart Folder)

**Last Updated:** 2026-05-03
**Specs:**
- [docs/superpowers/specs/2026-05-01-search-ui-rich-redesign.md](../superpowers/specs/2026-05-01-search-ui-rich-redesign.md) — 2 層 UX 原典
- [docs/superpowers/specs/2026-05-02-search-results-unification-phase3.md](../superpowers/specs/2026-05-02-search-results-unification-phase3.md) — 結果ページ 1 list 統合
- [docs/superpowers/specs/2026-05-03-search-popup-semantic-merge.md](../superpowers/specs/2026-05-03-search-popup-semantic-merge.md) — popup semantic merge + cache handoff

**Scope:** 検索の 2 層 UX。`Cmd/Ctrl+Shift+F` のクイックランチャーポップアップ（filename + semantic 並列マージ）と、`/drive/{drive}/search` の仮想フォルダ風結果ページ（ポップアップからの cache hydrate を含む）。Smart Folder（保存済み検索）の DB / API / UI。intelligence アドオンの `search-modes` スロットの page-context 拡張。

## アーキテクチャ

```
ユーザー入力
  │
  ▼
GlobalSearch (popup)               ── filename + semantic 並列 → mergeResults → 上位 8 件
  ├─ filename:  getDriveFiles({search, limit: 8}, {signal})        ← 300ms debounce
  ├─ semantic:  isSemanticSearchAvailable(drive)
  │             → fetchSemanticHits(query, drive, {limit: 8, signal})
  │             （アドオン無し / policy off は no-op で空配列）
  ├─ MergedResultItem 行: サムネ + パス + match badges + timestamp pills
  ├─ writeSearchCache({drive, query, type, sceneClip}, {filenameMatches, semanticHits, filenameTotal})
  ├─ クリック → /drive/{drive}/files/{id}                  （クイックナビ、従来通り）
  └─ Enter / 「全件表示 →」
        │
        ▼
/drive/{drive}/search?q=...       ── SearchPage
        │
        ▼
FolderBrowser (searchQuery=q)
  ├─ Breadcrumb の代わりに「検索: "q"」見出し + SmartFolderSaveButton
  ├─ <AddonSlot id="search-modes" props={{ context: "page", ... }} />
  │     intelligence: SemanticSearchSlot / FindModeSlot / AskSearchMode
  └─ FileGrid (= 通常フォルダと同じ。プレビュー / 右クリック / 複数選択 / バッチが効く)
        │
        ▼
useFolderFiles({ searchQuery })
  ├─ mount 時に readSearchCache(...) → hit なら filenameMatches/total/semanticHits を初期 state に注入（fetch スキップ）
  ├─ miss なら従来通り getDriveFiles + fetchSemanticHits
  └─ hit でも semantic は revalidate（stale-while-revalidate）
        │
        ▼
GET /api/drives/{drive}/files?search=q&type=&sort=&order=&page=&limit=
```

Smart Folder は `/drive/{drive}/search?q=...&smart_folder_id=...` の形で URL に閉じ、サイドバーから呼び出される。

### Popup → 結果ページ handoff の理由

Phase 3 で結果ページが filename + semantic を 1 list に統合済み（`useFolderFiles` 内で `fetchSemanticHits` を直接呼び `mergeResults` + `sortMerged`）。ポップアップでも同じ統合を行うことで体感遅延を消し、`searchCache`（TTL 60s, partial write 対応）で再フェッチを省く。本体↔アドオン依存規律は維持される: popup も結果ページも intelligence の HTTP routes を `frontend/src/lib/semanticSearch.ts` の薄いラッパー経由で呼び出すのみで、アドオン slot 経由のデータパイプは不要（`semanticSearch.ts` 冒頭コメントに「HTTP-routes は addon の公開契約」と明記済み）。

2026-05-01 spec の「semantic を popup に出さない」判断は**「結果ページが 2 list 並立だった頃の前提」**に依存していたため、Phase 3 統合により前提が消えた段階で反転（spec `2026-05-03-search-popup-semantic-merge`）。

## Frontend

| Path | Purpose |
|---|---|
| `frontend/src/components/GlobalSearch.tsx` | クイックランチャーポップアップ。filename + semantic を AbortController 付きで並列発火 → `mergeResults` + `sortMerged("relevance","desc")` で 1 list 化 → 上位 8 件 (`POPUP_LIMIT`) を `MergedResultItem` でレンダ。結果は `searchCache` に書き込み。Enter で `router.push('/drive/{drive}/search?q=...')`、結果末尾に「全件表示 →」リンク。`AddonSlot` / `FilterTabs` は呼ばない（slot は結果ページのみ） |
| `frontend/src/components/search/MergedResultItem.tsx` | popup 用統合 list の行 component。サムネ + タイトル + パス + match badge 行（filename / path / audio / video / metadata / text）+ timestamp pill 行（transcript / clip 時のみ最大 5 個）。pill クリックで `?t=N` deep-link、行クリックで file detail へ |
| `frontend/src/components/search/__tests__/MergedResultItem.test.tsx` | filename only / semantic only / 両方ヒット / クリック遷移 / timestamp pill の検証 |
| `frontend/src/lib/searchCache.ts` | popup → 結果ページの handoff 用 in-memory cache。`Map<string, SearchCacheEntry>` + TTL 60s。key = `{drive}::{query}::{type ?? "all"}::{scene ? 1 : 0}`。partial write 対応（filename と semantic はタイミングが違うため、片方ずつ書いても他方を消さない）。subscribe API なし（popup は自前 state、結果ページは初期 hydrate のみ） |
| `frontend/src/lib/searchCache.test.ts` | TTL / partial write / read / key 同一性 |
| `frontend/src/lib/searchMerge.ts` | filename + semantic の merge / sort（既存、popup と結果ページで共通使用） |
| `frontend/src/lib/semanticSearch.ts` | intelligence の semantic search HTTP routes 薄ラッパー。`isSemanticSearchAvailable(drive)`、`fetchSemanticHits(query, drive, {limit?, signal?})`。冒頭コメントに「HTTP routes は addon の公開契約」明記。AbortSignal 対応（2026-05-03） |
| `frontend/src/lib/api.ts` | `getDriveFiles(drive, params, {signal?})` が AbortSignal を受領（2026-05-03 拡張）。Smart Folder CRUD は別関数 |
| `frontend/src/app/drive/[name]/search/page.tsx` | 検索結果ページのルート。`useSearchParams` から `q` / `type` / `sort` / `order` / `smart_folder_id` を読み、`FolderBrowser` に渡すだけの薄いラッパー |
| `frontend/src/components/FolderBrowser.tsx` | 既存の汎用ブラウザ。`searchQuery` / `typeFilter` / `smartFolderId` プロップを受ける。`searchQuery` セット時は Breadcrumb を隠し「検索: "q"」見出しと `<AddonSlot id="search-modes" props={{ context: "page", ... }} />` を上部に描画。FileGrid は通常フォルダと共有 |
| `frontend/src/components/folder/useFolderFiles.ts` | データフェッチ。`searchQuery` セット時は mount で `readSearchCache` し、hit なら `useInfiniteScroll` の initial に `filenameMatches`/`filenameTotal`/page=1 を注入し `semanticHits` も初期 state にセット（fetch スキップ）。miss なら従来通り fetch。hit でも semantic は revalidate |
| `frontend/src/components/SmartFolderSaveButton.tsx` | 「検索: ...」見出し横のボタン。`smart_folder_id` URL パラメータ未指定なら「★ Smart Folder に保存」、指定済みなら「Saved: {name}」+ Update / Rename / Delete ドロップダウン |
| `frontend/src/components/SmartFolderSaveDialog.tsx` | 名前入力ダイアログ（POST 用） |
| `frontend/src/components/SidebarSmartFoldersSection.tsx` | サイドバーの「スマートフォルダ」セクション。0 件時は自動的に非表示。右クリック / 長押しで Rename / Delete |
| `frontend/src/hooks/useSmartFolders.ts` | CRUD + ドライブスコープのキャッシュ |
| `frontend/src/test/setup.ts` | Vitest setup。2026-05-03 で `globalThis.jest = vi` polyfill 追加（fake timers + testing-library `waitFor` の互換のため） |
| `frontend/src/components/__tests__/GlobalSearch.test.tsx` | popup の merge シナリオ（filename only / semantic only / 両方ヒット / availability false）、cache 書き込み spy、AbortController による前リクエスト中断、Enter で push の検証 |
| `frontend/src/components/__tests__/SmartFolderSaveButton.test.tsx` | 10 tests: save / saved / update / rename / delete モードの状態遷移 |
| `frontend/src/components/__tests__/SidebarSmartFoldersSection.test.tsx` | 8 tests: 一覧、空時非表示、コンテキストメニュー |

## Backend

| Path | Purpose |
|---|---|
| `backend/app/database.py` | Phase 11 マイグレーション: `smart_folders` テーブル作成 |
| `backend/app/models.py` | `SmartFolder` ORM モデル |
| `backend/app/schemas.py` | `SmartFolderCreate` / `SmartFolderUpdate` / `SmartFolderResponse` Pydantic スキーマ |
| `backend/app/routers/smart_folders.py` | `/api/drives/{drive}/smart-folders` の CRUD（GET / POST / PATCH / DELETE）。`require_drive_access` 配下、locked drive は 404、cross-drive は wrong-drive 404 |
| `backend/tests/test_smart_folders.py` | 17 tests: CRUD 全パターン、drive 越境ブロック、locked → 404、`viewer_id` の write-only 仕様、同名重複作成許可 |

## Smart Folder DB スキーマ

```sql
CREATE TABLE smart_folders (
  id TEXT PRIMARY KEY,                       -- nanoid
  drive TEXT NOT NULL,                       -- ドライブ名（孤立行は許容）
  viewer_id TEXT,                            -- 作成者の viewer_id（NULL 許容）
  name TEXT NOT NULL,                        -- 表示名
  query TEXT NOT NULL,                       -- 検索クエリ
  file_type TEXT,                            -- 'video' | 'image' | 'audio' | 'document' | NULL
  sort_by TEXT,                              -- ソートフィールド（NULL = デフォルト）
  sort_order TEXT,                           -- 'asc' | 'desc' | NULL
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);
CREATE INDEX idx_smart_folders_drive ON smart_folders(drive);
```

### viewer_id の扱い

- `lit_viewer` cookie が存在する場合は SHA-256 prefix を保存、未設定なら NULL
- **list クエリでは viewer_id を WHERE 句で使わない**（現状 UX: ドライブ内で共有）
- 将来「自分の Smart Folder のみ表示」トグルを追加するときに既存データへ後付けできるよう、書き込み時点で記録だけしておく forward-compat 措置
- 詳細は `.claude/rules/internal-api-policy.md` の R4（write asymmetry）と矛盾しない設計（コアテーブル、コア UI が読む）

## API Endpoints

すべて `require_drive_access` 配下。drive スコープのアクセス制御ルールに従う。

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/drives/{drive}/smart-folders` | ドライブ内 Smart Folder 一覧 |
| POST | `/api/drives/{drive}/smart-folders` | 作成 `{ name, query, file_type?, sort_by?, sort_order? }` |
| PATCH | `/api/drives/{drive}/smart-folders/{id}` | 部分更新 |
| DELETE | `/api/drives/{drive}/smart-folders/{id}` | 削除 |

### Drive スコープルール

- **Locked drive**: API は 404 を返す（403 ではなく存在自体を隠す `.claude/rules/design-decisions.md` 「アクセス制御」）
- **Cross-drive**: ドライブ A の `id` をドライブ B のパスで触ろうとしても 404
- **同名重複作成**: 許可（ID は別、UI で区別）
- ドライブ削除と Smart Folder の削除は同期しない（孤立行を許容）。drives.json から消えた drive 名で作られた Smart Folder は API レスポンスから除外される

## URL コントラクト

```
/drive/{drive}/search?q={query}&type={file_type}&sort={field}&order={asc|desc}&smart_folder_id={id}
```

| パラメータ | 必須 | 用途 |
|---|---|---|
| `q` | Yes | 検索クエリ |
| `type` | No | `video` / `image` / `audio` / `document` |
| `sort` | No | ソートフィールド（未指定 = デフォルト） |
| `order` | No | `asc` / `desc` |
| `smart_folder_id` | No | この URL が Smart Folder 由来であることを示す（ボタンを Update / Rename / Delete モードに切り替える） |

`type` / `sort` / `order` の変更は `router.replace`（履歴に追加しない）。`q` の変更は `router.push`（戻るで前のクエリに戻れる）。

## Intelligence アドオン統合

`search-modes` スロットは popup と page の両 context をサポート。

| Path | Purpose |
|---|---|
| `addons/intelligence/frontend/src/components/SemanticSearchSlot.tsx` | `context: "popup" \| "page"` プロップ（既定 `"popup"`、後方互換）。`page` ではグリッドにふさわしいカードレイアウト、`popup` では従来のコンパクト縦積み |
| `addons/intelligence/frontend/src/components/FindModeSlot.tsx` | 同上。Find モードの page-context レイアウト対応 |
| `addons/intelligence/manifest.json` | `slots["search-modes"]` に `semantic-search` / `ask` / `find-mode` を登録 |

ポップアップ側からは Phase 3 で `AddonSlot` 呼び出しを撤去したため、`search-modes` スロットは検索結果ページ（context="page"）でのみレンダリングされる。intelligence 未インストール環境では `AddonSlot` が何も描画しないだけで、page も popup も正常に動く。

詳細なスロットメカニズムは `docs/ADDON-DEVELOPMENT.md` の "UI Slot System" を参照。`context` プロップは page で richer なレイアウトを返すための 1 ビットフラグであり、wire 形状の変更ではない（後方互換維持）。

## 関連ルール

- ドライブ = セキュリティ境界（`.claude/rules/design-decisions.md` 「ドライブ」）。Smart Folder もドライブ単位、横断不可
- `passwords.json` 未配置時は drive スコープ制御が graceful degradation（全公開）
- アドオンの `search-modes` スロットは fail-open（intelligence 未インストールで何も描画しないだけ）

## Related

- Specs:
  - `docs/superpowers/specs/2026-05-01-search-ui-rich-redesign.md` (2 層 UX 原典)
  - `docs/superpowers/specs/2026-05-02-search-results-unification-phase3.md` (結果ページ 1 list 統合)
  - `docs/superpowers/specs/2026-05-03-search-popup-semantic-merge.md` (popup semantic merge + cache handoff)
- Slot system: `docs/ADDON-DEVELOPMENT.md` "UI Slot System"
- Drive policy: `.claude/rules/design-decisions.md` "ドライブ" / "アクセス制御"
- Internal API policy（Smart Folder は core write が正当な理由）: `.claude/rules/internal-api-policy.md` R1 / R4
- Hako: `5rzHwstzWuhtYn6olkz2Y` (popup semantic 復活の判断根拠 — 前提反転), `C6TXG5dX4chBj5TnmCiTO` (`searchCache` 設計), `tUEIFDp-0k-S-fik8jZa1` (snapshot 汚染バグの教訓 — searchCache が `searchQuery` を key に含むので folder snapshot とは独立)
