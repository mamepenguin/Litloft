# Open Notebook Citation 機構調査

**調査実施**: 2026-04-22  
**対象コミット**: open-notebook リポジトリ main  
**重点**: Ask / Chat / Source Chat での citation 生成・検証・表示メカニズム  

## 1. 3種類の対話モード（Ask / Chat / Source Chat）

Open Notebook は 3 つの異なる対話モードを提供し、それぞれ異なる retrieval 戦略と citation 機構を採用している。

### 1.1 Ask（RAG 質問応答モード）

**目的**: ユーザーが複雑な質問を投げると、システムが自動的に全ソースから検索し、関連チャンクを取得して synthesis する。

**フロー** (`open_notebook/graphs/ask.py`):
```
User Question
    ↓
[Agent Node] Strategy 生成 (複数の search term を分析)
    ↓
[Parallel provide_answer Nodes] 各 search term に対して vector_search を実行
    ↓
[write_final_answer Node] すべての答えを統合して最終回答生成
    ↓
Final Answer with [citations]
```

**特徴**:
- **Non-conversational**: 1つの質問 → 1つの回答で終了
- **Automatic retrieval**: ユーザーは retrieval の詳細を指定しない
- **Multi-stage**: strategy 生成 → parallel search → synthesis の 3 段階

### 1.2 Chat（手動コンテキスト選択モード）

**目的**: ユーザーが明示的に選択したソースに対して、対話型で質問を続ける。

**特徴**:
- **Conversational**: 複数のターンで履歴を保持（LanngraphのSqliteSaver で状態保存）
- **Manual context control**: ユーザーが source / note を選んで context レベルを設定
  - "full content" (全文送信)
  - "summary only" (AI 要約を送信)
  - "not in" (除外)
- **Single node flow**: システムプロンプト + selected context + message history → LLM call

### 1.3 Source Chat（単一ソース深掘りモード）

**目的**: 1 つのソースに特化した詳細な対話。ソースの insights も活用。

**フロー** (`open_notebook/graphs/source_chat.py`):
```
User Question about [source_id]
    ↓
[ContextBuilder] source_id に対して full_text + insights を取得
    ↓
_format_source_context() で Markdown 整形
    ↓
System Prompt + Source Content + Insights + Message History → LLM
    ↓
Response with [source_id] / [insight:id] citations
```

**特徴**:
- **Scope-limited**: 1 source + その insights のみが context
- **Conversational**: Chat 同様に履歴保持
- **Context indicators** を返す: どの source / insight が使われたかを追跡
- ContextBuilder が `include_insights=True, max_tokens=50000` で実行される

---

## 2. Retrieval 層

### 2.1 Full-text vs Vector

Open Notebook は 2 種類の検索を実装している（`open_notebook/domain/notebook.py:630-680`）:

**Text Search** (`text_search()`):
- BM25 ランキングを使用
- Database function `fn::text_search($keyword, $results, $source, $note)` に委譲
- キーワードマッチングが強い場合に有効

**Vector Search** (`vector_search()`):
- クエリを embedding に変換（`generate_embedding(keyword)`）
- Database function `fn::vector_search($embed, $results, $source, $note, $minimum_score)` に委譲
- semantic similarity で検索
- **minimum_score threshold**: デフォルト 0.2（設定可能）

### 2.2 Ask における検索戦略

Ask の `provide_answer()` ノード（`open_notebook/graphs/ask.py:98-124`）では:

```python
async def provide_answer(state: SubGraphState, config: RunnableConfig) -> dict:
    # state["term"] は Strategy の search term
    # state["instructions"] は "extract X from results" の指示
    results = await vector_search(state["term"], 10, True, True)
    # 常に vector_search を使用（commented out text_search）
    payload["results"] = results
    ids = [r["id"] for r in results]  # ← 重要: 検索結果の id リストを保存
    payload["ids"] = ids
```

**検索結果の構造**: 各 `results[i]` は以下を含むと推測される:
- `id`: `"source:xxxxx"`, `"note:xxxxx"`, `"insight:xxxxx"` 形式
- `content` / `text`: チャンク本文
- `score`: relevance score
- その他メタデータ

### 2.3 Chunk 粒度と前後コンテキスト

**SourceEmbedding テーブル**:
```python
class SourceEmbedding(ObjectModel):
    table_name: ClassVar[str] = "source_embedding"
    content: str
    # source_embedding.source → Source への逆参照
```

- Source の `vectorize()` メソッドが `embed_source` コマンドを非同期ジョブとして投入
- 各 embedding は **content** フィールドに chunk text を保有
- chunk 粒度は implementation 詳細（おそらく ~500 words）

**前後コンテキスト抽出**: 
- Ask フローでは検索結果の id のみを記録し、full text は取得しない
- Chat / Source Chat は context builder が source.full_text を直接取得（truncate with 5000 char limit）

---

## 3. Context Assembly

### 3.1 Ask における Context 構築

**prompt/ask/query_process.jinja**:
```jinja
# RESULTS
{{results}}

# IDs PROVIDED IN THIS QUERY
You have been given the following content ids to work from: {{ids}}
So, if you are citing some document, it should be one of these.
```

検索結果の全体（text + metadata）が template に渡される。LLM は:
1. 検索結果から引用文を選択
2. 対応する `id` を `[id]` 形式で引用に添付

### 3.2 Chat における Context 構築

(`open_notebook/graphs/chat.py:30-86`):

```python
system_prompt = Prompter(prompt_template="chat/system").render(data=state)
payload = [SystemMessage(content=system_prompt)] + state.get("messages", [])
```

**context は**:
- `state["context"]` に既に文字列として含まれている（ユーザーが context selector で構成）
- Source / Note の full_text が混在
- System message に埋め込まれる

### 3.3 Source Chat における Context 構築

(`open_notebook/graphs/source_chat.py:62-130`):

```python
context_builder = ContextBuilder(
    source_id=source_id,
    include_insights=True,
    include_notes=False,
    max_tokens=50000,
)
context_data = await context_builder.build()

# context_data に sources / insights / metadata が返される
source = Source(**context_data["sources"][0])
insights = [SourceInsight(**i) for i in context_data["insights"]]

# _format_source_context() で Markdown に整形
formatted_context = _format_source_context(context_data)
```

**組み立て順**:
1. Source full_text (最初)
2. Each insight with type / content
3. Metadata (source_count, insight_count, total_tokens)

---

## 4. Prompt 設計（各モード）

### 4.1 Ask の 3 段階 Prompt

#### Stage 1: Strategy Generation (`prompt/ask/entry.jinja`)

```jinja
Based on the user question, you need to analyze the key concepts and terms 
to determine the appropriate search strategy.

Step 1: develop your search strategy (reasoning)
Step 2: formulate your search queries (searches)

Return both the reasoning and searches as a JSON object.

Format: {"reasoning": "...", "searches": [{"term": "...", "instructions": "..."}]}
```

**目的**: LLM に複数の search term を生成させ、それぞれに retrieval 指示を付与。

**制約**:
- `"searches"` は max 5 個
- `"instructions"` は "extract X from results" 形式

#### Stage 2: Query Processing (`prompt/ask/query_process.jinja`)

```jinja
# RESULTS
{{results}}

# CITING SOURCES
It's very important that your response contains references to the searched documents.
The way you do that is by adding the id of the specific document in brackets like this: [document_id].

## IMPORTANT
- Do not make up documents or document ids. Only use the ids you have access through the query.
- The ID is composed of the type and a random string, such as 
  "source:randomstring", "note:randomstring", or "insight:randomstring".
- Always use the complete ID exactly as it is provided, including its type prefix.
- Use document IDs exactly as they are returned from the search tool.

## IDs PROVIDED IN THIS QUERY
You have been given the following content ids to work from: {{ids}}
```

**関鍵フレーズ**:
- "Do not make up documents" → 捏造対策の第一線
- "complete ID exactly as provided" → prefix (source: / note: / insight:) の変更禁止
- `{{ids}}` に検索結果の id リストが明示的に渡される

#### Stage 3: Final Answer (`prompt/ask/final_answer.jinja`)

```jinja
# CITING SOURCES
It's very important that your response contains references to the searched documents.
The way you do that is by adding the id of the specific document in brackets like this: [document_id].

## IMPORTANT
- Do not make up documents or document ids. Only use the ids that you can see on the answers you received.
- Always use the complete ID exactly as it is provided, including its type prefix.
- Use document IDs exactly as they are returned in the answers.
```

**特徴**:
- 中間回答（各 search term の答え）から citation を再利用
- Stage 2 の LLM が既に citation を含んでいるため、それを synthesis する際に preservation

### 4.2 Chat の System Prompt (`prompt/chat/system.jinja`)

```jinja
# CITING INSTRUCTIONS
If your answer is based off of any item in the context, it's very important that 
your response contains references to the searched documents.
The way you do that is by adding the id of the specific document in brackets 
like this: [document_id].

## IMPORTANT
- Do not make up documents or document ids. Only use the ids you have access.
- The ID is composed of the type and a random string, such as 
  "source:randomstring", "note:randomstring", or "insight:randomstring".
- Always use the complete ID exactly as it is provided, including its type prefix.
- Do not assume or change the type prefix of any document ID.
- Use document IDs exactly as they are returned from the search tool.
```

**context の埋め込み**:
```jinja
{% if context %}
# CONTEXT
The user has selected this context to help you with your response:
{{context}}
{% endif %}
```

- Context は既に `state["context"]` として文字列化済み
- LLM は context に含まれるすべてのソースの id を参照可能

### 4.3 Source Chat の System Prompt (`prompt/source_chat/system.jinja`)

```jinja
# CITING INSTRUCTIONS
When referencing information from the source or its insights, 
always include citations using the document IDs.

## Citation Format
- For source content: [{{ source.id if source else "source:id" }}]
- For insights: [insight_id] (use the specific insight ID)

## IMPORTANT
- Do not make up document IDs or insight IDs. Only use the IDs that are 
  actually available in the context.
- Use complete IDs exactly as provided, including their type prefix (source:, insight:, etc.)
- Always reference specific content when citing
- Focus on the specific source — this chat is dedicated to this particular document
- Leverage insights to provide deeper analysis beyond just the raw content
```

**context_indicators の追跡**:
```python
context_indicators: dict[str, list[str]] = {
    "sources": [source.id],
    "insights": [insight.id for insight in insights],
    "notes": [],
}
```

---

## 5. Citation の構造と保存

### 5.1 Citation ID フォーマット

Open Notebook の citation id は **type-prefixed** 形式:

```
source:<uuid or id>     # Source から直接引用
note:<uuid or id>       # User note から引用
insight:<uuid or id>    # AI-generated source insight から引用
```

**prefix の意味**:
- 同じ id space でも type を明確に区別
- LLM が prefix を変更すると、invalid citation として drop される

### 5.2 Source / Note / Insight の ID 管理

各モデルは `ObjectModel` を継承:

```python
class ObjectModel(BaseModel):
    id: Optional[str] = None
    created: datetime = Field(default_factory=datetime.utcnow)
    updated: datetime = Field(default_factory=datetime.utcnow)
```

**ID 形式**: SurrealDB の RecordID 形式
- `"source:123abc"`
- `"note:456def"`
- `"source_insight:789ghi"`

### 5.3 Citation 情報の保存場所

**Ask フロー**:
1. `vector_search()` が結果の `id` リストを返す
2. `ask/query_process.jinja` で `{{ids}}` として LLM に明示
3. LLM が `[id]` 形式で引用を生成
4. `ask/final_answer.jinja` で synthesis 時に preservation

**保存**: Open Notebook は citation を **LLM レスポンスの一部として** 保存
- chat_session テーブルに messages が JSON で保存
- citation id は answer text に `[id]` 形式で embedded

### 5.4 Chat / Source Chat での Citation 追跡

(`open_notebook/graphs/source_chat.py:95-115`):

```python
context_indicators: dict[str, list[str]] = {
    "sources": [source.id],
    "insights": [insight.id for insight in insights],
    "notes": [],
}

# state に返される
return {
    "messages": cleaned_message,
    "source": source,
    "insights": insights,
    "context": formatted_context,
    "context_indicators": context_indicators,  # ← 使用ソースの追跡
}
```

LLM が生成した response の citation id を validate する際に、`context_indicators` で available id を確認できる。

---

## 6. 捏造対策

### 6.1 Ask における Hallucination 対策

**層 1: Explicit ID List**

```jinja
## IDs PROVIDED IN THIS QUERY
You have been given the following content ids to work from: {{ids}}
So, if you are citing some document, it should be one of these.
```

- `{{ids}}` に検索結果の id リストが明示的に記載される
- LLM にこのリスト外の id を使うことは NOT encouraged

**層 2: Format Enforcement**

```jinja
- The ID is composed of the type and a random string, such as 
  "source:randomstring", "note:randomstring", or "insight:randomstring".
- Always use the complete ID exactly as it is provided, including its type prefix.
```

- Prefix の手動変更を禁止 (`source:` → `note:` への変更など）
- exact format matching を強制

**層 3: 検証 (implementation 側)**

コード上での検証ロジックは見当たらない。つまり:
- Ask が返した final_answer の citation id を backend が **自動検証しない**
- 仮に LLM が `[note:nonexistent]` を返しても、frontend がそのまま表示する可能性

**評価**: Ask の捏造対策は **Prompt-level のみ** で、runtime 検証がない。

### 6.2 Chat / Source Chat における Hallucination 対策

**層 1: Limited Context Window**

```python
# Source Chat での context 制限
context_builder = ContextBuilder(
    source_id=source_id,
    include_insights=True,
    max_tokens=50000,  # ← 明示的な上限
)

# _format_source_context() で source.full_text を truncate
if len(full_text) > 5000:
    full_text = full_text[:5000] + "...\n[Content truncated]"
```

- Source Chat は single source に限定 → hallucination リスク低減
- Chat は context を明示的に選択 → over-retrieval が unlikely

**層 2: Prompt Instructions (同一)**

Chat / Source Chat も同じ citation instructions を使用:
```jinja
- Do not make up documents or document ids. Only use the ids you have access.
- Always use the complete ID exactly as it is provided, including its type prefix.
```

**層 3: Context Indicators で Available ID を追跡**

```python
context_indicators = {
    "sources": [available_source_ids],
    "insights": [available_insight_ids],
    "notes": [available_note_ids],
}
```

Backend が LLM 応答を検証する際に、`context_indicators` で reference を確認可能。
ただし、**自動検証ロジックは実装されていない**。

### 6.3 Litloft との比較

Litloft の `docs/CITATION-PIPELINE.md` は **5 層の検証機構** を記述:

1. **Per-file vector fetch**: DB scale 問題への対策
2. **Section range map (DP)**: 出典ファイルの chunk range を絞込
3. **Per-segment retrieval**: margin gate で confidence チェック
4. **Paragraph spread gate**: 段落が複数 chunk にまたがる場合のフィルタ
5. **Runtime validation**: LLM が返した file_id を retrieval 結果と照合、範囲外は drop

これに対し、Open Notebook は:
- 検索結果の id を LLM に "参考情報" として提供するが
- **LLM が返した citation id を runtime で検証しない**

### 6.4 捏造対策の強度評価

| 対策 | Open Notebook | Litloft |
|---|---|---|
| Prompt-level instruction | ✓ | ✓ |
| Explicit ID whitelist to LLM | ✓ | ✓ (retrieval results) |
| Context scope 限定 | △ (Chat/Source Chat only) | ✓ (all modes) |
| Runtime citation validation | ✗ | ✓ (margin gate + range check + drop) |
| Post-LLM id verification | ✗ | ✓ (against allowed_file_ids) |

**結論**: Open Notebook の捏造対策は **Prompt-level で軽め**。Litloft の方が厳密。

---

## 7. Streaming と Citation 付与

### 7.1 Ask の Streaming Response

(`api/routers/search.py:61-110`):

```python
async def stream_ask_response(
    question: str, strategy_model, answer_model, final_answer_model
) -> AsyncGenerator[str, None]:
    async for chunk in ask_graph.astream(
        input=dict(question=question),
        stream_mode="updates",
    ):
        if "agent" in chunk:
            # Strategy を stream
            strategy_data = {"type": "strategy", "reasoning": ..., "searches": [...]}
            yield f"data: {json.dumps(strategy_data)}\n\n"

        elif "provide_answer" in chunk:
            # 各 search の答えを stream
            for answer in chunk["provide_answer"]["answers"]:
                answer_data = {"type": "answer", "content": answer}
                yield f"data: {json.dumps(answer_data)}\n\n"

        elif "write_final_answer" in chunk:
            # 最終答えを stream
            final_data = {"type": "final_answer", "content": final_answer}
            yield f"data: {json.dumps(final_data)}\n\n"

    # Completion signal
    completion_data = {"type": "complete", "final_answer": final_answer}
    yield f"data: {json.dumps(completion_data)}\n\n"
```

**特徴**:
- **段階的に stream**: strategy → intermediate answers → final answer
- **Citation は final answer に embedded**: 中間答えも citation を含む可能性があるが、explicitly separate されない
- **Client-side 組み立て**: frontend が各 event type を受け取って画面に反映

### 7.2 Chat / Source Chat は Non-streaming

```python
# chat.py:73
ai_message = model.invoke(payload)
# sync call のみ
```

- LanggraphのSqliteSaver で state が保存されると同時に response が返される
- citation id は message content に embedded のまま

### 7.3 Citation の Streaming 時タイミング

**Ask**:
- Final answer が stream される時点で citation id は既に LLM が生成済み
- Frontend は final_answer text 全体を受け取って、その中の `[id]` を parse できる

**推奨パターン** (Litloft との対比):
- Streaming 中に citation metadata を **別途** emit する方式もあるが、Open Notebook は採用していない
- (つまり `{"type": "citation", "id": "...", "text": "..."}` というイベントがない)

---

## 8. UI 表示パターン

### 8.1 Frontend 型定義 (`frontend/src/lib/types/api.ts`)

```typescript
interface NotebookChatMessage {
  // inferred from chat.py response
  role: 'user' | 'assistant'
  content: string  // Raw text with [id] embedded
}

interface SourceChatSession {
  source_id: string
  // Messages similar to chat
}
```

### 8.2 Citation Rendering (概推)

Frontend に明示的な citation component が見当たらないため、推測される実装:

```javascript
// Pseudo-code
function renderMessage(message: string) {
  // [source:xyz] や [note:abc] を parse
  const citations = message.match(/\[([^\]]+)\]/g)
  
  // Regex で置換、click handler 付与
  return message.replace(/\[([^\]]+)\]/g, (match, id) => {
    return `<a class="citation" href="#" onclick="goToSource('${id}')">${id}</a>`
  })
}
```

### 8.3 Source Navigation

Citation id をクリックすると:
1. Source ページへ navigate
2. Notebook view でその source を highlight
3. (推測) 該当チャンクをスクロールして表示

---

## 9. Litloft との比較

### 9.1 現状の Litloft Ask との差分

| 項目 | Open Notebook | Litloft |
|---|---|---|
| **Retrieval** | vector search (SurrealDB) | hybrid search (FTS + vector) |
| **Scope** | 全 notebook sources | 特定 file のみ |
| **Search reuse** | dedicated `vector_search()` | reused `search()` from search.py |
| **Context assembly** | LLM に results 全体 | segment-based excerpts + window |
| **Citation format** | `[type:id]` | `file_id` + `quote` + `relevance` score |
| **Citation validation** | prompt-level only | 5-stage pipeline (margin gate, range check, drop) |
| **Streaming** | SSE events (answer + final) | JSON response (sync) |
| **State** | SqliteSaver (LanggraphDB) | stateless, no worker |

### 9.2 既存 docs/CITATION-PIPELINE.md との整合性

Litloft の citation pipeline は **segment-driven** (`detailed_summary_citations`):

```python
# Litloft のロジック (参考)
segment_text = "塩を揉み込んで 15 分..."
ancestor_headings = ("詳細内容", "2. 塩もみキャベツ")
# 逆方向: segment → chunk(s) を retrieval
```

一方、Open Notebook は **LLM-driven**:

```python
# Open Notebook のロジック
results = vector_search(term)  # chunk-focused
# 順方向: search → LLM が自分で引用を構成
```

**整合性**: 両者は architecture が異なるため、直接の互換性なし。ただし、Open Notebook の citation id whitelist 概念は Litloft の `allowed_file_ids` と conceptually 同じ。

### 9.3 Source Chat 相当（ファイル詳細ページで AI に質問）の導入可否

**ファイル詳細ページ相当**: Litloft にはなく、Open Notebook の Source Chat がこれに相当。

**導入シナリオ** (Litloft):
1. ユーザーが `/file/{file_id}` ページを表示
2. "このファイルについて質問する" ボタン → Source Chat equivalent を起動
3. Source Chat flow を実行:
   - file_id → file text を fetch
   - insights を生成 / 取得
   - ユーザーの質問に答える (single file scope)
   - Citation は `[file_id]` に限定

**実装上の考慮**:
- Litloft は file-centric (file_id ベース)
- Open Notebook は source-centric (source object)
- 概念は compatible だが、API / DB schema の差異により直接ポート不可
- Litloft の segment model (file × time range / text range) への mapping が必要

---

## 10. 具体的な改善提案（優先度付き）

### P0: Citation Runtime Validation 導入

**問題**: Ask が LLM の捏造 id を自動検証しない。

**提案**:
```python
# ask.py の write_final_answer ノードで
allowed_ids = set()
for answer in state["answers"]:
    # answer に含まれた id を抽出
    ids_in_answer = extract_ids_from_answer(answer)
    allowed_ids.update(ids_in_answer)

# final_answer から id を抽出して検証
final_answer_text = state["final_answer"]
final_ids = extract_ids_from_answer(final_answer_text)
invalid_ids = final_ids - allowed_ids

if invalid_ids:
    # DROP or WARN
    log.warning(f"Invalid citations: {invalid_ids}")
```

**実装**: ~100 lines, regex-based id extraction

### P1: Citation Metadata の Structured 出力

**問題**: Citation がテキストに embedded された `[id]` 形式のみ。Frontend が parse を強制される。

**提案**:
```python
@dataclass
class CitedAnswer:
    answer_text: str
    citations: list[Citation]  # [{id: "...", quote: "...", relevance: 0.X}]

# Final answer response を extend
{"type": "final_answer", "content": answer_text, "citations": [...]}
```

**実装**: AskResponse model extend + prompt 修正 (JSON with citations structure)

### P2: Streaming 中の Citation Metadata Emit

**問題**: Final answer が streaming される時、citation metadata が同時に送信されない。

**提案**:
```python
# stream_ask_response で
async for chunk in ask_graph.astream(...):
    ...
    elif "write_final_answer" in chunk:
        final_answer = chunk["write_final_answer"]["final_answer"]
        # Extract citations
        citations = extract_citations(final_answer)
        # Emit metadata separately
        yield f"data: {json.dumps({'type': 'citations', 'citations': citations})}\n\n"
        yield f"data: {json.dumps({'type': 'final_answer', 'content': final_answer})}\n\n"
```

**実装**: ~50 lines

### P3: Chat における Citation Validation

**問題**: Chat / Source Chat も prompt-level のみ。

**提案**:
```python
# chat.py で message を保存する前に
context_ids = extract_ids_from_context(state["context"])
response_ids = extract_ids_from_response(ai_message.content)
invalid_ids = response_ids - context_ids

# Invalid id を sanitize (削除 or 警告)
```

**実装**: ~80 lines

### P4: Source Insight Cache for Performance

**問題**: Source Chat で毎回 insights を取得。

**提案**:
```python
# source.py で
async def get_insights_cached(source_id, ttl=3600):
    cache_key = f"insights:{source_id}"
    if cached := await cache.get(cache_key):
        return cached
    insights = await repo_query(...)
    await cache.set(cache_key, insights, ttl)
    return insights
```

**実装**: Redis 導入 or in-memory cache with TTL

---

## 11. 関連ファイル索引

### Core Implementation

- `/tmp/research/open-notebook/open_notebook/graphs/ask.py` (105 lines)
  - Ask フロー: strategy → search parallelization → final synthesis
  - `provide_answer` で vector_search 実行, ids list 生成
  
- `/tmp/research/open-notebook/open_notebook/graphs/chat.py` (99 lines)
  - Chat フロー: state + messages → LLM call
  - SqliteSaver で履歴保持
  
- `/tmp/research/open-notebook/open_notebook/graphs/source_chat.py` (256 lines)
  - Source Chat フロー: ContextBuilder → format → LLM
  - context_indicators で available id を追跡

- `/tmp/research/open-notebook/open_notebook/domain/notebook.py` (680 lines)
  - `vector_search()`: embedding → fn::vector_search() call
  - `text_search()`: keyword → fn::text_search() call
  - SourceEmbedding / SourceInsight / Source / Note / ChatSession models

### Prompts

- `/tmp/research/open-notebook/prompts/ask/entry.jinja`
  - Strategy generation (JSON with reasoning + searches)
  
- `/tmp/research/open-notebook/prompts/ask/query_process.jinja`
  - Query processing with ids whitelist
  - "Do not make up documents" instructions
  
- `/tmp/research/open-notebook/prompts/ask/final_answer.jinja`
  - Final synthesis with citation reuse
  
- `/tmp/research/open-notebook/prompts/chat/system.jinja`
  - Manual context citation instructions
  
- `/tmp/research/open-notebook/prompts/source_chat/system.jinja`
  - Single-source citation format

### API

- `/tmp/research/open-notebook/api/routers/search.py` (218 lines)
  - `POST /search/ask`: streaming response
  - `POST /search/ask/simple`: non-streaming
  - `stream_ask_response()` with SSE events
  
- `/tmp/research/open-notebook/api/routers/chat.py` (19.6 KB)
  - Session management, context building, execution
  
- `/tmp/research/open-notebook/api/routers/source_chat.py` (20.7 KB)
  - Source Chat session API

### Utilities

- `/tmp/research/open-notebook/open_notebook/utils/context_builder.py` (300+ lines)
  - Flexible ContextBuilder for source / notebook / notes
  - `_add_source_context()` with insights inclusion
  - Token counting and prioritization

### Frontend

- `/tmp/research/open-notebook/frontend/src/lib/api/chat.ts` (72 lines)
  - Chat API client (message send, context build)
  
- `/tmp/research/open-notebook/frontend/src/lib/api/source-chat.ts`
  - Source Chat API client

### Documentation

- `/tmp/research/open-notebook/docs/2-CORE-CONCEPTS/ai-context-rag.md`
  - RAG conceptual overview
  
- `/tmp/research/open-notebook/docs/2-CORE-CONCEPTS/chat-vs-transformations.md`
  - Mode selection guide

---

## 12. まとめと推奨事項

### Open Notebook Citation 機構の特徴

1. **3 モード分離**: Ask (automatic) / Chat (manual) / Source Chat (scoped) で異なる戦略
2. **Prompt-driven validation**: citation id の制約を prompt 指示に依存
3. **Streaming architecture**: SSE で段階的に strategy → answers → final answer を emit
4. **Embedded citations**: `[type:id]` format で text に inline
5. **Context scope control**: Chat で full content / summary / excluded を選択可能

### Litloft との設計比較

| 観点 | Open Notebook | Litloft | 評価 |
|---|---|---|---|
| Citation 強度 | Prompt-level | 5-stage validation | HV が厳密 |
| Streaming support | ✓ (SSE) | ✗ | ON が有利 |
| Segment-driven | ✗ | ✓ | 用途次第 |
| Source scoping | ✓ (Source Chat) | ✗ | ON が有利 |
| Stateless | ✗ (SqliteSaver) | ✓ | HV が軽量 |

### 導入時の推奨優先度

1. **Citation validation layer** (P0) → hallucination risk 軽減
2. **Structured citation metadata** (P1) → frontend UX 改善
3. **Streaming citations** (P2) → real-time feedback
4. **Chat validation** (P3) → 全モード統一
5. **Caching** (P4) → performance optimization

### Source Chat の Litloft への応用

- File detail page で AI chat 機能を追加可能
- File × segment model への mapping が必須
- Citation scope を file_id に限定することで hallucination risk を削減

<!-- investigation-complete -->
