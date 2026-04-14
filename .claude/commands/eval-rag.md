---
description: intelligence Ask (RAG) ハーネスを実行して最新レポートと自動比較
---

# /eval-rag

`addons/intelligence/evals/` のハーネスを実行し、`evals/reports/` の最新 sidecar
JSON をベースラインに自動比較して結果を要約する。コード変更後の回帰検知が主用途。

引数:
- ラベル（任意）: レポートの見出しに付ける文字列。省略時は `git rev-parse --short HEAD` + dirty フラグから生成
- `--runs N`（任意）: Stage 3 試行回数。省略時は 3。LLM ノイズが疑わしい時は 5 に上げる
- `--filter <substr>`（任意）: 特定 case だけ実行（デバッグ用）

## 実行手順

### 1. 前提確認

```bash
docker compose ps intelligence backend  # 両方 running か
ls addons/intelligence/evals/test-drive/snapshot/search.db  # 存在するか
```

snapshot 不在なら「snapshot を先に取得してください（README §7）」と返して停止。

### 2. コード取り込み（必須）

intelligence コンテナのコードはイメージに焼き込まれているので、`app/` 配下の変更は
リビルドしないと反映されない。必ず実行:

```bash
docker compose up -d --build intelligence
```

ビルドキャッシュが効くので変更なしなら 10 秒程度。完了後 `python -c "import app.main"` で
import 健全性チェック（任意）。

### 3. 最新ベースライン特定

```bash
ls -t addons/intelligence/evals/reports/*.json | head -1
```

なければ `--baseline` なしで実行。後続セッションのために初回 baseline が作られる。

### 4. ラベル決定

引数が無ければ:

```bash
git rev-parse --short HEAD                              # ベース hash
git status --porcelain | head -1 && echo "+dirty"       # 未コミット変更があれば
```

例: `"a1b2c3d+dirty"` または `"a1b2c3d"`。

### 5. ハーネス実行

```bash
docker compose exec intelligence python -m app.evals \
  --cases /eval-data/cases/ \
  --snapshot /eval-data/test-drive/snapshot/search.db \
  --output /eval-data/reports/<label>.md \
  --baseline /eval-data/reports/<latest_baseline>.json \
  --runs <N> \
  --label "<label>"
```

実行時間目安: 11 case × 3 runs ≈ 6-7 分。バックグラウンド実行（`run_in_background: true`）
+ `ScheduleWakeup` で 420 秒後に確認するのが安全。

### 6. 結果解釈

レポートの 3 セクションを読む:

#### A. `## Aggregate`
8 つの median + 1 つの sum を baseline と並べる。表形式で:

| 指標 | baseline | new | 判定 |
|---|---|---|---|
| Stage 1 must_include_coverage | ... | ... | ✓/—/⚠ |
| Stage 1 must_exclude_violations (sum) | ... | ... | ✓/—/⚠ |
| Stage 2 file recall@5 | ... | ... | ✓/—/⚠ |
| Stage 2 segment recall@5 | ... | ... | ✓/—/⚠ |
| Stage 2 MRR | ... | ... | ✓/—/⚠ |
| Stage 3 must_mention | ... | ... | ✓/—/⚠ |
| Stage 3 citation_in_ground_truth | ... | ... | ✓/—/⚠ |
| Stage 3 citation_segment_match | ... | ... | ✓/—/⚠ |
| Stage 3 citation_in_retrieved | ... | ... | ✓/—/⚠ |

判定:
- ✓ 改善（new > baseline）
- — 同値（差 = 0）
- ⚠ 回帰（new < baseline、ただし差 ≤ 0.1 は noise の可能性と注記）

#### B. `## Pair comparison vs ...`
metric ごとの improved/regressed/tied 件数。`regressed > 0` の指標があれば次へ。

#### C. `## Per-case summary` + Failures セクション
回帰した metric について、どの case が原因か特定:

```python
# json sidecar から per-case 値を抽出
import json
new = json.load(open('reports/<new>.json'))
old = json.load(open('reports/<baseline>.json'))
for cid in ...:
    # diff per case
```

各回帰 case について 1 行説明（top_file_ids 順序差 / LLM 出力差 / GT mismatch のどれか）。

### 7. 報告フォーマット

最終アウトプットは以下の形に整形して返す:

```markdown
## /eval-rag 結果: <label>

- 比較対象: `evals/reports/<baseline>.json`
- 新規レポート: `evals/reports/<label>.md`
- 実行時間: <took_ms>

### Aggregate
[上記 A の表]

### 回帰
- 無し ✓
  または:
- case_XXX (Stage X metric_name): baseline → new — 推定原因 1 行

### 改善
- case_XXX (Stage X metric_name): baseline → new

### 注記
- LLM ノイズ可能性: ...
- 既知の制限抵触: ...（短尺データ起因など）
```

## 既知の制限（回帰判定から除外する）

以下は code/data の改善ループでは触れない領域なので、回帰扱いしない:

- **case 001/002 seg-recall=0**: 短尺動画 (kyoto_autumn.mp4 等) が 1 chunk にまとまる。
  README §9「短い動画の segment_recall」既知制限。
- **case 005 file_recall=0.5**: dual-query semantic_query 側に clean 化が無い
  (architectural 課題)。FTS 側は server-side blocklist filter で対処済み。
- **case 010 seg_match=0.5**: LLM が file 内の複数箇所を正当に cite しているが
  GT が 1 segment_hint しか持てない仕様。case 設計の表現限界。

これらが「Before からの回帰」として現れた場合のみ ⚠ 報告。維持されているなら無視。

## LLM 非決定性の扱い

- gemma4:e2b は temperature=0 で完全 deterministic（N=3 と N=5 で同値が確認済み）
- 別モデル切替時はまず `--runs 5` で同値性を確認、揺れがあれば中央値で判定
- 単一 case の `--runs 3` で max-min > 0.1 なら "unstable" タグが立つ → noise 扱い

## 追加 case の作り方

新しい failure mode を見つけたら `evals/cases/NNN_*.yml` を追加:

```yaml
id: NNN_<short_name>
query: "..."
expected_keywords:
  must_include: ["..."]
  must_exclude: ["..."]   # 個別の除外語のみ。global blocklist と重複は書かない
ground_truth_files:
  - path: "..."           # eval-drive からの相対パス
    segment_hint:
      time_range: [s, e]  # 動画/音声
      page: N             # 文書
must_mention: ["..."]      # LLM の answer 本文に必ず含まれてほしい語
notes: |
  なぜこの case を作ったか、再現したい hako があれば ID
```

snapshot 再生成は新素材を `raw/` に追加した時のみ必要（既存素材で
case を増やすだけなら不要）。

## 関連

- ハーネス本体: `addons/intelligence/evals/README.md`
- 設計 spec: `docs/superpowers/specs/2026-04-14-intelligence-ask-eval-harness.md`
- 既知の制限: `addons/intelligence/evals/README.md` §9
