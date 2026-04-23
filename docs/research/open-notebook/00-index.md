# Open Notebook 深掘りレポート

**対象リポジトリ**: https://github.com/lfnovo/open-notebook
**調査日**: 2026-04-22
**調査範囲**: データモデル / Transformations / Citation 機構
**目的**: Litloft（特に intelligence / knowledge addon）の参考にするため、設計判断と実装パターンを抽出する

## 前提: Litloft と Open Notebook の相対位置

| 項目 | Litloft | Open Notebook |
|---|---|---|
| 基本単位 | ドライブ（FS 境界） | Notebook（研究単位） |
| 重心 | 視聴体験 + FS 管理 | ノート + チャット |
| 素材 | FS 上の実ファイル | 取り込み済み source |
| DB | SQLite | SurrealDB |
| stack | FastAPI + Next.js | FastAPI + Next.js |
| LLM | OpenAI 互換（intelligence addon） | LangChain (18+ providers) |
| 特徴機能 | Whisper / CLIP / BLIP / RAG Ask | Transformations / Podcasts / 複数 chat |

## レポート一覧

- [01. データモデル](./01-data-model.md) — notebook / source / note / chat
- [02. Transformations](./02-transformations.md) — 派生コンテンツ生成機構
- [03. Citation](./03-citations.md) — 出典生成と捏造対策
- [99. Takeaways](./99-takeaways.md) — Litloft への適用提案（優先度付き）

## 調査進捗

- [x] リポジトリ clone、全体構造把握
- [x] 01. データモデル（952 行）
- [x] 02. Transformations（741 行）
- [x] 03. Citation（862 行）
- [x] 99. 総合 Takeaways

## 読み順の推奨

1. **忙しい人**: [99. Takeaways](./99-takeaways.md) だけ読めば優先度と判断が揃う
2. **設計判断に関わる人**: 99 → 01 → 02 → 03 の順。01 のデータモデルが一番射程が広い
3. **Ask / citation を触る人**: 99 §5 → 03 の順
4. **Knowledge addon Phase 3 を進める人**: 99 §4 → 02 → 99 §3 の順

## Open Notebook リポジトリ構造（クイックリファレンス）

```
open-notebook/
  api/                  # FastAPI routers
    routers/            # ask, chat, source_chat, source, note, transformation, ...
  open_notebook/
    domain/             # ドメインモデル
      base.py           # 共通基底（ObjectModel, RecordModel 等）
      notebook.py       # Notebook + Source + Note 統合
      transformation.py # Transformation 定義
      credential.py     # API credential
      provider_config.py
    ai/                 # LLM 抽象化
      models.py         # provider 抽象
      credentials.py    # API key 管理
      connection_tester.py
      model_discovery.py
    graphs/             # LangGraph グラフ（チャット/ask 等）
      ask.py
      chat.py
      source_chat.py
      source.py         # source ingestion graph
      transformation.py
      tools.py
    podcasts/           # ポッドキャスト生成
    database/           # SurrealDB 抽象
  prompts/              # Jinja テンプレート
    ask/
    chat/
    source_chat/
    podcast/
  docs/2-CORE-CONCEPTS/ # 公式設計解説（必読）
    notebooks-sources-notes.md
    chat-vs-transformations.md
    ai-context-rag.md
    podcasts-explained.md
  frontend/             # Next.js UI
```

**必読ドキュメント**: `docs/2-CORE-CONCEPTS/` は設計哲学の一次資料。実装コードを読む前に目を通す価値が高い。
