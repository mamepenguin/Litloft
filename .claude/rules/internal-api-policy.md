# Internal API ポリシー

`backend/app/routers/internal.py` に endpoint を追加・削除・変更するときに必ず守るルール。新規追加時はこのルールを通過させる。判定が割れたら hako の関連 entry を引いて再評価する。

## 目的

コアがアドオンに公開する API の膨張を防ぐ。アドオンに新機能を追加するたびに Internal API が増える状況は、コアとアドオンの開発を実質的に依存関係にする。R1〜R5 を満たす API のみを公開し、満たさないものはアドオン側に閉じる。

## R1: First-class core entity ルール

Internal API はコア自身が管理・描画するエンティティに対する操作だけを公開する。

コアが管理するエンティティ:

- drive / file / tag / comment / playlist / watch history / profile
- ファイルライフサイクル (active / missing / trash)
- ファイルメタデータ (mime, size, folder_path 等の物理事実)

**コア UI に登場しない概念は Internal API の対象外**。アドオン側ドメインに閉じる。

## R2: Generic shape ルール

API surface (パス・パラメータ・レスポンス形状) が特定アドオン名 / 機能名を含まない。

- ✅ `kind: str` を opaque に受ける (例: `file_relations.kind`)
- ❌ `kind=not_viewed` のように特定アドオンのワークフロー名を直接出す
- `drives.json.addons` の「本体は addon 名 / feature 名を解釈しない汎用辞書」と同じ精神

## R3: Multi-addon viability テスト

**「このエンドポイントを使う 2 個目のアドオンが具体的に思いつくか？」を自問する。**

- 思いつく → コア適格 (汎用基盤)
- 思いつかない → 1 アドオン専用の漏出。アドオン側 DB に持つべき
- 「思いつかないけど概念的に generic」は赤信号。具体例がない汎用化は理論武装でしかない

## R4: Write asymmetry ルール

読み取りはアドオンに広く開く。書き込みは「コア自身の UI / 検索 / アクセス制御がそのデータを使うか」をテストする。

- ✅ `tag` write: コア検索・フィルタ UI が tag を読む → write 公開正当
- ✅ `WatchHistory` progress: コアの continue-watching UI が読む → write 公開正当
- ❌ アドオンが書いてアドオンしか読まない → core write を作らずアドオン側 DB に書く

## R5: Promotion target ルール

アドオンが「候補・推測・suggestion」を出し、ユーザー操作で昇格させるとき、昇格先は次のいずれか。

- **コア UI に登場するエンティティ** → core で受ける (例: `auto_tags` Approve → `File.tags`、`suggested_relations` → `file_relations`)
- **特定アドオンのドメイン概念** → そのアドオンに昇格させる (例: AI 要約 → knowledge note)
- **どちらでもない** → 候補のままアドオン側 DB に留める。core write を作らない

## 既存 13 endpoint の判定（2026-04-30 監査）

| # | Endpoint | 判定 | 備考 |
|---|---|---|---|
| 1 | `GET /accessible-drives` | KEEP | drive 列挙、universal |
| 2 | `GET /drive-policy` | KEEP | drives.json policy lookup |
| 3 | `GET /files/{id}` | KEEP | file metadata |
| 4 | `GET /files/{id}/content` | KEEP | text mime allowlist + secret + size cap |
| 5 | `POST /files/{id}/tags` | KEEP | tag は core 検索が読む |
| 6 | `GET /viewer-history` | KEEP（要監視） | `kind=viewed/not_viewed` は概念上 generic だが用途が intelligence 寄り。次の用途が出るまで境界事例 |
| 7 | `POST /filter-file-ids` | KEEP | access control filter |
| 8 | `POST /files/bulk-state` | KEEP | lifecycle bulk read |
| 9 | `/file_relations` (POST/GET/DELETE) | KEEP | コア UI で表示する commitment 前提。撤回時は再評価 |
| 10 | ~~`/file_active_summary` (POST/GET/DELETE)~~ | REMOVED → knowledge へ移送済み | 2026-04-30 完了。spec `2026-04-30-file-active-summary-to-knowledge.md` |
| 11 | `POST /addon-events` | KEEP | WS bridge、universal |

## 新規 endpoint 追加判定フロー

新しい Internal API endpoint を追加したくなったら、次の順序で確認する。

1. **R1 First-class core entity**: そのエンティティはコアが管理しているか。コア UI に登場するか
2. **R3 Multi-addon viability**: 別のアドオンも具体的に使う場面が思いつくか
3. **R2 Generic shape**: パス・パラメータ・レスポンスにアドオン名や機能名が混入していないか
4. **R4 Write asymmetry** (write の場合): コア UI / 検索 / access control がそのデータを読むか
5. **R5 Promotion target** (アドオン由来データの場合): 昇格先がコアエンティティか

**全部 YES** → 追加してよい。spec ドキュメント / hako に判定根拠を残す。
**1 つでも NO** → アドオン側 DB に閉じる。アドオン同士の通信は addon-to-addon proxy 経由で行う。

## 関連

- 契約テストパターン (新規 endpoint 追加時必須): hako `VHE7K0KWjIzV3M1CyfDAN` (wire shape + validator parity の 2 層)
- write endpoint の secret gating: hako `6sC7Td2hvp_0IpEF1t4tb` (read より厳しい threat model)
- 本判定基準の確立: hako `749bxgygHt3YyvvFlFeQA`
- `file_active_summary` 移送決定: hako `G_9Og26IADKqz74fnIicu`
- 完全分離 (Phase 2) は今やらない方針: hako `UIST7-3m8VovTAZ0ioarn`
