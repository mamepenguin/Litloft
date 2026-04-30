# セルフホスト設定 GUI（admin 設定画面 + first-run wizard）

- **Status**: Approved, ready for implementation
- **Date**: 2026-04-30
- **Scope**: 本体コア（`backend/app/routers/admin.py` 追加、`frontend/src/app/admin/`、`frontend/src/app/setup/`）。アドオンには手を入れない。
- **関連 hako**:
  - `p7DUz3WHxD6xt3fw9OJWx`（既存 `/admin` の方針 — 「全ユーザー公開、将来は全ドライブ可視 viewer に絞る」）
  - `O5LkyjawfxUMBcPRpuocj`（自前認証を増やすな原則）
  - `JzO1mX12TVK_g3aC1mHl9`（自宅 LAN 限定が設計基盤）
  - `67Kx9eILRJkRVUG3Ii3QO`（addon capability/policy 2 層分離 — `drives.json.addons` 既存スキーマ）
  - `e7Tvdc4id1Tc9Ca5fGPz1`（passwords.json は `[{password, groups: [...]}]` 形式）
  - `lPwNmhq0B391-bwmeHuln`（config 変更は `docker compose restart` が必要）

## 背景

Litloft はセルフホストで、運用には現状以下のホスト側手作業が必要:

1. `drives.json` を手書き
2. `passwords.json` を手書き（任意）
3. `drives.json.addons` で per-drive アドオン policy を JSON 直書き
4. `.env` に `LLM_API_KEY` 等を記入
5. `docker-compose.yml` の volume にドライブパスを追加
6. アドオン有効化はシンボリックリンク追加

これらは README に手順があるが、JSON 直書きは閾値が高い。家庭ユーザー向けに「最初に GUI で一通り設定し、追加・変更も GUI で完結する」体験を提供したい。

## 目的

1. **first-run wizard**: 初回 `docker compose up -d` 直後にブラウザで開くと、ドライブ追加・パスワード設定・アドオン有効化までガイドする
2. **admin 設定画面**: 起動後も同じ内容を編集できる。ドライブの追加削除、パスワード追加削除、アドオン policy 切替
3. 編集の整合性検証で「保存できた config は次回起動で動く」を保証する
4. 反映に再起動が必要なことを明示し、ユーザーが忘れないようにする

## 非目的

- アドオンの追加・削除（symlink、`docker-compose.override.yml` の編集）
- `.env` の編集（`LLM_API_KEY` 等は引き続きホスト側で手書き）
- 自動再起動 / docker socket 連携
- バックアップからの GUI restore（CLI で `mv drives.json.bak drives.json` してもらう）
- ドライブパスのホスト側 docker-compose volume 追加（コンテナ内からは見えない。検証で「マウント漏れ」は検知できるが、修復はホスト側手作業）

## 認証 / 認可

### マスター viewer 判定

`passwords.json` の中で **全 group に属するパスワードでロック解除した viewer** だけが admin にアクセスできる。`passwords.json` 未設定時は誰でもアクセス可能（全公開モード ≒ 自分しかいない前提）。

実装: `backend/app/auth.py` に helper を追加。

```python
def is_admin_viewer(request: Request) -> bool:
    """Returns True if viewer can edit core config."""
    pw_path = config.PASSWORDS_PATH
    if not pw_path.exists():
        return True  # 全公開モード: 誰でも admin
    with pw_path.open() as f:
        entries = json.load(f)
    all_groups = {g for e in entries for g in e.get("groups", [])}
    accessible = set(get_accessible_drives(request))  # 既存 helper
    drives = config.load_drives()
    accessible_groups = {d["group"] for d in drives if d["name"] in accessible}
    return accessible_groups >= all_groups  # 全 group を持つ viewer
```

新しい認証層は作らない（既存 `hv_token` JWT を再利用）。`O5LkyjawfxUMBcPRpuocj`（自前認証を増やすな原則）と整合。

## 編集対象ファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `drives.json` | read/write | コア。drive の追加・削除・rename・path 変更 |
| `passwords.json` | read/write | アクセス制御。`[{password, groups: []}]` 形式を維持 |
| `drives.json.addons` | read/write | 既存スキーマ（`67Kx9eILRJkRVUG3Ii3QO`）。drive ごとに `{addon_name: bool | {feature: bool}}` |
| `.env` | **対象外** | first-run wizard の最後に「`LLM_API_KEY` を埋めて `docker compose up -d --build`」と案内表示のみ |

## first-run wizard

### トリガー

- `data/setup_completed` sentinel ファイルが**ない**とき、frontend は `/setup` にリダイレクト
- backend startup 時の自動 migration: `drives.json` が既に存在するのに sentinel が無い場合は sentinel を touch（既存ユーザーが GUI 導入後にウィザードに飛ばされるのを防ぐ）

### ステップ

1. **言語選択**: 既存 i18n に合わせて ja/en
2. **ドライブ追加（最低 1 件）**: name / path / group を入力。検証 5（`os.path.isdir`）を即時実行
3. **アクセス制御モード**: 「全公開」or「パスワード保護」を選ぶ
4. **マスターパスワード作成**（パスワード保護を選んだ場合のみ）: ステップ 2 で入力した group を全部含むエントリを作成。これがマスター = admin になる
5. **アドオン policy**: 既存 manifest からアドオン一覧を取得して、ドライブごとに ON/OFF 切替（任意）
6. **完了**: `data/setup_completed` を touch、`/admin` へ遷移、再起動バナー表示

### スキップ動線

- ドライブ 1 件登録だけで完了可能（パスワード・アドオン policy はあとで設定可能）
- 全公開モードを選んだ場合、`passwords.json` は作成しない（既存挙動: 未配置 = 全公開）

## admin 設定画面

### Layout

既存 `/admin`（ヘルスチェック、`p7DUz3WHxD6xt3fw9OJWx`）にタブを追加:

- `/admin`（既存ヘルスチェック）
- `/admin/settings`（新規）
  - Drives セクション
  - Passwords セクション
  - Addon Policy セクション

### `/admin/settings` の中身

3 セクションそれぞれ「現在値表示 + 編集モーダル」。passwords.json の現在値は password を `***` で masked 表示し、編集モーダルでは新しい値を入力させる（既存値の確認はできない）。

### 再起動バナー

`/admin` の全ページ共通レイアウトに常設バナー:

- `data/restart_pending` flag があるとき表示
- 内容: 「保留中の変更があります: drives.json (3 件), passwords.json (1 件)。反映には再起動が必要です」
- アクション: `docker compose restart backend` のコピーボタン
- backend startup 最初で flag を削除 → 次回 GUI ロードで自動的に消える

## Backend エンドポイント

すべて `/api/admin/config/*`、`is_admin_viewer` で gate。新規 router `backend/app/routers/admin_config.py` に集約。

| Method | Path | 用途 |
|---|---|---|
| GET | `/drives` | drives.json 全体を返す |
| PUT | `/drives` | drives.json を atomic 書き換え |
| GET | `/passwords` | passwords を masked 形式で返す |
| PUT | `/passwords` | passwords.json を atomic 書き換え |
| GET | `/addon-policy` | drives.json.addons を返す |
| PUT | `/addon-policy` | drives.json.addons を atomic 書き換え |
| GET | `/restart-status` | `{ pending: bool, files: [{name, count}] }` |
| POST | `/complete-setup` | sentinel を touch（wizard 専用、未完了時のみ呼べる） |
| GET | `/setup-status` | `{ completed: bool }`（リダイレクト判定用、認証不要） |

## ファイル書き込み

### atomic write パターン

`backend-conventions.md` 既定の `*.tmp` → `os.replace()`:

```python
def atomic_write_json(path: Path, data: dict | list) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    bak = path.with_suffix(path.suffix + ".bak")
    if path.exists():
        shutil.copy2(path, bak)  # .bak 1 世代
    with tmp.open("w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)
    Path(config.RESTART_PENDING_FLAG).touch()
```

### 整合性検証（Y: 厳しめ全部 error）

| # | 項目 | 失敗時 |
|---|---|---|
| 1 | JSON syntax | 422 `{code: "json_syntax", field, message}` |
| 2 | drive `name`, `path` 必須 | 422 `{code: "missing_field", field}` |
| 3 | drive `name` の一意性 | 422 `{code: "duplicate_name"}` |
| 4 | `path` が絶対パス | 422 `{code: "not_absolute_path"}` |
| 5 | `os.path.isdir(path)` | 422 `{code: "path_not_found", message: "コンテナ内で見つかりません。docker-compose.yml の volumes を確認してください"}` |
| 6 | passwords.groups[] が drives.group に存在 | 422 `{code: "unknown_group"}` |
| 7 | passwords パスワードの重複なし | 422 `{code: "duplicate_password"}` |
| 8 | addon-policy の addon 名が実在 manifest と一致 | 422 `{code: "unknown_addon"}` |

GUI は inline error で表示。

## Frontend ルート

```
src/app/
  setup/
    page.tsx           # first-run wizard (Client Component)
    SetupWizard.tsx
    steps/
      LanguageStep.tsx
      DriveStep.tsx
      AccessModeStep.tsx
      PasswordStep.tsx
      AddonPolicyStep.tsx
      CompleteStep.tsx
  admin/
    layout.tsx         # 共通: RestartBanner、AdminTabs
    page.tsx           # 既存ヘルスチェック
    settings/
      page.tsx         # 設定編集
      DrivesSection.tsx
      PasswordsSection.tsx
      AddonPolicySection.tsx
```

### sentinel チェック

`src/app/layout.tsx` で `/api/admin/config/setup-status` を fetch、`completed === false` かつ pathname が `/setup` 以外なら redirect。

`/admin` 配下では `is_admin_viewer` 判定の API（例: `GET /api/admin/config/setup-status` のレスポンスに含める）が `false` なら 403 表示 → ホーム画面に戻すリンクを表示。

## 実装フェーズ

| Phase | 内容 | 完了条件 |
|---|---|---|
| 1 | backend: `is_admin_viewer` helper + admin_config router + atomic_write + 検証 | unit test 全パス |
| 2 | backend: sentinel migration (startup hook) + restart_pending flag (clear on startup) | integration test |
| 3 | frontend: `/admin/settings` 画面（3 セクション）+ RestartBanner | E2E: 編集→pending 表示→backend restart→消える |
| 4 | frontend: `/setup` wizard | E2E: clean state → wizard → /admin |
| 5 | docs 更新: README に「初回起動でブラウザを開いてください」、ADDON-DEVELOPMENT.md に admin gate の記載 | doc レビュー |

各 phase で test → 実装 → review → commit。Phase 横断のまとめレビューはしない（feedback memory `feedback_phase_review_workflow.md` 参照）。

## 互換性 / マイグレーション

- 既存ユーザー: backend startup 時に「`drives.json` 存在 + sentinel 無し」を検出して sentinel 自動作成。ウィザードに飛ばされない
- `drives.json.addons` が無い既存環境: GUI で表示時は空オブジェクト扱い。保存時に新規作成
- `passwords.json` 未設定環境: GUI 上で「全公開モードです」表示 + 「パスワード保護を有効化」ボタン。既存挙動は維持

## Open Questions（実装中に詰める）

- アドオン manifest 一覧 API（`GET /api/addons/status` で取れる？それとも新規追加？）
- マスター viewer 不在で全公開モードでもないエッジケース（passwords.json はあるが全 group を持つパスワードがない）の扱い → admin に誰も入れない状態。GUI 上で警告表示 + 修復方法を案内。実装時に詰める

## 関連スキル / 後続作業

- 完成後、README の「セットアップ」セクションを GUI 前提に書き直す（Technical Writer に依頼）
- アドオンの symlink 管理の GUI 化はフォローアップ。本 spec の対象外
