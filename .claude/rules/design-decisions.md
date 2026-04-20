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

## ファイル状態の3状態（Active / Missing / Trash）

`File` モデルは `deleted_at` と `missing_since` という 2 つのタイムスタンプカラムで 3 つの状態を表現する。両者は相互排他:

| 状態 | `deleted_at` | `missing_since` | 意味 | 自動パージ |
|---|---|---|---|---|
| Active | NULL | NULL | 通常 | - |
| Missing | NULL | SET | FSにない（復活待ち） | **なし** |
| Trash | SET | NULL | ユーザー削除 | 30日 |

**共通ヘルパー**: `app.models.active_file_filter()` が `and_(deleted_at.is_(None), missing_since.is_(None))` を返す。新しいクエリでは必ずこのヘルパーを使う（22箇所の直書き `deleted_at.is_(None)` は全て移行済み）。

## ゴミ箱（ソフトデリート）
- **FSファイルはそのまま残す**: ゴミ箱に入れてもFSは変更しない。パージ時に初めて物理削除
- **自動パージ**: 30日経過でstartup時+24時間ごとに物理削除
- **既存クエリ**: 全てに `active_file_filter()` 経由で `File.deleted_at.is_(None)` フィルタを追加
- **スキャナー**: ソフトデリート済みファイルはスキップ（missing 扱いにしない）

## 見つからないファイル（Missing）
- **設計哲学**: DB は単なる FS のキャッシュではなく、FS から再生成不可能なユーザー/アドオン生成データ（視聴履歴・コメント・タグ・Whisper 文字起こし・CLIP embedding）を保持する独立した情報源。FS で一時的に見えなくなったからといって即座に物理削除しない
- **スキャナーの挙動**: FS で見つからない active ファイルは物理削除せず `missing_since = now` をセットし `files.missing` イベント発行。過去の「物理削除 + `files.purged` 発行」は廃止
- **復活判定**: 同じパスに FS 上で再出現したら `missing_since` をクリアし `files.recovered` イベント発行。ハッシュベース復活は未実装（Phase 2 で検討）
- **自動パージしない**: ゴミ箱と異なり、ユーザーが明示的に削除するまで永久に保持。NAS の長期切断にも耐える
- **サムネイル**: missing 化時もサムネイルは残す（復活時に再利用するため）
- **ドライブ全体不在**: `drive_path.exists() == False` なら scanner は早期 return し missing マーキングもしない。マウントポイントごと壊れた場合の全消失を防ぐ
- **アップロード衝突**: 同パスに missing レコードがある場合、upload は新規INSERTでなくそのレコードを復活扱いで更新（UNIQUE 制約回避）
- **`files.purged` の意味変更**: スキャン起因の purged 発行は廃止。ユーザー明示の完全削除（purge endpoint）だけが `files.purged` を発行する
- **intelligence アドオン連携**: missing/recovered webhook は既存 soft-delete と同じ経路で `active=False/True` を切り替え。Whisper/CLIP/embedding は保全される
- **UI**: サイドバーには `missing_count > 0` のときだけ「見つからないファイル」リンクを表示。専用ビュー `?view=missing` から一覧確認・個別パージ・一括パージが可能。通常のファイル一覧には missing は出ない（backend 側で `active_file_filter()` が除外）
- **アクセス制御**: missing ファイルに対して stream は 410 Gone、通常の GET も 404、変更系操作（rename/move/tag 等）は全て 404。サムネイルのみ配信可能（古いキャッシュ）
- **プレイリスト**: 新規にプレイリストへ missing/trash ファイルを追加するのは拒否（`add_playlist_items` で `active_file_filter()` を適用）。既にプレイリストに入っている missing/trash ファイルは response に残し、frontend が `missing_since`/`deleted_at` を見て表示を調整する（trash と同じ既存パターン）
- **restore_file の防御**: `restore_file()` は `deleted_at = None` と同時に `missing_since = None` もクリアする。相互排他はソース側で強制されるが、out-of-band DB 編集や将来のバグに対する safety net
- **`purge_all_missing` のバッチ化**: 大量 missing ファイル purge 時の長時間 DB ロック / 部分失敗を避けるため、200 件ずつチャンク commit。各バッチは `purged_ids` を返し、router 側で TOCTOU なく webhook 発行

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

### アドオン scope（capability / policy の2層分離）
- **層1 capability (scope)**: アドオン開発者が `ADDON_META` / `manifest.json` で宣言する `"drive" | "global" | "both"`。値は利用者変更不可、未指定のアドオンはロード時にエラー + スキップ
  - `drive`: `/drive/{drive}/addons/{name}` のみ。ドライブ未選択状態では存在しない
  - `global`: `/addons/{name}` のみ
  - `both`: 両方の URL に生える。`currentDrive` の有無でサイドバーのリンク先が切り替わる
- **層2 policy (enabled)**: ドライブごとの有効/無効を `drives.json.addons.<name>` で運用者が選択。`bool` ショートハンド（`"intelligence": false` で全機能 OFF）または `{ feature: bool }` で feature 単位制御。未指定キーは graceful degradation で全 enable。本体は addon 名 / feature 名を解釈しない汎用辞書として扱う
- **Next.js ルーティング**: `src/app/addons/[name]/page.tsx` と `src/app/drive/[name]/addons/[addon]/page.tsx` の2本がジェネリックディスパッチャとして動作。`@/addons/{name}/Page` を lazy import。scope 不整合は `notFound()`
- **サイドバー**: `addonUrlFor(name, meta, currentDrive)` で href を生成。`drive` スコープは `currentDrive` が null のとき非表示
- **scope 割り当て**: intelligence=drive / downloader=drive / podcast=drive / knowledge=drive / cloud-sync=global
- **drive-scoped アドオンのコンテキスト伝達**: URL は `/drive/{drive}/addons/{name}` だが API 経路は `/api/addons/{name}/...` で drive 情報を含まない。フロントエンドが `X-HV-Drive` ヘッダで drive を明示し、本体 addon_proxy が scope=drive の場合は必須化しつつ `accessible_drives` で検証。検証済みヘッダはそのまま upstream アドオンへ forward され、アドオン側はヘッダを読むだけでよい（B1 の精神: アドオン開発者は header を読むだけ。ヘッダ付与の主体はフロント、検証は本体プロキシ）

### Per-drive policy 機構（drives.json `addons` フィールド）
- **データ防御は 2 層**: (1) host addon_proxy が `addon_feature` pre_check で route アクセスを 404 化、(2) アドオン側 worker / handler が `is_feature_enabled` で no-op
- **イベント絞り込み**: `event-hooks.json` 各 listener に `addon` + `feature`（default `index`）を書ける。host event_hooks が payload の `drive` または `file_ids` から policy を評価し、disabled ドライブ分を drop/strip。fail open（解決失敗時は forward、addon 側 WHERE で二重防御）
- **`/api/addons/status?drive=`**: umbrella `index` feature が off の addon を catalog から完全除外（slot entry も剥がす）。frontend `getAddonsStatus(drive?)` は drive 別 Map で cache、`AddonSlotsProvider` が `useCurrentDrive` 購読で drive 切替時再 fetch
- **OFF 時の既存データ**: アドオン起動時に local index を distinct drive scan → host policy 確認 → `index` off ドライブのデータを物理削除（`purge_drive`）。policy 問合せ自体が失敗したドライブはスキップ（誤削除回避）。drives.json 編集 + 再起動が「purge トリガ」
- **`current_drive_only(_nested)` レスポンスフィルタ**: 既存 `drive_access` が「accessible 集合」で絞るのに対し、`X-HV-Drive` 一致のみ通過。manifest 宣言で host が実行
- **`drive_optional` per-route opt-out**: scope=drive の addon でも `<img>` 経路や本質的グローバル機能（admin queue, status）は header 不要化可能。ただし別経路（`file_access` pre_check, admin context 前提）で認可必須
- **キャッシュ**: drives.json は既存挙動同様プロセス再起動まで反映されない。intelligence 側 `policy_client` は TTL 30s + fail open
- **詳細**: `docs/superpowers/specs/2026-04-14-intelligence-drive-scope.md`

### 2種類のアドオン

| 種類 | 例 | 動作方式 | 配置先 |
|---|---|---|---|
| **インプロセス** | cloud-sync, downloader, podcast | 本体バックエンドプロセス内で動作 | `backend/addons/{name}/` (シンボリンク → `addons/{name}/backend/`) |
| **独立サービス** | intelligence | 別Dockerコンテナとして動作 | `addons/{name}/` + `docker-compose.override.yml` |

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
- **Generic Addon Proxy** (`routers/addon_proxy.py`) が宣言的マニフェスト (`addons/{name}/manifest.json`) に基づいてプロキシ+アクセス制御を実行。マニフェストはアドオン自身のリポに置かれ、本体リポには特定アドオンの痕跡を残さない
- 旧 `routers/search.py` は削除済み。全エンドポイントがGeneric Proxyに移行

### UIスロット機構（Progressive Enhancement）
- 本体UIに「スロット」（拡張ポイント）を定義: `search-modes`, `file-detail-sections`, `dashboard-widgets`, `folder-actions`
- アドオンは `ADDON_META` の `slots` 宣言（インプロセス）またはマニフェストJSON（外部サービス）でどのスロットに何を注入するか定義
- `GET /api/addons/status` がアドオン情報+スロット情報を返却（proxy設定はストリップされる）
- フロントエンドは `AddonSlotsProvider` + `useAddonSlots()` フックでスロット情報を取得し動的レンダリング
- `AddonSlot` コンポーネントがアドオン名のバリデーション+遅延読み込みを実行
- 各アドオンは `frontend/src/addons/{name}/slots.ts` で `slotComponents` マップをエクスポート
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
- **フロントエンド**: アドオンのUIコンポーネントは `addons/{name}/frontend/` に配置。ビルド時に `frontend/Dockerfile` が `src/addons/{name}/` にコピーし、`Page.tsx` が存在すれば `src/app/addons/{name}/page.tsx` ラッパーを自動生成する（`/addons/{name}` ルートが生える）。**独立サービスアドオンもインプロセスアドオンも同じ仕組み**。本体リポに手動ラッパーを作る必要はない。サイドバーリンクは `manifest.json`（独立型）または `addon.json`（インプロセス型）の `href` フィールドで制御

### intelligence アドオン（旧 semantic-search）
- semantic-search から intelligence にリネーム完了。Dockerサービス名: `intelligence`、環境変数: `INTELLIGENCE_SERVICE_URL`
- `routers/search.py` は削除済み。Generic Addon Proxy + `addons/intelligence/manifest.json` に移行
- フロントエンドの検索API呼び出しは `/api/addons/intelligence/` パスに変更済み
- フロントエンドの全UIコンポーネントはスロットベースに移行完了（`slots.ts` で `slotComponents` をエクスポート）

### LLM基盤（intelligenceアドオン）
- **OpenAI互換クライアント**: ollama, OpenAI, DeepSeek, vLLM, LM Studio等に対応
- **設定**: `search-config.yml` の `llm` セクション + `LLM_API_KEY` 環境変数
- **フィーチャーフラグ**: `features.auto_tags` で制御（`"false"`, `"manual"`, `"on_index"`）
- **デフォルト無効**: セキュリティ上、auto_tagsはデフォルトで `"false"`

### 自動タグ（Auto Tags）
- **Suggest → Approve/Dismissワークフロー**: タグは提案であり、自動適用されない
- **3つのモード**: `"false"`（無効）、`"manual"`（UI操作のみ）、`"on_index"`（インデックス後自動実行）
- **ファイル単位**: ファイル詳細ページの「Generate AI tags」ボタン
- **フォルダ単位**: フォルダツールバーの「Generate AI tags」ボタン（`folder-actions` スロット）
- **コンテキスト構築**: トランスクリプト（動画/音声）、BLIPキャプション（画像）、テキスト内容（文書）、メタデータ+ファイル名
- **出力言語制御**: `llm.output_language` でauto_tagsとsummariesの出力言語を制御（`"auto"`, `"ja"`, `"en"` 等）
- **セキュリティ考慮**: ファイル内容（トランスクリプト、キャプション、テキスト）がLLM APIに送信される。プライバシー重視ならローカルLLM（ollama）を推奨

### BLIPキャプション（intelligenceアドオン）
- **オプション**: `models.blip` で設定。空文字で無効化
- **用途**: 画像/動画フレームの英語テキスト記述を生成。auto_tagsの画像タグ精度向上に使用
- **メモリ**: 追加で約1GB必要（Whisper + CLIPのみ: 4GB、+ BLIP: 6GB、+ 大型モデル: 8GB）

### Ask（自然言語の質問応答）
- **概要**: 自然言語の質問に対し、引用付きの回答を LLM で生成するオンデマンド機能。内部実装は RAG（retrieval-augmented generation）
- **フィーチャーフラグ**: `features.rag: true/false`（bool、デフォルト無効。内部フラグ名は歴史的経緯で `rag` のまま）。auto_tags/summaries の 3モードと違い、インデックス時の自動生成概念がないため単純 bool
- **リトリーバー**: 既存 `app/search.py::search` をそのまま再利用（LLM によるクエリ書き換えなし）
- **コンテキスト**: 検索セグメントのマッチ箇所前後を抜粋（summaries の窓サンプリングとは別戦略）
- **引用の捏造対策**: LLM が返す citations の file_id をリトリーバー結果セットと照合、範囲外は drop
- **アクセス制御の二重化**: 内部フィルタ（Internal API）+ マニフェストフィルタ（`drive_access_nested` で citations/sources）
- **ステートレス**: キャッシュ/ワーカーなし、`POST /ask` の同期レスポンス1本。本体 DB にもアドオン DB にも書き込まない
- **UI**: `search-modes` スロットに `ask` として登録。ボタンクリックの明示発動（質問判定なしで多言語耐性を確保）
- **セキュリティ考慮**: ファイル内容（トランスクリプト、キャプション、テキスト）が質問のたびに LLM API に送信される。プライバシー重視ならローカルLLM（ollama）を推奨
- **設計スペック**: `docs/superpowers/specs/2026-04-10-intelligence-rag.md`

### トランスクリプト AI 修正（Transcript Refine）
- **概要**: Whisper / HvLink 由来の ASR トランスクリプトの誤認識を LLM でバッチ修正。原文は `TranscriptChunk.text_original` に保持し、いつでも revert 可能
- **フィーチャーフラグ**: `features.transcript_refine` の 3モード（`"false"` / `"manual"` / `"on_index"`）。デフォルト無効
- **粒度**: chunks 単位で LLM を適用 → words は WhisperX の wav2vec2 forced alignment で音響ベース再アライメント（CJK は文字単位、他は単語単位） → embedding は修正後テキストで同期再計算。aligner 失敗時（音声欠損 / 言語非対応 / OOM）は words 旧行を保持するフォールバック（時間比例版は廃止）
- **UI**: ファイル詳細の TranscriptSection に refine/revert ボタン + 修正済み badge。フォルダツールバーには `folder-refine-transcripts` スロット経由でバッチ実行ボタン
- **セキュリティ考慮**: トランスクリプト全文が LLM API に送信される。プライバシー重視ならローカル LLM（ollama）推奨
- **設計スペック**: `docs/superpowers/specs/2026-04-15-intelligence-transcript-refine.md`

## HEIC画像対応
- **問題の本質**: Debian aptのffmpegはlibheif未対応でサムネイル真っ黒になる
- **解決**: `pillow-heif` + Pillow によるサーバーサイドJPEG変換（ffmpegは使わない）
