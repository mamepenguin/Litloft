# 設計ルール

コードを編集するときに必ず守るべき不変のルール。過去の経緯ではなく「今後もこうする」宣言として読むこと。一般的な命名規約やパターンは `backend-conventions.md` / `frontend-conventions.md` にある。

## アクセス制御

- 保護ドライブが locked の場合は API 応答から完全除外する。403 ではなく 404 を返し、存在自体を隠す
- `/unlock` は UI 上にリンクを置かない。URL 直打ちのみでアクセスさせる
- `passwords.json` 未配置時は全ドライブ公開（graceful degradation）。エラーにしない
- `passwords.json` を使う構成では `docker-compose.yml` の backend volumes に `./passwords.json:/app/passwords.json:ro` を追加する

## ドライブ

- **ドライブはセキュリティ境界**。ドライブ横断の検索・お気に入り・タグ集計などの機能を作らない
- お気に入り等の特別ビューは `?view=<name>` クエリで表現する（フォルダ名との衝突を避ける）
- ドライブ設定は `drives.json`（DB 外）で管理する。変更はコンテナ再起動で反映
- `drives.json` の `readonly: true` を尊重し、該当ドライブへの書き込みを拒否する

## ファイル状態（Active / Missing / Trash）

3 状態を `deleted_at` と `missing_since` の 2 カラムで表現し、両者は相互排他:

| 状態 | `deleted_at` | `missing_since` | 自動パージ |
|---|---|---|---|
| Active | NULL | NULL | - |
| Missing | NULL | SET | なし |
| Trash | SET | NULL | 30 日 |

- ファイル一覧系クエリでは必ず `app.models.active_file_filter()` を使う。`deleted_at.is_(None)` を直書きしない
- `restore_file()` は `deleted_at` と `missing_since` を両方 NULL に戻す（out-of-band 編集や将来のバグに対する safety net）
- scanner はソフトデリート済みファイルをスキップする（missing 扱いにしない）

## Missing の取り扱い

DB は FS のキャッシュではなく、FS から再生成不可能なデータ（視聴履歴・コメント・タグ・文字起こし・embedding）を保持する独立した情報源として扱う。

- FS に無い active ファイルは削除せず `missing_since = now` をセットして `files.missing` を発行する
- 同パス再出現で `missing_since = NULL` + `files.recovered` を発行する
- `drive_path.exists() == False` のとき scanner は早期 return する（マウント障害で全件 missing 化させない）
- 同パスへの upload は missing レコードを復活更新する（新規 INSERT しない、UNIQUE 制約回避）
- missing に対して stream は 410 Gone、GET と変更系は 404、サムネイルのみ配信可
- `files.purged` はユーザー明示の完全削除時のみ発行する。scanner からは発行しない
- missing のサムネイルは残す（復活時に再利用する）
- missing の自動パージはしない。ユーザーが明示的に削除するまで永久保持
- `purge_all_missing` は 200 件ずつチャンク commit し、各バッチごとに webhook を発行する

## ゴミ箱

- ゴミ箱投入では FS を変更しない。パージ時に初めて物理削除する
- 自動パージは 30 日経過で startup + 24h ごとに実行する

## プレイリスト

- missing/trash ファイルの新規追加は拒否する（`active_file_filter()` を適用）
- 既に入っている missing/trash はレスポンスに残し、frontend 側で状態に応じた表示調整をする

## タグ編集

canonical は拡張子で分岐する:

- **`.md`**: `frontmatter.tags` が canonical。`File.tags` は投影キャッシュ
- **非 `.md`**: `File.tags` が canonical

ルール:

- frontend は必ず `saveFileTags(file, tags)` 経由で保存する。mime_type / 拡張子分岐は同関数内で行い、UI 層で判定しない
- `.md` は `PUT /api/files/{id}/content` で frontmatter を書き換え、core が同一ハンドラ内で `File.tags` を同期投影する
- content write と tag projection は別 commit。projection 失敗時も content write は durable にする
- chip 編集の content PUT は 500ms debounce でまとめる（2s は長すぎる、100ms 未満は冗長）
- auto_tags approve も `saveFileTags` 経由。ConflictError は 1 回だけ retry する
- frontmatter parser は `backend/app/services/frontmatter.py` と `addons/knowledge/app/services/frontmatter.py` の 2 実装を独立に維持する（別コンテナで共有不可）。drift は PR レビューで検知
- `POST /api/internal/files/{id}/tags`（`CORE_INTERNAL_SECRET` gated）は knowledge scanner 専用。frontend から呼ばない

## ファイル関連付け / アクティブ要約

- `file_relations`（静的関連、`kind` 付き、双方向 OR で query）と `file_active_summaries`（file_id PK の 1:1 ポインタ）を分離する。要約差し替えで relation を壊さないため
- `kind` の値範囲は DB 制約ではなくアプリ層で管理する（アドオン拡張のため）
- 関連の両端は同一ドライブでなければならない。違反は 400 を返す
- `files.id` への FK は両テーブル両カラムで `ON DELETE CASCADE`
- `GET /api/files/{file_id}/active_summary` は locked 保護ドライブでは 404 を返す

## 視聴履歴・プロファイル

- JWT `hv_token`（ドライブアクセス制御）と Cookie `hv_viewer`（個人識別）を直交させる。混ぜない
- ニックネームは SHA-256 ハッシュ → viewer_id。アカウント管理はしない
- プロファイル未設定時は localStorage フォールバックで、サーバーには保存しない（204 を返す）
- プロファイル一覧 API は作らない（プライバシー保護）
- `WatchHistory` は「閲覧履歴」（ファイル詳細ページ表示）と「再生進捗」（player の position/duration）の両方を担う:
  - ファイル詳細ページを開いた時点で `POST /api/files/{file_id}/progress` を空 body で発行し `last_played_at` を更新する。媒体問わず（text / markdown / image / PDF も対象）
  - 媒体ファイルは player 起動後に position/duration 付きで再 POST し、playback markers を更新する
  - 両経路で `last_played_at` は常に最新化。view-only POST が media の playback markers を上書きすることはない
  - `playback_position=0`/`duration=0` の view-only レコードは continue-watching フィルタ (`drives.py` の 90% 完了ゲート) で自然除外される
  - 視聴履歴をクライアント間で同期したい場合の唯一のソースであり、`personal_history`（intelligence Ask）はこのテーブルを canonical として参照する

## WebSocket

- backend は外部非公開。WS も Next.js Custom Server 経由でプロキシする
- 未認証でも接続は許可する（全公開モード対応）。保護ドライブ通知のみフィルタする
- scanner からの ws broadcast は `run_in_executor` → `call_soon_threadsafe` で橋渡しする

## アドオン: scope と policy

capability scope と per-drive policy を 2 層に分離する:

- **capability scope**: `ADDON_META` / `manifest.json` の `"drive" | "global" | "both"`。未宣言はロードエラー + スキップ（推定しない）
- **policy**: `drives.json.addons.<name>`（bool または `{feature: bool}`）。本体は addon 名 / feature 名を解釈しない汎用辞書として扱う
- 未指定キーは graceful degradation で enable する

ルール:

- policy off のデータ防御は 2 層にする: host proxy の pre_check（404 化）+ addon 側 worker の `is_feature_enabled`（no-op 化）
- event-hooks の絞り込みは fail open にする（解決失敗時は forward、addon 側 WHERE で二重防御）
- policy off ドライブの既存データは addon 起動時に `purge_drive` する。policy 問合せ失敗時はスキップして誤削除を避ける
- drives.json 反映はプロセス再起動が前提。intelligence 側の `policy_client` は TTL 30s + fail open

## アドオン: drive scope のコンテキスト伝達

- URL は `/drive/{drive}/addons/{name}` だが、API は `/api/addons/{name}/...`
- frontend が `X-HV-Drive` ヘッダを付与する
- 本体 addon_proxy が scope=drive のとき必須化 + `accessible_drives` で検証 → upstream に forward
- addon 側は header を読むだけ。検証はしない
- `drive_optional` は本質的グローバル経路（`<img>`、admin queue 等）のみに限定する。別経路で認可を必須化する

## アドオン: 実装規律

- **本体 → アドオンの依存を作らない**。本体コアにアドオン固有のコードを入れない
- アドオン → 本体は自由（`app.config`, `app.database`, `app.models`, `app.services.ws` 等を使える）
- UI はスロット（`search-modes`, `file-detail-sections`, `dashboard-widgets`, `folder-actions` 等）経由で注入する。アドオンがなければスロットは非表示（UI に穴を開けない）
- アドオンの UI は `addons/{name}/frontend/` に置く。`Page.tsx` があれば `/addons/{name}` ルートは自動生成される（手動ラッパーを書かない）
- インプロセスアドオンの有効化/無効化はシンボリックリンクの追加/削除で制御する。本体コードを変更しない
- 独立サービスアドオンは `docker-compose.override.yml` で追加する。本体の `docker-compose.yml` は変更しない。本体 DB は読み取り専用マウント（`:ro`）

## Internal API

- `routers/internal.py` は Docker 内部ネットワーク専用
- 通常の state/meta endpoint は secret 不要
- `GET /api/internal/files/{id}/content` だけは別扱い: text mime 限定 + `CORE_INTERNAL_SECRET` 必須 + `_CONTENT_READ_ALLOWED_MIMES` + `CORE_INTERNAL_CONTENT_MAX_BYTES`（既定 10MB）の 3 層防御。本文は情報量が桁違いに大きいため

## LLM 機能（intelligence アドオン）

- OpenAI 互換クライアントを使う。設定は `search-config.yml` の `llm` セクション + `LLM_API_KEY`
- auto_tags / summaries / transcript_refine は 3 モード（`"false"` / `"manual"` / `"on_index"`）。デフォルトは `"false"`
- Ask は bool フラグ（内部名 `features.rag`）。デフォルト無効。ステートレス（本体 DB にもアドオン DB にも書かない）
- auto_tags は Suggest → Approve/Dismiss ワークフロー。自動適用しない
- 出力言語は `llm.output_language` で統一制御する
- ファイル内容（transcript / caption / text / frontmatter）が LLM API に送信される機能はプライバシー注意。ローカル LLM（ollama）を推奨する
- Ask の citations は retriever 結果セットと照合し、範囲外は drop する（捏造対策）
- Ask は内部フィルタ（Internal API）と `drive_access_nested` の二重アクセス制御

## Transcript Refine

- 原文は `TranscriptChunk.text_original` に保持する（revert 可能にする）
- chunks 単位で LLM を適用 → words は WhisperX の forced alignment で再構築 → embedding を修正後テキストで再計算
- aligner 失敗時（音声欠損 / 言語非対応 / OOM）は words 旧行を保持する。時間比例フォールバックは作らない

## HEIC 画像

- HEIC のサムネイルは Pillow（`pillow-heif`）で生成する。ffmpeg は libheif 未対応で真っ黒になるため使わない
