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
- 検索プロキシ（`routers/search.py`）は現状semantic-search専用。汎用化はYAGNIとして見送り

### イベントフック（`event-hooks.json`）
- 本体が発行するイベント: `files.deleted`, `files.restored`, `files.purged`, `scan.complete`
- 設定ファイルがなければ全て no-op（アドオンなし環境に影響なし）
- テンプレート: `backend/event-hooks.json.example`

### 本体との依存関係の原則
- **本体 → アドオン**: 本体コアにアドオン固有のコードを入れない。汎用的な仕組み（アドオンローダー、イベントフック）を通じて連携
- **アドオン → 本体**: アドオンは本体の `app.config`, `app.database`, `app.models`, `app.services.ws` 等を自由にimportできる（期待される依存方向）
- **フロントエンド**: アドオンのUIコンポーネントは `frontend/src/addons/{name}/` に配置。Next.jsルートページ（`frontend/src/app/{name}/page.tsx`）は薄いラッパーとして本体側に手動作成が必要

### semantic-search の特殊性
- 独立サービスのため、本体に `routers/search.py`（プロキシ＋アクセス制御）が残存
- フロントエンドにも専用コンポーネント（`GlobalSearch`, `SearchIndexStatus`, `IndexDetailsPanel`, `ClipFramesPanel`）と型定義がある
- これらは分離コスト対効果を考慮して現状維持。過剰な汎用化はしない

## HEIC画像対応
- **問題の本質**: Debian aptのffmpegはlibheif未対応でサムネイル真っ黒になる
- **解決**: `pillow-heif` + Pillow によるサーバーサイドJPEG変換（ffmpegは使わない）
