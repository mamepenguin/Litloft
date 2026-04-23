# Litloft Takeaways — Open Notebook 深掘り総合レポート

**対象**: Open Notebook（OSS NotebookLM クローン）3 領域深掘り結果の統合
**読者**: Litloft / intelligence / knowledge addon に関与する開発者
**前提ドキュメント**:
- [01. データモデル](./01-data-model.md) 952 行
- [02. Transformations](./02-transformations.md) 741 行
- [03. Citation 機構](./03-citations.md) 862 行

本レポートは 3 本のサブレポートから **Litloft に実際に効く知見だけ** を抽出・統合したものです。優先度・コスト・アドオン境界との整合性を判断軸に置いています。

---

## 0. エグゼクティブサマリ

Open Notebook は **「Notebook（研究プロジェクト）＝素材と生成物の閉じた箱」** という概念と、**3 つの対話モード（Chat / Ask / Transformations）** の明確な役割分担で、NotebookLM 相当のワークフローをシンプルに構築している。Litloft は FS / 視聴体験が中心なので、Open Notebook をそのまま真似ることはできない。が、次の 4 つの発想は Litloft の intelligence / knowledge 戦略にほぼ無修正で効く。

1. **3 モード哲学**（Ask は既存、Chat は未着手、Transformations は分散的に存在）の明示化
2. **Per-source Context Management**（Full / Summary / Excluded の 3 段階）を Litloft の Ask / 将来 Chat に導入
3. **SourceInsight に相当する中間レイヤの格上げ**（`FileInsight` テーブルで世代管理と Note 昇格を統一）
4. **Citation runtime validation**（Litloft は既にこれに勝っているが、逆に Open Notebook から学ぶのは「Streaming で strategy / answers / final を段階 emit」する UX）

---

## 1. 3 モード哲学の Litloft への写像

### 1.1 Open Notebook の設計

| モード | Context 決定 | 会話性 | 出力 | 典型ユースケース |
|---|---|---|---|---|
| **Chat** | ユーザが手動で source + context_level を選ぶ | 連続対話 | 自由会話 | 「この 2 本の論文を比較したい」 |
| **Ask** | システムが全 source から RAG | 一発質問 | 統合回答＋引用 | 「これら全部を横断した結論は？」 |
| **Transformations** | テンプレ × 単一 source | なし | Insight / Note | 「全論文から同じ形式で要約」 |

### 1.2 Litloft の現状

- **Ask**: intelligence addon に存在（spec: `docs/superpowers/specs/2026-04-10-intelligence-rag.md`）
- **Chat**: 未実装。ユーザが文脈を選んで AI と対話する窓口がない
- **Transformations**: 分散実装で概念として統一されていない
  - `auto_tags`（intelligence）
  - `summaries` / `detailed_summary`（intelligence / knowledge）
  - `transcript_refine`（intelligence）
  - BLIP caption / CLIP embedding（intelligence、insight というより preprocessor 扱い）

### 1.3 提案: Litloft の 3 モード

| モード | Litloft 名 | 状態 | アクション |
|---|---|---|---|
| Chat | **Project Chat** | 新規 | ResearchProject 導入と併せて設計（後述 §3） |
| Ask | **Ask** | 既存 | Streaming / structured citation を取り入れて改善（後述 §5） |
| Transformations | **Transformations** | 概念統合が必要 | intelligence addon 内に `Transformation` 概念を導入し、`auto_tags` / `summaries` / `transcript_refine` を統一（後述 §4） |

> 🪧 **hako 保存候補**: 「Litloft の AI 機能は Chat / Ask / Transformations の 3 モードで整理する」という設計軸。現状 addon 内で機能が分散している原因は、この軸が言語化されていないため。

---

## 2. Context Management の 3 段階制御

### 2.1 Open Notebook の肝

```
各 source を (full / summary / excluded) の 3 値でタグ付けし、LLM に渡す量を制御
  ├─ Full Content   — そのまま LLM に投入（高コスト・高精度）
  ├─ Summary Only   — SourceInsight から 1 つを「代表要約」として投入（省コスト）
  └─ Not in Context — LLM に渡さない（プライバシー / ノイズ回避）
```

### 2.2 Litloft における等価物

Litloft は既に **`FileActiveSummary`** を持っている。ただし Open Notebook と実装が違う:

- Open Notebook: `Note` テーブルに要約本文を持ち、ポインタで結ぶ
- Litloft: 要約は **FS 上の `.md` ファイル**（= 別の `File` レコード）として実在し、`FileActiveSummary.summary_file_id` がそれを指す（`backend/app/models.py:243`）

つまり Litloft は「要約も FS の一員」という FS 一次ソース哲学を `FileActiveSummary` のスキーマ設計に反映している。Open Notebook の「Summary Only モードで何を送るか」は、Litloft では `summary_file_id` の指す File の中身を読めばよい。

**欠けているもの**: ユーザが per-file / per-session に context_level を指定する UI / API と、それを RAG に反映する呼び出し層。

### 2.3 提案

1. `FileActiveSummary.summary_file_id` 経由で要約 File を読み込む「Summary モード実弾」ヘルパを用意する（関数名案: `resolve_summary_text(file_id) -> str | None`）
2. `File` モデルに `ai_context_level` フィールド（enum: `full` / `summary` / `excluded`）を **持たせない**。これはユーザの対話セッション単位の設定なので、セッション（または Ask の request body）で指定する方が適切
3. Open Notebook の「Not in Context」は Litloft では **`passwords.json` のドライブアクセス制御＋明示的除外フラグ** で既に可能。追加実装不要

> 🪧 **hako 保存候補**: 「Context management は per-file ではなく per-session のコントロール。`FileActiveSummary` は `summary_file_id` で **FS 上の要約ファイル** を指す（note_id ではない）— FS 一次ソース哲学の現れ」。

---

## 3. ResearchProject 導入の是非

### 3.1 Open Notebook の Notebook はなぜ存在するか

- **Isolation**: 複数の研究を混ぜない
- **Scope の明確化**: RAG が探す範囲を確定させる
- **Context 共有**: Notebook description が全 AI 対話の前提になる
- **Podcast / 派生物の束ね先**

### 3.2 Litloft で「ドライブ」とは違うのか

ドライブは **セキュリティ境界**。一方 Notebook は **関心境界**。粒度が違う。

- 1 ドライブには多数の「関心（テーマ）」が並存しうる（例: `archive` ドライブ内に複数の調査対象）
- 現在 Litloft は「ドライブ内でタグ / プレイリストで絞る」ことは可能だが、「関心単位で Note / 要約 / Chat を持つ」場はない

### 3.3 提案: 軽量 ResearchProject

データモデルレポート（01）で Phase 1 / 2 / 3 の具体テーブル設計が提示されている。要点:

```
research_projects       (ドライブ内スコープ、必ず 1 ドライブ所属)
project_memberships     (File ↔ ResearchProject の多対多)
project_notes           (ユーザノート + AI 生成ノート)
project_chat_sessions   (Chat モード。任意 Phase)
project_chat_messages
```

**重要な制約（hako `ドライブ = セキュリティ境界` と整合）**:
- ResearchProject は **必ず 1 ドライブ内**。ドライブ横断は禁止
- アクセス制御は Drive の延長で済む（Project 単体の権限機構は不要）
- 保護ドライブの ResearchProject は未ロック時のみ可視

### 3.4 優先度判定

- Phase 1（プロジェクト + メンバーシップ + ノート）は **Medium**
  - 価値: Knowledge addon が「ユーザの調査単位」を持てるようになり、detailed_summary → knowledge 昇格の着地点が明確になる
  - コスト: 3 テーブル + CRUD + UI。2〜3 週間規模
- Phase 2（Chat）は **Low（保留）**
  - 現在の Ask + プレイヤー操作の UX で当面足りる可能性が高い
  - Chat を入れる前に Transformations の統合で手応えを見るべき

> 🪧 **hako 保存候補**: 「ResearchProject（仮称）は Knowledge addon Phase 3 の自然な器になる。ドライブ内限定、保護ドライブの可視性は既存ルール継承」。

---

## 4. Transformations の統合が最優先の投資

### 4.1 現状 Litloft の内部矛盾

「AI 派生物」の置き場所が **機能ごとに違う**:

| 機能 | 保存先 | 粒度 | 世代管理 |
|---|---|---|---|
| `auto_tags` | `Tag` + file ↔ tag 関連 | tag 単位 | なし（Suggest/Approve 2 値） |
| `summaries` / `detailed_summary` | **FS 上の `.md`**（別 File） + `FileActiveSummary.summary_file_id` | file 1 本 | なし（上書き） |
| `transcript_refine` | `TranscriptChunk.text` 書換 + `text_original` | chunk 単位 | なし（元/修正後 2 値） |
| Whisper transcript | `TranscriptChunk`（intelligence 側 DB） | chunk 単位 | N/A |

→ 「AI 派生物」という共通レイヤが欠けており、**世代管理 / 連鎖 invalidation / Knowledge Phase 3 の着地点** が個別実装になる。

### 4.2 Open Notebook の SourceInsight モデル

```python
class SourceInsight(ObjectModel):
    source: RecordID          # 親ソース
    insight_type: str         # transformation の title（"Summary", "Key Concepts" 等）
    content: str              # LLM 出力
    embedding: vector         # 非同期で付与
```

- シンプル（insight_type + content + メタ）
- **Note への昇格** が保存後に可能（ユーザが確定したタイミングで Note 化）
- Jinja2 プロンプトで state（source / transformation / input_text）を埋める

### 4.3 提案: `FileInsight` の導入（最優先）

**役割の明確化**: `FileInsight` は **FS ファイルや既存テーブルを置き換えるのではなく、「履歴を残す層」として並行して追加する**。Litloft の FS 一次ソース哲学を壊さないことが設計上の最重要制約。

```python
class FileInsight(Base):
    __tablename__ = "file_insights"

    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    file_id: Mapped[str] = mapped_column(
        String(12), ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    # "summary" | "detailed_summary" | "auto_tags" | "key_questions" ...

    content: Mapped[str] = mapped_column(Text, nullable=False)
    # LLM 出力の生テキスト（Markdown / JSON）

    source_file_id: Mapped[str | None] = mapped_column(
        String(12), ForeignKey("files.id", ondelete="SET NULL"), nullable=True
    )
    # FS に書き出された場合の File ID（summaries 系のみ使う。auto_tags は null）

    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # {"model": "gpt-4o-mini", "prompt_version": 3, "tokens": 1234}

    status: Mapped[str] = mapped_column(String(16), default="draft")
    # "draft" | "active" | "superseded" | "invalidated"

    created_by: Mapped[str] = mapped_column(String(32), nullable=False)
    # "intelligence" | "knowledge" | "manual"

    created_at: Mapped[datetime] = mapped_column(DateTime, ...)
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_file_insights_file_kind", "file_id", "kind"),
        Index("idx_file_insights_status", "status"),
    )
```

**既存モデルとの関係図**:

```
File (video.mp4)
  ├─ FileInsight [kind=detailed_summary, status=superseded, v1]  ← 旧世代（履歴）
  ├─ FileInsight [kind=detailed_summary, status=active, v2]
  │    └─ source_file_id → File (video.md)  ← FS の実ファイル（既存と同じ）
  │                        ↑
  │     FileActiveSummary (file_id=video.mp4, summary_file_id=video.md)  ← 変更なし
  │
  └─ FileInsight [kind=auto_tags, status=active]
       └─ content = '["料理", "塩もみ"]'   ← FS 書き出し不要、DB 内完結
```

**重要**: `FileActiveSummary` の **スキーマは変えない**。`summary_file_id` で FS 上の `.md` を指し続ける。`FileInsight` は「その要約がどう生成されたか」の履歴層として並立する。

### 4.4 効果

1. **世代管理** — v2 要約が気に入らなければ v1 の `.md` を再生成可能
2. **連鎖 invalidation** — transcript 差替で依存 Insight を一括 `invalidated_at` set → 再生成キュー
3. **Knowledge Phase 3 の受け皿** — 「detailed_summary を knowledge に昇格」が `FileInsight(kind="detailed_summary", status="active")` を SELECT する形で実装できる（FS の `.md` を毎回パースする必要がない）
4. **監査性** — モデル / プロンプト版 / トークン数が全部追える
5. **アドオン境界の明確化** — intelligence は INSERT 側、knowledge は SELECT 側、と責務が切れる

### 4.5 段階移行プラン

- **Step 1**: テーブル追加 + バックフィル（`FileActiveSummary` 既存行から `status="active"` の FileInsight を生成。content は `.md` を読む）。読み込みパスは未変更
- **Step 2**: intelligence の summaries 生成処理で FS 書き出し + `FileActiveSummary` 更新に加えて **FileInsight INSERT** を足す（旧 active は `superseded` に）
- **Step 3**: auto_tags を `kind="auto_tags"` で移行
- **Step 4**: transcript_refine は chunk 粒度なので統合せず現行維持（無理に統一しない）

### 4.6 Open Notebook 流の 2 段階フロー

```
LLM 実行 → FileInsight 作成（draft） → ユーザ承認 → status=active + FileActiveSummary 更新
```

Litloft の現状 Auto Tags は **Suggest → Approve/Dismiss** が既にあるので、この哲学は実質採用済み。summaries / detailed_summary にも展開するのが次の一手。

### 4.7 優先度判定

- **High**: `FileInsight` 導入 + summaries バックフィル + 両書き（Step 1-2、約 1 週間）
- **High**: Jinja2 プロンプト化（Hard-coded → template、`addons/intelligence/prompts/*.jinja2`）
- **Medium**: auto_tags の移行（Step 3）
- **Medium**: Transformation テーブル導入（ユーザ定義 transformation まで踏み込むかは次フェーズ）
- **Medium**: 非同期コマンド化（surreal-commands 相当、長時間処理を background job に）

> 🪧 **hako 保存候補**: 「AI 派生物の履歴層として `FileInsight` を core に追加。`FileActiveSummary.summary_file_id`（FS ファイル参照）は温存し、置換しない。intelligence は INSERT 側、knowledge は SELECT 側、という責務分担に帰着する」。

---

## 5. Citation / Ask の改善余地

### 5.1 意外な発見: Litloft の方が厳密

Open Notebook の citation 検証は **prompt-level のみ**（"これらの id だけ使え" と指示するだけで、戻ってきた id を後検証しない）。Litloft の Ask は **5 stage pipeline（margin gate / range check / drop）** で runtime 検証している。

→ **Litloft の捏造対策は既に強い**。ここは逆に Open Notebook が学ぶべき側。

### 5.2 取り入れるべきもの

1. **SSE Streaming**（Ask の段階配信）
   - Open Notebook は `strategy → per-query answers → final_answer` を stage 通知
   - Litloft Ask は現状同期 1 発
   - UX 改善: 「考え中」の可視化、途中キャンセル、長時間質問への体感速度
   - 優先度: **Medium**
2. **Source Chat 相当（ファイル詳細ページでの単一ファイル Q&A）**
   - Litloft のファイル詳細には現状 AI 対話窓口がない
   - Source Chat は single-file scope で citation を `file_id` に強制するので捏造リスクが構造的に低い
   - 優先度: **Medium〜High**（podcast / 長尺動画の「この動画の中で〇〇って何分あたりで話してた？」が刺さる）
3. **Structured citation output（Frontend パース負担の削減）**
   - 現状 Litloft はレスポンス形態が内部的に構造化されているかコードで確認要
   - Open Notebook は `[type:id]` inline のみ → Frontend が regex parse する必要あり
   - どちらでも OK だが、Litloft は引用 UI を既に作り込んでいる（`docs/citation-ui-mockup.html`）ので現行維持で問題なし

### 5.3 注意: 取り入れるべきでないもの

- **Prompt-only citation validation** — Litloft の既存 runtime validation を薄めないこと
- **LangChain / LangGraph 全面採用** — Ask の graph 化は魅力的に見えるが、Litloft の "ステートレス、ワーカーなし、`POST /ask` 同期1発" の軽量哲学を壊す。Streaming だけ導入すれば実利は取れる

> 🪧 **hako 保存候補**: 「Open Notebook の citation 検証は prompt-level のみ。Litloft の 5-stage validation の方が堅い。ただし SSE streaming の UX はこちらが劣っており、取り入れる価値がある」。

---

## 6. 優先度ランキング（総合）

### 6.1 High（次の 1〜2 ヶ月で着手推奨）

| 提案 | 規模 | 理由 |
|---|---|---|
| **H1. `FileInsight` テーブル導入と summaries 移行** | 1 週間 | 現在のスキーマ分散を解消。Knowledge Phase 3 の受け皿になる |
| **H2. Jinja2 プロンプト化** | 3〜5 日 | ハードコードから分離。AB テスト / プロンプト改良サイクルが回せるようになる |
| **H3. Source Chat 相当（ファイル詳細 AI Q&A）** | 2 週間 | 長尺動画での体験価値が高い。citation scope が file_id に縛られて捏造に強い |
| **H4. 3 モード哲学のドキュメント化** | 1 日 | コードに手を入れなくても、`FEATURE-MAP.md` に Chat / Ask / Transformations 軸を追加するだけで意思決定が速くなる |

### 6.2 Medium（3〜6 ヶ月）

| 提案 | 規模 | 理由 |
|---|---|---|
| **M1. Ask の SSE Streaming 化** | 1 週間 | UX 改善。graph 化は不要、ノード間で yield するだけで十分 |
| **M2. ResearchProject（プロジェクト + ノート）Phase 1** | 2〜3 週間 | Knowledge addon の着地点。Chat はまだ入れない |
| **M3. 非同期コマンド基盤**（長時間 LLM ジョブを background queue へ） | 2 週間 | Transformations を全ファイル一括適用するときに必須 |
| **M4. Transformation テーブル化**（ユーザ定義 transformation の可能性） | 1 週間 | Knowledge addon の「カスタム要約テンプレ」機能として |

### 6.3 Low（保留 / 見送り）

| 提案 | 理由 |
|---|---|
| **L1. Project Chat（ResearchProject 上での連続対話）** | 現状 Ask + プレイヤー操作で足りる。Chat 履歴の DB 永続は別コスト。まず H3（Source Chat）で効果を見る |
| **L2. Podcast 生成の Open Notebook パイプライン移植** | Litloft に既に podcast addon が存在。Open Notebook 側の実装は LangChain 重量級で、軽量版を維持したい |
| **L3. SurrealDB への移行** | 魅力はあるが SQLite + 既存マイグレーション資産を捨てる価値はない。グラフ的参照は関係テーブル 2 つで実現済み |
| **L4. Prompt-only citation validation** | Litloft の runtime 検証の方が優秀。取り入れない |

---

## 7. アドオン境界を壊さない取り込み方

本体（core）・intelligence・knowledge の役割分担を守った配置:

| 提案 | 配置先 | 理由 |
|---|---|---|
| `FileInsight` テーブル | **core**（`backend/app/models.py`） | File のライフサイクル連動（削除 cascade、missing 連動）が本体の責務。intelligence だけで管理するとドライブ間整合が取れない |
| Transformations プロンプト | **intelligence addon** | モデル選択や prompt tuning は addon 責務 |
| `FileActiveSummary` 連動 | **core**（既存） | 既に core にある。変更不要 |
| ResearchProject | **core** または **knowledge addon** | ドライブ境界との整合を考えると core が素直。knowledge addon が UI を被せる |
| Project Chat / Source Chat | **intelligence addon** | LLM 呼び出し一式は intelligence が主管 |
| SSE Streaming | **intelligence addon**（Ask の内部変更） | core 変更不要 |
| Jinja2 prompt | **intelligence addon**（`addons/intelligence/prompts/`） | addon 内部完結 |

> 🪧 **hako 保存候補**: 「`FileInsight` は core、Transformations の定義と実行は intelligence addon に置く。これで core は『File のライフサイクルと派生物の入れ物』に徹し、intelligence は『派生物をどう作るか』に徹せる」。

---

## 8. 即座にできるアクション（コード非修正）

1. `docs/FEATURE-MAP.md` に「AI 機能 = Chat / Ask / Transformations の 3 モード」軸を追加
2. `docs/superpowers/specs/2026-04-18-detailed-summary-knowledge-promotion.md` に **FileInsight 提案** を追記（Step B の実装案として）
3. hako に「§1.3 / §2.3 / §3.4 / §4.7 / §5.3 / §7」の保存候補を書き込み
4. `docs/research/open-notebook/` を `docs/research/` index に掲載（将来他の OSS 調査を追加する受け皿に）

---

## 9. Open Notebook から得られなかったもの

公平のため書き残す:

- **視聴体験・プレイヤー連動**: Open Notebook はテキスト中心で、動画タイムコード引用や LoftRef のような Deep Link は未実装
- **FS との双方向同期**: Open Notebook は DB 中心で、FS に書き戻す発想はない。Litloft の「小サイズテキストファイルは ETag 付きでストリーミング（最近の commit `8143b5a`）」のような FS 一次ソース思想は固有
- **マルチドライブ / パスワード保護**: セキュリティ境界の概念が薄い（単一テナント前提）
- **スキャナーの missing/recovered ライフサイクル**: Litloft の「NAS 断で消えても DB は残す」という運用現実への対応は固有
- **アドオンの scope / policy 分離**: Litloft の intelligence drive scope（drives.json policy 層）は Open Notebook にない独自の発明

→ **これらは真似せず守るべき Litloft 固有の強み**。

---

## 10. 参照

- サブレポート 3 本: `01-data-model.md` / `02-transformations.md` / `03-citations.md`
- Open Notebook リポ（clone 済）: `/tmp/research/open-notebook/`
- Open Notebook 必読ドキュメント（公式設計哲学）:
  - `docs/2-CORE-CONCEPTS/notebooks-sources-notes.md`
  - `docs/2-CORE-CONCEPTS/chat-vs-transformations.md`
  - `docs/2-CORE-CONCEPTS/ai-context-rag.md`
- Litloft 関連 spec:
  - `docs/superpowers/specs/2026-04-10-intelligence-rag.md`（Ask）
  - `docs/superpowers/specs/2026-04-15-intelligence-transcript-refine.md`
  - `docs/superpowers/specs/2026-04-18-detailed-summary-knowledge-promotion.md`
- 本体ルール:
  - `.claude/rules/design-decisions.md`（File / FileRelation / FileActiveSummary 設計）

<!-- synthesis-complete -->
