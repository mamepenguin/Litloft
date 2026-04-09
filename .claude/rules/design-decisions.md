# 重要な設計判断

コードを読むだけではわからない「なぜそうなっているか」をまとめたもの。
詳細な設計書は `docs/superpowers/specs/` にある。

## アクセス制御
- **保護ドライブの不可視性**: 未ロック時はAPI応答から完全除外（403ではなく404を返す）
- **`/unlock` ページ**: UIにリンクなし、URLを知っている人だけがアクセス
- **`passwords.json` 未配置時**: 全ドライブ公開（graceful degradation）
- **`passwords.json` 使用時**: `docker-compose.yml` の backend volumes に `./passwords.json:/app/passwords.json:ro` を追加する必要あり

## ドライブ設計原則
- 各ドライブは完全に独立（横断検索・横断お気に入り不要）
- ドライブ設定は `drives.json` で管理（DB外）。変更時はコンテナ再起動
- `drives.json` に `readonly: true` で書き込み禁止
- お気に入りURLは `?view=favorites` クエリパラメータ（フォルダ名との競合回避）

## ゴミ箱（ソフトデリート）
- **FSファイルはそのまま残す**: ゴミ箱に入れてもFSは変更しない。パージ時に初めて物理削除
- **自動パージ**: 30日経過でstartup時+24時間ごとに物理削除
- **既存クエリ**: 全てに `File.deleted_at.is_(None)` フィルタ追加済み
- **スキャナー**: ソフトデリート済みファイルはスキップ（removed扱いにしない）

## 視聴履歴・プロファイル
- **プロファイルとアクセス制御は独立**: JWT `hv_token` = ドライブアクセス制御、Cookie `hv_viewer` = 個人識別。直交する概念
- **ニックネーム方式**: アカウント不要。サーバー側でSHA-256ハッシュ→viewer_id
- **プロファイル未設定時**: localStorageフォールバック、サーバーへの保存なし（204返却）
- **プロファイル一覧API不在**: プライバシー保護（意図的な設計）

## WebSocket
- **選定理由**: 「backendは外部非公開」の設計方針維持。Next.js Custom Serverでプロキシ
- **未認証でも接続許可**: 全公開モード対応。保護ドライブ通知のみフィルタ
- **スキャナー連携**: `run_in_executor` → `call_soon_threadsafe` で非同期ブロードキャストに橋渡し

## アドオンシステム

### 2種類のアドオン

| 種類 | 例 | 動作方式 | 配置先 |
|---|---|---|---|
| **インプロセス** | cloud-sync, downloader, podcast | 本体バックエンドプロセス内で動作 | `backend/addons/{name}/` (シンボリンク → `addons/{name}/backend/`) |
| **独立サービス** | semantic-search | 別Dockerコンテナとして動作 | `addons/{name}/` + `docker-compose.override.yml` |

### インプロセスアドオンの仕組み
- **動的発見**: `main.py` の `_load_addons()` が `backend/addons/` を `pkgutil.iter_modules` でスキャン
- **必須インターフェース**: `router` モジュールに `router: APIRouter` を公開
- **オプション**: `ADDON_META` dict（サイドバー表示用）、`on_startup()` async関数
- **API**: `GET /api/addons/status` で有効なアドオン一覧を返却
- **フロントエンド**: サイドバーは `getEnabledAddons()` で動的にアドオンリンクを表示。アイコンは `ADDON_ICONS` マップで解決
- **有効化/無効化**: シンボリックリンクの追加/削除だけで制御。本体コードの変更不要

### 独立サービスアドオンの仕組み
- `docker-compose.override.yml` でサービスを追加（本体の `docker-compose.yml` は変更しない）
- 本体DBへの読み取り専用アクセス（SQLiteファイルを `:ro` マウント）
- イベント通知は `event-hooks.json` で設定（本体が汎用イベントを発行、リスナーURLを設定で登録）
- **Generic Addon Proxy** (`routers/addon_proxy.py`) が宣言的マニフェスト (`backend/addon-manifests/*.json`) に基づいてプロキシ+アクセス制御を実行
- 旧 `routers/search.py` は削除済み。全エンドポイントがGeneric Proxyに移行

### UIスロット機構（Progressive Enhancement）
- 本体UIに「スロット」（拡張ポイント）を定義: `search-modes`, `file-detail-sections`, `sidebar-sections`, `dashboard-widgets`
- アドオンは `ADDON_META` の `slots` 宣言でどのスロットに何を注入するか定義
- `GET /api/addons/status` がアドオン情報+スロット情報を返却
- フロントエンドは `useAddonSlots()` フックでスロット情報を取得し動的レンダリング
- アドオンがなければスロットは非表示（UIに穴は開かない）

### Internal API（外部サービスアドオン用）
- `routers/internal.py`: Docker内部ネットワーク専用のAPI
- `GET /api/internal/accessible-drives`: アクセス可能ドライブ一覧
- `GET /api/internal/files/{file_id}`: ファイルメタデータ
- `POST /api/internal/filter-file-ids`: ファイルIDのアクセス権フィルタ

### イベントフック（`event-hooks.json`）
- 本体が発行するイベント: `files.deleted`, `files.restored`, `files.purged`, `scan.complete`
- 設定ファイルがなければ全て no-op（アドオンなし環境に影響なし）
- テンプレート: `backend/event-hooks.json.example`

### 本体との依存関係の原則
- **本体 → アドオン**: 本体コアにアドオン固有のコードを入れない。汎用的な仕組み（アドオンローダー、イベントフック）を通じて連携
- **アドオン → 本体**: アドオンは本体の `app.config`, `app.database`, `app.models`, `app.services.ws` 等を自由にimportできる（期待される依存方向）
- **フロントエンド**: アドオンのUIコンポーネントは `frontend/src/addons/{name}/` に配置。Next.jsルートページ（`frontend/src/app/{name}/page.tsx`）は薄いラッパーとして本体側に手動作成が必要

### semantic-search → intelligence への進化
- semantic-searchは将来的にintelligenceアドオンに進化予定（フィーチャーフラグ方式）
- `routers/search.py` は削除済み。Generic Addon Proxy + `backend/addon-manifests/intelligence.json` に移行
- フロントエンドの検索API呼び出しは `/api/addons/intelligence/` パスに変更済み
- フロントエンドの専用コンポーネント（`GlobalSearch`, `SearchIndexStatus`, `IndexDetailsPanel`, `ClipFramesPanel`）は段階的にスロットベースに移行予定

## HEIC画像対応
- **問題の本質**: Debian aptのffmpegはlibheif未対応でサムネイル真っ黒になる
- **解決**: `pillow-heif` + Pillow によるサーバーサイドJPEG変換（ffmpegは使わない）
