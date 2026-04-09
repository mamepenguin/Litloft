# Addon Architecture v2 設計書

## 概要

HomeVaultのアドオン機構をリファクタリングし、Progressive Enhancement + スロット機構 + Generic Proxyによる新しいアドオン統合方式を導入する。これにより:

1. **本体UIにアドオン固有コードを書かない** — スロット機構でアドオンがUI拡張を宣言的に注入
2. **本体にアドオン固有プロキシを書かない** — Generic Proxy + 宣言的フィルタで汎用的に転送
3. **アドオン間の依存を避ける** — フィーチャーフラグで1サービス内に機能を統合

## 背景

### 現状の問題

- `routers/search.py`（310行）がsemantic-search専用のプロキシ+フィルタコード。本体にアドオン固有ロジックが存在
- `GlobalSearch.tsx` にsemantic-search固有のUI（`semanticAvailable`, `SemanticResultItem`等）がハードコード
- `SimilarFiles` コンポーネントも本体側に存在
- intelligenceアドオンへの拡張でさらに悪化する見込み

### 設計原則

1. **本体は常に完全に機能する** — アドオンなしでもNAS/動画再生ツールとして完全
2. **Progressive Enhancement** — アドオンは「ない機能を足す」のではなく「ある機能を強化する」
3. **ファイルベース** — メモ=.md、Webクリップ=.md、PDF抽出=サイドカー.md
4. **信頼モデル** — インプロセスアドオンは信頼。外部サービスアドオンはProxy + フィルタで保護

---

## 拡張 ADDON_META スキーマ

### 現行スキーマ

```python
ADDON_META = {
    "label": "Download",
    "icon": "download",
    "href": "/download",
}
```

### 拡張スキーマ（インプロセスアドオン）

```python
ADDON_META = {
    # --- 既存フィールド（後方互換） ---
    "label": "Download",
    "icon": "download",
    "href": "/download",

    # --- 新規フィールド ---
    "type": "in_process",  # "in_process" | "external_service"

    # UIスロット宣言（任意）
    "slots": {
        "slot-id": [
            {
                "id": "unique-component-id",
                "label": "表示ラベル",
                "priority": 10,  # 小さいほど先に表示
            }
        ]
    },
}
```

### 拡張スキーマ（外部サービスアドオン）

外部サービスアドオンは本体プロセスにコードがないため、設定ファイルでマニフェストを定義する。

**`backend/addon-manifests/intelligence.json`**:

```json
{
    "label": "Intelligence",
    "icon": "brain",
    "type": "external_service",

    "slots": {
        "search-modes": [
            {"id": "semantic-search", "label": "Semantic Search", "priority": 10}
        ],
        "file-detail-sections": [
            {"id": "similar-files", "label": "Similar Files", "priority": 20}
        ],
        "dashboard-widgets": [
            {"id": "index-status", "label": "Index Status", "priority": 10}
        ]
    },

    "proxy": {
        "target_env": "INTELLIGENCE_SERVICE_URL",
        "target_default": "http://intelligence:8100",
        "health_check": "/health",
        "routes": [
            {
                "path": "/search",
                "methods": ["GET"],
                "response_filter": {
                    "type": "drive_access",
                    "array_path": "results",
                    "drive_field": "drive"
                }
            },
            {
                "path": "/search/compare",
                "methods": ["GET"],
                "response_filter": {
                    "type": "drive_access_nested",
                    "paths": {
                        "rrf.results": "drive",
                        "cosine.results": "drive",
                        "rrf_no_cutoff.results": "drive",
                        "cosine_no_cutoff.results": "drive"
                    }
                }
            },
            {
                "path": "/similar/{file_id}",
                "methods": ["GET"],
                "pre_check": {
                    "type": "file_access",
                    "param": "file_id"
                },
                "response_filter": {
                    "type": "drive_access",
                    "array_path": "results",
                    "drive_field": "drive"
                }
            },
            {
                "path": "/files/{file_id}/transcript",
                "methods": ["GET"],
                "pre_check": {"type": "file_access", "param": "file_id"},
                "response_filter": null
            },
            {
                "path": "/files/{file_id}/index-details",
                "methods": ["GET"],
                "pre_check": {"type": "file_access", "param": "file_id"},
                "response_filter": null
            },
            {
                "path": "/files/{file_id}/clip-timestamps",
                "methods": ["GET"],
                "pre_check": {"type": "file_access", "param": "file_id"},
                "response_filter": null
            },
            {
                "path": "/files/{file_id}/clip-analysis",
                "methods": ["GET"],
                "pre_check": {"type": "file_access", "param": "file_id"},
                "response_filter": null
            },
            {
                "path": "/files/{file_id}/frame",
                "methods": ["GET"],
                "pre_check": {"type": "file_access", "param": "file_id"},
                "response_filter": null,
                "stream": true
            },
            {
                "path": "/status",
                "methods": ["GET"],
                "response_filter": null
            },
            {
                "path": "/index-details",
                "methods": ["GET"],
                "response_filter": null
            }
        ]
    }
}
```

### フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `label` | string | yes | 表示名 |
| `icon` | string | yes | Lucideアイコン名 |
| `href` | string | no | アドオン専用ページのパス |
| `type` | string | no | `"in_process"` or `"external_service"` (default: `"in_process"`) |
| `slots` | object | no | UIスロット宣言。キー=スロットID、値=コンポーネント配列 |
| `proxy` | object | no | 外部サービスプロキシ設定 |
| `proxy.target_env` | string | yes* | ターゲットURLの環境変数名 |
| `proxy.target_default` | string | yes* | 環境変数未設定時のデフォルトURL |
| `proxy.health_check` | string | no | ヘルスチェックパス |
| `proxy.routes` | array | yes* | プロキシルート定義 |

*外部サービスアドオンの場合のみ必須

---

## UIスロット機構

### スロット一覧

| スロットID | 配置場所 | レンダリング | 用途例 |
|-----------|---------|-------------|--------|
| `search-modes` | GlobalSearch | タブ/モード切替 | セマンティック検索、質問応答 |
| `file-detail-sections` | FileDetail | 縦積みセクション | 関連ファイル、AI要約 |
| `sidebar-sections` | Sidebar | リンクリスト | インデックス状況 |
| `dashboard-widgets` | Admin Dashboard | カード | インデックス統計 |
| `file-context-menu` | ファイルコンテキストメニュー | メニュー項目 | 将来拡張用 |

### フロントエンド実装方式

```
/api/addons/status
  → 全アドオンのslots情報を取得
  → AddonSlotsContext に格納
  → 各スロット配置箇所で <AddonSlot id="search-modes" /> を描画
  → スロットに登録されたコンポーネントを lazy import で読み込み
```

**コンポーネント解決**: アドオン名 + スロット内ID → `frontend/src/addons/{addon}/` 内のコンポーネント

```typescript
// frontend/src/lib/addon-slots.ts

// スロットID + コンポーネントID → lazy importパス
// この対応表はアドオンのフロントエンドに配置
// frontend/src/addons/{addon}/slots.ts で export

export interface SlotEntry {
  id: string;
  label: string;
  priority: number;
  addonName: string;
}

export interface SlotRegistry {
  [slotId: string]: SlotEntry[];
}
```

**AddonSlotコンポーネント**:

```tsx
// frontend/src/components/AddonSlot.tsx

interface AddonSlotProps {
  id: string;               // スロットID
  props?: Record<string, unknown>;  // スロット内コンポーネントに渡すprops
  layout?: "tabs" | "stack" | "menu";  // 複数コンポーネントの配置方式
}

function AddonSlot({ id, props, layout = "stack" }: AddonSlotProps) {
  const { slots } = useAddonSlots();
  const entries = slots[id] ?? [];

  if (entries.length === 0) return null;  // アドオンなし → 非表示

  // layout に応じてレンダリング
  // "tabs": タブ切替
  // "stack": 縦積み
  // "menu": メニュー項目
}
```

### コンポーネントロード方式

各アドオンのフロントエンドは `frontend/src/addons/{addon}/slots.ts` で、スロットIDとコンポーネントの対応を定義:

```typescript
// frontend/src/addons/intelligence/slots.ts
import { lazy } from "react";

export const slotComponents: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  "semantic-search": lazy(() => import("./SemanticSearchTab")),
  "similar-files": lazy(() => import("./SimilarFilesSection")),
  "index-status": lazy(() => import("./IndexStatusWidget")),
};
```

本体側の `AddonSlot` は、アドオンが有効かつスロットに登録があれば、対応するコンポーネントを動的に読み込む。アドオンが無効またはスロット未登録なら何も表示しない。

---

## Generic Addon Proxy

### アーキテクチャ

```
Browser → Next.js(:3000) → /api/search/* (rewrite) → FastAPI(:8000)
                                                         ↓
                                              addon_proxy.py (Generic)
                                                         ↓
                                              intelligence:8100 (Docker内部)
```

### ルーティング

外部サービスアドオンのAPIは `/api/addons/{addon_name}/` プレフィックスでプロキシ:

```
GET /api/addons/intelligence/search?q=...
  → Generic Proxy
  → GET http://intelligence:8100/search?q=...
  → response_filter: drive_access(results, drive)
  → filtered response
```

### レスポンスフィルタ

| フィルタタイプ | 動作 |
|--------------|------|
| `drive_access` | `array_path` で指定された配列を取得し、`drive_field` の値がアクセス可能ドライブに含まれない要素を除去 |
| `drive_access_nested` | 複数のネストされたパスに対して同一フィルタを適用 |
| `null` | フィルタなし（そのまま転送） |

### Pre-checkフック

| フックタイプ | 動作 |
|-------------|------|
| `file_access` | パスパラメータの `file_id` でDBからファイルを検索。存在しないか、アクセス不可のドライブなら 404 |

### 実装ファイル

```
backend/app/
  routers/
    addon_proxy.py       # Generic Proxy ルーター
    internal.py          # Internal API（Docker内部ネットワーク用）
  services/
    addon_registry.py    # マニフェスト読み込み + レジストリ
```

---

## Internal API

Docker内部ネットワーク専用。外部サービスアドオンが本体の情報を取得するためのAPI。

### エンドポイント

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/internal/accessible-drives` | 指定トークンでアクセス可能なドライブリスト |
| GET | `/api/internal/files/{file_id}` | ファイルメタデータ（id, drive, name, file_type, path） |
| POST | `/api/internal/filter-file-ids` | ファイルIDリストをアクセス権でフィルタ |

### アクセス制御

Internal APIはDocker内部ネットワーク経由でのみアクセス可能。`docker-compose.yml` のネットワーク設定で制限。追加のトークン認証は不要（同一trusted network内）。

ただし、ドライブアクセス制御が必要なエンドポイントでは、リクエストヘッダ `X-HV-Token` でJWTトークンを転送する。

---

## アドオン開発規約

### インプロセスアドオン

| ルール | 理由 |
|--------|------|
| アドオン専用テーブルは `{addon_name}_` プレフィックス | 名前衝突防止 |
| コアテーブルへの直接 INSERT/UPDATE/DELETE は禁止 | コアのサービス関数を経由する |
| コアテーブルの READ は許可 | File, Tag等のクエリは必要 |
| コアモデルのスキーマ変更は禁止 | アドオンがコアのマイグレーションを壊さない |

### 使用可能なコアAPI

| モジュール | 関数/変数 | 用途 |
|-----------|----------|------|
| `app.config` | `DRIVES`, `DATA_DIR`, `get_drive_path()` | ドライブ設定 |
| `app.database` | `get_db`, `SessionLocal` | DBセッション取得 |
| `app.models` | `File`, `Tag`, etc. (READ ONLY) | ファイル情報クエリ |
| `app.auth` | `get_unlocked_groups`, `filter_drives` | アクセス制御 |
| `app.services.scanner` | `register_single_file()` | ファイルDB登録 |
| `app.services.ws` | `manager.broadcast()` | WebSocket通知 |
| `app.services.event_hooks` | `emit()` | イベント発行 |
| `app.nanoid` | `generate_nanoid()` | ID生成 |

### 外部サービスアドオン

| ルール | 理由 |
|--------|------|
| 本体DBには `:ro` マウントのみ | 書き込み事故防止 |
| APIはGeneric Proxy経由で公開 | アクセス制御を本体が担保 |
| 本体情報が必要な場合はInternal APIを使用 | 直接DB参照の代替 |
| Webhookで本体イベントを受信 | `event-hooks.json` で設定 |

---

## 既存search.pyからの移行

### 現在のエンドポイント → Generic Proxy対応

| 現在のパス | Generic Proxy パス | フィルタ | Pre-check |
|-----------|-------------------|---------|-----------|
| `GET /api/search` | `GET /api/addons/intelligence/search` | `drive_access(results, drive)` | - |
| `GET /api/search/compare` | `GET /api/addons/intelligence/search/compare` | `drive_access_nested(...)` | - |
| `GET /api/search/similar/{file_id}` | `GET /api/addons/intelligence/similar/{file_id}` | `drive_access(results, drive)` | `file_access(file_id)` |
| `GET /api/search/files/{file_id}/transcript` | `GET /api/addons/intelligence/files/{file_id}/transcript` | `null` | `file_access(file_id)` |
| `GET /api/search/files/{file_id}/index-details` | `GET /api/addons/intelligence/files/{file_id}/index-details` | `null` | `file_access(file_id)` |
| `GET /api/search/files/{file_id}/clip-timestamps` | `GET /api/addons/intelligence/files/{file_id}/clip-timestamps` | `null` | `file_access(file_id)` |
| `GET /api/search/files/{file_id}/clip-analysis` | `GET /api/addons/intelligence/files/{file_id}/clip-analysis` | `null` | `file_access(file_id)` |
| `GET /api/search/files/{file_id}/frame` | `GET /api/addons/intelligence/files/{file_id}/frame` | `null` (stream) | `file_access(file_id)` |
| `GET /api/search/status` | `GET /api/addons/intelligence/status` | `null` | - |
| `GET /api/search/index-details` | `GET /api/addons/intelligence/index-details` | `null` | - |

### フロントエンドAPIパス変更

```typescript
// 現在
const API_BASE = "/api";
`${API_BASE}/search?q=...`
`${API_BASE}/search/similar/${fileId}`

// 移行後
`${API_BASE}/addons/intelligence/search?q=...`
`${API_BASE}/addons/intelligence/similar/${fileId}`
```

### 後方互換

移行期間中は `next.config.ts` の rewrites で旧パス → 新パスへリダイレクト可能。

---

## 将来の拡張ポイント

- **ドライブスコープ**: ADDON_METAに `scope: "drive" | "global" | "both"` を追加
- **ドライブごとのアドオン設定**: `drives.json` に `addons` フィールド追加
- **LLMプロバイダー設定**: intelligence-config.yml の `llm` セクション
- **フィーチャーフラグ**: intelligence-config.yml の `features` セクション
